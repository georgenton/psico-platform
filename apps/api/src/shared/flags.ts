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
  /**
   * Master switch for the V2 map response (facts/evidence shape).
   * Default ON since Fase G (2026-07-11): the V2 contract IS the product —
   * engagement never feeds axes, the LLM never scores, conexion comes from
   * confirmed resonances. Setting the env to "off" is the data-level
   * rollback lever (legacy scoring path is kept alive for that).
   */
  EMOTIONAL_MAP_V2: {
    env: "EMOTIONAL_MAP_V2",
    default: true,
    description: "Serve the V2 emotional-map contract (facts + provenance).",
  },
  /**
   * Keep the legacy radar/pct UI while V2 rolls out. Default OFF since
   * Fase G: the legacy layout was DELETED from the clients — turning this
   * on only strips the `v2` marker (clients still render the V2 layout,
   * tolerantly, over whatever data arrives).
   */
  EMOTIONAL_MAP_LEGACY_UI: {
    env: "EMOTIONAL_MAP_LEGACY_UI",
    default: false,
    description:
      "Strip the v2 marker (legacy dual-run window; UI deleted in Fase G).",
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
   * sensitivity 40% (paper-1-results.md E5) — research-only. Default OFF since
   * Fase B' (decision L1, 2026-07-11): the detector keeps running internally
   * (benchmark/research), but nothing reaches the public wire.
   */
  EMOTIONAL_MAP_EWS_PUBLIC: {
    env: "EMOTIONAL_MAP_EWS_PUBLIC",
    default: false,
    description: "Include the early-warning-signal block in the public wire.",
  },
  /**
   * Narrator (Fase F, decision L3). When on AND the V2 contract is active,
   * an LLM turns the ALREADY-COMPUTED facts into a short narrative (copy
   * only). It can never create or alter numbers — switching it off changes
   * no data (facts/narrator separation, V2 principle 3). Default off.
   */
  EMOTIONAL_MAP_NARRATOR: {
    env: "EMOTIONAL_MAP_NARRATOR",
    default: false,
    description:
      "Generate the optional V2 narrative (NAR-L1, copy only) over computed facts.",
  },
  /**
   * ARC resonance cycle (Fase E). Default ON since Fase E shipped: the whole
   * feature is explicit-consent by design (every resonance is a user tap and
   * can be deleted), so there is no silent-data risk in enabling it. Gates
   * whether the map service reads confirmed resonances.
   */
  CONTENT_RESONANCE: {
    env: "CONTENT_RESONANCE",
    default: true,
    description: "Enable the resonance (ARC) cycle feeding the map.",
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
