import type { PrismaClient } from "@prisma/client";

/**
 * The per-account budget for verification emails, and the one place that may
 * spend it.
 *
 * At most `VERIFICATION_SEND_MAX_PER_WINDOW` emails per account in any
 * trailing `VERIFICATION_SEND_WINDOW_MS`. The email `register()` sends counts
 * against the same budget as every resend: it is the same message, and the
 * person already received one.
 *
 * ── Why a second limit at all ──────────────────────────────────────────────
 *
 * The controller's `@Throttle` keys by IP. That protects our sending cost, not
 * the person whose address is being typed in: with a handful of IPs anyone
 * could fill one inbox. The limit that protects that person has to be keyed by
 * that person.
 *
 * ── Why the check and the reservation are one indivisible step ─────────────
 *
 * The first version counted the account's tokens and then created one, in two
 * separate statements. Two requests arriving together could both read "two
 * sent", both pass, and leave four. So both now happen inside one transaction
 * that first takes a PostgreSQL advisory lock keyed by the account —
 * `pg_advisory_xact_lock`, the same mechanism billing uses to serialise one
 * person's subscription events (`stripe.provider.ts`). A second request for
 * the same account waits at the lock until the first has committed, and its
 * count — a new statement under READ COMMITTED — then sees the row the first
 * one wrote. Requests for different accounts don't wait for each other.
 *
 * The lock dies with the transaction, so a process that crashes mid-way leaves
 * nobody waiting. Its key is namespaced (`email-verification:`) so it can't
 * serialise against billing for the same person; a 32-bit `hashtext` collision
 * with some other key would only add a wait, never let two reservations past.
 *
 * ── What stays outside the transaction ─────────────────────────────────────
 *
 * Sending. The transaction holds a lock, and a lock held across a call to a
 * third-party provider would make every other request for that account wait
 * on Resend's latency. So this function only reserves; the caller delivers
 * after it returns.
 *
 * ── A reservation spends budget whatever happens next ───────────────────────
 *
 * The token row IS the unit of budget, and it is written before anything is
 * sent. If delivery later fails, the slot stays spent. That is the deliberate
 * direction: otherwise a provider outage turns the endpoint into an unmetered
 * retry loop.
 */

export const VERIFICATION_SEND_WINDOW_MS = 60 * 60 * 1000;
export const VERIFICATION_SEND_MAX_PER_WINDOW = 3;

export interface ReserveVerificationSendInput {
  userId: string;
  /** SHA-256 of the raw token. The raw value never reaches the database. */
  tokenHash: string;
  expiresAt: Date;
  /** Injectable clock for tests; production passes nothing. */
  now?: Date;
}

export interface ReserveVerificationSendResult {
  /** True when a slot was taken and the token row now exists. */
  reserved: boolean;
  /** Emails already counted in the window BEFORE this request. */
  sentInWindow: number;
}

/**
 * Checkpoints for the concurrency regression, and **only** for it: production
 * calls `reserveVerificationSend` without a third argument.
 *
 * Same criterion as `OpenNativeSessionSeams` in the reader: the interleaving
 * that has to be demonstrated lasts milliseconds, and a race that "usually"
 * fails is not a regression. An inert seam nobody passes in production is.
 */
export interface ReserveVerificationSendSeams {
  /** Runs inside the lock, after counting and before deciding. */
  afterCount?: () => Promise<void>;
}

type Db = Pick<PrismaClient, "$transaction">;

export function verificationLockKey(userId: string): string {
  return `email-verification:${userId}`;
}

export async function reserveVerificationSend(
  db: Db,
  input: ReserveVerificationSendInput,
  seams: ReserveVerificationSendSeams = {},
): Promise<ReserveVerificationSendResult> {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - VERIFICATION_SEND_WINDOW_MS);

  return db.$transaction(async (tx) => {
    // First statement of the transaction, so the count below already runs
    // inside the lock.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${verificationLockKey(input.userId)}))`;

    const sentInWindow = await tx.emailVerificationToken.count({
      where: { userId: input.userId, createdAt: { gte: since } },
    });

    await seams.afterCount?.();

    if (sentInWindow >= VERIFICATION_SEND_MAX_PER_WINDOW) {
      return { reserved: false, sentInWindow };
    }

    await tx.emailVerificationToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });

    return { reserved: true, sentInWindow };
  });
}
