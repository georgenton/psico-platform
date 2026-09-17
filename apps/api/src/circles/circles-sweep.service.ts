import { Injectable } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleActivityRepository } from "./circle-activity.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleEventRepository } from "./circle-event.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CirclesRolloutService } from "./circles-rollout.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleParticipantRepository } from "./circle-participant.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleInvitationRepository } from "./circle-invitation.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleGuestSessionRepository } from "./circle-guest-session.repository";
import { lockActivityAccessRows } from "./circles-activity-locks";

/**
 * The two transitions a clock is allowed to make, and nothing else.
 *
 * ── What a timer may decide ────────────────────────────────────────────────
 *
 * Almost nothing. A sweep must never fabricate a confirmation, a reveal, or a
 * follow-up decision: those are things a person did, and a row that says
 * somebody confirmed when they did not is worse than a row that says nothing.
 * So this does exactly two things, both of which are "the activity can no
 * longer proceed as it is", never "somebody chose":
 *
 *   1. An `INVITING` DÚO whose every invitation has EXPIRED is cancelled.
 *      Nobody can accept it any more — the link is dead — so leaving it
 *      `INVITING` forever is not neutrality, it is a permanent lie in the
 *      organiser's list. This is the same terminal state the organiser's own
 *      retraction produces, for the same reason.
 *
 *   2. A `REVEALED` activity whose `followUpDueAt` has arrived moves to
 *      `FOLLOW_UP`. This transition already exists as
 *      `openFollowUpIfDue` — the sweep only calls it on time.
 *
 *   3. A GROUP whose roster can no longer be completed is cancelled. With a
 *      fixed roster and no substitutions every invited seat is essential, so
 *      one link that can no longer be redeemed is enough: waiting for the
 *      rest to expire would keep a room open that nobody can finish.
 *
 *   4. A GROUP in `FOLLOW_UP` whose window has passed is closed. Not because
 *      anybody decided — see below — but because the stage has to end.
 *
 * ── And what it must NOT ───────────────────────────────────────────────────
 *
 * It does not fabricate a follow-up DECISION. Closing on time and recording a
 * choice are different acts: the activity becomes `CLOSED`, and the seats that
 * never answered still say they never answered. `ACTIVITY_CLOSED` carries no
 * metadata — the ledger's grammar has nowhere to put a cause — so nothing in
 * the record can be read as "they decided".
 *
 * For a DÚO it still does not close a `FOLLOW_UP` at all. That policy is
 * untouched by this cut.
 *
 * It does not touch guest sessions. An expired session already has no
 * authority — every read resolves it and refuses — and an expired INVITATION
 * is a different thing from an expired SESSION: one is a link that can no
 * longer be redeemed, the other is a credential already issued to somebody who
 * accepted. Writing to the second would silently shorten a TTL that was
 * promised, so the sweep leaves it to the read path that already enforces it.
 *
 * ── Bounded, idempotent, and safe to run twice at once ─────────────────────
 *
 * Every write is a status-guarded `updateMany`, so a second pass finds nothing
 * and a concurrent worker loses the race harmlessly rather than duplicating an
 * effect. Work is taken in bounded batches; an interrupted run simply leaves
 * the rest for the next one.
 */

/**
 * How long a GROUP's follow-up stays open, from `followUpDueAt`.
 *
 * Seven days, and it is a product decision of this corrective cut rather than
 * a number derived from anything: no approved policy named one, and a stage
 * with no end is the finding this closes. It is derived from a timestamp that
 * already exists, so nothing new is stored — and the screens say it before
 * anybody takes part.
 *
 * The Dúo has no such deadline and does not gain one here.
 */
export const GROUP_FOLLOW_UP_WINDOW_DAYS = 7;
const GROUP_FOLLOW_UP_WINDOW_MS = GROUP_FOLLOW_UP_WINDOW_DAYS * 86_400_000;

export interface CirclesSweepSummary {
  readonly invitingCancelled: number;
  readonly followUpOpened: number;
  /** Groups whose roster can no longer be completed. */
  readonly incompleteGroupsCancelled: number;
  /** Groups whose follow-up window ran out. */
  readonly followUpClosed: number;
  readonly skippedRolloutOff: boolean;
}

const NOTHING: CirclesSweepSummary = Object.freeze({
  invitingCancelled: 0,
  followUpOpened: 0,
  incompleteGroupsCancelled: 0,
  followUpClosed: 0,
  skippedRolloutOff: true,
});

@Injectable()
export class CirclesSweepService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: CircleActivityRepository,
    private readonly events: CircleEventRepository,
    private readonly rollout: CirclesRolloutService,
    private readonly participants: CircleParticipantRepository,
    private readonly invitations: CircleInvitationRepository,
    private readonly guestSessions: CircleGuestSessionRepository,
  ) {}

  async sweep(
    options: {
      now?: Date;
      batchSize?: number;
      dryRun?: boolean;
    } = {},
  ): Promise<CirclesSweepSummary> {
    // Inert under `off`. The feature being switched off is a reason for its
    // own jobs to do nothing — unlike account deletion, which is an obligation
    // that does not depend on a rollout flag.
    if (this.rollout.currentMode() === "off") return NOTHING;

    const now = options.now ?? new Date();
    const batchSize = Math.min(Math.max(options.batchSize ?? 200, 1), 1000);
    const dryRun = options.dryRun === true;

    const invitingCancelled = await this.cancelStuckInviting(
      now,
      batchSize,
      dryRun,
    );
    const followUpOpened = await this.openDueFollowUps(now, batchSize, dryRun);
    const incompleteGroupsCancelled = await this.cancelIncompleteGroups(
      now,
      batchSize,
      dryRun,
    );
    const followUpClosed = await this.closeExpiredGroupFollowUps(
      now,
      batchSize,
      dryRun,
    );

    return {
      invitingCancelled,
      followUpOpened,
      incompleteGroupsCancelled,
      followUpClosed,
      skippedRolloutOff: false,
    };
  }

  /**
   * A group whose roster can no longer be completed.
   *
   * ── Why one dead link is enough ───────────────────────────────────────────
   *
   * The roster is fixed at creation and there are no substitutions, so every
   * invited seat is essential. If one of them holds a link that can no longer
   * be redeemed — expired, revoked or declined — that seat will never be
   * filled, the barrier will never count it, and the room can never open. The
   * `INVITING` rule above waits for EVERY invitation to die, which is right
   * for a Dúo (there is only one) and far too patient for a group.
   *
   * ── Why `PREPARING` is in the predicate ───────────────────────────────────
   *
   * Because an earlier cut of `exchange` moved the activity on the FIRST
   * acceptance, so groups exist that are `PREPARING` with seats still
   * `INVITED`. Selecting by status alone would step over exactly the rooms
   * this sweep was added for.
   *
   * The cancellation destroys pending envelopes and revokes what is left. It
   * appends `ACTIVITY_CANCELLED` and NOTHING else: no participant event, no
   * actor, no metadata. A clock did this, and the record says only that.
   */
  private async cancelIncompleteGroups(
    now: Date,
    batchSize: number,
    dryRun: boolean,
  ): Promise<number> {
    const stranded = await this.prisma.circleActivity.findMany({
      where: {
        kind: "GROUP_ADULT",
        status: { in: ["INVITING", "PREPARING"] },
        participants: {
          some: {
            status: "INVITED",
            invitation: {
              OR: [
                { revokedAt: { not: null } },
                { declinedAt: { not: null } },
                { expiresAt: { lte: now } },
              ],
            },
          },
        },
      },
      select: { id: true, circleId: true },
      orderBy: { id: "asc" },
      take: batchSize,
    });

    if (dryRun) return stranded.length;

    let cancelled = 0;
    for (const activity of stranded) {
      const moved = await this.prisma.$transaction(async (tx) => {
        // ── The access rows first, through the shared protocol ────────────
        //
        // This used to start at the ACTIVITY and reach the invitations three
        // statements later, which is the opposite of what `exchange` and
        // every command that ends an activity do. Two transactions taking the
        // same rows in opposite orders is the definition of a deadlock, and
        // it was reachable from a link that was still valid: a guest
        // accepting while the sweep was cancelling the room they were
        // accepting into.
        //
        // The order itself lives in `lockActivityAccessRows`, so this is the
        // same statement the participation service and account deletion make.
        // Nothing here waits, retries or sleeps — the cycle is gone.
        const links = await lockActivityAccessRows(
          { invitations: this.invitations, guestSessions: this.guestSessions },
          activity.id,
          tx as never,
        );

        // Re-read under the lock. A last acceptance, a withdrawal or another
        // worker may have settled this between the scan and here, and the
        // status guard on `cancel` is what makes losing that race harmless.
        const live = await this.activities.lockById(activity.id, tx as never);
        if (!live) return false;
        if (live.status !== "INVITING" && live.status !== "PREPARING") {
          return false;
        }

        // And the CAUSE itself, re-checked inside the transaction — read off
        // the invitation rows this transaction now holds rather than off a
        // fresh query, so what the decision is made on is the same snapshot
        // the locks are protecting. The seat that made this activity unviable
        // may have been filled by the acceptance that was in flight during
        // the scan, and an activity cancelled for a reason that stopped being
        // true is a room taken from people who could still have used it.
        const dead = links
          .filter(
            (link) =>
              link.revokedAt !== null ||
              link.declinedAt !== null ||
              link.expiresAt <= now,
          )
          .map((link) => link.id);
        if (dead.length === 0) return false;
        const stillStranded = await tx.circleActivityParticipant.count({
          where: {
            activityId: activity.id,
            status: "INVITED",
            invitationId: { in: dead },
          },
        });
        if (stillStranded === 0) return false;

        const seats = await tx.circleActivityParticipant.findMany({
          where: { activityId: activity.id },
          select: { id: true },
          orderBy: { id: "asc" },
        });
        for (const seat of seats) {
          await this.participants.purgeEnvelope(
            seat.id,
            activity.id,
            tx as never,
          );
        }
        await tx.circleInvitation.updateMany({
          where: { activityId: activity.id, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.circleGuestSession.updateMany({
          where: { activityId: activity.id, revokedAt: null },
          data: { revokedAt: now },
        });
        const ok = await this.activities.cancel(
          activity.id,
          now,
          ["INVITING", "PREPARING"],
          tx as never,
        );
        if (!ok) return false;
        await this.events.append(
          {
            circleId: activity.circleId,
            activityId: activity.id,
            type: "ACTIVITY_CANCELLED",
          },
          tx as never,
        );
        return true;
      });
      if (moved) cancelled += 1;
    }
    return cancelled;
  }

  /**
   * A group's follow-up, ended by the clock rather than left open forever.
   *
   * The window is `followUpDueAt + GROUP_FOLLOW_UP_WINDOW_DAYS`, derived from
   * a column that already exists. Groups only: the Dúo's follow-up policy is
   * not changed by this cut.
   *
   * It writes a status and an `ACTIVITY_CLOSED` event, and nothing else. No
   * decision is recorded for the seats that never answered, because none was
   * made — and the ledger has nowhere to claim otherwise.
   */
  private async closeExpiredGroupFollowUps(
    now: Date,
    batchSize: number,
    dryRun: boolean,
  ): Promise<number> {
    const deadline = new Date(now.getTime() - GROUP_FOLLOW_UP_WINDOW_MS);
    const expired = await this.prisma.circleActivity.findMany({
      where: {
        kind: "GROUP_ADULT",
        status: "FOLLOW_UP",
        followUpDueAt: { not: null, lte: deadline },
      },
      select: { id: true, circleId: true },
      orderBy: { id: "asc" },
      take: batchSize,
    });

    if (dryRun) return expired.length;

    let closed = 0;
    for (const activity of expired) {
      const moved = await this.prisma.$transaction(async (tx) => {
        // Status-guarded, so the last decision or a withdrawal that landed
        // first wins and this finds nothing to do.
        const ok = await this.activities.close(
          activity.id,
          now,
          ["FOLLOW_UP"],
          tx as never,
        );
        if (!ok) return false;
        await this.events.append(
          {
            circleId: activity.circleId,
            activityId: activity.id,
            type: "ACTIVITY_CLOSED",
          },
          tx as never,
        );
        return true;
      });
      if (moved) closed += 1;
    }
    return closed;
  }

  /**
   * `INVITING` activities with no invitation anybody could still redeem.
   *
   * "No LIVE invitation" rather than "an expired one": an activity can carry a
   * revoked invitation and a fresh one at the same time, and only the absence
   * of ANY usable invitation means it is stuck.
   */
  private async cancelStuckInviting(
    now: Date,
    batchSize: number,
    dryRun: boolean,
  ): Promise<number> {
    const stuck = await this.prisma.circleActivity.findMany({
      where: {
        // DÚO only, and the exclusion is the whole fix for a real finding.
        //
        // This pass runs FIRST and it cancels WITHOUT revoking sessions or
        // invitations, because a Dúo that never got off the ground has none to
        // revoke: nobody accepted, so no guest session was ever issued, and the
        // links are dead by definition of the predicate.
        //
        // A group is not that shape. Some of its seats CAN be accepted while
        // others are still waiting, so a group whose every link has expired —
        // the one an accepted guest already consumed included, since a consumed
        // invitation still has an `expiresAt` — matched this predicate too. It
        // was cancelled here, with a live guest session still pointing at it,
        // and `cancelIncompleteGroups` then skipped it for being CANCELLED
        // already. The credential outlived the room.
        //
        // So each modality takes its own route: this one cancels a Dúo, and
        // the group pass below cancels a group AND cleans up after it.
        kind: "DUO",
        status: "INVITING",
        invitations: {
          // At least one invitation exists…
          some: {},
          // …and none of them is still usable.
          every: {
            OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: now } }],
          },
        },
      },
      select: { id: true, circleId: true },
      orderBy: { id: "asc" },
      take: batchSize,
    });

    if (dryRun) return stuck.length;

    let cancelled = 0;
    for (const activity of stuck) {
      const moved = await this.prisma.$transaction(async (tx) => {
        // Status-guarded: a real withdrawal that landed first wins and this
        // finds nothing to do.
        const ok = await this.activities.cancel(
          activity.id,
          now,
          ["INVITING"],
          tx as never,
        );
        if (!ok) return false;
        await this.events.append(
          {
            circleId: activity.circleId,
            activityId: activity.id,
            type: "ACTIVITY_CANCELLED",
          },
          tx as never,
        );
        return true;
      });
      if (moved) cancelled += 1;
    }
    return cancelled;
  }

  /** `REVEALED` → `FOLLOW_UP`, on time and never past it. */
  private async openDueFollowUps(
    now: Date,
    batchSize: number,
    dryRun: boolean,
  ): Promise<number> {
    const due = await this.prisma.circleActivity.findMany({
      where: {
        status: "REVEALED",
        followUpDueAt: { not: null, lte: now },
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: batchSize,
    });

    if (dryRun) return due.length;

    let opened = 0;
    for (const activity of due) {
      const moved = await this.activities.openFollowUpIfDue(
        activity.id,
        now,
        this.prisma as never,
      );
      if (moved) opened += 1;
    }
    return opened;
  }
}
