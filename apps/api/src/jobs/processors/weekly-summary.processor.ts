import { Processor, WorkerHost } from "@nestjs/bullmq";
import { ForbiddenException, Logger } from "@nestjs/common";
import type { Plan } from "@prisma/client";
import type { Job } from "bullmq";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PatronesService } from "../../patrones/patrones.service";
import {
  JobName,
  QueueName,
  type WeeklySummaryGenerationJobPayload,
} from "../queue-names";

/**
 * Sprint S46 — WeeklySummaryGenerationProcessor.
 *
 * Sunday 23:00 UTC. Pre-generates `WeeklySummary` rows for Pro users with
 * `NotificationSettings.weeklyReport === true` so the Monday 07:00 UTC
 * `WeeklyDigestProcessor` finds them and includes the LLM narrative in the
 * email body.
 *
 * Reuses `PatronesService.regenerateWeeklySummary(userId, plan)` so the
 * generation path (LLM + rule-based fallback + upsert + privacy invariants)
 * lives in EXACTLY ONE place. The processor is just a fan-out + retry
 * shell.
 *
 * Privacy invariant: same as PatronesService — the LLM only ever sees
 * categorical metadata (mood + tags + counts), never the diary body
 * (which is encrypted and the server has no key to decrypt).
 *
 * Idempotency: `regenerateWeeklySummary` upserts on `(userId, weekStart)`,
 * so re-running the same Sunday is safe and just overwrites.
 *
 * Why the candidate set is "Pro users with weeklyReport=true":
 *   1. FREE users would 403 from the underlying service — no point.
 *   2. weeklyReport=false → the digest skips them anyway → no point
 *      paying for the LLM call.
 *   3. Less-than-MIN_ENTRIES_FOR_FULL_VIEW (7) users: the service throws
 *      "NOT_ENOUGH_ENTRIES" which we swallow per-user.
 *
 * Failure isolation: per-user errors are caught and logged, the run
 * continues. One LLM 5xx for user A does not block user B's generation.
 */
@Processor(QueueName.WEEKLY_SUMMARY_GENERATION)
export class WeeklySummaryGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(WeeklySummaryGenerationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly patrones: PatronesService,
  ) {
    super();
  }

  async process(job: Job<WeeklySummaryGenerationJobPayload>): Promise<void> {
    if (job.name !== JobName.RUN_WEEKLY_SUMMARY_GENERATION) {
      throw new Error(
        `WeeklySummaryGenerationProcessor unknown job: ${job.name}`,
      );
    }

    // Find candidates: Pro+ plan AND weeklyReport=true. We skip the
    // diaryEntries threshold check here — the service applies its own
    // (MIN_ENTRIES_FOR_FULL_VIEW = 7) and throws NOT_ENOUGH_ENTRIES which
    // we swallow. Pushing the check up here would duplicate the rule.
    const candidates = await this.prisma.user.findMany({
      where: {
        isActive: true,
        plan: { in: ["PRO", "ANNUAL", "B2B"] as Plan[] },
        notificationSettings: { is: { weeklyReport: true } },
      },
      select: { id: true, plan: true },
    });

    this.logger.log(
      `WeeklySummaryGeneration candidates=${candidates.length} dryRun=${
        job.data.dryRun ? "true" : "false"
      }`,
    );

    if (job.data.dryRun) {
      this.logger.log("WeeklySummaryGeneration dryRun=true, no LLM calls made");
      return;
    }

    let generated = 0;
    let skippedNotEnough = 0;
    let failed = 0;

    for (const c of candidates) {
      try {
        await this.patrones.regenerateWeeklySummary(c.id, c.plan);
        generated++;
      } catch (err) {
        // PatronesService throws raw `Error("NOT_ENOUGH_ENTRIES")` for users
        // below the 7-entry threshold — common and expected.
        if ((err as Error).message === "NOT_ENOUGH_ENTRIES") {
          skippedNotEnough++;
          continue;
        }
        // Defensive: if a FREE user somehow snuck past the candidate query
        // (e.g. plan transition mid-run), `regenerateWeeklySummary` throws
        // ForbiddenException. Swallow + log; do NOT fail the whole run.
        if (err instanceof ForbiddenException) {
          this.logger.warn(
            `WeeklySummaryGeneration skipped FREE user=${c.id} (race with plan change?)`,
          );
          continue;
        }
        // Any other error (LLM 5xx that PatronesService didn't catch, DB
        // hiccup, etc.) we log + continue — the user simply won't have a
        // narrative this week and the digest will fall back to its
        // editorial-less version.
        failed++;
        this.logger.warn(
          `WeeklySummaryGeneration failed for user=${c.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `WeeklySummaryGeneration done · generated=${generated} · skippedNotEnough=${skippedNotEnough} · failed=${failed} · total=${candidates.length}`,
    );
  }
}
