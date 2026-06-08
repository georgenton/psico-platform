import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../prisma";
import {
  JobName,
  QueueName,
  type CohortRetentionJobPayload,
} from "../queue-names";

/**
 * Sprint S51 — CohortRetentionProcessor.
 *
 * Monday 03:00 UTC. Rebuilds the entire `CohortRetentionWeek` triangle for
 * the last `horizonWeeks` of signup history (default 52). Idempotent —
 * upserts on `(cohortWeek, weekOffset)`.
 *
 * Algorithm:
 *   1. Compute the list of week-start dates (Mondays 00:00:00 UTC) from
 *      `now - horizonWeeks` back to "this Monday".
 *   2. For each cohortWeek, fetch the set of users whose `createdAt` fell
 *      within that week. `cohortSize` = |set|.
 *   3. For each weekOffset from 0 to (this Monday - cohortWeek) in weeks,
 *      count how many of those users had ANY activity in the offset
 *      window [cohortWeek + offset*7d, +1 week). That's `activeUsers`.
 *   4. Upsert one row per (cohortWeek, weekOffset).
 *
 * Cost:
 *   - The triangle has at most N×(N+1)/2 cells where N=52 → ~1378 cells.
 *   - Each cell does 4 distinct-userId queries (diary, eco USER, voice,
 *     reader) limited to the cohort's user set. With proper indexing
 *     this is ~50-100ms per cell; full run ~2 min worst case.
 *   - In practice early cohorts are small so the user-set filter makes
 *     most queries cheap.
 *
 * Privacy invariant (same as PlatformMetricDaily):
 *   - The output table holds only integer counts. The processor never
 *     writes a userId to the cells. The user-id sets exist only in RAM
 *     during the compute.
 *
 * Dry-run:
 *   - `payload.dryRun === true` computes counts and logs the summary but
 *     does NOT upsert. Useful for ops verification of horizon changes.
 */
@Processor(QueueName.COHORT_RETENTION)
export class CohortRetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(CohortRetentionProcessor.name);
  private static readonly DEFAULT_HORIZON_WEEKS = 52;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<CohortRetentionJobPayload>): Promise<void> {
    if (job.name !== JobName.RUN_COHORT_RETENTION) {
      throw new Error(`CohortRetentionProcessor unknown job: ${job.name}`);
    }

    const horizonWeeks =
      job.data.horizonWeeks ?? CohortRetentionProcessor.DEFAULT_HORIZON_WEEKS;
    const thisMonday = startOfThisISOWeekUtc();
    // Build cohort week-starts from oldest to newest.
    const cohortStarts: Date[] = [];
    for (let i = horizonWeeks; i >= 0; i--) {
      const d = new Date(thisMonday);
      d.setUTCDate(d.getUTCDate() - i * 7);
      cohortStarts.push(d);
    }

    this.logger.log(
      `CohortRetention start · cohorts=${cohortStarts.length} dryRun=${
        job.data.dryRun ? "true" : "false"
      }`,
    );

    let cellsWritten = 0;
    let cellsSkipped = 0;

    for (const cohortWeek of cohortStarts) {
      const cohortEnd = addDays(cohortWeek, 7);
      const cohort = await this.prisma.user.findMany({
        where: { createdAt: { gte: cohortWeek, lt: cohortEnd } },
        select: { id: true },
      });
      const cohortIds = new Set(cohort.map((u) => u.id));
      const cohortSize = cohortIds.size;

      if (cohortSize === 0) {
        // Skip empty cohorts — writing zero rows wastes IO and the
        // heatmap renders blank cells anyway.
        cellsSkipped++;
        continue;
      }

      // Offsets from 0 to "this Monday" inclusive. For the just-starting
      // cohort the only offset is 0; for the oldest cohort there are
      // `horizonWeeks` offsets.
      const maxOffset = weeksBetween(cohortWeek, thisMonday);
      for (let offset = 0; offset <= maxOffset; offset++) {
        const windowStart = addDays(cohortWeek, offset * 7);
        const windowEnd = addDays(windowStart, 7);
        const activeUsers = await this.countActiveCohortMembers(
          cohortIds,
          windowStart,
          windowEnd,
        );

        if (job.data.dryRun) {
          cellsWritten++;
          continue;
        }

        await this.prisma.cohortRetentionWeek.upsert({
          where: {
            cohortWeek_weekOffset: { cohortWeek, weekOffset: offset },
          },
          create: {
            cohortWeek,
            weekOffset: offset,
            cohortSize,
            activeUsers,
          },
          update: { cohortSize, activeUsers },
        });
        cellsWritten++;
      }
    }

    this.logger.log(
      `CohortRetention done · cellsWritten=${cellsWritten} cohortsSkipped=${cellsSkipped} dryRun=${
        job.data.dryRun ? "true" : "false"
      }`,
    );
  }

  /**
   * Count distinct cohort members with ANY activity (diary, eco USER,
   * voice, reader) inside `[start, end)`. Same activity sources as the
   * `PlatformMetricDaily` DAU calculation — keeps the cohort retention
   * definition aligned with the snapshot DAU users see in the Overview.
   *
   * The cohort filter happens client-side (in the Set) rather than as a
   * Prisma `where: { userId: { in: ids } }` because:
   *   - For tiny cohorts (early product days), the IN clause is fine.
   *   - For larger cohorts (1k+), the IN clause overflows Postgres's
   *     practical limit. Filtering client-side scales without changes.
   *
   * Trade-off: we fetch all activity in the window and intersect with
   * the cohort set. That's O(activity_in_window). For a 1-week window
   * this is bounded — total platform activity, not per-cohort.
   */
  private async countActiveCohortMembers(
    cohortIds: Set<string>,
    start: Date,
    end: Date,
  ): Promise<number> {
    const [diary, eco, voice, reader] = await Promise.all([
      this.prisma.diaryEntry.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      this.prisma.ecoMessage.findMany({
        where: { createdAt: { gte: start, lt: end }, kind: "USER" },
        select: { thread: { select: { userId: true } } },
        distinct: ["threadId"],
      }),
      this.prisma.voiceTranscription.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      this.prisma.readingSession.findMany({
        where: { lastSeenAt: { gte: start, lt: end } },
        select: { userId: true },
        distinct: ["userId"],
      }),
    ]);

    const active = new Set<string>();
    for (const r of diary) if (cohortIds.has(r.userId)) active.add(r.userId);
    for (const r of eco) {
      const uid = r.thread?.userId;
      if (uid && cohortIds.has(uid)) active.add(uid);
    }
    for (const r of voice) if (cohortIds.has(r.userId)) active.add(r.userId);
    for (const r of reader) if (cohortIds.has(r.userId)) active.add(r.userId);
    return active.size;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Monday 00:00:00 UTC of the current ISO week. We anchor cohorts to
 * Monday so a "weekOffset" stride of 7 days lines up exactly.
 */
function startOfThisISOWeekUtc(): Date {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? 6 : day - 1;
  now.setUTCDate(now.getUTCDate() - diff);
  return now;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function weeksBetween(earlier: Date, later: Date): number {
  const ms = later.getTime() - earlier.getTime();
  return Math.max(0, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)));
}
