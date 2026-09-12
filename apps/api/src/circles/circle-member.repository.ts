import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { CircleStorageError } from "./circle-invitation.repository";

/**
 * Membership reads for the authenticated side of Círculos (PR2).
 *
 * A circle role is scoped to ONE circle and carries no platform capability:
 * nothing here reads or writes `User.role`, and being an `ORGANIZER` of a
 * circle grants nothing outside it. That is why membership lives in its own
 * table with its own role enum instead of a new value in the global one.
 *
 * Every lookup is by `(circleId, userId)` and filters to `ACTIVE`, so a former
 * member is indistinguishable from someone who was never there.
 */

/**
 * `$queryRaw` is part of the surface because ONE read needs a lock, and Prisma's
 * fluent API cannot express `FOR UPDATE`. It is never a licence to build SQL
 * from values: the single statement below is fully parameterised.
 */
export type CircleMemberDb = Pick<PrismaClient, "circleMember" | "$queryRaw">;

/**
 * A transaction client. Structurally identical to `CircleMemberDb` — TypeScript
 * cannot tell a transaction apart from the base client — so this alias exists
 * to make the REQUIREMENT visible at every call site: `lockById` outside a
 * transaction takes a lock and releases it at the end of the statement, which
 * is a no-op wearing a lock's clothes.
 */
export type CircleMemberTx = CircleMemberDb;

export interface CircleMemberRow {
  id: string;
  circleId: string;
  /**
   * NULL once the account behind this membership has been deleted.
   *
   * The row survives detached so the counterpart's activity stays coherent (the
   * seat still names a member of that circle), but it authorises nothing:
   * `findActive` matches on `userId`, so a NULL can never be the answer to
   * "who is this caller", and a SQL CHECK keeps a detached row out of `ACTIVE`.
   *
   * Nullable here on purpose rather than asserted away — every consumer that
   * reads it has to say what it does about a deleted account.
   */
  userId: string | null;
  role: "ORGANIZER" | "MEMBER";
  status: "ACTIVE" | "LEFT";
}

const SELECT = {
  id: true,
  circleId: true,
  userId: true,
  role: true,
  status: true,
} as const;

export class CircleMemberRepository {
  constructor(private readonly prisma: CircleMemberDb) {}

  /**
   * The active membership, or null. `null` covers "not a member", "left" and
   * "no such circle" alike — the caller has one branch, so it cannot
   * accidentally answer the three differently.
   */
  async findActive(
    circleId: string,
    userId: string,
    db: CircleMemberDb = this.prisma,
  ): Promise<CircleMemberRow | null> {
    try {
      return await db.circleMember.findFirst({
        where: { circleId, userId, status: "ACTIVE" },
        select: SELECT,
      });
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * The member row by id, in ANY status.
   *
   * The pilot gate needs the row as it stands right now — including a `LEFT`
   * one — because "this member left" and "this member is not in the pilot" have
   * to produce the same answer, and a lookup that filtered `LEFT` away would
   * hand the caller a `null` it might read as "no such member" and treat
   * differently.
   */
  async findById(
    memberId: string,
    db: CircleMemberDb = this.prisma,
  ): Promise<CircleMemberRow | null> {
    try {
      return await db.circleMember.findUnique({
        where: { id: memberId },
        select: SELECT,
      });
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * The member row, LOCKED until the surrounding transaction commits.
   *
   * `findById` answers "was this member eligible a moment ago". That is a
   * different question from "is this member eligible, and will still be when I
   * commit", and only the second one is worth acting on. Under READ COMMITTED
   * an unlocked `SELECT` leaves this sequence open:
   *
   *     T1  SELECT member -> ACTIVE
   *     T2  UPDATE member -> LEFT ; COMMIT
   *     T1  consume, create session, COMMIT
   *
   * T1 read a true fact and committed on a false one. `FOR UPDATE` closes it:
   * T2's write waits for T1's transaction to end, so whatever T1 saw is still
   * true at its commit.
   *
   * `FOR UPDATE` rather than `FOR NO KEY UPDATE` on purpose. The weaker mode
   * would also block a plain `UPDATE` of `status`, so it would be sufficient —
   * but it permits concurrent `FOR KEY SHARE`, and reasoning about which future
   * command needs which mode is exactly the kind of subtlety that turns into a
   * bug nobody can reproduce. The stronger lock costs nothing here: this row is
   * held for the few statements of one exchange.
   *
   * `db` is REQUIRED. Outside a transaction the lock is taken and dropped at
   * the end of the statement, which looks like protection and is not.
   */
  async lockById(
    memberId: string,
    tx: CircleMemberTx,
  ): Promise<CircleMemberRow | null> {
    try {
      const rows = await tx.$queryRaw<CircleMemberRow[]>(Prisma.sql`
        SELECT "id", "circleId", "userId", "role", "status"
          FROM "CircleMember"
         WHERE "id" = ${memberId}
           FOR UPDATE
      `);
      return rows[0] ?? null;
    } catch {
      throw new CircleStorageError();
    }
  }
}
