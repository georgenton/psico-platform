import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ChapterMediaKind } from "@psico/types";
import { PrismaService } from "../prisma/prisma.service";
import {
  productionChapterMediaRegistry,
  validateChapterMediaDefinition,
  type ChapterMediaDefinition,
} from "../lector/media/chapter-media.catalog";

/**
 * Content Studio — administering a chapter's media DEFINITIONS.
 *
 * Not its bytes. Nothing here uploads, signs, or asks a provider anything; C2A
 * moves the editorial catalog out of a deploy, and that is all.
 *
 * The distinction that runs through the whole file: `editorialStatus` is the CMS
 * lifecycle (may this row reach the runtime at all), while the definition's own
 * `status` keeps its runtime meaning (DRAFT is a public "En producción",
 * PUBLISHED is playable). A CMS draft holding a runtime-PUBLISHED definition is
 * still entirely private, which is what makes editing safe.
 *
 * Adoption is the feature that matters most. Cloning a code definition at the
 * SAME `mediaKey` and `mediaVersion` moves authority without moving identity —
 * and completion identity is exactly those two fields, so anyone who already
 * finished that audiobook has still finished it afterwards.
 */

export type MediaProvenance = "CODE" | "DATABASE";
export type MediaEditorialState = "CODE_OWNED" | "DRAFT" | "PUBLISHED";

/**
 * What an admin browser is allowed to know.
 *
 * Deliberately NOT the definition. An object key, a Stream UID or an access
 * policy are provider and entitlement facts; putting them in a JSON response
 * would leak our storage layout into a browser tab and a screenshot, for no
 * editorial benefit. The admin edits copy, so the admin sees copy.
 */
export interface AdminMediaCard {
  kind: ChapterMediaKind;
  mediaKey: string;
  mediaVersion: number;
  title: string;
  description: string | null;
  durationSec: number | null;
  chapters: Array<{ startSec: number; label: string }>;
  /** What a reader sees today. */
  runtimeAvailability: "COMING_SOON" | "AVAILABLE";
  /** Whether a master is actually attached. */
  sourceReady: boolean;
  hasTranscript: boolean;
  hasPoster: boolean;
  hasCaptions: boolean;
  provenance: MediaProvenance;
  editorialStatus: MediaEditorialState;
  /** The DB row to edit or publish, when there is one. */
  draftId: string | null;
}

const KIND_ORDER: readonly ChapterMediaKind[] = [
  "AUDIOBOOK",
  "PODCAST",
  "VIDEO",
];

/** Projection. The definition never leaves this function intact. */
function toCard(
  def: ChapterMediaDefinition,
  provenance: MediaProvenance,
  editorialStatus: MediaEditorialState,
  draftId: string | null,
): AdminMediaCard {
  return {
    kind: def.kind,
    mediaKey: def.mediaKey,
    mediaVersion: def.mediaVersion,
    title: def.title,
    description: def.description,
    durationSec: def.durationSec,
    chapters: def.chapters.map((c) => ({
      startSec: c.startSec,
      label: c.label,
    })),
    runtimeAvailability:
      def.status === "PUBLISHED" && def.source !== null
        ? "AVAILABLE"
        : "COMING_SOON",
    sourceReady: def.source !== null,
    hasTranscript: def.transcriptObjectKey !== null,
    hasPoster: def.posterObjectKey !== null,
    hasCaptions:
      def.source !== null &&
      def.source.kind === "CLOUDFLARE_STREAM" &&
      typeof def.source.captionLanguage === "string",
    provenance,
    editorialStatus,
    draftId,
  };
}

@Injectable()
export class ChapterMediaAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The chapter's three formats, each in whichever state it is actually in.
   *
   * Reads the CMS rows directly rather than through the public repository: an
   * editor has to see their own DRAFT, which is precisely what the public
   * repository is built to hide.
   */
  async listForChapter(bookSlug: string, chapterOrder: number) {
    await this.assertChapterExists(bookSlug, chapterOrder);

    const rows = await this.prisma.chapterMediaVersion.findMany({
      where: { bookSlug, chapterOrder },
      orderBy: [{ mediaVersion: "desc" }, { createdAt: "desc" }],
    });

    const byKind = new Map<ChapterMediaKind, AdminMediaCard>();

    // Code first; a database row for the same kind replaces it below.
    for (const def of productionChapterMediaRegistry.forChapter(
      bookSlug,
      chapterOrder,
    )) {
      byKind.set(def.kind, toCard(def, "CODE", "CODE_OWNED", null));
    }

    for (const row of rows) {
      const def = this.rebuildOrNull(row.definitionJson);
      if (!def) continue;
      const held = byKind.get(def.kind);
      // A draft outranks the code row it was cloned from — that is what the
      // editor is working on.
      if (held && held.provenance === "DATABASE") continue;
      byKind.set(
        def.kind,
        toCard(def, "DATABASE", row.editorialStatus, row.id),
      );
    }

    return {
      bookSlug,
      chapterOrder,
      media: KIND_ORDER.map((k) => byKind.get(k)).filter(
        (c): c is AdminMediaCard => c !== undefined,
      ),
    };
  }

  /**
   * Clone a code-owned definition into a CMS draft, byte for byte.
   *
   * No new version, no new key: the clone IS the same media. Publishing it later
   * makes the database authoritative for that exact key, which is why the public
   * hybrid repository resolves a tie in the database's favour.
   */
  async adopt(
    bookSlug: string,
    chapterOrder: number,
    mediaKey: string,
    adminUserId: string,
  ) {
    await this.assertChapterExists(bookSlug, chapterOrder);

    const def = productionChapterMediaRegistry.find(mediaKey);
    if (
      !def ||
      def.bookSlug !== bookSlug ||
      def.chapterOrder !== chapterOrder
    ) {
      throw new NotFoundException({ code: "MEDIA_DEFINITION_NOT_FOUND" });
    }

    const existing = await this.prisma.chapterMediaVersion.findFirst({
      where: { mediaKey },
      select: { id: true, editorialStatus: true },
    });
    if (existing) {
      throw new ConflictException({
        code: "MEDIA_ALREADY_ADMINISTERED",
        message: "Esta pieza ya se administra desde el CMS.",
      });
    }

    const row = await this.prisma.chapterMediaVersion.create({
      data: {
        mediaKey: def.mediaKey,
        mediaVersion: def.mediaVersion,
        bookSlug: def.bookSlug,
        chapterOrder: def.chapterOrder,
        kind: def.kind,
        editorialStatus: "DRAFT",
        // The clone is exact, provider fields and all. Anything less would make
        // publishing it a silent downgrade of what readers have today.
        definitionJson: def as unknown as object,
        createdByUserId: adminUserId,
      },
      select: { id: true },
    });

    return { draftId: row.id, mediaKey: def.mediaKey };
  }

  /**
   * Create the missing format for a chapter that has none of that kind.
   *
   * It starts as a runtime DRAFT with no source, so publishing it advertises
   * «En producción» and nothing else. A player that pretends an asset exists is
   * worse than an honest empty slot, and attaching a master is C2B's job.
   */
  async createComingSoon(
    bookSlug: string,
    chapterOrder: number,
    kind: ChapterMediaKind,
    title: string,
    description: string,
    adminUserId: string,
  ) {
    await this.assertChapterExists(bookSlug, chapterOrder);

    const inCode = productionChapterMediaRegistry
      .forChapter(bookSlug, chapterOrder)
      .some((d) => d.kind === kind);
    const inDb = await this.prisma.chapterMediaVersion.findFirst({
      where: { bookSlug, chapterOrder, kind },
      select: { id: true },
    });
    if (inCode || inDb) {
      throw new ConflictException({
        code: "MEDIA_KIND_ALREADY_EXISTS",
        message: "Este capítulo ya tiene ese formato.",
      });
    }

    // Server-minted, deterministic, and inside the catalog's key grammar. An
    // admin typing a media key would be typing a completion identity.
    const mediaKey = `${slugToken(bookSlug)}-c${chapterOrder}-${kind.toLowerCase()}-v1`;

    const definition = validateChapterMediaDefinition({
      mediaKey,
      mediaVersion: 1,
      bookSlug,
      chapterOrder,
      kind,
      status: "DRAFT",
      title,
      description,
      durationSec: null,
      accessPolicy: null,
      source: null,
      posterObjectKey: null,
      transcriptObjectKey: null,
      chapters: [],
    });

    const row = await this.prisma.chapterMediaVersion.create({
      data: {
        mediaKey,
        mediaVersion: 1,
        bookSlug,
        chapterOrder,
        kind,
        editorialStatus: "DRAFT",
        definitionJson: definition as unknown as object,
        createdByUserId: adminUserId,
      },
      select: { id: true },
    });

    return { draftId: row.id, mediaKey };
  }

  async getDraft(draftId: string) {
    const row = await this.requireDraftRow(draftId);
    const def = this.rebuildOrThrow(row.definitionJson);
    return toCard(def, "DATABASE", row.editorialStatus, row.id);
  }

  /**
   * Edit the editorial copy. Identity, provider state and access policy are
   * carried forward from the stored definition — the browser sends words, never
   * anything that decides what plays or who may play it.
   */
  async updateDraft(
    draftId: string,
    input: {
      title: string;
      description: string;
      durationSec: number | null;
      chapters: Array<{ startSec: number; label: string }>;
    },
  ) {
    const row = await this.requireDraftRow(draftId);
    if (row.editorialStatus !== "DRAFT") {
      throw new ConflictException({
        code: "MEDIA_DEFINITION_PUBLISHED",
        message:
          "Una definición publicada no se edita. La nueva versión llega al administrar un archivo nuevo.",
      });
    }

    const current = this.rebuildOrThrow(row.definitionJson);

    let next: ChapterMediaDefinition;
    try {
      next = validateChapterMediaDefinition({
        ...current,
        title: input.title,
        description: input.description,
        durationSec: input.durationSec,
        chapters: input.chapters,
      });
    } catch {
      throw new BadRequestException({ code: "MEDIA_DEFINITION_INVALID" });
    }

    await this.prisma.chapterMediaVersion.update({
      where: { id: row.id },
      data: { definitionJson: next as unknown as object },
    });

    return toCard(next, "DATABASE", "DRAFT", row.id);
  }

  /**
   * Publish: the row becomes the authority for its key. No deploy, no provider
   * call, no learning event — the bytes and the completion identity are exactly
   * what they were a second ago.
   */
  async publishDraft(draftId: string) {
    const row = await this.requireDraftRow(draftId);
    if (row.editorialStatus !== "DRAFT") {
      throw new ConflictException({ code: "MEDIA_DEFINITION_PUBLISHED" });
    }

    const def = this.rebuildOrThrow(row.definitionJson);
    // The columns are what the CMS and the public repository query on, so a
    // definition that disagrees with them would be findable as one thing and
    // resolvable as another.
    if (
      def.mediaKey !== row.mediaKey ||
      def.mediaVersion !== row.mediaVersion ||
      def.bookSlug !== row.bookSlug ||
      def.chapterOrder !== row.chapterOrder ||
      def.kind !== row.kind
    ) {
      throw new ConflictException({ code: "MEDIA_DEFINITION_IDENTITY_DRIFT" });
    }

    const updated = await this.prisma.chapterMediaVersion.update({
      where: { id: row.id },
      data: { editorialStatus: "PUBLISHED", publishedAt: new Date() },
      select: { id: true, mediaKey: true, mediaVersion: true },
    });

    return {
      draftId: updated.id,
      mediaKey: updated.mediaKey,
      mediaVersion: updated.mediaVersion,
    };
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async assertChapterExists(bookSlug: string, chapterOrder: number) {
    const book = await this.prisma.book.findUnique({
      where: { slug: bookSlug },
      select: { id: true },
    });
    if (!book) throw new NotFoundException({ code: "BOOK_NOT_FOUND" });

    const chapter = await this.prisma.chapter.findFirst({
      where: { bookId: book.id, order: chapterOrder },
      select: { id: true },
    });
    if (!chapter) throw new NotFoundException({ code: "CHAPTER_NOT_FOUND" });
  }

  private async requireDraftRow(draftId: string) {
    const row = await this.prisma.chapterMediaVersion.findUnique({
      where: { id: draftId },
    });
    if (!row) throw new NotFoundException({ code: "MEDIA_DRAFT_NOT_FOUND" });
    return row;
  }

  private rebuildOrNull(json: unknown): ChapterMediaDefinition | null {
    try {
      return validateChapterMediaDefinition(json);
    } catch {
      return null;
    }
  }

  private rebuildOrThrow(json: unknown): ChapterMediaDefinition {
    const def = this.rebuildOrNull(json);
    if (!def) {
      throw new ConflictException({ code: "MEDIA_DEFINITION_INVALID" });
    }
    return def;
  }
}

/** A book slug reduced to the catalog's key grammar. */
function slugToken(bookSlug: string): string {
  const initials = bookSlug
    .split("-")
    .map((part) => part[0] ?? "")
    .join("");
  return /^[a-z0-9]+$/.test(initials) ? initials : "book";
}
