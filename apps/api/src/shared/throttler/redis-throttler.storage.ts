import type { ThrottlerStorage } from "@nestjs/throttler";
import type { ThrottlerStorageRecord } from "@nestjs/throttler/dist/throttler-storage-record.interface";
import type IoRedis from "ioredis";

/**
 * `ThrottlerStorage` backed by Redis.
 *
 * Why not in-memory: the default storage (`ThrottlerStorageService`) keeps
 * counters in a Map inside the process. If we ever run more than one Node
 * process (Railway scales horizontally, multiple workers behind a load
 * balancer), the rate-limit is *per process* — easy to bypass by rotating
 * which instance receives the request.
 *
 * Redis solves this by giving every process a shared counter.
 *
 * Atomicity: we use a tiny Lua script so the INCR + EXPIRE happen as one
 * operation, eliminating the race window where two concurrent requests
 * would each INCR first and then both call EXPIRE (resetting the TTL).
 */
/**
 * Constructed directly inside the ThrottlerModule.forRootAsync() factory —
 * not via Nest DI. The factory receives the redis client (from REDIS_CLIENT
 * token) and passes it to this constructor. Keeps the class testable in
 * isolation (just `new RedisThrottlerStorage(mockClient)`).
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  // KEYS[1] = redis key
  // ARGV[1] = ttl in ms
  // ARGV[2] = limit (req allowed in the window)
  // ARGV[3] = blockDuration in ms (0 = no separate block window)
  //
  // Returns [totalHits, timeToExpireMs, isBlocked(0|1), timeToBlockExpireMs]
  private readonly script = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
    end
    local ttl = redis.call('PTTL', KEYS[1])
    local limit = tonumber(ARGV[2])
    local blocked = 0
    local blockTtl = 0
    if current > limit then
      blocked = 1
      blockTtl = tonumber(ARGV[3]) > 0 and tonumber(ARGV[3]) or ttl
    end
    return { current, ttl, blocked, blockTtl }
  `;

  constructor(private readonly redis: IoRedis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const result = (await this.redis.eval(
      this.script,
      1,
      `throttle:${key}`,
      String(ttl),
      String(limit),
      String(blockDuration),
    )) as [number, number, number, number];

    const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] = result;

    return {
      totalHits,
      timeToExpire,
      isBlocked: Boolean(isBlocked),
      timeToBlockExpire,
    };
  }
}
