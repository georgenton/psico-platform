import type { EmotionalMapAffectDynamics } from "@psico/types";

/**
 * affect-copy (mobile) — same DESCRIPTIVE translation layer as the web helper.
 * Fase B' copy contract: describes patterns in the records, never evaluates
 * the person. Keep in sync with
 * apps/web/src/components/dashboard/mapa/affect-copy.ts.
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
 * percentage (an n/40 ratio read as certainty; real CI coverage ≈78%, E3).
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

/** Etapa 4 — explainer shown when a direction was detected. */
export const TREND_NOTE: Record<"up" | "down", string> = {
  up: "El nivel reciente refleja dónde están tus registros ahora, no el promedio del período. La variación se mide alrededor de tu tendencia: subir no cuenta como inestabilidad.",
  down: "El nivel reciente refleja dónde están tus registros ahora, no el promedio del período. Bajar tampoco cuenta como inestabilidad — son cosas distintas.",
};

export interface AffectStoryRow {
  key: "baseline" | "recovery" | "stability";
  /** Ionicons name for the row bullet. */
  icon: string;
  phrase: AffectPhrase | null;
  /** Small hybrid chip, e.g. 72. Null when the axis is still gathering. */
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
 * Recovery is gated until ~100 records (theta identifiability, paper E1).
 */
export function buildAffectStory(
  data: EmotionalMapAffectDynamics,
): AffectStory {
  const base = baselineLevel(data.baseline ?? 0.5);
  const rec = data.recovery != null ? recoveryLevel(data.recovery) : null;
  const stab = stabilityLevel(data.stability ?? 0.5);
  const missing = Math.max(0, data.recoveryNeeded - data.nObs);
  const trend = data.trend ?? null;
  const marginPct = (m: number | null | undefined): number | null =>
    m != null && m > 0.004 ? Math.round(m * 100) : null;

  return {
    headline: affectHeadline(base, trend),
    trend,
    trendNote: trend ? TREND_NOTE[trend] : null,
    rows: [
      {
        key: "baseline",
        icon: "happy-outline",
        phrase: BASELINE_COPY[base],
        pct: data.baseline != null ? Math.round(data.baseline * 100) : null,
        margin: marginPct(data.margins?.baseline),
        missing: null,
      },
      {
        key: "recovery",
        icon: "arrow-undo-outline",
        phrase: rec ? RECOVERY_COPY[rec] : null,
        pct: data.recovery != null ? Math.round(data.recovery * 100) : null,
        margin: marginPct(data.margins?.recovery),
        missing: rec ? null : missing,
      },
      {
        key: "stability",
        icon: "pulse-outline",
        phrase: STABILITY_COPY[stab],
        pct: data.stability != null ? Math.round(data.stability * 100) : null,
        margin: marginPct(data.margins?.stability),
        missing: null,
      },
    ],
  };
}

/** Inertia (days) → a human duration: "unas horas", "un día", "3 días". */
export function formatInertia(days: number): string {
  if (days < 0.75) return "unas horas";
  if (days < 1.5) return "un día";
  return `${Math.round(days)} días`;
}
