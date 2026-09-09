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

export type CircleMemberDb = Pick<PrismaClient, "circleMember">;

export interface CircleMemberRow {
  id: string;
  circleId: string;
  userId: string;
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
}
