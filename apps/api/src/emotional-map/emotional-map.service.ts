import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Redis } from "ioredis";
import type {
  EmotionalMapAxes,
  EmotionalMapDimension,
  EmotionalMapResult,
} from "@psico/types";

import { PrismaService } from "../prisma";
import { REDIS_CLIENT } from "../redis";
import type {
  EmotionalMapMetadataPayload,
  IEmotionalMapProvider,
} from "./providers/provider.interface";
import { EMOTIONAL_MAP_PROVIDER } from "./tokens";
import {
  fitOu,
  MIN_OBS_FOR_FIT,
  moodToScalar,
  ouToAxes,
  type OuObservation,
} from "./dynamics/ou";

/** Re-export the shared wire shape so the controller + barrel keep importing
 *  it from this module. The source of truth lives in `@psico/types`. */
export type { EmotionalMapResult } from "@psico/types";

const WINDOW_DAYS = 30;
/**
 * Tier 2 (affect dynamics) reads a longer mood history than the 30-day signal
 * window: an Ornstein–Uhlenbeck fit needs enough points to be identifiable.
 */
const OU_WINDOW_DAYS = 180;
/** Observation count at which the OU-derived Calma reaches full confidence. */
const OU_GOOD_N = 40;
/** Hard cap on observations fed to the fit (perf guard). */
const OU_MAX_OBS = 1000;
const CACHE_TTL_SECONDS = 86400; // 24h — established maps change slowly.
/**
 * Maps that are still forming (low coverage) get a short TTL so a brand-new
 * user's first reflection or Eco chat is reflected within minutes instead of
 * being frozen at 0% for a full day.
 */
const FORMING_CACHE_TTL_SECONDS = 900; // 15 min
const FORMING_COVERAGE = 0.4;

/**
 * Below this confidence an axis is treated as "still gathering data" — the
 * value is forced to 0 and the client renders "reuniendo datos" instead of a
 * fabricated number. This is the fix for the old behaviour where a brand-new
 * user with one entry saw a symmetric ~50% radar that looked like real
 * insight.
 */
const CONFIDENCE_FLOOR = 0.15;

/** Moods that signal a hard emotional moment (DIARY_MOODS ids). */
const HARD_MOODS = new Set(["low", "hard"]);

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

  /** Public so the daily cron + ops scripts can rebuild without going through cache. */
  async compute(userId: string): Promise<EmotionalMapResult> {
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000);
    const ouSince = new Date(Date.now() - OU_WINDOW_DAYS * 86400_000);

    // ── Gather every plaintext signal we're allowed to read (ADR 0007) ──────
    // We never select the encrypted cipher/nonce columns. Only categorical
    // metadata (mood, tags, timestamps) and aggregate counts leave the DB.
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
      // ── Tier 2 (affect dynamics) — longer mood history for the OU fit.
      // Only ordinal mood + timestamp; never text (ADR 0007).
      this.prisma.diaryEntry.findMany({
        where: { userId, createdAt: { gte: ouSince } },
        select: { mood: true, createdAt: true },
      }),
      this.prisma.moodLog.findMany({
        where: { userId, createdAt: { gte: ouSince } },
        select: { mood: true, createdAt: true },
      }),
    ]);

    // ── Tier 2: fit an Ornstein–Uhlenbeck model to the mood series ──────────
    // Live in production behind a kill-switch (EMOTIONAL_MAP_OU=off disables).
    // When it converges with enough points, the measured volatility drives the
    // Calma axis instead of the LLM's impression. Otherwise we fall back to the
    // Tier 1 heuristic below — the user never sees a broken axis.
    const ou = this.fitMoodDynamics([...diaryMoodRows, ...moodLogRows]);

    // ── Derived counters ────────────────────────────────────────────────────
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const diaryDays = new Set(entries.map((e) => dayKey(e.createdAt))).size;
    const ecoDays = new Set(ecoMessages.map((m) => dayKey(m.createdAt))).size;
    const taggedEntries = entries.filter((e) => e.tags.length > 0).length;
    const hardEntries = entries.filter((e) => HARD_MOODS.has(e.mood)).length;
    const streakDays = user?.currentStreakDays ?? 0;
    const readingMinutes = Math.round(
      readingSessions.reduce((acc, s) => acc + s.timeSpentSec, 0) / 60,
    );
    const booksCompleted = readingSessions.filter(
      (s) => s.completedAt != null,
    ).length;
    const avgProgress = readingSessions.length
      ? readingSessions.reduce((acc, s) => acc + s.progressPct / 100, 0) /
        readingSessions.length
      : 0;

    // ── Confidence per axis — how much real signal backs each dimension ─────
    // Each ratio saturates at 1. The rubric is intentionally conservative: an
    // axis only "unlocks" once it has a few independent data points.
    const confCalma = clamp01(entries.length / 8);
    const confClaridad = clamp01((taggedEntries + voiceCount) / 6);
    const confConexion = clamp01(
      (readingSessions.length + ecoMessages.length) / 8,
    );
    const confProposito = clamp01(readingSessions.length / 4);
    const confCompasion = clamp01((hardEntries + ecoDays) / 4);
    const confConsciencia = clamp01((diaryDays + ecoDays) / 10);

    // ── Mechanical axes (deterministic, rule-based) ─────────────────────────
    // Conexión: reaching out — reading depth + Eco conversations + margin notes.
    const conexionRaw = clamp01(
      Math.min(readingSessions.length / 6, 1) * 0.35 +
        Math.min(readingMinutes / 90, 1) * 0.15 +
        Math.min(ecoMessages.length / 12, 1) * 0.35 +
        Math.min((highlightCount + annotationCount) / 8, 1) * 0.15,
    );
    // Propósito: follow-through on the books you start.
    const propositoRaw = clamp01(
      avgProgress * 0.7 + Math.min(booksCompleted / 2, 1) * 0.3,
    );

    // ── LLM axes (interpretive) ─────────────────────────────────────────────
    // Only call the model when at least one of its axes has real signal —
    // otherwise the four axes stay in "reuniendo datos" and we skip the call.
    let calmaRaw = 0;
    let claridadRaw = 0;
    let compasionRaw = 0;
    let conscienciaRaw = 0;
    let providerName = "rule-based";
    let llmConfidenceScale = 1;

    const llmHasSignal =
      confCalma >= CONFIDENCE_FLOOR ||
      confClaridad >= CONFIDENCE_FLOOR ||
      confCompasion >= CONFIDENCE_FLOOR ||
      confConsciencia >= CONFIDENCE_FLOOR;

    if (llmHasSignal) {
      const payload: EmotionalMapMetadataPayload = {
        entries: entries.map((e) => ({
          mood: e.mood,
          tags: e.tags,
          createdAtIso: e.createdAt.toISOString(),
        })),
        stats: {
          entryCount: entries.length,
          streakDays,
          activeDays: diaryDays,
          ecoMessages: ecoMessages.length,
          ecoActiveDays: ecoDays,
          voiceCount,
          readingSessions: readingSessions.length,
        },
      };
      try {
        const llm = await this.provider.score(payload);
        calmaRaw = llm.calma;
        claridadRaw = llm.claridad;
        compasionRaw = llm.compasion;
        conscienciaRaw = llm.consciencia;
        providerName = this.provider.name;
      } catch (err) {
        // The model is unavailable — don't fabricate. Collapse the four LLM
        // axes to "reuniendo datos" by zeroing their confidence this run.
        this.logger.warn(
          `EmotionalMap LLM scoring failed; showing gathering-data for interpretive axes. ${(err as Error).message}`,
        );
        llmConfidenceScale = 0;
      }
    } else {
      // Not enough signal to interpret — no fabricated values, no call.
      llmConfidenceScale = 0;
    }

    // ── Assemble dimensions (radar order) ───────────────────────────────────
    // Interpretive axes lose their confidence when the LLM couldn't answer.
    const raw: Array<{
      key: EmotionalMapDimension["key"];
      value: number;
      confidence: number;
      sources: string;
    }> = [
      {
        key: "calma",
        // Tier 2: when the OU fit is available, Calma is the measured
        // stability (low mood volatility → high calma). Otherwise fall back to
        // the Tier 1 interpretive value.
        value: ou ? ou.calma : calmaRaw,
        confidence: ou ? ou.confidence : confCalma * llmConfidenceScale,
        sources: ou
          ? "Volatilidad medida de tu ánimo (modelo de dinámica afectiva)"
          : "Variedad y tono de tus estados de ánimo en el diario",
      },
      {
        key: "claridad",
        value: claridadRaw,
        confidence: confClaridad * llmConfidenceScale,
        sources:
          "Con qué frecuencia nombras y etiquetas lo que sientes (diario y voz)",
      },
      {
        key: "conexion",
        value: conexionRaw,
        confidence: confConexion,
        sources: "Tu lectura y tus conversaciones con Eco",
      },
      {
        key: "proposito",
        value: propositoRaw,
        confidence: confProposito,
        sources: "Tu avance en las lecturas que empiezas",
      },
      {
        key: "compasion",
        value: compasionRaw,
        confidence: confCompasion * llmConfidenceScale,
        sources:
          "Seguir presente en los momentos difíciles (escribir o conversar)",
      },
      {
        key: "consciencia",
        value: conscienciaRaw,
        confidence: confConsciencia * llmConfidenceScale,
        sources:
          "La regularidad con que te observas (días activos en diario y Eco)",
      },
    ];

    // Force "reuniendo datos" (value 0) below the floor so the radar never
    // shows a fabricated vertex. Above it, keep the real computed value.
    const dimensions: EmotionalMapDimension[] = raw.map((d) => ({
      key: d.key,
      value: d.confidence >= CONFIDENCE_FLOOR ? round2(d.value) : 0,
      confidence: round2(d.confidence),
      sources: d.sources,
    }));

    const values = dimensions.map(
      (d) => d.value,
    ) as unknown as EmotionalMapAxes;
    const confidence = dimensions.map(
      (d) => d.confidence,
    ) as unknown as EmotionalMapAxes;

    // pct averages ONLY the covered axes so low-data maps don't inflate.
    const covered = dimensions.filter((d) => d.confidence >= CONFIDENCE_FLOOR);
    const pct = covered.length
      ? Math.round(
          (covered.reduce((a, d) => a + d.value, 0) / covered.length) * 100,
        )
      : 0;
    // coverage = mean confidence across all six axes (gates the banner).
    const coverage = round2(
      dimensions.reduce((a, d) => a + d.confidence, 0) / dimensions.length,
    );

    return {
      values,
      confidence,
      dimensions,
      pct,
      coverage,
      computedAt: new Date().toISOString(),
      provider: providerName,
    };
  }

  /**
   * Tier 2 — fit an Ornstein–Uhlenbeck model to the ordinal mood series and
   * derive the Calma axis from measured volatility. Returns null (→ Tier 1
   * fallback) when disabled, under-powered, or the fit doesn't converge.
   *
   * Privacy (ADR 0007): consumes only `{mood, createdAt}` — never text.
   */
  private fitMoodDynamics(
    rows: ReadonlyArray<{ mood: string; createdAt: Date }>,
  ): { calma: number; confidence: number } | null {
    // Kill-switch: on by default; EMOTIONAL_MAP_OU=off disables in prod.
    if (process.env.EMOTIONAL_MAP_OU === "off") return null;

    const obs: OuObservation[] = rows
      .map((r) => ({
        t: r.createdAt.getTime() / 86400_000, // days
        x: moodToScalar(r.mood),
      }))
      .sort((a, b) => a.t - b.t)
      .slice(-OU_MAX_OBS);

    if (obs.length < MIN_OBS_FOR_FIT) return null;

    const fit = fitOu(obs);
    if (!fit.converged) return null;

    // Confidence grows with the number of observations, saturating at OU_GOOD_N.
    const confidence = clamp01(obs.length / OU_GOOD_N);
    if (confidence < CONFIDENCE_FLOOR) return null;

    const calma = ouToAxes(fit).stability;
    this.logger.log(
      `EmotionalMap OU · nObs=${obs.length} · sigma=${fit.params.sigma.toFixed(2)} · theta=${fit.params.theta.toFixed(2)} · calma=${calma.toFixed(2)}`,
    );
    return { calma, confidence };
  }

  /** Cache-busting hook for the daily cron and post-write paths. */
  async invalidate(userId: string): Promise<void> {
    await this.redis.del(`emotional-map:${userId}`);
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
