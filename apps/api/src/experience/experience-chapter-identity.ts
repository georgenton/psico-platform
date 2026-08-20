import type { Prisma } from "@prisma/client";

import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";

/**
 * C.3A (#639) — the ONE place a chapter experience learns which chapter it is
 * really in.
 *
 * `ChapterExperienceVersion` has always been anchored on `(bookSlug,
 * chapterOrder)`, and ADR 0022 §10 named that for what it is: a locator, not an
 * identity. `chapterOrder` is placement, placement lives on `RevisionUnit`, and
 * Content Studio's reorder moves it. A lock or a reservation keyed on a value
 * that moves would protect a position rather than a chapter.
 *
 * So every binding mutation resolves `ContentUnit.id` FIRST — before the lock,
 * before any insert, update, release or status change — and refuses to act when
 * it cannot. There is no fallback to `chapterOrder`: falling back would mean
 * the guard is strongest exactly when the data is healthiest and absent when it
 * is not.
 *
 * ── The chapter classes this has to survive ──────────────────────────────────
 *
 * `resolveLegacyPlacement` already names them, and they are not three:
 *
 *   manifest              adopted and placed in the published revision. The one
 *                         class a binding may be written against.
 *   native                Content Core-only, no legacy `Chapter` row. Placed in
 *                         the manifest and resolvable by order.
 *   adopted-unpublished   the unit exists, the published revision does not
 *                         place it. Outside the structure a reader sees.
 *   unsynced-legacy       never adopted; there is no `ContentUnit` at all.
 *   displaced-legacy      never adopted, and its position is already claimed.
 *
 * Only the first two resolve. The rest are refusals with distinct reasons kept
 * apart internally and collapsed to one canonical code outward — an editor
 * needs to know the chapter cannot host a binding, not which of the five ways
 * it got there.
 *
 * ── The browser is never the authority ───────────────────────────────────────
 *
 * A `contentUnitId` arriving from Content Studio is a hint. This resolver
 * re-derives it from the manifest and compares; a mismatch is a refusal, not a
 * correction. Trusting it would let a client bind an experience into a chapter
 * it never opened.
 *
 * ── Resolving is not enough: it has to STAY resolved ─────────────────────────
 *
 * Reading the manifest tells you which unit sits at that position now. It says
 * nothing about whether it still will a millisecond later, and "later" here
 * means "while the binding is being written". A publish or a reorder landing in
 * that gap leaves a row whose columns name the unit that USED to be there.
 *
 * Content Core already has the mechanism for this and it is not an advisory
 * lock: every editorial write — `publishDraftRevision`, `reorderDraftManifest`,
 * `discardDraftUnit`, `saveUnitDraft`, `ingestUnitV2` — opens by taking
 * `SELECT … FROM "Edition" … FOR UPDATE` (`lockEditionTx`,
 * `lockEditionForBookSlugTx`). A binding write joins that protocol by taking
 * the SAME row lock, by slug, before it reads the manifest. Then a concurrent
 * reorder either commits first and the binder reads its result, or waits — a
 * serialised outcome either way, never a binding onto the wrong unit.
 *
 * Reads do NOT take it. A list rendered from a manifest that changed a moment
 * ago is stale, not wrong, and serialising every admin read against every
 * publish would be a real cost for no guarantee. Which is why the mode is an
 * explicit argument at each call site rather than a default anybody can
 * inherit by accident.
 *
 * ORDER, for the whole family: `global advisory → Edition FOR UPDATE → chapter
 * advisory`. The C.3B backfill takes the global key and then edition locks, so
 * it agrees; Content Studio takes only the edition lock, so it can never wait
 * on anything this file takes. No pair can build a cycle.
 */

/** The one code the outside world sees when a chapter cannot host a binding. */
export const EXPERIENCE_CHAPTER_IDENTITY_UNRESOLVED =
  "EXPERIENCE_CHAPTER_IDENTITY_UNRESOLVED";

/**
 * Why it did not resolve. Kept for logs and tests, never for the wire: five
 * distinguishable failures would let a caller enumerate a book's structure.
 */
export type ChapterIdentityRefusal =
  | "NO_EDITION"
  | "NO_PUBLISHED_REVISION"
  | "NOT_PLACED"
  | "UNSYNCED_LEGACY"
  | "CLIENT_MISMATCH";

export interface ResolvedChapterIdentity {
  contentUnitId: string;
  unitKey: string;
  editionId: string;
  /**
   * Placement at the time of resolution — reported, never used as identity.
   *
   * `null` when the answer did not come from placement at all: a row that
   * already carries its unit is resolved from that unit, and where it currently
   * sits is not part of the answer.
   */
  order: number | null;
}

/**
 * Whether this resolution has to survive a concurrent publish or reorder.
 *
 * `for-update` joins Content Core's edition-lock protocol; `none` reads without
 * serialising. Never defaulted: the difference between the two is the whole
 * TOCTOU, and a default is how a write path quietly inherits the read path's
 * guarantee.
 */
export type ChapterIdentityLockMode = "for-update" | "none";

export class ChapterIdentityError extends Error {
  readonly code = EXPERIENCE_CHAPTER_IDENTITY_UNRESOLVED;
  constructor(readonly reason: ChapterIdentityRefusal) {
    // The message IS the code: a refusal must not carry a book's structure.
    super(EXPERIENCE_CHAPTER_IDENTITY_UNRESOLVED);
    this.name = "ChapterIdentityError";
  }
}

type IdentityDb = Pick<
  Prisma.TransactionClient,
  "edition" | "contentUnit" | "revisionUnit" | "book" | "chapter" | "$queryRaw"
>;

/**
 * The edition serving a book, locked for the rest of the transaction.
 *
 * The same row, by the same predicate, that `lockEditionForBookSlugTx` locks
 * for chapter writers and `lockEditionTx` locks by id for manifest writers.
 * One statement rather than find-then-lock: two would leave a gap between
 * learning the id and holding the row, which is the gap this exists to close.
 */
async function lockEditionBySlug(
  db: IdentityDb,
  bookSlug: string,
): Promise<{ id: string; publishedRevisionId: string | null } | null> {
  const rows = await db.$queryRaw<
    Array<{ id: string; publishedRevisionId: string | null }>
  >`SELECT "id", "publishedRevisionId" FROM "Edition" WHERE "slug" = ${bookSlug} FOR UPDATE`;
  return rows[0] ?? null;
}

/**
 * `(bookSlug, chapterOrder)` → the stable unit, or a refusal.
 *
 * Resolution runs through the PUBLISHED manifest, which is the structure a
 * reader actually navigates (B.B1, Model A). A chapter an editor removed from
 * the structure resolves to nothing here even though its unit still exists —
 * binding an experience into it would publish something no reader can reach.
 *
 * `expectedContentUnitId` is the client's hint. When present it must match what
 * the manifest says; it never replaces the lookup.
 */
export async function resolveChapterIdentity(
  db: IdentityDb,
  input: {
    bookSlug: string;
    chapterOrder: number;
    expectedContentUnitId?: string | null;
    /** See `ChapterIdentityLockMode`. Required — never inferred. */
    lock: ChapterIdentityLockMode;
  },
): Promise<ResolvedChapterIdentity> {
  // The lock comes FIRST, before the manifest is read, or it would be closing
  // the door behind the answer.
  const edition =
    input.lock === "for-update"
      ? await lockEditionBySlug(db, input.bookSlug)
      : await db.edition.findFirst({
          where: { slug: input.bookSlug },
          select: { id: true, publishedRevisionId: true },
        });
  if (!edition) throw new ChapterIdentityError("NO_EDITION");
  if (!edition.publishedRevisionId) {
    throw new ChapterIdentityError("NO_PUBLISHED_REVISION");
  }

  // The manifest owns placement, for native and legacy-backed units alike. A
  // legacy `Chapter.order` is deliberately not consulted: it is the fallback
  // for unadopted rows, and an unadopted row cannot host a binding anyway.
  const placed = await db.revisionUnit.findFirst({
    where: {
      revisionId: edition.publishedRevisionId,
      order: input.chapterOrder,
    },
    select: { order: true, unit: { select: { id: true, unitKey: true } } },
  });
  if (!placed) {
    // Nothing at that position in the published structure. Tell the two cases
    // apart internally: a legacy chapter that was never adopted is a different
    // editorial situation from an empty slot, even though both refuse.
    const book = await db.book.findUnique({
      where: { slug: input.bookSlug },
      select: { id: true },
    });
    const legacy = book
      ? await db.chapter.findFirst({
          where: { bookId: book.id, order: input.chapterOrder },
          select: { id: true },
        })
      : null;
    throw new ChapterIdentityError(legacy ? "UNSYNCED_LEGACY" : "NOT_PLACED");
  }

  if (
    input.expectedContentUnitId != null &&
    input.expectedContentUnitId !== placed.unit.id
  ) {
    throw new ChapterIdentityError("CLIENT_MISMATCH");
  }

  return {
    contentUnitId: placed.unit.id,
    unitKey: placed.unit.unitKey,
    editionId: edition.id,
    order: placed.order,
  };
}

/**
 * A unit that is ALREADY known → the same identity object, without resolving.
 *
 * ── Why an existing row must not be resolved by position ────────────────────
 *
 * `(bookSlug, chapterOrder)` on a stored row is the position it was created at,
 * and nothing in this codebase updates it. So after a reorder, resolving a
 * saved draft by its own columns would answer with whatever unit inherited that
 * number — and the save would quietly move the row into a different chapter,
 * taking its reservation with it. A save is not a move.
 *
 * A row that carries `contentUnitId` therefore IS its own answer. Nothing is
 * re-derived, because there is nothing a concurrent reorder could change: the
 * value is already fixed. That is also why this path takes no edition lock —
 * the lock exists to make a POSITION stop moving while it is read, and this
 * reads no position.
 *
 * Placement is deliberately not required. A chapter an editor removed from the
 * published structure cannot be RESOLVED into, but a row that already lives
 * there must still be saveable and archivable; refusing would strand it.
 */
export async function resolveUnitIdentity(
  db: IdentityDb,
  input: { contentUnitId: string; expectedContentUnitId?: string | null },
): Promise<ResolvedChapterIdentity> {
  if (
    input.expectedContentUnitId != null &&
    input.expectedContentUnitId !== input.contentUnitId
  ) {
    throw new ChapterIdentityError("CLIENT_MISMATCH");
  }
  const unit = await db.contentUnit.findUnique({
    where: { id: input.contentUnitId },
    select: { id: true, unitKey: true, editionId: true },
  });
  // The direct foreign key makes this unreachable while it exists. Checked
  // anyway: a refusal is a better answer than a write against a unit nobody
  // can name.
  if (!unit) throw new ChapterIdentityError("NOT_PLACED");
  return {
    contentUnitId: unit.id,
    unitKey: unit.unitKey,
    editionId: unit.editionId,
    order: null,
  };
}

/**
 * Is this unit the one a legacy `Chapter` row became?
 *
 * Exported because the backfill needs the same answer from the other side —
 * starting from a stored `(bookSlug, chapterOrder)` whose legacy chapter may
 * still exist — and two derivations of "same chapter" would be one derivation
 * too many.
 */
export function unitKeyForLegacyChapter(chapterId: string): string {
  return unitKeyFromLegacyChapterId(chapterId);
}
