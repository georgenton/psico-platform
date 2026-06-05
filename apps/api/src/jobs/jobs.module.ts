import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import { JobsService } from "./jobs.service";
import { QueueName } from "./queue-names";
import type { Env } from "../config";

/**
 * Wires BullMQ + registers all queues used by the platform.
 *
 * Configuration:
 *  - Shared Redis connection (reuses REDIS_URL — same Redis instance used
 *    by the Throttler and Idempotency cache).
 *  - In dev without REDIS_URL, BullMQ connects to localhost:6379 — typically
 *    `docker run redis` for E2E worker testing. The API alone (no worker)
 *    works fine with ioredis-mock from `RedisModule`; only full producer
 *    + consumer flows need a real Redis.
 *
 * Three queues registered globally so any service can enqueue without
 * importing JobsModule explicitly.
 *
 * @Global — only because JobsService is injected from several feature
 * modules (UsersService today; AIService, TerapiaService, AutorService
 * in future sprints).
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = config.get("REDIS_URL", { infer: true });
        // BullMQ accepts a URL or a connection object. When REDIS_URL is
        // unset (dev without `docker run redis`), default to localhost.
        return {
          connection: url ? { url } : { host: "127.0.0.1", port: 6379 },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QueueName.EMAIL },
      { name: QueueName.DATA_EXPORT },
      { name: QueueName.ACCOUNT_DELETION },
      { name: QueueName.DAILY_USAGE },
      // Sprint S44 — notification schedulers.
      { name: QueueName.WEEKLY_DIGEST },
      { name: QueueName.INACTIVE_NUDGE },
      // Sprint S46 — pre-generate WeeklySummary so the Monday digest finds it.
      { name: QueueName.WEEKLY_SUMMARY_GENERATION },
    ),
  ],
  providers: [JobsService],
  exports: [JobsService, BullModule],
})
export class JobsModule {}
