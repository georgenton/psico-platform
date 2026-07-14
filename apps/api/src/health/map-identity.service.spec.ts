import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MapIdentityService } from "./map-identity.service";
import {
  IDENTITY_STALE_AFTER_MS,
  IDENTITY_TTL_SECONDS,
  identityKey,
  releaseSha,
  runtimeFingerprint,
  runtimeIdentity,
} from "../emotional-map/cache-identity";

/**
 * PR-0.1 — the API/worker identity probe.
 *
 * The property under test is the one that is easy to get wrong: a published
 * identity with no expiry lets a DEAD worker — or a deploy that never came up —
 * keep asserting "we agree" from a key written days ago. Absence of a live
 * heartbeat must read as MISMATCH, never as agreement.
 */

const ENVS = [
  "EMOTIONAL_MAP_CACHE_EPOCH",
  "EMOTIONAL_MAP_FACTS_EPOCH",
  "RAILWAY_GIT_COMMIT_SHA",
] as const;

function makeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: vi.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve("OK");
    }),
  };
}

/** What the worker would have written, with a controllable publish time. */
function workerPayload(publishedAt: Date, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    ...runtimeIdentity(),
    fingerprint: runtimeFingerprint(),
    releaseSha: releaseSha(),
    publishedAt: publishedAt.toISOString(),
    ...overrides,
  });
}

describe("MapIdentityService — API vs worker probe (PR-0.1)", () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const k of ENVS) saved.set(k, process.env[k]);
    process.env.EMOTIONAL_MAP_CACHE_EPOCH = "1";
    process.env.EMOTIONAL_MAP_FACTS_EPOCH = "1";
    process.env.RAILWAY_GIT_COMMIT_SHA = "abc123def456";
  });

  afterEach(() => {
    for (const k of ENVS) {
      const v = saved.get(k);
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("matches when the worker's heartbeat is fresh and its identity agrees", async () => {
    const redis = makeRedis();
    redis.store.set(identityKey("worker"), workerPayload(new Date()));

    const result = await new MapIdentityService(redis as never).compare();

    expect(result.match).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.workerHeartbeatAgeSeconds).toBeLessThan(5);
  });

  it("does NOT match when the worker's heartbeat is stale", async () => {
    // The key has not expired yet (clock skew, or a heartbeat that stopped
    // without the key lapsing) but the payload is old. A dead worker must not
    // keep asserting agreement from beyond the grave.
    const redis = makeRedis();
    const stale = new Date(Date.now() - IDENTITY_STALE_AFTER_MS - 60_000);
    redis.store.set(identityKey("worker"), workerPayload(stale));

    const result = await new MapIdentityService(redis as never).compare();

    expect(result.match).toBe(false);
    expect(result.reason).toMatch(/stale/i);
    expect(result.workerHeartbeatAgeSeconds).toBeGreaterThan(
      IDENTITY_STALE_AFTER_MS / 1000,
    );
  });

  it("does NOT match when the worker never published (key absent or expired)", async () => {
    // This is what a TTL'd key looks like once it lapses: simply gone. Silence
    // is not consent.
    const redis = makeRedis();

    const result = await new MapIdentityService(redis as never).compare();

    expect(result.match).toBe(false);
    expect(result.worker).toBeNull();
    expect(result.reason).toMatch(/has not published/i);
  });

  it("does NOT match when a publish failed and only an older identity survives", async () => {
    // The worker rebooted with a NEW config, its publish failed, and the key
    // from the previous boot is still within its TTL. The stale payload would
    // "agree" with an API that has since moved on — unless we compare it.
    const redis = makeRedis();
    redis.store.set(
      identityKey("worker"),
      workerPayload(new Date(), { factsEpoch: 1 }),
    );

    // The API moves to a new facts epoch (and the worker's key still says 1).
    process.env.EMOTIONAL_MAP_FACTS_EPOCH = "2";

    const result = await new MapIdentityService(redis as never).compare();

    expect(result.match).toBe(false);
    expect(result.reason).toMatch(/disagree on/i);
    expect(result.reason).toMatch(/factsEpoch/);
  });

  it("does NOT match when the two services run different builds", async () => {
    const redis = makeRedis();
    redis.store.set(
      identityKey("worker"),
      workerPayload(new Date(), { releaseSha: "0ldc0mm1t000" }),
    );

    const result = await new MapIdentityService(redis as never).compare();

    expect(result.match).toBe(false);
    expect(result.reason).toMatch(/different builds/i);
  });

  it("publishes with a TTL so a dead service stops asserting its identity", async () => {
    const redis = makeRedis();
    const logger = { log: vi.fn(), warn: vi.fn() };

    await MapIdentityService.publish(redis as never, "worker", logger);

    expect(redis.set).toHaveBeenCalledWith(
      identityKey("worker"),
      expect.any(String),
      "EX",
      IDENTITY_TTL_SECONDS,
    );
  });

  it("swallows a publish failure but leaves the probe reporting a mismatch", async () => {
    // Failing to publish must never take a service down — but it must not be
    // mistaken for agreement either.
    const redis = {
      set: vi.fn().mockRejectedValue(new Error("redis down")),
      get: vi.fn().mockResolvedValue(null),
    };
    const logger = { log: vi.fn(), warn: vi.fn() };

    await expect(
      MapIdentityService.publish(redis as never, "worker", logger),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();

    const result = await new MapIdentityService(redis as never).compare();
    expect(result.match).toBe(false);
  });
});
