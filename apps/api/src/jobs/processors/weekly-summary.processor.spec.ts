import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import type { Job } from "bullmq";

import { WeeklySummaryGenerationProcessor } from "./weekly-summary.processor";
import { JobName } from "../queue-names";

/**
 * Sprint S46 — WeeklySummaryGenerationProcessor tests.
 *
 * The processor is a fan-out + retry shell around
 * `PatronesService.regenerateWeeklySummary`. We mock that method to assert:
 *  1. only Pro+ users with weeklyReport=true are picked.
 *  2. NOT_ENOUGH_ENTRIES errors are swallowed per-user.
 *  3. ForbiddenException (race with plan change) is swallowed.
 *  4. Unknown errors are swallowed per-user — they don't abort the run.
 *  5. dryRun=true short-circuits the LLM calls.
 *  6. Unknown job names throw (defensive against queue misconfiguration).
 */

function buildPrisma(users: unknown[] = []) {
  return {
    user: { findMany: vi.fn().mockResolvedValue(users) },
  } as never;
}

function buildPatrones(
  impl: (userId: string, plan: string) => Promise<unknown> = async () => ({}),
) {
  return {
    regenerateWeeklySummary: vi.fn(impl),
  } as never;
}

function jobOf<T>(data: T): Job<T> {
  return { name: JobName.RUN_WEEKLY_SUMMARY_GENERATION, data } as Job<T>;
}

describe("WeeklySummaryGenerationProcessor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unknown job names — defensive against queue misconfiguration", async () => {
    const proc = new WeeklySummaryGenerationProcessor(
      buildPrisma(),
      buildPatrones(),
    );
    await expect(
      proc.process({ name: "wrong-name", data: {} } as never),
    ).rejects.toThrow(/unknown job/);
  });

  it("queries Pro+ users with weeklyReport=true and calls the service for each", async () => {
    const users = [
      { id: "u-1", plan: "PRO" },
      { id: "u-2", plan: "ANNUAL" },
      { id: "u-3", plan: "B2B" },
    ];
    const prisma = buildPrisma(users);
    const patrones = buildPatrones();
    const proc = new WeeklySummaryGenerationProcessor(prisma, patrones);

    await proc.process(jobOf({}));

    // Where-clause shape: plan filter + weeklyReport=true on settings.
    const findManyArgs = (prisma.user.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(findManyArgs.where).toMatchObject({
      isActive: true,
      plan: { in: ["PRO", "ANNUAL", "B2B"] },
      notificationSettings: { is: { weeklyReport: true } },
    });

    expect(patrones.regenerateWeeklySummary).toHaveBeenCalledTimes(3);
    expect(patrones.regenerateWeeklySummary).toHaveBeenNthCalledWith(
      1,
      "u-1",
      "PRO",
    );
    expect(patrones.regenerateWeeklySummary).toHaveBeenNthCalledWith(
      2,
      "u-2",
      "ANNUAL",
    );
    expect(patrones.regenerateWeeklySummary).toHaveBeenNthCalledWith(
      3,
      "u-3",
      "B2B",
    );
  });

  it("swallows NOT_ENOUGH_ENTRIES per-user without aborting the run", async () => {
    const users = [
      { id: "u-1", plan: "PRO" },
      { id: "u-2", plan: "PRO" }, // <-- this one has too few entries
      { id: "u-3", plan: "PRO" },
    ];
    const prisma = buildPrisma(users);
    const patrones = buildPatrones(async (userId: string) => {
      if (userId === "u-2") throw new Error("NOT_ENOUGH_ENTRIES");
      return {};
    });
    const proc = new WeeklySummaryGenerationProcessor(prisma, patrones);

    await expect(proc.process(jobOf({}))).resolves.toBeUndefined();
    // All 3 were attempted; only 2 succeeded but the run did not throw.
    expect(patrones.regenerateWeeklySummary).toHaveBeenCalledTimes(3);
  });

  it("swallows ForbiddenException (FREE plan race) without aborting", async () => {
    const users = [
      { id: "u-1", plan: "PRO" },
      { id: "u-free", plan: "PRO" }, // mid-run plan change → service throws
      { id: "u-3", plan: "PRO" },
    ];
    const prisma = buildPrisma(users);
    const patrones = buildPatrones(async (userId: string) => {
      if (userId === "u-free") throw new ForbiddenException("PRO_REQUIRED");
      return {};
    });
    const proc = new WeeklySummaryGenerationProcessor(prisma, patrones);

    await expect(proc.process(jobOf({}))).resolves.toBeUndefined();
    expect(patrones.regenerateWeeklySummary).toHaveBeenCalledTimes(3);
  });

  it("swallows arbitrary errors (LLM 5xx, DB hiccup) per-user", async () => {
    const users = [
      { id: "u-1", plan: "PRO" },
      { id: "u-bad", plan: "PRO" },
      { id: "u-3", plan: "PRO" },
    ];
    const prisma = buildPrisma(users);
    const patrones = buildPatrones(async (userId: string) => {
      if (userId === "u-bad") throw new Error("Anthropic 503");
      return {};
    });
    const proc = new WeeklySummaryGenerationProcessor(prisma, patrones);

    await expect(proc.process(jobOf({}))).resolves.toBeUndefined();
    expect(patrones.regenerateWeeklySummary).toHaveBeenCalledTimes(3);
  });

  it("dryRun=true short-circuits all LLM calls but still lists candidates", async () => {
    const users = [
      { id: "u-1", plan: "PRO" },
      { id: "u-2", plan: "ANNUAL" },
    ];
    const prisma = buildPrisma(users);
    const patrones = buildPatrones();
    const proc = new WeeklySummaryGenerationProcessor(prisma, patrones);

    await proc.process(jobOf({ dryRun: true }));

    expect(prisma.user.findMany).toHaveBeenCalledOnce();
    expect(patrones.regenerateWeeklySummary).not.toHaveBeenCalled();
  });

  it("when no users match, does nothing and does not throw", async () => {
    const prisma = buildPrisma([]);
    const patrones = buildPatrones();
    const proc = new WeeklySummaryGenerationProcessor(prisma, patrones);

    await expect(proc.process(jobOf({}))).resolves.toBeUndefined();
    expect(patrones.regenerateWeeklySummary).not.toHaveBeenCalled();
  });
});
