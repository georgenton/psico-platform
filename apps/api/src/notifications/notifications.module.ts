import { Global, Module } from "@nestjs/common";
import { ResendService } from "./resend.service";

/**
 * NotificationsModule centralizes all outbound user-facing communication.
 *
 * Today: transactional email via Resend.
 *
 * Future:
 *  - Push notifications (S27) — APNs / FCM via expo-server-sdk.
 *  - In-app notifications (S18 · TerapiaModule) — DB-backed feed.
 *  - SMS (post-v1) — Twilio if a use case appears.
 *
 * @Global so any feature module can inject ResendService without re-importing.
 */
@Global()
@Module({
  providers: [ResendService],
  exports: [ResendService],
})
export class NotificationsModule {}
