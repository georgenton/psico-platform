import type { PrismaClient } from "@prisma/client";
import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";

/**
 * Where a legacy chapter actually sits, now.
 *
 * Phase B.A made chapter IDENTITY stable. Position was left alone, and it has
 * two owners: `Chapter.order` for legacy rows and `RevisionUnit.order` for the
 * manifest. That was harmless only because nothing could move a chapter yet.
 *
 * Phase B.B chose the manifest (Model A). Once reorder exists it will change
 * placements and leave `Chapter.order` untouched — so any code still reading
 * that column would report a position the book no longer has. This resolver is
 * how legacy chapters stop depending on it.
 *
 * ── Adoption is an identity question, never a positional one ──────────────
 *
 * A legacy chapter is adopted when this edition holds the `ContentUnit` whose
 * key is `uuidv5(chapter.id)` — the same derivation the backfill used. Matching
 * on "same order" would be exactly the assumption this work removes.
 *
 * Three states, deliberately kept apart:
 *
 *   manifest             adopted, and placed in the published revision.
 *                        The placement owns order, partNumber, partTitle.
 *
 *   unsynced-legacy      no ContentUnit at all. Pre-adoption content, still
 *                        served the old way. `Chapter.order` is its only
 *                        answer, and remains valid for exactly this case.
 *
 *   adopted-unpublished  the unit exists but the published revision does not
 *                        place it — a chapter discarded from the structure.
 *                        NOT the same as unsynced: reviving it from a stale
 *                        `Chapter.order` would put content back in a book an
 *                        editor deliberately took it out of.
 *
 *   displaced-legacy     never adopted, and the position it claims is already
 *                        named by the published manifest. `Chapter.order` is
 *                        the fallback answer, and a fallback does not get to
 *                        overrule the thing it falls back FROM. Every list of
 *                        the book excludes it, so serving it by id would make
 *                        the canonical route the one surface that disagrees.
 *
 * The last two differ in how they got there and are worth telling apart when
 * reading logs, but they mean the same thing to a caller: not part of the
 * published structure. Ask `isOutsidePublishedStructure` rather than matching
 * one of them and forgetting the other.
 */

export type LegacyPlacement =
  | {
      source: "manifest";
      chapterId: string;
      contentUnitId: string;
      unitKey: string;
      editionKey: string;
      order: number;
      partNumber: number | null;
      partTitle: string | null;
      isFreePreview: boolean;
    }
  | {
      source: "unsynced-legacy";
      chapterId: string;
      contentUnitId: null;
      unitKey: string;
      /** `Chapter.order` — the fallback, and only for genuinely unadopted rows. */
      order: number;
      partNumber: number | null;
      partTitle: string | null;
    }
  | {
      source: "adopted-unpublished";
      chapterId: string;
      contentUnitId: string;
      unitKey: string;
    }
  | {
      source: "displaced-legacy";
      chapterId: string;
      contentUnitId: null;
      unitKey: string;
      /** Who the manifest puts there instead. Kept for diagnosis. */
      occupiedOrder: number;
    };

/**
 * Is this chapter absent from the book the reader can actually see?
 *
 * True for both "adopted then removed" and "never adopted, and outranked".
 * Callers that serve or write content should refuse on this, not on one
 * specific `source` — the two states arrive by different routes and a check
 * that names only one silently permits the other.
 */
export function isOutsidePublishedStructure(
  p: LegacyPlacement,
): p is Extract<
  LegacyPlacement,
  { source: "adopted-unpublished" | "displaced-legacy" }
> {
  return p.source === "adopted-unpublished" || p.source === "displaced-legacy";
}

type Db = Pick<PrismaClient, "edition" | "contentUnit" | "revisionUnit">;

/** A legacy chapter as its caller already loaded it. */
export interface LegacyChapterRow {
  id: string;
  order: number;
  partNumber?: number | null;
  partTitle?: string | null;
}

export async function resolveLegacyPlacement(
  db: Db,
  input: { bookSlug: string; chapter: LegacyChapterRow },
): Promise<LegacyPlacement> {
  const unitKey = unitKeyFromLegacyChapterId(input.chapter.id);

  const edition = await db.edition.findFirst({
    where: { slug: input.bookSlug },
    select: { id: true, editionKey: true, publishedRevisionId: true },
  });

  const unit = edition
    ? await db.contentUnit.findUnique({
        where: {
          editionId_unitKey: { editionId: edition.id, unitKey },
        },
        select: { id: true, isFreePreview: true },
      })
    : null;

  // Never adopted. The old column is still the truth for this chapter — unless
  // the published manifest has already spoken for that position.
  if (!unit) {
    if (edition?.publishedRevisionId) {
      const occupant = await db.revisionUnit.findFirst({
        where: {
          revisionId: edition.publishedRevisionId,
          order: input.chapter.order,
        },
        select: { order: true },
      });
      if (occupant) {
        return {
          source: "displaced-legacy",
          chapterId: input.chapter.id,
          contentUnitId: null,
          unitKey,
          occupiedOrder: occupant.order,
        };
      }
    }
    return {
      source: "unsynced-legacy",
      chapterId: input.chapter.id,
      contentUnitId: null,
      unitKey,
      order: input.chapter.order,
      partNumber: input.chapter.partNumber ?? null,
      partTitle: input.chapter.partTitle ?? null,
    };
  }

  const placement = edition?.publishedRevisionId
    ? await db.revisionUnit.findFirst({
        where: {
          revisionId: edition.publishedRevisionId,
          unitId: unit.id,
        },
        select: { order: true, partNumber: true, partTitle: true },
      })
    : null;

  // Adopted, but the published structure does not include it.
  if (!placement) {
    return {
      source: "adopted-unpublished",
      chapterId: input.chapter.id,
      contentUnitId: unit.id,
      unitKey,
    };
  }

  return {
    source: "manifest",
    chapterId: input.chapter.id,
    contentUnitId: unit.id,
    unitKey,
    editionKey: edition!.editionKey,
    order: placement.order,
    partNumber: placement.partNumber,
    partTitle: placement.partTitle,
    // Entitlement belongs to the chapter, not to where it sits. A chapter
    // moved out of position 1 must not lose its free preview, and one moved
    // into position 1 must not gain one.
    isFreePreview: unit.isFreePreview,
  };
}

/**
 * Which legacy chapter, if any, backs each unit key in a book.
 *
 * `unitKey` is `uuidv5(chapter.id)` and uuidv5 does not invert, so going from a
 * placement back to its legacy chapter means deriving the key for each of the
 * book's chapters and matching. One query, and the book's chapter list is small.
 *
 * This is what lets positional resolution start from the manifest and still
 * hand back a legacy `readerRef`: the placement decides WHERE, the derived key
 * decides WHICH identity serves it.
 */
export function legacyChaptersByUnitKey<T extends { id: string }>(
  chapters: T[],
): Map<string, T> {
  const byKey = new Map<string, T>();
  for (const ch of chapters) {
    byKey.set(unitKeyFromLegacyChapterId(ch.id), ch);
  }
  return byKey;
}
