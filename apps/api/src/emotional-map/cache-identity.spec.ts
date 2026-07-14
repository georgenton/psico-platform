import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CACHE_EPOCH_ENV,
  FACTS_EPOCH_ENV,
  FACTS_SCHEMA_VERSION,
  SCORING_VERSION,
  WIRE_SCHEMA_VERSION,
  CRITICAL_FLAGS,
  assertCriticalFlagsConfigured,
  assertEmotionalMapConfigured,
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
import { FLAGS, type FlagName } from "../shared/flags";

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

/** A correctly-configured production box: every barrier explicitly in place. */
function pinProductionFlags() {
  process.env.NODE_ENV = "production";
  process.env.EMOTIONAL_MAP_CACHE_EPOCH = "1";
  process.env.EMOTIONAL_MAP_FACTS_EPOCH = "1";
  process.env.EMOTIONAL_MAP_V2 = "on";
  process.env.EMOTIONAL_MAP_LEGACY_UI = "off";
  process.env.EMOTIONAL_MAP_LLM_SCORING = "off";
  process.env.EMOTIONAL_MAP_EWS_PUBLIC = "off";
  process.env.EMOTIONAL_MAP_NARRATOR = "off";
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
      { ...parts, factsSchemaVersion: parts.factsSchemaVersion + 1 },
      { ...parts, cacheEpoch: parts.cacheEpoch + 1 },
      { ...parts, factsEpoch: parts.factsEpoch + 1 },
      { ...parts, generation: parts.generation + 1 },
      { ...parts, responseFingerprint: "deadbeef01" },
    ]) {
      expect(buildCacheKey(mutated, "user-1")).not.toBe(now);
    }
  });

  it("embeds every identity component in the key", async () => {
    const redis = makeRedis();
    const key = await resolveCacheKey(redis, "user-1");
    expect(key).toBe(
      `emotional-map:w${WIRE_SCHEMA_VERSION}:f${FACTS_SCHEMA_VERSION}:s${SCORING_VERSION}:r${responseFingerprint()}:fe${factsEpoch()}:ce${cacheEpoch()}:g0:user-1`,
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

  it("FACTS epoch: changes the cache key AND rejects the snapshot", async () => {
    // The cache key must be a SUPERSET of the facts identity: the cached
    // response is rendered FROM those numbers, so anything that voids a snapshot
    // must void the response too. Before this, a facts-epoch bump discarded the
    // history and kept serving a cached map built from it.
    const redis = makeRedis();
    const keyBefore = await resolveCacheKey(redis, "user-1");
    const factsBefore = factsIdentity();

    process.env[FACTS_EPOCH_ENV] = "2";

    expect(await resolveCacheKey(redis, "user-1")).not.toBe(keyBefore); // cache miss
    expect(matchesFactsIdentity(factsBefore)).toBe(false); // snapshot rejected
  });

  it("CACHE epoch: changes the cache key but does NOT reject the snapshot", async () => {
    // The other direction is not symmetric. Busting the rendered response says
    // nothing about the numbers behind it.
    const redis = makeRedis();
    const keyBefore = await resolveCacheKey(redis, "user-1");
    const factsBefore = factsIdentity();

    process.env[CACHE_EPOCH_ENV] = "2";

    expect(await resolveCacheKey(redis, "user-1")).not.toBe(keyBefore); // cache miss
    expect(matchesFactsIdentity(factsBefore)).toBe(true); // history survives
  });

  it("FACTS schema version: changes the cache key AND rejects the snapshot", () => {
    const parts = currentCacheKeyParts(0);
    const bumped = { ...parts, factsSchemaVersion: parts.factsSchemaVersion + 1 };

    expect(buildCacheKey(bumped, "user-1")).not.toBe(
      buildCacheKey(parts, "user-1"),
    );
    expect(
      matchesFactsIdentity({
        ...factsIdentity(),
        factsSchemaVersion: FACTS_SCHEMA_VERSION + 1,
      }),
    ).toBe(false);
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
    pinProductionFlags();

    delete process.env[CACHE_EPOCH_ENV];
    expect(() => assertEmotionalMapConfigured()).toThrow(
      /CACHE_EPOCH.*required/s,
    );

    process.env[CACHE_EPOCH_ENV] = "1";
    delete process.env[FACTS_EPOCH_ENV];
    expect(() => assertEmotionalMapConfigured()).toThrow(
      /FACTS_EPOCH.*required/s,
    );

    process.env[FACTS_EPOCH_ENV] = "1";
    expect(() => assertEmotionalMapConfigured()).not.toThrow();
  });

  // ── Critical flags: safety barriers, never defaulted ─────────────────────

  it("refuses to boot in production when a critical flag is missing or invalid", () => {
    pinProductionFlags();

    // Missing. `flagEnabled` would silently fall back to the code default —
    // and LLM_SCORING defaults to TRUE, so a box that simply forgot it would let
    // an LLM invent psychological scores. That is exactly what must not happen.
    delete process.env.EMOTIONAL_MAP_LLM_SCORING;
    expect(() => assertCriticalFlagsConfigured()).toThrow(/required/i);

    // Invalid value → not a shrug, an error.
    process.env.EMOTIONAL_MAP_LLM_SCORING = "maybe";
    expect(() => assertCriticalFlagsConfigured()).toThrow(/on\/off/i);

    // Set, valid, but the WRONG value for a barrier.
    process.env.EMOTIONAL_MAP_LLM_SCORING = "on";
    expect(() => assertCriticalFlagsConfigured()).toThrow(/must be "off"/);

    process.env.EMOTIONAL_MAP_LLM_SCORING = "off";
    expect(() => assertCriticalFlagsConfigured()).not.toThrow();
  });

  it("requires every critical flag to hold its safety value in production", () => {
    for (const [name, required] of Object.entries(CRITICAL_FLAGS) as Array<
      [FlagName, boolean]
    >) {
      pinProductionFlags();
      // Flip this one barrier to the wrong side; the rest stay correct.
      process.env[FLAGS[name].env] = required ? "off" : "on";
      expect(() => assertCriticalFlagsConfigured()).toThrow();
    }
  });

  it("does not gate critical flags outside production", () => {
    process.env.NODE_ENV = "test";
    delete process.env.EMOTIONAL_MAP_LLM_SCORING;
    // Dev and CI must stay ergonomic — the barrier is a production guarantee.
    expect(() => assertCriticalFlagsConfigured()).not.toThrow();
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

  it.each(Object.keys(FLAGS) as FlagName[])(
    "runtimeFingerprint changes when %s is toggled",
    (name) => {
      // Guards the canonicalization. `JSON.stringify(id, Object.keys(id).sort())`
      // applies the replacer array at EVERY level, so a nested `flags` object was
      // serialized in insertion order AND any key not in the top-level whitelist
      // was silently dropped — a flag could have moved without moving the
      // fingerprint. That is a false MATCH, which is the dangerous direction.
      process.env[FLAGS[name].env] = "on";
      const on = runtimeFingerprint();
      process.env[FLAGS[name].env] = "off";
      const off = runtimeFingerprint();

      expect(on).not.toBe(off);
    },
  );

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
