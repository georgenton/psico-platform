import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import {
  JobName,
  QueueName,
  type AccountDeletionJobPayload,
  type DailyUsageJobPayload,
  type DataExportJobPayload,
  type EmailJobPayload,
} from "./queue-names";

const DAYS = 24 * 60 * 60 * 1000;
// Repeatable-job id for the nightly usage rollup. Using a stable id means
// re-deploys don't pile up duplicate cron entries — BullMQ's
// upsertJobScheduler upserts on it.
const DAILY_USAGE_SCHEDULER_ID = "daily-usage-02-utc";

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
   */
  async onModuleInit(): Promise<void> {
    // Run at 02:00 UTC every day — chosen because:
    //   1. It's the lowest-traffic window across LATAM (no business hours).
    //   2. Yesterday's data is fully settled (clocks past midnight UTC).
    //   3. Long enough before EU/UK morning that Pulso dashboards see fresh
    //      numbers when their day starts.
    await this.dailyUsageQueue.upsertJobScheduler(
      DAILY_USAGE_SCHEDULER_ID,
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
