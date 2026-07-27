/**
 * CC-7.R1 — the server-owned pilot rollout policy for Guide V1.
 *
 * ONE decision, resolved once from configuration, with three modes and nothing
 * else: `off` (nobody), `pilot` (exactly the allowlisted user ids) and `on`
 * (any authenticated actor). No percentage, no first-match, no client-supplied
 * cohort, no email lookup, no plan fallback — and no browser storage of the
 * cohort. Entitlement (FREE/PRO) stays the lifecycle's and ContentAccess's job;
 * being in the pilot never grants restricted content.
 *
 * This module is a PURE resolver over an env bag plus a deployed flag — no
 * `process.env` read, no logging, no ids ever placed in an error. The neutral
 * `resolveEnvironment` / `isDeployedEnvironment` (see `../shared/psico-environment`)
 * decides the deployed flag at the composition root, not here, so the policy
 * stays trivially testable.
 */

export type GuideRolloutMode = "off" | "pilot" | "on";

export interface GuideRolloutConfig {
  mode: GuideRolloutMode;
  pilotUserIds: readonly string[];
}

/** DI token so E2E specs can override the resolved config without touching env. */
export const GUIDE_ROLLOUT_CONFIG = Symbol("GUIDE_ROLLOUT_CONFIG");

/** The four value-free config error codes (never carry a received value). */
export type GuideRolloutConfigErrorCode =
  | "GUIDE_ROLLOUT_MODE_REQUIRED"
  | "GUIDE_ROLLOUT_MODE_INVALID"
  | "GUIDE_PILOT_ALLOWLIST_REQUIRED"
  | "GUIDE_PILOT_ALLOWLIST_INVALID";

/**
 * A boot-time configuration failure. The message is EXACTLY the code — never
 * the received mode, never the allowlist, never any id — so nothing sensitive
 * can leak through logs or an error dump.
 */
export class GuideRolloutConfigError extends Error {
  constructor(readonly code: GuideRolloutConfigErrorCode) {
    super(code);
    this.name = "GuideRolloutConfigError";
  }
}

const MODE_VALUES: readonly GuideRolloutMode[] = ["off", "pilot", "on"];

/** Server-side user ids only: no email, no token, no whitespace, no separators. */
const USER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_PILOT_USERS = 500;

/** The env bag this resolver reads. Kept explicit so it is pure and testable. */
export interface GuideRolloutEnv {
  GUIDE_ROLLOUT_MODE?: string;
  GUIDE_PILOT_USER_IDS?: string;
}

/**
 * Parse the CSV allowlist. `trim` only around each element; a single empty
 * segment, an internal space, an email, a duplicate or overflowing the cap is a
 * configuration error — never silently normalised away.
 */
function parseAllowlist(raw: string | undefined): readonly string[] {
  if (raw === undefined) return [];
  const whole = raw.trim();
  if (whole === "") return [];
  const segments = whole.split(",").map((s) => s.trim());
  if (segments.some((s) => s.length === 0)) {
    throw new GuideRolloutConfigError("GUIDE_PILOT_ALLOWLIST_INVALID");
  }
  if (segments.some((s) => !USER_ID_RE.test(s))) {
    throw new GuideRolloutConfigError("GUIDE_PILOT_ALLOWLIST_INVALID");
  }
  if (new Set(segments).size !== segments.length) {
    throw new GuideRolloutConfigError("GUIDE_PILOT_ALLOWLIST_INVALID");
  }
  if (segments.length > MAX_PILOT_USERS) {
    throw new GuideRolloutConfigError("GUIDE_PILOT_ALLOWLIST_INVALID");
  }
  return segments;
}

/**
 * Resolve the rollout config, fail-closed on a deployed box.
 *
 *   - deployed + no mode → boot failure (an unset flag must never be read as
 *     "on"; the whole point is that a deployed surface states its posture);
 *   - deployed + `pilot` requires a non-empty allowlist;
 *   - NOT deployed + no mode → `on` (preserves the current dev/test default so
 *     every existing Guide fixture keeps working without an env shuffle);
 *   - an explicit but invalid mode fails EVERYWHERE, deployed or not.
 */
export function resolveGuideRolloutConfig(
  env: GuideRolloutEnv,
  deployed: boolean,
): GuideRolloutConfig {
  const raw = env.GUIDE_ROLLOUT_MODE?.trim();

  if (!raw) {
    if (deployed) {
      throw new GuideRolloutConfigError("GUIDE_ROLLOUT_MODE_REQUIRED");
    }
    // Local / test default — the surface is on until an env explicitly gates it.
    return { mode: "on", pilotUserIds: [] };
  }

  if (!MODE_VALUES.includes(raw as GuideRolloutMode)) {
    throw new GuideRolloutConfigError("GUIDE_ROLLOUT_MODE_INVALID");
  }
  const mode = raw as GuideRolloutMode;

  const pilotUserIds = parseAllowlist(env.GUIDE_PILOT_USER_IDS);
  if (mode === "pilot" && pilotUserIds.length === 0) {
    throw new GuideRolloutConfigError("GUIDE_PILOT_ALLOWLIST_REQUIRED");
  }

  return { mode, pilotUserIds };
}
