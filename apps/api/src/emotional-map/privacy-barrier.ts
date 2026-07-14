import type { PrismaClient } from "@prisma/client";

/**
 * PR-0.1 — the barrier that makes a revocation stick.
 *
 * Making `updatePrivacy` atomic closed the SEQUENTIAL hole: a request that
 * starts after the revocation commits reads the new revision and cannot be
 * served the old map. It did nothing about the CONCURRENT one, which is the
 * same bug wearing a different hat:
 *
 *     writer                          revocation
 *     ──────                          ──────────
 *     read consent = true
 *                                     delete DiaryTextFeature
 *                                     delete EmotionalMapSnapshot
 *                                     revision++  ← commits
 *     upsert row  ← RESURRECTED
 *
 * The writer's read was true at the time it happened. Nothing about it was
 * wrong. It just became false while the writer was still in flight, and the
 * write landed on the other side of the deletion. Both writers have this shape:
 * `logTextFeatures` (read consent → upsert) and the snapshot processor (compute
 * → upsert), and the second one holds its stale read across an LLM call, so its
 * window is seconds wide, not microseconds.
 *
 * ── The lock ────────────────────────────────────────────────────────────────
 *
 * We serialize on the USER row, not on `PrivacySettings`.
 *
 * That distinction is the whole design. `PrivacySettings` is created lazily by
 * an upsert, and **you cannot lock a row that does not exist**: `SELECT … FOR
 * UPDATE` over an empty result set locks nothing and returns immediately, so
 * two transactions racing on a user who has never opened their settings would
 * both sail straight through the barrier. `User` always exists — it is the only
 * row we can count on.
 *
 * Postgres row locks, and why these two modes:
 *
 *   - The revocation takes `FOR UPDATE` (exclusive).
 *   - Both writers take `FOR SHARE` (shared).
 *   - `FOR SHARE` conflicts with `FOR UPDATE`, and shares are compatible with
 *     each other. So the two writers never block one another — only a
 *     revocation is serialized against them.
 *
 * Which gives us exactly two orderings, and both are correct:
 *
 *   Writer first → the revocation's FOR UPDATE waits for the writer to commit,
 *                  and then deletes what the writer just wrote. Final state:
 *                  empty. The user's revocation wins.
 *
 *   Revocation first → the writer's FOR SHARE waits for the revocation to
 *                  commit, and then re-reads: consent is false (logTextFeatures
 *                  refuses) or the revision moved (the snapshot is dropped).
 *                  Nothing is written. The user's revocation wins.
 *
 * There is no third ordering. The revoked derivative cannot come back.
 *
 * ── The cost, stated honestly ───────────────────────────────────────────────
 *
 * `FOR SHARE` also conflicts with `FOR NO KEY UPDATE`, which is what a plain
 * `UPDATE "User" SET …` takes. So while a text-feature upload holds its share
 * lock, an unrelated write to the same user's row (a mood update, a streak
 * bump) waits. Those transactions are single-digit milliseconds and scoped to
 * ONE user's row, so this is contention we can pay. It is not a table lock and
 * it never touches another user.
 *
 * Lock ordering is uniform — every path takes the `User` row FIRST, before any
 * other write — so these transactions cannot deadlock against each other.
 */

/** Anything that can run raw SQL: the client, or a transaction handle. */
type Db = Pick<PrismaClient, "$queryRaw">;

/**
 * Exclusive lock on the user row. Taken by the REVOCATION.
 *
 * Blocks — and is blocked by — every writer holding `lockUserShared`. Whoever
 * arrives second waits for the first to commit, which is precisely the point:
 * the two must not interleave.
 */
export async function lockUserExclusive(db: Db, userId: string): Promise<void> {
  await db.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}

/**
 * Shared lock on the user row. Taken by every WRITER of a derived row.
 *
 * Shared locks do not conflict with each other, so concurrent writers proceed
 * in parallel. They conflict with the revocation's exclusive lock, which is the
 * only serialization we actually need.
 */
export async function lockUserShared(db: Db, userId: string): Promise<void> {
  await db.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR SHARE`;
}

/**
 * The durable privacy revision, read from Postgres.
 *
 * Absent settings read as revision 0 — the same value a fresh row is created
 * with, so a user who has never touched their privacy page and a user whose row
 * exists at revision 0 are indistinguishable, as they should be.
 */
export async function readPrivacyRevision(
  db: Pick<PrismaClient, "privacySettings">,
  userId: string,
): Promise<number> {
  const row = await db.privacySettings.findUnique({
    where: { userId },
    select: { emotionalMapPrivacyRevision: true },
  });
  return row?.emotionalMapPrivacyRevision ?? 0;
}
