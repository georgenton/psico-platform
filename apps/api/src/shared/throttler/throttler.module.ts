import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import type IoRedis from "ioredis";
import { REDIS_CLIENT } from "../../redis";
import { RedisThrottlerStorage } from "./redis-throttler.storage";
import { AttestedClientThrottlerGuard } from "./attested-client-throttler.guard";

/**
 * Global rate-limiting setup.
 *
 * ### Design
 *
 * We register ONE throttler globally (`default: 60 req/min`). For endpoints
 * that need a stricter limit, the per-handler decorator overrides it:
 *
 * ```ts
 * @Post("login")
 * @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
 * login() { ... }
 * ```
 *
 * @SkipThrottle() opts a handler out entirely (used on /health below in
 * the controller itself).
 *
 * ### Why NOT multiple named throttlers globally
 *
 * @nestjs/throttler v6 applies *every* registered throttler to *every*
 * handler by default. If we declared `eco-free: 10/day` here, it would
 * apply to /auth/login too — banning users for 24 hours after 10 logins.
 * That's why we keep only `default` here and let each sprint pin its
 * specific limit at the handler level. ADR 0008 tracks the design targets.
 *
 * ### Storage
 *
 * Redis-backed via `RedisThrottlerStorage`. The default in-memory storage
 * would mean counters reset on every process restart (a restart amplifies
 * brute-force attacks) and would be per-process when Railway scales
 * horizontally (easy to bypass). Redis solves both.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: IoRedis) => ({
        throttlers: [{ name: "default", limit: 60, ttl: 60_000 }],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
  ],
  providers: [
    // The attested variant, not the stock guard. Without an attestation it
    // behaves identically (bucket = `req.ip`); with one it buckets by the
    // client the BFF observed, which is the only way a proxied surface gets a
    // limit that is not shared by everyone who uses it.
    { provide: APP_GUARD, useClass: AttestedClientThrottlerGuard },
  ],
  exports: [ThrottlerModule],
})
export class AppThrottlerModule {}
