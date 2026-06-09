import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma";
import { LiveActivitiesController } from "./live-activities.controller";
import { LiveActivitiesService } from "./live-activities.service";
import { ConsoleApnsProvider } from "./providers/console-apns.provider";
import { APNS_PROVIDER } from "./tokens";

/**
 * Live Activities (iOS 16.1+ Dynamic Island) — Sprint E.5.
 *
 * Currently bound to ConsoleApnsProvider (no-op stub). Swap to the real
 * `Apns2Provider` (lib `apns2`) when:
 *   1. Apple Developer account is provisioned.
 *   2. `.p8` push key + Team ID + Bundle ID are added to Railway envs.
 *   3. Mobile app is prebuilt with a Live Activity widget extension.
 *
 * The interface (`IApnsProvider`) is stable so swapping is a one-liner
 * in this module's `providers` array.
 *
 * Not @Global() — only the eventual jobs that push live updates need it,
 * and they import LiveActivitiesModule explicitly.
 */
@Module({
  imports: [PrismaModule],
  controllers: [LiveActivitiesController],
  providers: [
    LiveActivitiesService,
    ConsoleApnsProvider,
    {
      provide: APNS_PROVIDER,
      useExisting: ConsoleApnsProvider,
    },
  ],
  exports: [LiveActivitiesService],
})
export class LiveActivitiesModule {}
