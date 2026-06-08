import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

import { PlatformSnapshotProcessor } from "./platform-snapshot.processor";
import { JobName } from "../queue-names";

/**
 * Sprint S50 — PlatformSnapshotProcessor tests.
 *
 * The processor reads N tables and upserts a single row in
 * `PlatformMetricDaily`. We mock Prisma at the method level so the test
 * asserts wiring (right where-clauses, right field mapping into the upsert)
 * without spinning up a database.
 */
function buildPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    user: { count: vi.fn().mockResolvedValue(0) },
    diaryEntry: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ecoMessage: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    voiceTranscription: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { durationSec: 0 } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    readingSession: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    ecoMessageReport: { count: vi.fn().mockResolvedValue(0) },
    platformMetricDaily: { upsert: vi.fn() },
    ...overrides,
  } as never;
}

function jobOf<T>(data: T): Job<T> {
  return { name: JobName.RUN_PLATFORM_SNAPSHOT, data } as Job<T>;
}

describe("PlatformSnapshotProcessor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unknown job names — defensive against queue misconfiguration", async () => {
    const proc = new PlatformSnapshotProcessor(buildPrisma());
    await expect(
      proc.process({ name: "wrong-name", data: {} } as never),
    ).rejects.toThrow(/unknown job/);
  });

  it("targetDay defaults to yesterday in UTC and upserts on that day", async () => {
    const upsertSpy = vi.fn();
    const prisma = buildPrisma({
      platformMetricDaily: { upsert: upsertSpy },
    });
    const proc = new PlatformSnapshotProcessor(prisma);

    await proc.process(jobOf({}));

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const args = upsertSpy.mock.calls[0]![0] as {
      where: { day: Date };
      create: Record<string, unknown>;
    };
    // Yesterday at 00:00:00.000 UTC. Allow ±25h tolerance for test
    // execution timing.
    const yesterday = new Date();
    yesterday.setUTCHours(0, 0, 0, 0);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const delta = Math.abs(args.where.day.getTime() - yesterday.getTime());
    expect(delta).toBeLessThan(25 * 60 * 60 * 1000);
  });

  it("payload.targetDay parses YYYY-MM-DD as UTC midnight", async () => {
    const upsertSpy = vi.fn();
    const prisma = buildPrisma({
      platformMetricDaily: { upsert: upsertSpy },
    });
    const proc = new PlatformSnapshotProcessor(prisma);

    await proc.process(jobOf({ targetDay: "2026-06-01" }));

    const args = upsertSpy.mock.calls[0]![0] as { where: { day: Date } };
    expect(args.where.day.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("payload.dryRun=true computes counts but does NOT upsert", async () => {
    const upsertSpy = vi.fn();
    const prisma = buildPrisma({
      user: { count: vi.fn().mockResolvedValue(42) },
      platformMetricDaily: { upsert: upsertSpy },
    });
    const proc = new PlatformSnapshotProcessor(prisma);

    await proc.process(jobOf({ dryRun: true }));

    expect(prisma.user.count).toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("aggregates fields into the upsert payload with correct mapping", async () => {
    const upsertSpy = vi.fn();
    const prisma = buildPrisma({
      user: {
        // total · new · paid (3 calls per service order)
        count: vi
          .fn()
          .mockResolvedValueOnce(100) // totalUsers
          .mockResolvedValueOnce(5) // newUsers
          .mockResolvedValueOnce(15), // paidUsers
      },
      diaryEntry: {
        count: vi.fn().mockResolvedValue(7),
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]),
      },
      ecoMessage: {
        // USER · CRISIS
        count: vi.fn().mockResolvedValueOnce(20).mockResolvedValueOnce(1),
        findMany: vi.fn().mockResolvedValue([{ thread: { userId: "u3" } }]),
      },
      voiceTranscription: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { durationSec: 180 } }), // 3 minutes
        findMany: vi.fn().mockResolvedValue([{ userId: "u1" }]),
      },
      readingSession: {
        count: vi.fn().mockResolvedValue(4),
        findMany: vi.fn().mockResolvedValue([{ userId: "u4" }]),
      },
      ecoMessageReport: {
        // opened · resolved
        count: vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(2),
      },
      platformMetricDaily: { upsert: upsertSpy },
    });
    const proc = new PlatformSnapshotProcessor(prisma);

    await proc.process(jobOf({ targetDay: "2026-06-07" }));

    const args = upsertSpy.mock.calls[0]![0] as {
      create: Record<string, unknown>;
    };
    expect(args.create).toMatchObject({
      totalUsers: 100,
      newUsers: 5,
      paidUsers: 15,
      diaryEntries: 7,
      ecoMessages: 20,
      ecoCrisis: 1,
      voiceMinutes: 3,
      readingSessions: 4,
      reportsOpened: 3,
      reportsResolved: 2,
      // DAU is the union over {u1,u2,u3,u4} = 4 distinct users.
      dau: 4,
    });
  });

  it("throws on invalid targetDay string", async () => {
    const proc = new PlatformSnapshotProcessor(buildPrisma());
    await expect(
      proc.process(jobOf({ targetDay: "not-a-date" })),
    ).rejects.toThrow(/invalid targetDay/);
  });
});
