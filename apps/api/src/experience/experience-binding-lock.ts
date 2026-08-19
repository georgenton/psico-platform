import type { Prisma } from "@prisma/client";

/**
 * C.3A (#639) — the lock protocol for guide bindings, and the reason it has
 * two keys rather than one.
 *
 * ── Why a chapter lock and not a guide lock ─────────────────────────────────
 *
 * The rule being protected is a partial bijection inside one chapter: an
 * experience owns at most one guide, and a guide belongs to at most one
 * experience. A lock keyed on `guideKey` alone protects only the second half —
 * two commands moving the SAME experience onto two DIFFERENT guides would hash
 * to different keys and never meet. Keying on the chapter serialises every
 * binding decision that could interact, and leaves different chapters running
 * in parallel, which is what makes the cost acceptable: these are infrequent
 * editorial writes, not a reader path.
 *
 * ── Why a global compatibility lock exists at all ───────────────────────────
 *
 * The same reason C.0A carried one. During the C.3A rollout the previous binary
 * is still writing `ChapterExperienceVersion` rows with no reservation and no
 * lock, and the C.3B backfill has to read every row and materialise reservations
 * without a writer slipping in between. The backfill takes this key first; every
 * bridge writer takes it too, so the backfill genuinely excludes them. It buys
 * nothing against V0 — V0 takes no lock at all — which is precisely why C.3B
 * may only run once V0 is extinct.
 *
 * V2 will stop taking it and keep the chapter lock, exactly as C.0B3 narrowed
 * the start lock. The two protocols therefore still share a key for the same
 * chapter, which is what makes a mixed V1/V2 fleet safe.
 *
 * ── Order ───────────────────────────────────────────────────────────────────
 *
 * Always `global → chapter`. A total order is what makes a deadlock impossible;
 * a pair acquiring them the other way round could build a cycle with a pair
 * acquiring them this way.
 */

/** The protocol this binary speaks, surfaced at boot so a fleet can be PROVEN
 * drained rather than inferred from a commit SHA. */
export const EXPERIENCE_BINDING_PROTOCOL = "experience-binding-bridge-v1";

/**
 * The compatibility key, shared with the C.3B backfill.
 *
 * One key for the whole surface on purpose: the backfill reads every row of
 * every chapter, so a per-chapter exclusion would not exclude it.
 */
export const globalBindingLockKey = (): string => "experience:binding:global";

/**
 * The chapter key, shared with the future V2 binary.
 *
 * Derived from the STABLE unit id, never from `(bookSlug, chapterOrder)`: a key
 * built on placement would stop protecting a chapter the moment an editor
 * reordered the book.
 */
export const chapterBindingLockKey = (contentUnitId: string): string =>
  `experience:binding:chapter:${contentUnitId}`;

/**
 * THE bridge sequence, in acquisition order.
 *
 * Single authority: the service iterates this, the pg-specs model the protocol
 * with this, and the negative controls mutate THIS — so emptying it, dropping
 * the global key or swapping the order breaks the guarantee everywhere at once
 * instead of in one forgotten caller.
 */
export const bridgeBindingLockKeys = (
  contentUnitId: string,
): readonly string[] => [
  globalBindingLockKey(),
  chapterBindingLockKey(contentUnitId),
];

/**
 * Take one advisory lock for the rest of the transaction.
 *
 * `hashtextextended(key, 42)` and the xact-scoped variant are the same pair the
 * Guide lifecycle uses. The seed is part of the protocol, not a detail: two
 * binaries only serialise against each other if they hash the same string with
 * the same seed.
 */
export async function acquireBindingLock(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 42))`;
}

/** Acquire a sequence in order. Order is the argument; the loop is the proof. */
export async function acquireBindingLocks(
  tx: Prisma.TransactionClient,
  keys: readonly string[],
): Promise<void> {
  for (const key of keys) await acquireBindingLock(tx, key);
}
