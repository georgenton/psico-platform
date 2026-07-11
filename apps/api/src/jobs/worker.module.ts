import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { validate } from "../config";
import { PrismaModule } from "../prisma";
import { RedisModule } from "../redis";
import { StorageModule } from "../storage";
import { NotificationsModule } from "../notifications";
// Sprint S46 — PatronesModule wires the LLM-backed regenerator the worker
// reuses. Imports cascade so AIModule (Anthropic SDK) loads here too.
import { PatronesModule } from "../patrones/patrones.module";
// Sprint G2 — EmotionalMapModule provides the service the monthly
// snapshot processor reuses to recompute each user's score.
import { EmotionalMapModule } from "../emotional-map/emotional-map.module";
import { createBullConnection } from "./bull-connection";
import { QueueName } from "./queue-names";
import { EmailProcessor } from "./processors/email.processor";
import { DataExportProcessor } from "./processors/data-export.processor";
import { AccountDeletionProcessor } from "./processors/account-deletion.processor";
import { DailyUsageProcessor } from "./processors/daily-usage.processor";
import { WeeklyDigestProcessor } from "./processors/weekly-digest.processor";
import { InactiveNudgeProcessor } from "./processors/inactive-nudge.processor";
import { WeeklySummaryGenerationProcessor } from "./processors/weekly-summary.processor";
import { PlatformSnapshotProcessor } from "./processors/platform-snapshot.processor";
import { CohortRetentionProcessor } from "./processors/cohort-retention.processor";
import { EmotionalMapSnapshotProcessor } from "./processors/emotional-map-snapshot.processor";
import type { Env } from "../config";

/**
 * Module loaded ONLY by the worker process (`worker.ts` entry point).
 *
 * Crucial difference vs AppModule:
 *  - NO controllers (no HTTP server).
 *  - NO ThrottlerModule, NO Swagger, NO IdempotencyInterceptor — those are
 *    request-pipeline concerns the worker never has.
 *  - YES BullMQ + processors.
 *  - YES the shared infrastructure modules the processors need
 *    (Prisma, Redis, Storage, Notifications).
 *
 * Why this is a separate module rather than reusing AppModule:
 *  - Worker boot time stays small.
 *  - No HTTP port collision when API + worker run on the same host in dev.
 *  - Easier to reason about — opening this file tells you exactly what
 *    the worker can do.
 *
 * Why `BullModule.registerQueue` even though processors don't directly use
 * the `Queue` instances: `@Processor()` decorator under @nestjs/bullmq
 * registers a Worker (consumer) on the underlying BullMQ Queue, and
 * `registerQueue` is what wires up the Queue providers behind the scenes.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    PrismaModule,
    RedisModule,
    StorageModule,
    NotificationsModule,
    PatronesModule,
    // Sprint G2 — needed by EmotionalMapSnapshotProcessor.
    EmotionalMapModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: createBullConnection(config),
      }),
    }),
    BullModule.registerQueue(
      { name: QueueName.EMAIL },
      { name: QueueName.DATA_EXPORT },
      { name: QueueName.ACCOUNT_DELETION },
      { name: QueueName.DAILY_USAGE },
      // Sprint S44 — notification queues.
      { name: QueueName.WEEKLY_DIGEST },
      { name: QueueName.INACTIVE_NUDGE },
      // Sprint S46 — weekly summary pre-generation queue.
      { name: QueueName.WEEKLY_SUMMARY_GENERATION },
      // Sprint S50 — platform-wide daily snapshot queue.
      { name: QueueName.PLATFORM_SNAPSHOT },
      // Sprint S51 — weekly cohort retention queue.
      { name: QueueName.COHORT_RETENTION },
      // Sprint G2 — monthly emotional-map snapshot queue.
      { name: QueueName.EMOTIONAL_MAP_SNAPSHOT },
    ),
  ],
  providers: [
    EmailProcessor,
    DataExportProcessor,
    AccountDeletionProcessor,
    DailyUsageProcessor,
    // Sprint S44 — notification processors.
    WeeklyDigestProcessor,
    InactiveNudgeProcessor,
    // Sprint S46 — pre-generation of WeeklySummary so digest finds the row.
    WeeklySummaryGenerationProcessor,
    // Sprint S50 — platform-wide daily snapshot for Pulso time series.
    PlatformSnapshotProcessor,
    // Sprint S51 — weekly cohort retention recomputation.
    CohortRetentionProcessor,
    // Sprint G2 — monthly emotional-map snapshot.
    EmotionalMapSnapshotProcessor,
  ],
})
export class WorkerAppModule {}
