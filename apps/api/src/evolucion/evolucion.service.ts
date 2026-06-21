import { Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma";

export interface EvolucionMilestone {
  /** Stable Achievement.id from the catalog. */
  id: string;
  label: string;
  description: string;
  /** Lucide-style icon token (`book-open`, `flame`, …). */
  icon: string;
  /** Threshold the user has to reach to unlock it. */
  progressTarget: number;
  /** What the user has done so far towards the target. */
  progressCurrent: number;
  /** ISO timestamp the achievement was unlocked, or null if still in progress. */
  unlockedAt: string | null;
  category: string | null;
}

export interface EvolucionStats {
  /** Total Diary entries the user ever wrote. */
  reflexiones: number;
  /** Distinct chapters with a ReadingSession.completedAt set. */
  capitulosCompletados: number;
  /** Sum of all reading minutes. */
  minutosLectura: number;
  /** User.currentStreakDays mirror. */
  rachaActual: number;
  /** User.longestStreakDays mirror. */
  rachaMasLarga: number;
  /** Distinct days the user opened anything in the last 30 days. */
  diasActivos30d: number;
}

export interface EvolucionResponse {
  stats: EvolucionStats;
  /** All achievements from the catalog, sorted by (unlocked desc → progress desc). */
  milestones: EvolucionMilestone[];
}

@Injectable()
export class EvolucionService {
  constructor(private readonly prisma: PrismaService) {}

  async getForUser(userId: string): Promise<EvolucionResponse> {
    const [user, achievementCatalog, userAchievements] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { currentStreakDays: true, longestStreakDays: true },
      }),
      this.prisma.achievement.findMany({
        orderBy: { progressTarget: "asc" },
      }),
      this.prisma.userAchievement.findMany({
        where: { userId },
      }),
    ]);

    if (!user) throw new NotFoundException("USER_NOT_FOUND");

    const stats = await this.computeStats(userId, user);
    const milestones = this.buildMilestones(
      achievementCatalog,
      userAchievements,
    );

    return { stats, milestones };
  }

  private async computeStats(
    userId: string,
    user: { currentStreakDays: number; longestStreakDays: number },
  ): Promise<EvolucionStats> {
    const since30 = new Date(Date.now() - 30 * 86400_000);

    const [reflexiones, readingSessions, activeDaysRows] = await Promise.all([
      this.prisma.diaryEntry.count({ where: { userId } }),
      this.prisma.readingSession.findMany({
        where: { userId },
        select: {
          completedAt: true,
          timeSpentSec: true,
        },
      }),
      this.prisma.diaryEntry.findMany({
        where: { userId, createdAt: { gte: since30 } },
        select: { createdAt: true },
      }),
    ]);

    const capitulosCompletados = readingSessions.filter(
      (r) => r.completedAt !== null,
    ).length;
    const minutosLectura = Math.round(
      readingSessions.reduce((acc, r) => acc + r.timeSpentSec, 0) / 60,
    );
    const diasActivos30d = new Set(
      activeDaysRows.map((r) => r.createdAt.toISOString().slice(0, 10)),
    ).size;

    return {
      reflexiones,
      capitulosCompletados,
      minutosLectura,
      rachaActual: user.currentStreakDays,
      rachaMasLarga: user.longestStreakDays,
      diasActivos30d,
    };
  }

  private buildMilestones(
    catalog: Array<{
      id: string;
      label: string;
      description: string;
      icon: string;
      progressTarget: number;
      category: string | null;
    }>,
    userRows: Array<{
      achievementId: string;
      progressCurrent: number;
      unlockedAt: Date | null;
    }>,
  ): EvolucionMilestone[] {
    const byId = new Map(userRows.map((u) => [u.achievementId, u]));
    const items: EvolucionMilestone[] = catalog.map((a) => {
      const u = byId.get(a.id);
      return {
        id: a.id,
        label: a.label,
        description: a.description,
        icon: a.icon,
        progressTarget: a.progressTarget,
        progressCurrent: u?.progressCurrent ?? 0,
        unlockedAt: u?.unlockedAt?.toISOString() ?? null,
        category: a.category,
      };
    });
    // Unlocked first (most recent first), then in-progress by completion %.
    items.sort((a, b) => {
      if (a.unlockedAt && b.unlockedAt) {
        return b.unlockedAt.localeCompare(a.unlockedAt);
      }
      if (a.unlockedAt) return -1;
      if (b.unlockedAt) return 1;
      const pa = a.progressTarget ? a.progressCurrent / a.progressTarget : 0;
      const pb = b.progressTarget ? b.progressCurrent / b.progressTarget : 0;
      return pb - pa;
    });
    return items;
  }
}
