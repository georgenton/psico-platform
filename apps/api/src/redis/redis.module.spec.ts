import { describe, it, expect, vi } from "vitest";
import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { createRedisClient } from "./redis.module";
import type { Env } from "../config";

// Build a minimal ConfigService stub that only honors REDIS_URL + NODE_ENV.
function makeConfig(
  redisUrl: string | undefined,
  nodeEnv: "development" | "test" | "production" = "test",
): Pick<ConfigService<Env, true>, "get"> {
  return {
    get: (key: string) => {
      if (key === "REDIS_URL") return redisUrl;
      if (key === "NODE_ENV") return nodeEnv;
      return undefined;
    },
  } as never;
}

describe("createRedisClient (RedisModule factory)", () => {
  it("returns an ioredis-mock instance when REDIS_URL is unset", async () => {
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

    const client = createRedisClient(makeConfig(undefined, "test"));

    // ioredis-mock's class identity is opaque, but the API contract is the
    // same as the real client. Round-trip a value to prove it.
    await client.set("psico:test:key", "ping");
    const value = await client.get("psico:test:key");
    expect(value).toBe("ping");

    await client.quit();
  });

  it("connects to a real Redis when REDIS_URL is set", async () => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    // Use a fake unreachable URL — we only assert the construction path,
    // not that it actually connects. The TCP error fires asynchronously.
    const client = createRedisClient(
      makeConfig("redis://127.0.0.1:1/0", "development"),
    );

    expect(client).toBeDefined();
    expect(typeof client.get).toBe("function");

    // Avoid keeping a dangling socket open in the test runner.
    client.disconnect();
  });

  it("masks credentials in the connection log", async () => {
    const logSpy = vi
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    const client = createRedisClient(
      makeConfig("redis://default:s3cr3t@example.com:6379", "development"),
    );

    const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).not.toContain("s3cr3t");
    expect(logged).toMatch(/\*\*\*/);

    client.disconnect();
  });
});
