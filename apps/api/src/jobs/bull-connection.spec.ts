import { describe, it, expect, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import type IoRedis from "ioredis";
import type { ConfigService } from "@nestjs/config";
import { createBullConnection } from "./bull-connection";
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

describe("createBullConnection (BullMQ connection factory)", () => {
  it("passes the URL through when REDIS_URL is set", () => {
    const conn = createBullConnection(
      makeConfig("redis://example.com:6379", "production"),
    );
    expect(conn).toEqual({ url: "redis://example.com:6379" });
  });

  it("returns a client instance (not dial options) in test env without REDIS_URL", () => {
    vi.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);

    const conn = createBullConnection(makeConfig(undefined, "test"));

    // Regression guard for the CI flake: BullMQ opens its own sockets from
    // plain { host, port } options. A pre-built ioredis-mock instance is the
    // only shape that guarantees no TCP dial to 127.0.0.1:6379 on runners
    // without a Redis.
    expect(typeof (conn as IoRedis).connect).toBe("function");
    expect(conn).not.toHaveProperty("host");
  });

  it("boots a BullMQ Queue over the mock without touching the network", async () => {
    vi.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);

    const conn = createBullConnection(makeConfig(undefined, "test"));
    const queue = new Queue("bull-connection-smoke", { connection: conn });
    const errors: Error[] = [];
    queue.on("error", (err) => errors.push(err));

    // waitUntilReady exercises BullMQ's full init path (script loading +
    // version probe) against the mock — this is what AppModule E2E boots do.
    await queue.waitUntilReady();
    await queue.close();

    expect(errors).toEqual([]);
  });

  it("falls back to localhost dial options in dev without REDIS_URL", () => {
    const conn = createBullConnection(makeConfig(undefined, "development"));
    expect(conn).toEqual({ host: "127.0.0.1", port: 6379 });
  });
});
