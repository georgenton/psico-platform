import { Prisma } from "@prisma/client";
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

export type CircleGuestSessionDb = Pick<
  PrismaClient,
  "circleGuestSession" | "$queryRaw"
>;
/** A transaction client. Same shape; the alias marks the requirement. */
export type CircleGuestSessionTx = CircleGuestSessionDb;

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
  /**
   * The invitation this session was minted from.
   *
   * Carried because the guest's authority is DERIVED from the inviter, and the
   * invitation is the only edge from a session to the member who created it.
   * Without it, a command could revalidate that the session is live and still
   * miss that the person who issued it has since left the circle or dropped
   * out of the pilot allowlist.
   */
  invitationId: string;
  activityId: string;
  participantId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

const SELECT = {
  id: true,
  invitationId: true,
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
   * The session by its own id, LOCKED until the surrounding transaction commits.
   *
   * `findById` answers "was this session live a moment ago". Under contention a
   * moment ago is not when the command commits: a withdrawal running in
   * parallel revokes sessions with an `updateMany`, and an unlocked read racing
   * it can return `revokedAt: null` for a row that is being revoked right then.
   * The command would go on to write a `PARTICIPANT_READY` event, an envelope
   * and possibly a reveal — all on a credential that no longer exists by the
   * time either transaction commits.
   *
   * `FOR UPDATE` makes the two orders: whichever transaction takes the row
   * first finishes, and the other sees the committed result. If revocation
   * wins, the re-read here returns a revoked row and the command refuses,
   * having written nothing.
   *
   * `tx` is REQUIRED. Outside a transaction the lock is taken and released at
   * the end of the statement, which looks like protection and is not.
   */
  async lockById(
    id: string,
    tx: CircleGuestSessionTx,
  ): Promise<CircleGuestSessionRow | null> {
    try {
      const rows = await tx.$queryRaw<CircleGuestSessionRow[]>(Prisma.sql`
        SELECT "id", "invitationId", "activityId", "participantId",
               "tokenHash", "expiresAt", "revokedAt"
          FROM "CircleGuestSession"
         WHERE "id" = ${id}
           FOR UPDATE
      `);
      return rows[0] ?? null;
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
