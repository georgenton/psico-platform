/**
 * Content Core — reordering a manifest (pure).
 *
 * A revision is a snapshot, so reordering does not move anything: it decides
 * what the NEXT snapshot's placements are. Nothing here writes, and nothing
 * here mutates its input — the caller inserts the result as fresh
 * `RevisionUnit` rows with their final orders already correct, which is why
 * reorder needs no parking positions to dodge `@@unique([revisionId, order])`.
 *
 * ── The payload is positions, not identities ──────────────────────────────
 *
 * The browser sends the CURRENT order values of the revision it loaded, in the
 * sequence it wants them. They are locators inside that exact revision and
 * nothing more; the server maps them to stable units itself. That is deliberate
 * — a client that could name `unitId` could also name the wrong one.
 *
 * ── Slots are permuted, never renumbered ──────────────────────────────────
 *
 * Positions are not guaranteed dense: `discardDraftUnit` deliberately leaves a
 * gap rather than shifting every chapter after the discarded one. So the final
 * slot numbers are exactly the current slot numbers, sorted — occupants move
 * between existing slots and the slot set is preserved. Reorder and renumber
 * are different operations, and quietly doing the second inside the first would
 * move chapters the editor never touched.
 *
 *   current 1, 3, 4   payload [4, 1, 3]   →   4→1, 1→3, 3→4
 *
 * ── Parts are a boundary, not a suggestion ────────────────────────────────
 *
 * Moving a chapter between parts is a different editorial act with different
 * consequences, and it is not in this phase. Since every final slot keeps its
 * original part tuple, a chapter crossing a boundary is exactly a chapter whose
 * part tuple disagrees with its destination slot's — checked, and refused.
 */

/** The minimum a manifest row must carry to be placed. */
export interface Placed {
  order: number;
  partNumber: number | null;
  partTitle: string | null;
}

/** Domain failures. Machine-readable, like the rest of Content Core. */
export const CONTENT_REORDER_EMPTY = "CONTENT_REORDER_EMPTY";
export const CONTENT_REORDER_DUPLICATE_ORDER =
  "CONTENT_REORDER_DUPLICATE_ORDER";
export const CONTENT_REORDER_UNKNOWN_ORDER = "CONTENT_REORDER_UNKNOWN_ORDER";
export const CONTENT_REORDER_INCOMPLETE = "CONTENT_REORDER_INCOMPLETE";
export const CONTENT_REORDER_ACROSS_PARTS_UNSUPPORTED =
  "CONTENT_REORDER_ACROSS_PARTS_UNSUPPORTED";

/**
 * Place every entry at the slot the requested sequence gives it.
 *
 * Generic over the row so the caller's own fields — `unitId`, `unitVersionId`,
 * whatever it loaded — are carried through untouched. `order` is the only
 * property this function is capable of changing, which is a stronger guarantee
 * than a comment promising the same thing.
 *
 * The request must name every current position exactly once. Anything else is
 * refused rather than interpreted: a payload missing a position is not an
 * instruction to delete that chapter, and one naming an unknown position is a
 * client working from a revision that is no longer the base.
 */
export function reorderManifest<T extends Placed>(
  entries: T[],
  orderedCurrentOrders: number[],
): T[] {
  if (entries.length === 0) throw new Error(CONTENT_REORDER_EMPTY);

  const byOrder = new Map<number, T>();
  for (const e of entries) byOrder.set(e.order, e);

  const seen = new Set<number>();
  for (const o of orderedCurrentOrders) {
    if (seen.has(o)) throw new Error(CONTENT_REORDER_DUPLICATE_ORDER);
    seen.add(o);
    if (!byOrder.has(o)) throw new Error(CONTENT_REORDER_UNKNOWN_ORDER);
  }
  // Every current position accounted for. With duplicates and unknowns already
  // rejected, equal counts make this a bijection — so a missing position and a
  // surplus one are the same failure, and both mean the client is describing a
  // book that is not the one being reordered.
  if (orderedCurrentOrders.length !== entries.length) {
    throw new Error(CONTENT_REORDER_INCOMPLETE);
  }

  // The slot set, unchanged. Sorted so slot k of the request lands in the k-th
  // smallest existing position rather than in a densified 1..n.
  const slots = entries.map((e) => e.order).sort((a, b) => a - b);

  return orderedCurrentOrders.map((currentOrder, i) => {
    const entry = byOrder.get(currentOrder)!;
    const slot = slots[i]!;
    const destination = byOrder.get(slot)!;
    if (
      entry.partNumber !== destination.partNumber ||
      entry.partTitle !== destination.partTitle
    ) {
      throw new Error(CONTENT_REORDER_ACROSS_PARTS_UNSUPPORTED);
    }
    // The unit keeps its OWN part tuple. Identical to the destination's by the
    // check above, but taking it from the unit says which one is the authority.
    return { ...entry, order: slot };
  });
}
