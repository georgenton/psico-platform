import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CACHE_EPOCH_ENV,
  FACTS_EPOCH_ENV,
  FACTS_SCHEMA_VERSION,
  SCORING_VERSION,
  WIRE_SCHEMA_VERSION,
  assertEpochsConfigured,
  buildCacheKey,
  bumpGeneration,
  cacheEpoch,
  currentCacheKeyParts,
  factsEpoch,
  factsFingerprint,
  factsIdentity,
  generationKey,
  matchesFactsIdentity,
  readGeneration,
  resolveCacheKey,
  responseFingerprint,
  runtimeFingerprint,
  runtimeIdentity,
} from "./cache-identity";

/**
 * PR-0.1 — the cache/snapshot identity.
 *
 * The incident being locked out: EMOTIONAL_MAP_NARRATOR=off in production kept
 * serving narrated maps, because the cache key did not depend on the config and
 * a 24h-old payload stayed readable.
 */

const ENVS = [
  "EMOTIONAL_MAP_V2",
  "EMOTIONAL_MAP_LEGACY_UI",
  "EMOTIONAL_MAP_OU",
  "EMOTIONAL_MAP_LLM_SCORING",
  "EMOTIONAL_MAP_EWS_PUBLIC",
  "EMOTIONAL_MAP_NARRATOR",
  "CONTENT_RESONANCE",
  CACHE_EPOCH_ENV,
  FACTS_EPOCH_ENV,
  "NODE_ENV",
] as const;

/** In-memory stand-in for the Redis surface the identity module needs. */
function makeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: (k: string) => Promise.resolve(store.get(k) ?? null),
    incr: (k: string) => {
      const next = Number(store.get(k) ?? "0") + 1;
      store.set(k, String(next));
      return Promise.resolve(next);
    },
  };
}

describe("emotional-map cache identity (PR-0.1)", () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const k of ENVS) saved.set(k, process.env[k]);
    process.env[CACHE_EPOCH_ENV] = "1";
    process.env[FACTS_EPOCH_ENV] = "1";
  });

  afterEach(() => {
    for (const k of ENVS) {
      const v = saved.get(k);
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  // ── The key is the config ────────────────────────────────────────────────

  it("changes the cache key when the Narrator flips (the production incident)", async () => {
    const redis = makeRedis();
    process.env.EMOTIONAL_MAP_NARRATOR = "on";
    const withNarrator = await resolveCacheKey(redis, "user-1");
    process.env.EMOTIONAL_MAP_NARRATOR = "off";
    const withoutNarrator = await resolveCacheKey(redis, "user-1");

    expect(withNarrator).not.toBe(withoutNarrator);
  });

  it("changes the cache key on a scoring, wire, epoch or generation change", () => {
    const parts = currentCacheKeyParts(0);
    const now = buildCacheKey(parts, "user-1");

    for (const mutated of [
      { ...parts, scoringVersion: parts.scoringVersion + 1 },
      { ...parts, wireSchemaVersion: parts.wireSchemaVersion + 1 },
      { ...parts, cacheEpoch: parts.cacheEpoch + 1 },
      { ...parts, generation: parts.generation + 1 },
      { ...parts, configFingerprint: "deadbeef01" },
    ]) {
      expect(buildCacheKey(mutated, "user-1")).not.toBe(now);
    }
  });

  it("embeds every identity component in the key", async () => {
    const redis = makeRedis();
    const key = await resolveCacheKey(redis, "user-1");
    expect(key).toBe(
      `emotional-map:w${WIRE_SCHEMA_VERSION}:s${SCORING_VERSION}:c${responseFingerprint()}:e${cacheEpoch()}:g0:user-1`,
    );
  });

  // ── The resurrection bug: A → B → write → A ──────────────────────────────

  it("does not resurrect a cache from config A after invalidating under config B", async () => {
    const redis = makeRedis();

    // Config A: the user's map is cached.
    process.env.EMOTIONAL_MAP_NARRATOR = "on";
    const keyA = await resolveCacheKey(redis, "user-1");
    redis.store.set(keyA, JSON.stringify({ stale: "computed under A" }));

    // Config B: the user changes a mood, so we invalidate. Under the old design
    // this deleted the key for B only — key(A) survived untouched.
    process.env.EMOTIONAL_MAP_NARRATOR = "off";
    await bumpGeneration(redis, "user-1");

    // Back to config A. The pre-invalidation payload MUST NOT come back: it does
    // not know about the mood the user just recorded.
    process.env.EMOTIONAL_MAP_NARRATOR = "on";
    const keyAAgain = await resolveCacheKey(redis, "user-1");

    expect(keyAAgain).not.toBe(keyA);
    expect(redis.store.get(keyAAgain)).toBeUndefined();
    // The orphan is still on disk — unreachable, and it expires on its own TTL.
    // No KEYS, no global purge.
    expect(redis.store.get(keyA)).toBe(
      JSON.stringify({ stale: "computed under A" }),
    );
  });

  it("bumps a per-user generation that is part of every key", async () => {
    const redis = makeRedis();
    expect(await readGeneration(redis, "user-1")).toBe(0);

    await bumpGeneration(redis, "user-1");
    expect(await readGeneration(redis, "user-1")).toBe(1);
    expect(await resolveCacheKey(redis, "user-1")).toContain(":g1:");

    // Scoped to the user: invalidating one must not invalidate everyone.
    expect(await readGeneration(redis, "user-2")).toBe(0);
    expect(redis.store.has(generationKey("user-1"))).toBe(true);
  });

  it("treats a corrupt generation as newer, never as 0", async () => {
    const redis = makeRedis();
    redis.store.set(generationKey("user-1"), "not-a-number");
    // Falling back to 0 would make every old variant readable again.
    expect(await readGeneration(redis, "user-1")).toBe(Number.MAX_SAFE_INTEGER);
  });

  // ── Facts vs response ────────────────────────────────────────────────────

  it("Narrator flip: changes the response fingerprint, not the facts one", () => {
    process.env.EMOTIONAL_MAP_NARRATOR = "on";
    const responseOn = responseFingerprint();
    const factsOn = factsFingerprint();
    const identityOn = factsIdentity();

    process.env.EMOTIONAL_MAP_NARRATOR = "off";
    const responseOff = responseFingerprint();
    const factsOff = factsFingerprint();

    // The served payload changes → the cache must miss.
    expect(responseOn).not.toBe(responseOff);
    // Not one number moved → a year of snapshots must survive.
    expect(factsOn).toBe(factsOff);
    // …and concretely: a snapshot written with the Narrator ON is still valid
    // with it OFF. The numbers cannot "reappear from a snapshot" because they
    // never depended on the Narrator in the first place.
    expect(matchesFactsIdentity(identityOn)).toBe(true);
  });

  it("invalidates snapshots when a facts-changing flag (V2) flips", () => {
    process.env.EMOTIONAL_MAP_V2 = "on";
    const identityV2On = factsIdentity();
    process.env.EMOTIONAL_MAP_V2 = "off";

    expect(factsFingerprint()).not.toBe(identityV2On.configFingerprint);
    expect(matchesFactsIdentity(identityV2On)).toBe(false);
  });

  it("rejects a snapshot whose facts identity does not match the running model", () => {
    const id = factsIdentity();
    expect(matchesFactsIdentity(id)).toBe(true);

    // Pre-PR-0.1 row: unknown provenance → never served.
    expect(
      matchesFactsIdentity({
        factsSchemaVersion: null,
        scoringVersion: null,
        configFingerprint: null,
        factsEpoch: null,
      }),
    ).toBe(false);

    for (const mutated of [
      { ...id, factsSchemaVersion: id.factsSchemaVersion + 1 },
      { ...id, scoringVersion: id.scoringVersion + 1 },
      { ...id, configFingerprint: "deadbeef01" },
      { ...id, factsEpoch: id.factsEpoch + 1 },
    ]) {
      expect(matchesFactsIdentity(mutated)).toBe(false);
    }
  });

  it("stamps snapshots with the FACTS schema, not the wire schema", () => {
    // Reshaping the API response moves no number, so it must not discard
    // history. The two versions are independent by construction.
    expect(factsIdentity().factsSchemaVersion).toBe(FACTS_SCHEMA_VERSION);
    expect(factsIdentity()).not.toHaveProperty("wireSchemaVersion");
  });

  // ── Epochs: separate, strict, no silent defaults ─────────────────────────

  it("keeps the cache epoch and the facts epoch independent", async () => {
    const redis = makeRedis();
    process.env[CACHE_EPOCH_ENV] = "1";
    process.env[FACTS_EPOCH_ENV] = "1";
    const key1 = await resolveCacheKey(redis, "user-1");
    const facts1 = factsIdentity();

    // Bumping the CACHE epoch must not invalidate snapshots…
    process.env[CACHE_EPOCH_ENV] = "2";
    expect(await resolveCacheKey(redis, "user-1")).not.toBe(key1);
    expect(matchesFactsIdentity(facts1)).toBe(true);

    // …and bumping the FACTS epoch must invalidate them.
    process.env[FACTS_EPOCH_ENV] = "2";
    expect(factsEpoch()).toBe(2);
    expect(matchesFactsIdentity(facts1)).toBe(false);
  });

  it("rejects a malformed epoch instead of silently reading a prefix", () => {
    // `parseInt("3abc")` is 3 and `parseInt("1.9")` is 1 — a typo in a Railway
    // variable would quietly pin the wrong epoch. Number() rejects the string.
    for (const bad of ["3abc", "1.9", "0", "-1", "abc", "1e400"]) {
      process.env[CACHE_EPOCH_ENV] = bad;
      expect(() => cacheEpoch()).toThrow();
    }
  });

  it("refuses to boot in production when an epoch is missing", () => {
    process.env.NODE_ENV = "production";

    delete process.env[CACHE_EPOCH_ENV];
    expect(() => assertEpochsConfigured()).toThrow(/CACHE_EPOCH.*required/s);

    process.env[CACHE_EPOCH_ENV] = "1";
    delete process.env[FACTS_EPOCH_ENV];
    expect(() => assertEpochsConfigured()).toThrow(/FACTS_EPOCH.*required/s);

    process.env[FACTS_EPOCH_ENV] = "1";
    expect(() => assertEpochsConfigured()).not.toThrow();
  });

  // ── API vs worker ────────────────────────────────────────────────────────

  it("exposes a runtime identity that differs when the two services disagree", () => {
    // Same code, different env — which is exactly what two Railway services
    // are. Importing the same helper does NOT make them agree; only comparing
    // the published identity catches this.
    process.env[FACTS_EPOCH_ENV] = "1";
    const apiFingerprint = runtimeFingerprint();

    process.env[FACTS_EPOCH_ENV] = "2"; // pretend this is the worker's env
    const workerFingerprint = runtimeFingerprint();

    expect(apiFingerprint).not.toBe(workerFingerprint);
  });

  it("publishes an identity with no secrets — names, numbers and booleans only", () => {
    const id = runtimeIdentity();
    const serialized = JSON.stringify(id);

    expect(Object.values(id.flags).every((v) => typeof v === "boolean")).toBe(
      true,
    );
    for (const secretish of [
      "KEY",
      "TOKEN",
      "SECRET",
      "PASSWORD",
      "postgres",
    ]) {
      expect(serialized).not.toContain(secretish);
    }
  });
});
