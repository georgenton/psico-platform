import { createHash } from "node:crypto";

import { type FlagName, flagEnabled } from "../shared/flags";

/**
 * PR-0.1 — shared cache identity for the emotional map.
 *
 * The bug this closes: a flag flip (e.g. turning the Narrator off) did NOT
 * change the cache key, so the API kept serving a map computed under the OLD
 * configuration for up to the full 24h TTL. An "off" switch that keeps
 * emitting the thing you switched off is not an off switch — and the same
 * applied to the rollback direction, which is worse.
 *
 * The fix: the cache key (and the snapshot stamp) EMBED the identity of the
 * code + configuration that produced the value. Change any of them and the
 * derived key changes, so the stale entry is simply never read again. It
 * expires on its own TTL; we never need a global purge (no `KEYS`, no
 * scan-and-delete on the hot path).
 *
 * Two fingerprints, deliberately:
 *
 *   - `responseFingerprint` — every flag that can change the SERVED PAYLOAD,
 *     including copy-only ones (Narrator) and wire-only ones (EWS, legacy
 *     marker). This is what the Redis cache key uses: the cache stores a
 *     rendered response, so anything that alters the response must miss.
 *
 *   - `factsFingerprint` — only the flags that change the COMPUTED NUMBERS
 *     (pct / coverage / axis values). This is what `EmotionalMapSnapshot`
 *     uses. Snapshots store facts, not copy, so flipping the Narrator must
 *     NOT invalidate a year of history — that would be a false invalidation.
 *     Keeping the two apart is the same facts/narrator separation the V2
 *     contract is built on (ADR 0014, principle 3).
 */

/** Bump when the shape of `EmotionalMapResult` changes (fields added/removed/renamed). */
export const WIRE_SCHEMA_VERSION = 1;

/** Bump when the scoring math changes in a way that alters existing outputs. */
export const SCORING_VERSION = 1;

/**
 * Manual break-glass. Bumping this env invalidates every cached map and every
 * snapshot without touching code — for when we need to force a recompute that
 * the version constants can't express (e.g. a data backfill).
 */
export function cacheEpoch(): number {
  const raw = process.env.EMOTIONAL_MAP_CACHE_EPOCH?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

/** Flags that change the served payload (copy + wire + numbers). */
const RESPONSE_FLAGS: readonly FlagName[] = [
  "EMOTIONAL_MAP_V2",
  "EMOTIONAL_MAP_LEGACY_UI",
  "EMOTIONAL_MAP_OU",
  "EMOTIONAL_MAP_LLM_SCORING",
  "EMOTIONAL_MAP_EWS_PUBLIC",
  "EMOTIONAL_MAP_NARRATOR",
  "CONTENT_RESONANCE",
];

/**
 * Flags that change the computed NUMBERS. Excludes NARRATOR (copy only),
 * EWS_PUBLIC (nulls a wire field) and LEGACY_UI (strips a marker) — none of
 * them can move pct/coverage/values.
 */
const FACTS_FLAGS: readonly FlagName[] = [
  "EMOTIONAL_MAP_V2",
  "EMOTIONAL_MAP_OU",
  "EMOTIONAL_MAP_LLM_SCORING",
  "CONTENT_RESONANCE",
];

/** Stable, short digest of a flag subset. Sorted so key order can't drift. */
function fingerprint(flags: readonly FlagName[]): string {
  const canonical = [...flags]
    .sort()
    .map((f) => `${f}=${flagEnabled(f) ? "1" : "0"}`)
    .join(";");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 10);
}

/** Digest of every flag that can alter the served response. */
export function responseFingerprint(): string {
  return fingerprint(RESPONSE_FLAGS);
}

/** Digest of the flags that can alter the computed facts (numbers). */
export function factsFingerprint(): string {
  return fingerprint(FACTS_FLAGS);
}

/**
 * Identity stamped onto a persisted snapshot, and re-checked on read. A
 * snapshot whose identity does not match the running code + config describes
 * a different model and must not be presented as this one's history.
 */
export interface EmotionalMapFactsIdentity {
  wireSchemaVersion: number;
  scoringVersion: number;
  configFingerprint: string;
}

export function factsIdentity(): EmotionalMapFactsIdentity {
  return {
    wireSchemaVersion: WIRE_SCHEMA_VERSION,
    scoringVersion: SCORING_VERSION,
    configFingerprint: factsFingerprint(),
  };
}

/** True when a persisted snapshot was produced by the running code + config. */
export function matchesFactsIdentity(row: {
  wireSchemaVersion: number | null;
  scoringVersion: number | null;
  configFingerprint: string | null;
}): boolean {
  const id = factsIdentity();
  return (
    row.wireSchemaVersion === id.wireSchemaVersion &&
    row.scoringVersion === id.scoringVersion &&
    row.configFingerprint === id.configFingerprint
  );
}

/** Everything the cache key is a function of, besides the user. */
export interface CacheKeyParts {
  wireSchemaVersion: number;
  scoringVersion: number;
  configFingerprint: string;
  cacheEpoch: number;
}

/** The parts as they stand for the running code + config, right now. */
export function currentCacheKeyParts(): CacheKeyParts {
  return {
    wireSchemaVersion: WIRE_SCHEMA_VERSION,
    scoringVersion: SCORING_VERSION,
    configFingerprint: responseFingerprint(),
    cacheEpoch: cacheEpoch(),
  };
}

/**
 * Pure key builder. Kept separate from `currentCacheKeyParts` so a test can
 * prove the property directly: change any part → the key changes. If the key
 * were built inline from module constants, "a scoring bump invalidates the
 * cache" would be an assumption rather than something we check.
 *
 * Shape: `emotional-map:w<wire>:s<scoring>:c<configFp>:e<epoch>:<userId>`
 */
export function buildCacheKey(parts: CacheKeyParts, userId: string): string {
  return [
    "emotional-map",
    `w${parts.wireSchemaVersion}`,
    `s${parts.scoringVersion}`,
    `c${parts.configFingerprint}`,
    `e${parts.cacheEpoch}`,
    userId,
  ].join(":");
}

/**
 * THE per-user cache key. Imported by both the API and the worker so they can
 * never derive different keys for the same user (a divergence would mean the
 * cron writes a cache the API never reads).
 */
export function emotionalMapCacheKey(userId: string): string {
  return buildCacheKey(currentCacheKeyParts(), userId);
}
