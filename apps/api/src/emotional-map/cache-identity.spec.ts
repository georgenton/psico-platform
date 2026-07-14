import { beforeEach, afterEach, describe, expect, it } from "vitest";

import {
  SCORING_VERSION,
  WIRE_SCHEMA_VERSION,
  buildCacheKey,
  cacheEpoch,
  currentCacheKeyParts,
  emotionalMapCacheKey,
  factsFingerprint,
  factsIdentity,
  matchesFactsIdentity,
  responseFingerprint,
} from "./cache-identity";
import { emotionalMapCacheKey as keyViaService } from "./emotional-map.service";

/**
 * PR-0.1 — the cache/snapshot identity.
 *
 * The bug being locked out: turning the Narrator off in production kept
 * serving narrated maps because the cache key did not change, so the API read
 * a 24h-old payload computed under the old config. These tests pin the
 * property that makes that impossible — the key IS the config.
 */

const FLAG_ENVS = [
  "EMOTIONAL_MAP_V2",
  "EMOTIONAL_MAP_LEGACY_UI",
  "EMOTIONAL_MAP_OU",
  "EMOTIONAL_MAP_LLM_SCORING",
  "EMOTIONAL_MAP_EWS_PUBLIC",
  "EMOTIONAL_MAP_NARRATOR",
  "CONTENT_RESONANCE",
  "EMOTIONAL_MAP_CACHE_EPOCH",
] as const;

describe("emotional-map cache identity (PR-0.1)", () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const k of FLAG_ENVS) saved.set(k, process.env[k]);
  });

  afterEach(() => {
    for (const k of FLAG_ENVS) {
      const v = saved.get(k);
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("changes the cache key when the Narrator flips (the production bug)", () => {
    process.env.EMOTIONAL_MAP_NARRATOR = "on";
    const withNarrator = emotionalMapCacheKey("user-1");
    process.env.EMOTIONAL_MAP_NARRATOR = "off";
    const withoutNarrator = emotionalMapCacheKey("user-1");

    expect(withNarrator).not.toBe(withoutNarrator);
  });

  it("changes the cache key when the scoring version changes", () => {
    const parts = currentCacheKeyParts();
    const now = buildCacheKey(parts, "user-1");
    const bumped = buildCacheKey(
      { ...parts, scoringVersion: parts.scoringVersion + 1 },
      "user-1",
    );

    expect(now).not.toBe(bumped);
    // …and the same holds for the wire schema and the manual epoch, so every
    // part of the identity is load-bearing, not decorative.
    expect(
      buildCacheKey(
        { ...parts, wireSchemaVersion: parts.wireSchemaVersion + 1 },
        "user-1",
      ),
    ).not.toBe(now);
    expect(
      buildCacheKey({ ...parts, cacheEpoch: parts.cacheEpoch + 1 }, "user-1"),
    ).not.toBe(now);
  });

  it("honours EMOTIONAL_MAP_CACHE_EPOCH as the manual break-glass", () => {
    process.env.EMOTIONAL_MAP_CACHE_EPOCH = "1";
    const before = emotionalMapCacheKey("user-1");
    process.env.EMOTIONAL_MAP_CACHE_EPOCH = "2";
    const after = emotionalMapCacheKey("user-1");

    expect(cacheEpoch()).toBe(2);
    expect(before).not.toBe(after);
  });

  it("rejects a snapshot whose identity does not match the running model", () => {
    const id = factsIdentity();

    // Written by this exact code + config → usable.
    expect(matchesFactsIdentity(id)).toBe(true);

    // Pre-PR-0.1 row: unknown provenance → never served.
    expect(
      matchesFactsIdentity({
        wireSchemaVersion: null,
        scoringVersion: null,
        configFingerprint: null,
      }),
    ).toBe(false);

    // Computed by a different scoring version → a different model.
    expect(
      matchesFactsIdentity({ ...id, scoringVersion: id.scoringVersion + 1 }),
    ).toBe(false);

    // Computed under a different facts-config.
    expect(
      matchesFactsIdentity({ ...id, configFingerprint: "deadbeef01" }),
    ).toBe(false);
  });

  it("does NOT invalidate snapshots when a copy-only flag (Narrator) flips", () => {
    // Snapshots hold facts, not copy. Invalidating a year of history because
    // the narrator was muted would be a false invalidation — the numbers did
    // not move. This is the facts/narrator separation, enforced.
    process.env.EMOTIONAL_MAP_NARRATOR = "on";
    const factsOn = factsFingerprint();
    const responseOn = responseFingerprint();

    process.env.EMOTIONAL_MAP_NARRATOR = "off";
    const factsOff = factsFingerprint();
    const responseOff = responseFingerprint();

    expect(factsOn).toBe(factsOff); // snapshots survive ✅
    expect(responseOn).not.toBe(responseOff); // the cached response does not ✅
  });

  it("invalidates snapshots when a facts-changing flag (V2) flips", () => {
    process.env.EMOTIONAL_MAP_V2 = "on";
    const v2On = factsFingerprint();
    process.env.EMOTIONAL_MAP_V2 = "off";
    const v2Off = factsFingerprint();

    expect(v2On).not.toBe(v2Off);
  });

  it("derives the same key in the API and the worker (one shared function)", () => {
    // The worker imports the identity module directly; the API historically
    // imported the key from the service. Both must land on the same string, or
    // the cron would write a cache the API never reads.
    expect(keyViaService("user-1")).toBe(emotionalMapCacheKey("user-1"));
    expect(keyViaService).toBe(emotionalMapCacheKey);
  });

  it("embeds every identity component in the key", () => {
    const key = emotionalMapCacheKey("user-1");
    expect(key).toBe(
      `emotional-map:w${WIRE_SCHEMA_VERSION}:s${SCORING_VERSION}:c${responseFingerprint()}:e${cacheEpoch()}:user-1`,
    );
  });
});
