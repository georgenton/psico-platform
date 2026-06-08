/**
 * Canonical names of every BullMQ queue in the platform.
 *
 * Why a `const` over a TS enum:
 *  - BullMQ uses string queue names everywhere (Redis keys, decorators).
 *  - Easier to grep + autocomplete + serialize.
 *  - One source of truth for both producer (API) and consumer (worker).
 *
 * Naming convention: `kebab-case`, namespaced by concern.
 *
 * Each queue documented with:
 *  - WHO produces (which service)
 *  - WHO consumes (worker processor file)
 *  - Retry policy (specified at enqueue time in JobsService)
 */
export const QueueName = {
  /**
   * Outbound transactional email (Resend).
   *
   * Producer: `JobsService.enqueueEmail` (called from any feature service
   * that needs to send an email asynchronously — e.g. UsersService for
   * email-change-request).
   *
   * Consumer: `apps/api/src/jobs/processors/email.processor.ts`
   *
   * Retry: 3 attempts, exponential backoff (1s / 5s / 25s).
   */
  EMAIL: "email",

  /**
   * User data export. Generates a JSON dump of the user's profile, progress,
   * subscription, and (future) diary/eco/etc. Uploads to R2. Sends signed URL
   * via email. Marks `DataExportRequest.status = "READY"`.
   *
   * Producer: `JobsService.enqueueDataExport` (UsersService.requestDataExport)
   * Consumer: `apps/api/src/jobs/processors/data-export.processor.ts`
   *
   * Retry: 2 attempts. ZIP generation is deterministic; failing twice in
   * a row signals a real problem (R2 down, DB corruption) — bail.
   */
  DATA_EXPORT: "data-export",

  /**
   * Account deletion finalisation. Runs `prisma.user.delete()` 30 days
   * after the user requested deletion (unless they cancel meanwhile).
   * Prisma cascades through every owned table.
   *
   * Producer: `JobsService.enqueueAccountDeletion` (UsersService.requestDelete)
   * Consumer: `apps/api/src/jobs/processors/account-deletion.processor.ts`
   *
   * Retry: 5 attempts with longer backoff (1min / 5min / 25min / ...).
   * If the job is enqueued and the user cancels later, the worker checks
   * `User.deleteRequestedAt` at execution time and no-ops if cleared.
   */
  ACCOUNT_DELETION: "account-deletion",

  /**
   * Sprint S7 — Daily usage rollup. Computes per-user counters for the
   * previous UTC day and upserts a `BillingUsageDay` row. Feeds Pulso
   * admin metrics + churn audit; NOT consumed by the live /usage endpoint
   * (that one queries live tables with a 5-min Redis cache).
   *
   * Producer: `JobsService.enqueueDailyUsageRollover` — scheduled via a
   * BullMQ repeatable job at 02:00 UTC. Producing is intentionally simple
   * (one job per run, no payload) — the processor fan-outs to all users.
   *
   * Consumer: `apps/api/src/jobs/processors/daily-usage.processor.ts`
   *
   * Retry: 3 attempts with longer backoff (5min / 25min / 2h). The job is
   * idempotent (unique (userId, day) on BillingUsageDay) so retries are
   * safe even if a partial run already wrote some rows.
   */
  DAILY_USAGE: "daily-usage",

  /**
   * Sprint S44 — Weekly digest. Monday 07:00 UTC. Scans users with
   * `NotificationSettings.weeklyReport === true`, computes last week's
   * stats, sends email via Resend + push via PushService.
   *
   * Producer: `JobsService.onModuleInit` registers the cron.
   * Consumer: `apps/api/src/jobs/processors/weekly-digest.processor.ts`
   *
   * Retry: 3 attempts, exponential (5min / 25min / 2h). The processor
   * doesn't write to DB beyond optionally bumping a `lastDigestSentAt`
   * flag — re-running the same Monday is safe.
   */
  WEEKLY_DIGEST: "weekly-digest",

  /**
   * Sprint S44 — Re-engagement nudge. Nightly 18:00 UTC. Scans users who
   * (a) have ≥1 diary entry ever, (b) haven't written in 3+ days,
   * (c) have `dailyReminder === true`, and (d) `lastNudgedAt` null or
   * > 4 days ago.
   *
   * Producer: `JobsService.onModuleInit`.
   * Consumer: `apps/api/src/jobs/processors/inactive-nudge.processor.ts`
   *
   * Retry: 3 attempts, exponential (5min / 25min / 2h).
   */
  INACTIVE_NUDGE: "inactive-nudge",

  /**
   * Sprint S46 — Pre-generate WeeklySummary so the Monday digest finds it.
   *
   * Cron: Sunday 23:00 UTC. Closes the loop opened by S38 (LLM-backed
   * narrative) + S44 (digest cron) + S45 (digest wires WeeklySummary if
   * the row exists). Without this job, the row only exists when a Pro
   * user manually clicks "Regenerar" in /dashboard/patrones — so the
   * digest almost never includes the editorial narrative.
   *
   * Why Sunday 23:00 UTC and not Friday:
   *   - The summary covers the ENTIRE ISO week (Mon→Sun). Generating
   *     Friday would only see Mon→Thu data.
   *   - Sunday 23:00 UTC leaves 8 hours of buffer before the Monday
   *     07:00 UTC digest cron fires — enough for retries if the run
   *     hits a transient LLM 5xx.
   *
   * Producer: `JobsService.onModuleInit` registers the cron.
   * Consumer: `apps/api/src/jobs/processors/weekly-summary.processor.ts`
   *
   * Retry: 3 attempts, exponential (5min / 25min / 2h). The processor is
   * idempotent — `regenerateWeeklySummary` upserts on `(userId, weekStart)`.
   */
  WEEKLY_SUMMARY_GENERATION: "weekly-summary-generation",

  /**
   * Sprint S50 — Platform-wide daily snapshot for Pulso v2 time series.
   *
   * Cron: 02:30 UTC daily (right after `DAILY_USAGE` at 02:00 so the
   * billing rollup completes first). Writes one `PlatformMetricDaily` row
   * for "yesterday in UTC" — counts of new users, DAU, content created,
   * reports opened/resolved, etc.
   *
   * Producer: `JobsService.onModuleInit` registers the cron.
   * Consumer: `apps/api/src/jobs/processors/platform-snapshot.processor.ts`
   *
   * Retry: 3 attempts, exponential (5min / 25min / 2h). The processor is
   * idempotent — upserts on `day` so retries on the same day overwrite.
   */
  PLATFORM_SNAPSHOT: "platform-snapshot",

  /**
   * Sprint S51 — Weekly cohort retention recomputation.
   *
   * Cron: Monday 03:00 UTC (after the daily snapshot at 02:30). Rebuilds
   * the full `CohortRetentionWeek` triangle — every (cohortWeek,
   * weekOffset) cell up to 52 weeks of history × 52 weeks of follow-up.
   *
   * Why weekly and not daily:
   *   - Retention is a slow-changing metric. Daily recompute would waste
   *     compute; the chart wouldn't visibly change.
   *   - Cohorts are week-anchored (Mon→Sun), so Monday is the natural
   *     boundary day to refresh the latest column.
   *
   * Producer: `JobsService.onModuleInit` registers the cron.
   * Consumer: `apps/api/src/jobs/processors/cohort-retention.processor.ts`
   *
   * Retry: 3 attempts, exp 5min/25min/2h. Idempotent — upserts on
   * (cohortWeek, weekOffset).
   */
  COHORT_RETENTION: "cohort-retention",
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];

// ─── Job payloads ────────────────────────────────────────────────────────────
//
// Every queue has a typed payload — producers can't accidentally enqueue the
// wrong shape, and consumers get autocomplete. The discriminator `kind` is
// inside the payload so a queue can grow to handle multiple sub-jobs without
// renaming.

export interface EmailJobPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  tag?: string;
}

export interface DataExportJobPayload {
  /** The DataExportRequest row id — the worker updates its status. */
  requestId: string;
  /** The user the export is for. */
  userId: string;
}

export interface AccountDeletionJobPayload {
  /** User to finalise deletion for. */
  userId: string;
  /** When the deletion was originally requested (for audit, NOT for scheduling). */
  requestedAt: string; // ISO date
}

/**
 * Daily usage rollup carries no per-user data — the processor scans for
 * all users with activity in the day and writes one row per (userId, day).
 * The optional `targetDay` lets ops re-run a specific historical day
 * (useful after fixing a data bug); when omitted, the processor uses
 * "yesterday in UTC".
 */
export interface DailyUsageJobPayload {
  /** ISO date YYYY-MM-DD. When unset, "yesterday in UTC" is computed. */
  targetDay?: string;
}

/**
 * Sprint S44 — Weekly digest fan-out.
 *
 * `targetWeekStart` lets ops re-run a specific historical Monday (useful
 * to backfill if the cron missed a run). When omitted, the processor
 * uses "last week's Monday in UTC".
 */
export interface WeeklyDigestJobPayload {
  /** ISO date YYYY-MM-DD of the target week's Monday. */
  targetWeekStart?: string;
  /**
   * Sprint S53 — Override the "now" instant the processor uses for the
   * per-user timezone gate. Tests pass this to assert behavior at
   * arbitrary UTC moments without depending on wall-clock time.
   * Production code does NOT set this; the cron sees the live `new Date()`.
   */
  nowIso?: string;
}

/**
 * Sprint S44 — Inactive nudge fan-out. No payload in v1; the processor
 * computes "today in UTC" itself. Kept as an interface for future
 * extension (e.g. `dryRun: true` for staging tests).
 */
export interface InactiveNudgeJobPayload {
  /** When true, the processor computes candidates but does NOT send pushes. */
  dryRun?: boolean;
  /**
   * Sprint S53 — Override the "now" instant for the per-user timezone
   * gate. Tests inject this; production reads `new Date()` directly.
   */
  nowIso?: string;
}

/**
 * Sprint S46 — Weekly summary pre-generation fan-out.
 *
 * No payload in v1; the processor computes "current ISO week" itself.
 * Kept as an interface so ops can backfill a specific week if a Sunday
 * run is missed (`targetWeekStart`) or run dry to count candidates.
 */
export interface WeeklySummaryGenerationJobPayload {
  /** ISO date YYYY-MM-DD of the target week's Monday. */
  targetWeekStart?: string;
  /** When true, the processor lists candidates but does NOT call the LLM. */
  dryRun?: boolean;
}

/**
 * Sprint S50 — Platform daily snapshot fan-in.
 *
 * No payload in v1; the processor computes "yesterday in UTC" itself.
 * Kept as an interface so ops can backfill a specific historical day
 * via `targetDay` or run dry to count + log without writing.
 */
export interface PlatformSnapshotJobPayload {
  /** ISO date YYYY-MM-DD. When unset, "yesterday in UTC" is computed. */
  targetDay?: string;
  /** When true, computes counts but does NOT upsert the row. */
  dryRun?: boolean;
}

/**
 * Sprint S51 — Cohort retention recomputation. No payload in v1; the
 * processor scans the full history each week. Kept as an interface so ops
 * can backfill or restrict horizons in the future.
 */
export interface CohortRetentionJobPayload {
  /** Cap cohorts older than this many weeks. Default 52 (1 year). */
  horizonWeeks?: number;
  /** When true, computes counts but does NOT upsert any rows. */
  dryRun?: boolean;
}

/**
 * Job names within each queue. Currently each queue has one default job
 * (so the name is essentially the queue name) but the type system keeps
 * this open for future expansion.
 */
export const JobName = {
  SEND_EMAIL: "send-email",
  RUN_DATA_EXPORT: "run-data-export",
  FINALIZE_ACCOUNT_DELETION: "finalize-account-deletion",
  RUN_DAILY_USAGE_ROLLUP: "run-daily-usage-rollup",
  RUN_WEEKLY_DIGEST: "run-weekly-digest",
  SEND_INACTIVE_NUDGE: "send-inactive-nudge",
  RUN_WEEKLY_SUMMARY_GENERATION: "run-weekly-summary-generation",
  RUN_PLATFORM_SNAPSHOT: "run-platform-snapshot",
  RUN_COHORT_RETENTION: "run-cohort-retention",
} as const;

export type JobName = (typeof JobName)[keyof typeof JobName];
