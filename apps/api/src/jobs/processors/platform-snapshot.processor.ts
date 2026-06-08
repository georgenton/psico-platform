import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../prisma";
import {
  JobName,
  QueueName,
  type PlatformSnapshotJobPayload,
} from "../queue-names";

/**
 * Sprint S50 — PlatformSnapshotProcessor.
 *
 * Nightly 02:30 UTC. Computes a one-row snapshot for "yesterday in UTC"
 * and upserts it into `PlatformMetricDaily`. Powers the sparklines + "vs
 * last period" deltas on the Pulso Overview (S48).
 *
 * Why "yesterday" and not "today":
 *   - "Today" at 02:30 is still being lived; the counters are mid-flight.
 *   - "Yesterday" is closed and the counts are stable; we can re-run the
 *     same day's snapshot any number of times without ambiguity.
 *
 * Idempotency:
 *   - Upserts on `day` primary key. Two runs on the same day produce the
 *     same row (within the bounds of late-arriving data).
 *   - The cron + retry policy can re-fire safely.
 *
 * Privacy invariant (same as `getOverview`):
 *   - All columns are integer counts or floats. No per-user identifiers
 *     leave Postgres.
 *
 * Dry-run:
 *   - `payload.dryRun === true` computes the counts and logs them but
 *     does NOT write the row. Useful for ops verification.
 */
@Processor(QueueName.PLATFORM_SNAPSHOT)
export class PlatformSnapshotProcessor extends WorkerHost {
  private readonly logger = new Logger(PlatformSnapshotProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<PlatformSnapshotJobPayload>): Promise<void> {
    if (job.name !== JobName.RUN_PLATFORM_SNAPSHOT) {
      throw new Error(`PlatformSnapshotProcessor unknown job: ${job.name}`);
    }

    const day = this.resolveTargetDay(job.data.targetDay);
    const dayStart = day;
    const dayEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000);

    // ── Users block ─────────────────────────────────────────────────
    const [totalUsers, newUsers, paidUsers] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: { lt: dayEnd } } }),
      this.prisma.user.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
      }),
      this.prisma.user.count({
        where: {
          createdAt: { lt: dayEnd },
          plan: { in: ["PRO", "ANNUAL", "B2B"] },
        },
      }),
    ]);

    // ── Engagement (DAU) ────────────────────────────────────────────
    const dau = await this.countActiveUsers(dayStart, dayEnd);

    // ── Content block ───────────────────────────────────────────────
    const [
      diaryEntries,
      ecoMessages,
      ecoCrisis,
      voiceSeconds,
      readingSessions,
    ] = await Promise.all([
      this.prisma.diaryEntry.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
      }),
      this.prisma.ecoMessage.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd }, kind: "USER" },
      }),
      this.prisma.ecoMessage.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd }, kind: "CRISIS" },
      }),
      this.prisma.voiceTranscription.aggregate({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
        _sum: { durationSec: true },
      }),
      this.prisma.readingSession.count({
        where: { lastSeenAt: { gte: dayStart, lt: dayEnd } },
      }),
    ]);
    const voiceMinutes = (voiceSeconds._sum.durationSec ?? 0) / 60;

    // ── Pulso operations block ──────────────────────────────────────
    const [reportsOpened, reportsResolved] = await Promise.all([
      this.prisma.ecoMessageReport.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd } },
      }),
      // Reports whose `resolvedAt` (admin acted) fell within the day,
      // regardless of when the report was originally opened.
      this.prisma.ecoMessageReport.count({
        where: { resolvedAt: { gte: dayStart, lt: dayEnd } },
      }),
    ]);

    const counts = {
      totalUsers,
      newUsers,
      paidUsers,
      dau,
      diaryEntries,
      ecoMessages,
      ecoCrisis,
      voiceMinutes,
      readingSessions,
      reportsOpened,
      reportsResolved,
    };

    this.logger.log(
      `PlatformSnapshot day=${day.toISOString().slice(0, 10)} dryRun=${
        job.data.dryRun ? "true" : "false"
      } counts=${JSON.stringify(counts)}`,
    );

    if (job.data.dryRun) return;

    await this.prisma.platformMetricDaily.upsert({
      where: { day },
      create: { day, ...counts },
      update: counts,
    });

    this.logger.log(
      `PlatformSnapshot upserted · day=${day.toISOString().slice(0, 10)}`,
    );
  }

  /**
   * Distinct users with ANY activity in the window. Mirrors
   * `PulsoService.countActiveUsers` but scoped to a single day; Sets are
   * the right primitive when 4 tables need to be unioned without raw SQL.
   */
  private async countActiveUsers(start: Date, end: Date): Promise<number> {
    const [diary, eco, voice, reader] = await Promise.all([
      this.prisma.diaryEntry.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      this.prisma.ecoMessage.findMany({
        where: {
          createdAt: { gte: start, lt: end },
          kind: "USER",
        },
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

    const set = new Set<string>();
    for (const row of diary) set.add(row.userId);
    for (const row of eco) {
      if (row.thread?.userId) set.add(row.thread.userId);
    }
    for (const row of voice) set.add(row.userId);
    for (const row of reader) set.add(row.userId);
    return set.size;
  }

  /**
   * Resolve which UTC day to snapshot. Default: "yesterday" relative to
   * the job's runtime. Override via `payload.targetDay = "YYYY-MM-DD"` for
   * ops backfill.
   *
   * The returned Date is `T00:00:00.000Z` so it matches the PK convention.
   */
  private resolveTargetDay(override: string | undefined): Date {
    if (override) {
      // Parse as UTC midnight regardless of server TZ.
      const day = new Date(`${override}T00:00:00.000Z`);
      if (Number.isNaN(day.getTime())) {
        throw new Error(`PlatformSnapshot invalid targetDay: ${override}`);
      }
      return day;
    }
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    now.setUTCDate(now.getUTCDate() - 1);
    return now;
  }
}
