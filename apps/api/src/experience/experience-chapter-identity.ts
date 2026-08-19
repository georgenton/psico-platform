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
  /** Placement at the time of resolution — reported, never used as identity. */
  order: number;
}

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
  "edition" | "contentUnit" | "revisionUnit" | "book" | "chapter"
>;

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
  },
): Promise<ResolvedChapterIdentity> {
  const edition = await db.edition.findFirst({
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
