import {
  MOOD_CANONICAL_IDS,
  MOOD_NORMALIZER_VERSION,
  type MoodCanonical,
  type MoodExclusionReason,
  type MoodNormalization,
  type MoodProvenance,
} from "@psico/types";

/**
 * PR-2A · pure server-side mood normalization.
 *
 * Two functions, zero side effects, zero framework deps:
 *   - `parseCanonicalMood` — a strict parser: a raw token → its canonical
 *     CATEGORY, or `null`. It NEVER returns a number and NEVER falls back to a
 *     neutral value. (`?? 0` is exactly the landmine PR-2 exists to remove.)
 *   - `deriveMoodNormalization` — computes the eight server-owned columns from
 *     the raw token + the endpoint-derived `source`/`explicitlySelected`.
 *
 * Contract (docs/architecture/emotional-map-mood-normalization.md):
 *   INV-1  eligible ⇒ moodNormalized != null ∧ moodExplicitlySelected = true
 *          ∧ moodExclusionReason = null.
 *   The client controls provenance/eligible/source for NONE of this — the
 *   caller (a controller/service) passes only what the ENDPOINT establishes.
 */

const CANONICAL = new Set<string>(MOOD_CANONICAL_IDS);

/**
 * Legacy onboarding vocabulary (Sprint B6b deactivated these ids). Kept as a
 * detection set so historical/legacy tokens classify as `onboarding-legacy`
 * rather than `unknown` — but either way they are NOT canonical, so they never
 * become eligible and never map to a number.
 */
const LEGACY_TOKENS = new Set<string>([
  "calma",
  "foco",
  "energia",
  "reflexion",
  "alegria",
  "ansiedad",
  "tristeza",
]);

const VOCAB_DIARY = "diary-v1";
const VOCAB_LEGACY = "onboarding-legacy";
const VOCAB_UNKNOWN = "unknown";

/**
 * Strict parse of a raw mood token into its canonical category, or `null`.
 * No coercion, no numeric fallback, no `?? 0`. Unknown / legacy / null → `null`.
 */
export function parseCanonicalMood(
  raw: string | null | undefined,
): MoodCanonical | null {
  if (typeof raw !== "string") return null;
  const token = raw.trim();
  return CANONICAL.has(token) ? (token as MoodCanonical) : null;
}

/** Which input vocabulary the RAW token belongs to (null when there is no token). */
function classifyVocabulary(raw: string | null): string | null {
  if (raw == null) return null;
  if (CANONICAL.has(raw)) return VOCAB_DIARY;
  if (LEGACY_TOKENS.has(raw)) return VOCAB_LEGACY;
  return VOCAB_UNKNOWN;
}

export interface DeriveMoodInput {
  /** The raw mood token exactly as it will be persisted (or null/absent). */
  raw: string | null | undefined;
  /** The provenance, derived by the SERVER from the write endpoint. */
  source: MoodProvenance;
  /**
   * Whether the user actively picked this mood, established by the endpoint —
   * NOT by the client. A check-in is inherently explicit; a reflexion write in
   * PR-2A carries no explicit-selection signal, so callers pass `false`.
   */
  explicitlySelected: boolean;
  /** The client build that wrote it, when known. Audit only; null otherwise. */
  clientVersion?: string | null;
}

/**
 * Compute the eight normalization columns. Eligibility is fail-closed: a row is
 * eligible ONLY when it resolves to a canonical category AND was explicitly
 * selected. Everything else is preserved raw but excluded, with a machine
 * reason — and the canonical value (or `null`), never a fabricated `0`.
 */
export function deriveMoodNormalization(
  input: DeriveMoodInput,
): MoodNormalization {
  const rawToken = typeof input.raw === "string" ? input.raw.trim() : null;
  const moodNormalized = parseCanonicalMood(rawToken);
  const moodVocabularyVersion = classifyVocabulary(rawToken);
  const clientVersion = input.clientVersion ?? null;

  let moodEligibleForDynamics = false;
  let moodExclusionReason: MoodExclusionReason | null = null;

  if (rawToken == null || rawToken.length === 0) {
    // No mood picked at all.
    moodExclusionReason = "not_selected";
  } else if (moodNormalized == null) {
    // A token we cannot place on the ordinal scale — kept raw, never neutralized.
    moodExclusionReason =
      moodVocabularyVersion === VOCAB_LEGACY
        ? "legacy_vocabulary"
        : "unknown_token";
  } else if (!input.explicitlySelected) {
    // Canonical, but the endpoint could not prove the user actively chose it.
    // The old composer default is "ok"; anything else is a canonical value we
    // simply cannot vouch was an explicit pick without a selection signal.
    moodExclusionReason =
      rawToken === "ok" ? "ambiguous_default" : "pre_normalizer_review";
  } else {
    // Canonical AND explicitly selected → the only eligible shape.
    moodEligibleForDynamics = true;
    moodExclusionReason = null;
  }

  return {
    moodNormalized,
    moodProvenance: input.source,
    moodExplicitlySelected: input.explicitlySelected,
    moodVocabularyVersion,
    moodNormalizerVersion: MOOD_NORMALIZER_VERSION,
    moodClientVersion: clientVersion,
    moodEligibleForDynamics,
    moodExclusionReason,
  };
}
