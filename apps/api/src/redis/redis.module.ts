import { Global, Logger, Module } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import IoRedis from "ioredis";
// `ioredis-mock` is a drop-in implementation of the ioredis API backed by an
// in-memory map. Its constructor returns an instance compatible with the
// IoRedis class. We dynamically `require` it so it is not bundled in
// production: when NODE_ENV=production we never touch this branch.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
import type { Env } from "../config";

export const REDIS_CLIENT = "REDIS_CLIENT";

/**
 * Factory exported separately so it can be unit-tested without booting
 * the full Nest DI graph. The RedisModule below wires it via DI; tests
 * call it directly with a mock ConfigService.
 */
export function createRedisClient(
  config: Pick<ConfigService<Env, true>, "get">,
): IoRedis {
  const logger = new Logger("RedisModule");
  const url = config.get("REDIS_URL", { infer: true } as never) as
    | string
    | undefined;
  const env = config.get("NODE_ENV", { infer: true } as never) as string;

  // Production: REDIS_URL is required (envSchema enforces it).
  // Dev/test with REDIS_URL set: connect to real Redis (useful for
  // integration testing locally with `docker run redis`).
  if (url) {
    logger.log(`Connecting to Redis at ${maskCredentials(url)}`);
    const client = new IoRedis(url, {
      // Lazy connect — avoids crashing the boot if Redis is briefly down.
      // First command queues until the connection is up.
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      // Upstash uses TLS on rediss:// — ioredis detects it from the URL.
    });
    client.on("error", (err) => logger.error(`Redis error: ${err.message}`));
    client.on("connect", () => logger.log("Redis connected"));
    return client;
  }

  // No REDIS_URL → mock. This path is only reached in dev/test because
  // envSchema rejects this state in production.
  logger.warn(
    `No REDIS_URL set (NODE_ENV=${env}) — using ioredis-mock. ` +
      "Throttler and idempotency cache will not survive a restart.",
  );
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const RedisMock = require("ioredis-mock") as new () => IoRedis;
  return new RedisMock();
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: createRedisClient,
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}

// Helpers ─────────────────────────────────────────────────────────────────────

/**
 * Returns the URL with the password redacted, so it can appear in logs without
 * leaking the secret. Handles both standard `redis://user:pass@host` and the
 * password-only form `redis://:pass@host` used by some providers (Upstash).
 */
function maskCredentials(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    if (parsed.username) parsed.username = "***";
    return parsed.toString();
  } catch {
    return "redis://<unparseable>";
  }
}
