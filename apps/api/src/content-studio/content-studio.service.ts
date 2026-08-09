import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { imageBlockInfo } from "@psico/types";
import { PrismaService } from "../prisma/prisma.service";
import { isTrustedImageUrl } from "../shared/image-upload";
import type { Env } from "../config";
import { editionKeyFor } from "../content-core/bootstrap-book";
import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import {
  describeEditionDraft,
  publishDraftRevision,
  readUnitAtRevision,
  readUnitTitlesAtRevision,
  saveUnitDraft,
} from "../content-core/content-draft";
import { CONTENT_DRAFT_CONFLICT } from "../content-core/revision-lifecycle";

/**
 * Content Studio — the admin write surface for chapter text.
 *
 * Everything an editor's browser sends is CONTENT. Every identity is resolved
 * here, from the two things a URL can honestly carry: a book slug and a chapter
 * number. The browser never names an edition, a unit, a revision number, a
 * `ContentBlock` or a chapter id, so a request cannot reach across books even
 * from someone who knows the ids — which an ADMIN, by definition, might.
 *
 * The concurrency rule is Block B1's and is not re-implemented: the client sends
 * back the `revisionId` it loaded, and a mismatch is a 409 that writes nothing.
 */

/** A chapter resolved to everything Content Core needs, server-side only. */
interface ResolvedChapter {
  bookId: string;
  bookTitle: string;
  editionId: string;
  unitKey: string;
  chapterOrder: number;
  chapterTitle: string;
  /**
   * The chapter's place in the book, carried so a text edit preserves it.
   * Legacy `Chapter` owns this, not the editor's browser — a save that sent
   * nulls here would quietly flatten a book's parts on the way through.
   */
  partNumber: number | null;
  partTitle: string | null;
}

export interface ContentBlockView {
  blockKey: string;
  kind: string;
  order: number;
  content: string;
  meta: unknown;
}

@Injectable()
export class ContentStudioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * IMAGE blocks are validated here; every other kind passes through untouched.
   *
   * `meta` stays an open object on purpose — an AUDIO or VIDEO block carries
   * metadata this vertical does not administer and must round-trip intact. But
   * Content Studio DOES administer images now, so for that one kind the server
   * owes the same guarantee the UI makes: no image without alt text, and no
   * image pointing somewhere we do not control.
   *
   * Runs BEFORE `saveUnitDraft`, so a rejected save mints no revision, archives
   * no draft and moves no pointer.
   */
  private assertImageBlocksValid(
    blocks: Array<{ kind: string; content: string; meta?: unknown }>,
  ): void {
    const base = this.config.get("R2_PUBLIC_URL", { infer: true }) as
      | string
      | undefined;

    blocks.forEach((b, index) => {
      if (b.kind !== "IMAGE") return;

      const info = imageBlockInfo({
        kind: b.kind,
        content: b.content,
        meta: (b.meta ?? null) as Record<string, unknown> | null,
      });
      // The shared reader contract is the grammar: same rule, one definition.
      // It is null when `imageUrl` or `alt` is missing or the wrong shape.
      if (!info) {
        throw new BadRequestException({
          code: "CONTENT_IMAGE_INVALID",
          message:
            "Cada imagen necesita una URL válida y un texto alternativo.",
          index,
        });
      }
      // No public base configured (a private bucket) means no image URL can be
      // trusted, so every one is refused. Fail closed: the alternative is
      // trusting whatever an ADMIN sends because we have nothing to compare it
      // against.
      if (!base || !isTrustedImageUrl(info.imageUrl, base)) {
        // Deliberately says nothing about what IS allowed: the configured
        // origin is not something an error message should hand out.
        throw new BadRequestException({
          code: "CONTENT_IMAGE_URL_NOT_ALLOWED",
          message:
            "La imagen debe haberse subido desde este panel. No se aceptan enlaces externos.",
          index,
        });
      }
    });
  }

  async listBooks() {
    const books = await this.prisma.book.findMany({
      orderBy: { title: "asc" },
      include: { author: true, category: true },
    });
    const counts = await this.prisma.chapter.groupBy({
      by: ["bookId"],
      _count: { _all: true },
    });
    const byBook = new Map(counts.map((c) => [c.bookId, c._count._all]));

    return {
      books: books.map((b) => ({
        slug: b.slug,
        title: b.title,
        subtitle: b.subtitle ?? null,
        authorName: b.author?.name ?? null,
        categoryLabel: b.category?.label ?? null,
        plan: b.plan,
        isPublished: b.isPublished,
        totalChapters: byBook.get(b.id) ?? 0,
      })),
    };
  }

  /** The book's editorial state: what is published, what is drafted, what changed. */
  async getBookState(bookSlug: string) {
    const book = await this.prisma.book.findUnique({
      where: { slug: bookSlug },
      include: { author: true },
    });
    if (!book) throw new NotFoundException({ code: "BOOK_NOT_FOUND" });

    const edition = await this.editionForBook(bookSlug);
    const described = await describeEditionDraft(this.prisma, edition.id);

    const chapters = await this.prisma.chapter.findMany({
      where: { bookId: book.id },
      orderBy: { order: "asc" },
      select: { id: true, order: true, title: true },
    });

    // Titles come from the revision being edited. `Chapter.title` is the legacy
    // row and goes stale the moment Content Studio renames a chapter; showing it
    // would mean the list disagrees with the editor that produced it.
    const effectiveRevisionId =
      described.draftRevisionId ?? described.publishedRevisionId;
    const titles = effectiveRevisionId
      ? await readUnitTitlesAtRevision(this.prisma, effectiveRevisionId)
      : new Map<string, string>();

    const changed = new Set(described.changedUnitKeys);
    return {
      book: {
        slug: book.slug,
        title: book.title,
        subtitle: book.subtitle ?? null,
        authorName: book.author?.name ?? null,
        coverArtUrl: book.coverArtUrl ?? null,
      },
      publishedRevisionNumber: described.publishedRevisionNumber,
      draftRevisionId: described.draftRevisionId,
      draftRevisionNumber: described.draftRevisionNumber,
      changedUnitCount: described.changedUnitKeys.length,
      chapters: chapters.map((c) => {
        const unitKey = unitKeyFromLegacyChapterId(c.id);
        return {
          order: c.order,
          // Falls back to the legacy title only for a chapter Content Core has
          // never ingested — there is no revision to read a truer one from.
          title: titles.get(unitKey) ?? c.title,
          changed: changed.has(unitKey),
        };
      }),
    };
  }

  /**
   * The chapter as the editor should see it: the active draft when one exists,
   * otherwise what is published. The `revisionId` returned IS the concurrency
   * token the client must send back.
   */
  async getChapter(bookSlug: string, chapterOrder: number) {
    const resolved = await this.resolveChapter(bookSlug, chapterOrder);
    const described = await describeEditionDraft(
      this.prisma,
      resolved.editionId,
    );

    const revisionId =
      described.draftRevisionId ?? described.publishedRevisionId;
    if (!revisionId) {
      throw new NotFoundException({ code: "CONTENT_NO_PUBLISHED_REVISION" });
    }

    const unit = await readUnitAtRevision(
      this.prisma,
      revisionId,
      resolved.unitKey,
    );
    if (!unit) throw new NotFoundException({ code: "CONTENT_UNIT_NOT_FOUND" });

    const isDraft = described.draftRevisionId === revisionId;

    return {
      bookSlug,
      chapterOrder,
      title: unit.title,
      summary: unit.summary,
      durationMinutes: unit.durationMinutes,
      revisionId,
      // Non-null by construction: `revisionId` came from one of the two pairs
      // below, and each id travels with its own number.
      revisionNumber: (isDraft
        ? described.draftRevisionNumber
        : described.publishedRevisionNumber)!,
      revisionStatus: isDraft ? ("DRAFT" as const) : ("PUBLISHED" as const),
      changedUnitCount: described.changedUnitKeys.length,
      blocks: unit.blocks as ContentBlockView[],
    };
  }

  /**
   * Save the chapter's BLOCKS into the book's draft.
   *
   * Title, summary and duration are read from the base revision, not from the
   * request. The editor does not administer them yet — several surfaces still
   * read the legacy `Chapter.title` — and a field an admin could change through
   * curl but not through the UI is a promise the product has not made. Carrying
   * them forward from the base is also what keeps a save from being a rename.
   */
  async saveChapterDraft(
    bookSlug: string,
    chapterOrder: number,
    input: {
      expectedRevisionId: string;
      blocks: Array<{ kind: string; content: string; meta?: unknown }>;
    },
  ) {
    this.assertImageBlocksValid(input.blocks);

    const resolved = await this.resolveChapter(bookSlug, chapterOrder);
    const base = await this.readCurrentUnit(resolved);

    try {
      const saved = await saveUnitDraft(this.prisma, {
        editionId: resolved.editionId,
        expectedRevisionId: input.expectedRevisionId,
        unitKey: resolved.unitKey,
        // Server-owned metadata, carried forward from the base revision.
        title: base.title,
        summary: base.summary,
        durationMinutes: base.durationMinutes,
        // Placement follows the chapter's own position AND its part. The
        // browser does not get to move a chapter by saving its text, and it
        // does not get to erase which part the chapter belongs to either.
        placement: {
          order: resolved.chapterOrder,
          partNumber: resolved.partNumber,
          partTitle: resolved.partTitle,
        },
        blocks: input.blocks.map((b) => ({
          kind: b.kind,
          content: b.content,
          meta: (b.meta ?? null) as never,
        })),
      });

      const described = await describeEditionDraft(
        this.prisma,
        resolved.editionId,
      );
      return {
        revisionId: saved.revisionId,
        revisionNumber: saved.revisionNumber,
        changedUnitCount: described.changedUnitKeys.length,
      };
    } catch (err) {
      throw this.mapDomainError(err);
    }
  }

  /**
   * Read one chapter at an explicit revision, for preview.
   *
   * The revision is checked against the RESOLVED edition and must be that
   * edition's current active draft. Without both checks an ADMIN holding a
   * revision id from another book could read it through this route, which is
   * exactly the kind of thing an internal helper should never be exposed as.
   */
  async previewChapter(
    bookSlug: string,
    chapterOrder: number,
    revisionId: string,
  ) {
    const resolved = await this.resolveChapter(bookSlug, chapterOrder);

    const revision = await this.prisma.revision.findUnique({
      where: { id: revisionId },
      select: { id: true, editionId: true, status: true, number: true },
    });
    if (!revision || revision.editionId !== resolved.editionId) {
      throw new NotFoundException({ code: "CONTENT_REVISION_NOT_FOUND" });
    }
    if (revision.status !== "DRAFT") {
      throw new ConflictException({ code: "CONTENT_DRAFT_NOT_ACTIVE" });
    }

    const described = await describeEditionDraft(
      this.prisma,
      resolved.editionId,
    );
    if (described.draftRevisionId !== revision.id) {
      throw new ConflictException({ code: "CONTENT_DRAFT_NOT_ACTIVE" });
    }

    const unit = await readUnitAtRevision(
      this.prisma,
      revision.id,
      resolved.unitKey,
    );
    if (!unit) throw new NotFoundException({ code: "CONTENT_UNIT_NOT_FOUND" });

    return {
      bookSlug,
      chapterOrder,
      revisionId: revision.id,
      revisionNumber: revision.number,
      title: unit.title,
      summary: unit.summary,
      durationMinutes: unit.durationMinutes,
      blocks: unit.blocks as ContentBlockView[],
    };
  }

  /** Publish the book's active draft. Edition-scoped, never one chapter. */
  async publishBook(bookSlug: string, expectedDraftRevisionId: string) {
    const edition = await this.editionForBook(bookSlug);
    const before = await describeEditionDraft(this.prisma, edition.id);

    if (before.draftRevisionId !== expectedDraftRevisionId) {
      throw new ConflictException({
        code: CONTENT_DRAFT_CONFLICT,
        message:
          "El borrador cambió desde que abriste esta pantalla. Recarga antes de publicar.",
      });
    }

    try {
      const published = await publishDraftRevision(
        this.prisma,
        edition.id,
        expectedDraftRevisionId,
      );
      return {
        revisionId: published.revisionId,
        revisionNumber: published.revisionNumber,
        changedUnitCountBeforePublish: before.changedUnitKeys.length,
      };
    } catch (err) {
      throw this.mapDomainError(err);
    }
  }

  /** The unit as of the edition's current base: active draft, else published. */
  private async readCurrentUnit(resolved: ResolvedChapter) {
    const described = await describeEditionDraft(
      this.prisma,
      resolved.editionId,
    );
    const baseRevisionId =
      described.draftRevisionId ?? described.publishedRevisionId;
    if (!baseRevisionId) {
      throw new NotFoundException({ code: "CONTENT_NO_PUBLISHED_REVISION" });
    }
    const unit = await readUnitAtRevision(
      this.prisma,
      baseRevisionId,
      resolved.unitKey,
    );
    if (!unit) throw new NotFoundException({ code: "CONTENT_UNIT_NOT_FOUND" });
    return unit;
  }

  // ── identity resolution ──────────────────────────────────────────────────

  private async editionForBook(bookSlug: string) {
    const edition = await this.prisma.edition.findUnique({
      where: { editionKey: editionKeyFor(bookSlug) },
      select: { id: true },
    });
    if (!edition) {
      throw new NotFoundException({ code: "CONTENT_EDITION_NOT_FOUND" });
    }
    return edition;
  }

  private async resolveChapter(
    bookSlug: string,
    chapterOrder: number,
  ): Promise<ResolvedChapter> {
    const book = await this.prisma.book.findUnique({
      where: { slug: bookSlug },
      select: { id: true, title: true },
    });
    if (!book) throw new NotFoundException({ code: "BOOK_NOT_FOUND" });

    const chapter = await this.prisma.chapter.findFirst({
      where: { bookId: book.id, order: chapterOrder },
      select: {
        id: true,
        order: true,
        title: true,
        partNumber: true,
        partTitle: true,
      },
    });
    if (!chapter) throw new NotFoundException({ code: "CHAPTER_NOT_FOUND" });

    const edition = await this.editionForBook(bookSlug);

    return {
      bookId: book.id,
      bookTitle: book.title,
      editionId: edition.id,
      unitKey: unitKeyFromLegacyChapterId(chapter.id),
      chapterOrder: chapter.order,
      chapterTitle: chapter.title,
      partNumber: chapter.partNumber,
      partTitle: chapter.partTitle,
    };
  }

  /** Domain strings → HTTP, without leaking internals. */
  private mapDomainError(err: unknown): unknown {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes(CONTENT_DRAFT_CONFLICT)) {
      return new ConflictException({
        code: CONTENT_DRAFT_CONFLICT,
        message:
          "El borrador cambió desde que abriste esta pantalla. Recarga antes de guardar.",
      });
    }
    if (message.includes("CONTENT_DRAFT_STALE")) {
      return new ConflictException({ code: "CONTENT_DRAFT_STALE" });
    }
    if (message.includes("CONTENT_DRAFT_NOT_ACTIVE")) {
      return new ConflictException({ code: "CONTENT_DRAFT_NOT_ACTIVE" });
    }
    if (message.includes("CONTENT_DRAFT_NOT_FOUND")) {
      return new NotFoundException({ code: "CONTENT_DRAFT_NOT_FOUND" });
    }
    if (
      message.includes("INGEST_EMPTY_UNIT") ||
      message.includes("INGEST_INVALID_BLOCK_KIND")
    ) {
      return new BadRequestException({ code: message });
    }
    return err;
  }
}
