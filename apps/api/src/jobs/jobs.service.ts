import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import {
  JobName,
  QueueName,
  type AccountDeletionJobPayload,
  type CohortRetentionJobPayload,
  type DailyUsageJobPayload,
  type EmotionalMapSnapshotJobPayload,
  type DataExportJobPayload,
  type EmailJobPayload,
  type InactiveNudgeJobPayload,
  type PlatformSnapshotJobPayload,
  type WeeklyDigestJobPayload,
  type WeeklySummaryGenerationJobPayload,
} from "./queue-names";

const DAYS = 24 * 60 * 60 * 1000;
// Repeatable-job id for the nightly usage rollup. Using a stable id means
// re-deploys don't pile up duplicate cron entries — BullMQ's
// upsertJobScheduler upserts on it.
const DAILY_USAGE_SCHEDULER_ID = "daily-usage-02-utc";

// Sprint S44 — Weekly digest scheduler. Monday 07:00 UTC. UTC chosen for
// predictability; the digest covers the previous ISO week (Mon→Sun UTC).
const WEEKLY_DIGEST_SCHEDULER_ID = "weekly-digest-monday-07-utc";

// Sprint S44 — Nightly nudge scheduler. 18:00 UTC ≈ midday in LATAM,
// evening in EU — chosen so the push doesn't wake anyone up.
const INACTIVE_NUDGE_SCHEDULER_ID = "inactive-nudge-18-utc";

// Sprint S46 — Pre-generate WeeklySummary so the Monday digest finds it.
// Sunday 23:00 UTC covers the full ISO week (Mon→Sun) AND leaves 8h of
// buffer before the Monday 07:00 UTC digest cron — enough room for retries
// if the LLM hits a transient 5xx.
const WEEKLY_SUMMARY_SCHEDULER_ID = "weekly-summary-sunday-23-utc";

// Sprint S50 — Platform-wide daily snapshot. 02:30 UTC so it lands after
// the daily-usage rollup at 02:00 (no resource contention, billing data
// settled). The snapshot writes ONE row per day, so the schedule is daily.
const PLATFORM_SNAPSHOT_SCHEDULER_ID = "platform-snapshot-02-30-utc";

// Sprint S51 — Cohort retention recomputation. Monday 03:00 UTC, right
// after the daily snapshot. Rebuilds the full retention triangle once per
// week (more frequent runs add no signal because cohorts are weekly).
const COHORT_RETENTION_SCHEDULER_ID = "cohort-retention-monday-03-utc";

// Sprint G2 — Monthly emotional-map snapshot. 1st of each month at 04:00
// UTC, after the daily snapshot (02:30) and cohort retention (Mon 03:00).
// One row per user per month — the chart fills in as time passes.
const EMOTIONAL_MAP_SNAPSHOT_SCHEDULER_ID =
  "emotional-map-snapshot-monthly-04-utc";

/**
 * Producer-side API for enqueuing background work. Feature services inject
 * this and call the relevant `enqueueX()` method. They never touch BullMQ
 * directly — keeps the surface area small and the retry policy centralised.
 *
 * Why one service for all queues instead of one service per queue:
 *  - Three queues today. Adding a service for each is overengineering.
 *  - All retry / backoff conventions live in one file → easier to audit.
 *  - When we hit ~6 queues, split into per-domain services (e.g.
 *    `EmailJobsService`, `UserJobsService`).
 */
@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectQueue(QueueName.EMAIL)
    private readonly emailQueue: Queue<EmailJobPayload>,
    @InjectQueue(QueueName.DATA_EXPORT)
    private readonly dataExportQueue: Queue<DataExportJobPayload>,
    @InjectQueue(QueueName.ACCOUNT_DELETION)
    private readonly accountDeletionQueue: Queue<AccountDeletionJobPayload>,
    @InjectQueue(QueueName.DAILY_USAGE)
    private readonly dailyUsageQueue: Queue<DailyUsageJobPayload>,
    // Sprint S44 — notification scheduling queues.
    @InjectQueue(QueueName.WEEKLY_DIGEST)
    private readonly weeklyDigestQueue: Queue<WeeklyDigestJobPayload>,
    @InjectQueue(QueueName.INACTIVE_NUDGE)
    private readonly inactiveNudgeQueue: Queue<InactiveNudgeJobPayload>,
    // Sprint S46 — weekly summary pre-generation.
    @InjectQueue(QueueName.WEEKLY_SUMMARY_GENERATION)
    private readonly weeklySummaryQueue: Queue<WeeklySummaryGenerationJobPayload>,
    // Sprint S50 — platform-wide daily snapshot.
    @InjectQueue(QueueName.PLATFORM_SNAPSHOT)
    private readonly platformSnapshotQueue: Queue<PlatformSnapshotJobPayload>,
    // Sprint S51 — weekly cohort retention recomputation.
    @InjectQueue(QueueName.COHORT_RETENTION)
    private readonly cohortRetentionQueue: Queue<CohortRetentionJobPayload>,
    // Sprint G2 — monthly emotional-map snapshot.
    @InjectQueue(QueueName.EMOTIONAL_MAP_SNAPSHOT)
    private readonly emotionalMapSnapshotQueue: Queue<EmotionalMapSnapshotJobPayload>,
  ) {}

  /**
   * Register the nightly usage-rollup scheduler when the API boots.
   *
   * Why we register here (in the producer) rather than in the worker:
   *   - Schedulers belong with their producers — the API knows the cron
   *     and the policy; the worker just consumes whatever lands in Redis.
   *   - Redis-backed schedulers are idempotent across deploys (the
   *     repeatable-job id deduplicates).
   *   - The worker can boot fresh without first picking up the schedule
   *     from cold storage.
   *
   * Skip in test/CI:
   *   - Unit + E2E tests boot the full AppModule without a real Redis.
   *     BullMQ's `upsertJobScheduler` performs a Redis round-trip and
   *     blocks the test suite for ~10s before timing out.
   *   - In production a missing Redis is a real outage — we don't want to
   *     swallow it silently — but we DO want the API to keep booting
   *     (idempotency cache + throttler degrade gracefully). So we log
   *     ERROR and continue rather than crashing the process.
   */
  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === "test") {
      this.logger.debug(
        "Skipping daily-usage scheduler registration in test env",
      );
      return;
    }
    try {
      await this.dailyUsageQueue.upsertJobScheduler(
        DAILY_USAGE_SCHEDULER_ID,
        // Run at 02:00 UTC every day — chosen because:
        //   1. It's the lowest-traffic window across LATAM (no business hours).
        //   2. Yesterday's data is fully settled (clocks past midnight UTC).
        //   3. Long enough before EU/UK morning that Pulso dashboards see
        //      fresh numbers when their day starts.
        { pattern: "0 2 * * *", tz: "UTC" },
        {
          name: JobName.RUN_DAILY_USAGE_ROLLUP,
          data: {}, // empty payload — processor uses "yesterday in UTC"
          opts: {
            attempts: 3,
            backoff: { type: "exponential", delay: 5 * 60_000 }, // 5min / 25min / 2h
            removeOnComplete: { age: 7 * 24 * 60 * 60 },
            removeOnFail: false,
          },
        },
      );
      this.logger.log(
        `Daily usage rollup scheduled · id=${DAILY_USAGE_SCHEDULER_ID} · cron=0 2 * * * UTC`,
      );
    } catch (err) {
      // Don't crash the boot. The API still serves; only the scheduler is
      // missing — the rollup just won't run until Redis is back AND the
      // process restarts.
      this.logger.error(
        `Failed to register daily-usage scheduler: ${(err as Error).message}`,
      );
    }

    // Sprint S53 — Weekly digest cron, now HOURLY (was Monday 07:00 UTC).
    // The processor filters per user: only those whose `Profile.timezone`
    // makes their local weekday Monday AND local hour 7 at the cron's
    // `now` actually receive a digest. Users with `timezone === null`
    // fall back to UTC (preserves S44 behavior for legacy accounts until
    // the client auto-detects on next login).
    try {
      await this.weeklyDigestQueue.upsertJobScheduler(
        WEEKLY_DIGEST_SCHEDULER_ID,
        { pattern: "0 * * * *", tz: "UTC" }, // Every hour UTC
        {
          name: JobName.RUN_WEEKLY_DIGEST,
          data: {},
          opts: {
            attempts: 3,
            backoff: { type: "exponential", delay: 5 * 60_000 },
            removeOnComplete: { age: 30 * 24 * 60 * 60 },
            removeOnFail: false,
          },
        },
      );
      this.logger.log(
        `Weekly digest scheduled · id=${WEEKLY_DIGEST_SCHEDULER_ID} · cron=0 * * * * UTC (per-user TZ filter inside)`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to register weekly-digest scheduler: ${(err as Error).message}`,
      );
    }

    // Sprint S53 — Inactive nudge cron, now HOURLY (was 18:00 UTC daily).
    // Same TZ-aware filtering: only candidates whose local hour at `now`
    // is 18 actually get a push.
    try {
      await this.inactiveNudgeQueue.upsertJobScheduler(
        INACTIVE_NUDGE_SCHEDULER_ID,
        { pattern: "0 * * * *", tz: "UTC" }, // Every hour UTC
        {
          name: JobName.SEND_INACTIVE_NUDGE,
          data: {},
          opts: {
            attempts: 3,
            backoff: { type: "exponential", delay: 5 * 60_000 },
            removeOnComplete: { age: 7 * 24 * 60 * 60 },
            removeOnFail: false,
          },
        },
      );
      this.logger.log(
        `Inactive nudge scheduled · id=${INACTIVE_NUDGE_SCHEDULER_ID} · cron=0 * * * * UTC (per-user TZ filter inside)`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to register inactive-nudge scheduler: ${(err as Error).message}`,
      );
    }

    // Sprint S46 — Weekly summary pre-generation cron. Sunday 23:00 UTC.
    // Runs ~8 hours BEFORE the Monday 07:00 UTC digest so the row exists
    // when the digest looks it up. The processor is idempotent (upsert on
    // (userId, weekStart)) — re-running is safe.
    try {
      await this.weeklySummaryQueue.upsertJobScheduler(
        WEEKLY_SUMMARY_SCHEDULER_ID,
        { pattern: "0 23 * * 0", tz: "UTC" }, // Sunday 23:00 UTC
        {
          name: JobName.RUN_WEEKLY_SUMMARY_GENERATION,
          data: {},
          opts: {
            attempts: 3,
            backoff: { type: "exponential", delay: 5 * 60_000 },
            removeOnComplete: { age: 30 * 24 * 60 * 60 },
            removeOnFail: false,
          },
        },
      );
      this.logger.log(
        `Weekly-summary generation scheduled · id=${WEEKLY_SUMMARY_SCHEDULER_ID} · cron=0 23 * * 0 UTC`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to register weekly-summary scheduler: ${(err as Error).message}`,
      );
    }

    // Sprint S50 — Platform-wide daily snapshot cron. 02:30 UTC daily.
    // Lands after the daily-usage rollup at 02:00 so the billing data is
    // settled. Idempotent — upserts on `day`, so retries are safe.
    try {
      await this.platformSnapshotQueue.upsertJobScheduler(
        PLATFORM_SNAPSHOT_SCHEDULER_ID,
        { pattern: "30 2 * * *", tz: "UTC" }, // 02:30 UTC daily
        {
          name: JobName.RUN_PLATFORM_SNAPSHOT,
          data: {},
          opts: {
            attempts: 3,
            backoff: { type: "exponential", delay: 5 * 60_000 },
            removeOnComplete: { age: 30 * 24 * 60 * 60 },
            removeOnFail: false,
          },
        },
      );
      this.logger.log(
        `Platform snapshot scheduled · id=${PLATFORM_SNAPSHOT_SCHEDULER_ID} · cron=30 2 * * * UTC`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to register platform-snapshot scheduler: ${(err as Error).message}`,
      );
    }

    // Sprint S51 — Cohort retention cron. Monday 03:00 UTC. Recomputes the
    // full triangle; idempotent on (cohortWeek, weekOffset). Retries safe.
    try {
      await this.cohortRetentionQueue.upsertJobScheduler(
        COHORT_RETENTION_SCHEDULER_ID,
        { pattern: "0 3 * * 1", tz: "UTC" }, // Monday 03:00 UTC
        {
          name: JobName.RUN_COHORT_RETENTION,
          data: {},
          opts: {
            attempts: 3,
            backoff: { type: "exponential", delay: 5 * 60_000 },
            removeOnComplete: { age: 30 * 24 * 60 * 60 },
            removeOnFail: false,
          },
        },
      );
      this.logger.log(
        `Cohort retention scheduled · id=${COHORT_RETENTION_SCHEDULER_ID} · cron=0 3 * * 1 UTC`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to register cohort-retention scheduler: ${(err as Error).message}`,
      );
    }

    // Sprint G2 — Monthly emotional-map snapshot cron. 1st of month at
    // 04:00 UTC. Idempotent — upserts on (userId, month).
    try {
      await this.emotionalMapSnapshotQueue.upsertJobScheduler(
        EMOTIONAL_MAP_SNAPSHOT_SCHEDULER_ID,
        { pattern: "0 4 1 * *", tz: "UTC" }, // 1st of month, 04:00 UTC
        {
          name: JobName.RUN_EMOTIONAL_MAP_SNAPSHOT,
          data: {},
          opts: {
            attempts: 3,
            backoff: { type: "exponential", delay: 5 * 60_000 },
            removeOnComplete: { age: 30 * 24 * 60 * 60 },
            removeOnFail: false,
          },
        },
      );
      this.logger.log(
        `Emotional-map snapshot scheduled · id=${EMOTIONAL_MAP_SNAPSHOT_SCHEDULER_ID} · cron=0 4 1 * * UTC`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to register emotional-map-snapshot scheduler: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Enqueue a transactional email for asynchronous delivery.
   *
   * Use this when:
   *  - The email is non-critical to the calling request's success
   *    (e.g. email-change confirmation — registration already succeeded).
   *  - The send latency is meaningful (Resend ~500ms).
   *  - You want retry-on-failure for free.
   *
   * Don't use this for:
   *  - Verification email from `register()` — already fire-and-forget, low cost.
   *  - Synchronous "did the email get sent" UI confirmation flows.
   */
  async enqueueEmail(payload: EmailJobPayload): Promise<void> {
    await this.emailQueue.add(JobName.SEND_EMAIL, payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 1_000 }, // 1s / 5s / 25s
      removeOnComplete: { age: 24 * 60 * 60 }, // keep completed jobs 1 day for debugging
      removeOnFail: { age: 7 * 24 * 60 * 60 }, // failed jobs 1 week
    });
    this.logger.log(
      `Enqueued email · to=${payload.to} · tag=${payload.tag ?? "-"}`,
    );
  }

  /**
   * Enqueue a data-export job. Returns immediately; the worker will:
   *  1. Pull DataExportRequest row by id.
   *  2. Assemble payload (profile + progress + subscription + ...).
   *  3. Upload to R2 as JSON.
   *  4. Update DataExportRequest.fileUrl + status="READY".
   *  5. Send "your export is ready" email.
   */
  async enqueueDataExport(payload: DataExportJobPayload): Promise<void> {
    await this.dataExportQueue.add(JobName.RUN_DATA_EXPORT, payload, {
      attempts: 2,
      backoff: { type: "exponential", delay: 30_000 }, // 30s / 15min
      removeOnComplete: { age: 7 * 24 * 60 * 60 },
      removeOnFail: false, // keep failures indefinitely for debugging
    });
    this.logger.log(`Enqueued data-export · userId=${payload.userId}`);
  }

  /**
   * Enqueue account-deletion finalisation, DELAYED by 30 days. The worker
   * re-checks `User.deleteRequestedAt` before executing — if the user
   * cancelled in the meantime, the job no-ops.
   *
   * Why use BullMQ's `delay` instead of a CRON job that checks daily:
   *  - Precision: we delete exactly 30 days after the request, not on
   *    the next scheduled run (which could be up to 24h off).
   *  - Resource efficiency: a CRON scanning the User table daily wastes
   *    CPU. The delayed job is cheap and self-targeted.
   *  - Cancellable: if the user clears `deleteRequestedAt` we don't have
   *    to dequeue the job — it just no-ops on execute.
   */
  async enqueueAccountDeletion(
    payload: AccountDeletionJobPayload,
  ): Promise<void> {
    await this.accountDeletionQueue.add(
      JobName.FINALIZE_ACCOUNT_DELETION,
      payload,
      {
        delay: 30 * DAYS,
        attempts: 5,
        backoff: { type: "exponential", delay: 60_000 }, // 1m / 5m / 25m / ...
        removeOnComplete: { age: 30 * 24 * 60 * 60 }, // keep 30 days for audit
        removeOnFail: false,
      },
    );
    this.logger.log(
      `Enqueued account-deletion · userId=${payload.userId} · runAt=+30d`,
    );
  }
}
