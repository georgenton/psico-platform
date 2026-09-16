import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CirclesSweepService } from "../../circles/circles-sweep.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CirclesAnalyticsService } from "../../circles/circles-analytics.service";
import {
  JobName,
  QueueName,
  type CirclesSweepJobPayload,
} from "../queue-names";

/**
 * The Círculos temporal sweep, on the existing worker.
 *
 * All the judgement lives in `CirclesSweepService`; this is the shell that runs
 * it, keeps the run bounded, and reports COUNTS. Under rollout `off` the
 * service returns immediately and the job is a no-op — the flag being off is a
 * reason for the feature's own timers to stay quiet.
 *
 * ── Retention runs either way ──────────────────────────────────────────────
 *
 * The analytics sweep is NOT behind the rollout, and that asymmetry is
 * deliberate. Cancelling a stuck invitation is a product behaviour, and a
 * product that is switched off should not be doing it. Deleting data whose
 * retention has expired is an obligation to the people it came from, and
 * turning a feature off is not a reason to keep their contributions longer.
 *
 * Same job rather than a new queue: one timer, one place to look, and the
 * counts land in the same line.
 */
@Processor(QueueName.CIRCLES_SWEEP)
export class CirclesSweepProcessor extends WorkerHost {
  private readonly logger = new Logger(CirclesSweepProcessor.name);

  constructor(
    private readonly sweep: CirclesSweepService,
    private readonly analytics: CirclesAnalyticsService,
  ) {
    super();
  }

  async process(job: Job<CirclesSweepJobPayload>): Promise<void> {
    if (job.name !== JobName.RUN_CIRCLES_SWEEP) {
      throw new Error(`CirclesSweepProcessor unknown job name: ${job.name}`);
    }

    const { nowIso, batchSize, dryRun } = job.data ?? {};
    const now = nowIso ? new Date(nowIso) : new Date();

    // FIRST, and regardless of the rollout. See the header: this is the part
    // that deletes rather than the part that acts.
    if (!dryRun) {
      const retention = await this.analytics.sweep(now);
      if (
        retention.deletedContributions > 0 ||
        retention.deletedFacts > 0 ||
        retention.foldedWeeks > 0
      ) {
        // Counts only. No seat, no activity, no topic.
        this.logger.log(
          `circles analytics retention: folded=${retention.foldedWeeks} ` +
            `deletedContributions=${retention.deletedContributions} ` +
            `deletedFacts=${retention.deletedFacts}`,
        );
      }
    }

    const result = await this.sweep.sweep({
      now: nowIso ? new Date(nowIso) : undefined,
      batchSize,
      dryRun,
    });

    if (result.skippedRolloutOff) return;

    // Counts only — no activity, circle or invitation id.
    if (
      result.invitingCancelled > 0 ||
      result.followUpOpened > 0 ||
      result.incompleteGroupsCancelled > 0 ||
      result.followUpClosed > 0
    ) {
      this.logger.log(
        `circles sweep: invitingCancelled=${result.invitingCancelled} ` +
          `followUpOpened=${result.followUpOpened} ` +
          `incompleteGroupsCancelled=${result.incompleteGroupsCancelled} ` +
          `followUpClosed=${result.followUpClosed}`,
      );
    }
  }
}
