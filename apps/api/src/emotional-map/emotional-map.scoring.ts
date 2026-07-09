import type {
  EmotionalMapAffectDynamics,
  EmotionalMapAxes,
  EmotionalMapDimension,
  EmotionalMapResult,
} from "@psico/types";

import type {
  EmotionalMapMetadataPayload,
  IEmotionalMapProvider,
} from "./providers/provider.interface";
import {
  fitOu,
  MIN_OBS_FOR_FIT,
  moodToScalar,
  ouToAxes,
  type OuObservation,
} from "./dynamics/ou";

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
 * severe finite-sample bias in short series, so we withhold those two axes until
 * there's enough history to estimate θ with any confidence.
 */
export const RECOVERY_MIN_OBS = 20;
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
  /** Tier 2 kill-switch. When false, the affect-dynamics block is null. */
  ouEnabled: boolean;
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
    ouEnabled,
  } = input;

  // ── Tier 2: fit the OU model to the mood series ─────────────────────────
  const affect = computeAffectDynamics(moodSeries, ouEnabled, logger);
  const ouCalma =
    affect?.status === "active" && affect.stability != null
      ? { value: affect.stability, confidence: affect.confidence }
      : null;

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
  const confCalma = clamp01(entries.length / 8);
  const confClaridad = clamp01((taggedEntries + voiceCount) / 6);
  const confConexion = clamp01(
    (readingSessions.length + ecoMessages.length) / 8,
  );
  const confProposito = clamp01(readingSessions.length / 4);
  const confCompasion = clamp01((hardEntries + ecoDays) / 4);
  const confConsciencia = clamp01((diaryDays + ecoDays) / 10);

  // ── Mechanical axes (deterministic) ──────────────────────────────────────
  const conexionRaw = clamp01(
    Math.min(readingSessions.length / 6, 1) * 0.35 +
      Math.min(readingMinutes / 90, 1) * 0.15 +
      Math.min(ecoMessages.length / 12, 1) * 0.35 +
      Math.min((highlightCount + annotationCount) / 8, 1) * 0.15,
  );
  const propositoRaw = clamp01(
    avgProgress * 0.7 + Math.min(booksCompleted / 2, 1) * 0.3,
  );

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
  const raw: Array<{
    key: EmotionalMapDimension["key"];
    value: number;
    confidence: number;
    sources: string;
  }> = [
    {
      key: "calma",
      value: ouCalma ? ouCalma.value : calmaRaw,
      confidence: ouCalma ? ouCalma.confidence : confCalma * llmConfidenceScale,
      sources: ouCalma
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

  const dimensions: EmotionalMapDimension[] = raw.map((d) => ({
    key: d.key,
    value: d.confidence >= CONFIDENCE_FLOOR ? round2(d.value) : 0,
    confidence: round2(d.confidence),
    sources: d.sources,
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
  });

  if (nObs < MIN_OBS_FOR_FIT) return gathering();

  const fit = fitOu(obs);
  if (!fit.converged) return gathering();

  const conf = clamp01(nObs / OU_GOOD_N);
  if (conf < CONFIDENCE_FLOOR) return gathering(conf);

  const axes = ouToAxes(fit);
  // Etapa 1 — reliable axes first: baseline + stability are shown from the fit
  // floor; recovery/inertia (θ-derived) are withheld until RECOVERY_MIN_OBS.
  const recoveryReady = nObs >= RECOVERY_MIN_OBS;
  logger?.log?.(
    `EmotionalMap OU · nObs=${nObs} · sigma=${fit.params.sigma.toFixed(2)} · theta=${fit.params.theta.toFixed(2)} · stability=${axes.stability.toFixed(2)} · recoveryReady=${recoveryReady}`,
  );
  return {
    status: "active",
    nObs,
    needed: MIN_OBS_FOR_FIT,
    recoveryNeeded: RECOVERY_MIN_OBS,
    confidence: round2(conf),
    baseline: round2(axes.baseline),
    recovery: recoveryReady ? round2(axes.regulation) : null,
    stability: round2(axes.stability),
    inertiaDays: recoveryReady ? round2(fit.inertiaDays) : null,
  };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
