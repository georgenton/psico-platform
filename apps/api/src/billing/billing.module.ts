import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma";
import { SubscriptionModule } from "../subscription";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { PlanController } from "./plan.controller";
import { PlanService } from "./plan.service";

/**
 * Sprint S11. Mounts `/api/billing/*` and `/api/plan` per design
 * 09-plan.md, delegating to the same SubscriptionService that the legacy
 * `/api/subscriptions/*` controller already uses.
 *
 * The legacy SubscriptionModule stays imported and active for the 90-day
 * deprecation window (ADR 0006). When that closes, the SubscriptionModule
 * can be retired and its services moved into this module without changing
 * any consumer.
 */
@Module({
  imports: [PrismaModule, SubscriptionModule],
  controllers: [BillingController, PlanController],
  providers: [BillingService, PlanService],
})
export class BillingModule {}
