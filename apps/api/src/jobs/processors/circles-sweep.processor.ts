import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CirclesSweepService } from "../../circles/circles-sweep.service";
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
 */
@Processor(QueueName.CIRCLES_SWEEP)
export class CirclesSweepProcessor extends WorkerHost {
  private readonly logger = new Logger(CirclesSweepProcessor.name);

  constructor(private readonly sweep: CirclesSweepService) {
    super();
  }

  async process(job: Job<CirclesSweepJobPayload>): Promise<void> {
    if (job.name !== JobName.RUN_CIRCLES_SWEEP) {
      throw new Error(`CirclesSweepProcessor unknown job name: ${job.name}`);
    }

    const { nowIso, batchSize, dryRun } = job.data ?? {};
    const result = await this.sweep.sweep({
      now: nowIso ? new Date(nowIso) : undefined,
      batchSize,
      dryRun,
    });

    if (result.skippedRolloutOff) return;

    // Counts only — no activity, circle or invitation id.
    if (result.invitingCancelled > 0 || result.followUpOpened > 0) {
      this.logger.log(
        `circles sweep: invitingCancelled=${result.invitingCancelled} ` +
          `followUpOpened=${result.followUpOpened}`,
      );
    }
  }
}
