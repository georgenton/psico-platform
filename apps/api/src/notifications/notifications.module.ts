import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma";
import { DevicesController } from "./devices.controller";
import { PushService } from "./push.service";
import { ResendService } from "./resend.service";

/**
 * NotificationsModule centralizes all outbound user-facing communication.
 *
 * - Sprint S2: transactional email via Resend (verify, password reset).
 * - Sprint S43: push notifications via Expo Push API + DevicesController
 *   for token registration; weekly-digest email + inactive-nudge push
 *   processors live in apps/api/src/jobs.
 *
 * Future:
 *  - Web push (VAPID) — design says post-v1.
 *  - In-app notifications (S18 · TerapiaModule) — DB-backed feed.
 *
 * @Global so any feature module can inject ResendService / PushService
 * without re-importing.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [DevicesController],
  providers: [ResendService, PushService],
  exports: [ResendService, PushService],
})
export class NotificationsModule {}
