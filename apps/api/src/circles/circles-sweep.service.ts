import { Injectable } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleActivityRepository } from "./circle-activity.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleEventRepository } from "./circle-event.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CirclesRolloutService } from "./circles-rollout.service";

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
 *   1. An `INVITING` activity whose every invitation has EXPIRED is cancelled.
 *      Nobody can accept it any more — the link is dead — so leaving it
 *      `INVITING` forever is not neutrality, it is a permanent lie in the
 *      organiser's list. This is the same terminal state the organiser's own
 *      retraction produces, for the same reason.
 *
 *   2. A `REVEALED` activity whose `followUpDueAt` has arrived moves to
 *      `FOLLOW_UP`. This transition already exists as
 *      `openFollowUpIfDue` — the sweep only calls it on time.
 *
 * ── And what it must NOT ───────────────────────────────────────────────────
 *
 * It does not close a `FOLLOW_UP`. Reaching the date is not the same as making
 * the decision the stage exists to collect, and an activity closed by a timer
 * would record a choice nobody made.
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

export interface CirclesSweepSummary {
  readonly invitingCancelled: number;
  readonly followUpOpened: number;
  readonly skippedRolloutOff: boolean;
}

const NOTHING: CirclesSweepSummary = Object.freeze({
  invitingCancelled: 0,
  followUpOpened: 0,
  skippedRolloutOff: true,
});

@Injectable()
export class CirclesSweepService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: CircleActivityRepository,
    private readonly events: CircleEventRepository,
    private readonly rollout: CirclesRolloutService,
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

    return { invitingCancelled, followUpOpened, skippedRolloutOff: false };
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
