import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  acceptsInlineMarks,
  imageBlockInfo,
  INLINE_MARKS_META_KEY,
  validateInlineMarks,
} from "@psico/types";
import { PrismaService } from "../prisma/prisma.service";
import {
  appendPlacement,
  CONTENT_STRUCTURE_REQUIRES_SYNC,
  editionForBookSlug,
  structureConflictAtRevision,
  hasPublishableContent,
  listEditorialChapters,
  newNativeUnitKey,
  NEW_CHAPTER_SCAFFOLD,
  resolveEditorialChapter,
} from "./native-authoring";
import {
  contentAssetKeyFrom,
  resolveStoredCoverUrl,
  withResolvedImageUrls,
} from "../shared/content-asset";
import type { Env } from "../config";
import {
  CONTENT_DRAFT_UNIT_ALREADY_PUBLISHED,
  CONTENT_REORDER_REQUIRES_NATIVE_ENTITLEMENT,
  describeEditionDraft,
  discardDraftUnit,
  publishDraftRevision,
  readUnitAtRevision,
  reorderDraftManifest,
  saveUnitDraft,
} from "../content-core/content-draft";
import {
  CONTENT_REORDER_ACROSS_PARTS_UNSUPPORTED,
  CONTENT_REORDER_DUPLICATE_ORDER,
  CONTENT_REORDER_EMPTY,
  CONTENT_REORDER_INCOMPLETE,
  CONTENT_REORDER_UNKNOWN_ORDER,
} from "../content-core/lib/manifest-reorder";
import { CONTENT_DRAFT_CONFLICT } from "../content-core/revision-lifecycle";

/** Matches the chapter-title length the rest of the catalog already allows. */
const CHAPTER_TITLE_MAX = 200;

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
  /** Whether the title can be administered here — see `EditorialChapter`. */
  titleEditable: boolean;
  mediaAdminAvailable: boolean;
  /** Never published, so it can still be discarded and must not ship empty. */
  isNewDraftChapter: boolean;
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
      // Accepted: our own asset path, and — for a block written before the
      // private-bucket fix — an absolute URL on our own R2 base, whose key is
      // recoverable. Refused: everything else, including a public-looking URL on
      // a host we do not control.
      //
      // Fail closed when there is nothing to compare against: an ADMIN can send
      // any string, and "we could not check" must never mean "allowed".
      if (!contentAssetKeyFrom(info.imageUrl, base)) {
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

  /**
   * Inline formatting, checked with the same grammar the readers use.
   *
   * Only when present: a block without `inlineMarks` is the overwhelming
   * majority and must stay untouched, and every other `meta` key round-trips
   * unread — an IMAGE's alt text is not this method's business.
   *
   * STRICT here on purpose, while readers are lenient. A malformed mark that
   * reaches storage is a defect we wrote; one already in storage is a chapter
   * somebody is trying to read. Refusing the write and drawing the plain text
   * are both the safe direction, they just point opposite ways.
   *
   * Runs BEFORE `saveUnitDraft`, so a rejected save mints no revision, archives
   * no draft and moves no pointer.
   */
  private assertInlineMarksValid(
    blocks: Array<{ kind: string; content: string; meta?: unknown }>,
  ): void {
    blocks.forEach((b, index) => {
      const meta = (b.meta ?? null) as Record<string, unknown> | null;
      const raw = meta?.[INLINE_MARKS_META_KEY];
      if (raw === undefined || raw === null) return;

      // Formatting belongs to text. An IMAGE carrying inline marks is a client
      // bug, and accepting it would mean storing something no renderer reads.
      if (!acceptsInlineMarks(b.kind)) {
        throw new BadRequestException({
          code: "CONTENT_INLINE_MARKS_INVALID",
          message: "Este tipo de bloque no admite formato de texto.",
          index,
        });
      }

      if (validateInlineMarks(raw, b.content) !== null) {
        // The specific problem stays server-side: it names offsets and internal
        // vocabulary, and an editor cannot act on either.
        throw new BadRequestException({
          code: "CONTENT_INLINE_MARKS_INVALID",
          message: "El formato del texto no es válido. Vuelve a aplicarlo.",
          index,
        });
      }
    });
  }

  /**
   * Create a chapter that exists only in Content Core.
   *
   * No `Chapter` row, no `ChapterBlock`, no touch of `Book.totalChapters`. The
   * native reader (#649) resolves chapters from the manifest, so those rows are
   * no longer needed to make a chapter readable — and writing them anyway would
   * be recording a legacy fact about content that has none.
   *
   * Goes through the ordinary draft lifecycle: `saveUnitDraft` mints a new
   * revision under the edition lock with the same `expectedRevisionId` check
   * every edit uses. Two editors creating from the same base means one succeeds
   * and the other gets a 409, rather than two chapters appearing.
   */
  async createChapter(
    bookSlug: string,
    input: { expectedRevisionId: string; title: string },
  ) {
    const title = input.title.trim();
    if (title.length === 0 || title.length > CHAPTER_TITLE_MAX) {
      throw new BadRequestException({ code: "CONTENT_CHAPTER_TITLE_INVALID" });
    }

    const book = await this.prisma.book.findUnique({
      where: { slug: bookSlug },
      select: { id: true },
    });
    if (!book) throw new NotFoundException({ code: "BOOK_NOT_FOUND" });

    // BEFORE anything is minted. Appending after the manifest is only safe once
    // the book's readable structure is fully represented in it; otherwise the
    // new chapter can land on a position a legacy row still answers for, and the
    // reader — legacy first — would serve the old one forever while the editor
    // believed they had published a new chapter.
    const structure = await listEditorialChapters(this.prisma, {
      bookId: book.id,
      bookSlug,
    });
    if (!structure.chapterCreationAvailable) {
      throw new UnprocessableEntityException({
        code: CONTENT_STRUCTURE_REQUIRES_SYNC,
        message:
          "Hay capítulos pendientes de sincronizar antes de crear uno nuevo.",
      });
    }

    const edition = await editionForBookSlug(this.prisma, bookSlug);
    // Placement comes from the revision the EDITOR named, so a create races
    // against the same base its concurrency token describes.
    const placement = await appendPlacement(
      this.prisma,
      input.expectedRevisionId,
    );

    try {
      const saved = await saveUnitDraft(this.prisma, {
        editionId: edition.id,
        expectedRevisionId: input.expectedRevisionId,
        // Server-owned, opaque, and fixed for the unit's lifetime.
        unitKey: newNativeUnitKey(),
        title,
        placement,
        blocks: NEW_CHAPTER_SCAFFOLD.map((b) => ({ ...b })),
      });
      const described = await describeEditionDraft(this.prisma, edition.id);
      return {
        chapterOrder: placement.order,
        revisionId: saved.revisionId,
        revisionNumber: saved.revisionNumber,
        // How many units this draft changes in total — the same number every
        // other write reports. Never "1": a create adds to whatever the editor
        // had already changed.
        changedUnitCount: described.changedUnitKeys.length,
      };
    } catch (err) {
      throw this.mapDomainError(err);
    }
  }

  /**
   * Remove a chapter that has never been published from the active draft.
   *
   * Not deletion. The unit and every revision that referenced it stay exactly
   * where they are — a published chapter can never take this path, and no
   * historical revision is rewritten. What changes is only which units the NEXT
   * draft places.
   *
   * It exists because the alternative is cruel: an editor who creates a chapter
   * and changes their mind would otherwise have to publish it or throw away
   * every other edit in the book.
   */
  async discardNewChapter(
    bookSlug: string,
    chapterOrder: number,
    expectedRevisionId: string,
  ) {
    const book = await this.prisma.book.findUnique({
      where: { slug: bookSlug },
      select: { id: true },
    });
    if (!book) throw new NotFoundException({ code: "BOOK_NOT_FOUND" });

    const target = await resolveEditorialChapter(this.prisma, {
      bookId: book.id,
      bookSlug,
      order: chapterOrder,
    });
    if (!target) throw new NotFoundException({ code: "CHAPTER_NOT_FOUND" });
    // The one guard that makes this safe to expose: a chapter a reader has seen
    // is not something an editor can make disappear from here.
    if (!target.isNewDraftChapter) {
      throw new BadRequestException({
        code: "CONTENT_CHAPTER_ALREADY_PUBLISHED",
        message: "Este capítulo ya está publicado y no puede descartarse.",
      });
    }

    const edition = await editionForBookSlug(this.prisma, bookSlug);
    try {
      const discarded = await discardDraftUnit(this.prisma, {
        editionId: edition.id,
        expectedRevisionId,
        unitKey: target.unitKey,
      });
      const described = await describeEditionDraft(this.prisma, edition.id);
      return {
        ...discarded,
        changedUnitCount: described.changedUnitKeys.length,
      };
    } catch (err) {
      throw this.mapDomainError(err);
    }
  }

  /**
   * Rearrange the book's chapters in the draft.
   *
   * Does not publish. What it produces is the next draft snapshot, so readers
   * keep getting the published structure until somebody publishes this one
   * through the ordinary publish button — there is no reorder-specific publish,
   * on purpose: the pointer move is the same atomic act it has always been.
   *
   * The refusal below is a fast, friendly copy of rules the transaction
   * enforces again inside the edition lock — entitlement ownership AND full
   * structural adoption, both against the exact base revision. Neither check
   * here is the authority: a migration or an ingest can land between this
   * check and the write, and the browser gets a clearer message if the answer
   * is already known before a transaction is opened.
   */
  async reorderChapters(
    bookSlug: string,
    input: { expectedRevisionId: string; orderedChapterOrders: number[] },
  ) {
    const book = await this.prisma.book.findUnique({
      where: { slug: bookSlug },
      select: { id: true },
    });
    if (!book) throw new NotFoundException({ code: "BOOK_NOT_FOUND" });

    const structure = await listEditorialChapters(this.prisma, {
      bookId: book.id,
      bookSlug,
    });
    if (!structure.reorderAvailable) {
      throw new UnprocessableEntityException({
        code:
          structure.reorderBlockedReason === "NATIVE_ENTITLEMENT_REQUIRED"
            ? CONTENT_REORDER_REQUIRES_NATIVE_ENTITLEMENT
            : CONTENT_STRUCTURE_REQUIRES_SYNC,
        message:
          structure.reorderBlockedReason === "NATIVE_ENTITLEMENT_REQUIRED"
            ? "Este libro todavía resuelve el acceso por posición. No puede reordenarse hasta migrar su entitlement."
            : "Hay capítulos pendientes de sincronizar antes de reordenar.",
      });
    }

    const edition = await editionForBookSlug(this.prisma, bookSlug);
    try {
      const reordered = await reorderDraftManifest(this.prisma, {
        editionId: edition.id,
        expectedRevisionId: input.expectedRevisionId,
        orderedCurrentOrders: input.orderedChapterOrders,
      });
      const described = await describeEditionDraft(this.prisma, edition.id);
      return {
        ...reordered,
        changedUnitCount: described.changedUnitKeys.length,
        structureChanged: described.structureChanged,
      };
    } catch (err) {
      throw this.mapDomainError(err);
    }
  }

  /**
   * The books, with the chapter count Content Studio can actually see.
   *
   * Counting `Chapter` rows was right until a chapter could exist without one;
   * it now goes stale the moment a native chapter is published, and the list
   * would say 2 while the book page and the reader both said 3.
   *
   * The count is the EFFECTIVE EDITORIAL revision's — the active draft if there
   * is one, else what is published. Content Studio is an editorial surface, so
   * it should show the structure the editor is working on, including a chapter
   * they created but have not published yet. The legacy count is the fallback
   * only for a book Content Core does not serve.
   *
   * Four queries regardless of how many books there are: no per-book work.
   */
  async listBooks() {
    const books = await this.prisma.book.findMany({
      orderBy: { title: "asc" },
      include: { author: true, category: true },
    });

    const [legacyCounts, editions] = await Promise.all([
      this.prisma.chapter.groupBy({
        by: ["bookId"],
        _count: { _all: true },
      }),
      this.prisma.edition.findMany({
        where: { slug: { in: books.map((b) => b.slug) } },
        select: { id: true, slug: true, publishedRevisionId: true },
      }),
    ]);
    const legacyByBook = new Map(
      legacyCounts.map((c) => [c.bookId, c._count._all]),
    );

    // The active draft of each edition, in one query rather than one per book.
    const drafts = await this.prisma.revision.findMany({
      where: { editionId: { in: editions.map((e) => e.id) }, status: "DRAFT" },
      orderBy: { number: "desc" },
      select: { id: true, editionId: true },
    });
    const draftByEdition = new Map<string, string>();
    for (const d of drafts) {
      // `findMany` came back newest-first, so the first one wins.
      if (!draftByEdition.has(d.editionId))
        draftByEdition.set(d.editionId, d.id);
    }

    const effectiveByslug = new Map<string, string>();
    for (const e of editions) {
      const revisionId = draftByEdition.get(e.id) ?? e.publishedRevisionId;
      if (revisionId) effectiveByslug.set(e.slug, revisionId);
    }

    const placed = await this.prisma.revisionUnit.groupBy({
      by: ["revisionId"],
      where: { revisionId: { in: [...effectiveByslug.values()] } },
      _count: { _all: true },
    });
    const placedByRevision = new Map(
      placed.map((p) => [p.revisionId, p._count._all]),
    );

    return {
      books: books.map((b) => {
        const revisionId = effectiveByslug.get(b.slug);
        const fromManifest = revisionId
          ? (placedByRevision.get(revisionId) ?? 0)
          : 0;
        return {
          slug: b.slug,
          title: b.title,
          subtitle: b.subtitle ?? null,
          authorName: b.author?.name ?? null,
          categoryLabel: b.category?.label ?? null,
          plan: b.plan,
          isPublished: b.isPublished,
          totalChapters:
            fromManifest > 0 ? fromManifest : (legacyByBook.get(b.id) ?? 0),
        };
      }),
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

    // The chapter list comes from the manifest, titles included. Listing
    // `Chapter` rows would omit every chapter created here, and their titles go
    // stale the moment Content Studio renames one.
    const structure = await listEditorialChapters(this.prisma, {
      bookId: book.id,
      bookSlug,
    });
    const { chapters, effective } = structure;

    const changed = new Set(described.changedUnitKeys);
    return {
      book: {
        slug: book.slug,
        title: book.title,
        subtitle: book.subtitle ?? null,
        authorName: book.author?.name ?? null,
        // Resolved like every other stored image: the cover lives in the same
        // private bucket, so the raw value is an identity rather than something
        // the editor's browser can load.
        coverArtUrl: book.coverArtUrl
          ? resolveStoredCoverUrl(
              book.coverArtUrl,
              this.config.get("R2_PUBLIC_URL", { infer: true }) as
                | string
                | undefined,
            )
          : null,
      },
      publishedRevisionNumber: described.publishedRevisionNumber,
      draftRevisionId: described.draftRevisionId,
      draftRevisionNumber: described.draftRevisionNumber,
      // The concurrency token a create must send. Without it the client would
      // have to invent one on a book that has no draft yet, and inventing it is
      // exactly what the token exists to prevent.
      editingRevisionId: effective.revisionId,
      // The server's own conclusion about whether the book can take a new
      // chapter. Sent so the button is right the first time, instead of the
      // browser discovering a refusal after submitting — and so the rule has
      // exactly one home.
      chapterCreationAvailable: structure.chapterCreationAvailable,
      creationBlockedReason: structure.creationBlockedReason,
      // Same contract as creation: the server owns the rule, so the control is
      // right the first time instead of the browser learning it from a 422.
      reorderAvailable: structure.reorderAvailable,
      reorderBlockedReason: structure.reorderBlockedReason,
      changedUnitCount: described.changedUnitKeys.length,
      structureChanged: described.structureChanged,
      chapters: chapters.map((c) => ({
        order: c.order,
        title: c.title,
        // Placement metadata, straight from the manifest entry. The reorder
        // write refuses a move across a part boundary, so the editor is told
        // where those boundaries are rather than discovering one from a 422.
        partNumber: c.partNumber,
        partTitle: c.partTitle,
        changed: changed.has(c.unitKey),
        isNewDraftChapter: c.isNewDraftChapter,
        titleEditable: c.titleEditable,
        ingested: c.ingested,
        // Content Studio edits units, and an un-ingested chapter has none, so
        // there is nothing for the editor to open. Said here rather than left
        // as a link that 404s.
        editable: c.ingested,
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
      // What this screen may actually do with this chapter. Sent rather than
      // inferred client-side: the reason a title is read-only or a media panel
      // absent lives in the data, not in the URL.
      titleEditable: resolved.titleEditable,
      mediaAdminAvailable: resolved.mediaAdminAvailable,
      isNewDraftChapter: resolved.isNewDraftChapter,
      blocks: this.resolveImages(unit.blocks as ContentBlockView[]),
    };
  }

  /**
   * Save the chapter's BLOCKS into the book's draft.
   *
   * Summary and duration are read from the base revision, not from the request:
   * the editor does not administer them, and a field an admin could change
   * through curl but not through the UI is a promise the product has not made.
   *
   * The TITLE is different now. A chapter created here has no other place to be
   * named, so its title is editable and travels with the save. A legacy-backed
   * chapter's title is still read from `Chapter` by surfaces this phase has not
   * touched, so sending one is refused rather than half-applied.
   */
  async saveChapterDraft(
    bookSlug: string,
    chapterOrder: number,
    input: {
      expectedRevisionId: string;
      title?: string;
      blocks: Array<{ kind: string; content: string; meta?: unknown }>;
    },
  ) {
    this.assertImageBlocksValid(input.blocks);
    this.assertInlineMarksValid(input.blocks);

    const resolved = await this.resolveChapter(bookSlug, chapterOrder);
    const base = await this.readCurrentUnit(resolved);

    const title = this.resolveSavedTitle(resolved, base.title, input.title);

    try {
      const saved = await saveUnitDraft(this.prisma, {
        editionId: resolved.editionId,
        expectedRevisionId: input.expectedRevisionId,
        unitKey: resolved.unitKey,
        title,
        // Server-owned metadata, carried forward from the base revision.
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
      blocks: this.resolveImages(unit.blocks as ContentBlockView[]),
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

    await this.assertNewChaptersHaveContent(bookSlug, expectedDraftRevisionId);

    const book = await this.prisma.book.findUnique({
      where: { slug: bookSlug },
      select: { id: true },
    });
    if (!book) throw new NotFoundException({ code: "BOOK_NOT_FOUND" });

    try {
      const published = await publishDraftRevision(
        this.prisma,
        edition.id,
        expectedDraftRevisionId,
        // Inside the edition lock, against the exact revision being published.
        //
        // A draft where a unit sits at a position a `Chapter` row also answers
        // for cannot go out: the reader tries legacy first, so publishing it
        // would move the pointer, tell the editor the chapter is live, and
        // serve the old chapter to every reader forever.
        //
        // Deliberately NOT "refuse whenever something is unsynced". An
        // un-adopted chapter at a position nothing else claims shadows nothing,
        // and freezing publication for the whole book over it would block
        // ordinary text edits for no safety gained.
        async (tx, ctx) => {
          const conflict = await structureConflictAtRevision(tx, {
            bookId: book.id,
            revisionId: ctx.revisionId,
          });
          if (conflict) throw new Error(CONTENT_STRUCTURE_REQUIRES_SYNC);
        },
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
  /**
   * Refuse to publish a chapter nobody ever wrote.
   *
   * A new chapter starts as one empty paragraph, so publishing a book straight
   * after creating one would ship a blank chapter to readers. Asked only of
   * units the reader has never seen: applying a content rule to an existing
   * published chapter would turn somebody else's book into a migration.
   */
  private async assertNewChaptersHaveContent(
    bookSlug: string,
    draftRevisionId: string,
  ) {
    const book = await this.prisma.book.findUnique({
      where: { slug: bookSlug },
      select: { id: true },
    });
    if (!book) throw new NotFoundException({ code: "BOOK_NOT_FOUND" });

    const { chapters } = await listEditorialChapters(this.prisma, {
      bookId: book.id,
      bookSlug,
    });

    for (const chapter of chapters.filter((c) => c.isNewDraftChapter)) {
      const unit = await readUnitAtRevision(
        this.prisma,
        draftRevisionId,
        chapter.unitKey,
      );
      if (!unit) continue;
      const publishable = hasPublishableContent({
        title: unit.title,
        blocks: unit.blocks as Array<{ kind: string; content: string }>,
      });
      if (!publishable) {
        throw new BadRequestException({
          code: "CONTENT_NEW_CHAPTER_EMPTY",
          message: `El capítulo ${chapter.order} está vacío. Escribe algo o descártalo antes de publicar.`,
          details: { chapterOrder: chapter.order },
        });
      }
    }
  }

  /**
   * Turn stored image identities into something the editor can fetch.
   *
   * The bucket is private, so what is stored is never directly loadable. Applied
   * on the way out of BOTH the editor read and the preview, because a preview
   * that could not show an image would be the same bug wearing a different hat.
   */
  private resolveImages(blocks: ContentBlockView[]): ContentBlockView[] {
    const base = this.config.get("R2_PUBLIC_URL", { infer: true }) as
      | string
      | undefined;
    return withResolvedImageUrls(blocks, base);
  }

  /**
   * Which title a save should write.
   *
   * Omitting it always means "leave it alone". Sending one for a chapter whose
   * title this phase cannot own is refused outright: silently ignoring it would
   * show the editor a rename that never happened.
   */
  private resolveSavedTitle(
    resolved: ResolvedChapter,
    baseTitle: string,
    requested: string | undefined,
  ): string {
    if (requested === undefined) return baseTitle;

    if (!resolved.titleEditable) {
      throw new BadRequestException({
        code: "CONTENT_CHAPTER_TITLE_READ_ONLY",
        message:
          "El título de este capítulo todavía se administra fuera de Content Studio.",
      });
    }
    const title = requested.trim();
    if (title.length === 0 || title.length > CHAPTER_TITLE_MAX) {
      throw new BadRequestException({ code: "CONTENT_CHAPTER_TITLE_INVALID" });
    }
    return title;
  }

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

  /** By slug, not by key shape — the edition key stopped being an authority in #648. */
  private async editionForBook(bookSlug: string) {
    return editionForBookSlug(this.prisma, bookSlug);
  }

  /**
   * A chapter by position, from the revision the editor is looking at.
   *
   * Deliberately no `Chapter` lookup. A chapter created here has no legacy row,
   * so resolving through that table would make every chapter Content Studio
   * itself produced unopenable — the manifest is what decides which chapters
   * this book has.
   */
  private async resolveChapter(
    bookSlug: string,
    chapterOrder: number,
  ): Promise<ResolvedChapter> {
    const book = await this.prisma.book.findUnique({
      where: { slug: bookSlug },
      select: { id: true, title: true },
    });
    if (!book) throw new NotFoundException({ code: "BOOK_NOT_FOUND" });

    const target = await resolveEditorialChapter(this.prisma, {
      bookId: book.id,
      bookSlug,
      order: chapterOrder,
    });
    if (!target) throw new NotFoundException({ code: "CHAPTER_NOT_FOUND" });
    // Readable, but not something this surface can edit: there is no unit
    // behind it. A specific refusal beats `CONTENT_UNIT_NOT_FOUND` from two
    // calls deeper, which reads like a bug rather than a state.
    if (!target.ingested) {
      throw new UnprocessableEntityException({
        code: CONTENT_STRUCTURE_REQUIRES_SYNC,
        message: "Este capítulo está pendiente de sincronización.",
      });
    }

    const edition = await this.editionForBook(bookSlug);

    return {
      bookId: book.id,
      bookTitle: book.title,
      editionId: edition.id,
      unitKey: target.unitKey,
      chapterOrder: target.order,
      chapterTitle: target.title,
      partNumber: target.partNumber,
      partTitle: target.partTitle,
      titleEditable: target.titleEditable,
      mediaAdminAvailable: target.mediaAdminAvailable,
      isNewDraftChapter: target.isNewDraftChapter,
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
    // The transactional guard fired: the unit was published between the
    // service-level check and the lock. Same code the fast check uses, because
    // to the editor it is the same situation.
    if (message.includes(CONTENT_STRUCTURE_REQUIRES_SYNC)) {
      return new UnprocessableEntityException({
        code: CONTENT_STRUCTURE_REQUIRES_SYNC,
        message:
          "Hay capítulos pendientes de sincronizar antes de publicar estos cambios.",
      });
    }
    if (message.includes(CONTENT_DRAFT_UNIT_ALREADY_PUBLISHED)) {
      return new BadRequestException({
        code: "CONTENT_CHAPTER_ALREADY_PUBLISHED",
        message: "Este capítulo ya está publicado y no puede descartarse.",
      });
    }
    if (message.includes(CONTENT_REORDER_REQUIRES_NATIVE_ENTITLEMENT)) {
      return new UnprocessableEntityException({
        code: CONTENT_REORDER_REQUIRES_NATIVE_ENTITLEMENT,
        message:
          "Este libro todavía resuelve el acceso por posición. No puede reordenarse hasta migrar su entitlement.",
      });
    }
    if (message.includes(CONTENT_REORDER_ACROSS_PARTS_UNSUPPORTED)) {
      return new UnprocessableEntityException({
        code: CONTENT_REORDER_ACROSS_PARTS_UNSUPPORTED,
        message:
          "Mover un capítulo a otra parte todavía no está soportado. Reordena dentro de su parte.",
      });
    }
    // The request does not describe the revision it names: a position repeated,
    // one that does not exist there, or one left out. All four are the same
    // situation for the editor — the screen is out of date — but the codes stay
    // distinct so a bug in the client is diagnosable.
    if (
      message.includes(CONTENT_REORDER_DUPLICATE_ORDER) ||
      message.includes(CONTENT_REORDER_UNKNOWN_ORDER) ||
      message.includes(CONTENT_REORDER_INCOMPLETE) ||
      message.includes(CONTENT_REORDER_EMPTY)
    ) {
      return new BadRequestException({
        code: message,
        message:
          "El orden enviado no corresponde a la revisión que se está editando. Recarga antes de reordenar.",
      });
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
