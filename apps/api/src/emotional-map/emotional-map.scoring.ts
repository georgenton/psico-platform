import type {
  CheckinAxis,
  EmotionalMapAffectDynamics,
  EmotionalMapAxes,
  EmotionalMapDimension,
  EmotionalMapResult,
  ReflectionTextFeatures,
} from "@psico/types";
import { CHECKIN_ITEMS } from "@psico/types";

import type {
  EmotionalMapMetadataPayload,
  IEmotionalMapProvider,
} from "./providers/provider.interface";
import {
  fitOuWithTrend,
  MIN_OBS_FOR_FIT,
  moodToScalar,
  ouToAxes,
  type OuObservation,
} from "./dynamics/ou";
import { bootstrapAxesCI } from "./dynamics/bootstrap";
import { computeEws } from "./dynamics/ews";

/**
 * Pure emotional-map scoring — the math extracted from EmotionalMapService so
 * it can run without a database. `EmotionalMapService.compute()` fetches the
 * inputs from Prisma and delegates here; the persona benchmark
 * (emotional-map.benchmark.spec.ts) feeds synthetic inputs to the SAME function
 * so it exercises the real logic offline.
 *
 * Privacy (ADR 0007): consumes only categorical metadata (mood, tags,
 * timestamps) and counts — never text.
 */

/** Observation count at which the OU-derived confidence saturates. */
export const OU_GOOD_N = 40;
/** Hard cap on observations fed to the fit (perf guard). */
export const OU_MAX_OBS = 1000;
/**
 * Etapa 1 — reliable-axes-first gating. The baseline (μ) and the stationary
 * spread (stability) are identifiable from few observations, so they surface at
 * `MIN_OBS_FOR_FIT`. The recovery speed θ (and its reciprocal, inertia) suffers
 * severe finite-sample bias in short series, so we withhold those two axes
 * until there's enough history to estimate θ with any confidence.
 *
 * Fase B' (decision L1): raised 20 → 100 per paper-1-results E1 — θ's RMSE at
 * n=30 (1.16) exceeds the true value (1.0); it only becomes usable near n≈100.
 */
export const RECOVERY_MIN_OBS = 100;
/**
 * Below this confidence an axis is treated as "still gathering data" — the
 * value is forced to 0 and the client renders "reuniendo datos" instead of a
 * fabricated number.
 */
export const CONFIDENCE_FLOOR = 0.15;

/** Moods that signal a hard emotional moment (DIARY_MOODS ids). */
const HARD_MOODS = new Set(["low", "hard"]);

export interface ScoringLogger {
  log?(message: string): void;
  warn?(message: string): void;
}

/** Everything the scoring needs, already reduced to metadata (no DB, no text). */
export interface EmotionalMapScoringInput {
  /** Diary entries in the 30-day signal window (mood + tags + timestamp). */
  entries: ReadonlyArray<{ mood: string; tags: string[]; createdAt: Date }>;
  readingSessions: ReadonlyArray<{
    progressPct: number;
    completedAt: Date | null;
    timeSpentSec: number;
  }>;
  ecoMessages: ReadonlyArray<{ createdAt: Date }>;
  voiceCount: number;
  highlightCount: number;
  annotationCount: number;
  currentStreakDays: number;
  /** Longer mood history (diary + mood-log union) for the OU fit. */
  moodSeries: ReadonlyArray<{ mood: string; createdAt: Date }>;
  /**
   * Micro-checkin answers in the 30-day window (Etapa 2). Ordinal 0–4 scores;
   * itemKey maps to an axis via CHECKIN_ITEMS. Optional so pre-Etapa-2
   * callers/fixtures keep compiling.
   */
  checkins?: ReadonlyArray<{ itemKey: string; score: number; createdAt: Date }>;
  /**
   * Etapa 6 — numeric text features the CLIENT computed on-device from
   * decrypted reflections (the text itself never reaches the server). One row
   * per analyzed entry, 30-day window. Optional so pre-Etapa-6 callers keep
   * compiling.
   */
  textFeatures?: ReadonlyArray<ReflectionTextFeatures & { createdAt: Date }>;
  /** Tier 2 kill-switch. When false, the affect-dynamics block is null. */
  ouEnabled: boolean;
  /**
   * EMOTIONAL_MAP_EWS_PUBLIC (Fase B). When false, the EWS-R1 block is NOT
   * serialized to the client (`affectDynamics.ews = null`) — the detector is
   * research-only per paper-1-results E5 (FP 6% / sensitivity 40%). Defaults
   * to true to preserve current behavior until product sign-off.
   */
  ewsPublic?: boolean;
  /**
   * EMOTIONAL_MAP_LLM_SCORING (Fase B). When false, the H1 LLM provider is
   * never called and the interpretive axes fall back to "gathering data"
   * unless a measured signal (check-in / local text) covers them. Defaults to
   * true to preserve current behavior; V2 forbids LLM-created scores.
   */
  llmScoringEnabled?: boolean;
  /**
   * EMOTIONAL_MAP_V2 (Fase C). When true, usage activity stops feeding the
   * psychological axes (learning-vs-emotional-map.md): conexion/proposito
   * are no longer derived from reading/Eco/highlights (they gather until an
   * explicit source exists — resonances, Fase E), voiceCount leaves the
   * claridad confidence, ecoDays leave compasion/consciencia confidences,
   * and the LLM payload carries no engagement counters. Defaults to false to
   * preserve current behavior.
   */
  emotionalMapV2?: boolean;
}

/** Checkin answers per axis at which the measured confidence saturates. */
export const CHECKIN_GOOD_N = 5;

/**
 * Etapa 2 — aggregate checkin answers into per-axis measured signals.
 * value = mean(score)/4 in [0,1]; confidence grows with the answer count.
 */
export function computeCheckinAxes(
  checkins: ReadonlyArray<{ itemKey: string; score: number }>,
): Partial<Record<CheckinAxis, { value: number; confidence: number }>> {
  const axisOf = new Map(CHECKIN_ITEMS.map((i) => [i.key, i.axis]));
  const buckets = new Map<CheckinAxis, number[]>();
  for (const c of checkins) {
    const axis = axisOf.get(c.itemKey);
    if (!axis) continue; // unknown/retired item — ignore
    const list = buckets.get(axis) ?? [];
    list.push(Math.min(4, Math.max(0, c.score)));
    buckets.set(axis, list);
  }
  const out: Partial<
    Record<CheckinAxis, { value: number; confidence: number }>
  > = {};
  for (const [axis, scores] of buckets) {
    const mean = scores.reduce((a, s) => a + s, 0) / scores.length;
    out[axis] = {
      value: mean / 4,
      confidence: Math.min(1, scores.length / CHECKIN_GOOD_N),
    };
  }
  return out;
}

/** Analyzed entries per axis at which the text-derived confidence saturates. */
export const TEXT_GOOD_N = 8;
/** Density scales that map lexicon hit-rates to the 0–1 axes (tuned on the
 *  analyzer unit fixtures — see text-features.spec.ts). */
const TEXT_CLARITY_SCALE = 0.05;
const TEXT_AWARENESS_SCALE = 0.08;
const TEXT_COMPASSION_SCALE = 0.04;

/**
 * Etapa 6 — turn per-entry text features into per-axis signals.
 * value in [0,1]; confidence grows with the analyzed-entry count.
 *
 * - claridad: insight + causal language (naming and explaining feelings).
 * - consciencia: affect labeling (positive + negative emotion vocabulary).
 * - compasion: self-kind vs self-critical talk balance around neutral 0.5.
 */
export function computeTextAxes(
  rows: ReadonlyArray<ReflectionTextFeatures>,
): Partial<Record<CheckinAxis, { value: number; confidence: number }>> {
  const n = rows.length;
  if (n === 0) return {};
  const mean = (f: (r: ReflectionTextFeatures) => number) =>
    rows.reduce((a, r) => a + f(r), 0) / n;
  const confidence = Math.min(1, n / TEXT_GOOD_N);

  const claridad = clamp01(
    mean((r) => r.insight + r.causal) / TEXT_CLARITY_SCALE,
  );
  const consciencia = clamp01(
    mean((r) => r.positive + r.negative) / TEXT_AWARENESS_SCALE,
  );
  const kind = mean((r) => r.selfKind);
  const critic = mean((r) => r.selfCritic);
  const out: Partial<
    Record<CheckinAxis, { value: number; confidence: number }>
  > = {
    claridad: { value: claridad, confidence },
    consciencia: { value: consciencia, confidence },
  };
  // Compassion needs SOME self-talk evidence either way; otherwise stay quiet
  // rather than reporting a fabricated neutral.
  if (kind + critic > 0) {
    out.compasion = {
      value: clamp01(0.5 + (kind - critic) / TEXT_COMPASSION_SCALE),
      confidence,
    };
  }
  return out;
}

export async function scoreEmotionalMap(
  input: EmotionalMapScoringInput,
  provider: IEmotionalMapProvider,
  logger?: ScoringLogger,
): Promise<EmotionalMapResult> {
  const {
    entries,
    readingSessions,
    ecoMessages,
    voiceCount,
    highlightCount,
    annotationCount,
    currentStreakDays,
    moodSeries,
    checkins = [],
    textFeatures = [],
    ouEnabled,
    ewsPublic = true,
    llmScoringEnabled = true,
    emotionalMapV2 = false,
  } = input;

  // ── Tier 2: fit the OU model to the mood series ─────────────────────────
  const affect = computeAffectDynamics(
    moodSeries,
    ouEnabled,
    logger,
    ewsPublic,
  );
  const ouCalma =
    affect?.status === "active" && affect.stability != null
      ? { value: affect.stability, confidence: affect.confidence }
      : null;

  // ── Etapa 2: measured signals from the daily micro-checkins ─────────────
  const checkinAxes = computeCheckinAxes(checkins);

  // ── Etapa 6: on-device text features (numbers computed by the client) ───
  const textAxes = computeTextAxes(textFeatures);

  // ── Derived counters ─────────────────────────────────────────────────────
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const diaryDays = new Set(entries.map((e) => dayKey(e.createdAt))).size;
  const ecoDays = new Set(ecoMessages.map((m) => dayKey(m.createdAt))).size;
  const taggedEntries = entries.filter((e) => e.tags.length > 0).length;
  const hardEntries = entries.filter((e) => HARD_MOODS.has(e.mood)).length;
  const streakDays = currentStreakDays;
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

  // ── Confidence per axis ──────────────────────────────────────────────────
  // Fase C (V2 contract): under EMOTIONAL_MAP_V2, engagement counters leave
  // every confidence formula — only explicit self-report signals remain.
  const confCalma = clamp01(entries.length / 8);
  const confClaridad = emotionalMapV2
    ? clamp01(taggedEntries / 6)
    : clamp01((taggedEntries + voiceCount) / 6);
  const confConexion = emotionalMapV2
    ? 0
    : clamp01((readingSessions.length + ecoMessages.length) / 8);
  const confProposito = emotionalMapV2
    ? 0
    : clamp01(readingSessions.length / 4);
  const confCompasion = emotionalMapV2
    ? clamp01(hardEntries / 4)
    : clamp01((hardEntries + ecoDays) / 4);
  const confConsciencia = emotionalMapV2
    ? clamp01(diaryDays / 10)
    : clamp01((diaryDays + ecoDays) / 10);

  // ── Mechanical axes (deterministic) ──────────────────────────────────────
  // Under V2 these two axes have no legitimate source yet (they wait for
  // confirmed resonances, Fase E) — they stay at 0 with 0 confidence so the
  // client renders the honest gathering state instead of an engagement score.
  const conexionRaw = emotionalMapV2
    ? 0
    : clamp01(
        Math.min(readingSessions.length / 6, 1) * 0.35 +
          Math.min(readingMinutes / 90, 1) * 0.15 +
          Math.min(ecoMessages.length / 12, 1) * 0.35 +
          Math.min((highlightCount + annotationCount) / 8, 1) * 0.15,
      );
  const propositoRaw = emotionalMapV2
    ? 0
    : clamp01(avgProgress * 0.7 + Math.min(booksCompleted / 2, 1) * 0.3);

  // ── LLM axes (interpretive) ──────────────────────────────────────────────
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

  if (llmHasSignal && llmScoringEnabled) {
    const payload: EmotionalMapMetadataPayload = {
      entries: entries.map((e) => ({
        mood: e.mood,
        tags: e.tags,
        createdAtIso: e.createdAt.toISOString(),
      })),
      // Fase C (V2 contract): under EMOTIONAL_MAP_V2 the payload carries NO
      // engagement counters — usage activity never reaches the LLM.
      stats: {
        entryCount: entries.length,
        activeDays: diaryDays,
        ...(emotionalMapV2
          ? {}
          : {
              streakDays,
              ecoMessages: ecoMessages.length,
              ecoActiveDays: ecoDays,
              voiceCount,
              readingSessions: readingSessions.length,
            }),
      },
    };
    try {
      const llm = await provider.score(payload);
      calmaRaw = llm.calma;
      claridadRaw = llm.claridad;
      compasionRaw = llm.compasion;
      conscienciaRaw = llm.consciencia;
      providerName = provider.name;
    } catch (err) {
      logger?.warn?.(
        `EmotionalMap LLM scoring failed; showing gathering-data for interpretive axes. ${(err as Error).message}`,
      );
      llmConfidenceScale = 0;
    }
  } else {
    llmConfidenceScale = 0;
  }

  // ── Assemble dimensions (radar order) ────────────────────────────────────
  // For the interpretive axes, the precedence is: checkin (explicit answers) >
  // on-device text features (Etapa 6) > LLM interpretation — same pattern as
  // OU→Calma. Both checkin and text signals count as MEASURED.
  const measuredAxis = (
    axis: CheckinAxis,
    fallback: { value: number; confidence: number; sources: string },
  ) => {
    const m = checkinAxes[axis];
    if (m && m.confidence >= CONFIDENCE_FLOOR) {
      return {
        value: m.value,
        confidence: m.confidence,
        sources: "Tus respuestas al check-in diario",
        measured: true,
      };
    }
    const t = textAxes[axis];
    if (t && t.confidence >= CONFIDENCE_FLOOR) {
      return {
        value: t.value,
        confidence: t.confidence,
        sources:
          "El lenguaje de tus reflexiones — analizado en tu dispositivo; solo números salen de él",
        measured: true,
      };
    }
    return { ...fallback, measured: false };
  };

  const raw: Array<{
    key: EmotionalMapDimension["key"];
    value: number;
    confidence: number;
    sources: string;
    measured: boolean;
  }> = [
    {
      key: "calma",
      value: ouCalma ? ouCalma.value : calmaRaw,
      confidence: ouCalma ? ouCalma.confidence : confCalma * llmConfidenceScale,
      sources: ouCalma
        ? "Volatilidad medida de tu ánimo (modelo de dinámica afectiva)"
        : "Variedad y tono de tus estados de ánimo en el diario",
      measured: Boolean(ouCalma),
    },
    {
      key: "claridad",
      ...measuredAxis("claridad", {
        value: claridadRaw,
        confidence: confClaridad * llmConfidenceScale,
        sources:
          "Con qué frecuencia nombras y etiquetas lo que sientes (diario y voz)",
      }),
    },
    {
      key: "conexion",
      value: conexionRaw,
      confidence: confConexion,
      sources: emotionalMapV2
        ? "Se medirá con las resonancias que confirmes sobre lo que lees (en construcción)"
        : "Tu lectura y tus conversaciones con Eco",
      measured: false,
    },
    {
      key: "proposito",
      value: propositoRaw,
      confidence: confProposito,
      sources: emotionalMapV2
        ? "Se medirá con los temas que confirmes como importantes para ti (en construcción)"
        : "Tu avance en las lecturas que empiezas",
      measured: false,
    },
    {
      key: "compasion",
      ...measuredAxis("compasion", {
        value: compasionRaw,
        confidence: confCompasion * llmConfidenceScale,
        sources:
          "Seguir presente en los momentos difíciles (escribir o conversar)",
      }),
    },
    {
      key: "consciencia",
      ...measuredAxis("consciencia", {
        value: conscienciaRaw,
        confidence: confConsciencia * llmConfidenceScale,
        sources:
          "La regularidad con que te observas (días activos en diario y Eco)",
      }),
    },
  ];

  const dimensions: EmotionalMapDimension[] = raw.map((d) => ({
    key: d.key,
    value: d.confidence >= CONFIDENCE_FLOOR ? round2(d.value) : 0,
    confidence: round2(d.confidence),
    sources: d.sources,
    measured: d.measured && d.confidence >= CONFIDENCE_FLOOR,
  }));

  const values = dimensions.map((d) => d.value) as unknown as EmotionalMapAxes;
  const confidence = dimensions.map(
    (d) => d.confidence,
  ) as unknown as EmotionalMapAxes;

  const covered = dimensions.filter((d) => d.confidence >= CONFIDENCE_FLOOR);
  const pct = covered.length
    ? Math.round(
        (covered.reduce((a, d) => a + d.value, 0) / covered.length) * 100,
      )
    : 0;
  const coverage = round2(
    dimensions.reduce((a, d) => a + d.confidence, 0) / dimensions.length,
  );

  return {
    values,
    confidence,
    dimensions,
    pct,
    coverage,
    affectDynamics: affect,
    computedAt: new Date().toISOString(),
    provider: providerName,
  };
}

/**
 * Tier 2 — fit an OU model to the ordinal mood series and surface an
 * interpretable affect-dynamics block. Returns null only when disabled;
 * otherwise "gathering" (with progress) until enough history, then "active".
 * Privacy (ADR 0007): consumes only `{mood, createdAt}` — never text.
 */
export function computeAffectDynamics(
  rows: ReadonlyArray<{ mood: string; createdAt: Date }>,
  ouEnabled: boolean,
  logger?: ScoringLogger,
  ewsPublic = true,
): EmotionalMapAffectDynamics | null {
  if (!ouEnabled) return null;

  const obs: OuObservation[] = rows
    .map((r) => ({
      t: r.createdAt.getTime() / 86400_000, // days
      x: moodToScalar(r.mood),
    }))
    .sort((a, b) => a.t - b.t)
    .slice(-OU_MAX_OBS);
  const nObs = obs.length;

  const gathering = (conf = 0): EmotionalMapAffectDynamics => ({
    status: "gathering",
    nObs,
    needed: MIN_OBS_FOR_FIT,
    recoveryNeeded: RECOVERY_MIN_OBS,
    confidence: round2(conf),
    baseline: null,
    recovery: null,
    stability: null,
    inertiaDays: null,
    trend: null,
    margins: null,
    ews: null,
  });

  if (nObs < MIN_OBS_FOR_FIT) return gathering();

  // Etapa 4 (v1 ordinal-latent) — decompose into trend + OU residuals. When a
  // significant trend exists, stability/recovery come from the DETRENDED
  // dynamics (improving ≠ unstable) and the baseline is the trend's CURRENT
  // level (where the user is, not their window average).
  const trendFit = fitOuWithTrend(obs);
  const fit = trendFit.fit;
  if (!fit.converged) return gathering();

  const conf = clamp01(nObs / OU_GOOD_N);
  if (conf < CONFIDENCE_FLOOR) return gathering(conf);

  const axes = ouToAxes(fit);
  const baseline = trendFit.trending
    ? clamp01((trendFit.levelNow + 1) / 2)
    : axes.baseline;
  const trend = trendFit.trending
    ? trendFit.slopePerDay > 0
      ? ("up" as const)
      : ("down" as const)
    : null;
  // Etapa 1 — reliable axes first: baseline + stability are shown from the fit
  // floor; recovery/inertia (θ-derived) are withheld until RECOVERY_MIN_OBS.
  const recoveryReady = nObs >= RECOVERY_MIN_OBS;

  // Etapa 3 — 90% bootstrap half-widths in axis units, from the SAME series
  // the fit used (raw when stationary, detrended residuals when trending).
  // Deterministic seed → the cached map is reproducible. For the trending
  // baseline the bootstrap μ describes the residual mean (~0), so the ±
  // comes from the OLS prediction SE at the last observation instead.
  const ci = bootstrapAxesCI(trendFit.obsForFit, { seed: 7 });
  const halfWidth = (iv: { lo: number; hi: number }) =>
    round2(Math.max(0, (iv.hi - iv.lo) / 2));
  const margins = ci
    ? {
        baseline:
          trendFit.trending && trendFit.levelNowSe != null
            ? // 90% normal CI half-width, mood scale → axis units (÷2).
              round2((1.645 * trendFit.levelNowSe) / 2)
            : halfWidth(ci.baseline),
        recovery: recoveryReady ? halfWidth(ci.regulation) : null,
        stability: halfWidth(ci.stability),
      }
    : null;

  // Etapa 5 — early-warning signal on the same detrended series. Refuses to
  // answer below its own observation floor; never a diagnosis.
  //
  // Fase B: EWS-R1 is calibrated at FP 6% / SENSITIVITY 40% (paper-1-results
  // E5/E5b) — research-grade, not product-grade. `ewsPublic=false` withholds
  // the block from the wire entirely (clients render nothing) while the
  // detector keeps running internally for research/benchmark use.
  const ewsRaw = computeEws(trendFit.obsForFit);
  const ews = ewsPublic
    ? {
        status: ewsRaw.status,
        tauAc: ewsRaw.tauAc,
        tauVar: ewsRaw.tauVar,
        needed: ewsRaw.needed,
      }
    : null;

  logger?.log?.(
    `EmotionalMap OU · nObs=${nObs} · sigma=${fit.params.sigma.toFixed(2)} · theta=${fit.params.theta.toFixed(2)} · stability=${axes.stability.toFixed(2)} · trend=${trend ?? "none"} · ews=${ewsRaw.status} · recoveryReady=${recoveryReady}`,
  );
  return {
    status: "active",
    nObs,
    needed: MIN_OBS_FOR_FIT,
    recoveryNeeded: RECOVERY_MIN_OBS,
    confidence: round2(conf),
    baseline: round2(baseline),
    recovery: recoveryReady ? round2(axes.regulation) : null,
    stability: round2(axes.stability),
    inertiaDays: recoveryReady ? round2(fit.inertiaDays) : null,
    trend,
    margins,
    ews,
  };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
