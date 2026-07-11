import { Logger } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import type IoRedis from "ioredis";
import type { ConnectionOptions } from "bullmq";
import type { Env } from "../config";

/**
 * Resolves the Redis connection BullMQ uses, shared by JobsModule (producer
 * side, booted with AppModule) and WorkerAppModule (consumer side).
 *
 * Why this exists as its own factory: BullMQ opens its OWN ioredis sockets
 * per queue — it never reuses the `REDIS_CLIENT` provider, so the
 * ioredis-mock fallback in `RedisModule` does not cover it. Before this
 * factory, booting AppModule without REDIS_URL always dialed
 * 127.0.0.1:6379; on a dev machine with `docker run redis` that silently
 * works, but on the CI runner (no Redis) every E2E spec spammed
 * ECONNREFUSED from 10 queue connections and flaked the suite.
 *
 * Resolution order:
 *  - REDIS_URL set → real Redis (production, or local integration testing).
 *  - test env without REDIS_URL → shared ioredis-mock instance. BullMQ
 *    accepts a pre-built client and opens no sockets of its own. Queue
 *    construction (waitUntilReady + script loading + version probe) works
 *    against the mock; schedulers are skipped in test by JobsService.
 *  - dev without REDIS_URL → localhost:6379 (`docker run redis`), needed
 *    for full producer + consumer flows.
 */
export function createBullConnection(
  config: Pick<ConfigService<Env, true>, "get">,
): ConnectionOptions {
  const url = config.get("REDIS_URL", { infer: true } as never) as
    | string
    | undefined;
  if (url) return { url };

  const env = config.get("NODE_ENV", { infer: true } as never) as string;
  if (env === "test") {
    new Logger("BullConnection").debug(
      "No REDIS_URL in test env — BullMQ queues run on ioredis-mock (no sockets)",
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const RedisMock = require("ioredis-mock") as new () => IoRedis;
    return new RedisMock();
  }

  return { host: "127.0.0.1", port: 6379 };
}
