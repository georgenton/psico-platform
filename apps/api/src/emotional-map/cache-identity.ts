import { createHash } from "node:crypto";

import { FLAGS, type FlagName } from "../shared/flags";

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
 * Four ideas, each closing a different hole:
 *
 *   1. THE KEY IS THE CONFIG, AND IT IS A SUPERSET OF THE SNAPSHOT IDENTITY.
 *      Anything that invalidates a snapshot MUST also invalidate the cached
 *      response — the response is derived from those very numbers. So the key
 *      carries the facts schema and the facts epoch too, not just its own.
 *
 *   2. THE KEY IS ALSO THE GENERATION. A config-scoped key alone is NOT enough:
 *
 *          config A → cache written under key(A)
 *          config B → user changes a mood → invalidate deletes key(B) only
 *          config A again → key(A) is still there, stale, missing that mood
 *
 *      Invalidation bumps a per-user GENERATION that is part of every key. One
 *      INCR makes every variant — past, present, and any config we might flip
 *      back to — unreachable at once.
 *
 *   3. FACTS AND RESPONSES AGE DIFFERENTLY. Snapshots persist numbers; the cache
 *      persists a rendered response. Muting the Narrator changes the response but
 *      not a single number, so it must invalidate the cache and NOT a year of
 *      history. The relationship is one-directional, not symmetric:
 *
 *          facts change  ⇒ cache AND snapshots die
 *          response-only change ⇒ only the cache dies
 *
 *   4. NOTHING ABOUT THE CONFIG IS IMPLICIT IN PRODUCTION. Epochs and the
 *      critical safety flags must be set explicitly; a missing or malformed
 *      value refuses to boot rather than falling back to a default nobody chose.
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

// ── Environment identity ────────────────────────────────────────────────────

export type PsicoEnvironment =
  | "production"
  | "staging"
  | "development"
  | "test";

const VALID_ENVIRONMENTS: readonly string[] = [
  "production",
  "staging",
  "development",
  "test",
];

/**
 * Relying on NODE_ENV alone is fragile: a Railway box that ships without it
 * silently looks like "development" and every safety barrier below quietly
 * turns itself off. That is precisely the failure we are trying to make
 * impossible, so a DEPLOYED box must say what it is.
 *
 * `PSICO_ENV` is the explicit answer. NODE_ENV is accepted as a fallback for
 * local work and CI. If neither is valid AND we can see we are on Railway, we
 * refuse to guess — and refuse to boot.
 */
export function resolveEnvironment(): PsicoEnvironment {
  const explicit = process.env.PSICO_ENV?.trim().toLowerCase();

  // ── On a deployed box, the rules are strict and PSICO_ENV is the ONLY word ──
  //
  // The previous version accepted PSICO_ENV=development on a Railway box, and
  // that quietly turned every safety barrier off — the exact failure this whole
  // mechanism exists to prevent, now reachable by writing "development" into a
  // variable. A box the platform says is deployed IS deployed; it does not get
  // to claim otherwise.
  //
  // NODE_ENV does not substitute for PSICO_ENV here either: it is set by tooling
  // for a hundred reasons that have nothing to do with our safety posture (a test
  // runner, a build step, a base image default). Deployment posture must be
  // stated deliberately, in a variable that means only that.
  if (looksDeployed()) {
    if (!explicit) {
      throw new Error(
        "This box is running on Railway but does not declare PSICO_ENV. Set PSICO_ENV=production or PSICO_ENV=staging. NODE_ENV is not accepted here: a deployed box must state its posture deliberately, and an unset value would silently disable every safety barrier.",
      );
    }
    if (explicit !== "production" && explicit !== "staging") {
      throw new Error(
        `PSICO_ENV=${JSON.stringify(explicit)} is not valid on a deployed box — only "production" or "staging" are. A deployed box cannot opt out of the safety barriers by calling itself a development machine.`,
      );
    }
    return explicit;
  }

  // ── Local / CI ─────────────────────────────────────────────────────────────
  if (explicit) {
    if (!VALID_ENVIRONMENTS.includes(explicit)) {
      throw new Error(
        `PSICO_ENV must be one of ${VALID_ENVIRONMENTS.join(" | ")} (got ${JSON.stringify(explicit)}).`,
      );
    }
    return explicit as PsicoEnvironment;
  }

  const node = process.env.NODE_ENV?.trim().toLowerCase();
  if (node && VALID_ENVIRONMENTS.includes(node)) {
    return node as PsicoEnvironment;
  }

  return "development";
}

/** True when platform variables say we are on Railway, whatever the env claims. */
function looksDeployed(): boolean {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ??
    process.env.RAILWAY_PROJECT_ID ??
    process.env.RAILWAY_SERVICE_ID,
  );
}

/** Deployed environments enforce the barriers; local ones stay ergonomic. */
export function isDeployedEnvironment(): boolean {
  const env = resolveEnvironment();
  return env === "production" || env === "staging";
}

function isProduction(): boolean {
  return isDeployedEnvironment();
}

/**
 * Read an epoch with no room for ambiguity.
 *
 * `parseInt` is the wrong tool: it reads "3abc" as 3 and "1.9" as 1, so a typo
 * in a Railway variable would silently pin the wrong epoch and quietly resurrect
 * old caches. `Number()` rejects the whole string instead.
 */
export function readEpoch(envName: string): number {
  const raw = process.env[envName]?.trim();

  if (raw === undefined || raw === "") {
    if (isProduction()) {
      throw new Error(
        `${envName} is required in production. Set it explicitly on the API *and* the worker — an unset epoch would fall back to ${DEV_EPOCH_DEFAULT} and could resurrect caches from a previous epoch.`,
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

/** Invalidates the cached RESPONSE only. Snapshots survive. */
export function cacheEpoch(): number {
  return readEpoch(CACHE_EPOCH_ENV);
}

/**
 * Invalidates the persisted FACTS — and therefore the cache too, since the
 * cached response is derived from those numbers. It appears in both identities.
 */
export function factsEpoch(): number {
  return readEpoch(FACTS_EPOCH_ENV);
}

// ── Critical flags (safety barriers — never defaulted in production) ─────────

/**
 * The flags that encode a SAFETY DECISION, not a preference. Falling back to a
 * default here is the thing we are trying to prevent: `EMOTIONAL_MAP_LLM_SCORING`
 * defaults to `true` in code, so a box that simply forgot to set it would let an
 * LLM invent psychological scores. In production these must be set explicitly
 * AND match the required value — anything else refuses to boot.
 */
export const CRITICAL_FLAGS: Readonly<Partial<Record<FlagName, boolean>>> = {
  EMOTIONAL_MAP_V2: true,
  EMOTIONAL_MAP_LEGACY_UI: false,
  EMOTIONAL_MAP_LLM_SCORING: false,
  EMOTIONAL_MAP_EWS_PUBLIC: false,
  EMOTIONAL_MAP_NARRATOR: false,
  // Until PR-3 retires the ARC axes, confirmed resonances still feed Conexión
  // and Propósito — psychological scores the corrigendum reclassified as
  // unsupported. Off until the axes are gone.
  CONTENT_RESONANCE: false,
};

/**
 * Flags with no fixed safety value, but which a deployed box must still DECLARE.
 * An implicit default is a decision nobody made; on a deployed box we want the
 * decision written down, whatever it is.
 */
export const REQUIRED_DEFINED_FLAGS: readonly FlagName[] = [
  "EMOTIONAL_MAP_OU",
  // PR-0.2 — the fail-closed kill switch. No fixed value (on is normal, off is
  // a deliberate take-down), but a deployed box must STATE which one it is:
  // silently defaulting the whole map on or off is exactly the kind of implicit
  // decision this barrier exists to forbid.
  "EMOTIONAL_MAP_PUBLIC",
];

/**
 * Read a flag with NO fallback: an unset or unrecognized value is an error, not
 * a shrug. `flagEnabled` (shared/flags) intentionally falls back to a declared
 * default; that is right for preferences and wrong for barriers.
 */
export function readFlagStrict(name: FlagName): boolean {
  const raw = process.env[FLAGS[name].env]?.trim().toLowerCase();
  if (raw === undefined || raw === "") {
    throw new Error(
      `${FLAGS[name].env} is required in production (it is a safety barrier, not a preference). Set it explicitly on the API and the worker.`,
    );
  }
  if (raw === "on" || raw === "true" || raw === "1") return true;
  if (raw === "off" || raw === "false" || raw === "0") return false;
  throw new Error(
    `${FLAGS[name].env} must be one of on/off/true/false/1/0 (got ${JSON.stringify(raw)}).`,
  );
}

export function assertCriticalFlagsConfigured(): void {
  if (!isDeployedEnvironment()) return;

  for (const [name, required] of Object.entries(CRITICAL_FLAGS) as Array<
    [FlagName, boolean]
  >) {
    const actual = readFlagStrict(name);
    if (actual !== required) {
      throw new Error(
        `${FLAGS[name].env} must be "${required ? "on" : "off"}" in a deployed environment. It encodes a safety decision (see ADR 0014); a different value would re-open a behaviour we deliberately closed.`,
      );
    }
  }

  // No fixed value — but it must be stated.
  for (const name of REQUIRED_DEFINED_FLAGS) {
    readFlagStrict(name);
  }
}

/**
 * Boot-time gate for BOTH services. A bad epoch or a critical flag out of
 * position kills the process at startup instead of surfacing hours later as a
 * strange cache miss — or worse, a stale hit.
 */
export function assertEmotionalMapConfigured(): void {
  // Throws when a deployed box declares no valid environment — we will not guess
  // our way into disabling the barriers below.
  resolveEnvironment();
  cacheEpoch();
  factsEpoch();
  assertCriticalFlagsConfigured();
}

// ── Fingerprints ────────────────────────────────────────────────────────────

/**
 * Flags that can change the COMPUTED NUMBERS (pct / coverage / values).
 * Excludes NARRATOR (copy only), EWS_PUBLIC (nulls a wire field) and LEGACY_UI
 * (strips a marker): none of them can move a number.
 */
export const FACTS_FLAGS: readonly FlagName[] = [
  "EMOTIONAL_MAP_V2",
  "EMOTIONAL_MAP_OU",
  "EMOTIONAL_MAP_LLM_SCORING",
  "CONTENT_RESONANCE",
];

/** Flags that change ONLY the rendered response — never a number. */
export const RESPONSE_ONLY_FLAGS: readonly FlagName[] = [
  "EMOTIONAL_MAP_LEGACY_UI",
  "EMOTIONAL_MAP_EWS_PUBLIC",
  "EMOTIONAL_MAP_NARRATOR",
  // PR-0.2 — the public kill switch. Response-only: flipping it decides whether
  // the map is served at all, but never moves a stored number, so a snapshot
  // written while it was on is still a valid snapshot when it comes back on.
  // In RESPONSE_FLAGS (so it is part of runtime identity + responseFingerprint),
  // NOT in FACTS_FLAGS (so it does not void a year of snapshots).
  "EMOTIONAL_MAP_PUBLIC",
];

/**
 * Flags that can change the SERVED RESPONSE.
 *
 * Built as FACTS + RESPONSE_ONLY rather than hand-listed, so `facts ⊂ response`
 * is STRUCTURAL: you cannot add a facts flag and forget to bust the cache,
 * because the response set is derived from the facts set. Anything that voids a
 * snapshot voids the cached response by construction — the response is rendered
 * from those very numbers.
 */
export const RESPONSE_FLAGS: readonly FlagName[] = [
  ...FACTS_FLAGS,
  ...RESPONSE_ONLY_FLAGS,
];

/** Flag value as it is actually used at runtime (default-tolerant, like the app). */
function flagValue(name: FlagName): boolean {
  const raw = process.env[FLAGS[name].env]?.trim().toLowerCase();
  if (raw === "on" || raw === "true" || raw === "1") return true;
  if (raw === "off" || raw === "false" || raw === "0") return false;
  return FLAGS[name].default;
}

/** Stable, short digest of a flag subset. Sorted so key order cannot drift. */
function fingerprint(flags: readonly FlagName[]): string {
  const canonical = [...flags]
    .sort()
    .map((f) => `${f}=${flagValue(f) ? "1" : "0"}`)
    .join(";");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 10);
}

export function responseFingerprint(): string {
  return fingerprint(RESPONSE_FLAGS);
}

export function factsFingerprint(): string {
  return fingerprint(FACTS_FLAGS);
}

// ── Snapshot identity (facts) ───────────────────────────────────────────────

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

export interface CacheRedis {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
}

/**
 * The generation counter for a user. It must NEVER expire: it is what makes
 * every older variant unreachable. One small integer per user.
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

/**
 * Everything the cache key is a function of, besides the user.
 *
 * A STRICT SUPERSET of the facts identity: anything that invalidates a snapshot
 * must also invalidate the cached response, because the response is rendered
 * from those numbers. Hence `factsSchemaVersion` and `factsEpoch` live here too.
 * (`responseFingerprint` already covers the facts flags — FACTS_FLAGS ⊂
 * RESPONSE_FLAGS — so the config side needs no second digest.)
 */
export interface CacheKeyParts {
  wireSchemaVersion: number;
  factsSchemaVersion: number;
  scoringVersion: number;
  responseFingerprint: string;
  factsEpoch: number;
  cacheEpoch: number;
  /**
   * DURABLE, Postgres-backed. Bumped in the same transaction that changes a
   * privacy consent and deletes the derived rows. This is what makes a
   * revocation safe WITHOUT Redis: the key moves when the transaction commits,
   * so the payload built from the revoked data becomes unreachable even if the
   * Redis INCR below never ran.
   */
  privacyRevision: number;
  /**
   * Redis-backed. A freshness optimisation — bumped on ordinary writes so the
   * user sees their new mood immediately. NOT a safety mechanism: Redis can
   * fail, and a revocation must not depend on it.
   */
  generation: number;
}

export function currentCacheKeyParts(
  privacyRevision: number,
  generation: number,
): CacheKeyParts {
  return {
    wireSchemaVersion: WIRE_SCHEMA_VERSION,
    factsSchemaVersion: FACTS_SCHEMA_VERSION,
    scoringVersion: SCORING_VERSION,
    responseFingerprint: responseFingerprint(),
    factsEpoch: factsEpoch(),
    cacheEpoch: cacheEpoch(),
    privacyRevision,
    generation,
  };
}

/**
 * Pure key builder, kept separate from `currentCacheKeyParts` so the tests can
 * prove the property directly: change any part → the key changes. Built inline
 * from module constants, "a facts-epoch bump invalidates the cache" would be an
 * assumption rather than something we check.
 *
 * Shape:
 *   emotional-map:w<wire>:f<facts>:s<scoring>:r<responseFp>:fe<factsEpoch>:ce<cacheEpoch>:p<privacyRev>:g<gen>:<userId>
 */
export function buildCacheKey(parts: CacheKeyParts, userId: string): string {
  return [
    "emotional-map",
    `w${parts.wireSchemaVersion}`,
    `f${parts.factsSchemaVersion}`,
    `s${parts.scoringVersion}`,
    `r${parts.responseFingerprint}`,
    `fe${parts.factsEpoch}`,
    `ce${parts.cacheEpoch}`,
    `p${parts.privacyRevision}`,
    `g${parts.generation}`,
    userId,
  ].join(":");
}

/**
 * THE per-user cache key.
 *
 * Takes the DURABLE privacy revision (read from Postgres by the caller) and
 * reads the Redis generation itself. The two halves have different jobs:
 *
 *   - privacyRevision — SAFETY. Moves with the transaction that revokes consent,
 *     so the revocation holds even if Redis is unreachable.
 *   - generation      — FRESHNESS. Moves on ordinary writes so the user sees
 *     their new mood right away. Best-effort by design.
 *
 * If Redis is down, `readGeneration` throws and the request fails — but it can
 * never SILENTLY serve a payload from before a revocation, because the revision
 * that made that payload unreachable lives in Postgres.
 */
export async function resolveCacheKey(
  redis: CacheRedis,
  userId: string,
  privacyRevision: number,
): Promise<string> {
  const generation = await readGeneration(redis, userId);
  return buildCacheKey(
    currentCacheKeyParts(privacyRevision, generation),
    userId,
  );
}

// ── Runtime identity (API vs worker) ────────────────────────────────────────

/**
 * Importing the same helper does NOT make divergence impossible: the API and the
 * worker are separate Railway services with separate environments. Same code +
 * a different EMOTIONAL_MAP_* value → the cron writes snapshots the API refuses
 * to read, silently. Same env + a half-finished deploy → they run different
 * commits. So we make the identity observable and comparable.
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

/** Short commit SHA of the running build, or null when the platform hides it. */
export function releaseSha(): string | null {
  const raw =
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.RELEASE_SHA ??
    process.env.GIT_COMMIT_SHA ??
    process.env.SOURCE_VERSION;
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  // A commit SHA is public information; we still truncate it for log hygiene.
  return trimmed.slice(0, 12);
}

export function runtimeIdentity(): RuntimeIdentity {
  const flags: Record<string, boolean> = {};
  for (const name of (Object.keys(FLAGS) as FlagName[]).sort()) {
    flags[name] = flagValue(name);
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

/**
 * Deep, order-independent serialization.
 *
 * `JSON.stringify(obj, Object.keys(obj).sort())` does NOT do this: the replacer
 * array only filters/orders keys at every level by the SAME whitelist, so a
 * nested object like `flags` is serialized in insertion order and any key not in
 * the whitelist is dropped. Two boxes with the same flags in a different order
 * would have produced different fingerprints — a false mismatch — and a flag
 * whose name was not in the top-level key list would have been silently ignored
 * — a false match. Both are worse than no check at all.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/** One short digest of the whole runtime identity — what the two services compare. */
export function runtimeFingerprint(): string {
  return createHash("sha256")
    .update(stableStringify(runtimeIdentity()))
    .digest("hex")
    .slice(0, 12);
}

/** Where each service publishes its identity for the probe to read. */
export function identityKey(service: "api" | "worker"): string {
  return `emotional-map:identity:${service}`;
}

/**
 * How long a published identity stays valid. The key carries this as a Redis
 * TTL, so a dead worker's identity disappears on its own — it cannot keep
 * asserting "we agree" from beyond the grave.
 */
export const IDENTITY_TTL_SECONDS = 180;

/** How often each service refreshes its identity. Comfortably inside the TTL. */
export const IDENTITY_HEARTBEAT_MS = 60_000;

/**
 * A published identity older than this is stale even if its key has not expired
 * yet (clock skew, a heartbeat that stopped without the key lapsing). Belt and
 * braces on top of the TTL.
 */
export const IDENTITY_STALE_AFTER_MS = 150_000;

/** One line, no secrets — printed by both services at boot. */
export function identityLogLine(service: "api" | "worker"): string {
  const id = runtimeIdentity();
  const sha = releaseSha() ?? "unknown";
  return `EmotionalMap identity [${service}] rt=${runtimeFingerprint()} env=${resolveEnvironment()} sha=${sha} wire=${id.wireSchemaVersion} facts=${id.factsSchemaVersion} scoring=${id.scoringVersion} responseFp=${id.responseFingerprint} factsFp=${id.factsFingerprint} cacheEpoch=${id.cacheEpoch} factsEpoch=${id.factsEpoch}`;
}
