import { ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Plan } from "@prisma/client";
import { PatronesService } from "./patrones.service";

// ─── Fixtures ──────────────────────────────────────────────────────────

function buildPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    diaryEntry: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    onboardingMood: {
      findMany: vi.fn().mockResolvedValue([
        { id: "calma", swatch: "#A4C6FF" },
        { id: "ansiedad", swatch: "#FFB4B4" },
      ]),
    },
    weeklySummary: {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
    },
    ...overrides,
  } as unknown as ConstructorParameters<typeof PatronesService>[0];
}

function entry(mood: string, isoDate: string, hourUtc: number) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return { mood, createdAt: d };
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe("PatronesService.getPatrones", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a locked shell with entryCount for FREE callers", async () => {
    const prisma = buildPrisma({
      diaryEntry: {
        findMany: vi.fn(),
        count: vi.fn().mockResolvedValue(5),
      } as never,
    });
    const svc = new PatronesService(prisma);
    const result = await svc.getPatrones("u-1", "FREE" as Plan, "30d");

    expect(result.tier).toBe("free");
    expect(result.locked).toBe(true);
    expect(result.entryCount).toBe(5);
    expect(result.moodMap).toHaveLength(0);
    expect(result.hourMood).toHaveLength(0);
    expect(result.weeklySummary).toBeNull();
  });

  it("aggregates moodMap by day (latest entry wins) for PRO callers", async () => {
    const prisma = buildPrisma({
      diaryEntry: {
        findMany: vi.fn().mockResolvedValue([
          entry("calma", "2026-06-01", 9),
          entry("ansiedad", "2026-06-01", 22), // same day, later
          entry("calma", "2026-06-02", 8),
        ]),
        count: vi.fn(),
      } as never,
    });
    const svc = new PatronesService(prisma);
    const result = await svc.getPatrones("u-1", "PRO" as Plan, "30d");

    expect(result.tier).toBe("pro");
    expect(result.locked).toBe(false);
    expect(result.moodMap).toHaveLength(2);
    const june1 = result.moodMap.find((d) => d.date === "2026-06-01");
    expect(june1?.moodId).toBe("ansiedad"); // latest of the day
    expect(june1?.swatch).toBe("#FFB4B4");
  });

  it("buckets hourMood across 24 hours UTC", async () => {
    const prisma = buildPrisma({
      diaryEntry: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            entry("calma", "2026-06-01", 9),
            entry("calma", "2026-06-02", 9),
            entry("ansiedad", "2026-06-03", 22),
          ]),
        count: vi.fn(),
      } as never,
    });
    const svc = new PatronesService(prisma);
    const result = await svc.getPatrones("u-1", "PRO" as Plan, "30d");

    expect(result.hourMood).toHaveLength(24);
    const h9 = result.hourMood.find((b) => b.hour === 9);
    expect(h9?.moodCounts.calma).toBe(2);
    const h22 = result.hourMood.find((b) => b.hour === 22);
    expect(h22?.moodCounts.ansiedad).toBe(1);
  });

  it("uses the fallback swatch when the catalog has no row for a mood", async () => {
    const prisma = buildPrisma({
      diaryEntry: {
        findMany: vi
          .fn()
          .mockResolvedValue([entry("unknown-mood", "2026-06-01", 12)]),
        count: vi.fn(),
      } as never,
      onboardingMood: {
        findMany: vi.fn().mockResolvedValue([]),
      } as never,
    });
    const svc = new PatronesService(prisma);
    const result = await svc.getPatrones("u-1", "PRO" as Plan, "30d");

    expect(result.moodMap[0]?.swatch).toBe("#C7C0B5");
  });
});

describe("PatronesService.regenerateWeeklySummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws ForbiddenException for FREE", async () => {
    const svc = new PatronesService(buildPrisma());
    await expect(
      svc.regenerateWeeklySummary("u-1", "FREE" as Plan),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws NOT_ENOUGH_ENTRIES when the user has < 7 entries this week", async () => {
    const prisma = buildPrisma({
      diaryEntry: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            entry("calma", "2026-06-01", 9),
            entry("calma", "2026-06-02", 9),
          ]),
        count: vi.fn(),
      } as never,
    });
    const svc = new PatronesService(prisma);
    await expect(
      svc.regenerateWeeklySummary("u-1", "PRO" as Plan),
    ).rejects.toThrow("NOT_ENOUGH_ENTRIES");
  });

  it("upserts a WeeklySummary and returns the canonical row when threshold met", async () => {
    const upsertSpy = vi.fn().mockResolvedValue({
      weekStart: new Date("2026-06-01T00:00:00.000Z"),
      headline: "Headline test",
      narrative: "Narrative test",
      entriesUsed: 7,
      generatedAt: new Date("2026-06-08T03:00:00.000Z"),
    });
    const seven = Array.from({ length: 7 }, (_, i) =>
      entry("calma", `2026-06-0${i + 1}`, 10),
    );
    const prisma = buildPrisma({
      diaryEntry: {
        findMany: vi.fn().mockResolvedValue(seven),
        count: vi.fn(),
      } as never,
      weeklySummary: {
        findFirst: vi.fn(),
        upsert: upsertSpy,
      } as never,
    });
    const svc = new PatronesService(prisma);
    const result = await svc.regenerateWeeklySummary("u-1", "PRO" as Plan);

    expect(upsertSpy).toHaveBeenCalled();
    expect(result.entriesUsed).toBe(7);
    expect(result.headline).toBe("Headline test");
  });
});

describe("PatronesService.shareWithTherapist", () => {
  it("returns the v1 stub", () => {
    const svc = new PatronesService(buildPrisma());
    expect(svc.shareWithTherapist()).toEqual({ ok: true, status: "stub" });
  });
});
