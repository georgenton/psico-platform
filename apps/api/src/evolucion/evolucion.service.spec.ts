import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EvolucionService } from "./evolucion.service";

function makePrisma() {
  return {
    user: { findUnique: vi.fn() },
    diaryEntry: { count: vi.fn(), findMany: vi.fn() },
    readingSession: { findMany: vi.fn() },
    achievement: { findMany: vi.fn() },
    userAchievement: { findMany: vi.fn() },
  };
}

describe("EvolucionService — Sprint E1", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
  });

  it("throws 404 when the user does not exist", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.achievement.findMany.mockResolvedValue([]);
    prisma.userAchievement.findMany.mockResolvedValue([]);
    const service = new EvolucionService(prisma as never);
    await expect(service.getForUser("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("returns zeroed stats + empty milestones when nothing has happened", async () => {
    prisma.user.findUnique.mockResolvedValue({
      currentStreakDays: 0,
      longestStreakDays: 0,
    });
    prisma.diaryEntry.count.mockResolvedValue(0);
    prisma.readingSession.findMany.mockResolvedValue([]);
    prisma.diaryEntry.findMany.mockResolvedValue([]);
    prisma.achievement.findMany.mockResolvedValue([]);
    prisma.userAchievement.findMany.mockResolvedValue([]);
    const service = new EvolucionService(prisma as never);

    const result = await service.getForUser("user-1");
    expect(result.stats).toEqual({
      reflexiones: 0,
      capitulosCompletados: 0,
      minutosLectura: 0,
      rachaActual: 0,
      rachaMasLarga: 0,
      diasActivos30d: 0,
    });
    expect(result.milestones).toEqual([]);
  });

  it("aggregates stats from DB: reflexiones + capítulos + minutos + rachas + días activos", async () => {
    prisma.user.findUnique.mockResolvedValue({
      currentStreakDays: 3,
      longestStreakDays: 12,
    });
    prisma.diaryEntry.count.mockResolvedValue(42);
    prisma.readingSession.findMany.mockResolvedValue([
      { completedAt: new Date(), timeSpentSec: 600 },
      { completedAt: new Date(), timeSpentSec: 300 },
      { completedAt: null, timeSpentSec: 120 },
    ]);
    // 4 entries spread across 3 distinct days
    prisma.diaryEntry.findMany.mockResolvedValue([
      { createdAt: new Date("2026-06-21T08:00:00Z") },
      { createdAt: new Date("2026-06-21T20:00:00Z") },
      { createdAt: new Date("2026-06-20T10:00:00Z") },
      { createdAt: new Date("2026-06-15T10:00:00Z") },
    ]);
    prisma.achievement.findMany.mockResolvedValue([]);
    prisma.userAchievement.findMany.mockResolvedValue([]);

    const service = new EvolucionService(prisma as never);
    const result = await service.getForUser("user-1");
    expect(result.stats.reflexiones).toBe(42);
    expect(result.stats.capitulosCompletados).toBe(2);
    expect(result.stats.minutosLectura).toBe(17); // (600+300+120) / 60 rounded
    expect(result.stats.rachaActual).toBe(3);
    expect(result.stats.rachaMasLarga).toBe(12);
    expect(result.stats.diasActivos30d).toBe(3);
  });

  it("sorts milestones: unlocked (recent first) → in-progress (high % first)", async () => {
    prisma.user.findUnique.mockResolvedValue({
      currentStreakDays: 0,
      longestStreakDays: 0,
    });
    prisma.diaryEntry.count.mockResolvedValue(0);
    prisma.readingSession.findMany.mockResolvedValue([]);
    prisma.diaryEntry.findMany.mockResolvedValue([]);
    prisma.achievement.findMany.mockResolvedValue([
      {
        id: "first-entry",
        label: "Primera reflexión",
        description: "Escribe tu primera entrada",
        icon: "pencil",
        progressTarget: 1,
        category: null,
      },
      {
        id: "7-day-streak",
        label: "7 días seguidos",
        description: "Una semana de práctica",
        icon: "flame",
        progressTarget: 7,
        category: null,
      },
      {
        id: "first-book",
        label: "Primer libro",
        description: "Termina tu primer libro",
        icon: "book",
        progressTarget: 1,
        category: null,
      },
    ]);
    prisma.userAchievement.findMany.mockResolvedValue([
      {
        achievementId: "first-entry",
        progressCurrent: 1,
        unlockedAt: new Date("2026-06-10T10:00:00Z"),
      },
      {
        achievementId: "7-day-streak",
        progressCurrent: 5,
        unlockedAt: null,
      },
      {
        achievementId: "first-book",
        progressCurrent: 0,
        unlockedAt: null,
      },
    ]);

    const service = new EvolucionService(prisma as never);
    const result = await service.getForUser("user-1");
    expect(result.milestones.map((m) => m.id)).toEqual([
      "first-entry", // unlocked
      "7-day-streak", // 5/7 = 71%
      "first-book", // 0/1 = 0%
    ]);
  });
});
