import { unitKeyFromLegacyChapterId } from "./block-key";

/**
 * Which unit an Exercise belongs to, asked in exactly one place.
 *
 * An exercise is owned by a legacy `Chapter` or by a native `ContentUnit`, and
 * the DB enforces that it is exactly one (`Exercise_one_owner`). Every caller
 * that needs the owning unit — the learning resolver, the batched guide target
 * resolver, the activation planner — used to derive it inline as
 * `uuidv5(exercise.chapterId)`. That inline derivation is what silently assumed
 * every unit came from a chapter, so it lives here now and nowhere else.
 */

export interface ExerciseOwnerColumns {
  chapterId: string | null;
  contentUnitId: string | null;
}

export type ExerciseOwner =
  | { kind: "legacy"; chapterId: string }
  | { kind: "native"; contentUnitId: string };

export const EXERCISE_OWNER_INVALID = "EXERCISE_OWNER_INVALID";

/**
 * The owner, or null when the row does not carry exactly one.
 *
 * Null rather than a throw: the callers are resolvers whose contract is already
 * "unresolved editorial context", and a row violating the CHECK is that, not a
 * crash. The DB should make it unreachable; this is what happens if it ever is.
 */
export function exerciseOwnerOf(
  row: ExerciseOwnerColumns,
): ExerciseOwner | null {
  const hasLegacy = row.chapterId !== null && row.chapterId !== undefined;
  const hasNative =
    row.contentUnitId !== null && row.contentUnitId !== undefined;
  if (hasLegacy === hasNative) return null; // neither, or both
  return hasLegacy
    ? { kind: "legacy", chapterId: row.chapterId as string }
    : { kind: "native", contentUnitId: row.contentUnitId as string };
}

/**
 * A `ContentUnit` where-clause that selects the owning unit.
 *
 * Legacy owners resolve through the canonical key bridge, exactly as before.
 * Native owners resolve by id, which needs no bridge — the exercise already
 * names the unit.
 */
export function exerciseUnitWhere(
  row: ExerciseOwnerColumns,
): { id: string } | { unitKey: string } | null {
  const owner = exerciseOwnerOf(row);
  if (owner === null) return null;
  return owner.kind === "native"
    ? { id: owner.contentUnitId }
    : { unitKey: unitKeyFromLegacyChapterId(owner.chapterId) };
}

/**
 * The unit KEY an exercise resolves to, when the caller already holds every
 * unit of the edition and is matching them in memory rather than querying.
 *
 * Returns null for a native owner: that owner names a unit ID, and inventing a
 * key for it would be the same mistake in a new costume. The batched resolver
 * matches those by id instead.
 */
export function exerciseUnitKey(row: ExerciseOwnerColumns): string | null {
  const owner = exerciseOwnerOf(row);
  return owner !== null && owner.kind === "legacy"
    ? unitKeyFromLegacyChapterId(owner.chapterId)
    : null;
}

/** The columns to write for an owner. Keeps the XOR true by construction. */
export function ownerColumns(owner: ExerciseOwner): ExerciseOwnerColumns {
  return owner.kind === "legacy"
    ? { chapterId: owner.chapterId, contentUnitId: null }
    : { chapterId: null, contentUnitId: owner.contentUnitId };
}

/** Whether two rows name the same owner — used to detect ownership drift. */
export function sameOwner(
  a: ExerciseOwnerColumns,
  b: ExerciseOwnerColumns,
): boolean {
  return (
    (a.chapterId ?? null) === (b.chapterId ?? null) &&
    (a.contentUnitId ?? null) === (b.contentUnitId ?? null)
  );
}
