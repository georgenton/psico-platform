import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import type {
  BookAuthorDetail,
  BookAuthorSummary,
  BookCategoriesResponse,
  BookCategory,
  BookDetailResponse,
  BookListItem,
  BookListResponse,
  BookRating,
  BookRatingBreakdown,
  BookRecosResponse,
  BookReviewSummary,
  BookReviewsResponse,
  BookToggleResponse,
  ChapterListItem,
  CoverToken,
  CreateBookReviewResponse,
  Pagination,
  StartBookResponse,
  UserTier,
} from "@psico/types";
import type { CreateBookDto } from "./dto/create-book.dto";
import type { UpdateBookDto } from "./dto/update-book.dto";
import type { ListBooksQueryDto } from "./dto/list-books-query.dto";
import type { ListReviewsQueryDto } from "./dto/list-reviews-query.dto";
import type { CreateBookReviewDto } from "./dto/create-review.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config";
import { resolveStoredCoverUrl } from "../shared/content-asset";
import {
  loadEffectiveChapters,
  progressForEffectiveChapters,
  resolveEffectiveChapters,
  sessionsForEffectiveChapters,
  type EffectiveChapter,
  type LegacyChapterRow,
} from "./effective-chapters";
import {
  readerBookIds,
  sessionsForBookCards,
  type BookSession,
} from "./library-membership";

// ─── Plan → tier mapping ─────────────────────────────────────────────────────
//
// Backend stores Plan enum (FREE/PRO/ANNUAL/B2B) on Book.plan because billing
// already uses it. Design talks in "tier" (free|pro). We translate at the
// boundary — never let Plan leak to the public response.
const PLAN_TO_TIER: Record<string, UserTier> = {
  FREE: "free",
  PRO: "pro",
  ANNUAL: "pro",
  B2B: "pro",
};
const PLAN_RANK: Record<string, number> = {
  FREE: 0,
  PRO: 1,
  ANNUAL: 2,
  B2B: 3,
};

const DEFAULT_PER_PAGE = 24;
const DEFAULT_RECO_LIMIT = 4;
const DEFAULT_REVIEW_PER_PAGE = 10;
const DETAIL_REVIEWS_PREVIEW = 5;

@Injectable()
export class BooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * A stored cover, turned into something a client can fetch.
   *
   * Covers live in the same private bucket as chapter illustrations, so the
   * stored value is an identity rather than a loadable URL. Null when it is not
   * ours to serve — every consumer already falls back to the gradient token, so
   * a missing cover degrades instead of breaking.
   */
  private coverUrl(stored: string | null): string | null {
    if (!stored) return null;
    const base = this.config.get("R2_PUBLIC_URL", { infer: true }) as
      | string
      | undefined;
    return resolveStoredCoverUrl(stored, base);
  }

  // ─── List + filters ────────────────────────────────────────────────────────

  /**
   * GET /books — paginated list with filters, sort, and search.
   *
   * The flag `userId` lets the service compute `userProgress`, `isFavorite`,
   * and `isBookmarked` for authenticated requests. For unauth (catalog
   * preview from marketing pages) it returns those fields as null/false.
   */
  async list(
    userId: string | null,
    query: ListBooksQueryDto,
  ): Promise<BookListResponse> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? DEFAULT_PER_PAGE;
    const skip = (page - 1) * perPage;

    const view = query.view ?? "catalogo";

    // For favoritos/guardados the natural order is "when did the user mark it",
    // newest first. Prisma can't order by the pivot's createdAt while filtering
    // books by it, so we run a two-step query: pivot first (ordered + paged) →
    // books second (preserving the pivot order in memory).
    if ((view === "favoritos" || view === "guardados") && userId) {
      return this.listFromUserPivot(userId, view, query, page, perPage, skip);
    }

    // "Mis libros" needs the set of books the reader has opened, which cannot
    // be expressed as a nested filter — a native chapter reaches its book
    // through a slug match, not a foreign key. Resolved once, here.
    const readerBooks =
      view === "mis" && userId
        ? await readerBookIds(this.prisma, userId)
        : null;
    const where = this.buildListWhere(userId, query, view, readerBooks);
    const orderBy = this.buildOrderBy(query.sort);

    const [rows, total, categories, authors] = await Promise.all([
      this.prisma.book.findMany({
        where,
        orderBy,
        skip,
        take: perPage,
        include: this.bookCardInclude(userId),
      }),
      this.prisma.book.count({ where }),
      this.fetchCategories(),
      this.fetchAuthors(),
    ]);

    // Only for the books on this page, and only when somebody is signed in.
    const sessions = userId
      ? await sessionsForBookCards(this.prisma, { userId, books: rows })
      : new Map<string, BookSession>();

    return {
      books: rows.map((row) =>
        this.toListItem(row, userId, sessions.get(row.id)),
      ),
      pagination: { page, perPage, total } satisfies Pagination,
      categories,
      authors,
    };
  }

  /**
   * Two-step query for user-pivot views (favoritos, guardados):
   *
   * 1. Fetch pivot rows (BookFavorite / BookBookmark) ordered by createdAt desc,
   *    paged via skip/take. The pivot is the source of truth for ordering.
   * 2. Fetch the matching books with the same filters (q/categoryId/authorId).
   *    A book may be filtered out (e.g. unpublished, category mismatch), so
   *    the visible page can be < perPage even when there are more pivot rows.
   * 3. Re-order books in memory to mirror the pivot order.
   *
   * Trade-off accepted: `total` reflects pivot count, not filtered book count.
   * For v1 this is fine — favoritos/guardados counts are small (tens, not
   * thousands), and the UX prioritizes "what did I mark recently?" over
   * "give me a precise filtered total".
   */
  private async listFromUserPivot(
    userId: string,
    view: "favoritos" | "guardados",
    query: ListBooksQueryDto,
    page: number,
    perPage: number,
    skip: number,
  ): Promise<BookListResponse> {
    // Branch the queries instead of unioning the Prisma delegates — the union
    // of overload signatures is not callable in TS.
    const pivotPromise: Promise<{ bookId: string }[]> =
      view === "favoritos"
        ? this.prisma.bookFavorite.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            skip,
            take: perPage,
            select: { bookId: true },
          })
        : this.prisma.bookBookmark.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            skip,
            take: perPage,
            select: { bookId: true },
          });
    const countPromise: Promise<number> =
      view === "favoritos"
        ? this.prisma.bookFavorite.count({ where: { userId } })
        : this.prisma.bookBookmark.count({ where: { userId } });

    const [pivotRows, total, categories, authors] = await Promise.all([
      pivotPromise,
      countPromise,
      this.fetchCategories(),
      this.fetchAuthors(),
    ]);

    const orderedBookIds = pivotRows.map((r) => r.bookId);
    if (orderedBookIds.length === 0) {
      return {
        books: [],
        pagination: { page, perPage, total } satisfies Pagination,
        categories,
        authors,
      };
    }

    // Apply the user's filters (q, categoryId, authorId) on top of the pivot's
    // bookId set. Use AND clauses so a book that fails any filter is dropped.
    const bookWhere: Record<string, unknown> = {
      id: { in: orderedBookIds },
      isPublished: true,
    };
    if (query.categoryId) bookWhere.categoryId = query.categoryId;
    if (query.authorId) bookWhere.authorId = query.authorId;
    if (query.q) {
      bookWhere.OR = [
        { title: { contains: query.q, mode: "insensitive" } },
        { subtitle: { contains: query.q, mode: "insensitive" } },
        { description: { contains: query.q, mode: "insensitive" } },
      ];
    }

    const books = await this.prisma.book.findMany({
      where: bookWhere,
      include: this.bookCardInclude(userId),
    });
    type BookRow = (typeof books)[number];

    // Re-order to match the pivot ordering. Filtered-out books are simply
    // absent — we don't pad or shift.
    const byId = new Map<string, BookRow>(books.map((b) => [b.id, b]));
    const ordered: BookRow[] = orderedBookIds
      .map((id) => byId.get(id))
      .filter((b): b is BookRow => b !== undefined);

    // Favourites and saved books can perfectly well have been started.
    const sessions = await sessionsForBookCards(this.prisma, {
      userId,
      books: ordered,
    });

    return {
      books: ordered.map((row) =>
        this.toListItem(row, userId, sessions.get(row.id)),
      ),
      pagination: { page, perPage, total } satisfies Pagination,
      categories,
      authors,
    };
  }

  /** GET /books/recos — personalized recommendations, max 4. */
  async getRecos(userId: string | null): Promise<BookRecosResponse> {
    // Lightweight algorithm: most recent published, excluding what the user
    // is currently reading. The personalized engine arrives with PatternsModule
    // in Sprint S11; for now this satisfies the UI contract.
    // "What the reader is already reading" — the same question "Mis libros"
    // asks, so the same answer. It used to come from `UserProgress` alone,
    // which only worked while Start wrote one; a started book would otherwise
    // have started being recommended back to the person reading it.
    const exclude = userId ? await readerBookIds(this.prisma, userId) : [];

    const rows = await this.prisma.book.findMany({
      where: { isPublished: true, id: { notIn: exclude } },
      orderBy: { publishedAt: { sort: "desc", nulls: "last" } },
      take: DEFAULT_RECO_LIMIT,
      include: this.bookCardInclude(userId),
    });

    // No session hydration here on purpose: `exclude` is exactly the set of
    // books the reader has opened or finished, and these rows are filtered by
    // `notIn: exclude`. Every card here is by construction not-started, so the
    // lookup could only ever come back empty.
    return { recos: rows.map((row) => this.toListItem(row, userId)) };
  }

  /** GET /books/categories — public catalog. */
  async getCategories(): Promise<BookCategoriesResponse> {
    return { categories: await this.fetchCategories() };
  }

  /** GET /books/authors — public catalog. */
  async getAuthors(): Promise<{ authors: BookAuthorSummary[] }> {
    return { authors: await this.fetchAuthors() };
  }

  // ─── Detail ────────────────────────────────────────────────────────────────

  /** GET /books/:id — full detail with chapters, rating, recent reviews. */
  async getDetail(
    userId: string | null,
    idOrSlug: string,
  ): Promise<BookDetailResponse> {
    const book = await this.findByIdOrSlug(idOrSlug, userId);
    if (!book) throw new NotFoundException(`Book '${idOrSlug}' not found`);

    const [ratingRows, reviewRows, hasAudio, hasExercise] = await Promise.all([
      this.prisma.bookReview.groupBy({
        by: ["rating"],
        where: { bookId: book.id },
        _count: { rating: true },
      }),
      this.prisma.bookReview.findMany({
        where: { bookId: book.id },
        orderBy: { createdAt: "desc" },
        take: DETAIL_REVIEWS_PREVIEW,
        include: { user: { select: this.userPreviewSelect() } },
      }),
      this.prisma.audio.findFirst({
        where: { chapter: { bookId: book.id } },
        select: { id: true },
      }),
      this.prisma.exercise.findFirst({
        where: { chapter: { bookId: book.id } },
        select: { id: true },
      }),
    ]);

    const rating = this.aggregateRating(ratingRows);
    // The Prisma row carries a discriminated chapter type (with-progress vs
    // without-progress). Both shapes are accepted by our helpers — we
    // localize the cast here rather than thread generics through.
    // The Prisma row carries a discriminated chapter shape (with-progress vs
    // without). The effective-structure helper needs only the published legacy
    // rows, so the cast is localized to that.
    const looseBook = book as unknown as {
      chapters?: LegacyChapterRow[];
    };
    // The chapter list is the book's EFFECTIVE readable structure, not its
    // legacy rows: a chapter authored in Content Studio has no `Chapter` row and
    // was invisible here. Legacy-first, exactly like the reader.
    const effective = await resolveEffectiveChapters(this.prisma, {
      bookId: book.id,
      bookSlug: book.slug,
      legacyChapters: looseBook.chapters ?? [],
    });
    // Two tables, two questions. `UserProgress` answers "finished this?" —
    // its `completedAt` is non-null, so a row there is a completion and
    // nothing else. `ReadingSession` answers "opened this?", which is what
    // starting a book and reading a page both write.
    const [progressById, startedIds] = userId
      ? await Promise.all([
          progressForEffectiveChapters(this.prisma, {
            userId,
            chapters: effective,
          }),
          sessionsForEffectiveChapters(this.prisma, {
            userId,
            chapters: effective,
          }),
        ])
      : [new Map<string, { completedAt: Date | null }>(), new Set<string>()];

    const chaptersList = this.buildChaptersList(
      book.plan,
      effective,
      progressById,
      startedIds,
      userId,
    );
    const userProgress = this.computeUserProgressSummary(chaptersList, userId);

    return {
      book: {
        id: book.id,
        slug: book.slug,
        title: book.title,
        subtitle: book.subtitle,
        cover: this.toCoverToken(book.cover),
        coverArtUrl: this.coverUrl(book.coverArtUrl),
        summary: book.summary,
        description: book.description,
        // The effective list, not `Book.totalChapters` — that column counts
        // legacy rows and goes stale the moment a native chapter is published.
        chapters: effective.length,
        pages: book.pages,
        durationMinutes: book.durationMinutes,
        categoryId: book.categoryId,
        categoryLabel: book.category?.label ?? null,
        tierRequired: PLAN_TO_TIER[book.plan] ?? "free",
        publishedOn: book.publishedAt,
        language: book.language,
        audioAvailable: hasAudio !== null,
        exercisesAvailable: hasExercise !== null,
      },
      author: book.author ? this.toAuthorDetail(book.author) : null,
      chaptersList,
      rating,
      reviews: reviewRows.map((r) => this.toReviewSummary(r)),
      userProgress,
      isFavorite: this.computeIsFavorite(book, userId),
      isBookmarked: this.computeIsBookmarked(book, userId),
    };
  }

  // ─── Reviews ───────────────────────────────────────────────────────────────

  async listReviews(
    bookIdOrSlug: string,
    query: ListReviewsQueryDto,
  ): Promise<BookReviewsResponse> {
    const book = await this.resolveBookIdOrThrow(bookIdOrSlug);

    const page = query.page ?? 1;
    const perPage = query.perPage ?? DEFAULT_REVIEW_PER_PAGE;
    const skip = (page - 1) * perPage;

    const [rows, total] = await Promise.all([
      this.prisma.bookReview.findMany({
        where: { bookId: book.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: perPage,
        include: { user: { select: this.userPreviewSelect() } },
      }),
      this.prisma.bookReview.count({ where: { bookId: book.id } }),
    ]);

    return {
      reviews: rows.map((r) => this.toReviewSummary(r)),
      pagination: { page, perPage, total },
    };
  }

  async createReview(
    userId: string,
    bookIdOrSlug: string,
    dto: CreateBookReviewDto,
  ): Promise<CreateBookReviewResponse> {
    const book = await this.resolveBookIdOrThrow(bookIdOrSlug);

    // Guard 1: must have completed every chapter the book actually offers.
    //
    // Counting `Chapter` rows made a native book unreviewable — it has none,
    // so the count was zero and every reader was told the book had nothing
    // published. And on a mixed book the two counts described different sets:
    // the requirement came from legacy rows while native completions could
    // never satisfy it.
    //
    // The effective structure is the same one Book Detail lists and the reader
    // serves, so "finish the book" means exactly the chapters somebody could
    // have read. One effective chapter is one requirement — a position claimed
    // by both structures resolves to a single row, so a backfilled unit behind
    // a legacy chapter is never demanded twice.
    const effective = await loadEffectiveChapters(this.prisma, book);
    if (effective.length === 0) {
      throw new BadRequestException(
        "Cannot review a book with no published chapters",
      );
    }
    // Completion by each chapter's OWN identity — `chapterId` for legacy,
    // `contentUnitId` for native. Read-only: eligibility never writes.
    const completed = await progressForEffectiveChapters(this.prisma, {
      userId,
      chapters: effective,
    });
    // Every chapter, not a count comparison: counts can match while naming
    // different chapters, and a `ReadingSession` must never stand in for a
    // completion.
    const finishedAll = effective.every((ch) => completed.has(ch.readerRef.id));
    if (!finishedAll) {
      throw new ForbiddenException(
        "REVIEW_REQUIRES_COMPLETION: finish the book before posting a review",
      );
    }

    // Guard 2: one review per user per book. We use upsert to make the
    // endpoint idempotent — editing your review is the same call as creating it.
    const review = await this.prisma.bookReview.upsert({
      where: { userId_bookId: { userId, bookId: book.id } },
      create: {
        userId,
        bookId: book.id,
        rating: dto.rating,
        text: dto.text,
      },
      update: { rating: dto.rating, text: dto.text },
      include: { user: { select: this.userPreviewSelect() } },
    });

    return { ok: true, review: this.toReviewSummary(review) };
  }

  // ─── Toggles + lifecycle ───────────────────────────────────────────────────

  async toggleFavorite(
    userId: string,
    bookIdOrSlug: string,
  ): Promise<BookToggleResponse> {
    const book = await this.resolveBookIdOrThrow(bookIdOrSlug);

    const existing = await this.prisma.bookFavorite.findUnique({
      where: { userId_bookId: { userId, bookId: book.id } },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.bookFavorite.delete({ where: { id: existing.id } });
      return { active: false };
    }
    await this.prisma.bookFavorite.create({
      data: { userId, bookId: book.id },
    });
    return { active: true };
  }

  async toggleBookmark(
    userId: string,
    bookIdOrSlug: string,
  ): Promise<BookToggleResponse> {
    const book = await this.resolveBookIdOrThrow(bookIdOrSlug);

    const existing = await this.prisma.bookBookmark.findUnique({
      where: { userId_bookId: { userId, bookId: book.id } },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.bookBookmark.delete({ where: { id: existing.id } });
      return { active: false };
    }
    await this.prisma.bookBookmark.create({
      data: { userId, bookId: book.id },
    });
    return { active: true };
  }

  /**
   * POST /books/:id/start — marks the book as "started" for the user.
   *
   * There is no Book-level "started" record: starting a book means opening a
   * `ReadingSession` on its first chapter, which is the same row the reader
   * writes as somebody scrolls. The frontend reads `userProgress` from the
   * detail aggregate and decides "Continuar leyendo" placement.
   *
   * It used to write `UserProgress` instead, and the docstring here said "still
   * not completed" — but that table's `completedAt` is non-null with a default,
   * so the row always meant finished. Opening a book claimed a completion.
   */
  async startBook(
    userId: string,
    bookIdOrSlug: string,
  ): Promise<StartBookResponse> {
    const book = await this.resolveBookIdOrThrow(bookIdOrSlug);

    // The book's first chapter as a READER meets it, which is not the same as
    // the first `Chapter` row: a book authored in Content Studio has none, and
    // a mixed book may open on a native chapter.
    const effective = await loadEffectiveChapters(this.prisma, book);
    const first = effective[0];
    if (!first) {
      throw new BadRequestException("Book has no published chapters yet");
    }

    // Starting is a `ReadingSession`, not a `UserProgress`.
    //
    // `UserProgress.completedAt` is non-null with a default, so a row there
    // says "finished" — writing one on Start told every surface the reader had
    // completed a chapter they had not opened. `ReadingSession` is the table
    // the reader itself writes as somebody scrolls, and it is what "started"
    // has always meant.
    //
    // `update: {}` deliberately: calling Start again must not reset progress,
    // time spent, or where the reader had got to.
    if (first.readerRef.kind === "chapter") {
      await this.prisma.readingSession.upsert({
        where: {
          userId_chapterId: { userId, chapterId: first.readerRef.id },
        },
        create: { userId, chapterId: first.readerRef.id },
        update: {},
      });
    } else {
      await this.prisma.readingSession.upsert({
        where: {
          userId_contentUnitId: {
            userId,
            contentUnitId: first.readerRef.id,
          },
        },
        create: { userId, contentUnitId: first.readerRef.id },
        update: {},
      });
    }

    const detail = await this.getDetail(userId, bookIdOrSlug);
    if (!detail.userProgress) {
      throw new BadRequestException("Failed to register book start");
    }
    return { ok: true, userProgress: detail.userProgress };
  }

  // ─── Admin CMS (kept for /books admin endpoints) ──────────────────────────

  async create(dto: CreateBookDto) {
    const exists = await this.prisma.book.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException(`Slug '${dto.slug}' is already taken`);
    }
    return this.prisma.book.create({
      data: {
        slug: dto.slug,
        title: dto.title,
        description: dto.description ?? null,
        coverUrl: dto.coverUrl ?? null,
        plan: dto.plan,
      },
    });
  }

  async update(slug: string, dto: UpdateBookDto) {
    const exists = await this.prisma.book.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Book '${slug}' not found`);
    return this.prisma.book.update({ where: { slug }, data: dto });
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Shared `include` for any query that returns BookListItem. Centralizing
   * here keeps the SQL identical between list / recos / detail wrapper.
   */
  private bookCardInclude(userId: string | null) {
    return {
      author: true,
      category: true,
      reviews: { select: { rating: true } },
      favorites: userId
        ? ({
            where: { userId },
            select: { id: true, createdAt: true },
          } as const)
        : (false as const),
      bookmarks: userId
        ? ({
            where: { userId },
            select: { id: true, createdAt: true },
          } as const)
        : (false as const),
      chapters: userId
        ? {
            where: { isPublished: true },
            orderBy: { order: "asc" as const },
            select: {
              id: true,
              order: true,
              title: true,
              durationMinutes: true,
              partNumber: true,
              partTitle: true,
              progress: { where: { userId }, select: { completedAt: true } },
            },
          }
        : {
            where: { isPublished: true },
            orderBy: { order: "asc" as const },
            select: {
              id: true,
              order: true,
              title: true,
              durationMinutes: true,
              partNumber: true,
              partTitle: true,
            },
          },
    };
  }

  private buildListWhere(
    userId: string | null,
    query: ListBooksQueryDto,
    view: "catalogo" | "mis" | "recos" | "favoritos" | "guardados",
    readerBooks?: string[] | null,
  ) {
    const base: Record<string, unknown> = { isPublished: true };
    if (query.categoryId) base.categoryId = query.categoryId;
    if (query.authorId) base.authorId = query.authorId;
    if (query.q) {
      base.OR = [
        { title: { contains: query.q, mode: "insensitive" } },
        { subtitle: { contains: query.q, mode: "insensitive" } },
        { description: { contains: query.q, mode: "insensitive" } },
      ];
    }
    if (view === "mis" && userId) {
      // Was `chapters.some.progress.some` — legacy completions only, which
      // worked solely because Start used to write one. It now covers sessions
      // and native chapters as well, resolved by `readerBookIds`.
      base.id = { in: readerBooks ?? [] };
    }
    if (view === "favoritos" && userId) {
      base.favorites = { some: { userId } };
    }
    if (view === "guardados" && userId) {
      base.bookmarks = { some: { userId } };
    }
    return base;
  }

  private buildOrderBy(sort?: string) {
    switch (sort) {
      case "alpha":
        return { title: "asc" as const };
      case "marina":
        return { author: { name: "asc" as const } };
      case "recent":
      default:
        return {
          publishedAt: { sort: "desc" as const, nulls: "last" as const },
        };
    }
  }

  // The mapper consumes a small contract of fields from the Prisma row.
  // Typing it loosely keeps the file readable while still enforcing shape
  // on the inputs we care about.
  private toListItem(
    row: Record<string, unknown> & {
      id: string;
      slug: string;
      title: string;
      subtitle: string | null;
      cover: string;
      coverArtUrl: string | null;
      pages: number | null;
      durationMinutes: number;
      totalChapters: number;
      plan: string;
      publishedAt: Date | null;
      authorId: string | null;
      categoryId: string | null;
    },
    userId: string | null,
    session?: BookSession,
  ): BookListItem {
    const author = row.author as
      | { id: string; name: string }
      | null
      | undefined;
    const category = row.category as { slug: string } | null | undefined;
    const reviews = (row.reviews as { rating: number }[] | undefined) ?? [];
    const reviewCount = reviews.length;
    const rating =
      reviewCount > 0
        ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviewCount
        : 0;
    const favorites =
      (row.favorites as { id: string; createdAt: Date }[] | undefined) ?? [];
    const bookmarks =
      (row.bookmarks as { id: string; createdAt: Date }[] | undefined) ?? [];
    const chapters =
      (row.chapters as
        | {
            order: number;
            durationMinutes: number | null;
            progress?: { completedAt: Date | null }[];
          }[]
        | undefined) ?? [];

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle,
      authorId: row.authorId,
      authorName: author?.name ?? null,
      cover: this.toCoverToken(row.cover),
      coverArtUrl: this.coverUrl(row.coverArtUrl),
      categoryId: row.categoryId,
      categorySlug: category?.slug ?? null,
      chapters: row.totalChapters,
      pages: row.pages,
      durationMinutes: row.durationMinutes,
      publishedOn: row.publishedAt,
      rating: Math.round(rating * 10) / 10,
      reviewCount,
      tierRequired: PLAN_TO_TIER[row.plan] ?? "free",
      isFavorite: userId ? favorites.length > 0 : false,
      isBookmarked: userId ? bookmarks.length > 0 : false,
      favoritedAt:
        userId && favorites.length > 0 ? favorites[0].createdAt : null,
      bookmarkedAt:
        userId && bookmarks.length > 0 ? bookmarks[0].createdAt : null,
      userProgress: userId ? this.cardProgress(chapters, session) : null,
    };
  }

  /**
   * What a card should say about the reader's relationship to this book.
   *
   * Completions decide it when there are any — that summary carries real
   * percentages and a completion date, and replacing it with a 0% "started"
   * would walk somebody's progress backwards.
   *
   * Otherwise a `ReadingSession` means the book is open but nothing is
   * finished yet. That case has to be representable: 0% is still started, and
   * returning null instead is what made a freshly started book appear in
   * "Mis libros" while its own card offered to start it.
   *
   * `startedAt` comes from the session itself, never `new Date()` — a card
   * that claims every book was started just now is not telling the truth.
   */
  private cardProgress(
    chapters: { progress?: { completedAt: Date | null }[] }[],
    session?: BookSession,
  ) {
    const fromCompletions = this.computeProgressFromChapters(chapters);
    if (fromCompletions) return fromCompletions;
    if (!session) return null;
    return {
      startedAt: session.startedAt,
      lastChapterRead: session.touchedChapters,
      progressPct: 0,
      completedAt: null,
    };
  }

  private computeProgressFromChapters(
    chapters: { progress?: { completedAt: Date | null }[] }[],
  ) {
    const touched = chapters.filter((c) => (c.progress ?? []).length > 0);
    if (touched.length === 0) return null;
    const completed = touched.filter(
      (c) => c.progress![0].completedAt !== null,
    );
    const total = chapters.length;
    const progressPct =
      total > 0 ? Math.round((completed.length / total) * 100) : 0;
    return {
      startedAt: touched[0].progress![0].completedAt ?? new Date(),
      lastChapterRead: touched.length,
      progressPct,
      completedAt: completed.length === total && total > 0 ? new Date() : null,
    };
  }

  private toCoverToken(value: string): CoverToken {
    return value === "warm" || value === "mixed" ? value : "cool";
  }

  /**
   * The book-level summary, from the SAME effective rows the list shows.
   *
   * Previously computed from legacy chapters alone, which would have silently
   * ignored every native chapter the moment they became visible.
   */
  private computeUserProgressSummary(
    chapters: ChapterListItem[],
    userId: string | null,
  ) {
    if (!userId) return null;
    return this.computeProgressFromChapters(
      chapters.map((c) => ({
        progress:
          c.userProgress.status === "not-started"
            ? []
            : [
                {
                  completedAt:
                    c.userProgress.status === "completed" ? new Date() : null,
                },
              ],
      })),
    );
  }

  private computeIsFavorite(
    book: { favorites?: { id: string }[] },
    userId: string | null,
  ) {
    if (!userId) return false;
    return (book.favorites ?? []).length > 0;
  }

  private computeIsBookmarked(
    book: { bookmarks?: { id: string }[] },
    userId: string | null,
  ) {
    if (!userId) return false;
    return (book.bookmarks ?? []).length > 0;
  }

  /**
   * The rows the detail screen shows, from the effective structure.
   *
   * Each row's status comes from its OWN identity — a legacy chapter from its
   * `chapterId` progress, a native one from its `contentUnitId` — so a native
   * chapter cannot inherit the status of whatever legacy chapter used to sit at
   * its position.
   */
  private buildChaptersList(
    plan: string,
    effective: EffectiveChapter[],
    progressById: Map<string, { completedAt: Date | null }>,
    startedIds: Set<string>,
    userId: string | null,
  ): ChapterListItem[] {
    const tier = PLAN_TO_TIER[plan] ?? "free";
    return effective.map((ch) => {
      const progress = userId ? progressById.get(ch.readerRef.id) : undefined;
      // Completion wins. A finished chapter also has a session behind it, and
      // reporting that as merely "started" would walk somebody's progress
      // backwards.
      //
      // The old rule was `progress.completedAt !== null ? completed :
      // started`, which could only ever say "completed" — the column is
      // non-null — so "started" was unreachable and a started chapter was
      // shown as finished.
      const status: ChapterListItem["userProgress"]["status"] = !userId
        ? "not-started"
        : progress
          ? "completed"
          : startedIds.has(ch.readerRef.id)
            ? "started"
            : "not-started";
      return {
        n: ch.order,
        readerRef: ch.readerRef,
        title: ch.title,
        durationMinutes: ch.durationMinutes,
        // Unchanged display rule: locked rows stay VISIBLE and locked. This
        // list is a table of contents, not an entitlement filter.
        lockedByTier: tier === "pro" && (PLAN_RANK[plan] ?? 0) > 0,
        partNumber: ch.partNumber,
        partTitle: ch.partTitle,
        userProgress: {
          status,
          progressPct:
            status === "completed" ? 100 : status === "started" ? 50 : 0,
        },
      };
    });
  }

  private aggregateRating(
    rows: { rating: number; _count: { rating: number } }[],
  ): BookRating {
    const breakdown: BookRatingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    let weighted = 0;
    for (const row of rows) {
      const r = row.rating as 1 | 2 | 3 | 4 | 5;
      if (r >= 1 && r <= 5) {
        breakdown[r] = row._count.rating;
        total += row._count.rating;
        weighted += r * row._count.rating;
      }
    }
    const avg = total > 0 ? Math.round((weighted / total) * 10) / 10 : 0;
    return { avg, count: total, breakdown };
  }

  private toReviewSummary(row: {
    id: string;
    rating: number;
    text: string;
    createdAt: Date;
    user: {
      firstName: string | null;
      name: string;
      city: string | null;
    };
  }): BookReviewSummary {
    const display = row.user.firstName ?? row.user.name;
    const initials =
      display
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join("") || "•";
    return {
      id: row.id,
      userInitials: initials,
      userCity: row.user.city,
      rating: row.rating,
      text: row.text,
      createdAt: row.createdAt,
    };
  }

  private toAuthorDetail(row: {
    id: string;
    slug: string;
    name: string;
    title: string | null;
    bio: string | null;
    avatarUrl: string | null;
    licenseNumber: string | null;
    cover: string;
    isVerified: boolean;
  }): BookAuthorDetail {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      initials:
        row.name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w.charAt(0).toUpperCase())
          .join("") || "•",
      avatarUrl: row.avatarUrl,
      cover: this.toCoverToken(row.cover),
      bookCount: 0,
      title: row.title,
      bio: row.bio,
      licenseNumber: row.isVerified ? row.licenseNumber : null,
      isVerified: row.isVerified,
    };
  }

  private userPreviewSelect() {
    return { firstName: true, name: true, city: true };
  }

  private async fetchCategories(): Promise<BookCategory[]> {
    const rows = await this.prisma.bookCategory.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      include: {
        _count: { select: { books: { where: { isPublished: true } } } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      label: row.label,
      count: row._count.books,
    }));
  }

  private async fetchAuthors(): Promise<BookAuthorSummary[]> {
    const rows = await this.prisma.bookAuthor.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { books: { where: { isPublished: true } } } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      initials:
        row.name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w.charAt(0).toUpperCase())
          .join("") || "•",
      avatarUrl: row.avatarUrl,
      cover: this.toCoverToken(row.cover),
      bookCount: row._count.books,
    }));
  }

  private async findByIdOrSlug(idOrSlug: string, userId: string | null) {
    const include = this.bookCardInclude(userId);
    const byId = await this.prisma.book.findUnique({
      where: { id: idOrSlug },
      include,
    });
    if (byId) return byId;
    return this.prisma.book.findUnique({
      where: { slug: idOrSlug },
      include,
    });
  }

  private async resolveBookIdOrThrow(idOrSlug: string) {
    const book = await this.prisma.book.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: { id: true, slug: true },
    });
    if (!book) throw new NotFoundException(`Book '${idOrSlug}' not found`);
    return book;
  }
}
