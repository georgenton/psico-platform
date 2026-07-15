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

// Sprint S38: a tiny stub matching the AIService surface we need.
function buildAi(
  generateImpl: (
    stats: unknown,
  ) => Promise<{ headline: string; narrative: string }> = async () => ({
    headline: "LLM headline",
    narrative: "LLM narrative paragraph.",
  }),
) {
  return {
    generateWeeklyNarrative: vi.fn(generateImpl),
  } as unknown as ConstructorParameters<typeof PatronesService>[1];
}

function entry(
  mood: string,
  isoDate: string,
  hourUtc: number,
  tags: string[] = [],
) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return { mood, createdAt: d, tags };
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
    const svc = new PatronesService(prisma, buildAi());
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
    const svc = new PatronesService(prisma, buildAi());
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
    const svc = new PatronesService(prisma, buildAi());
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
    const svc = new PatronesService(prisma, buildAi());
    const result = await svc.getPatrones("u-1", "PRO" as Plan, "30d");

    expect(result.moodMap[0]?.swatch).toBe("#C7C0B5");
  });
});

describe("PatronesService.regenerateWeeklySummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws ForbiddenException for FREE", async () => {
    const svc = new PatronesService(buildPrisma(), buildAi());
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
    const svc = new PatronesService(prisma, buildAi());
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
    const svc = new PatronesService(prisma, buildAi());
    const result = await svc.regenerateWeeklySummary("u-1", "PRO" as Plan);

    expect(upsertSpy).toHaveBeenCalled();
    expect(result.entriesUsed).toBe(7);
    expect(result.headline).toBe("Headline test");
  });

  // ─── Sprint S38: LLM wiring ──────────────────────────────────────────

  it("calls the LLM with aggregated stats and persists its output", async () => {
    const seven = [
      entry("calma", "2026-06-01", 9, ["familia", "trabajo"]),
      entry("ansiedad", "2026-06-02", 10, ["trabajo"]),
      entry("calma", "2026-06-03", 7),
      entry("calma", "2026-06-04", 22, ["familia"]),
      entry("ansiedad", "2026-06-05", 18),
      entry("calma", "2026-06-06", 9, ["familia"]),
      entry("calma", "2026-06-07", 11),
    ];
    const upsertSpy = vi.fn().mockResolvedValue({
      weekStart: new Date("2026-06-01T00:00:00.000Z"),
      headline: "LLM-built headline",
      narrative: "LLM-built narrative.",
      entriesUsed: 7,
      generatedAt: new Date(),
    });
    const ai = buildAi(async () => ({
      headline: "LLM-built headline",
      narrative: "LLM-built narrative.",
    }));
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
    const svc = new PatronesService(prisma, ai);
    const result = await svc.regenerateWeeklySummary("u-1", "PRO" as Plan);

    expect(
      (ai as unknown as { generateWeeklyNarrative: ReturnType<typeof vi.fn> })
        .generateWeeklyNarrative,
    ).toHaveBeenCalledTimes(1);
    expect(result.headline).toBe("LLM-built headline");

    // What we passed to the LLM is metadata-only — the privacy invariant.
    const passed = (
      ai as unknown as { generateWeeklyNarrative: ReturnType<typeof vi.fn> }
    ).generateWeeklyNarrative.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(passed).sort()).toEqual(
      [
        "dominantMood",
        "entryCount",
        "moodCounts",
        "topTags",
        "weekStartIso",
      ].sort(),
    );
    expect(passed.entryCount).toBe(7);
    expect(passed.dominantMood).toBe("calma");
    expect(passed.topTags).toEqual(["familia", "trabajo"]);
    // Critical: no `textCiphertext`, no body, no plaintext content.
    expect(JSON.stringify(passed)).not.toContain("textCiphertext");
    expect(JSON.stringify(passed)).not.toContain("body");
  });

  it("falls back to the rule-based composer when the LLM call throws", async () => {
    const seven = Array.from({ length: 7 }, (_, i) =>
      entry("ansiedad", `2026-06-0${i + 1}`, 10),
    );
    const upsertSpy = vi.fn().mockImplementation(({ create }) =>
      Promise.resolve({
        weekStart: new Date("2026-06-01T00:00:00.000Z"),
        headline: (create as { headline: string }).headline,
        narrative: (create as { narrative: string }).narrative,
        entriesUsed: 7,
        generatedAt: new Date(),
      }),
    );
    const ai = buildAi(() => {
      throw new Error("ANTHROPIC_DOWN");
    });
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
    const svc = new PatronesService(prisma, ai);
    const result = await svc.regenerateWeeklySummary("u-1", "PRO" as Plan);

    // The rule-based composer mentions the dominant mood by name.
    expect(result.headline.toLowerCase()).toContain("ansiedad");
  });

  // ─── PR-2B: a week with NO mood recorded invents no emotion ───────────

  it("A(PR-2B): entries without a mood → the LLM sees dominantMood=null and empty moodCounts (no 'calma')", async () => {
    const sevenNullMood = Array.from({ length: 7 }, (_, i) => ({
      mood: null as string | null,
      createdAt: new Date(`2026-06-0${i + 1}T09:00:00.000Z`),
      tags: ["escritura"],
    }));
    const gen = vi
      .fn()
      .mockResolvedValue({ headline: "H", narrative: "N paragraph." });
    const ai = {
      generateWeeklyNarrative: gen,
    } as unknown as ConstructorParameters<typeof PatronesService>[1];
    const prisma = buildPrisma({
      diaryEntry: {
        findMany: vi.fn().mockResolvedValue(sevenNullMood),
        count: vi.fn(),
      } as never,
      weeklySummary: {
        findFirst: vi.fn(),
        upsert: vi.fn().mockResolvedValue({
          weekStart: new Date("2026-06-01T00:00:00.000Z"),
          headline: "H",
          narrative: "N paragraph.",
          entriesUsed: 7,
          generatedAt: new Date(),
        }),
      } as never,
    });
    const svc = new PatronesService(prisma, ai);
    await svc.regenerateWeeklySummary("u-1", "PRO" as Plan);

    const passed = gen.mock.calls[0]![0] as Record<string, unknown>;
    // dominantMood is null (NOT a fabricated "calma"); moodCounts is empty.
    expect(passed.dominantMood).toBeNull();
    expect(passed.moodCounts).toEqual({});
    // The entries are real reflexions — their tags still count.
    expect(passed.topTags).toEqual(["escritura"]);
    expect(JSON.stringify(passed)).not.toContain("calma");
  });

  it("A(PR-2B): the fallback narrative for a moodless week invents no emotion", async () => {
    const sevenNullMood = Array.from({ length: 7 }, (_, i) => ({
      mood: null as string | null,
      createdAt: new Date(`2026-06-0${i + 1}T09:00:00.000Z`),
      tags: [] as string[],
    }));
    const upsertSpy = vi.fn().mockImplementation(({ create }) =>
      Promise.resolve({
        weekStart: new Date("2026-06-01T00:00:00.000Z"),
        headline: (create as { headline: string }).headline,
        narrative: (create as { narrative: string }).narrative,
        entriesUsed: 7,
        generatedAt: new Date(),
      }),
    );
    const ai = buildAi(() => {
      throw new Error("ANTHROPIC_DOWN");
    });
    const prisma = buildPrisma({
      diaryEntry: {
        findMany: vi.fn().mockResolvedValue(sevenNullMood),
        count: vi.fn(),
      } as never,
      weeklySummary: {
        findFirst: vi.fn(),
        upsert: upsertSpy,
      } as never,
    });
    const svc = new PatronesService(prisma, ai);
    const result = await svc.regenerateWeeklySummary("u-1", "PRO" as Plan);

    const blob = `${result.headline}\n${result.narrative}`.toLowerCase();
    // No fabricated mood — not "calma", and the no-mood branch says so plainly.
    expect(blob).not.toContain("calma");
    expect(blob).toContain("no registraste un estado de ánimo");
  });
});

describe("PatronesService.shareWithTherapist", () => {
  it("returns the v1 stub", () => {
    const svc = new PatronesService(buildPrisma(), buildAi());
    expect(svc.shareWithTherapist()).toEqual({ ok: true, status: "stub" });
  });
});
