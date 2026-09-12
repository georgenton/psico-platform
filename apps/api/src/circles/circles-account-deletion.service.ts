import { Injectable } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleParticipantRepository } from "./circle-participant.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleActivityRepository } from "./circle-activity.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleEventRepository } from "./circle-event.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleMemberRepository } from "./circle-member.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleInvitationRepository } from "./circle-invitation.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleGuestSessionRepository } from "./circle-guest-session.repository";

/**
 * What account deletion has to do to Círculos BEFORE the account row goes.
 *
 * ── Why this exists at all ─────────────────────────────────────────────────
 *
 * The database now lets the `User` row be deleted — three foreign keys detach
 * instead of blocking (see `20260913000000_circles_account_deletion`). But
 * detaching references is not ending a shared activity. If deletion were left
 * to the foreign keys alone, the counterpart would be sitting in a `PREPARING`
 * Dúo forever, with a live invitation and a live guest session pointing at a
 * seat nobody will ever fill, and — worse — an activity that could still REVEAL
 * if they confirmed, disclosing a snapshot the deleted person wrote when they
 * still had an account.
 *
 * So the account flow runs this first, and only then removes the row.
 *
 * ── It is the withdrawal path, not a new policy ────────────────────────────
 *
 * Every effect here is one the product already performs when a person leaves:
 * purge their envelope, revoke the invitations and guest sessions attached to
 * the activity, and take the activity to the terminal state its stage implies
 * (`INVITING`/`PREPARING` → CANCELLED; `REVEALED`/`FOLLOW_UP` → CLOSED). The
 * events appended are the same two the withdraw command appends, with the same
 * actor — the SEAT, not the user — which is why they stay truthful after the
 * account is gone.
 *
 * Nothing new is invented about the counterpart's content. A reveal that
 * already happened is not undone: the other person read what they read, and
 * this does not pretend otherwise. What it stops is any FUTURE disclosure.
 *
 * ── Idempotent, resumable, and safe to interleave ──────────────────────────
 *
 * One transaction per activity, each guarded by the same status predicates the
 * ordinary commands use (`updateMany ... where status IN (...)`), so a retry
 * after a partial failure finds the already-finished activities terminal and
 * skips them. A concurrent redemption or confirmation either lands before this
 * transaction takes the row — and is then ended by it — or finds the activity
 * terminal and is refused by the state machine. Neither order leaves authority
 * half-standing.
 *
 * The idempotency key is derived from the seat, so a replayed run appends the
 * same receipt rather than a second event.
 */

export interface CirclesDetachSummary {
  readonly memberships: number;
  readonly activitiesCancelled: number;
  readonly activitiesClosed: number;
  readonly seatsWithdrawn: number;
  readonly invitationsRevoked: number;
  readonly guestSessionsRevoked: number;
  /** Snapshots destroyed, including in activities that were already over. */
  readonly envelopesPurged: number;
}

const EMPTY: CirclesDetachSummary = Object.freeze({
  memberships: 0,
  activitiesCancelled: 0,
  activitiesClosed: 0,
  seatsWithdrawn: 0,
  invitationsRevoked: 0,
  guestSessionsRevoked: 0,
  envelopesPurged: 0,
});

/** Stages from which an activity is still live. */
const LIVE = ["INVITING", "PREPARING", "REVEALED", "FOLLOW_UP"] as const;
/** Seat states that still hold something to end. */
const LIVE_SEAT = ["INVITED", "ACCEPTED", "READY"] as const;

@Injectable()
export class CirclesAccountDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participants: CircleParticipantRepository,
    private readonly activities: CircleActivityRepository,
    private readonly events: CircleEventRepository,
    private readonly members: CircleMemberRepository,
    private readonly invitations: CircleInvitationRepository,
    private readonly guestSessions: CircleGuestSessionRepository,
  ) {}

  /**
   * End this user's live Círculos participation and detach their membership.
   *
   * Returns counts for the operational log. Never throws for "nothing to do":
   * a user who never touched Círculos is the common case and costs two reads.
   */
  async detachUser(userId: string): Promise<CirclesDetachSummary> {
    const memberships = await this.prisma.circleMember.findMany({
      where: { userId },
      select: { id: true, circleId: true },
    });
    if (memberships.length === 0) return EMPTY;

    const memberIds = memberships.map((m) => m.id);

    // Every live seat this user holds, with the activity it sits in.
    const seats = await this.prisma.circleActivityParticipant.findMany({
      where: {
        memberId: { in: memberIds },
        status: { in: [...LIVE_SEAT] },
        activity: { status: { in: [...LIVE] } },
      },
      select: {
        id: true,
        activityId: true,
        memberId: true,
        activity: { select: { id: true, circleId: true, status: true } },
      },
    });

    let cancelled = 0;
    let closed = 0;
    let withdrawn = 0;
    let invitationsRevoked = 0;
    let guestSessionsRevoked = 0;

    for (const seat of seats) {
      // `memberId` is non-null by construction: the query filtered on
      // `memberId IN (...)`.
      const outcome = await this.endOne({ ...seat, memberId: seat.memberId! });
      if (!outcome) continue;
      withdrawn += 1;
      invitationsRevoked += outcome.invitations;
      guestSessionsRevoked += outcome.guestSessions;
      if (outcome.terminal === "CANCELLED") cancelled += 1;
      else closed += 1;
    }

    // ── Then ERASE, which is a different job from ENDING ────────────────────
    //
    // The loop above only reaches LIVE activities, because ending one is only
    // meaningful there. But a seat can still be holding this person's snapshot
    // in an activity that is already CLOSED or CANCELLED — the reveal happened,
    // the conversation finished, and the envelope stayed. Filtering the whole
    // deletion by "live" left exactly that content behind.
    //
    // So the two responsibilities are separated: end what is still running,
    // then erase this account's own content wherever it sits, terminal
    // activities included. No activity is reopened and no event is appended —
    // erasing content is not a domain transition, and pretending it were would
    // put a second PARTICIPANT_WITHDRAWN in a ledger that already recorded one.
    const envelopesPurged = await this.eraseEnvelopes(memberIds);

    // Membership is revoked LAST: while it is still ACTIVE the seats above can
    // be resolved the ordinary way, and the SQL CHECK requires a detached row
    // to be LEFT anyway — so this also has to happen before the account row is
    // removed, not as a consequence of it.
    const left = await this.prisma.circleMember.updateMany({
      where: { id: { in: memberIds }, status: "ACTIVE" },
      data: { status: "LEFT", leftAt: new Date() },
    });

    // RETURNED, never logged here.
    //
    // `circles-scope.spec.ts` forbids `logger.*` and `console.*` in every file
    // of this module, and the reason is not style: raw invitation tokens leave
    // `circles-secrets.ts` and pass through these files, so the module holds
    // the invariant "nothing here writes to a log" rather than trying to prove
    // each individual call site is safe. Counts are perfectly safe to log —
    // and they are logged, by the job, which is not one of these files.
    return {
      memberships: left.count,
      activitiesCancelled: cancelled,
      activitiesClosed: closed,
      seatsWithdrawn: withdrawn,
      invitationsRevoked,
      guestSessionsRevoked,
      envelopesPurged,
    };
  }

  /**
   * Destroy this account's snapshots wherever they sit — including in
   * activities that are already over.
   *
   * ── Why only READY seats are matched ───────────────────────────────────────
   *
   * Because a seat in any other status CANNOT be holding one. `withdraw()`
   * clears the envelope in the same statement that sets WITHDRAWN, and
   * `CircleActivityParticipant_withdrawn_has_no_envelope` makes the
   * intermediate state unrepresentable anyway. So READY is not a heuristic for
   * "probably has content" — it is the complete set.
   *
   * ── Why the seat becomes ACCEPTED and not WITHDRAWN ────────────────────────
   *
   * `CircleActivityParticipant_ready_is_complete` requires a READY seat to hold
   * all six envelope columns, so the content cannot be cleared without the
   * status moving. Of the two terminal-safe choices, WITHDRAWN would assert
   * something untrue: this person did not withdraw, their account was deleted,
   * and in an activity that already finished a withdrawal never happened.
   * ACCEPTED says what is true — they took part, and their snapshot is gone.
   *
   * This is the same column set `purgeEnvelope` clears, applied in bulk rather
   * than one seat at a time.
   */
  private async eraseEnvelopes(memberIds: string[]): Promise<number> {
    const { count } = await this.prisma.circleActivityParticipant.updateMany({
      where: { memberId: { in: memberIds }, status: "READY" },
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
    return count;
  }

  /**
   * End ONE activity on this user's behalf, in a single transaction.
   *
   * `null` when the activity was already terminal by the time the transaction
   * took it — the resumable case, not an error.
   */
  private async endOne(seat: {
    id: string;
    activityId: string;
    memberId: string;
    activity: { id: string; circleId: string; status: string };
  }): Promise<{
    terminal: "CANCELLED" | "CLOSED";
    invitations: number;
    guestSessions: number;
  } | null> {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // ── The canonical lock order, and why it is not ours to choose ────────
      //
      // `circles-participation.service.ts` numbers its locks:
      //
      //   1 CircleMember → 2 CircleInvitation → 3 CircleGuestSession
      //   → 4 CircleActivity → 5 CircleActivityParticipant
      //
      // The first cut of this method took the ACTIVITY first and only then
      // touched invitations and guest sessions — the exact inversion. A guest
      // redeeming an invitation holds 2 and wants 4 while this transaction
      // holds 4 and wants 2, which is a deadlock, not a slow query. BullMQ
      // retrying afterwards is not a fix: it is the symptom being absorbed.
      //
      // Within a set of rows the order is the primary key ascending, so two
      // concurrent deletions touching the same activity queue behind each
      // other instead of interleaving.

      // 1 · the member whose seat this is
      await this.members.lockById(seat.memberId, tx);

      // 2 · every invitation on this activity, lowest id first
      const invitationRows = await tx.circleInvitation.findMany({
        where: { activityId: seat.activityId },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      for (const row of invitationRows) {
        await this.invitations.lockById(row.id, tx);
      }

      // 3 · every guest session on this activity, lowest id first
      const sessionRows = await tx.circleGuestSession.findMany({
        where: { activityId: seat.activityId },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      for (const row of sessionRows) {
        await this.guestSessions.lockById(row.id, tx);
      }

      // 4 · the activity
      const activity = await this.activities.lockById(seat.activityId, tx);
      if (!activity) return null;
      const stage = activity.status;
      if (stage === "CLOSED" || stage === "CANCELLED") return null;

      const didWithdraw = await this.participants.withdraw(
        seat.id,
        seat.activityId,
        now,
        tx,
      );
      if (!didWithdraw) return null;

      // NOTE: no purge of this seat here, and that is not an omission.
      // `withdraw()` above clears all six envelope columns in the SAME
      // statement that sets WITHDRAWN — it has to, because
      // `CircleActivityParticipant_withdrawn_has_no_envelope` refuses the
      // in-between state. A `purgeEnvelope` call after it matches
      // `status: READY`, finds nothing, and silently does no work while
      // reading like it does.

      const cancelling = stage === "INVITING" || stage === "PREPARING";

      if (cancelling) {
        // Before the reveal, the counterpart's pending envelope was confirmed
        // for a conversation that will not happen — the same reasoning the
        // withdraw command applies.
        const others = await tx.circleActivityParticipant.findMany({
          where: { activityId: seat.activityId, id: { not: seat.id } },
          select: { id: true },
        });
        for (const other of others) {
          await this.participants.purgeEnvelope(other.id, seat.activityId, tx);
        }
      }

      const invitations = await tx.circleInvitation.updateMany({
        where: { activityId: seat.activityId, revokedAt: null },
        data: { revokedAt: now },
      });
      const guestSessions = await tx.circleGuestSession.updateMany({
        where: { activityId: seat.activityId, revokedAt: null },
        data: { revokedAt: now },
      });

      const terminal = cancelling ? "CANCELLED" : "CLOSED";
      const moved = cancelling
        ? await this.activities.cancel(
            seat.activityId,
            now,
            ["INVITING", "PREPARING"],
            tx,
          )
        : await this.activities.close(
            seat.activityId,
            now,
            ["REVEALED", "FOLLOW_UP"],
            tx,
          );
      if (!moved) return null;

      // The SEAT is the actor, not the account — which is why these two rows
      // stay meaningful after the user is gone.
      await this.events.append(
        {
          circleId: seat.activity.circleId,
          activityId: seat.activityId,
          type: "PARTICIPANT_WITHDRAWN",
          actorParticipantId: seat.id,
          idempotencyKey: `account-deletion:${seat.id}`,
        },
        tx,
      );
      await this.events.append(
        {
          circleId: seat.activity.circleId,
          activityId: seat.activityId,
          type:
            terminal === "CANCELLED" ? "ACTIVITY_CANCELLED" : "ACTIVITY_CLOSED",
        },
        tx,
      );

      return {
        terminal,
        invitations: invitations.count,
        guestSessions: guestSessions.count,
      };
    });
  }
}
