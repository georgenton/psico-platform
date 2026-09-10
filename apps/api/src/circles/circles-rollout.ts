/**
 * The server-owned rollout policy for Círculos (PR2 · ADR 0023 §2).
 *
 * Same shape as `guide-rollout.ts` — a PURE resolver over an env bag, a DI
 * token, a service holding a `Set`, and a guard — with one deliberate
 * difference in POLICY, which is worth stating because it looks like a
 * weakening and is the opposite.
 *
 * Guide THROWS at boot when its mode is missing on a deployed box, because
 * Guide is `on` by default outside deployment: an unset flag there would be
 * read as "everyone", so refusing to boot is the safe answer.
 *
 * Círculos is `off` by default EVERYWHERE. There is no reading of a missing or
 * malformed value that opens anything, so failing closed does not need a boot
 * failure — it needs the value to resolve to `off`:
 *
 *     missing  -> off
 *     invalid  -> off
 *     off      -> no operative endpoint is available
 *     pilot    -> the authenticated allowlist, exactly
 *     on       -> general availability (a later cut's decision, not this one's)
 *
 * So this resolver NEVER throws. A typo in `CIRCLES_ROLLOUT_MODE` cannot take
 * the API down, and it cannot turn Círculos on either; it lands on `off`, which
 * is where an unreadable configuration should land. `warnings` reports what was
 * rejected — value-free, so a composition root can log that something was
 * wrong without printing what it was.
 *
 * Nothing here reads `process.env`, logs, or places a value in an error.
 */

export type CirclesRolloutMode = "off" | "pilot" | "on";

export interface CirclesRolloutConfig {
  readonly mode: CirclesRolloutMode;
  readonly pilotUserIds: readonly string[];
  /**
   * Value-free reasons a supplied setting was discarded. Empty means the
   * configuration was read exactly as written.
   */
  readonly warnings: readonly CirclesRolloutWarning[];
}

/** Closed vocabulary — never carries the received mode, id or allowlist. */
export type CirclesRolloutWarning =
  | "CIRCLES_ROLLOUT_MODE_INVALID"
  | "CIRCLES_PILOT_ALLOWLIST_INVALID"
  | "CIRCLES_PILOT_ALLOWLIST_EMPTY";

/** DI token, so a spec can supply a config without touching the environment. */
export const CIRCLES_ROLLOUT_CONFIG = Symbol("CIRCLES_ROLLOUT_CONFIG");

const MODE_VALUES: readonly CirclesRolloutMode[] = ["off", "pilot", "on"];

/** Server-side user ids only: no email, no token, no whitespace, no separator. */
const USER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_PILOT_USERS = 500;

export interface CirclesRolloutEnv {
  CIRCLES_ROLLOUT_MODE?: string;
  CIRCLES_PILOT_USER_IDS?: string;
}

/**
 * The whole allowlist is accepted or the whole allowlist is discarded. Dropping
 * only the bad entries would silently change who is in a pilot, and a partially
 * applied allowlist is harder to reason about than an empty one.
 */
function parseAllowlist(raw: string | undefined): readonly string[] | null {
  if (raw === undefined) return [];
  const whole = raw.trim();
  if (whole === "") return [];
  const segments = whole.split(",").map((s) => s.trim());
  if (segments.some((s) => !USER_ID_RE.test(s))) return null;
  if (new Set(segments).size !== segments.length) return null;
  if (segments.length > MAX_PILOT_USERS) return null;
  return segments;
}

/** The one safe answer, reused so every failure path lands on the same value. */
function closed(
  warnings: readonly CirclesRolloutWarning[],
): CirclesRolloutConfig {
  return Object.freeze({ mode: "off", pilotUserIds: [], warnings });
}

/**
 * Resolve the rollout configuration. Total: every input produces a config, and
 * every input that is not an explicit, well-formed enablement produces `off`.
 */
export function resolveCirclesRolloutConfig(
  env: CirclesRolloutEnv,
): CirclesRolloutConfig {
  const raw = env.CIRCLES_ROLLOUT_MODE?.trim();

  if (!raw) return closed([]);
  if (!MODE_VALUES.includes(raw as CirclesRolloutMode)) {
    return closed(["CIRCLES_ROLLOUT_MODE_INVALID"]);
  }
  const mode = raw as CirclesRolloutMode;

  if (mode === "off") return closed([]);

  const pilotUserIds = parseAllowlist(env.CIRCLES_PILOT_USER_IDS);
  if (pilotUserIds === null) {
    // A pilot whose allowlist could not be read is not a smaller pilot.
    return closed(["CIRCLES_PILOT_ALLOWLIST_INVALID"]);
  }

  if (mode === "pilot" && pilotUserIds.length === 0) {
    return closed(["CIRCLES_PILOT_ALLOWLIST_EMPTY"]);
  }

  return Object.freeze({
    mode,
    pilotUserIds: Object.freeze([...pilotUserIds]),
    warnings: [],
  });
}
