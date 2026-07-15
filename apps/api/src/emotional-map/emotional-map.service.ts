import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Redis } from "ioredis";
import type { EmotionalMapResult } from "@psico/types";

import { PrismaService } from "../prisma";
import { REDIS_CLIENT } from "../redis";
import { flagEnabled } from "../shared/flags";
import type { IEmotionalMapProvider } from "./providers/provider.interface";
import { EMOTIONAL_MAP_PROVIDER } from "./tokens";
import { scoreEmotionalMap } from "./emotional-map.scoring";
import {
  lockUserShared,
  readPrivacyRevision as readRevision,
} from "./privacy-barrier";
import {
  bumpGeneration as bumpUserGeneration,
  resolveCacheKey as resolveKeyFor,
} from "./cache-identity";

/** Re-export the shared wire shape so the controller + barrel keep importing
 *  it from this module. The source of truth lives in `@psico/types`. */
export type { EmotionalMapResult } from "@psico/types";

/**
 * PR-0.1 — the cache key lives in `cache-identity.ts` and embeds the code +
 * config + per-user generation that produced the value, so a flag flip is
 * visible on the next request instead of after the TTL. Re-exported here
 * because UsersService already reaches for these through this module.
 */
export { resolveCacheKey, bumpGeneration } from "./cache-identity";
export { lockUserShared, readPrivacyRevision } from "./privacy-barrier";

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

  /**
   * PR-0.2 — the fail-closed kill switch, at the single boundary every read
   * flows through. `getForUser` is called by BOTH the controller and (via
   * `getForHome`) the home aggregator, so gating here — before privacy revision,
   * before cache, before compute — guarantees that when the map is taken down NO
   * scoring runs, on either path. The direct endpoint surfaces this as a 503; the
   * home path swallows it into `null` (see `getForHome`).
   */
  private assertPublicOrThrow(): void {
    if (!flagEnabled("EMOTIONAL_MAP_PUBLIC")) {
      throw new ServiceUnavailableException({
        code: "EMOTIONAL_MAP_UNAVAILABLE",
        message: "El mapa emocional no está disponible temporalmente.",
      });
    }
  }

  async getForUser(userId: string): Promise<EmotionalMapResult> {
    // PR-0.2 — fail closed FIRST: no compute, no scoring, no cache read when the
    // map is switched off. This throw is the endpoint's 503.
    this.assertPublicOrThrow();

    // PR-0.1 — read the DURABLE privacy revision from Postgres BEFORE touching
    // the cache. This is the ordering that makes a revocation safe:
    //
    //   old: consult Redis → maybe return a cached map → (never re-read consent)
    //   new: read the revision → derive the key → consult Redis
    //
    // The guarantee, stated precisely: EVERY REQUEST THAT BEGINS AFTER THE
    // REVOCATION COMMITS reads the new revision here, and therefore derives a key
    // that cannot address the payload built from the revoked data — regardless of
    // whether the Redis INCR succeeded, or whether Redis was reachable at all.
    //
    // It is not an absolute exclusion: a request that had ALREADY read the old
    // revision microseconds before the commit will finish with the old key. That
    // window is the ordinary read-write race of any database, it is bounded by a
    // single request, and it is not what a revocation is protecting against —
    // which is the map staying revoked-but-visible for the next 24 hours.
    //
    // Safety lives in Postgres; Redis only buys freshness.
    const privacyRevision = await this.readPrivacyRevision(userId);
    const cacheKey = await resolveKeyFor(this.redis, userId, privacyRevision);
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
   * PR-0.2 — the home aggregator's view of the map. When the kill switch is off,
   * home must keep working with `emotionalMap: null` (the client renders a
   * "temporarily unavailable" state, never zeros). We check the flag HERE and
   * return null WITHOUT calling `getForUser`, so its 503 never rejects the
   * `Promise.all` that builds the rest of Home — and, just as importantly, no
   * scoring runs on the home path either.
   */
  async getForHome(userId: string): Promise<EmotionalMapResult | null> {
    if (!flagEnabled("EMOTIONAL_MAP_PUBLIC")) return null;
    return this.getForUser(userId);
  }

  /**
   * The durable half of this user's cache identity. A user with no
   * PrivacySettings row has never granted or revoked anything, so revision 0 is
   * the honest answer.
   */
  private async readPrivacyRevision(userId: string): Promise<number> {
    // Shared with the snapshot processor, which re-reads it under the barrier
    // before persisting. One definition of "which revision am I working under".
    return readRevision(this.prisma, userId);
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
      privacy,
      resonances,
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
      // Fase D (L4) — text-analysis consent gates the feature rows below.
      this.prisma.privacySettings.findUnique({
        where: { userId },
        select: { localTextAnalysis: true },
      }),
      // Fase E (ARC-C1) — confirmed resonances: explicit user taps, the only
      // content-side signal allowed into the map. Durable (all-time) and
      // deletable by the user.
      flagEnabled("CONTENT_RESONANCE")
        ? this.prisma.resonance.findMany({
            where: { userId },
            select: { conceptKey: true, confirmedAt: true, important: true },
          })
        : Promise.resolve([]),
    ]);

    // Etapa 6 — on-device text features (numbers only; the text never left
    // the client). Fase D (L4): read them ONLY with explicit consent — rows
    // stored before consent existed stay dormant until the user opts in.
    const textFeatures = privacy?.localTextAnalysis
      ? await this.prisma.diaryTextFeature.findMany({
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
        })
      : [];

    const result = await scoreEmotionalMap(
      {
        // PR-2A — DiaryEntry.mood is now nullable. A reflexión saved without an
        // explicit check-in has mood = null: "no mood selected". It still counts
        // for day/tag aggregation, so we keep the row, but "" makes HARD_MOODS
        // never match it and it never becomes a fabricated scalar (never ?? 0).
        entries: entries.map((e) => ({ ...e, mood: e.mood ?? "" })),
        readingSessions,
        ecoMessages,
        voiceCount,
        highlightCount,
        annotationCount,
        currentStreakDays: user?.currentStreakDays ?? 0,
        // A null mood is not a series observation — exclude it from the OU fit
        // entirely (moodLog.mood stays NOT NULL, so only diary rows can be null).
        moodSeries: [
          ...diaryMoodRows.filter(
            (r): r is (typeof diaryMoodRows)[number] & { mood: string } =>
              r.mood !== null,
          ),
          ...moodLogRows,
        ],
        checkins,
        textFeatures,
        resonances,
        // Fase B flags (shared/flags.ts). Defaults preserve current behavior;
        // flipping any of these is a deliberate product decision, not a deploy
        // side-effect. EMOTIONAL_MAP_OU keeps its legacy "off" semantics.
        ouEnabled: flagEnabled("EMOTIONAL_MAP_OU"),
        ewsPublic: flagEnabled("EMOTIONAL_MAP_EWS_PUBLIC"),
        llmScoringEnabled: flagEnabled("EMOTIONAL_MAP_LLM_SCORING"),
        emotionalMapV2: flagEnabled("EMOTIONAL_MAP_V2"),
        narratorEnabled: flagEnabled("EMOTIONAL_MAP_NARRATOR"),
      },
      this.provider,
      this.logger,
    );

    // Fase F — dual-run window: while EMOTIONAL_MAP_LEGACY_UI (default on)
    // holds, clients keep the legacy layout even if the V2 data contract is
    // already active. Stripping the marker (not the data) is what flips the
    // UI — server-driven rollout, no client env involved.
    if (result.v2 && flagEnabled("EMOTIONAL_MAP_LEGACY_UI")) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip the marker, keep the rest
      const { v2: _v2, ...legacyView } = result;
      return legacyView;
    }
    return result;
  }

  /**
   * REQUIRED invalidation — the caller must fail if this fails.
   *
   * Use it whenever a stale map would be a PRIVACY or CORRECTNESS defect rather
   * than a freshness one. The motivating case is withdrawing consent for the
   * on-device text analysis: we delete the derived rows, and if the cached map
   * survives, the user keeps seeing axes built from data they just revoked. A
   * swallowed error there is a silent failure of a privacy promise, so this
   * throws and the request fails closed.
   *
   * PR-0.1 — invalidation BUMPS the per-user generation rather than deleting the
   * key for the current config. Deleting only the current key is not
   * invalidation:
   *
   *     config A → cache written under key(A)
   *     config B → user changes a mood → we delete key(B), key(A) survives
   *     config A again → key(A) is served: stale, missing that mood
   *
   * One INCR moves the user to a new generation, so every variant — including
   * configs we are not running and might roll back to — becomes unreachable at
   * once. The orphans expire on their own TTL: no KEYS, no global purge.
   */
  async invalidate(userId: string): Promise<void> {
    await bumpUserGeneration(this.redis, userId);
  }

  /**
   * BEST-EFFORT invalidation — for additive writes (a mood, a resonance, text
   * features) where a stale cache is a freshness bug, not a leak: the user sees
   * their previous map for a little longer, and nothing they revoked comes back.
   *
   * Logs loudly instead of failing the user's write. The distinction from
   * `invalidate()` is deliberate and load-bearing: a single method that always
   * swallowed would have made the consent path fail open.
   */
  async invalidateBestEffort(userId: string): Promise<void> {
    try {
      await bumpUserGeneration(this.redis, userId);
    } catch (err) {
      this.logger.warn(
        `Emotional-map cache invalidation failed for a non-critical write (user cache may be stale for up to 24h): ${(err as Error).message}`,
      );
    }
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

    // PR-0.1 — consent check, ownership guard and write are ONE serialized
    // transaction. They used to be three separate statements, which made this a
    // textbook time-of-check/time-of-use race:
    //
    //     read consent = true
    //                              ← revocation deletes every feature row
    //     upsert  ← the deleted row comes back
    //
    // Nothing about that read was wrong. It was true when it happened. It just
    // stopped being true while we were still working, and our write landed on
    // the far side of the deletion. The shared lock on the user row makes the
    // two orderings the only two possible: either we commit first and the
    // revocation then deletes what we wrote, or the revocation commits first and
    // the read below sees `false` and refuses. Either way the user's revocation
    // wins, which is the only acceptable outcome.
    const row = await this.prisma.$transaction(async (tx) => {
      await lockUserShared(tx, userId);

      // Hard server-side consent gate. Clients check the preference before
      // calling, but a stale client must not be able to upload derived data the
      // user never consented to — and now, neither can a stale TRANSACTION.
      const privacy = await tx.privacySettings.findUnique({
        where: { userId },
        select: { localTextAnalysis: true },
      });
      if (!privacy?.localTextAnalysis) {
        throw new ForbiddenException("TEXT_ANALYSIS_NOT_ENABLED");
      }

      if (entryId) {
        // Ownership guard: entryId is client-supplied — never let one user
        // overwrite another user's row by guessing an id.
        const existing = await tx.diaryTextFeature.findUnique({
          where: { entryId },
          select: { userId: true },
        });
        if (existing && existing.userId !== userId) {
          throw new ForbiddenException("TEXT_FEATURE_NOT_YOURS");
        }
      }

      return entryId
        ? tx.diaryTextFeature.upsert({
            where: { entryId },
            create: { userId, entryId, ...features },
            update: { ...features },
            select: { id: true },
          })
        : tx.diaryTextFeature.create({
            data: { userId, ...features },
            select: { id: true },
          });
    });

    // Fire-and-forget: a fresh map should reflect the new signal soon.
    void this.invalidateBestEffort(userId);
    return { ok: true, id: row.id };
  }
}
