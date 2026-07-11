/**
 * Model Registry — canonical, stable identifiers for every model that touches
 * the Emotional Map (Fase B, docs/architecture/emotional-map-v2.md).
 *
 * Why: docs and code drifted ("v0", "v1", "Etapa 4" name the same or different
 * things depending on the file). From here on, product copy, research docs and
 * code reference these IDs. This module is DATA — importing it changes no
 * behavior. The spec (model-registry.spec.ts) pins the declared gates to the
 * actual code constants so they cannot silently diverge again.
 *
 * Status meanings:
 *   LEGACY        — runs in production but violates the V2 contract; scheduled
 *                   for replacement, not for silent preservation.
 *   EXPERIMENTAL  — runs in production behind honest copy/gates; presentation
 *                   under review.
 *   RESEARCH_ONLY — must NOT drive public product experience.
 *   DESIGN        — specified in research docs, not implemented.
 */

export type ModelStatus =
  | "LEGACY"
  | "INTERNAL"
  | "EXPERIMENTAL"
  | "PUBLIC"
  | "RESEARCH_ONLY"
  | "DESIGN"
  | "DEPRECATED";

export interface ModelRegistryEntry {
  id: string;
  version: string;
  status: ModelStatus;
  description: string;
  inputs: string[];
  outputs: string[];
  assumptions: string[];
  minimumData: {
    observationCount?: number;
    calendarCoverage?: number;
    densityRequirements?: string;
  };
  uncertaintyMethod?: string;
  knownLimitations: string[];
  /** Copy the product MAY use when presenting this model's output. */
  productCopyAllowed: string[];
  /** Copy the product MUST NOT use (enforced by copy-contract.spec.ts). */
  productCopyForbidden: string[];
  featureFlag?: string;
  owner: string;
  reviewedAt: string;
}

export const MODEL_REGISTRY: readonly ModelRegistryEntry[] = [
  {
    id: "H1",
    version: "1.0",
    status: "LEGACY",
    description:
      "Heuristic + LLM axis scoring (calma/claridad/conexion/proposito/compasion/consciencia) with global pct. Mixes engagement counts with psychological constructs; the LLM emits numeric axis values.",
    inputs: [
      "DiaryEntry mood/tags/createdAt (30d)",
      "ReadingSession progress/time (30d)",
      "EcoMessage USER count (30d)",
      "VoiceTranscription count",
      "Highlight count",
      "Annotation count",
      "User.currentStreakDays",
    ],
    outputs: ["6 axis values [0,1]", "pct global", "coverage"],
    assumptions: [
      "engagement correlates with psychological constructs (UNVALIDATED)",
    ],
    minimumData: {},
    knownLimitations: [
      "Engagement is not psychology (V2 principle 5.1).",
      "LLM creates psychological scores (violates V2 principle 5.3).",
      "Global pct has no defensible interpretation (5.2).",
      "Never invoked under EMOTIONAL_MAP_V2 (Fase F, decision L3) — legacy only.",
    ],
    productCopyAllowed: [],
    productCopyForbidden: [
      "Comprensión emocional",
      "pct as psychological result",
    ],
    featureFlag: "EMOTIONAL_MAP_LLM_SCORING",
    owner: "emotional-map",
    reviewedAt: "2026-07-11",
  },
  {
    id: "OU-G0",
    version: "1.0",
    status: "EXPERIMENTAL",
    description:
      "Ordinal mood mapped to a centered scalar (great=1…hard=−1), Gaussian Ornstein–Uhlenbeck fit by exact-transition MLE (dynamics/ou.ts fitOu). Stationary model.",
    inputs: ["mood ordinal + timestamps (diary + MoodLog, 180d)"],
    outputs: [
      "mu (baseline)",
      "theta (return rate)",
      "sigma (diffusion)",
      "inertiaDays = 1/theta",
    ],
    assumptions: [
      "stationarity (no trend)",
      "Gaussian observation of an ordinal scale (approximation; measurement-noise floor 0.35 SD)",
    ],
    minimumData: { observationCount: 8 },
    uncertaintyMethod:
      "parametric bootstrap (90% CI; empirical coverage ≈78%, paper-1-results E3)",
    knownLimitations: [
      "theta essentially unidentified at n≈30 (RMSE 1.16 vs true 1.0); usable near n≈100 (paper-1-results E1)",
      "OU does not beat discrete AR(1) in one-step prediction (E4) — value is interpretability + irregular Δt, not predictive superiority",
    ],
    productCopyAllowed: [
      "Nivel central estimado de tus registros",
      "Variación alrededor de tu tendencia",
      "Estimación experimental",
      "Basado en N registros entre fecha A y fecha B",
    ],
    productCopyForbidden: [
      "Calma (as stability)",
      "Te recuperas rápido",
      "Confianza 100%",
      "Tu ánimo de base es bueno",
    ],
    featureFlag: "EMOTIONAL_MAP_OU",
    owner: "emotional-map",
    reviewedAt: "2026-07-11",
  },
  {
    id: "OU-GT",
    version: "1.0",
    status: "EXPERIMENTAL",
    description:
      "Linear trend (OLS, |t|≥2 and ≥1 ordinal level of total movement) + zero-mean OU on detrended residuals (dynamics/ou.ts fitOuWithTrend). Fixes 'improving reads as unstable'.",
    inputs: ["same as OU-G0"],
    outputs: [
      "trend direction",
      "level-now (a+b·t_last)",
      "detrended OU params",
    ],
    assumptions: ["trend is locally linear across the window"],
    minimumData: { observationCount: 8 },
    uncertaintyMethod:
      "bootstrap on the fit series; OLS prediction SE for level-now",
    knownLimitations: ["same theta identifiability limits as OU-G0"],
    productCopyAllowed: ["Tendencia reciente (descriptive, non-normative)"],
    productCopyForbidden: ["Vas en buena dirección", "vas mal"],
    featureFlag: "EMOTIONAL_MAP_OU",
    owner: "emotional-map",
    reviewedAt: "2026-07-11",
  },
  {
    id: "OU-O1",
    version: "0.0",
    status: "DESIGN",
    description:
      "Latent OU with ordinal probit/logit observation model and estimated thresholds — the principled replacement for the measurement-noise floor. Specified in research docs (Etapa R); not implemented.",
    inputs: ["mood ordinal + timestamps"],
    outputs: ["latent-state params with proper ordinal likelihood"],
    assumptions: [
      "latent continuous affect observed through ordinal thresholds",
    ],
    minimumData: { observationCount: 100 },
    knownLimitations: ["unimplemented; do not reference in product"],
    productCopyAllowed: [],
    productCopyForbidden: ["any product copy"],
    owner: "research",
    reviewedAt: "2026-07-11",
  },
  {
    id: "EWS-R1",
    version: "1.0",
    status: "RESEARCH_ONLY",
    description:
      "Early-warning signal via critical slowing down: rolling AC1 + variance on the detrended series, Kendall τ≥0.65 on both (dynamics/ews.ts). Calibrated at FP 6.0% / sensitivity 40% (paper-1-results E5/E5b).",
    inputs: ["detrended mood series"],
    outputs: ["status steady|rising|insufficient", "tauAc", "tauVar"],
    assumptions: [
      "critical slowing down precedes transitions (van de Leemput 2014)",
    ],
    minimumData: { observationCount: 60 },
    knownLimitations: [
      "sensitivity 40% — misses most true transitions; must not drive public UX, nudges, notifications, or crisis flow",
      "withheld from the public wire since Fase B' (EMOTIONAL_MAP_EWS_PUBLIC default off); the detector keeps running internally for research/benchmark",
    ],
    productCopyAllowed: [],
    productCopyForbidden: [
      "Señal temprana",
      "resiliencia",
      "riesgo",
      "crisis detectada",
    ],
    featureFlag: "EMOTIONAL_MAP_EWS_PUBLIC",
    owner: "research",
    reviewedAt: "2026-07-11",
  },
  {
    id: "TXT-L1",
    version: "1.0",
    status: "EXPERIMENTAL",
    description:
      "On-device Spanish lexicon analyzer (analyzeReflectionText in @psico/types): 10 density features computed from decrypted text on the client; only numbers reach the server (DiaryTextFeature).",
    inputs: ["decrypted reflection text (device only)"],
    outputs: ["10 densities + wordCount (server-side numbers)"],
    assumptions: [
      "lexicon hit-rates approximate psychological language patterns (Pennebaker/Al-Mosaiwi-inspired, UNVALIDATED for traits)",
    ],
    minimumData: { observationCount: 8 },
    knownLimitations: [
      "explicit opt-in since Fase D (PrivacySettings.localTextAnalysis, default off; opt-out deletes derived rows)",
      "scores claridad/consciencia/compasion axes ONLY under legacy; under EMOTIONAL_MAP_V2 it is descriptive-only ('Patrones de lenguaje', Fase F) — never traits",
      "derived numbers are sensitive data; deletion cascade added in Fase B",
      "prompt-induced language (seeded composers, exercises) is not marked (measurement contamination)",
    ],
    productCopyAllowed: ["Patrón de lenguaje local (descriptive)"],
    productCopyForbidden: ["Tu claridad emocional es alta", "trait claims"],
    owner: "emotional-map",
    reviewedAt: "2026-07-11",
  },
  {
    id: "CHK-S1",
    version: "1.0",
    status: "EXPERIMENTAL",
    description:
      "6-item short self-report check-in (CHECKIN_ITEMS), items ADAPTED from TMMS-24 / SCS-SF / MAAS — inspiration, not the validated instruments. value=mean(score)/4, confidence saturates at 5 answers.",
    inputs: ["CheckinResponse itemKey + score 0–4"],
    outputs: ["per-axis self-report value + answer count"],
    assumptions: [
      "single adapted items track their construct (UNVALIDATED as a scale)",
    ],
    minimumData: { observationCount: 1 },
    knownLimitations: [
      "not a validated clinical instrument; label as 'Autoinformado', never 'Medido'",
    ],
    productCopyAllowed: [
      "Autoinformado",
      "Basado en tus respuestas",
      "N respuestas",
    ],
    productCopyForbidden: ["Medido (implies psychometric validity)"],
    owner: "emotional-map",
    reviewedAt: "2026-07-11",
  },
  {
    id: "ARC-C1",
    version: "1.0",
    status: "EXPERIMENTAL",
    description:
      "Confirmed resonances (Fase E, ARC cycle): the user explicitly confirms a chapter concept resonated. conexion value = distinct confirmed concepts / 4 (saturating); confidence saturates at 2. Only feeds axes under EMOTIONAL_MAP_V2.",
    inputs: ["Resonance conceptKey + confirmedAt (explicit user taps)"],
    outputs: ["conexion value + confirmed-concept count"],
    assumptions: [
      "an explicit confirmation is a valid self-report of content resonance",
    ],
    minimumData: { observationCount: 1 },
    knownLimitations: [
      "count-based v1 — no semantics between concepts; self-report, not a psychometric measure",
    ],
    productCopyAllowed: [
      "Confirmado por ti",
      "Las resonancias que confirmaste",
      "N temas confirmados",
    ],
    productCopyForbidden: ["Medido (implies psychometric validity)"],
    owner: "emotional-map",
    reviewedAt: "2026-07-11",
  },
  {
    id: "ARC-P1",
    version: "1.0",
    status: "EXPERIMENTAL",
    description:
      "Important themes (Fase H): the user flags a confirmed resonance as important to them right now (Eco proposes in the reader, the user confirms). proposito value = distinct important themes / 3 (saturating); confidence saturates at 1. Only feeds axes under EMOTIONAL_MAP_V2.",
    inputs: ["Resonance.important toggle (explicit user taps)"],
    outputs: ["proposito value + important-theme count"],
    assumptions: [
      "an explicitly flagged important theme is a valid self-report of what matters to the user now",
    ],
    minimumData: { observationCount: 1 },
    knownLimitations: [
      "count-based v1 — no semantics between themes; self-report, not a psychometric measure",
    ],
    productCopyAllowed: [
      "Los temas que marcaste como importantes para ti",
      "N temas importantes",
    ],
    productCopyForbidden: ["Medido (implies psychometric validity)"],
    owner: "emotional-map",
    reviewedAt: "2026-07-12",
  },
  {
    id: "NAR-L1",
    version: "1.0",
    status: "EXPERIMENTAL",
    description:
      "Narrator (Fase F, decision L3): an LLM turns the ALREADY-COMPUTED facts (momento, self-report values, dynamics params, resonance count) into a short narrative. It cannot create or alter numbers; switching it off changes no data (facts/narrator separation, V2 principle 3). Only runs under EMOTIONAL_MAP_V2.",
    inputs: [
      "computed facts only: latest mood token, entry/active-day counts, CHK-S1 values+n, OU params, resonance count, lenguaje n",
    ],
    outputs: ["headline + body (copy only, no scores)"],
    assumptions: [
      "an LLM constrained to given facts produces faithful descriptive copy (prompt-enforced, spot-checked)",
    ],
    minimumData: {},
    knownLimitations: [
      "copy generation only — on any failure the map renders without narrative",
      "faithfulness to facts is prompt-enforced, not formally verified",
    ],
    productCopyAllowed: [
      "Una lectura en palabras de tus datos",
      "experimental",
      "no cambia tus datos",
    ],
    productCopyForbidden: ["numeric scores", "diagnóstico", "consejo clínico"],
    featureFlag: "EMOTIONAL_MAP_NARRATOR",
    owner: "emotional-map",
    reviewedAt: "2026-07-11",
  },
] as const;

export function getModel(id: string): ModelRegistryEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}
