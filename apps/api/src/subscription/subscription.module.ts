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

@Module({
  imports: [PrismaModule],
  controllers: [SubscriptionController],
  providers: [
    { provide: STRIPE_PROVIDER, useClass: StripeProvider },
    { provide: PAYPHONE_PROVIDER, useClass: PayphoneProvider },
    PaymentService,
    SubscriptionService,
  ],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
