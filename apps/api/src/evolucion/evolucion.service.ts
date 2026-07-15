import { Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma";
import { matchesFactsIdentity } from "../emotional-map/cache-identity";
import { flagEnabled } from "../shared/flags";
import { ACHIEVEMENT_CATALOG } from "./achievement-catalog";
import type { AchievementSeed, ProgressKey } from "./achievement-catalog";

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
  /**
   * Fase C (V2) — Evolución IS the learning dashboard: engagement counters
   * live here, not on the emotional map. Eco USER messages, all time.
   */
  conversacionesEco: number;
  /** Highlights + annotations created while reading, all time. */
  marcasLectura: number;
}

/**
 * Sprint G2 — Historical comprehension series for the Evolución line
 * chart. Empty array when the cron hasn't snapped any month yet.
 */
export interface EvolucionEmotionalSeriesPoint {
  /** ISO date YYYY-MM-DD anchored to the first of the month UTC. */
  monthIso: string;
  /** 0..100 percent, same shape as `EmotionalMapResult.pct`. LEGACY (Fase G). */
  pct: number;
  /** Fase G — map data coverage that month (0..100), null pre-Fase-G. */
  coverage: number | null;
}

export interface EvolucionResponse {
  stats: EvolucionStats;
  /** All achievements from the catalog, sorted by (unlocked desc → progress desc). */
  milestones: EvolucionMilestone[];
  /**
   * PR-0.2 — false when the emotional map is switched off
   * (EMOTIONAL_MAP_PUBLIC). Distinct from an empty series: the clients show a
   * "temporarily unavailable" note for the emotional history section, not "no
   * history yet". Stats + milestones stay available.
   */
  emotionalMapAvailable: boolean;
  /**
   * Sprint G2 — monthly comprehension snapshots, sorted asc. PR-0.2 — `null`
   * (not `[]`) when `emotionalMapAvailable` is false: the history is withheld,
   * not absent.
   */
  emotionalSeries: EvolucionEmotionalSeriesPoint[] | null;
}

/** Sprint G2 — how many months of historical snapshots to surface. The
 *  design shows ~6 months; we return 12 to give the chart a bit more
 *  context when the user has been around longer. */
const SERIES_MAX_MONTHS = 12;

@Injectable()
export class EvolucionService {
  constructor(private readonly prisma: PrismaService) {}

  async getForUser(userId: string): Promise<EvolucionResponse> {
    // PR-0.2 — the emotional map kill switch also hides the emotional HISTORY.
    // When off, we do NOT read the snapshots at all (they are the same derived
    // data the live map serves), and the client shows a maintenance note for
    // the emotional section — not "no history yet". Stats + milestones are
    // engagement/achievement data, unaffected, so they stay available.
    const emotionalMapAvailable = flagEnabled("EMOTIONAL_MAP_PUBLIC");

    const [user, existingUserAchievements, emotionalSeries] = await Promise.all(
      [
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { currentStreakDays: true, longestStreakDays: true },
        }),
        this.prisma.userAchievement.findMany({ where: { userId } }),
        emotionalMapAvailable
          ? this.fetchEmotionalSeries(userId)
          : Promise.resolve(null),
      ],
    );

    if (!user) throw new NotFoundException("USER_NOT_FOUND");

    const stats = await this.computeStats(userId, user);
    const milestones = await this.syncAndBuildMilestones(
      userId,
      stats,
      existingUserAchievements,
    );

    return { stats, milestones, emotionalMapAvailable, emotionalSeries };
  }

  /**
   * Sprint G2 — Fetch the last N months of `EmotionalMapSnapshot` rows
   * and shape them for the client. Sorted ascending so the line draws
   * left-to-right naturally.
   */
  private async fetchEmotionalSeries(
    userId: string,
  ): Promise<EvolucionEmotionalSeriesPoint[]> {
    const rows = await this.prisma.emotionalMapSnapshot.findMany({
      where: { userId },
      orderBy: { month: "desc" },
      take: SERIES_MAX_MONTHS,
      select: {
        month: true,
        pct: true,
        coverage: true,
        factsSchemaVersion: true,
        scoringVersion: true,
        configFingerprint: true,
        factsEpoch: true,
      },
    });
    return (
      rows
        // PR-0.1 — a snapshot produced by a different FACTS schema, scoring
        // version, facts-config or facts epoch was computed by a DIFFERENT
        // model. Plotting it next to today's numbers would draw a trend that
        // never happened, so we drop it instead of rescuing it. Pre-PR-0.1 rows
        // carry NULL identity and are dropped for the same reason: we cannot
        // vouch for how they were made. (Note this is the facts identity, not
        // the wire one: reshaping the response moves no number.)
        .filter((r) => matchesFactsIdentity(r))
        .map((r) => ({
          monthIso: r.month.toISOString().slice(0, 10),
          pct: r.pct,
          // Fase G — the chart plots coverage (signal backing the map), not a
          // psychological score. Pre-Fase-G rows have no coverage → null.
          coverage: r.coverage != null ? Math.round(r.coverage * 100) : null,
        }))
        .reverse()
    );
  }

  private async computeStats(
    userId: string,
    user: { currentStreakDays: number; longestStreakDays: number },
  ): Promise<EvolucionStats> {
    const since30 = new Date(Date.now() - 30 * 86400_000);

    const [
      reflexiones,
      readingSessions,
      activeDaysRows,
      conversacionesEco,
      highlights,
      annotations,
    ] = await Promise.all([
      this.prisma.diaryEntry.count({ where: { userId } }),
      this.prisma.readingSession.findMany({
        where: { userId },
        select: { completedAt: true, timeSpentSec: true },
      }),
      this.prisma.diaryEntry.findMany({
        where: { userId, createdAt: { gte: since30 } },
        select: { createdAt: true },
      }),
      // Fase C — engagement counters belong to the learning dashboard.
      this.prisma.ecoMessage.count({
        where: { thread: { userId }, kind: "USER" },
      }),
      this.prisma.highlight.count({ where: { userId } }),
      this.prisma.annotation.count({ where: { userId } }),
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
      conversacionesEco,
      marcasLectura: highlights + annotations,
    };
  }

  /**
   * Sprint E2 — write-on-read auto-unlock.
   *
   * For each catalog entry, look up the user's current progress against the
   * matching stat. If `progressCurrent` differs from the stored row, upsert
   * it. If the user just crossed the target, set `unlockedAt = now`.
   *
   * Side effects on a GET are normally a smell, but they're acceptable here:
   *   - Idempotent (same input → same output, same DB end-state).
   *   - The writes are tiny (1 row per achievement, at most 12 today).
   *   - Avoids an event bus + hooks across DiaryService / LectorService /
   *     etc. that would otherwise need to fan out on every write.
   */
  private async syncAndBuildMilestones(
    userId: string,
    stats: EvolucionStats,
    existing: Array<{
      achievementId: string;
      progressCurrent: number;
      unlockedAt: Date | null;
    }>,
  ): Promise<EvolucionMilestone[]> {
    const existingById = new Map(existing.map((e) => [e.achievementId, e]));
    const now = new Date();

    // Build the desired state per catalog entry. Then upsert only the ones
    // that drift (progress changed) or just unlocked.
    const updates: Promise<unknown>[] = [];
    const items: EvolucionMilestone[] = [];

    for (const entry of ACHIEVEMENT_CATALOG) {
      const progressCurrent = readStat(stats, entry.progressKey);
      const reachedNow = progressCurrent >= entry.progressTarget;
      const prior = existingById.get(entry.id);
      const unlockedAt = prior?.unlockedAt
        ? prior.unlockedAt
        : reachedNow
          ? now
          : null;

      const drift =
        !prior ||
        prior.progressCurrent !== progressCurrent ||
        (unlockedAt !== null && prior.unlockedAt === null);

      if (drift) {
        updates.push(
          this.prisma.userAchievement.upsert({
            where: {
              userId_achievementId: { userId, achievementId: entry.id },
            },
            create: {
              userId,
              achievementId: entry.id,
              progressCurrent,
              unlockedAt,
            },
            update: { progressCurrent, unlockedAt: unlockedAt ?? null },
          }),
        );
      }

      items.push({
        id: entry.id,
        label: entry.label,
        description: entry.description,
        icon: entry.icon,
        progressTarget: entry.progressTarget,
        progressCurrent,
        unlockedAt: unlockedAt?.toISOString() ?? null,
        category: entry.category,
      });
    }

    // Fire-and-forget would be tempting, but we await to keep the DB
    // consistent before the response goes out (avoid stale read on a
    // follow-up call within the same second).
    if (updates.length > 0) await Promise.all(updates);

    // Sort: unlocked first (most recent), then in-progress by completion %.
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

function readStat(stats: EvolucionStats, key: ProgressKey): number {
  return stats[key];
}

// Re-export so callers (web client, seed scripts) can stay typed without
// crossing module boundaries.
export type { AchievementSeed, ProgressKey };
export { ACHIEVEMENT_CATALOG };
