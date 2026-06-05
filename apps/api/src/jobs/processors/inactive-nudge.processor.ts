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

/**
 * Sprint S44 — InactiveNudgeProcessor.
 *
 * Nightly 18:00 UTC. Finds users who:
 *   1. Have written ≥1 diary entry ever (engaged-before signal).
 *   2. Haven't written in 3+ days (silence signal).
 *   3. Have `NotificationSettings.dailyReminder === true`.
 *   4. Have `User.lastNudgedAt` null OR > 4 days ago (don't spam).
 *
 * Sends a single push and bumps `lastNudgedAt`. Email is NOT used here —
 * email re-engagement is the WeeklyDigest's job, not the daily nudge.
 *
 * Privacy: no diary content is included; the message is generic.
 */
const SILENCE_DAYS = 3;
const MIN_DAYS_BETWEEN_NUDGES = 4;

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

    const now = new Date();
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
      },
    });

    this.logger.log(`InactiveNudge candidates=${candidates.length}`);
    if (job.data.dryRun) {
      this.logger.log("InactiveNudge dryRun=true, no pushes sent");
      return;
    }

    let sent = 0;
    for (const c of candidates) {
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
    this.logger.log(`InactiveNudge done · sent=${sent}/${candidates.length}`);
  }
}
