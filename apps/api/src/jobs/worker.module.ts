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
// Círculos · account deletion ends a person's live participation before the
// account row is removed. The minimal module, not CirclesModule: no
// controllers, no rollout guards, no cipher.
import { CirclesAccountDeletionModule } from "../circles/circles-account-deletion.module";
import { CirclesSweepProcessor } from "./processors/circles-sweep.processor";
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

/**
 * Every queue this process consumes — the registration AND what boot prints.
 *
 * The banner in `worker.ts` used to name four of these from a hand-written
 * string, and had not been touched in seven sprints' worth of new queues. So a
 * worker that was in fact running the Círculos sweep logged a list that did not
 * mention it, and an operator checking the sweep during a pilot shutdown would
 * have read that log and concluded it was not running.
 *
 * A list that is simultaneously the registration and the thing printed cannot
 * disagree with itself. That is the only reason this is a constant.
 */
export const WORKER_QUEUES: readonly string[] = [
  QueueName.EMAIL,
  QueueName.DATA_EXPORT,
  QueueName.ACCOUNT_DELETION,
  QueueName.DAILY_USAGE,
  // Sprint S44 — notification queues.
  QueueName.WEEKLY_DIGEST,
  QueueName.INACTIVE_NUDGE,
  // Sprint S46 — weekly summary pre-generation queue.
  QueueName.WEEKLY_SUMMARY_GENERATION,
  // Sprint S50 — platform-wide daily snapshot queue.
  QueueName.PLATFORM_SNAPSHOT,
  // Sprint S51 — weekly cohort retention queue.
  QueueName.COHORT_RETENTION,
  // Sprint G2 — monthly emotional-map snapshot queue.
  QueueName.EMOTIONAL_MAP_SNAPSHOT,
  // Círculos — the temporal sweep. Inert while the rollout is off.
  QueueName.CIRCLES_SWEEP,
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    PrismaModule,
    RedisModule,
    StorageModule,
    NotificationsModule,
    PatronesModule,
    CirclesAccountDeletionModule,
    // Sprint G2 — needed by EmotionalMapSnapshotProcessor.
    EmotionalMapModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: createBullConnection(config),
      }),
    }),
    BullModule.registerQueue(...WORKER_QUEUES.map((name) => ({ name }))),
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
    // Círculos — expiry and follow-up transitions.
    CirclesSweepProcessor,
    // Sprint G2 — monthly emotional-map snapshot.
    EmotionalMapSnapshotProcessor,
  ],
})
export class WorkerAppModule {}
