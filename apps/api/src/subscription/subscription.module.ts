import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma";
import { PaymentService } from "./payment.service";
import { PayphoneProvider } from "./providers/payphone/payphone.provider";
import {
  PAYPHONE_PROVIDER,
  STRIPE_PROVIDER,
} from "./providers/provider-tokens";
import { StripeProvider } from "./providers/stripe/stripe.provider";
import { SubscriptionController } from "./subscription.controller";
import { SubscriptionService } from "./subscription.service";
import { UsageService } from "./usage.service";

@Module({
  imports: [PrismaModule],
  controllers: [SubscriptionController],
  providers: [
    { provide: STRIPE_PROVIDER, useClass: StripeProvider },
    { provide: PAYPHONE_PROVIDER, useClass: PayphoneProvider },
    PaymentService,
    SubscriptionService,
    UsageService,
  ],
  exports: [SubscriptionService, UsageService],
})
export class SubscriptionModule {}
