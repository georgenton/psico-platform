import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { CircleStorageError } from "./circle-invitation.repository";

/**
 * The single authorized writer of `CircleActivity` (PR3).
 *
 * ── The lock order, and why this file states it too ────────────────────────
 *
 *     CircleMember → CircleInvitation → CircleGuestSession →
 *     CircleActivity → CircleActivityParticipant → CircleArtifact
 *
 * Every command takes only the rows it needs, and never in another order. Two
 * commands that take the same two rows in opposite orders deadlock under
 * contention, and it surfaces as a random 500 on a Dúo two people are using at
 * the same moment — the hardest kind of bug to reproduce and the easiest to
 * avoid. `circles-participation.service.ts` holds the canonical statement; it
 * is repeated here because this is where somebody adding a lock will be
 * looking.
 *
 * ── Why the reveal is an UPDATE and not an `if` ────────────────────────────
 *
 * `revealIfAllReady` is one conditional statement whose WHERE clause contains
 * the entire barrier: still `PREPARING`, not yet revealed, and exactly the
 * required number of seats at `READY` counted by PostgreSQL in the same
 * statement. Two simultaneous confirmations both run it; at most one updates a
 * row. There is no window between counting and transitioning because there is
 * no counting step — the count is part of the predicate.
 */

export type CircleActivityDb = Pick<
  PrismaClient,
  "circleActivity" | "$queryRaw" | "$executeRaw"
>;

/** A transaction client. Same shape; the alias marks the requirement. */
export type CircleActivityTx = CircleActivityDb;

export type CircleActivityStatusRow =
  | "INVITING"
  | "PREPARING"
  | "REVEALED"
  | "FOLLOW_UP"
  | "CLOSED"
  | "CANCELLED";

export interface CircleActivityRow {
  id: string;
  circleId: string;
  templateKey: string;
  templateVersion: number;
  status: CircleActivityStatusRow;
  requiredParticipants: number;
  revealedAt: Date | null;
  followUpDueAt: Date | null;
  closedAt: Date | null;
  cancelledAt: Date | null;
}

const SELECT = {
  id: true,
  circleId: true,
  templateKey: true,
  templateVersion: true,
  status: true,
  requiredParticipants: true,
  revealedAt: true,
  followUpDueAt: true,
  closedAt: true,
  cancelledAt: true,
} as const;

export class CircleActivityRepository {
  constructor(private readonly prisma: CircleActivityDb) {}

  async findById(
    activityId: string,
    db: CircleActivityDb = this.prisma,
  ): Promise<CircleActivityRow | null> {
    try {
      return await db.circleActivity.findUnique({
        where: { id: activityId },
        select: SELECT,
      });
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * The activity row, LOCKED until the surrounding transaction commits.
   *
   * `tx` is REQUIRED. Outside a transaction `FOR UPDATE` takes the lock and
   * drops it at the end of the statement — protection-shaped, and not
   * protection.
   */
  async lockById(
    activityId: string,
    tx: CircleActivityTx,
  ): Promise<CircleActivityRow | null> {
    try {
      const rows = await tx.$queryRaw<CircleActivityRow[]>(Prisma.sql`
        SELECT "id", "circleId", "templateKey", "templateVersion", "status",
               "requiredParticipants", "revealedAt", "followUpDueAt",
               "closedAt", "cancelledAt"
          FROM "CircleActivity"
         WHERE "id" = ${activityId}
           FOR UPDATE
      `);
      return rows[0] ?? null;
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * `INVITING → PREPARING`, conditionally.
   *
   * Returns whether THIS caller made the transition. The predicate carries the
   * precondition, so a second acceptance — or a race with a withdrawal that
   * already cancelled the activity — updates nothing and says so.
   */
  async startPreparing(
    activityId: string,
    tx: CircleActivityTx,
  ): Promise<boolean> {
    try {
      const count = await tx.circleActivity.updateMany({
        where: { id: activityId, status: "INVITING" },
        data: { status: "PREPARING" },
      });
      return count.count === 1;
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * The reveal barrier, as one statement.
   *
   * Everything the barrier means is in the WHERE clause: the activity is still
   * `PREPARING`, has never been revealed, and the seats satisfy BOTH counts —
   * computed by PostgreSQL, inside this statement, under the lock this
   * transaction already holds.
   *
   * ── Why two counts and not one ────────────────────────────────────────────
   *
   * The first version asked only "are there `requiredParticipants` seats at
   * READY". For a Dúo that reads as "both of them confirmed", and it is not
   * what it says. It says "two seats confirmed" — and if a third row existed
   * on the activity, two of three confirming would open the reveal while the
   * third seat sat there unconfirmed. That seat would then be inside a
   * revealed activity having given nothing, which is the precise failure the
   * barrier exists to prevent.
   *
   * A third row should be impossible: `CircleActivity_duo_requires_two`
   * pins `requiredParticipants` and PR2's constraints bound the seats. But
   * "should be impossible" is an argument about other code, and this is the
   * statement that decides whether two people's private answers become
   * visible to each other. Requiring the TOTAL to match as well makes an
   * anomalous row block the reveal rather than ride it: the activity stays
   * `PREPARING`, nothing is exposed, and somebody has to look.
   *
   * Returns whether THIS caller revealed it. Exactly one of two concurrent
   * confirmations can get `true`, which is what makes "exactly one
   * ACTIVITY_REVEALED event" a fact rather than an intention.
   */
  async revealIfAllReady(
    activityId: string,
    now: Date,
    tx: CircleActivityTx,
  ): Promise<boolean> {
    try {
      const updated = await tx.$executeRaw(Prisma.sql`
        UPDATE "CircleActivity" a
           SET "status" = 'REVEALED', "revealedAt" = ${now}, "updatedAt" = ${now}
         WHERE a."id" = ${activityId}
           AND a."status" = 'PREPARING'
           AND a."revealedAt" IS NULL
           AND (
             SELECT count(*) FROM "CircleActivityParticipant" p
              WHERE p."activityId" = a."id" AND p."status" = 'READY'
           ) = a."requiredParticipants"
           AND (
             SELECT count(*) FROM "CircleActivityParticipant" p
              WHERE p."activityId" = a."id"
           ) = a."requiredParticipants"
      `);
      return updated === 1;
    } catch {
      throw new CircleStorageError();
    }
  }

  /** How many seats have confirmed. Read under the caller's lock. */
  async countReady(activityId: string, db: CircleActivityDb): Promise<number> {
    try {
      const rows = await db.$queryRaw<{ n: bigint }[]>(Prisma.sql`
        SELECT count(*) AS n FROM "CircleActivityParticipant"
         WHERE "activityId" = ${activityId} AND "status" = 'READY'
      `);
      return Number(rows[0]?.n ?? 0);
    } catch {
      throw new CircleStorageError();
    }
  }

  /** Terminal cancellation, conditional on the states that may still cancel. */
  async cancel(
    activityId: string,
    now: Date,
    from: readonly CircleActivityStatusRow[],
    tx: CircleActivityTx,
  ): Promise<boolean> {
    try {
      const count = await tx.circleActivity.updateMany({
        where: { id: activityId, status: { in: [...from] } },
        data: { status: "CANCELLED", cancelledAt: now },
      });
      return count.count === 1;
    } catch {
      throw new CircleStorageError();
    }
  }

  /** Terminal close, conditional on the states that may still close. */
  async close(
    activityId: string,
    now: Date,
    from: readonly CircleActivityStatusRow[],
    tx: CircleActivityTx,
  ): Promise<boolean> {
    try {
      const count = await tx.circleActivity.updateMany({
        where: { id: activityId, status: { in: [...from] } },
        data: { status: "CLOSED", closedAt: now },
      });
      return count.count === 1;
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * `REVEALED → FOLLOW_UP`, and only once the due date has arrived.
   *
   * Derived, never chosen. A client asks to record a decision; it does not ask
   * for a state. The date is in the predicate so a request made a minute early
   * simply does not transition, rather than being rejected by a branch that
   * somebody could later reorder.
   */
  async openFollowUpIfDue(
    activityId: string,
    now: Date,
    tx: CircleActivityTx,
  ): Promise<boolean> {
    try {
      const count = await tx.circleActivity.updateMany({
        where: {
          id: activityId,
          status: "REVEALED",
          followUpDueAt: { not: null, lte: now },
        },
        data: { status: "FOLLOW_UP" },
      });
      return count.count === 1;
    } catch {
      throw new CircleStorageError();
    }
  }
}
