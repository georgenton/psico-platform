import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { HomeService } from "./home.service";

// ─── Fixtures + mock factory ─────────────────────────────────────────────────

function buildPrisma() {
  return {
    user: { findUnique: vi.fn(), update: vi.fn() },
    userProgress: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    chapter: { count: vi.fn() },
    conversation: { findFirst: vi.fn() },
    book: { findMany: vi.fn() },
    reflectionPrompt: { findFirst: vi.fn(), findUnique: vi.fn() },
    dismissedReflectionPrompt: { findMany: vi.fn(), upsert: vi.fn() },
    onboardingMood: { findUnique: vi.fn() },
    // Sprint G2b — fetchStats now also reads diaryEntry.findMany (for the
    // distinct tag count → patternsCount) and weeklySummary.count (→
    // insightsCount). Default both to safe empty values.
    diaryEntry: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    weeklySummary: { count: vi.fn().mockResolvedValue(0) },
    // Sprint B1 — MoodLog drives the mood-trend insight rule + ambient comes
    // from UserPreferences. Default: empty time series, no preferences row
    // (HomeService falls back to "calma" + returns null insightToday).
    moodLog: { findMany: vi.fn().mockResolvedValue([]) },
    userPreferences: { findUnique: vi.fn().mockResolvedValue(null) },
  };
}

const fakeUserRow = {
  firstName: "Jorge",
  name: "Jorge Quiza",
  city: "Quito",
  plan: "FREE",
  currentStreakDays: 3,
  mood: null,
};

// ─── HomeService.getHome ─────────────────────────────────────────────────────

describe("HomeService.getHome", () => {
  let service: HomeService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new HomeService(
      prisma as never,
      {
        getForUser: async () => ({
          values: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] as [
            number,
            number,
            number,
            number,
            number,
            number,
          ],
          pct: 50,
          computedAt: new Date(0).toISOString(),
          provider: "fallback",
        }),
      } as never,
      { feed: async () => ({ items: [] }) } as never,
      { topForHome: async () => [] } as never,
    );
  });

  it("throws when user does not exist", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.userProgress.findFirst.mockResolvedValue(null);
    prisma.userProgress.findMany.mockResolvedValue([]);
    prisma.userProgress.count.mockResolvedValue(0);
    prisma.book.findMany.mockResolvedValue([]);
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.dismissedReflectionPrompt.findMany.mockResolvedValue([]);
    prisma.reflectionPrompt.findFirst.mockResolvedValue(null);

    await expect(service.getHome("user-1")).rejects.toThrow(NotFoundException);
  });

  it("returns base shape with greeting and shortcuts when user is new", async () => {
    // 3 concurrent calls to findUnique (fetchUser, fetchStats, fetchRecos).
    // Default resolves to a shape that satisfies every select clause.
    prisma.user.findUnique.mockResolvedValue({
      ...fakeUserRow,
      preferences: { weeklyGoalMinutes: 60 },
    });
    prisma.userProgress.findFirst.mockResolvedValue(null);
    prisma.userProgress.findMany.mockResolvedValue([]);
    prisma.userProgress.count.mockResolvedValue(0);
    prisma.book.findMany.mockResolvedValue([]);
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.dismissedReflectionPrompt.findMany.mockResolvedValue([]);
    prisma.reflectionPrompt.findFirst.mockResolvedValue(null);

    const result = await service.getHome("user-1");

    expect(result.user.firstName).toBe("Jorge");
    expect(result.user.tier).toBe("free");
    expect(result.user.streakDays).toBe(3);
    expect(result.continueBook).toBeNull();
    expect(result.recos).toEqual([]);
    expect(result.shortcuts).toHaveLength(4);
    expect(result.shortcuts.map((s) => s.id)).toEqual([
      "reflexiones",
      "eco",
      "biblioteca",
      "terapia",
    ]);
    expect(result.greeting.text).toBeDefined();
  });

  it("computes continueBook from latest UserProgress", async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...fakeUserRow,
      preferences: { weeklyGoalMinutes: 60 },
    });
    prisma.userProgress.findFirst.mockResolvedValue({
      completedAt: new Date("2026-03-15"),
      chapter: {
        id: "ch-1",
        order: 2,
        title: "Capítulo 2",
        book: {
          id: "book-1",
          title: "Emociones",
          cover: "warm",
          author: { name: "Marina Quintana" },
        },
      },
    });
    prisma.userProgress.findMany.mockResolvedValue([]);
    prisma.userProgress.count.mockResolvedValue(1);
    prisma.chapter.count.mockResolvedValue(2);
    prisma.book.findMany.mockResolvedValue([]);
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.dismissedReflectionPrompt.findMany.mockResolvedValue([]);
    prisma.reflectionPrompt.findFirst.mockResolvedValue(null);

    const result = await service.getHome("user-1");

    expect(result.continueBook).toEqual(
      expect.objectContaining({
        bookId: "book-1",
        title: "Emociones",
        author: "Marina Quintana",
        cover: "warm",
        chapterN: 2,
        chapterTitle: "Capítulo 2",
        progressPct: 50,
      }),
    );
  });

  it("flags recos as locked when user is free and book is pro", async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...fakeUserRow,
      preferences: { weeklyGoalMinutes: 60 },
    });
    prisma.userProgress.findFirst.mockResolvedValue(null);
    prisma.userProgress.findMany.mockResolvedValue([]);
    prisma.userProgress.count.mockResolvedValue(0);
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.book.findMany.mockResolvedValue([
      {
        id: "book-pro",
        title: "Pro book",
        cover: "cool",
        plan: "PRO",
        author: { name: "Author" },
      },
    ]);
    prisma.dismissedReflectionPrompt.findMany.mockResolvedValue([]);
    prisma.reflectionPrompt.findFirst.mockResolvedValue(null);

    const result = await service.getHome("user-1");

    expect(result.recos[0].lockedByTier).toBe(true);
  });
});

// ─── HomeService.updateMood ──────────────────────────────────────────────────

describe("HomeService.updateMood", () => {
  let service: HomeService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new HomeService(
      prisma as never,
      {
        getForUser: async () => ({
          values: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] as [
            number,
            number,
            number,
            number,
            number,
            number,
          ],
          pct: 50,
          computedAt: new Date(0).toISOString(),
          provider: "fallback",
        }),
      } as never,
      { feed: async () => ({ items: [] }) } as never,
      { topForHome: async () => [] } as never,
    );
  });

  it("tolerates missing OnboardingMood row by falling back to a hardcoded swatch", async () => {
    // Sprint B6b: the catalog row may be absent if the DB wasn't re-seeded
    // after the IDs migrated from calma/foco to great/good/ok/low/hard.
    // The DTO already validates the id; this service path just enriches
    // with a swatch and must not 404.
    prisma.onboardingMood.findUnique.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({});

    const result = await service.updateMood("user-1", "great");

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ mood: "great" }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.mood).toBe("great");
    expect(typeof result.swatch).toBe("string");
    expect(result.swatch.length).toBeGreaterThan(0);
  });

  it("updates user.mood and returns swatch", async () => {
    prisma.onboardingMood.findUnique.mockResolvedValue({
      id: "calma",
      swatch: "#bde",
    });
    prisma.user.update.mockResolvedValue({});

    const result = await service.updateMood("user-1", "calma");

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ mood: "calma" }),
      }),
    );
    expect(result).toEqual({ ok: true, mood: "calma", swatch: "#bde" });
  });
});

// ─── HomeService.dismissPrompt ───────────────────────────────────────────────

describe("HomeService.dismissPrompt", () => {
  let service: HomeService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new HomeService(
      prisma as never,
      {
        getForUser: async () => ({
          values: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] as [
            number,
            number,
            number,
            number,
            number,
            number,
          ],
          pct: 50,
          computedAt: new Date(0).toISOString(),
          provider: "fallback",
        }),
      } as never,
      { feed: async () => ({ items: [] }) } as never,
      { topForHome: async () => [] } as never,
    );
  });

  it("returns 404 when prompt not found", async () => {
    prisma.reflectionPrompt.findUnique.mockResolvedValue(null);

    await expect(service.dismissPrompt("user-1", "ghost")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("upserts dismissal", async () => {
    prisma.reflectionPrompt.findUnique.mockResolvedValue({ id: "p-1" });
    prisma.dismissedReflectionPrompt.upsert.mockResolvedValue({});

    const result = await service.dismissPrompt("user-1", "p-1");

    expect(prisma.dismissedReflectionPrompt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_promptId: { userId: "user-1", promptId: "p-1" } },
      }),
    );
    expect(result).toEqual({ ok: true });
  });
});
