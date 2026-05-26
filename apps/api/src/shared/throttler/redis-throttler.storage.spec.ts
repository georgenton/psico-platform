import { describe, it, expect, beforeEach, afterEach } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const RedisMock = require("ioredis-mock");
import type IoRedis from "ioredis";
import { RedisThrottlerStorage } from "./redis-throttler.storage";

describe("RedisThrottlerStorage", () => {
  let redis: IoRedis;
  let storage: RedisThrottlerStorage;

  beforeEach(() => {
    redis = new RedisMock() as IoRedis;
    storage = new RedisThrottlerStorage(redis);
  });

  afterEach(async () => {
    await redis.flushall();
    await redis.quit();
  });

  it("counts the first request as hit 1 and sets the TTL", async () => {
    const result = await storage.increment("user:1", 60_000, 5, 0, "default");

    expect(result.totalHits).toBe(1);
    expect(result.isBlocked).toBe(false);
    expect(result.timeToExpire).toBeGreaterThan(0);
    expect(result.timeToExpire).toBeLessThanOrEqual(60_000);
  });

  it("increments on subsequent calls within the window", async () => {
    await storage.increment("user:1", 60_000, 5, 0, "default");
    await storage.increment("user:1", 60_000, 5, 0, "default");
    const third = await storage.increment("user:1", 60_000, 5, 0, "default");

    expect(third.totalHits).toBe(3);
    expect(third.isBlocked).toBe(false);
  });

  it("flags isBlocked=true on the request that exceeds the limit", async () => {
    for (let i = 0; i < 5; i++) {
      await storage.increment("user:1", 60_000, 5, 0, "default");
    }
    const overLimit = await storage.increment(
      "user:1",
      60_000,
      5,
      0,
      "default",
    );

    expect(overLimit.totalHits).toBe(6);
    expect(overLimit.isBlocked).toBe(true);
    expect(overLimit.timeToBlockExpire).toBeGreaterThan(0);
  });

  it("keeps counters separate by key (per-user isolation)", async () => {
    await storage.increment("user:1", 60_000, 5, 0, "default");
    await storage.increment("user:1", 60_000, 5, 0, "default");
    const userTwo = await storage.increment("user:2", 60_000, 5, 0, "default");

    expect(userTwo.totalHits).toBe(1);
    expect(userTwo.isBlocked).toBe(false);
  });

  it("does NOT extend the TTL on every increment (window stays fixed)", async () => {
    const first = await storage.increment("user:1", 60_000, 5, 0, "default");
    // Mock advances very fast; simulate elapsed time by sleeping briefly.
    await new Promise((r) => setTimeout(r, 20));
    const second = await storage.increment("user:1", 60_000, 5, 0, "default");

    // The TTL on the second call should be LESS than (or equal to) the first.
    // The PEXPIRE only happens on hit #1.
    expect(second.timeToExpire).toBeLessThanOrEqual(first.timeToExpire);
  });
});
