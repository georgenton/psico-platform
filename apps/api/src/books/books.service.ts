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
  constructor(private readonly prisma: PrismaService) {}

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

    const where = this.buildListWhere(userId, query, view);
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

    return {
      books: rows.map((row) => this.toListItem(row, userId)),
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
    const exclude = userId
      ? await this.prisma.userProgress
          .findMany({
            where: { userId },
            select: { chapter: { select: { bookId: true } } },
            distinct: ["chapterId"],
          })
          .then((rows) => rows.map((r) => r.chapter.bookId))
      : [];

    const rows = await this.prisma.book.findMany({
      where: { isPublished: true, id: { notIn: exclude } },
      orderBy: { publishedAt: { sort: "desc", nulls: "last" } },
      take: DEFAULT_RECO_LIMIT,
      include: this.bookCardInclude(userId),
    });

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
    const looseBook = book as unknown as Parameters<
      typeof this.buildChaptersList
    >[0];
    const chaptersList = this.buildChaptersList(looseBook, userId);
    const userProgress = this.computeUserProgressSummary(looseBook, userId);

    return {
      book: {
        id: book.id,
        slug: book.slug,
        title: book.title,
        subtitle: book.subtitle,
        cover: this.toCoverToken(book.cover),
        coverArtUrl: book.coverArtUrl,
        summary: book.summary,
        description: book.description,
        chapters: book.totalChapters,
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

    // Guard 1: must have completed every published chapter.
    const publishedChapters = await this.prisma.chapter.count({
      where: { bookId: book.id, isPublished: true },
    });
    if (publishedChapters === 0) {
      throw new BadRequestException(
        "Cannot review a book with no published chapters",
      );
    }
    const completedChapters = await this.prisma.userProgress.count({
      where: {
        userId,
        chapter: { bookId: book.id, isPublished: true },
      },
    });
    if (completedChapters < publishedChapters) {
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
   * We do not actually store a Book-level "started" record; instead we ensure
   * a UserProgress row exists for chapter 1 (still not completed). The
   * frontend reads `userProgress` and decides "Continuar leyendo" placement.
   */
  async startBook(
    userId: string,
    bookIdOrSlug: string,
  ): Promise<StartBookResponse> {
    const book = await this.resolveBookIdOrThrow(bookIdOrSlug);

    const firstChapter = await this.prisma.chapter.findFirst({
      where: { bookId: book.id, isPublished: true },
      orderBy: { order: "asc" },
      select: { id: true, order: true },
    });
    if (!firstChapter) {
      throw new BadRequestException("Book has no published chapters yet");
    }

    // Upsert a "started" marker. We reuse UserProgress; Sprint S6+ will refine
    // its model to separate started vs completed cleanly. For S5 we simply
    // ensure the row exists.
    await this.prisma.userProgress.upsert({
      where: {
        userId_chapterId: { userId, chapterId: firstChapter.id },
      },
      create: { userId, chapterId: firstChapter.id },
      update: {}, // no-op — preserve original completedAt
    });

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
        ? ({ where: { userId }, select: { id: true } } as const)
        : (false as const),
      bookmarks: userId
        ? ({ where: { userId }, select: { id: true } } as const)
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
            },
          },
    };
  }

  private buildListWhere(
    userId: string | null,
    query: ListBooksQueryDto,
    view: "catalogo" | "mis" | "recos",
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
      base.chapters = { some: { progress: { some: { userId } } } };
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
    const favorites = (row.favorites as { id: string }[] | undefined) ?? [];
    const bookmarks = (row.bookmarks as { id: string }[] | undefined) ?? [];
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
      coverArtUrl: row.coverArtUrl,
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
      userProgress: userId ? this.computeProgressFromChapters(chapters) : null,
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

  private computeUserProgressSummary(
    book: {
      chapters?: Array<{
        progress?: Array<{ completedAt: Date | null }>;
      }>;
    },
    userId: string | null,
  ) {
    if (!userId) return null;
    // The conditional Prisma include narrows the row so that .progress only
    // exists when userId is set; we cast to the loose contract our helper
    // consumes. The runtime shape is identical.
    return this.computeProgressFromChapters(
      (book.chapters as Array<{
        progress?: Array<{ completedAt: Date | null }>;
      }>) ?? [],
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

  private buildChaptersList(
    book: {
      plan: string;
      chapters?: {
        order: number;
        title: string;
        durationMinutes: number | null;
        progress?: { completedAt: Date | null }[];
      }[];
    },
    userId: string | null,
  ): ChapterListItem[] {
    const chapters = book.chapters ?? [];
    const tier = PLAN_TO_TIER[book.plan] ?? "free";
    return chapters.map((ch) => {
      const progress = ch.progress?.[0];
      const status: ChapterListItem["userProgress"]["status"] = !userId
        ? "not-started"
        : !progress
          ? "not-started"
          : progress.completedAt !== null
            ? "completed"
            : "started";
      return {
        n: ch.order,
        title: ch.title,
        durationMinutes: ch.durationMinutes,
        lockedByTier: tier === "pro" && (PLAN_RANK[book.plan] ?? 0) > 0,
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
