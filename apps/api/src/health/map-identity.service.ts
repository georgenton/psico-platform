import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Redis } from "ioredis";

import { REDIS_CLIENT } from "../redis";
import {
  IDENTITY_HEARTBEAT_MS,
  IDENTITY_STALE_AFTER_MS,
  IDENTITY_TTL_SECONDS,
  type RuntimeIdentity,
  identityKey,
  identityLogLine,
  isDeployedEnvironment,
  releaseSha,
  resolveEnvironment,
  runtimeFingerprint,
  runtimeIdentity,
} from "../emotional-map/cache-identity";

/**
 * PR-0.1 — makes the API/worker emotional-map identity OBSERVABLE.
 *
 * Importing the same helper does not make the two services agree: they are
 * separate Railway deployments with separate environments, and a deploy can
 * leave them on different commits. Same code + `EMOTIONAL_MAP_FACTS_EPOCH=2` on
 * the API and `=1` on the worker → the cron writes snapshots the API refuses to
 * read, silently, forever.
 *
 * So each service PUBLISHES its identity to Redis and keeps refreshing it, and
 * this service compares them on demand (`GET /api/health/emotional-map`).
 *
 * The heartbeat matters as much as the comparison. A published identity with no
 * expiry would let a DEAD worker — or a deploy that never came up — keep
 * asserting "we agree" from a key written days ago. So the key carries a TTL,
 * the payload carries `publishedAt`, and a stale heartbeat is a MISMATCH, not a
 * match. Absence of evidence is not evidence of agreement.
 */

export interface PublishedIdentity extends RuntimeIdentity {
  fingerprint: string;
  /** Short commit SHA — public information, and the only way to spot a half-deploy. */
  releaseSha: string | null;
  /** production | staging | development | test. No secrets. */
  environment: string;
  publishedAt: string;
}

export interface IdentityComparison {
  api: PublishedIdentity;
  worker: PublishedIdentity | null;
  /** True ONLY when the worker's heartbeat is fresh AND its identity matches. */
  match: boolean;
  /** Human-readable reason when `match` is false. */
  reason: string | null;
  /** Age of the worker's heartbeat in seconds, or null when it never published. */
  workerHeartbeatAgeSeconds: number | null;
}

function snapshotIdentity(): PublishedIdentity {
  return {
    ...runtimeIdentity(),
    fingerprint: runtimeFingerprint(),
    releaseSha: releaseSha(),
    environment: resolveEnvironment(),
    publishedAt: new Date().toISOString(),
  };
}

@Injectable()
export class MapIdentityService {
  private readonly logger = new Logger(MapIdentityService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Write the identity once, with a TTL so a dead service stops asserting it. */
  static async publish(
    redis: Pick<Redis, "set">,
    service: "api" | "worker",
    logger: Pick<Logger, "warn">,
  ): Promise<void> {
    try {
      await redis.set(
        identityKey(service),
        JSON.stringify(snapshotIdentity()),
        "EX",
        IDENTITY_TTL_SECONDS,
      );
    } catch (err) {
      // Not fatal: the probe reports the service as "not published", which is a
      // MISMATCH — the safe direction.
      logger.warn(
        `Could not publish the emotional-map identity for ${service}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Publish now, then keep refreshing inside the TTL. Returns the timer so the
   * caller can clear it; `unref()` keeps it from holding the process open on its
   * own (BullMQ / the HTTP server are what keep these services alive).
   */
  static startHeartbeat(
    redis: Pick<Redis, "set">,
    service: "api" | "worker",
    logger: Pick<Logger, "log" | "warn">,
  ): NodeJS.Timeout {
    logger.log(identityLogLine(service));
    void MapIdentityService.publish(redis, service, logger);
    const timer = setInterval(() => {
      void MapIdentityService.publish(redis, service, logger);
    }, IDENTITY_HEARTBEAT_MS);
    timer.unref();
    return timer;
  }

  async compare(): Promise<IdentityComparison> {
    // The API's identity is computed LIVE — never read back from Redis. A probe
    // that compared two cached blobs could agree while the process it runs in
    // disagrees with both.
    const api = snapshotIdentity();

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
          "The worker has not published an identity (its heartbeat key is absent or expired). Either it is not running, it has not booted since PR-0.1 shipped, or it cannot reach Redis. Until it publishes, we cannot vouch that its snapshots are readable by this API.",
        workerHeartbeatAgeSeconds: null,
      };
    }

    const ageMs = Date.now() - new Date(worker.publishedAt).getTime();
    const ageSeconds = Math.round(ageMs / 1000);

    // A key that has not expired yet can still be stale (clock skew, a heartbeat
    // that stopped without the key lapsing). Stale ⇒ mismatch.
    if (!Number.isFinite(ageMs) || ageMs > IDENTITY_STALE_AFTER_MS) {
      return {
        api,
        worker,
        match: false,
        reason: `The worker's heartbeat is stale (${ageSeconds}s old, limit ${Math.round(IDENTITY_STALE_AFTER_MS / 1000)}s). It published this identity and then stopped refreshing it — treat it as down, not as agreeing.`,
        workerHeartbeatAgeSeconds: ageSeconds,
      };
    }

    // An UNKNOWN build is not an agreeing build. On a deployed box the platform
    // always exposes the commit SHA, so a null means the identity is incomplete —
    // and "we could not tell" must never read as "they match".
    if (isDeployedEnvironment() && (!api.releaseSha || !worker.releaseSha)) {
      return {
        api,
        worker,
        match: false,
        reason: `Cannot establish which build is running (api=${api.releaseSha ?? "unknown"} worker=${worker.releaseSha ?? "unknown"}). On a deployed box the commit SHA must be present (RAILWAY_GIT_COMMIT_SHA / RELEASE_SHA). An unknown build cannot be certified as matching.`,
        workerHeartbeatAgeSeconds: ageSeconds,
      };
    }

    if (worker.releaseSha !== api.releaseSha) {
      return {
        api,
        worker,
        match: false,
        reason: `API and worker are running different builds (api=${api.releaseSha ?? "unknown"} worker=${worker.releaseSha ?? "unknown"}). Finish the deploy on both services before trusting the snapshots.`,
        workerHeartbeatAgeSeconds: ageSeconds,
      };
    }

    if (worker.environment !== api.environment) {
      return {
        api,
        worker,
        match: false,
        reason: `API and worker declare different environments (api=${api.environment} worker=${worker.environment}). One of them is not the box you think it is.`,
        workerHeartbeatAgeSeconds: ageSeconds,
      };
    }

    if (worker.fingerprint !== api.fingerprint) {
      const drift = (Object.keys(api) as Array<keyof PublishedIdentity>)
        .filter((k) => k !== "fingerprint" && k !== "publishedAt")
        .filter(
          (k) => JSON.stringify(api[k]) !== JSON.stringify(worker?.[k]),
        );
      return {
        api,
        worker,
        match: false,
        reason: `API and worker disagree on: ${drift.join(", ")}. The cron is writing snapshots this API will refuse to read. Align the EMOTIONAL_MAP_* variables on both Railway services and redeploy.`,
        workerHeartbeatAgeSeconds: ageSeconds,
      };
    }

    return {
      api,
      worker,
      match: true,
      reason: null,
      workerHeartbeatAgeSeconds: ageSeconds,
    };
  }
}
