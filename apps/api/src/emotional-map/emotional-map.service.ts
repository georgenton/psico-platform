import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Redis } from "ioredis";

import { PrismaService } from "../prisma";
import { REDIS_CLIENT } from "../redis";
import type {
  EmotionalMapMetadataPayload,
  IEmotionalMapProvider,
} from "./providers/provider.interface";
import { EMOTIONAL_MAP_PROVIDER } from "./tokens";

/** Wire shape consumed by the client. Order matches the Radar component
 *  axes (Calma · Claridad · Conexión · Propósito · Compasión · Consciencia). */
export interface EmotionalMapResult {
  values: [number, number, number, number, number, number];
  pct: number;
  /** ISO timestamp the radar was last computed. */
  computedAt: string;
  /** Which provider answered the LLM axes (or "fallback" when neutral). */
  provider: string;
}

const WINDOW_DAYS = 30;
const CACHE_TTL_SECONDS = 86400; // 24h
const NEUTRAL = 0.5;

@Injectable()
export class EmotionalMapService {
  private readonly logger = new Logger(EmotionalMapService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMOTIONAL_MAP_PROVIDER)
    private readonly provider: IEmotionalMapProvider,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getForUser(userId: string): Promise<EmotionalMapResult> {
    const cacheKey = `emotional-map:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as EmotionalMapResult;
      } catch {
        // bad cache — fall through and recompute
      }
    }
    const result = await this.compute(userId);
    await this.redis.set(
      cacheKey,
      JSON.stringify(result),
      "EX",
      CACHE_TTL_SECONDS,
    );
    return result;
  }

  /** Public so the daily cron + ops scripts can rebuild without going through cache. */
  async compute(userId: string): Promise<EmotionalMapResult> {
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000);

    const [entries, readingSessions, user] = await Promise.all([
      this.prisma.diaryEntry.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { mood: true, tags: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.readingSession.findMany({
        where: { userId, lastSeenAt: { gte: since } },
        select: { progressPct: true, completedAt: true, timeSpentSec: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { currentStreakDays: true },
      }),
    ]);

    const activeDays = new Set(
      entries.map((e) => e.createdAt.toISOString().slice(0, 10)),
    ).size;
    const streakDays = user?.currentStreakDays ?? 0;

    // ── Empty-state short circuit ─────────────────────────────────────────
    // Users with zero real signal (fresh onboarding done, no reading, no
    // diary entries) previously received a symmetric 50% radar which looked
    // like real data. Instead return a null-shaped radar so the client can
    // render an empty state ("empieza a interactuar para ver tu mapa"). We
    // don't cache this — the next visit re-evaluates.
    if (readingSessions.length === 0 && entries.length === 0) {
      return {
        values: [0, 0, 0, 0, 0, 0],
        pct: 0,
        computedAt: new Date().toISOString(),
        provider: "fallback",
      };
    }

    // ── Mechanical axes (rule-based, deterministic) ────────────────────────
    // Propósito: book progress. Average completion % across sessions in the
    // window. Capped at 1. If no sessions, default neutral 0.5.
    const proposito = readingSessions.length
      ? clamp01(
          readingSessions.reduce((acc, s) => acc + s.progressPct / 100, 0) /
            readingSessions.length,
        )
      : NEUTRAL;

    // Conexión: depth of engagement with content. Combines:
    //  - distinct chapters touched (variety)
    //  - total minutes (depth)
    // Both saturate at modest targets to keep the axis from pinning at 1
    // for power users (the radar tells a story, not a leaderboard).
    // When the user has zero sessions we keep the axis at NEUTRAL — the
    // radar's "no data" shape stays as a symmetric hexagon at 50%, not a
    // jagged line that suggests judgment.
    const minutes = Math.round(
      readingSessions.reduce((acc, s) => acc + s.timeSpentSec, 0) / 60,
    );
    const conexion = readingSessions.length
      ? clamp01(
          Math.min(readingSessions.length / 6, 1) * 0.5 +
            Math.min(minutes / 90, 1) * 0.5,
        )
      : NEUTRAL;

    // ── LLM axes (interpretive) ────────────────────────────────────────────
    // If we have <3 entries the LLM has no real signal — short-circuit to
    // neutral so we don't waste the call.
    let calma = NEUTRAL;
    let claridad = NEUTRAL;
    let compasion = NEUTRAL;
    let consciencia = NEUTRAL;
    let providerName = "fallback";

    if (entries.length >= 3) {
      const payload: EmotionalMapMetadataPayload = {
        entries: entries.map((e) => ({
          mood: e.mood,
          tags: e.tags,
          createdAtIso: e.createdAt.toISOString(),
        })),
        stats: {
          entryCount: entries.length,
          streakDays,
          activeDays,
        },
      };
      try {
        const llm = await this.provider.score(payload);
        calma = llm.calma;
        claridad = llm.claridad;
        compasion = llm.compasion;
        consciencia = llm.consciencia;
        providerName = this.provider.name;
      } catch (err) {
        this.logger.warn(
          `EmotionalMap LLM scoring failed; falling back to neutral. ${(err as Error).message}`,
        );
      }
    }

    const values: EmotionalMapResult["values"] = [
      calma,
      claridad,
      conexion,
      proposito,
      compasion,
      consciencia,
    ];
    const pct = Math.round((values.reduce((a, b) => a + b, 0) / 6) * 100);

    return {
      values,
      pct,
      computedAt: new Date().toISOString(),
      provider: providerName,
    };
  }

  /** Cache-busting hook for the daily cron and post-write paths. */
  async invalidate(userId: string): Promise<void> {
    await this.redis.del(`emotional-map:${userId}`);
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
