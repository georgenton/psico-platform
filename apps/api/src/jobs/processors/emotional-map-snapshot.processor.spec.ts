import { beforeEach, describe, expect, it, vi } from "vitest";

import { EmotionalMapSnapshotProcessor } from "./emotional-map-snapshot.processor";
import { JobName, QueueName } from "../queue-names";

void QueueName; // referenced via @Processor decorator; silence unused-import in test scope.

interface JobLike {
  name: string;
  data: { targetMonth?: string; dryRun?: boolean };
}

function makePrisma() {
  const base = {
    user: { findMany: vi.fn() },
    emotionalMapSnapshot: { upsert: vi.fn().mockResolvedValue({}) },
    // PR-0.1 — the processor now persists inside a short transaction that takes
    // a SHARED lock on the user row and re-reads the privacy revision, so a
    // revocation that lands during `compute()` (an LLM round-trip, seconds wide)
    // cannot be overwritten by numbers derived from data it just deleted.
    privacySettings: {
      findUnique: vi.fn().mockResolvedValue({ emotionalMapPrivacyRevision: 0 }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ id: "u1" }]),
    $transaction: vi.fn((cb: (tx: unknown) => Promise<unknown>) => cb(base)),
  };
  return base;
}

function makeEmotionalMap() {
  return {
    compute: vi.fn().mockResolvedValue({
      values: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      pct: 50,
      computedAt: new Date().toISOString(),
      provider: "anthropic",
    }),
  };
}

describe("EmotionalMapSnapshotProcessor — Sprint G2", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let emotionalMap: ReturnType<typeof makeEmotionalMap>;

  beforeEach(() => {
    prisma = makePrisma();
    emotionalMap = makeEmotionalMap();
  });

  function buildProcessor() {
    return new EmotionalMapSnapshotProcessor(
      prisma as never,
      emotionalMap as never,
    );
  }

  function jobOf(overrides: Partial<JobLike> = {}): JobLike {
    return {
      name: JobName.RUN_EMOTIONAL_MAP_SNAPSHOT,
      data: {},
      ...overrides,
    };
  }

  it("no-ops on unknown job names without throwing", async () => {
    const processor = buildProcessor();
    const result = await processor.process(
      jobOf({ name: "junk-job" }) as never,
    );
    expect(result.candidates).toBe(0);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("dryRun lists candidates without writing snapshots", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
    const processor = buildProcessor();
    const result = await processor.process(
      jobOf({ data: { dryRun: true } }) as never,
    );
    expect(result.candidates).toBe(2);
    expect(result.dryRun).toBe(true);
    expect(prisma.emotionalMapSnapshot.upsert).not.toHaveBeenCalled();
    expect(emotionalMap.compute).not.toHaveBeenCalled();
  });

  it("upserts one snapshot per candidate user", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
    const processor = buildProcessor();
    const result = await processor.process(
      jobOf({ data: { targetMonth: "2026-07-01" } }) as never,
    );
    expect(result.persisted).toBe(2);
    expect(emotionalMap.compute).toHaveBeenCalledTimes(2);
    expect(prisma.emotionalMapSnapshot.upsert).toHaveBeenCalledTimes(2);
    const firstUpsert = prisma.emotionalMapSnapshot.upsert.mock.calls[0][0];
    expect(firstUpsert.where.userId_month.month.toISOString()).toBe(
      "2026-07-01T00:00:00.000Z",
    );
  });

  it("isolates per-user failures and reports them in the result", async () => {
    prisma.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
    emotionalMap.compute
      .mockResolvedValueOnce({
        values: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        pct: 50,
        computedAt: new Date().toISOString(),
        provider: "anthropic",
      })
      .mockRejectedValueOnce(new Error("LLM 5xx"));
    const processor = buildProcessor();
    const result = await processor.process(jobOf() as never);
    expect(result.persisted).toBe(1);
    expect(result.failed).toBe(1);
    expect(prisma.emotionalMapSnapshot.upsert).toHaveBeenCalledTimes(1);
  });
});
