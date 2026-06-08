import { describe, it, expect, vi, beforeEach } from "vitest";
import { Logger } from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { JobName } from "./queue-names";

describe("JobsService", () => {
  const mockEmailQueue = { add: vi.fn().mockResolvedValue(undefined) };
  const mockDataExportQueue = { add: vi.fn().mockResolvedValue(undefined) };
  const mockAccountDeletionQueue = {
    add: vi.fn().mockResolvedValue(undefined),
  };
  const mockDailyUsageQueue = {
    add: vi.fn().mockResolvedValue(undefined),
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
  };
  // Sprint S44 — notification cron queues.
  const mockWeeklyDigestQueue = {
    add: vi.fn().mockResolvedValue(undefined),
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
  };
  const mockInactiveNudgeQueue = {
    add: vi.fn().mockResolvedValue(undefined),
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
  };
  // Sprint S46 — weekly summary pre-generation queue.
  const mockWeeklySummaryQueue = {
    add: vi.fn().mockResolvedValue(undefined),
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
  };
  // Sprint S50 — platform snapshot queue.
  const mockPlatformSnapshotQueue = {
    add: vi.fn().mockResolvedValue(undefined),
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
  };
  // Sprint S51 — cohort retention queue.
  const mockCohortRetentionQueue = {
    add: vi.fn().mockResolvedValue(undefined),
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
  };

  let service: JobsService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    mockEmailQueue.add.mockResolvedValue(undefined);
    mockDataExportQueue.add.mockResolvedValue(undefined);
    mockAccountDeletionQueue.add.mockResolvedValue(undefined);
    mockDailyUsageQueue.upsertJobScheduler.mockResolvedValue(undefined);
    mockWeeklyDigestQueue.upsertJobScheduler.mockResolvedValue(undefined);
    mockInactiveNudgeQueue.upsertJobScheduler.mockResolvedValue(undefined);
    mockWeeklySummaryQueue.upsertJobScheduler.mockResolvedValue(undefined);
    mockPlatformSnapshotQueue.upsertJobScheduler.mockResolvedValue(undefined);
    mockCohortRetentionQueue.upsertJobScheduler.mockResolvedValue(undefined);
    service = new JobsService(
      mockEmailQueue as never,
      mockDataExportQueue as never,
      mockAccountDeletionQueue as never,
      mockDailyUsageQueue as never,
      mockWeeklyDigestQueue as never,
      mockInactiveNudgeQueue as never,
      mockWeeklySummaryQueue as never,
      mockPlatformSnapshotQueue as never,
      mockCohortRetentionQueue as never,
    );
  });

  it("onModuleInit skips scheduler registration in test env (no Redis required)", async () => {
    // setup-env.ts sets NODE_ENV=test, so the guard short-circuits.
    await service.onModuleInit();

    expect(mockDailyUsageQueue.upsertJobScheduler).not.toHaveBeenCalled();
  });

  it("onModuleInit registers the daily-usage scheduler outside the test env", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await service.onModuleInit();

      expect(mockDailyUsageQueue.upsertJobScheduler).toHaveBeenCalledWith(
        "daily-usage-02-utc",
        { pattern: "0 2 * * *", tz: "UTC" },
        expect.objectContaining({
          name: JobName.RUN_DAILY_USAGE_ROLLUP,
          opts: expect.objectContaining({
            attempts: 3,
          }),
        }),
      );
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it("onModuleInit swallows Redis errors so the API still boots", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    mockDailyUsageQueue.upsertJobScheduler.mockRejectedValueOnce(
      new Error("ECONNREFUSED"),
    );
    try {
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it("enqueueEmail adds a SEND_EMAIL job with 3-attempt exponential backoff", async () => {
    await service.enqueueEmail({
      to: "user@example.com",
      subject: "Hi",
      html: "<p>hi</p>",
      tag: "test",
    });

    expect(mockEmailQueue.add).toHaveBeenCalledWith(
      JobName.SEND_EMAIL,
      expect.objectContaining({ to: "user@example.com", tag: "test" }),
      expect.objectContaining({
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
      }),
    );
  });

  it("enqueueDataExport adds a RUN_DATA_EXPORT job with 2 attempts", async () => {
    await service.enqueueDataExport({ requestId: "req-1", userId: "user-1" });

    expect(mockDataExportQueue.add).toHaveBeenCalledWith(
      JobName.RUN_DATA_EXPORT,
      { requestId: "req-1", userId: "user-1" },
      expect.objectContaining({ attempts: 2 }),
    );
  });

  it("onModuleInit registers the Sunday 23:00 UTC weekly-summary generation scheduler (S46)", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await service.onModuleInit();

      expect(mockWeeklySummaryQueue.upsertJobScheduler).toHaveBeenCalledWith(
        "weekly-summary-sunday-23-utc",
        { pattern: "0 23 * * 0", tz: "UTC" },
        expect.objectContaining({
          name: JobName.RUN_WEEKLY_SUMMARY_GENERATION,
          opts: expect.objectContaining({
            attempts: 3,
            backoff: { type: "exponential", delay: 5 * 60_000 },
          }),
        }),
      );
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it("onModuleInit registers the 02:30 UTC platform-snapshot scheduler (S50)", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await service.onModuleInit();

      expect(mockPlatformSnapshotQueue.upsertJobScheduler).toHaveBeenCalledWith(
        "platform-snapshot-02-30-utc",
        { pattern: "30 2 * * *", tz: "UTC" },
        expect.objectContaining({
          name: JobName.RUN_PLATFORM_SNAPSHOT,
          opts: expect.objectContaining({
            attempts: 3,
            backoff: { type: "exponential", delay: 5 * 60_000 },
          }),
        }),
      );
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it("onModuleInit registers the Monday 03:00 UTC cohort-retention scheduler (S51)", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await service.onModuleInit();

      expect(mockCohortRetentionQueue.upsertJobScheduler).toHaveBeenCalledWith(
        "cohort-retention-monday-03-utc",
        { pattern: "0 3 * * 1", tz: "UTC" },
        expect.objectContaining({
          name: JobName.RUN_COHORT_RETENTION,
          opts: expect.objectContaining({
            attempts: 3,
            backoff: { type: "exponential", delay: 5 * 60_000 },
          }),
        }),
      );
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it("enqueueAccountDeletion uses a 30-day delay + 5-attempt retry policy", async () => {
    await service.enqueueAccountDeletion({
      userId: "user-1",
      requestedAt: new Date().toISOString(),
    });

    expect(mockAccountDeletionQueue.add).toHaveBeenCalledTimes(1);
    const [name, payload, opts] = mockAccountDeletionQueue.add.mock.calls[0];
    expect(name).toBe(JobName.FINALIZE_ACCOUNT_DELETION);
    expect(payload.userId).toBe("user-1");
    // 30 days exact in ms
    expect(opts.delay).toBe(30 * 24 * 60 * 60 * 1000);
    expect(opts.attempts).toBe(5);
  });
});
