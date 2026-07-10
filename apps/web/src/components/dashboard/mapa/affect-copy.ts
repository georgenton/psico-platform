import type { EmotionalMapAffectDynamics } from "@psico/types";

/**
 * affect-copy — translates the affect-dynamics model output (baseline /
 * recovery / stability in [0,1]) into DESCRIPTIVE Spanish.
 *
 * Fase B' (copy contract, docs/product/emotional-map-copy-contract.md): the
 * copy describes patterns in the records the user chose to log — it never
 * evaluates the person. No normative headlines, no recovery-speed claims, no
 * calm-as-stability wording, no certainty percentages. Level labels come from
 * evidenceBaseLabel(), not from a ratio dressed up as certainty.
 *
 * Buckets are presentation thresholds validated against the persona benchmark.
 * Keep in sync with apps/mobile/src/components/dashboard/mapa/affect-copy.ts.
 */

export type BaselineLevel = "high" | "medium" | "low";
export type RecoveryLevel = "fast" | "moderate" | "slow";
export type StabilityLevel = "steady" | "variable" | "volatile";

export function baselineLevel(v: number): BaselineLevel {
  if (v >= 0.6) return "high";
  if (v >= 0.42) return "medium";
  return "low";
}

export function recoveryLevel(v: number): RecoveryLevel {
  if (v >= 0.6) return "fast";
  if (v >= 0.35) return "moderate";
  return "slow";
}

export function stabilityLevel(v: number): StabilityLevel {
  if (v >= 0.75) return "steady";
  if (v >= 0.4) return "variable";
  return "volatile";
}

/**
 * Honest evidence label for the analysis footer — replaces the old certainty
 * percentage (an n/40 ratio read as certainty; the bootstrap's real coverage
 * is ≈78% per paper-1-results E3). Thresholds follow the V2 gates.
 */
export function evidenceBaseLabel(nObs: number): string {
  if (nObs < 20) return "base limitada";
  if (nObs < 100) return "base moderada";
  return "base más sólida";
}

export interface AffectPhrase {
  title: string;
  body: string;
}

export const BASELINE_COPY: Record<BaselineLevel, AffectPhrase> = {
  high: {
    title: "Nivel central en categorías agradables",
    body: "Tus registros recientes se concentran en categorías que marcaste como agradables.",
  },
  medium: {
    title: "Nivel central en categorías intermedias",
    body: "Tus registros se mueven alrededor de un punto intermedio.",
  },
  low: {
    title: "Nivel central en categorías menos agradables",
    body: "Tus registros recientes se concentran en categorías menos agradables. Registrar cómo te sientes ya es un paso.",
  },
};

export const RECOVERY_COPY: Record<RecoveryLevel, AffectPhrase> = {
  fast: {
    title: "Ritmo de retorno estimado: rápido",
    body: "Después de un cambio, tus registros tienden a volver pronto a tu nivel habitual (estimación).",
  },
  moderate: {
    title: "Ritmo de retorno estimado: gradual",
    body: "Después de un cambio, tus registros vuelven a tu nivel habitual en unos días (estimación).",
  },
  slow: {
    title: "Ritmo de retorno estimado: pausado",
    body: "Después de un cambio, tus registros toman su tiempo en volver a tu nivel habitual. Está bien darte ese espacio.",
  },
};

export const STABILITY_COPY: Record<StabilityLevel, AffectPhrase> = {
  steady: {
    title: "Variación baja alrededor de tu tendencia",
    body: "Tus registros cambian poco de un día a otro.",
  },
  variable: {
    title: "Variación moderada alrededor de tu tendencia",
    body: "Tus registros se mueven de un día a otro alrededor de tu tendencia.",
  },
  volatile: {
    title: "Variación alta alrededor de tu tendencia",
    body: "Tus registros se mueven bastante de un día a otro. Conocer qué los mueve puede ayudarte a leerlos.",
  },
};

/** One descriptive opening sentence — never an evaluation of the person. */
export function affectHeadline(
  baseline: BaselineLevel,
  trend?: "up" | "down" | null,
): string {
  // Etapa 4 — a detected direction is the strongest story: lead with it,
  // described neutrally (§23.5 of the copy contract).
  if (trend === "up") {
    return "Durante las últimas semanas, tus registros han tendido hacia categorías que marcaste como más agradables.";
  }
  if (trend === "down") {
    return "Durante las últimas semanas, tus registros han tendido hacia categorías que marcaste como menos agradables. Gracias por seguir registrando.";
  }
  if (baseline === "high") {
    return "Tus registros recientes se concentran en categorías agradables.";
  }
  if (baseline === "low") {
    return "Estos días tus registros se concentran en categorías menos agradables. Gracias por seguir registrando.";
  }
  return "Así se han movido tus registros últimamente.";
}

/**
 * Etapa 4 — short explainer shown when a direction was detected, so the user
 * understands the variability card measures the day-to-day around their path.
 */
export const TREND_NOTE: Record<"up" | "down", string> = {
  up: "El nivel reciente refleja dónde están tus registros ahora, no el promedio del período. La variación se mide alrededor de tu tendencia: subir no cuenta como inestabilidad.",
  down: "El nivel reciente refleja dónde están tus registros ahora, no el promedio del período. Bajar tampoco cuenta como inestabilidad — son cosas distintas.",
};

export interface AffectStoryRow {
  key: "baseline" | "recovery" | "stability";
  emoji: string;
  phrase: AffectPhrase | null;
  /** Small hybrid chip, e.g. "72%". Null when the axis is still gathering. */
  pct: number | null;
  /**
   * Etapa 3 — bootstrap 90% half-width in % points ("72% ±8"). Null when the
   * axis is gated or the bootstrap could not run.
   */
  margin: number | null;
  /** Records still needed before this axis unlocks (recovery gating). */
  missing: number | null;
}

export interface AffectStory {
  headline: string;
  rows: AffectStoryRow[];
  /** Etapa 4 — season direction. Non-null when a real trend was detected. */
  trend: "up" | "down" | null;
  /** Explainer for the trend (null when the mood is stationary). */
  trendNote: string | null;
}

/**
 * Build the full descriptive story from an ACTIVE affect-dynamics block.
 * Recovery is gated until ~100 records (theta identifiability, paper E1) —
 * its row degrades to a gathering note until then.
 */
export function buildAffectStory(
  data: EmotionalMapAffectDynamics,
): AffectStory {
  const base = baselineLevel(data.baseline ?? 0.5);
  const rec = data.recovery != null ? recoveryLevel(data.recovery) : null;
  const stab = stabilityLevel(data.stability ?? 0.5);
  const missing = Math.max(0, data.recoveryNeeded - data.nObs);
  const trend = data.trend ?? null;
  // Etapa 3 — half-widths (0–1) → % points; drop zero-margins as noise.
  const marginPct = (m: number | null | undefined): number | null =>
    m != null && m > 0.004 ? Math.round(m * 100) : null;

  return {
    headline: affectHeadline(base, trend),
    trend,
    trendNote: trend ? TREND_NOTE[trend] : null,
    rows: [
      {
        key: "baseline",
        emoji: "🙂",
        phrase: BASELINE_COPY[base],
        pct: data.baseline != null ? Math.round(data.baseline * 100) : null,
        margin: marginPct(data.margins?.baseline),
        missing: null,
      },
      {
        key: "recovery",
        emoji: "↩️",
        phrase: rec ? RECOVERY_COPY[rec] : null,
        pct: data.recovery != null ? Math.round(data.recovery * 100) : null,
        margin: marginPct(data.margins?.recovery),
        missing: rec ? null : missing,
      },
      {
        key: "stability",
        emoji: "〰️",
        phrase: STABILITY_COPY[stab],
        pct: data.stability != null ? Math.round(data.stability * 100) : null,
        margin: marginPct(data.margins?.stability),
        missing: null,
      },
    ],
  };
}
