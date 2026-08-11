import { randomUUID } from "node:crypto";
import { NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";

/**
 * Creating a chapter that only Content Core knows about.
 *
 * Content Studio could edit chapters; it could not make one. Everything about
 * the editorial surface resolved through a legacy `Chapter` row — the chapter
 * list, the chapter lookup, the title — so "new chapter" would have meant
 * inserting a `Chapter` to satisfy code that no longer needs it. #648 and #649
 * removed that need from entitlement and from the reader; this removes it from
 * authoring.
 *
 * ── The two revisions ─────────────────────────────────────────────────────
 *
 * An editor and a reader are looking at different things, deliberately:
 *
 *   CMS    → the active DRAFT if there is one, else the published revision
 *   READER → the published revision, only
 *
 * That difference is the whole reason a new chapter can be written, previewed
 * and revised without anybody seeing it. Every editorial lookup here goes
 * through the effective revision; nothing here can serve a reader.
 *
 * ── Append-only ───────────────────────────────────────────────────────────
 *
 * Phase A appends and nothing else. Reordering would move a chapter out from
 * under a positional URL, and stable chapter routes do not exist yet — so the
 * feature that needs them waits for them.
 */

type Db = Pick<
  PrismaClient,
  "book" | "edition" | "revision" | "revisionUnit" | "contentUnit" | "chapter"
>;

/**
 * A stable identity for a chapter that has no legacy row to derive one from.
 *
 * Opaque and server-generated on purpose. Deriving it from the title, the
 * position or the content would tie identity to things an editor is expected to
 * change — and identity is exactly what must survive them, because a reader's
 * progress and marks hang off it. The browser never proposes one.
 */
export function newNativeUnitKey(): string {
  return randomUUID();
}

export interface EffectiveRevision {
  revisionId: string;
  /** True when the editor is looking at unpublished work. */
  isDraft: boolean;
  editionId: string;
}

/**
 * The revision Content Studio is editing: the active draft, else what readers
 * currently get.
 *
 * Also the concurrency token. An editor's create or save names the revision they
 * were looking at, so a second tab that started from the same base is refused
 * rather than silently building on work it never saw.
 */
export async function effectiveEditorialRevision(
  db: Db,
  editionId: string,
  /** The edition's published pointer, when the caller already read it. */
  known?: { publishedRevisionId: string | null },
): Promise<EffectiveRevision> {
  const draft = await db.revision.findFirst({
    where: { editionId, status: "DRAFT" },
    orderBy: { number: "desc" },
    select: { id: true },
  });
  if (draft) return { revisionId: draft.id, isDraft: true, editionId };

  const publishedRevisionId =
    known?.publishedRevisionId ??
    (
      await db.edition.findUnique({
        where: { id: editionId },
        select: { publishedRevisionId: true },
      })
    )?.publishedRevisionId ??
    null;
  if (!publishedRevisionId) {
    throw new NotFoundException({ code: "CONTENT_NO_BASE_REVISION" });
  }
  return { revisionId: publishedRevisionId, isDraft: false, editionId };
}

/** The edition serving a book, found by slug rather than by key shape (#648). */
export async function editionForBookSlug(db: Db, bookSlug: string) {
  const edition = await db.edition.findFirst({
    where: { slug: bookSlug },
    select: { id: true, publishedRevisionId: true },
  });
  if (!edition) {
    throw new NotFoundException({ code: "CONTENT_EDITION_NOT_FOUND" });
  }
  return edition;
}

export interface EditorialChapter {
  order: number;
  title: string;
  unitKey: string;
  /** Null for a legacy chapter Content Core never ingested. */
  contentUnitId: string | null;
  /**
   * Whether this chapter exists in the revision being edited.
   *
   * False only for a legacy chapter the backfill never took in. It is still
   * listed because readers can still open it — hiding it would be the worse
   * failure — but nothing here can edit it until it is ingested.
   */
  ingested: boolean;
  partNumber: number | null;
  partTitle: string | null;
  /** Never published, so it can still be discarded. */
  isNewDraftChapter: boolean;
  /**
   * Whether this chapter's title can be edited here.
   *
   * False for a chapter that still has a legacy `Chapter` row: its title is
   * read from that row by surfaces this phase has not touched, and a title that
   * changed in some places and not others is worse than one that cannot change
   * yet.
   */
  titleEditable: boolean;
  /**
   * Whether the media administration surface applies.
   *
   * The chapter media catalog is still keyed to the legacy chapter world, so a
   * native chapter has nothing for it to administer. Saying so is honest; a
   * media panel that errored would not be.
   */
  mediaAdminAvailable: boolean;
}

/**
 * The book's chapters as the EDITOR sees them.
 *
 * The MANIFEST decides the order. Deliberately not "legacy chapters, plus native
 * ones appended": that would give a book two competing orders, and the manifest
 * is the one a reader navigates.
 *
 * Legacy rows are consulted for two things only — whether a chapter's title is
 * still theirs, and whether one of them never made it into Content Core at all.
 * The second is the awkward case, and it is listed rather than hidden: see below.
 */
export async function listEditorialChapters(
  db: Db,
  input: { bookId: string; bookSlug: string },
): Promise<{ chapters: EditorialChapter[]; effective: EffectiveRevision }> {
  const edition = await editionForBookSlug(db, input.bookSlug);
  const effective = await effectiveEditorialRevision(db, edition.id, edition);

  const entries = await db.revisionUnit.findMany({
    where: { revisionId: effective.revisionId },
    orderBy: { order: "asc" },
    select: {
      order: true,
      partNumber: true,
      partTitle: true,
      unit: { select: { id: true, unitKey: true } },
      unitVersion: { select: { title: true } },
    },
  });

  // Which of these the reader can already see. A unit absent from the published
  // manifest has never been published, which is what makes it discardable.
  const publishedUnitIds = edition.publishedRevisionId
    ? new Set(
        (
          await db.revisionUnit.findMany({
            where: { revisionId: edition.publishedRevisionId },
            select: { unitId: true },
          })
        ).map((r) => r.unitId),
      )
    : new Set<string>();

  // Legacy chapters of this book — asked two things: which positions are still
  // theirs, and whether any of them is missing from the manifest entirely.
  const legacyChapters = await db.chapter.findMany({
    where: { bookId: input.bookId },
    orderBy: { order: "asc" },
    select: { id: true, order: true, title: true },
  });
  const legacyOrders = new Set(legacyChapters.map((c) => c.order));

  const chapters: EditorialChapter[] = entries.map((e) => {
    const legacyBacked = legacyOrders.has(e.order);
    return {
      order: e.order,
      title: e.unitVersion.title,
      unitKey: e.unit.unitKey,
      contentUnitId: e.unit.id,
      ingested: true,
      partNumber: e.partNumber,
      partTitle: e.partTitle,
      isNewDraftChapter: effective.isDraft && !publishedUnitIds.has(e.unit.id),
      titleEditable: !legacyBacked,
      mediaAdminAvailable: legacyBacked,
    };
  });

  // A legacy chapter the backfill never took in. The reader resolves legacy
  // chapters from `Chapter` directly, so this one IS readable — leaving it out
  // of the editor would hide published content rather than merely fail to open
  // it. Listed, and honest about not being editable yet.
  const placed = new Set(entries.map((e) => e.order));
  for (const c of legacyChapters) {
    if (placed.has(c.order)) continue;
    chapters.push({
      order: c.order,
      title: c.title,
      // The key it WOULD have once ingested, so a `changed` lookup still lines
      // up rather than silently missing.
      unitKey: unitKeyFromLegacyChapterId(c.id),
      contentUnitId: null,
      ingested: false,
      partNumber: null,
      partTitle: null,
      isNewDraftChapter: false,
      titleEditable: false,
      mediaAdminAvailable: true,
    });
  }
  chapters.sort((a, b) => a.order - b.order);

  return { chapters, effective };
}

export interface ResolvedEditorialChapter {
  unitKey: string;
  contentUnitId: string | null;
  ingested: boolean;
  order: number;
  title: string;
  partNumber: number | null;
  partTitle: string | null;
  titleEditable: boolean;
  mediaAdminAvailable: boolean;
  isNewDraftChapter: boolean;
}

/**
 * One chapter, by position, as the editor sees it.
 *
 * Works identically whether the chapter has a legacy row or not, because it
 * asks the manifest rather than the `Chapter` table. That is what lets a newly
 * created chapter be opened in the editor the moment it exists.
 */
export async function resolveEditorialChapter(
  db: Db,
  input: { bookId: string; bookSlug: string; order: number },
): Promise<ResolvedEditorialChapter | null> {
  const { chapters } = await listEditorialChapters(db, input);
  return chapters.find((c) => c.order === input.order) ?? null;
}

/**
 * Where a new chapter goes, and which part it belongs to.
 *
 * The order comes from the manifest the editor is looking at — never from
 * `Book.totalChapters` or a `Chapter` count, both of which are stale on a book
 * that already has a native chapter.
 *
 * The part is inherited from whatever currently sits last. Phase A has no part
 * editor, and the alternative — leaving it null — would silently drop the new
 * chapter outside the book's final part.
 */
export async function appendPlacement(
  db: Db,
  revisionId: string,
): Promise<{
  order: number;
  partNumber: number | null;
  partTitle: string | null;
}> {
  const last = await db.revisionUnit.findFirst({
    where: { revisionId },
    orderBy: { order: "desc" },
    select: { order: true, partNumber: true, partTitle: true },
  });
  if (!last) return { order: 1, partNumber: null, partTitle: null };
  return {
    order: last.order + 1,
    partNumber: last.partNumber,
    partTitle: last.partTitle,
  };
}

/**
 * The scaffold a new chapter starts from.
 *
 * One empty paragraph, because a unit with no blocks cannot be saved. It is
 * deliberately empty rather than seeded with placeholder prose: publishing
 * would otherwise ship "Escribe aquí…" to a reader, and the publish guard
 * refuses an all-blank chapter precisely so that cannot happen by accident.
 */
export const NEW_CHAPTER_SCAFFOLD = [
  { kind: "PARAGRAPH", content: "" },
] as const;

/**
 * Is this draft chapter publishable?
 *
 * Only asked of units the reader has never seen. An existing published chapter
 * is not subjected to a new rule retroactively — that would turn a save into a
 * migration of somebody else's content.
 */
export function hasPublishableContent(input: {
  title: string;
  blocks: Array<{ kind: string; content: string }>;
}): boolean {
  if (input.title.trim().length === 0) return false;
  return input.blocks.some(
    (b) => b.kind !== "IMAGE" && b.content.trim().length > 0,
  );
}
