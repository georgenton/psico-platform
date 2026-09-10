import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { CircleStorageError } from "./circle-invitation.repository";
import type { CircleEnvelope } from "./circles-crypto";

/**
 * The single authorized writer of `CircleActivityParticipant` (PR3).
 *
 * A seat is where the two things this product is most careful about meet: what
 * a person confirmed, and whether they are still in. Both are written here and
 * nowhere else.
 *
 * Lock position: FIFTH. After the activity, before the artifact. See
 * `circles-participation.service.ts`.
 */

export type CircleParticipantDb = Pick<
  PrismaClient,
  "circleActivityParticipant" | "$queryRaw"
>;
export type CircleParticipantTx = CircleParticipantDb;

export type CircleParticipantStatusRow =
  | "INVITED"
  | "ACCEPTED"
  | "READY"
  | "WITHDRAWN"
  | "DECLINED";

export interface CircleParticipantRow {
  id: string;
  activityId: string;
  circleId: string;
  memberId: string | null;
  invitationId: string | null;
  status: CircleParticipantStatusRow;
  sharingMode: string | null;
  fieldKeys: string[];
  ciphertext: string | null;
  nonce: string | null;
  keyVersion: number | null;
  payloadHash: string | null;
  readyAt: Date | null;
  followUpDecision: string | null;
}

const SELECT = {
  id: true,
  activityId: true,
  circleId: true,
  memberId: true,
  invitationId: true,
  status: true,
  sharingMode: true,
  fieldKeys: true,
  ciphertext: true,
  nonce: true,
  keyVersion: true,
  payloadHash: true,
  readyAt: true,
  followUpDecision: true,
} as const;

export class CircleParticipantRepository {
  constructor(private readonly prisma: CircleParticipantDb) {}

  async listForActivity(
    activityId: string,
    db: CircleParticipantDb = this.prisma,
  ): Promise<CircleParticipantRow[]> {
    try {
      return await db.circleActivityParticipant.findMany({
        where: { activityId },
        select: SELECT,
        orderBy: { createdAt: "asc" },
      });
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * Every seat of the activity, LOCKED.
   *
   * All of them, not just the actor's: the barrier counts them, and a count
   * taken while another transaction can still change a row is a count that was
   * true once. `ORDER BY id` is not cosmetic — two transactions locking the
   * same set in different orders would deadlock on each other.
   */
  async lockForActivity(
    activityId: string,
    tx: CircleParticipantTx,
  ): Promise<CircleParticipantRow[]> {
    try {
      return await tx.$queryRaw<CircleParticipantRow[]>(Prisma.sql`
        SELECT "id", "activityId", "circleId", "memberId", "invitationId",
               "status", "sharingMode", "fieldKeys", "ciphertext", "nonce",
               "keyVersion", "payloadHash", "readyAt", "followUpDecision"
          FROM "CircleActivityParticipant"
         WHERE "activityId" = ${activityId}
         ORDER BY "id"
           FOR UPDATE
      `);
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * Persist a confirmed snapshot and move the seat to `READY`.
   *
   * Conditional on the seat still being `ACCEPTED`: a second confirmation, or
   * one racing a withdrawal, updates nothing and the caller learns it from the
   * count rather than from a check it did earlier.
   */
  async confirmShare(
    input: {
      readonly participantId: string;
      readonly activityId: string;
      readonly sharingMode: string;
      readonly fieldKeys: readonly string[];
      readonly envelope: CircleEnvelope;
      readonly now: Date;
    },
    tx: CircleParticipantTx,
  ): Promise<boolean> {
    try {
      const count = await tx.circleActivityParticipant.updateMany({
        where: {
          id: input.participantId,
          activityId: input.activityId,
          status: "ACCEPTED",
        },
        data: {
          status: "READY",
          sharingMode: input.sharingMode as never,
          fieldKeys: [...input.fieldKeys],
          ciphertext: input.envelope.ciphertext,
          nonce: input.envelope.nonce,
          keyVersion: input.envelope.keyVersion,
          payloadHash: input.envelope.payloadHash,
          readyAt: input.now,
        },
      });
      return count.count === 1;
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * Withdraw a seat and destroy its envelope in the same statement.
   *
   * The two are one write on purpose. A withdrawal that set the status and
   * left the purge to a second statement would have a window in which a
   * `WITHDRAWN` seat still holds content — and the database refuses that state
   * anyway (`CircleActivityParticipant_withdrawn_has_no_envelope`), so the
   * second statement would not merely be late, it would fail.
   */
  async withdraw(
    participantId: string,
    activityId: string,
    now: Date,
    tx: CircleParticipantTx,
  ): Promise<boolean> {
    try {
      const count = await tx.circleActivityParticipant.updateMany({
        where: {
          id: participantId,
          activityId,
          status: { in: ["INVITED", "ACCEPTED", "READY"] },
        },
        data: {
          status: "WITHDRAWN",
          withdrawnAt: now,
          ciphertext: null,
          nonce: null,
          keyVersion: null,
          payloadHash: null,
          readyAt: null,
          sharingMode: null,
          fieldKeys: [],
        },
      });
      return count.count === 1;
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * Destroy a pending envelope without withdrawing the seat.
   *
   * Used on the OTHER participant when somebody withdraws before the reveal:
   * their snapshot was confirmed for a conversation that is not going to
   * happen, so it does not get to sit in the database waiting for one.
   */
  async purgeEnvelope(
    participantId: string,
    activityId: string,
    tx: CircleParticipantTx,
  ): Promise<void> {
    try {
      await tx.circleActivityParticipant.updateMany({
        where: { id: participantId, activityId, status: "READY" },
        data: {
          status: "ACCEPTED",
          ciphertext: null,
          nonce: null,
          keyVersion: null,
          payloadHash: null,
          readyAt: null,
          sharingMode: null,
          fieldKeys: [],
        },
      });
    } catch {
      throw new CircleStorageError();
    }
  }

  /** One follow-up decision per seat, and only the first one counts. */
  async recordFollowUp(
    participantId: string,
    activityId: string,
    decision: string,
    tx: CircleParticipantTx,
  ): Promise<boolean> {
    try {
      const count = await tx.circleActivityParticipant.updateMany({
        where: {
          id: participantId,
          activityId,
          followUpDecision: null,
          status: { in: ["READY", "ACCEPTED"] },
        },
        data: { followUpDecision: decision as never },
      });
      return count.count === 1;
    } catch {
      throw new CircleStorageError();
    }
  }
}
