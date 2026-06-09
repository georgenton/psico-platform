import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma";
import { SubscriptionModule } from "../subscription";
import { TerapiaController } from "./terapia.controller";
import { TerapiaService } from "./terapia.service";
import { ConsoleVideoProvider } from "./providers/console-video.provider";
import { VIDEO_PROVIDER } from "./tokens";

/**
 * Terapia module — Sprints S62 / S63 / S64 / S65.
 *
 * Currently binds VIDEO_PROVIDER to ConsoleVideoProvider (stub). Cuando
 * Daily.co credentials se provisionen, swap a DailyVideoProvider en una
 * sola línea (mismo patrón que APNs, ADR 0014).
 */
@Module({
  imports: [PrismaModule, SubscriptionModule],
  controllers: [TerapiaController],
  providers: [
    TerapiaService,
    ConsoleVideoProvider,
    {
      provide: VIDEO_PROVIDER,
      useExisting: ConsoleVideoProvider,
    },
  ],
  exports: [TerapiaService],
})
export class TerapiaModule {}
