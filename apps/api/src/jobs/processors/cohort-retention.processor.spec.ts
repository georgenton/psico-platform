import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

import { CohortRetentionProcessor } from "./cohort-retention.processor";
import { JobName } from "../queue-names";

/**
 * Sprint S51 — CohortRetentionProcessor tests.
 *
 * The processor walks N cohort weeks and writes O(N²) cells. We mock
 * Prisma at the method level and assert the upsert shape + cohort-size
 * vs active-users semantics on a small triangle.
 */
function buildPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    user: { findMany: vi.fn().mockResolvedValue([]) },
    diaryEntry: { findMany: vi.fn().mockResolvedValue([]) },
    ecoMessage: { findMany: vi.fn().mockResolvedValue([]) },
    voiceTranscription: { findMany: vi.fn().mockResolvedValue([]) },
    readingSession: { findMany: vi.fn().mockResolvedValue([]) },
    cohortRetentionWeek: { upsert: vi.fn() },
    ...overrides,
  } as never;
}

function jobOf<T>(data: T): Job<T> {
  return { name: JobName.RUN_COHORT_RETENTION, data } as Job<T>;
}

describe("CohortRetentionProcessor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unknown job names — defensive against queue misconfiguration", async () => {
    const proc = new CohortRetentionProcessor(buildPrisma());
    await expect(
      proc.process({ name: "wrong-name", data: {} } as never),
    ).rejects.toThrow(/unknown job/);
  });

  it("with no users, skips all cohorts and never upserts", async () => {
    const upsertSpy = vi.fn();
    const prisma = buildPrisma({
      cohortRetentionWeek: { upsert: upsertSpy },
    });
    const proc = new CohortRetentionProcessor(prisma);

    await proc.process(jobOf({ horizonWeeks: 2 }));

    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("upserts a cell per (cohortWeek, weekOffset) when the cohort has members", async () => {
    const upsertSpy = vi.fn();
    // Only ONE cohort week has users; horizon=0 means we look at just
    // "this week", so the triangle has exactly 1 cell: (thisMonday, 0).
    const prisma = buildPrisma({
      user: {
        findMany: vi
          .fn()
          // First call (cohortStarts[0] = this Monday): 3 users.
          .mockResolvedValueOnce([{ id: "u1" }, { id: "u2" }, { id: "u3" }]),
      },
      diaryEntry: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]),
      },
      cohortRetentionWeek: { upsert: upsertSpy },
    });
    const proc = new CohortRetentionProcessor(prisma);

    await proc.process(jobOf({ horizonWeeks: 0 }));

    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const args = upsertSpy.mock.calls[0]![0] as {
      where: {
        cohortWeek_weekOffset: { cohortWeek: Date; weekOffset: number };
      };
      create: { cohortSize: number; activeUsers: number };
    };
    expect(args.where.cohortWeek_weekOffset.weekOffset).toBe(0);
    expect(args.create.cohortSize).toBe(3);
    // Only u1 + u2 are in the cohort AND active.
    expect(args.create.activeUsers).toBe(2);
  });

  it("dryRun=true computes but does NOT upsert", async () => {
    const upsertSpy = vi.fn();
    const prisma = buildPrisma({
      user: {
        findMany: vi.fn().mockResolvedValue([{ id: "u1" }]),
      },
      cohortRetentionWeek: { upsert: upsertSpy },
    });
    const proc = new CohortRetentionProcessor(prisma);

    await proc.process(jobOf({ horizonWeeks: 0, dryRun: true }));

    expect(upsertSpy).not.toHaveBeenCalled();
    expect(prisma.user.findMany).toHaveBeenCalled();
  });

  it("intersects active activity against the cohort set (privacy of cell counts)", async () => {
    // A user active in the window but NOT in the cohort must not bump the
    // activeUsers count. This guards the cohort-scoped contract.
    const upsertSpy = vi.fn();
    const prisma = buildPrisma({
      user: {
        // Cohort has 2 users.
        findMany: vi.fn().mockResolvedValueOnce([{ id: "u1" }, { id: "u2" }]),
      },
      diaryEntry: {
        // Activity includes u1 (cohort) + u99 (not cohort).
        findMany: vi
          .fn()
          .mockResolvedValue([{ userId: "u1" }, { userId: "u99" }]),
      },
      cohortRetentionWeek: { upsert: upsertSpy },
    });
    const proc = new CohortRetentionProcessor(prisma);

    await proc.process(jobOf({ horizonWeeks: 0 }));

    const create = (
      upsertSpy.mock.calls[0]![0] as { create: { activeUsers: number } }
    ).create;
    expect(create.activeUsers).toBe(1); // u99 NOT counted
  });

  it("triangle: a 2-week horizon writes 3 cells (cohort0×offsets[0,1,2], cohort1×offsets[0,1], cohort2×offset[0])", async () => {
    const upsertSpy = vi.fn();
    // Every cohort has 1 user; user has activity each window.
    // Triangle math: horizon=2 → cohorts {this-2w, this-1w, thisMonday}.
    // For thisMonday: only offset=0 (1 cell).
    // For this-1w: offsets 0..1 (2 cells).
    // For this-2w: offsets 0..2 (3 cells).
    // Total = 1+2+3 = 6 cells.
    const prisma = buildPrisma({
      user: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: "u-c0" }]) // oldest cohort (this-2w)
          .mockResolvedValueOnce([{ id: "u-c1" }]) // this-1w
          .mockResolvedValueOnce([{ id: "u-c2" }]), // thisMonday
      },
      // Any cohort member has activity in any offset window.
      diaryEntry: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { userId: "u-c0" },
            { userId: "u-c1" },
            { userId: "u-c2" },
          ]),
      },
      cohortRetentionWeek: { upsert: upsertSpy },
    });
    const proc = new CohortRetentionProcessor(prisma);

    await proc.process(jobOf({ horizonWeeks: 2 }));

    expect(upsertSpy).toHaveBeenCalledTimes(6);
  });
});
