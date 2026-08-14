import { randomUUID } from "node:crypto";
import { NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
// The adoption rule moved down to Content Core, where identity is defined, so
// the reorder write can enforce it without Content Core importing this module.
// Re-exported because it is still part of this module's vocabulary.
import { relateLegacyToManifest } from "../content-core/lib/legacy-adoption";

export { relateLegacyToManifest };

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
    // `accessPlan` decides whether Content Core owns this edition's
    // entitlement, which is a precondition for moving chapters at all.
    select: { id: true, publishedRevisionId: true, accessPlan: true },
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
 * Does THIS revision's manifest collide with the book's legacy rows?
 *
 * Takes the revision explicitly rather than resolving one, so a publish can ask
 * about the exact draft it was told to publish instead of whatever happens to
 * be current. Safe to run inside a transaction: it only reads.
 */
export async function structureConflictAtRevision(
  // Only the two tables it reads, so a transaction client satisfies it without
  // pretending to be a whole PrismaClient.
  db: Pick<PrismaClient, "revisionUnit" | "chapter">,
  input: { bookId: string; revisionId: string },
): Promise<boolean> {
  const [entries, legacyChapters] = await Promise.all([
    db.revisionUnit.findMany({
      where: { revisionId: input.revisionId },
      select: { order: true, unit: { select: { unitKey: true } } },
    }),
    db.chapter.findMany({
      where: { bookId: input.bookId },
      select: { id: true, order: true, title: true },
    }),
  ]);

  return relateLegacyToManifest(
    entries.map((e) => ({ order: e.order, unitKey: e.unit.unitKey })),
    legacyChapters,
  ).structureConflict;
}

/**
 * The structure Content Studio is looking at, and what it may do to it.
 *
 * `chapters` is what to draw. The rest is what the SERVER concluded about the
 * book's shape, so the browser never has to derive a rule by scanning rows.
 */
export interface EditorialStructure {
  chapters: EditorialChapter[];
  effective: EffectiveRevision;
  /** Readable legacy chapters absent from the revision being edited. */
  unsyncedLegacyCount: number;
  /**
   * A legacy chapter and a DIFFERENT unit both claim one position.
   *
   * Neither is repaired here. Guessing which one is "really" that chapter is
   * exactly the position-as-identity mistake this file exists to avoid.
   */
  structureConflict: boolean;
  /** Whether a chapter may be created right now. Server-owned; see below. */
  chapterCreationAvailable: boolean;
  /** Why not, as a code the UI turns into copy. Null when creation is fine. */
  creationBlockedReason: "PENDING_SYNC" | null;
  /**
   * Whether the book's chapters may be rearranged right now.
   *
   * Strictly harder than creating one. Appending needs the structure to be
   * synchronised; MOVING also needs Content Core to own entitlement, because an
   * edition with `accessPlan = null` still decides "is this chapter free?" from
   * `Chapter.order` — so moving chapters there would move the free preview with
   * them.
   */
  reorderAvailable: boolean;
  /** Why not. Null when reordering is fine. */
  reorderBlockedReason: "NATIVE_ENTITLEMENT_REQUIRED" | "PENDING_SYNC" | null;
}

/**
 * The book's chapters as the EDITOR sees them.
 *
 * The MANIFEST decides the order. Deliberately not "legacy chapters, plus native
 * ones appended": that would give a book two competing orders, and the manifest
 * is the one a reader navigates.
 *
 * ── Legacy backing is an IDENTITY question ────────────────────────────────
 *
 * Whether a chapter still belongs to a `Chapter` row is decided by matching the
 * unit's key against `unitKeyFromLegacyChapterId(chapter.id)` — never by
 * comparing positions. Position is not identity; #648 and #649 removed that
 * assumption from entitlement and from the reader, and reintroducing it here
 * would let a native unit impersonate a legacy chapter simply by sitting where
 * it used to be.
 *
 * The awkward cases are surfaced rather than smoothed over: a readable legacy
 * chapter missing from the manifest is listed, and a position claimed by both a
 * legacy chapter and a different unit is reported as a conflict.
 */
export async function listEditorialChapters(
  db: Db,
  input: { bookId: string; bookSlug: string },
): Promise<EditorialStructure> {
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

  // EVERY `Chapter` row of the book, not just published ones: the reader
  // resolves a legacy chapter by `(bookId, order)` with no published filter, so
  // any row here can answer for its position.
  const legacyChapters = await db.chapter.findMany({
    where: { bookId: input.bookId },
    orderBy: { order: "asc" },
    select: { id: true, order: true, title: true },
  });
  const relation = relateLegacyToManifest(
    entries.map((e) => ({ order: e.order, unitKey: e.unit.unitKey })),
    legacyChapters,
  );
  const { legacyByUnitKey, structureConflict } = relation;

  const chapters: EditorialChapter[] = entries.map((e) => {
    const legacy = legacyByUnitKey.get(e.unit.unitKey) ?? null;
    return {
      order: e.order,
      title: e.unitVersion.title,
      unitKey: e.unit.unitKey,
      contentUnitId: e.unit.id,
      ingested: true,
      partNumber: e.partNumber,
      partTitle: e.partTitle,
      isNewDraftChapter: effective.isDraft && !publishedUnitIds.has(e.unit.id),
      // Both from the SAME identity answer, so the two can never disagree.
      titleEditable: legacy === null,
      mediaAdminAvailable: legacy !== null,
    };
  });

  // A legacy chapter the backfill never took in. The reader resolves legacy
  // chapters from `Chapter` directly, so this one IS readable — leaving it out
  // of the editor would hide published content rather than merely fail to open
  // it. Listed, and honest about not being editable yet. Where its position is
  // already taken by something that is NOT it, both rows appear at that order:
  // the truth is that two things claim it.
  for (const c of relation.unsynced) {
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
      // Nothing here can administer it either: Content Studio edits units, and
      // this chapter has none yet.
      mediaAdminAvailable: false,
    });
  }
  // Ties are broken toward the manifest so a conflicted position reads in a
  // stable order rather than however the arrays happened to be built.
  chapters.sort(
    (a, b) => a.order - b.order || Number(b.ingested) - Number(a.ingested),
  );

  const unsyncedLegacyCount = relation.unsynced.length;
  // The rule lives here, once. A browser deriving it by scanning `ingested`
  // would be re-implementing a safety check it cannot be trusted with.
  const structureSynced = unsyncedLegacyCount === 0 && !structureConflict;
  const chapterCreationAvailable = structureSynced;
  const nativeEntitlement = edition.accessPlan !== null;

  return {
    chapters,
    effective,
    unsyncedLegacyCount,
    structureConflict,
    chapterCreationAvailable,
    creationBlockedReason: chapterCreationAvailable ? null : "PENDING_SYNC",
    reorderAvailable: structureSynced && nativeEntitlement,
    // Entitlement first: it is the blocker an editor cannot clear by
    // synchronising, so naming the other one would send them down a dead end.
    reorderBlockedReason: !nativeEntitlement
      ? "NATIVE_ENTITLEMENT_REQUIRED"
      : structureSynced
        ? null
        : "PENDING_SYNC",
  };
}

/**
 * The structural state a create is refused in.
 *
 * A readable legacy chapter that Content Core has not adopted still answers for
 * its position, so appending after the manifest can land a new chapter exactly
 * where that legacy one already is — and the reader, which tries legacy first,
 * would serve the old chapter forever while the editor believed they had
 * published a new one. Refused before anything is minted.
 */
export const CONTENT_STRUCTURE_REQUIRES_SYNC =
  "CONTENT_STRUCTURE_REQUIRES_SYNC";

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
