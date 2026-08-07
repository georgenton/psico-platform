import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { editionKeyFor } from "../content-core/bootstrap-book";
import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import {
  describeEditionDraft,
  publishDraftRevision,
  readUnitAtRevision,
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
  constructor(private readonly prisma: PrismaService) {}

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

    const changed = new Set(described.changedUnitKeys);
    return {
      book: {
        slug: book.slug,
        title: book.title,
        subtitle: book.subtitle ?? null,
        authorName: book.author?.name ?? null,
      },
      publishedRevisionNumber: described.publishedRevisionNumber,
      draftRevisionId: described.draftRevisionId,
      draftRevisionNumber: described.draftRevisionNumber,
      changedUnitCount: described.changedUnitKeys.length,
      chapters: chapters.map((c) => ({
        order: c.order,
        title: c.title,
        changed: changed.has(unitKeyFromLegacyChapterId(c.id)),
      })),
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

    return {
      bookSlug,
      chapterOrder,
      title: unit.title,
      summary: unit.summary,
      durationMinutes: unit.durationMinutes,
      revisionId,
      revisionNumber:
        described.draftRevisionId === revisionId
          ? described.draftRevisionNumber
          : described.publishedRevisionNumber,
      revisionStatus:
        described.draftRevisionId === revisionId ? "DRAFT" : "PUBLISHED",
      changedUnitCount: described.changedUnitKeys.length,
      blocks: unit.blocks as ContentBlockView[],
    };
  }

  async saveChapterDraft(
    bookSlug: string,
    chapterOrder: number,
    input: {
      expectedRevisionId: string;
      title: string;
      summary?: string | null;
      durationMinutes?: number | null;
      blocks: Array<{ kind: string; content: string; meta?: unknown }>;
    },
  ) {
    const resolved = await this.resolveChapter(bookSlug, chapterOrder);

    try {
      const saved = await saveUnitDraft(this.prisma, {
        editionId: resolved.editionId,
        expectedRevisionId: input.expectedRevisionId,
        unitKey: resolved.unitKey,
        title: input.title,
        summary: input.summary ?? null,
        durationMinutes: input.durationMinutes ?? null,
        // Placement follows the chapter's own position; the browser does not
        // get to move a chapter by saving its text.
        placement: {
          order: resolved.chapterOrder,
          partNumber: null,
          partTitle: null,
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
      select: { id: true, order: true, title: true },
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
