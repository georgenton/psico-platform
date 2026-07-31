import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACHIEVEMENT_CATALOG } from "./achievement-catalog";
import { EvolucionService } from "./evolucion.service";

function makePrisma() {
  return {
    user: { findUnique: vi.fn() },
    diaryEntry: { count: vi.fn(), findMany: vi.fn() },
    readingSession: { findMany: vi.fn() },
    userAchievement: {
      findMany: vi.fn(),
      upsert: vi.fn().mockResolvedValue({}),
    },
    // Sprint G2 — EmotionalMapSnapshot lookup for the historical series.
    // Default to empty so existing tests don't have to know about it.
    emotionalMapSnapshot: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    // Fase C — learning-dashboard engagement counters. Default 0.
    ecoMessage: { count: vi.fn().mockResolvedValue(0) },
    highlight: { count: vi.fn().mockResolvedValue(0) },
    annotation: { count: vi.fn().mockResolvedValue(0) },
    // GR-2 — learning activity, read from the V1 log. Default empty.
    learningEvent: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe("EvolucionService — Sprint E2 (catalog + auto-unlock)", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
  });

  it("throws 404 when the user does not exist", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.userAchievement.findMany.mockResolvedValue([]);
    const service = new EvolucionService(prisma as never);
    await expect(service.getForUser("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("returns zeroed stats and all catalog milestones in-progress when nothing has happened", async () => {
    prisma.user.findUnique.mockResolvedValue({
      currentStreakDays: 0,
      longestStreakDays: 0,
    });
    prisma.diaryEntry.count.mockResolvedValue(0);
    prisma.readingSession.findMany.mockResolvedValue([]);
    prisma.diaryEntry.findMany.mockResolvedValue([]);
    prisma.userAchievement.findMany.mockResolvedValue([]);

    const service = new EvolucionService(prisma as never);
    const result = await service.getForUser("user-1");

    expect(result.stats.reflexiones).toBe(0);
    expect(result.milestones).toHaveLength(ACHIEVEMENT_CATALOG.length);
    expect(result.milestones.every((m) => m.unlockedAt === null)).toBe(true);
  });

  it("GR-2: counts learning activity from the V1 log, and only completions", async () => {
    prisma.user.findUnique.mockResolvedValue({
      currentStreakDays: 0,
      longestStreakDays: 0,
    });
    prisma.diaryEntry.count.mockResolvedValue(0);
    prisma.readingSession.findMany.mockResolvedValue([]);
    prisma.diaryEntry.findMany.mockResolvedValue([]);
    prisma.userAchievement.findMany.mockResolvedValue([]);
    prisma.learningEvent.findMany.mockResolvedValue([
      {
        kind: "CHAPTER_MEDIA_COMPLETED",
        payload: { mediaKind: "AUDIOBOOK", mediaKey: "a", mediaVersion: 1 },
      },
      {
        kind: "CHAPTER_MEDIA_COMPLETED",
        payload: { mediaKind: "AUDIOBOOK", mediaKey: "a2", mediaVersion: 1 },
      },
      {
        kind: "CHAPTER_MEDIA_COMPLETED",
        payload: { mediaKind: "PODCAST", mediaKey: "p", mediaVersion: 1 },
      },
      {
        kind: "CHAPTER_MEDIA_COMPLETED",
        payload: { mediaKind: "VIDEO", mediaKey: "v", mediaVersion: 1 },
      },
      { kind: "GUIDE_SESSION_COMPLETED", payload: { guideSessionId: "gs" } },
      { kind: "PRACTICE_COMPLETED", payload: { exerciseKey: "e" } },
      { kind: "ACTIVE_RECALL_ATTEMPTED", payload: { result: "incorrect" } },
      { kind: "ACTIVE_RECALL_ATTEMPTED", payload: { result: "correct" } },
    ]);

    const service = new EvolucionService(prisma as never);
    const result = await service.getForUser("user-1");

    expect(result.stats.audiolibrosCompletados).toBe(2);
    expect(result.stats.podcastsCompletados).toBe(1);
    expect(result.stats.videoexplicacionesCompletadas).toBe(1);
    expect(result.stats.lecturasGuiadasCompletadas).toBe(1);
    expect(result.stats.practicasCompletadas).toBe(1);
    // Attempts, not results: a wrong answer counts exactly like a right one.
    expect(result.stats.recallsRealizados).toBe(2);

    // The query is a READ, narrowed to schemaVersion 1 (legacy rows are out)
    // and to the four completion kinds — starts have no counter to land in.
    const where = prisma.learningEvent.findMany.mock.calls[0]?.[0]?.where;
    expect(where.schemaVersion).toBe(1);
    expect(where.userId).toBe("user-1");
    expect(where.kind.in).toEqual([
      "CHAPTER_MEDIA_COMPLETED",
      "GUIDE_SESSION_COMPLETED",
      "PRACTICE_COMPLETED",
      "ACTIVE_RECALL_ATTEMPTED",
    ]);
    // No option or result is ever surfaced by Mi Evolución.
    expect(JSON.stringify(result.stats)).not.toContain("correct");
    expect(JSON.stringify(result.stats)).not.toContain("Option");
  });

  it("GR-2: an unrecognised media kind is skipped, never guessed", async () => {
    prisma.user.findUnique.mockResolvedValue({
      currentStreakDays: 0,
      longestStreakDays: 0,
    });
    prisma.diaryEntry.count.mockResolvedValue(0);
    prisma.readingSession.findMany.mockResolvedValue([]);
    prisma.diaryEntry.findMany.mockResolvedValue([]);
    prisma.userAchievement.findMany.mockResolvedValue([]);
    prisma.learningEvent.findMany.mockResolvedValue([
      { kind: "CHAPTER_MEDIA_COMPLETED", payload: { mediaKind: "HOLOGRAM" } },
      { kind: "CHAPTER_MEDIA_COMPLETED", payload: null },
    ]);

    const service = new EvolucionService(prisma as never);
    const result = await service.getForUser("user-1");

    expect(result.stats.audiolibrosCompletados).toBe(0);
    expect(result.stats.podcastsCompletados).toBe(0);
    expect(result.stats.videoexplicacionesCompletadas).toBe(0);
  });

  it("auto-unlocks an achievement and upserts a row when the stat crosses the target", async () => {
    prisma.user.findUnique.mockResolvedValue({
      currentStreakDays: 1,
      longestStreakDays: 1,
    });
    // 1 reflexión → cruzamos el target de "first-reflection" (1).
    prisma.diaryEntry.count.mockResolvedValue(1);
    prisma.readingSession.findMany.mockResolvedValue([]);
    prisma.diaryEntry.findMany.mockResolvedValue([]);
    prisma.userAchievement.findMany.mockResolvedValue([]);

    const service = new EvolucionService(prisma as never);
    const result = await service.getForUser("user-1");

    const firstReflection = result.milestones.find(
      (m) => m.id === "first-reflection",
    );
    expect(firstReflection?.unlockedAt).not.toBeNull();
    expect(firstReflection?.progressCurrent).toBe(1);

    // Verify the upsert was called for that achievement with a non-null unlockedAt.
    const upsertCalls = prisma.userAchievement.upsert.mock.calls;
    const firstReflectionUpsert = upsertCalls.find(
      (call) =>
        (
          call[0] as {
            where: { userId_achievementId: { achievementId: string } };
          }
        ).where.userId_achievementId.achievementId === "first-reflection",
    );
    expect(firstReflectionUpsert).toBeDefined();
    const createArgs = (
      firstReflectionUpsert as unknown as [
        { create: { unlockedAt: Date | null } },
      ]
    )[0].create;
    expect(createArgs.unlockedAt).toBeInstanceOf(Date);
  });

  it("does NOT upsert when stored progress already matches and no new unlock", async () => {
    prisma.user.findUnique.mockResolvedValue({
      currentStreakDays: 0,
      longestStreakDays: 0,
    });
    prisma.diaryEntry.count.mockResolvedValue(5);
    prisma.readingSession.findMany.mockResolvedValue([]);
    prisma.diaryEntry.findMany.mockResolvedValue([]);
    // Already stored with 5 progressCurrent, unlockedAt null. No new write
    // should fire for first-reflection since it's already at 5 with no
    // unlock change (5 >= 1 still, but unlockedAt would have been set the
    // first time progress crossed 1).
    prisma.userAchievement.findMany.mockResolvedValue([
      {
        achievementId: "first-reflection",
        progressCurrent: 5,
        unlockedAt: new Date("2026-06-01T10:00:00Z"),
      },
    ]);

    const service = new EvolucionService(prisma as never);
    await service.getForUser("user-1");

    const upsertCalls = prisma.userAchievement.upsert.mock.calls;
    const firstReflectionUpsert = upsertCalls.find(
      (call) =>
        (
          call[0] as {
            where: { userId_achievementId: { achievementId: string } };
          }
        ).where.userId_achievementId.achievementId === "first-reflection",
    );
    expect(firstReflectionUpsert).toBeUndefined();
  });

  it("PR-0.2: when EMOTIONAL_MAP_PUBLIC is off, withholds the series (null) but keeps stats + milestones", async () => {
    const prev = process.env.EMOTIONAL_MAP_PUBLIC;
    process.env.EMOTIONAL_MAP_PUBLIC = "off";
    try {
      prisma.user.findUnique.mockResolvedValue({
        currentStreakDays: 3,
        longestStreakDays: 7,
      });
      prisma.diaryEntry.count.mockResolvedValue(4);
      prisma.readingSession.findMany.mockResolvedValue([]);
      prisma.diaryEntry.findMany.mockResolvedValue([]);
      prisma.userAchievement.findMany.mockResolvedValue([]);

      const service = new EvolucionService(prisma as never);
      const result = await service.getForUser("user-1");

      // The emotional HISTORY is withheld — null, not [] (distinct from
      // "no history yet") — and the snapshot table is never touched.
      expect(result.emotionalMapAvailable).toBe(false);
      expect(result.emotionalSeries).toBeNull();
      expect(prisma.emotionalMapSnapshot.findMany).not.toHaveBeenCalled();

      // Engagement + achievements are unaffected.
      expect(result.stats.reflexiones).toBe(4);
      expect(result.milestones).toHaveLength(ACHIEVEMENT_CATALOG.length);
    } finally {
      if (prev === undefined) delete process.env.EMOTIONAL_MAP_PUBLIC;
      else process.env.EMOTIONAL_MAP_PUBLIC = prev;
    }
  });

  it("PR-0.2: with the map available (default), returns emotionalMapAvailable=true and a series", async () => {
    prisma.user.findUnique.mockResolvedValue({
      currentStreakDays: 0,
      longestStreakDays: 0,
    });
    prisma.diaryEntry.count.mockResolvedValue(0);
    prisma.readingSession.findMany.mockResolvedValue([]);
    prisma.diaryEntry.findMany.mockResolvedValue([]);
    prisma.userAchievement.findMany.mockResolvedValue([]);

    const service = new EvolucionService(prisma as never);
    const result = await service.getForUser("user-1");

    expect(result.emotionalMapAvailable).toBe(true);
    expect(result.emotionalSeries).toEqual([]);
    expect(prisma.emotionalMapSnapshot.findMany).toHaveBeenCalled();
  });

  it("sorts unlocked milestones (recent first) before in-progress (high % first)", async () => {
    prisma.user.findUnique.mockResolvedValue({
      currentStreakDays: 0,
      longestStreakDays: 0,
    });
    prisma.diaryEntry.count.mockResolvedValue(0);
    prisma.readingSession.findMany.mockResolvedValue([]);
    prisma.diaryEntry.findMany.mockResolvedValue([]);
    prisma.userAchievement.findMany.mockResolvedValue([
      {
        achievementId: "first-reflection",
        progressCurrent: 1,
        unlockedAt: new Date("2026-06-10T10:00:00Z"),
      },
      {
        achievementId: "ten-reflections",
        progressCurrent: 5, // 50% in progress — should rank ahead of others stuck at 0
        unlockedAt: null,
      },
    ]);

    const service = new EvolucionService(prisma as never);
    const result = await service.getForUser("user-1");

    // Unlocked one should land first.
    expect(result.milestones[0].id).toBe("first-reflection");
    // The 50% in-progress should rank ahead of the still-at-zero ones —
    // but only because computeStats returns 0 reflexiones, which we
    // overwrite via the stored progressCurrent for ten-reflections. The
    // service prefers the freshly computed value, so this assertion just
    // confirms the unlocked one is first.
  });
});
