import type { PrismaClient } from "@prisma/client";

/**
 * Has this book ever published a chapter into a different position?
 *
 * The question a position-only write cannot answer for itself. An old client —
 * one from before stable reader identities — sends `complete(position=1)` and
 * nothing else. That was safe for as long as position 1 had only ever meant one
 * chapter. Once a reorder ships, a tab opened this morning may mean the chapter
 * that USED to be at 1, and the server has no way to tell which. Guessing picks
 * between telling a reader they finished a chapter they never opened and
 * silently discarding their progress, so it does neither.
 *
 * ── Derived from history, not from a flag ────────────────────────────────
 *
 * Published revisions are immutable and are never deleted, so they already
 * record every structure the book has ever offered. Asking them directly means
 * there is no column to set, no backfill for books that moved before this code
 * existed, and no way for the answer to drift from what actually happened.
 *
 * Keyed on `publishedAt` rather than `status`: publication is the event that
 * exposed a structure to readers, and it is what makes an ancient client
 * possible. A revision that was published and later archived still happened.
 *
 * ── Monotonic on purpose ─────────────────────────────────────────────────
 *
 * Reordering back to the original order does NOT make position-only writes safe
 * again — both structures are in the history, and the tab that predates all of
 * this is still out there. The only thing that would restore the guarantee is
 * knowing which chapter the client meant, and that is what the stable
 * `chapterId` / `contentUnitId` payloads are for.
 *
 * Append-only publishing stays safe: adding a chapter puts one new identity at
 * one new position, and no existing identity moves.
 */

/** True when any unit appears at two different orders. Pure. */
export function anyUnitMoved(
  rows: Array<{ unitId: string; order: number }>,
): boolean {
  const firstSeen = new Map<string, number>();
  for (const r of rows) {
    const before = firstSeen.get(r.unitId);
    if (before === undefined) firstSeen.set(r.unitId, r.order);
    else if (before !== r.order) return true;
  }
  return false;
}

type Db = Pick<PrismaClient, "edition" | "revisionUnit">;

export async function publishedStructureHasMoved(
  db: Db,
  bookSlug: string,
): Promise<boolean> {
  const edition = await db.edition.findFirst({
    where: { slug: bookSlug },
    select: { id: true },
  });
  // A book Content Core never took over has no manifest, so nothing has ever
  // moved and the old positional behaviour is exactly as safe as it was.
  if (!edition) return false;

  const rows = await db.revisionUnit.findMany({
    where: { revision: { editionId: edition.id, publishedAt: { not: null } } },
    select: { unitId: true, order: true },
  });
  return anyUnitMoved(rows);
}
