import "reflect-metadata";
// Sentry first — same rationale as main.ts.
import { initSentry } from "./observability/sentry";
initSentry();

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WorkerAppModule } from "./jobs/worker.module";

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
  logger.log("Awaiting jobs from Redis…");

  // Don't `await app.close()` here — the worker stays alive until SIGTERM.
  // The shutdown hooks above handle that path.
}

void bootstrap();
