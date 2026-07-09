import type { EmotionalMapAffectDynamics } from "@psico/types";

/**
 * affect-copy (mobile) — same translation layer as the web helper: turns the
 * affect-dynamics model output into warm, human Spanish. Buckets are
 * presentation thresholds validated against the persona benchmark. Keep in
 * sync with apps/web/src/components/dashboard/mapa/affect-copy.ts.
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

export interface AffectPhrase {
  title: string;
  body: string;
}

export const BASELINE_COPY: Record<BaselineLevel, AffectPhrase> = {
  high: {
    title: "Tu ánimo de base es bueno",
    body: "La mayoría de los días estás en un punto positivo.",
  },
  medium: {
    title: "Tu ánimo de base es equilibrado",
    body: "Te mueves alrededor de un punto medio, sin extremos.",
  },
  low: {
    title: "Tu base está más abajo estos días",
    body: "Tu punto de retorno anda bajo últimamente. Sé amable contigo — registrar cómo te sientes ya es un paso.",
  },
};

export const RECOVERY_COPY: Record<RecoveryLevel, AffectPhrase> = {
  fast: {
    title: "Te recuperas rápido",
    body: "Cuando tienes un mal día, no se te queda pegado — vuelves pronto a tu base.",
  },
  moderate: {
    title: "Te recuperas a tu ritmo",
    body: "Después de un bajón, tu ánimo vuelve a su base en unos días.",
  },
  slow: {
    title: "Tus emociones toman su tiempo",
    body: "Cuando algo te mueve, tu ánimo tarda en volver a su base. Está bien darte ese espacio.",
  },
};

export const STABILITY_COPY: Record<StabilityLevel, AffectPhrase> = {
  steady: {
    title: "Tu ánimo es muy parejo",
    body: "Se mantiene estable de un día a otro, casi sin sobresaltos.",
  },
  variable: {
    title: "Tienes altibajos normales",
    body: "Tu ánimo se mueve de un día a otro, pero dentro de un rango sano.",
  },
  volatile: {
    title: "Tu ánimo cambia con fuerza",
    body: "Pasas de días muy arriba a días muy abajo. Conocer qué lo mueve es el primer paso.",
  },
};

/** One warm opening sentence composed from the strongest signals. */
export function affectHeadline(
  baseline: BaselineLevel,
  recovery: RecoveryLevel | null,
  trend?: "up" | "down" | null,
): string {
  // Etapa 4 — a detected direction is the strongest story: lead with it.
  if (trend === "up") {
    return "Vas en buena dirección: tu ánimo viene subiendo estas semanas.";
  }
  if (trend === "down") {
    return "Estas semanas tu ánimo viene bajando un poco. Gracias por seguir registrándolo — notarlo ya es cuidarte.";
  }
  if (baseline === "high" && recovery === "fast") {
    return "Sueles estar en un buen lugar, y cuando bajas, te recuperas rápido.";
  }
  if (baseline === "high") return "Sueles estar en un buen lugar.";
  if (baseline === "low" && recovery === "slow") {
    return "Estos días cuesta un poco más — y está bien ir a tu ritmo.";
  }
  if (baseline === "low") {
    return "Estos días tu ánimo anda más abajo. Gracias por seguir registrándolo.";
  }
  if (recovery === "fast") return "Cuando tu ánimo baja, se recupera rápido.";
  return "Así se está moviendo tu ánimo últimamente.";
}

/**
 * Etapa 4 — short explainer shown when a direction was detected, so the user
 * understands the stability card measures the day-to-day around their path.
 */
export const TREND_NOTE: Record<"up" | "down", string> = {
  up: "Tu tono de hoy refleja dónde estás ahora, no el promedio del mes. Y la estabilidad se mide sobre tu camino: subir no cuenta como inestabilidad.",
  down: "Tu tono de hoy refleja dónde estás ahora, no el promedio del mes. Bajar tampoco cuenta como inestabilidad — son cosas distintas.",
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

/** Build the full human story from an ACTIVE affect-dynamics block. */
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
    headline: affectHeadline(base, rec, trend),
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
