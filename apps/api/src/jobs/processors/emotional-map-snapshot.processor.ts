import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";

import type { PrismaService } from "../../prisma";
import type { EmotionalMapService } from "../../emotional-map/emotional-map.service";
import {
  JobName,
  QueueName,
  type EmotionalMapSnapshotJobPayload,
} from "../queue-names";

/**
 * EmotionalMapSnapshotProcessor — Sprint G2.
 *
 * Fan-out: iterate every user with at least one diary entry or reading
 * session, recompute their emotional map via the existing
 * `EmotionalMapService.compute(userId)`, and upsert a single
 * `EmotionalMapSnapshot` row keyed on `(userId, month)`.
 *
 * Why fan-out from a single job rather than enqueuing one job per user:
 *   - At v1 scale (~1k users), a single sequential pass with await is
 *     well under the per-job timeout. We pay one Redis round-trip per
 *     run instead of N.
 *   - The LLM provider already has its own rate-limiting baked into the
 *     IEmotionalMapProvider implementations.
 *
 * Per-user errors are isolated: the LLM might 5xx for one user but the
 * next user's snapshot must still land. We log + continue.
 *
 * Idempotency: upserting on `(userId, month)` means re-running the same
 * month (cron retry, ops backfill) overwrites the existing row — safe.
 */
@Processor(QueueName.EMOTIONAL_MAP_SNAPSHOT)
export class EmotionalMapSnapshotProcessor extends WorkerHost {
  private readonly logger = new Logger(EmotionalMapSnapshotProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emotionalMap: EmotionalMapService,
  ) {
    super();
  }

  async process(job: Job<EmotionalMapSnapshotJobPayload>): Promise<{
    candidates: number;
    persisted: number;
    failed: number;
    monthIso: string;
    dryRun: boolean;
  }> {
    if (job.name !== JobName.RUN_EMOTIONAL_MAP_SNAPSHOT) {
      // Unknown sub-job — no-op rather than fail to keep the queue clean.
      this.logger.warn(`Unknown job name "${job.name}" on emotional-map queue`);
      return {
        candidates: 0,
        persisted: 0,
        failed: 0,
        monthIso: "",
        dryRun: !!job.data?.dryRun,
      };
    }

    const month = resolveTargetMonth(job.data?.targetMonth);
    const dryRun = !!job.data?.dryRun;
    const monthIso = month.toISOString();

    // Candidate set: users with at least one diary entry OR reading session.
    // We deliberately skip cold accounts — they would produce a neutral
    // snapshot (0.5 across all axes) every month, polluting the chart.
    const userRows = await this.prisma.user.findMany({
      where: {
        OR: [{ diaryEntries: { some: {} } }, { readingSessions: { some: {} } }],
      },
      select: { id: true },
    });

    if (dryRun) {
      this.logger.log(
        `EmotionalMapSnapshot dryRun · month=${monthIso} · candidates=${userRows.length}`,
      );
      return {
        candidates: userRows.length,
        persisted: 0,
        failed: 0,
        monthIso,
        dryRun: true,
      };
    }

    let persisted = 0;
    let failed = 0;
    for (const { id: userId } of userRows) {
      try {
        const result = await this.emotionalMap.compute(userId);
        await this.prisma.emotionalMapSnapshot.upsert({
          where: {
            userId_month: { userId, month },
          },
          create: {
            userId,
            month,
            pct: result.pct,
            values: Array.from(result.values),
            provider: result.provider,
          },
          update: {
            pct: result.pct,
            values: Array.from(result.values),
            provider: result.provider,
          },
        });
        persisted++;
      } catch (err) {
        failed++;
        this.logger.warn(
          `EmotionalMapSnapshot failed for user=${userId} · ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `EmotionalMapSnapshot done · month=${monthIso} · persisted=${persisted}/${userRows.length} · failed=${failed}`,
    );

    return {
      candidates: userRows.length,
      persisted,
      failed,
      monthIso,
      dryRun: false,
    };
  }
}

/**
 * Resolve which month to snapshot.
 *  - With `targetMonth` set: parse, anchor to the first of that month UTC.
 *  - Without: anchor to the first of the CURRENT UTC month. The cron fires
 *    on the 1st at 04:00 UTC, so "current" === "the month we're starting".
 */
function resolveTargetMonth(targetMonth: string | undefined): Date {
  if (targetMonth) {
    const parsed = new Date(`${targetMonth}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(
        Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1),
      );
    }
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
