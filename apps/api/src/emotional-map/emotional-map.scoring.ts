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
  EmotionalMapNarratorFacts,
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
 * Fase F — public gate for the trend direction under the V2 contract
 * (emotional-map-v2.md §4: "60–99: + tendencia"). Below this the detrended
 * fit still runs internally (stability/baseline stay correct) but the
 * up/down label is withheld from the wire. Legacy keeps the old behavior
 * until the flag flips.
 */
export const TREND_PUBLIC_MIN_OBS = 60;
/**
 * Below this confidence an axis is treated as "still gathering data" — the
 * value is forced to 0 and the client renders "reuniendo datos" instead of a
 * fabricated number.
 */
export const CONFIDENCE_FLOOR = 0.15;

/** Moods that signal a hard emotional moment (DIARY_MOODS ids). */
const HARD_MOODS = new Set(["low", "hard"]);

/** Fase F — honest V2 source line for interpretive axes awaiting check-ins. */
const CHECKIN_PENDING_SOURCE =
  "Se llenará con tus respuestas al check-in diario (5 segundos al marcar tu ánimo)";

export interface ScoringLogger {
  log?(message: string): void;
  warn?(message: string): void;
}

/** Everything the scoring needs, already reduced to metadata (no DB, no text). */
export interface EmotionalMapScoringInput {
  /**
   * Diary entries in the 30-day signal window (mood + tags + timestamp).
   * PR-2A — `mood` is nullable: a reflexión without an explicit check-in
   * carries no mood. Such an entry still counts for day/tag/entry aggregation,
   * but is never a hard mood and never reaches the LLM as a mood. It is NEVER
   * coerced to a neutral sentinel.
   */
  entries: ReadonlyArray<{
    mood: string | null;
    tags: string[];
    createdAt: Date;
  }>;
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
  /**
   * Fase E (ARC cycle, model ARC-C1) — the user's CONFIRMED resonances.
   * The only content-side signal allowed into the map: each row is an
   * explicit "me resonó" tap. Under EMOTIONAL_MAP_V2 they become the source
   * of the conexion axis; under legacy scoring they are ignored (conexion
   * stays engagement-based, pinned by the ratchet). Optional so pre-Fase-E
   * callers/fixtures keep compiling.
   */
  resonances?: ReadonlyArray<{
    conceptKey: string;
    confirmedAt: Date;
    /**
     * Fase H (ARC-P1) — the user flagged this confirmed theme as important
     * to them right now. Distinct important themes feed the Propósito axis
     * under V2 (Eco proposes, the user confirms; nothing silent). Optional
     * so pre-Fase-H callers/fixtures keep compiling.
     */
    important?: boolean;
  }>;
  /**
   * EMOTIONAL_MAP_NARRATOR (Fase F, decision L3). When true AND the V2
   * contract is active AND the provider implements `narrate`, the map gains
   * an optional narrative built from the ALREADY-COMPUTED facts (NAR-L1,
   * copy only). Defaults to false — the narrator is apagable by design and
   * turning it off never changes the data.
   */
  narratorEnabled?: boolean;
}

/** Checkin answers per axis at which the measured confidence saturates. */
export const CHECKIN_GOOD_N = 5;

/**
 * Fase E (ARC-C1) — distinct confirmed concepts at which the conexion value
 * saturates under EMOTIONAL_MAP_V2. Confidence saturates at
 * RESONANCE_CONF_N so a single explicit confirmation already lights the axis
 * (it IS a self-report, unlike the engagement proxies it replaces).
 */
export const RESONANCE_GOOD_N = 4;
export const RESONANCE_CONF_N = 2;

/**
 * Fase H (ARC-P1) — distinct IMPORTANT themes at which the Propósito value
 * saturates under EMOTIONAL_MAP_V2. Confidence saturates at one: marking a
 * single theme as important already lights the axis (explicit self-report).
 */
export const IMPORTANT_GOOD_N = 3;
export const IMPORTANT_CONF_N = 1;

/**
 * Etapa 2 — aggregate checkin answers into per-axis measured signals.
 * value = mean(score)/4 in [0,1]; confidence grows with the answer count.
 */
export function computeCheckinAxes(
  checkins: ReadonlyArray<{ itemKey: string; score: number }>,
): Partial<
  Record<CheckinAxis, { value: number; confidence: number; n: number }>
> {
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
    Record<CheckinAxis, { value: number; confidence: number; n: number }>
  > = {};
  for (const [axis, scores] of buckets) {
    const mean = scores.reduce((a, s) => a + s, 0) / scores.length;
    out[axis] = {
      value: mean / 4,
      confidence: Math.min(1, scores.length / CHECKIN_GOOD_N),
      n: scores.length,
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
): Partial<
  Record<CheckinAxis, { value: number; confidence: number; n: number }>
> {
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
    Record<CheckinAxis, { value: number; confidence: number; n: number }>
  > = {
    claridad: { value: claridad, confidence, n },
    consciencia: { value: consciencia, confidence, n },
  };
  // Compassion needs SOME self-talk evidence either way; otherwise stay quiet
  // rather than reporting a fabricated neutral.
  if (kind + critic > 0) {
    out.compasion = {
      value: clamp01(0.5 + (kind - critic) / TEXT_COMPASSION_SCALE),
      confidence,
      n,
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
    resonances = [],
    narratorEnabled = false,
  } = input;

  // ── Tier 2: fit the OU model to the mood series ─────────────────────────
  // Fase F — under the V2 contract the trend direction is withheld until
  // TREND_PUBLIC_MIN_OBS (gates table, emotional-map-v2.md §4); the detrended
  // fit itself still runs so stability/baseline stay correct.
  const affect = computeAffectDynamics(
    moodSeries,
    ouEnabled,
    logger,
    ewsPublic,
    emotionalMapV2 ? TREND_PUBLIC_MIN_OBS : 0,
  );
  const ouCalma =
    affect?.status === "active" && affect.stability != null
      ? { value: affect.stability, confidence: affect.confidence }
      : null;

  // ── Etapa 2: measured signals from the daily micro-checkins ─────────────
  const checkinAxes = computeCheckinAxes(checkins);

  // ── Etapa 6: on-device text features (numbers computed by the client) ───
  // Fase F — under the V2 contract TXT-L1 is DESCRIPTIVE only: the features
  // surface as the "Patrones de lenguaje" section (`lenguaje.n`) and never
  // score an axis (the audit's "language patterns ≠ traits" line).
  const textAxes = emotionalMapV2 ? {} : computeTextAxes(textFeatures);

  // ── Derived counters ─────────────────────────────────────────────────────
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const diaryDays = new Set(entries.map((e) => dayKey(e.createdAt))).size;
  const ecoDays = new Set(ecoMessages.map((m) => dayKey(m.createdAt))).size;
  const taggedEntries = entries.filter((e) => e.tags.length > 0).length;
  const hardEntries = entries.filter(
    (e) => e.mood != null && HARD_MOODS.has(e.mood),
  ).length;
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
  // Fase E (ARC-C1) — under V2, conexion is fed EXCLUSIVELY by confirmed
  // resonances (explicit taps); with none, it gathers honestly.
  const resonanceConcepts = new Set(resonances.map((r) => r.conceptKey)).size;
  // Fase H (ARC-P1) — distinct themes the user explicitly flagged as
  // important right now. This is the Propósito source under V2.
  const importantConcepts = new Set(
    resonances.filter((r) => r.important).map((r) => r.conceptKey),
  ).size;
  const confConexion = emotionalMapV2
    ? clamp01(resonanceConcepts / RESONANCE_CONF_N)
    : clamp01((readingSessions.length + ecoMessages.length) / 8);
  const confProposito = emotionalMapV2
    ? clamp01(importantConcepts / IMPORTANT_CONF_N)
    : clamp01(readingSessions.length / 4);
  const confCompasion = emotionalMapV2
    ? clamp01(hardEntries / 4)
    : clamp01((hardEntries + ecoDays) / 4);
  const confConsciencia = emotionalMapV2
    ? clamp01(diaryDays / 10)
    : clamp01((diaryDays + ecoDays) / 10);

  // ── Mechanical axes (deterministic) ──────────────────────────────────────
  // Under V2: conexion = confirmed resonances (Fase E); proposito =
  // confirmed IMPORTANT themes (Fase H, ARC-P1). Both are explicit taps;
  // with none, they gather honestly instead of showing a fabricated number.
  const conexionRaw = emotionalMapV2
    ? clamp01(resonanceConcepts / RESONANCE_GOOD_N)
    : clamp01(
        Math.min(readingSessions.length / 6, 1) * 0.35 +
          Math.min(readingMinutes / 90, 1) * 0.15 +
          Math.min(ecoMessages.length / 12, 1) * 0.35 +
          Math.min((highlightCount + annotationCount) / 8, 1) * 0.15,
      );
  const propositoRaw = emotionalMapV2
    ? clamp01(importantConcepts / IMPORTANT_GOOD_N)
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

  // Fase F (decision L3) — under the V2 contract the LLM NEVER produces axis
  // numbers (facts/narrator separation, V2 principle 3): uncovered
  // interpretive axes gather honestly instead. The optional Narrator below
  // only turns already-computed facts into copy.
  if (llmHasSignal && llmScoringEnabled && !emotionalMapV2) {
    const payload: EmotionalMapMetadataPayload = {
      // PR-2A — a null-mood entry is not a mood observation: it is excluded from
      // the LLM payload entirely (never sent as "" / "ok" / neutral).
      entries: entries
        .filter(
          (e): e is { mood: string; tags: string[]; createdAt: Date } =>
            e.mood != null,
        )
        .map((e) => ({
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
  // Fase D — Evidence lite: every covered axis declares which Model Registry
  // entry produced it and how many observations back it (the ⓘ modal shows
  // "Método · N registros" so provenance is never implicit).
  const llmEvidence = { modelId: "H1", n: entries.length };
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
        evidence: { modelId: "CHK-S1", n: m.n },
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
        evidence: { modelId: "TXT-L1", n: t.n },
      };
    }
    return { ...fallback, measured: false, evidence: llmEvidence };
  };

  const raw: Array<{
    key: EmotionalMapDimension["key"];
    value: number;
    confidence: number;
    sources: string;
    measured: boolean;
    evidence: { modelId: string; n: number };
  }> = [
    {
      key: "calma",
      value: ouCalma ? ouCalma.value : calmaRaw,
      confidence: ouCalma ? ouCalma.confidence : confCalma * llmConfidenceScale,
      sources: ouCalma
        ? "Volatilidad medida de tu ánimo (modelo de dinámica afectiva)"
        : "Variedad y tono de tus estados de ánimo en el diario",
      measured: Boolean(ouCalma),
      evidence:
        affect?.status === "active"
          ? { modelId: affect.trend ? "OU-GT" : "OU-G0", n: affect.nObs }
          : llmEvidence,
    },
    {
      key: "claridad",
      ...measuredAxis("claridad", {
        value: claridadRaw,
        confidence: confClaridad * llmConfidenceScale,
        sources: emotionalMapV2
          ? CHECKIN_PENDING_SOURCE
          : "Con qué frecuencia nombras y etiquetas lo que sientes (diario y voz)",
      }),
    },
    {
      key: "conexion",
      value: conexionRaw,
      confidence: confConexion,
      sources: emotionalMapV2
        ? resonanceConcepts > 0
          ? "Las resonancias que confirmaste sobre tus lecturas"
          : "Se llenará con las resonancias que confirmes sobre lo que lees"
        : "Tu lectura y tus conversaciones con Eco",
      measured: emotionalMapV2 && resonanceConcepts > 0,
      evidence: emotionalMapV2
        ? { modelId: "ARC-C1", n: resonanceConcepts }
        : {
            modelId: "H1",
            n: readingSessions.length + ecoMessages.length,
          },
    },
    {
      key: "proposito",
      value: propositoRaw,
      confidence: confProposito,
      sources: emotionalMapV2
        ? importantConcepts > 0
          ? "Los temas que marcaste como importantes para ti"
          : "Se llenará con los temas que marques como importantes para ti"
        : "Tu avance en las lecturas que empiezas",
      measured: emotionalMapV2 && importantConcepts > 0,
      evidence: emotionalMapV2
        ? { modelId: "ARC-P1", n: importantConcepts }
        : { modelId: "H1", n: readingSessions.length },
    },
    {
      key: "compasion",
      ...measuredAxis("compasion", {
        value: compasionRaw,
        confidence: confCompasion * llmConfidenceScale,
        sources: emotionalMapV2
          ? CHECKIN_PENDING_SOURCE
          : "Seguir presente en los momentos difíciles (escribir o conversar)",
      }),
    },
    {
      key: "consciencia",
      ...measuredAxis("consciencia", {
        value: conscienciaRaw,
        confidence: confConsciencia * llmConfidenceScale,
        sources: emotionalMapV2
          ? CHECKIN_PENDING_SOURCE
          : "La regularidad con que te observas (días activos en diario y Eco)",
      }),
    },
  ];

  const dimensions: EmotionalMapDimension[] = raw.map((d) => ({
    key: d.key,
    value: d.confidence >= CONFIDENCE_FLOOR ? round2(d.value) : 0,
    confidence: round2(d.confidence),
    sources: d.sources,
    measured: d.measured && d.confidence >= CONFIDENCE_FLOOR,
    // Evidence only when the axis is actually shown — a gathering axis has
    // no number to justify.
    evidence: d.confidence >= CONFIDENCE_FLOOR ? d.evidence : null,
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

  // ── Fase F — V2-only sections ────────────────────────────────────────────
  // "Mi momento": the latest self-reported mood observation. "Patrones de
  // lenguaje": descriptive count of on-device-analyzed reflections (TXT-L1
  // stops scoring axes under V2). Both absent from legacy blobs.
  const latest = moodSeries.reduce<{ mood: string; createdAt: Date } | null>(
    (best, r) => (best === null || r.createdAt > best.createdAt ? r : best),
    null,
  );
  const momento = latest
    ? { mood: latest.mood, at: latest.createdAt.toISOString() }
    : null;
  const lenguaje = textFeatures.length > 0 ? { n: textFeatures.length } : null;

  // ── Fase F (decision L3) — optional Narrator over computed facts ────────
  // NAR-L1 turns numbers into copy; it never creates them. Any failure just
  // drops the narrative — the map itself is unaffected (apagable by design).
  let narrative: EmotionalMapResult["narrative"] = null;
  if (emotionalMapV2 && narratorEnabled && provider.narrate) {
    const facts: EmotionalMapNarratorFacts = {
      momento: momento ? { mood: momento.mood, atIso: momento.at } : null,
      entryCount: entries.length,
      activeDays: diaryDays,
      selfReport: dimensions
        .filter((d) => d.evidence?.modelId === "CHK-S1")
        .map((d) => ({ axis: d.key, value: d.value, n: d.evidence!.n })),
      dynamics: affect
        ? {
            status: affect.status,
            nObs: affect.nObs,
            baseline: affect.baseline,
            stability: affect.stability,
            trend: affect.trend ?? null,
          }
        : null,
      resonanceCount: resonanceConcepts,
      lenguajeN: lenguaje?.n ?? 0,
    };
    try {
      const told = await provider.narrate(facts);
      narrative = {
        headline: told.headline,
        body: told.body,
        modelId: "NAR-L1",
      };
    } catch (err) {
      logger?.warn?.(
        `EmotionalMap narrator failed; serving the map without narrative. ${(err as Error).message}`,
      );
    }
  }

  return {
    values,
    confidence,
    dimensions,
    pct,
    coverage,
    affectDynamics: affect,
    computedAt: new Date().toISOString(),
    provider: providerName,
    // Fase F — the V2 marker + sections travel only under the V2 contract so
    // cached legacy blobs (and the legacy UI) are untouched.
    ...(emotionalMapV2
      ? { v2: true as const, momento, lenguaje, narrative }
      : {}),
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
  /**
   * Fase F — observations required before the trend DIRECTION is exposed on
   * the wire (0 = legacy behavior, TREND_PUBLIC_MIN_OBS under V2). The
   * detrended fit itself always runs when a trend is significant.
   */
  trendMinObs = 0,
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
  const trend =
    trendFit.trending && nObs >= trendMinObs
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
