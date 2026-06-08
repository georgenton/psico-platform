import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PushService } from "../../notifications/push.service";
import {
  JobName,
  QueueName,
  type InactiveNudgeJobPayload,
} from "../queue-names";
<<<<<<< HEAD
import { userLocalHour } from "../utils/timezone";

/**
 * Sprint S44 → S53 — InactiveNudgeProcessor (now timezone-aware).
 *
 * HOURLY UTC. For each candidate user we compute their local hour using
 * `Profile.timezone`. Only those whose local hour === 18 at the cron's
 * `now` actually get a push. Users without a timezone fall back to UTC
 * (preserves S44 behavior for legacy accounts).
 *
 * Candidate filter (unchanged from S44):
 *   1. Has written ≥1 diary entry ever (engaged-before signal).
 *   2. Haven't written in 3+ days (silence signal).
 *   3. Has `NotificationSettings.dailyReminder === true`.
 *   4. Has `User.lastNudgedAt` null OR > 4 days ago (don't spam).
=======

/**
 * Sprint S44 — InactiveNudgeProcessor.
 *
 * Nightly 18:00 UTC. Finds users who:
 *   1. Have written ≥1 diary entry ever (engaged-before signal).
 *   2. Haven't written in 3+ days (silence signal).
 *   3. Have `NotificationSettings.dailyReminder === true`.
 *   4. Have `User.lastNudgedAt` null OR > 4 days ago (don't spam).
>>>>>>> origin/main
 *
 * Sends a single push and bumps `lastNudgedAt`. Email is NOT used here —
 * email re-engagement is the WeeklyDigest's job, not the daily nudge.
 *
 * Privacy: no diary content is included; the message is generic.
 */
const SILENCE_DAYS = 3;
const MIN_DAYS_BETWEEN_NUDGES = 4;
<<<<<<< HEAD
const NUDGE_TARGET_HOUR = 18; // Sprint S53
=======
>>>>>>> origin/main

@Processor(QueueName.INACTIVE_NUDGE)
export class InactiveNudgeProcessor extends WorkerHost {
  private readonly logger = new Logger(InactiveNudgeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {
    super();
  }

  async process(job: Job<InactiveNudgeJobPayload>): Promise<void> {
    if (job.name !== JobName.SEND_INACTIVE_NUDGE) {
      throw new Error(`InactiveNudgeProcessor unknown job: ${job.name}`);
    }

<<<<<<< HEAD
    // Sprint S53 — tests may override `now` to exercise the per-user
    // timezone gate at deterministic UTC moments.
    const now = job.data.nowIso ? new Date(job.data.nowIso) : new Date();
=======
    const now = new Date();
>>>>>>> origin/main
    const silenceCutoff = new Date(
      now.getTime() - SILENCE_DAYS * 24 * 60 * 60 * 1000,
    );
    const nudgeCutoff = new Date(
      now.getTime() - MIN_DAYS_BETWEEN_NUDGES * 24 * 60 * 60 * 1000,
    );

    // Find candidates with raw SQL semantics expressed via Prisma. The
    // chain of conditions narrows the universe before we touch
    // notificationSettings (which is a 1:1 relation requiring a join).
    const candidates = await this.prisma.user.findMany({
      where: {
        isActive: true,
        notificationSettings: { is: { dailyReminder: true } },
        // Has at least one diary entry ever.
        diaryEntries: { some: {} },
        // Last entry is older than the silence cutoff.
        // We approximate via: NOT (any entry created after silenceCutoff).
        NOT: { diaryEntries: { some: { createdAt: { gte: silenceCutoff } } } },
        // Either never nudged, or last nudge older than the spam cutoff.
        OR: [{ lastNudgedAt: null }, { lastNudgedAt: { lt: nudgeCutoff } }],
      },
      select: {
        id: true,
        firstName: true,
        deviceTokens: { select: { token: true } },
<<<<<<< HEAD
        profile: { select: { timezone: true } },
=======
>>>>>>> origin/main
      },
    });

    this.logger.log(`InactiveNudge candidates=${candidates.length}`);
    if (job.data.dryRun) {
      this.logger.log("InactiveNudge dryRun=true, no pushes sent");
      return;
    }

    let sent = 0;
<<<<<<< HEAD
    let skippedByTz = 0;
    for (const c of candidates) {
      // Sprint S53 — Per-user TZ gate. The hourly cron fan-outs to ALL
      // candidates; we filter here so each user only gets nudged at
      // their local 18:00 (or UTC 18:00 if timezone is null).
      const tz = c.profile?.timezone ?? null;
      if (userLocalHour(now, tz) !== NUDGE_TARGET_HOUR) {
        skippedByTz++;
        continue;
      }
=======
    for (const c of candidates) {
>>>>>>> origin/main
      if (c.deviceTokens.length === 0) continue; // no way to reach them
      try {
        const tokens = c.deviceTokens.map((d) => d.token);
        const receipts = await this.push.sendToTokens(tokens, {
          title: c.firstName
            ? `¿Cómo estás, ${c.firstName}?`
            : "¿Cómo estás hoy?",
          body: "Tu diario te espera. Una entrada corta es suficiente.",
          url: "/(tabs)/diario",
        });

        // Prune stale tokens; only bump lastNudgedAt if at least one
        // receipt was successful — if all tokens are stale we want to
        // re-nudge next night after they re-install.
        const stales = receipts
          .map((r) => r.invalidToken)
          .filter((t): t is string => Boolean(t));
        if (stales.length > 0) {
          await this.prisma.deviceToken.deleteMany({
            where: { token: { in: stales } },
          });
        }
        const anyOk = receipts.some((r) => r.status === "ok");
        if (anyOk) {
          await this.prisma.user.update({
            where: { id: c.id },
            data: { lastNudgedAt: now },
          });
          sent++;
        }
      } catch (err) {
        this.logger.warn(
          `InactiveNudge push failed for user=${c.id}: ${(err as Error).message}`,
        );
      }
    }
<<<<<<< HEAD
    this.logger.log(
      `InactiveNudge done · sent=${sent} · skippedByTz=${skippedByTz} · total=${candidates.length}`,
    );
=======
    this.logger.log(`InactiveNudge done · sent=${sent}/${candidates.length}`);
>>>>>>> origin/main
  }
}
