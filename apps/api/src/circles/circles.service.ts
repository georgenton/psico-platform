import { Injectable } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleInvitationRepository } from "./circle-invitation.repository";
import {
  CircleStorageError,
  invitationIsUsable,
} from "./circle-invitation.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleGuestSessionRepository } from "./circle-guest-session.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleEventRepository } from "./circle-event.repository";
import { CirclesError } from "./circles-http-errors";
import {
  hashSecret,
  mintInvitationCode,
  mintInvitationToken,
  normalizeCode,
  MAX_PRESENTED_SECRET_LENGTH,
} from "./circles-secrets";

/**
 * The Círculos access domain (PR2).
 *
 * This cut implements exactly two things end to end — minting an invitation,
 * and trading one for an opaque guest session — plus the read that lets someone
 * check a link without spending it. Creating a Dúo, confirming a share, the
 * reveal barrier, artifacts and withdrawal all belong to PR3 and are absent
 * rather than stubbed.
 *
 * The invariant the whole file is arranged around: **a negative answer is one
 * answer**. A secret that never existed, one that expired, one already used and
 * one revoked leave through the same `CIRCLE_INVITATION_UNUSABLE`, having done
 * the same work. Nothing in here has a branch that produces a different code,
 * a different status or a materially different amount of database work for a
 * different reason, because that branch is exactly what an enumeration attack
 * reads.
 */

/** How long a freshly minted invitation stays usable. */
export const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** How long a guest session lasts once an invitation has been traded for it. */
export const GUEST_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface MintInvitationInput {
  readonly circleId: string;
  readonly activityId: string;
  readonly createdByMemberId: string;
  /** A link-only invitation omits the short code. */
  readonly withCode?: boolean;
  readonly now?: Date;
}

/**
 * The ONLY shape a raw secret ever travels in, and it travels exactly once —
 * out of `mintInvitation`, into the caller's hands. Nothing persists it,
 * re-derives it or logs it, and there is no method that returns it a second
 * time. Losing it means minting a new invitation.
 */
export interface MintedInvitation {
  readonly invitationId: string;
  readonly participantId: string;
  readonly rawToken: string;
  readonly rawCode: string | null;
  readonly expiresAt: Date;
}

export interface ExchangedGuestSession {
  readonly guestSessionId: string;
  readonly rawGuestToken: string;
  readonly expiresAt: Date;
}

@Injectable()
export class CirclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: CircleInvitationRepository,
    private readonly guestSessions: CircleGuestSessionRepository,
    private readonly events: CircleEventRepository,
  ) {}

  /**
   * Mint an invitation and the seat it invites into.
   *
   * There is no HTTP route for this in PR2 — creating a Dúo is PR3's, and
   * shipping half of it behind a flag would be shipping it. What exists here is
   * the domain operation PR3 will call and this cut's tests exercise, so the
   * secret handling is written and proven before anything can reach it.
   */
  async mintInvitation(input: MintInvitationInput): Promise<MintedInvitation> {
    const now = input.now ?? new Date();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);

    const token = mintInvitationToken();
    const code = input.withCode === false ? null : mintInvitationCode();

    const created = await this.prisma.$transaction(async (tx) => {
      const invitation = await this.invitations.create(
        {
          circleId: input.circleId,
          activityId: input.activityId,
          createdByMemberId: input.createdByMemberId,
          tokenHash: token.hash,
          codeHash: code?.hash ?? null,
          expiresAt,
        },
        tx,
      );
      await this.events.append(
        {
          circleId: input.circleId,
          activityId: input.activityId,
          type: "INVITATION_CREATED",
          // The event names the seat, never the secret. `hasCode` is a boolean:
          // it says a code exists, which the recipient already knows, and says
          // nothing about what it is.
          metadata: { hasCode: code !== null },
        },
        tx,
      );
      return invitation;
    });

    return {
      invitationId: created.invitationId,
      participantId: created.participantId,
      rawToken: token.raw,
      rawCode: code?.raw ?? null,
      expiresAt,
    };
  }

  /**
   * Is this secret currently usable? A read, and only a read.
   *
   * Opening a link must not spend it — somebody who taps a link twice, or whose
   * browser prefetches it, has not accepted anything. Acceptance is a separate,
   * explicit call. This returns a bare boolean for the usable case and throws
   * the uniform error otherwise, so there is no field a caller could read a
   * reason out of.
   */
  async inspect(presented: string, now: Date = new Date()): Promise<true> {
    await this.resolveUsableInvitation(presented, now);
    return true;
  }

  /**
   * Trade an invitation for an opaque guest session.
   *
   * Single use is settled by the conditional UPDATE inside the transaction, not
   * by the check that precedes it. The check exists to answer quickly and
   * uniformly in the ordinary case; the UPDATE is what makes two simultaneous
   * exchanges resolve to one winner, and the loser takes the same exit as
   * somebody who guessed wrong.
   */
  async exchange(
    presented: string,
    now: Date = new Date(),
  ): Promise<ExchangedGuestSession> {
    const invitation = await this.resolveUsableInvitation(presented, now);
    const guestToken = mintInvitationToken();
    const expiresAt = new Date(now.getTime() + GUEST_SESSION_TTL_MS);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const won = await this.invitations.consume(invitation.id, now, tx);
        if (!won) {
          // Somebody else consumed it between the read and here — including,
          // possibly, this same person's duplicate tap. Same exit as a wrong
          // guess: the caller cannot tell a race from a bad secret.
          throw new CirclesError("CIRCLE_INVITATION_UNUSABLE");
        }

        // The seat was created with the invitation, so it exists. If it somehow
        // does not, that is a storage failure and not an authorization verdict.
        const seat = await tx.circleActivityParticipant.findFirst({
          where: {
            invitationId: invitation.id,
            activityId: invitation.activityId,
          },
          select: { id: true },
        });
        if (!seat) throw new CircleStorageError();

        await tx.circleActivityParticipant.updateMany({
          where: { id: seat.id, status: "INVITED" },
          data: { status: "ACCEPTED" },
        });

        const session = await this.guestSessions.create(
          {
            invitationId: invitation.id,
            activityId: invitation.activityId,
            participantId: seat.id,
            tokenHash: guestToken.hash,
            expiresAt,
            acceptedAt: now,
          },
          tx,
        );

        await this.events.append(
          {
            circleId: invitation.circleId,
            activityId: invitation.activityId,
            type: "GUEST_SESSION_CREATED",
            actorParticipantId: seat.id,
          },
          tx,
        );

        return {
          guestSessionId: session.id,
          rawGuestToken: guestToken.raw,
          expiresAt,
        };
      });
    } catch (err) {
      if (err instanceof CirclesError) throw err;
      if (err instanceof CircleStorageError) {
        throw new CirclesError("CIRCLE_STORAGE_FAILURE");
      }
      throw new CirclesError("CIRCLE_STORAGE_FAILURE");
    }
  }

  /**
   * The shared front half of both operations, and the reason they cannot drift
   * apart: one lookup, one usability predicate, one error.
   *
   * Both candidate hashes are always computed and both lookups always run, even
   * when the two hashes are identical. Short-circuiting on the second would
   * make a link token and a typed code take measurably different paths, and
   * "how long did that take" is exactly the channel this is closing.
   */
  private async resolveUsableInvitation(presented: string, now: Date) {
    const unusable = new CirclesError("CIRCLE_INVITATION_UNUSABLE");
    if (
      typeof presented !== "string" ||
      presented.length === 0 ||
      presented.length > MAX_PRESENTED_SECRET_LENGTH
    ) {
      throw unusable;
    }

    // A link token is case-sensitive base64url; a typed code is not. Try the
    // value as given and the value normalized as a code, never guessing which
    // one the caller meant from its shape.
    const asGiven = hashSecret(presented);
    const asCode = hashSecret(normalizeCode(presented));

    let row;
    try {
      const [byRaw, byCode] = await Promise.all([
        this.invitations.findByHash(asGiven),
        this.invitations.findByHash(asCode),
      ]);
      row = byRaw ?? byCode;
    } catch {
      throw new CirclesError("CIRCLE_STORAGE_FAILURE");
    }

    if (!row || !invitationIsUsable(row, now)) throw unusable;
    return row;
  }
}
