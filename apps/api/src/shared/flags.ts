/**
 * Minimal env-based feature flags — Fase B of the Emotional Map V2 program
 * (docs/architecture/emotional-map-v2.md).
 *
 * Design constraints:
 *   - No new dependency, no DB, no Redis: a flag is an env var read at call
 *     time (so tests can toggle via process.env without rebooting Nest).
 *   - Every flag declares its DEFAULT so that an unset env preserves today's
 *     behavior. Flipping a default is a deliberate, reviewable diff.
 *   - "off" | "false" | "0" disable; "on" | "true" | "1" enable; anything
 *     else falls back to the declared default.
 *
 * The legacy `EMOTIONAL_MAP_OU` kill-switch (checked as `!== "off"`) is folded
 * into this helper with identical semantics for current deploys.
 */

export interface FlagDef {
  /** Environment variable name. */
  env: string;
  /** Value when the env var is unset/unrecognized. MUST preserve current behavior. */
  default: boolean;
  /** One-line intent, for the registry doc. */
  description: string;
}

export const FLAGS = {
  /** Master switch for the V2 map response (facts/evidence shape). */
  EMOTIONAL_MAP_V2: {
    env: "EMOTIONAL_MAP_V2",
    default: false,
    description: "Serve the V2 emotional-map contract (facts + provenance).",
  },
  /** Keep the legacy radar/pct UI while V2 rolls out. */
  EMOTIONAL_MAP_LEGACY_UI: {
    env: "EMOTIONAL_MAP_LEGACY_UI",
    default: true,
    description: "Render the legacy map UI (radar + pct) on the clients.",
  },
  /** Tier-2 OU affect dynamics (legacy kill-switch, was `EMOTIONAL_MAP_OU`). */
  EMOTIONAL_MAP_OU: {
    env: "EMOTIONAL_MAP_OU",
    default: true,
    description: "Fit the OU affect-dynamics block (OU-G0/OU-GT).",
  },
  /** LLM-scored interpretive axes (H1 fallback). V2 forbids LLM scoring. */
  EMOTIONAL_MAP_LLM_SCORING: {
    env: "EMOTIONAL_MAP_LLM_SCORING",
    default: true,
    description:
      "Allow the LLM provider to produce numeric axis scores (legacy H1).",
  },
  /**
   * Serialize the EWS block (EWS-R1) to public clients. Research shows FP 6% /
   * sensitivity 40% (paper-1-results.md E5) — target state is OFF (research
   * only). Default preserves current behavior until product sign-off.
   */
  EMOTIONAL_MAP_EWS_PUBLIC: {
    env: "EMOTIONAL_MAP_EWS_PUBLIC",
    default: true,
    description: "Include the early-warning-signal block in the public wire.",
  },
  /** ARC resonance cycle (Fase E). */
  CONTENT_RESONANCE: {
    env: "CONTENT_RESONANCE",
    default: false,
    description: "Enable the resonance (ARC) endpoints and UI hooks.",
  },
} as const satisfies Record<string, FlagDef>;

export type FlagName = keyof typeof FLAGS;

/** Read a flag from the environment, falling back to its declared default. */
export function flagEnabled(name: FlagName): boolean {
  const def = FLAGS[name];
  const raw = process.env[def.env]?.trim().toLowerCase();
  if (raw === "on" || raw === "true" || raw === "1") return true;
  if (raw === "off" || raw === "false" || raw === "0") return false;
  return def.default;
}
