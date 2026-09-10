import type { PrismaClient } from "@prisma/client";
import { CircleStorageError } from "./circle-invitation.repository";

/**
 * The single authorized writer of `CircleGuestSession` (PR2 · spec §F).
 *
 * A guest session is not a lightweight account. It is a capability pinned to
 * ONE activity and ONE participant, and every authorization re-reads its state
 * from PostgreSQL — there is no cached claim, no signed blob carrying a scope,
 * and no Redis lookup. Revoking a session therefore takes effect on the next
 * request, not on the next cache expiry, because there is no cache to expire.
 *
 * The columns that make the scope structural rather than remembered are
 * `activityId` and `participantId`, and the migration adds two COMPOSITE
 * foreign keys over `(participantId, activityId)` and `(invitationId,
 * activityId)`. A session pointing at a participant of a different activity is
 * not a bug to catch in review; it is a row PostgreSQL refuses to store.
 */

export type CircleGuestSessionDb = Pick<PrismaClient, "circleGuestSession">;

export interface CreateGuestSessionInput {
  readonly invitationId: string;
  readonly activityId: string;
  readonly participantId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly acceptedAt: Date;
}

/** Exactly the columns an actor is built from, and nothing else. */
export interface CircleGuestSessionRow {
  id: string;
  activityId: string;
  participantId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

const SELECT = {
  id: true,
  activityId: true,
  participantId: true,
  tokenHash: true,
  expiresAt: true,
  revokedAt: true,
} as const;

export class CircleGuestSessionRepository {
  constructor(private readonly prisma: CircleGuestSessionDb) {}

  async create(
    input: CreateGuestSessionInput,
    db: CircleGuestSessionDb = this.prisma,
  ): Promise<{ id: string }> {
    try {
      return await db.circleGuestSession.create({
        data: {
          invitationId: input.invitationId,
          activityId: input.activityId,
          participantId: input.participantId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          acceptedAt: input.acceptedAt,
        },
        select: { id: true },
      });
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * Fetch by token hash, in ANY state. Same reasoning as the invitation lookup:
   * expired and revoked rows come back so the caller can answer identically for
   * all of them.
   */
  async findByTokenHash(
    tokenHash: string,
    db: CircleGuestSessionDb = this.prisma,
  ): Promise<CircleGuestSessionRow | null> {
    try {
      return await db.circleGuestSession.findUnique({
        where: { tokenHash },
        select: SELECT,
      });
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * The session by its own id, in ANY state.
   *
   * The guard already resolved this session from a token; a command re-reads it
   * by id inside its transaction because the guard answered about a moment that
   * has passed. Revocation has to bite on the command, not only on the door.
   */
  async findById(
    id: string,
    db: CircleGuestSessionDb = this.prisma,
  ): Promise<CircleGuestSessionRow | null> {
    try {
      return await db.circleGuestSession.findUnique({
        where: { id },
        select: SELECT,
      });
    } catch {
      throw new CircleStorageError();
    }
  }

  /**
   * Best-effort liveness marker. Deliberately fire-and-forget and deliberately
   * NOT part of authorization: a failure to record that somebody was seen must
   * never turn into a failure to authorize them, and vice versa.
   */
  async touch(
    id: string,
    now: Date,
    db: CircleGuestSessionDb = this.prisma,
  ): Promise<void> {
    try {
      await db.circleGuestSession.updateMany({
        where: { id, revokedAt: null },
        data: { lastSeenAt: now },
      });
    } catch {
      // Swallowed on purpose — see above.
    }
  }

  /** Revocation. Idempotent, and effective on the very next authorization. */
  async revoke(
    id: string,
    now: Date,
    db: CircleGuestSessionDb = this.prisma,
  ): Promise<boolean> {
    try {
      const { count } = await db.circleGuestSession.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: now },
      });
      return count === 1;
    } catch {
      throw new CircleStorageError();
    }
  }
}

/** Pure, reason-free liveness predicate — same discipline as invitations. */
export function guestSessionIsLive(
  row: CircleGuestSessionRow,
  now: Date,
): boolean {
  return row.revokedAt === null && row.expiresAt.getTime() > now.getTime();
}
