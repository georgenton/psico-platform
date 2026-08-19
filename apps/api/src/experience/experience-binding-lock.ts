import type { Prisma } from "@prisma/client";

import {
  resolveChapterIdentity,
  resolveUnitIdentity,
  type ResolvedChapterIdentity,
} from "./experience-chapter-identity";

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
 *
 * ── The third lock, which is not ours ───────────────────────────────────────
 *
 * The chapter key is derived from `contentUnitId`, so it cannot be taken until
 * the chapter has been resolved — and resolving reads the published manifest,
 * which a concurrent reorder can move. So the full order is:
 *
 *   global advisory  →  Edition row FOR UPDATE  →  chapter advisory
 *
 * The middle one belongs to Content Core, not to this protocol: it is the row
 * lock every editorial write already takes (`lockEditionTx`). Taking it here is
 * how a binding decision serialises against a publish instead of racing it.
 *
 * That order is deadlock-free against everything else that takes these locks.
 * Content Studio takes only the edition row and never waits on an advisory key,
 * so it can never be the far side of a cycle. The C.3B backfill takes the
 * global key and then edition rows — the same relative order. And the chapter
 * advisory key is always taken LAST, by a holder that necessarily already
 * passed through its edition's row, so nothing can hold a chapter key while
 * waiting for the edition that key belongs to.
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
 * Advisory keys taken BEFORE the chapter is known — so, before the edition row
 * lock that makes resolving it safe.
 *
 * The compatibility key is the only one that can be taken here, because it is
 * the only one whose name does not depend on the answer.
 */
export const preIdentityLockKeys = (): readonly string[] => [
  globalBindingLockKey(),
];

/** Advisory keys taken once identity is known, and therefore last. */
export const postIdentityLockKeys = (
  contentUnitId: string,
): readonly string[] => [chapterBindingLockKey(contentUnitId)];

/**
 * THE bridge sequence of ADVISORY keys, in acquisition order.
 *
 * Single authority: `enterBindingProtocol` composes it from its two halves, the
 * pg-specs model the protocol with this, and the negative controls mutate THIS
 * — so emptying it, dropping the global key or swapping the order breaks the
 * guarantee everywhere at once instead of in one forgotten caller.
 *
 * The edition row lock is deliberately not in this list: it is not an advisory
 * key and it belongs to Content Core's protocol, not this one.
 */
export const bridgeBindingLockKeys = (
  contentUnitId: string,
): readonly string[] => [
  ...preIdentityLockKeys(),
  ...postIdentityLockKeys(contentUnitId),
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

/**
 * Enter the protocol and come back holding everything, with the chapter named.
 *
 * The ONE place the three steps are sequenced. Every binding command goes
 * through it, so "resolve then lock" — which is the TOCTOU — cannot be written
 * by accident in a new command: there is no exported way to get a
 * `ResolvedChapterIdentity` for a write without the locks that make it stay
 * true.
 */
export async function enterBindingProtocol(
  tx: Prisma.TransactionClient,
  where: BindingTarget,
): Promise<ResolvedChapterIdentity> {
  await acquireBindingLocks(tx, preIdentityLockKeys());
  const chapter =
    where.contentUnitId != null
      ? // Already fixed. Nothing to protect from a reorder, because nothing is
        // being derived from a position — see `resolveUnitIdentity`.
        await resolveUnitIdentity(tx, {
          contentUnitId: where.contentUnitId,
          expectedContentUnitId: where.expectedContentUnitId,
        })
      : // `for-update` is the edition row lock. Resolution happens UNDER it, so
        // the manifest it reads is the one still published at commit.
        await resolveChapterIdentity(tx, { ...where, lock: "for-update" });
  await acquireBindingLocks(tx, postIdentityLockKeys(chapter.contentUnitId));
  return chapter;
}

/**
 * Which chapter a command is acting on, and how it knows.
 *
 * `contentUnitId` present means the row already carries its identity and that
 * value IS the answer. Absent means the only locator is a position, which is
 * true for a create and for every row the previous binary wrote.
 */
export interface BindingTarget {
  bookSlug: string;
  chapterOrder: number;
  /** The row's own unit, when it has one. Never taken from a client. */
  contentUnitId?: string | null;
  /** The client's echo, checked against whichever of the two answered. */
  expectedContentUnitId?: string | null;
}
