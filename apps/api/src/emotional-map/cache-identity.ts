import { createHash } from "node:crypto";

import { FLAGS, type FlagName, flagEnabled } from "../shared/flags";

/**
 * PR-0.1 — cache + snapshot identity for the emotional map.
 *
 * The incident this closes: we set EMOTIONAL_MAP_NARRATOR=off in production,
 * the deploy went green, and the API kept serving narrated maps. The cache key
 * did not depend on the configuration, so a 24h-old payload computed under the
 * OLD config kept being read. An "off" switch that keeps emitting the thing you
 * switched off is not an off switch — and the rollback direction was just as
 * broken.
 *
 * Three ideas, each closing a different hole:
 *
 *   1. THE KEY IS THE CONFIG. Versions + config fingerprint + epoch are part
 *      of the Redis key. Change any of them and the derived key changes, so the
 *      stale entry is never read again. It expires on its own TTL — no KEYS, no
 *      global purge on the hot path.
 *
 *   2. THE KEY IS ALSO THE GENERATION. A config-scoped key alone is NOT enough:
 *
 *          config A → cache written under key(A)
 *          config B → user changes a mood → invalidate deletes key(B) only
 *          config A again → key(A) is still there, stale, missing that mood
 *
 *      A deleted key under B says nothing about the entry sitting under A. So
 *      invalidation bumps a per-user GENERATION counter that is itself part of
 *      every key. One INCR makes every variant — past, present, and any config
 *      we might flip back to — unreachable at once.
 *
 *   3. FACTS AND RESPONSES AGE DIFFERENTLY. Snapshots persist numbers; the
 *      cache persists a rendered response. Muting the Narrator changes the
 *      response but not a single number, so it must invalidate the cache and
 *      NOT a year of history. Hence two fingerprints, two schema versions and
 *      two epochs — never one knob doing both jobs.
 */

// ── Versions ────────────────────────────────────────────────────────────────

/** Shape of `EmotionalMapResult` (the wire). Bump on any field add/remove/rename. */
export const WIRE_SCHEMA_VERSION = 1;

/**
 * Shape of the PERSISTED facts (pct / coverage / values). Deliberately separate
 * from the wire: we can reshape the response a dozen times without touching what
 * a snapshot means, and a snapshot must not be discarded because a UI field moved.
 */
export const FACTS_SCHEMA_VERSION = 1;

/** The scoring math. Bump when it changes in a way that alters existing outputs. */
export const SCORING_VERSION = 1;

// ── Epochs (strict; no silent defaults in production) ────────────────────────

export const CACHE_EPOCH_ENV = "EMOTIONAL_MAP_CACHE_EPOCH";
export const FACTS_EPOCH_ENV = "EMOTIONAL_MAP_FACTS_EPOCH";

/** Dev/test convenience only — production MUST set the epochs explicitly. */
const DEV_EPOCH_DEFAULT = 1;

/**
 * Read an epoch with no room for ambiguity.
 *
 * `parseInt` is the wrong tool here: it happily reads "3abc" as 3 and "1.9" as
 * 1, so a typo in a Railway variable would silently pin the wrong epoch and
 * quietly resurrect old caches. `Number()` rejects the whole string instead.
 *
 * In production a missing or invalid epoch THROWS — the service refuses to
 * boot rather than fall back to 1 and serve values from an epoch nobody chose.
 */
export function readEpoch(envName: string): number {
  const raw = process.env[envName]?.trim();

  if (raw === undefined || raw === "") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `${envName} is required in production. Set it explicitly on the API *and* the worker (same value) — an unset epoch would silently fall back to ${DEV_EPOCH_DEFAULT} and could resurrect caches from a previous epoch.`,
      );
    }
    return DEV_EPOCH_DEFAULT;
  }

  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new Error(
      `${envName} must be a safe integer >= 1 (got ${JSON.stringify(raw)}).`,
    );
  }
  return n;
}

export function cacheEpoch(): number {
  return readEpoch(CACHE_EPOCH_ENV);
}

export function factsEpoch(): number {
  return readEpoch(FACTS_EPOCH_ENV);
}

/**
 * Boot-time gate. Called from `main.ts` and `worker.ts` so a bad or missing
 * epoch kills the process at startup instead of surfacing as a strange cache
 * miss (or worse, a stale hit) hours later.
 */
export function assertEpochsConfigured(): void {
  cacheEpoch();
  factsEpoch();
}

// ── Fingerprints ────────────────────────────────────────────────────────────

/** Flags that can change the SERVED RESPONSE (copy + wire + numbers). */
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
 * Flags that can change the COMPUTED NUMBERS. Excludes NARRATOR (copy only),
 * EWS_PUBLIC (nulls a wire field) and LEGACY_UI (strips a marker): none of them
 * can move pct/coverage/values, so none of them may invalidate a snapshot.
 */
const FACTS_FLAGS: readonly FlagName[] = [
  "EMOTIONAL_MAP_V2",
  "EMOTIONAL_MAP_OU",
  "EMOTIONAL_MAP_LLM_SCORING",
  "CONTENT_RESONANCE",
];

/** Stable, short digest of a flag subset. Sorted so key order cannot drift. */
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

// ── Snapshot identity (facts) ───────────────────────────────────────────────

/**
 * Identity stamped onto a persisted snapshot and re-checked on read. A snapshot
 * whose identity does not match the running code + config describes a DIFFERENT
 * model, and must not be presented as this one's history.
 */
export interface EmotionalMapFactsIdentity {
  factsSchemaVersion: number;
  scoringVersion: number;
  configFingerprint: string;
  factsEpoch: number;
}

export function factsIdentity(): EmotionalMapFactsIdentity {
  return {
    factsSchemaVersion: FACTS_SCHEMA_VERSION,
    scoringVersion: SCORING_VERSION,
    configFingerprint: factsFingerprint(),
    factsEpoch: factsEpoch(),
  };
}

/** True when a persisted snapshot was produced by the running code + config. */
export function matchesFactsIdentity(row: {
  factsSchemaVersion: number | null;
  scoringVersion: number | null;
  configFingerprint: string | null;
  factsEpoch: number | null;
}): boolean {
  const id = factsIdentity();
  return (
    row.factsSchemaVersion === id.factsSchemaVersion &&
    row.scoringVersion === id.scoringVersion &&
    row.configFingerprint === id.configFingerprint &&
    row.factsEpoch === id.factsEpoch
  );
}

// ── Per-user generation ─────────────────────────────────────────────────────

/**
 * Minimal Redis surface this module needs. Declared structurally so the tests
 * can pass a fake without dragging ioredis in.
 */
export interface CacheRedis {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
}

/**
 * The generation counter for a user. It must NEVER expire: it is what makes
 * every older variant unreachable. It costs one small integer per user.
 */
export function generationKey(userId: string): string {
  return `emotional-map:gen:${userId}`;
}

/** Current generation, 0 when the user has never been invalidated. */
export async function readGeneration(
  redis: CacheRedis,
  userId: string,
): Promise<number> {
  const raw = await redis.get(generationKey(userId));
  if (raw === null) return 0;
  const n = Number(raw);
  // A corrupt counter must not silently reset to 0 — that would make every old
  // variant readable again. Treat it as "unknown, assume newer" instead.
  return Number.isSafeInteger(n) && n >= 0 ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * Invalidate every cached map for this user, under every configuration —
 * including ones we are not currently running and might roll back to.
 */
export async function bumpGeneration(
  redis: CacheRedis,
  userId: string,
): Promise<number> {
  return redis.incr(generationKey(userId));
}

// ── Cache key ───────────────────────────────────────────────────────────────

/** Everything the cache key is a function of, besides the user. */
export interface CacheKeyParts {
  wireSchemaVersion: number;
  scoringVersion: number;
  configFingerprint: string;
  cacheEpoch: number;
  generation: number;
}

export function currentCacheKeyParts(generation: number): CacheKeyParts {
  return {
    wireSchemaVersion: WIRE_SCHEMA_VERSION,
    scoringVersion: SCORING_VERSION,
    configFingerprint: responseFingerprint(),
    cacheEpoch: cacheEpoch(),
    generation,
  };
}

/**
 * Pure key builder, kept separate from `currentCacheKeyParts` so the tests can
 * prove the property directly: change any part → the key changes. Built inline
 * from module constants, "a scoring bump invalidates the cache" would be an
 * assumption rather than something we check.
 *
 * Shape: `emotional-map:w<wire>:s<scoring>:c<configFp>:e<epoch>:g<gen>:<userId>`
 */
export function buildCacheKey(parts: CacheKeyParts, userId: string): string {
  return [
    "emotional-map",
    `w${parts.wireSchemaVersion}`,
    `s${parts.scoringVersion}`,
    `c${parts.configFingerprint}`,
    `e${parts.cacheEpoch}`,
    `g${parts.generation}`,
    userId,
  ].join(":");
}

/**
 * THE per-user cache key. Async because the generation lives in Redis: a key
 * that could be derived without touching Redis could not express "everything
 * this user had cached is void", which is exactly what invalidation means.
 */
export async function resolveCacheKey(
  redis: CacheRedis,
  userId: string,
): Promise<string> {
  const generation = await readGeneration(redis, userId);
  return buildCacheKey(currentCacheKeyParts(generation), userId);
}

// ── Runtime identity (API vs worker) ────────────────────────────────────────

/**
 * Importing the same helper does NOT make divergence impossible: the API and
 * the worker are separate Railway services with separate environments. Same
 * code, different `EMOTIONAL_MAP_*` values → different fingerprints → the cron
 * writes snapshots the API will refuse to read, silently.
 *
 * So we make the identity observable: both services log it at boot and publish
 * it to Redis, and an admin probe compares them.
 */
export interface RuntimeIdentity {
  wireSchemaVersion: number;
  factsSchemaVersion: number;
  scoringVersion: number;
  responseFingerprint: string;
  factsFingerprint: string;
  cacheEpoch: number;
  factsEpoch: number;
  /** Flag name → on/off. Names and booleans only; never a secret. */
  flags: Record<string, boolean>;
}

export function runtimeIdentity(): RuntimeIdentity {
  const flags: Record<string, boolean> = {};
  for (const name of Object.keys(FLAGS) as FlagName[]) {
    flags[name] = flagEnabled(name);
  }
  return {
    wireSchemaVersion: WIRE_SCHEMA_VERSION,
    factsSchemaVersion: FACTS_SCHEMA_VERSION,
    scoringVersion: SCORING_VERSION,
    responseFingerprint: responseFingerprint(),
    factsFingerprint: factsFingerprint(),
    cacheEpoch: cacheEpoch(),
    factsEpoch: factsEpoch(),
    flags,
  };
}

/** One short digest of the whole runtime identity — what the two services compare. */
export function runtimeFingerprint(): string {
  const id = runtimeIdentity();
  const canonical = JSON.stringify(id, Object.keys(id).sort());
  return createHash("sha256").update(canonical).digest("hex").slice(0, 12);
}

/** Where each service publishes its identity for the probe to read. */
export function identityKey(service: "api" | "worker"): string {
  return `emotional-map:identity:${service}`;
}

/** One line, no secrets — printed by both services at boot. */
export function identityLogLine(service: "api" | "worker"): string {
  const id = runtimeIdentity();
  return `EmotionalMap identity [${service}] rt=${runtimeFingerprint()} wire=${id.wireSchemaVersion} facts=${id.factsSchemaVersion} scoring=${id.scoringVersion} response=${id.responseFingerprint} factsFp=${id.factsFingerprint} cacheEpoch=${id.cacheEpoch} factsEpoch=${id.factsEpoch}`;
}
