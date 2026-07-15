import "reflect-metadata";
// Sentry first — same rationale as main.ts.
import { initSentry } from "./observability/sentry";
initSentry();

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { Redis } from "ioredis";
import { WorkerAppModule } from "./jobs/worker.module";
import { assertEmotionalMapConfigured } from "./emotional-map/cache-identity";
import { MapIdentityService } from "./health/map-identity.service";
import { REDIS_CLIENT } from "./redis";

/**
 * Worker entry point — same codebase as the API, different process.
 *
 * Deploys to Railway as a separate service whose start command is
 * `node dist/worker` (vs the API's `node dist/main`). Both services share
 * the same env vars and connect to the same Postgres + Redis.
 *
 * `createApplicationContext` boots Nest without an HTTP listener — the
 * worker has no public surface, only BullMQ consumers that pull from Redis.
 *
 * Graceful shutdown: BullMQ workers register their own signal handlers
 * when the @nestjs/bullmq processors instantiate. SIGTERM lets in-flight
 * jobs finish before exit.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger("WorkerBootstrap");

  // PR-0.1 — refuse to boot with a missing/malformed epoch or a critical safety
  // flag out of position. A worker on a different epoch than the API writes
  // snapshots the API silently refuses to read; failing loudly here beats
  // discovering that weeks later.
  assertEmotionalMapConfigured();

  const app = await NestFactory.createApplicationContext(WorkerAppModule, {
    // Slightly less chatty than the API — workers run quietly in the background.
    logger: ["log", "warn", "error"],
  });

  // Wire shutdown hooks so Nest's onModuleDestroy / onApplicationShutdown
  // fire on SIGTERM / SIGINT — Prisma closes its connection pool, BullMQ
  // workers stop accepting new jobs and drain.
  app.enableShutdownHooks();

  logger.log(
    "Worker started · processors: email, data-export, account-deletion, daily-usage",
  );

  // Publish the emotional-map identity so `GET /api/health/emotional-map` can
  // prove the API and this worker agree. Same code does NOT imply same config:
  // these are two Railway services with two environments.
  MapIdentityService.startHeartbeat(app.get<Redis>(REDIS_CLIENT), "worker", logger);

  logger.log("Awaiting jobs from Redis…");

  // Don't `await app.close()` here — the worker stays alive until SIGTERM.
  // The shutdown hooks above handle that path.
}

void bootstrap();
