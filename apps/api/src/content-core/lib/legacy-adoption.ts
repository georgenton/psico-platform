import type { PrismaClient } from "@prisma/client";
import { unitKeyFromLegacyChapterId } from "./block-key";

/**
 * How a revision's manifest and a book's legacy `Chapter` rows relate.
 *
 * Lives here, at the bottom of Content Core, because it is a question about
 * Content Core identity: a legacy chapter is adopted when this edition holds
 * the unit whose key is `uuidv5(chapter.id)`. It was written in Content Studio
 * when Content Studio was its only caller, but the reorder WRITE has to ask the
 * same question inside its own transaction — and Content Core importing Content
 * Studio to find out would invert the dependency between them.
 *
 * Content Studio re-exports it, so there is still exactly one definition of
 * adoption and no caller has to know it moved.
 */

/**
 * The ONE place identity is compared. The editorial list, the publish guard and
 * the reorder gate all call this, so there is a single answer to "is this unit
 * that chapter?" — and it is always the derived key, never the position.
 *
 * Pure, so the rule can be exercised without a database.
 */
export function relateLegacyToManifest(
  entries: Array<{ order: number; unitKey: string }>,
  legacyChapters: Array<{ id: string; order: number; title: string }>,
) {
  const manifestKeys = new Set(entries.map((e) => e.unitKey));
  const manifestOrders = new Set(entries.map((e) => e.order));

  const legacyByUnitKey = new Map(
    legacyChapters.map((c) => [unitKeyFromLegacyChapterId(c.id), c]),
  );
  const unsynced = legacyChapters.filter(
    (c) => !manifestKeys.has(unitKeyFromLegacyChapterId(c.id)),
  );
  // A conflict is narrower than "something is unsynced": it is a position that
  // TWO different things answer for. An unsynced chapter sitting at a position
  // nothing else claims is merely not adopted yet.
  const structureConflict = unsynced.some((c) => manifestOrders.has(c.order));

  return { legacyByUnitKey, unsynced, structureConflict };
}

export interface ReorderEligibility {
  fullyAdopted: boolean;
  unsyncedLegacyCount: number;
  structureConflict: boolean;
}

/**
 * May this book's chapters be rearranged, judged against an EXACT revision?
 *
 * Takes the revision explicitly rather than resolving one, so the reorder
 * transaction can ask about the precise base it is about to build on instead of
 * whatever happens to be current — and so the answer cannot change between
 * being computed and being used.
 *
 * ── Stricter than the publish guard, deliberately ─────────────────────────
 *
 * Publishing tolerates an unadopted legacy chapter as long as it sits where the
 * manifest claims nothing: it shadows no one, and freezing every text edit on a
 * part-migrated book would cost more than it buys. Reorder cannot be that
 * relaxed. It rewrites which position each unit holds, so a chapter the
 * manifest does not know about is a chapter whose position the new structure
 * cannot account for — and the reader, which still resolves an unadopted legacy
 * chapter from `Chapter.order`, would be left with two structures disagreeing
 * about the same book.
 *
 * Reads only, so it is safe inside a transaction.
 */
export async function reorderEligibilityAtRevision(
  db: Pick<PrismaClient, "revisionUnit" | "chapter">,
  input: { bookId: string; revisionId: string },
): Promise<ReorderEligibility> {
  const [entries, legacyChapters] = await Promise.all([
    db.revisionUnit.findMany({
      where: { revisionId: input.revisionId },
      select: { order: true, unit: { select: { unitKey: true } } },
    }),
    // EVERY `Chapter` row of the book, published or not: the reader resolves a
    // legacy chapter by `(bookId, order)` with no published filter, so any row
    // here can answer for its position.
    db.chapter.findMany({
      where: { bookId: input.bookId },
      select: { id: true, order: true, title: true },
    }),
  ]);

  const relation = relateLegacyToManifest(
    entries.map((e) => ({ order: e.order, unitKey: e.unit.unitKey })),
    legacyChapters,
  );
  return {
    fullyAdopted: relation.unsynced.length === 0,
    unsyncedLegacyCount: relation.unsynced.length,
    structureConflict: relation.structureConflict,
  };
}
