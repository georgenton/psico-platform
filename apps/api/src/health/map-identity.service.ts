import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Redis } from "ioredis";

import { REDIS_CLIENT } from "../redis";
import {
  type RuntimeIdentity,
  identityKey,
  identityLogLine,
  runtimeFingerprint,
  runtimeIdentity,
} from "../emotional-map/cache-identity";

/**
 * PR-0.1 — makes the API/worker emotional-map identity OBSERVABLE.
 *
 * Importing the same helper does not make the two services agree: they are
 * separate Railway deployments with separate environments. Same code +
 * `EMOTIONAL_MAP_FACTS_EPOCH=2` on the API and `=1` on the worker → the cron
 * writes snapshots the API refuses to read, silently, forever.
 *
 * So each service publishes its identity to Redis at boot, and this service
 * compares them on demand (`GET /api/health/emotional-map`).
 */

export interface PublishedIdentity extends RuntimeIdentity {
  fingerprint: string;
  publishedAt: string;
}

export interface IdentityComparison {
  api: PublishedIdentity;
  worker: PublishedIdentity | null;
  /** True only when the worker has published AND its fingerprint matches. */
  match: boolean;
  /** Human-readable reason when `match` is false. */
  reason: string | null;
}

@Injectable()
export class MapIdentityService {
  private readonly logger = new Logger(MapIdentityService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Called at boot by whichever service is starting. Never throws. */
  static async publish(
    redis: Pick<Redis, "set">,
    service: "api" | "worker",
    logger: Pick<Logger, "log" | "warn">,
  ): Promise<void> {
    logger.log(identityLogLine(service));
    const payload: PublishedIdentity = {
      ...runtimeIdentity(),
      fingerprint: runtimeFingerprint(),
      publishedAt: new Date().toISOString(),
    };
    try {
      await redis.set(identityKey(service), JSON.stringify(payload));
    } catch (err) {
      // Not fatal: the probe will just report the worker as "not published".
      logger.warn(
        `Could not publish the emotional-map identity for ${service}: ${(err as Error).message}`,
      );
    }
  }

  async compare(): Promise<IdentityComparison> {
    const api: PublishedIdentity = {
      ...runtimeIdentity(),
      fingerprint: runtimeFingerprint(),
      publishedAt: new Date().toISOString(),
    };

    let worker: PublishedIdentity | null = null;
    try {
      const raw = await this.redis.get(identityKey("worker"));
      if (raw) worker = JSON.parse(raw) as PublishedIdentity;
    } catch (err) {
      this.logger.warn(
        `Could not read the worker identity: ${(err as Error).message}`,
      );
    }

    if (!worker) {
      return {
        api,
        worker: null,
        match: false,
        reason:
          "The worker has not published its identity. Either it has not booted since PR-0.1 shipped, or it cannot reach Redis. Until it publishes, we cannot vouch that its snapshots are readable by this API.",
      };
    }

    if (worker.fingerprint !== api.fingerprint) {
      const drift = Object.keys(api)
        .filter((k) => k !== "fingerprint" && k !== "publishedAt")
        .filter(
          (k) =>
            JSON.stringify(api[k as keyof PublishedIdentity]) !==
            JSON.stringify(worker[k as keyof PublishedIdentity]),
        );
      return {
        api,
        worker,
        match: false,
        reason: `API and worker disagree on: ${drift.join(", ")}. The cron is writing snapshots this API will refuse to read. Align the EMOTIONAL_MAP_* variables on both Railway services and redeploy.`,
      };
    }

    return { api, worker, match: true, reason: null };
  }
}
