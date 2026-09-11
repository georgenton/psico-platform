import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

/**
 * The single authorized writer of `CircleInvitation` (PR2).
 *
 * Three rules, all structural rather than remembered:
 *
 *  1. **Only hashes cross this boundary.** Every method takes and returns
 *     hashes; the raw token and code are produced in `circles-secrets.ts`,
 *     handed to the caller once, and never seen here. There is no parameter
 *     this repository could put a raw secret in a column with.
 *  2. **Single use is decided by PostgreSQL, not by a read.** `consume` is one
 *     conditional `UPDATE` whose predicate re-states every usability condition.
 *     Two concurrent exchanges both run it; exactly one updates a row, and the
 *     loser learns it lost from the row count, not from a check it did earlier.
 *  3. **Errors are value-free.** Any driver failure becomes
 *     `CircleStorageError`, whose message is its code. `cause` is never set:
 *     pg error text can quote the value that failed, which here is a secret's
 *     hash or an id.
 */

export type CircleInvitationDb = Pick<
  PrismaClient,
  "circleInvitation" | "circleActivityParticipant" | "$queryRaw"
>;
/** A transaction client. Same shape; the alias marks the requirement. */
export type CircleInvitationTx = CircleInvitationDb;

/** Sanitized storage failure — the value-free replacement for EVERY upstream error. */
export class CircleStorageError extends Error {
  readonly code = "CIRCLE_STORAGE_FAILURE" as const;
  constructor() {
    super("CIRCLE_STORAGE_FAILURE");
    this.name = "CircleStorageError";
  }
}

/** The columns the exchange path reads. A plain shape, not a Prisma type. */
export interface CircleInvitationRow {
  id: string;
  circleId: string;
  activityId: string;
  /** Who minted it. The pilot gate re-derives eligibility from this member. */
  createdByMemberId: string;
  tokenHash: string;
  codeHash: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  revokedAt: Date | null;
}

const SELECT = {
  id: true,
  circleId: true,
  activityId: true,
  createdByMemberId: true,
  tokenHash: true,
  codeHash: true,
  expiresAt: true,
  consumedAt: true,
  acceptedAt: true,
  declinedAt: true,
  revokedAt: true,
} as const;

export interface CreateInvitationInput {
  readonly circleId: string;
  readonly activityId: string;
  readonly createdByMemberId: string;
  readonly tokenHash: string;
  readonly codeHash: string | null;
  readonly expiresAt: Date;
}

/** What creating an invitation produces: the invitation and the seat it opens. */
export interface CreatedInvitation {
  readonly invitationId: string;
  readonly participantId: string;
}

export class CircleInvitationRepository {
  constructor(private readonly prisma: CircleInvitationDb) {}

  /**
   * Mint an invitation AND the participant seat it invites into, atomically.
   *
   * The two are created together because a seat is what the invitation is FOR:
   * splitting them would allow an invitation whose exchange has nowhere to
   * land, and would make the guest session's composite foreign key — which
   * requires a participant of the very same activity — depend on a second
   * write that might not have happened.
   *
   * The seat sets `invitationId` and leaves `memberId` null, which is the half
   * of `num_nonnulls(memberId, invitationId) = 1` that a guest occupies. Its
   * `circleId` is the scope column: the composite key to `CircleActivity`
   * refuses it unless it matches the activity's own circle, so passing the
   * wrong one is a failed write rather than a seat in two worlds.
   */
  async create(
    input: CreateInvitationInput,
    db: CircleInvitationDb = this.prisma,
  ): Promise<CreatedInvitation> {
    try {
      const invitation = await db.circleInvitation.create({
        data: {
          circleId: input.circleId,
          activityId: input.activityId,
          createdByMemberId: input.createdByMemberId,
          tokenHash: input.tokenHash,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
        },
        select: { id: true },
      });
      const participant = await db.circleActivityParticipant.create({
        data: {
          circleId: input.circleId,
          activityId: input.activityId,
          invitationId: invitation.id,
          status: "INVITED",
        },
        select: { id: true },
      });
      return {
        invitationId: invitation.id,
        participantId: participant.id,
      };
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * Look up by token hash or by code hash. Returns the row WHATEVER its state —
   * expired, consumed and revoked rows come back too, because the caller must
   * be free to treat all of them identically, and a repository that filtered
   * them here would tempt a later caller into a "why is this null" branch that
   * distinguishes them.
   */
  async findByHash(
    hash: string,
    db: CircleInvitationDb = this.prisma,
  ): Promise<CircleInvitationRow | null> {
    try {
      return await db.circleInvitation.findFirst({
        where: { OR: [{ tokenHash: hash }, { codeHash: hash }] },
        select: SELECT,
      });
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * Consume an invitation, once, ever.
   *
   * The predicate is the whole guarantee: `consumedAt IS NULL` plus every other
   * usability condition, evaluated by PostgreSQL under the row lock the UPDATE
   * itself takes. A read-then-write would leave a window in which two callers
   * both saw `null`; there is no window here, because there is no read.
   *
   * Returns whether THIS caller was the one that consumed it.
   */
  async consume(
    invitationId: string,
    now: Date,
    db: CircleInvitationDb = this.prisma,
  ): Promise<boolean> {
    try {
      const { count } = await db.circleInvitation.updateMany({
        where: {
          id: invitationId,
          consumedAt: null,
          revokedAt: null,
          declinedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now, acceptedAt: now },
      });
      return count === 1;
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * The invitation by id, in ANY state.
   *
   * Used to RESOLVE the inviter's member id before the locks are taken, and
   * for nothing else. Every value it returns is read again under `lockById`
   * before anything is decided — see `resolveGuestAuthority`.
   */
  async findById(
    invitationId: string,
    db: CircleInvitationDb = this.prisma,
  ): Promise<CircleInvitationRow | null> {
    try {
      return await db.circleInvitation.findUnique({
        where: { id: invitationId },
        select: SELECT,
      });
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * The invitation by id, LOCKED until the surrounding transaction commits.
   *
   * Position TWO in the lock order, between the member and the guest session.
   * A guest command needs it for one reason: the invitation is the edge from
   * the session to the member who issued it, and a guest's authority is
   * entirely derived from that member. Reading it unlocked would let a
   * concurrent revocation slip between the read and the commit — the same race
   * the session lock closes, one link further up the chain.
   *
   * `tx` is REQUIRED, for the same reason it is everywhere else here.
   */
  async lockById(
    invitationId: string,
    tx: CircleInvitationTx,
  ): Promise<CircleInvitationRow | null> {
    try {
      const rows = await tx.$queryRaw<CircleInvitationRow[]>(Prisma.sql`
        SELECT "id", "circleId", "activityId", "createdByMemberId", "tokenHash",
               "codeHash", "expiresAt", "consumedAt", "acceptedAt",
               "declinedAt", "revokedAt"
          FROM "CircleInvitation"
         WHERE "id" = ${invitationId}
           FOR UPDATE
      `);
      return rows[0] ?? null;
    } catch {
      throw new CircleStorageError();
    }
  }

  /** Revoke: idempotent, and never distinguishable to the holder of the link. */
  async revoke(
    invitationId: string,
    now: Date,
    db: CircleInvitationDb = this.prisma,
  ): Promise<boolean> {
    try {
      const { count } = await db.circleInvitation.updateMany({
        where: { id: invitationId, revokedAt: null },
        data: { revokedAt: now },
      });
      return count === 1;
    } catch {
      throw new CircleStorageError();
    }
  }
}

/**
 * Is this invitation usable RIGHT NOW? A pure predicate over a row, so the
 * decision is testable without a database and identical everywhere it is asked.
 *
 * It returns a boolean and not a reason ON PURPOSE: the caller has nothing to
 * branch on, so no caller can accidentally turn "expired" into a different
 * HTTP response than "never existed".
 */
export function invitationIsUsable(
  row: CircleInvitationRow,
  now: Date,
): boolean {
  return (
    row.consumedAt === null &&
    row.revokedAt === null &&
    row.declinedAt === null &&
    row.expiresAt.getTime() > now.getTime()
  );
}
