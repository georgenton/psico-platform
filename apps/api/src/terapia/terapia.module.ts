import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "../prisma";
import { SubscriptionModule } from "../subscription";
import { TerapiaController } from "./terapia.controller";
import { TerapiaService } from "./terapia.service";
import { ConsoleVideoProvider } from "./providers/console-video.provider";
import { DailyVideoProvider } from "./providers/daily-video.provider";
import { DailyWebhookController } from "./daily-webhook.controller";
import { DailyWebhookService } from "./daily-webhook.service";
import { VIDEO_PROVIDER } from "./tokens";

/**
 * Terapia module — Sprints S62-S69.
 *
 * Sprint S69 introduces the DailyVideoProvider. The active provider is
 * selected by env `VIDEO_PROVIDER`:
 *   - "console" (default) → ConsoleVideoProvider stub (logs + fake URLs)
 *   - "daily"             → DailyVideoProvider (Daily.co REST API)
 *
 * Env schema's superRefine rejects daily without DAILY_API_KEY +
 * DAILY_DOMAIN, so by the time the factory runs the config is valid.
 */
@Module({
  imports: [PrismaModule, SubscriptionModule, ConfigModule],
  controllers: [TerapiaController, DailyWebhookController],
  providers: [
    TerapiaService,
    DailyWebhookService,
    ConsoleVideoProvider,
    DailyVideoProvider,
    {
      provide: VIDEO_PROVIDER,
      inject: [ConfigService, ConsoleVideoProvider, DailyVideoProvider],
      useFactory: (
        config: ConfigService,
        consoleProv: ConsoleVideoProvider,
        dailyProv: DailyVideoProvider,
      ) => {
        const choice = config.get<string>("VIDEO_PROVIDER") ?? "console";
        return choice === "daily" ? dailyProv : consoleProv;
      },
    },
  ],
  exports: [TerapiaService],
})
export class TerapiaModule {}
