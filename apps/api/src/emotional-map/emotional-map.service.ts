import { ForbiddenException, Inject, Injectable, Logger } from "@nestjs/common";
import type { Redis } from "ioredis";
import type { EmotionalMapResult } from "@psico/types";

import { PrismaService } from "../prisma";
import { REDIS_CLIENT } from "../redis";
import { flagEnabled } from "../shared/flags";
import type { IEmotionalMapProvider } from "./providers/provider.interface";
import { EMOTIONAL_MAP_PROVIDER } from "./tokens";
import { scoreEmotionalMap } from "./emotional-map.scoring";

/** Re-export the shared wire shape so the controller + barrel keep importing
 *  it from this module. The source of truth lives in `@psico/types`. */
export type { EmotionalMapResult } from "@psico/types";

const WINDOW_DAYS = 30;
/**
 * Tier 2 (affect dynamics) reads a longer mood history than the 30-day signal
 * window: an Ornstein–Uhlenbeck fit needs enough points to be identifiable.
 */
const OU_WINDOW_DAYS = 180;
const CACHE_TTL_SECONDS = 86400; // 24h — established maps change slowly.
/**
 * Maps that are still forming (low coverage) get a short TTL so a brand-new
 * user's first reflection or Eco chat is reflected within minutes instead of
 * being frozen at 0% for a full day.
 */
const FORMING_CACHE_TTL_SECONDS = 900; // 15 min
const FORMING_COVERAGE = 0.4;

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
    const ttl =
      result.coverage < FORMING_COVERAGE
        ? FORMING_CACHE_TTL_SECONDS
        : CACHE_TTL_SECONDS;
    await this.redis.set(cacheKey, JSON.stringify(result), "EX", ttl);
    return result;
  }

  /**
   * Fetch the metadata inputs and delegate the math to the pure
   * `scoreEmotionalMap`. Public so the daily cron + ops scripts can rebuild
   * without going through cache.
   *
   * Privacy (ADR 0007): we never select cipher/nonce columns — only categorical
   * metadata (mood, tags, timestamps) and aggregate counts leave the DB.
   */
  async compute(userId: string): Promise<EmotionalMapResult> {
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000);
    const ouSince = new Date(Date.now() - OU_WINDOW_DAYS * 86400_000);

    const [
      entries,
      readingSessions,
      ecoMessages,
      voiceCount,
      highlightCount,
      annotationCount,
      user,
      diaryMoodRows,
      moodLogRows,
      checkins,
    ] = await Promise.all([
      this.prisma.diaryEntry.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { mood: true, tags: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.readingSession.findMany({
        where: { userId, lastSeenAt: { gte: since } },
        select: { progressPct: true, completedAt: true, timeSpentSec: true },
      }),
      this.prisma.ecoMessage.findMany({
        where: { thread: { userId }, kind: "USER", createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.voiceTranscription.count({
        where: { userId, createdAt: { gte: since } },
      }),
      this.prisma.highlight.count({
        where: { userId, createdAt: { gte: since } },
      }),
      this.prisma.annotation.count({
        where: { userId, createdAt: { gte: since } },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { currentStreakDays: true },
      }),
      // Tier 2 — longer mood history for the OU fit. Only ordinal mood +
      // timestamp; never text (ADR 0007).
      this.prisma.diaryEntry.findMany({
        where: { userId, createdAt: { gte: ouSince } },
        select: { mood: true, createdAt: true },
      }),
      this.prisma.moodLog.findMany({
        where: { userId, createdAt: { gte: ouSince } },
        select: { mood: true, createdAt: true },
      }),
      // Etapa 2 — micro-checkin answers (ordinal 0–4 scores, no text).
      this.prisma.checkinResponse.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { itemKey: true, score: true, createdAt: true },
      }),
    ]);

    // Etapa 6 — on-device text features (numbers only; the text never left
    // the client). Separate await keeps the Promise.all tuple readable.
    const textFeatures = await this.prisma.diaryTextFeature.findMany({
      where: { userId, createdAt: { gte: since } },
      select: {
        wordCount: true,
        selfFocus: true,
        positive: true,
        negative: true,
        insight: true,
        causal: true,
        absolutist: true,
        social: true,
        selfKind: true,
        selfCritic: true,
        createdAt: true,
      },
    });

    return scoreEmotionalMap(
      {
        entries,
        readingSessions,
        ecoMessages,
        voiceCount,
        highlightCount,
        annotationCount,
        currentStreakDays: user?.currentStreakDays ?? 0,
        moodSeries: [...diaryMoodRows, ...moodLogRows],
        checkins,
        textFeatures,
        // Fase B flags (shared/flags.ts). Defaults preserve current behavior;
        // flipping any of these is a deliberate product decision, not a deploy
        // side-effect. EMOTIONAL_MAP_OU keeps its legacy "off" semantics.
        ouEnabled: flagEnabled("EMOTIONAL_MAP_OU"),
        ewsPublic: flagEnabled("EMOTIONAL_MAP_EWS_PUBLIC"),
        llmScoringEnabled: flagEnabled("EMOTIONAL_MAP_LLM_SCORING"),
        emotionalMapV2: flagEnabled("EMOTIONAL_MAP_V2"),
      },
      this.provider,
      this.logger,
    );
  }

  /** Cache-busting hook for the daily cron and post-write paths. */
  async invalidate(userId: string): Promise<void> {
    await this.redis.del(`emotional-map:${userId}`);
  }

  /**
   * Etapa 6 — persist the numeric text features the client computed on-device
   * (ADR 0007: the table has no text column). Upserts by entryId so re-saving
   * an entry updates its features instead of duplicating them; features
   * without an entryId (e.g. future Eco messages) just append.
   */
  async logTextFeatures(
    userId: string,
    dto: {
      entryId?: string;
      wordCount: number;
      selfFocus: number;
      positive: number;
      negative: number;
      insight: number;
      causal: number;
      absolutist: number;
      social: number;
      selfKind: number;
      selfCritic: number;
    },
  ): Promise<{ ok: true; id: string }> {
    const { entryId, ...features } = dto;
    if (entryId) {
      // Ownership guard: entryId is client-supplied — never let one user
      // overwrite another user's row by guessing an id.
      const existing = await this.prisma.diaryTextFeature.findUnique({
        where: { entryId },
        select: { userId: true },
      });
      if (existing && existing.userId !== userId) {
        throw new ForbiddenException("TEXT_FEATURE_NOT_YOURS");
      }
    }
    const row = entryId
      ? await this.prisma.diaryTextFeature.upsert({
          where: { entryId },
          create: { userId, entryId, ...features },
          update: { ...features },
          select: { id: true },
        })
      : await this.prisma.diaryTextFeature.create({
          data: { userId, ...features },
          select: { id: true },
        });
    // Fire-and-forget: a fresh map should reflect the new signal soon.
    void this.invalidate(userId).catch(() => undefined);
    return { ok: true, id: row.id };
  }
}
