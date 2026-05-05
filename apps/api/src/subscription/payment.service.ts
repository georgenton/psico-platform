import { Inject, Injectable, Logger } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config";
import type { BillingPlan } from "./dto/checkout-session.dto";
import type { CreatePortalSessionDto } from "./dto/create-portal-session.dto";
import type {
  CheckoutSessionResult,
  IPaymentProvider,
  PortalSessionResult,
} from "./providers/payment-provider.interface";
import {
  PAYPHONE_PROVIDER,
  STRIPE_PROVIDER,
} from "./providers/provider-tokens";

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @Inject(STRIPE_PROVIDER) private readonly stripeProvider: IPaymentProvider,
    @Inject(PAYPHONE_PROVIDER)
    private readonly payphoneProvider: IPaymentProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ─── Provider selection ────────────────────────────────────────────────────

  /**
   * Selects the active payment provider.
   *
   * Phase 1: always returns Stripe — DEFAULT_PAYMENT_PROVIDER=stripe.
   * Phase 2: switch to PayphoneProvider for Ecuadorian users when
   *          DEFAULT_PAYMENT_PROVIDER=payphone or when country logic
   *          is added here.
   */
  selectProvider(): IPaymentProvider {
    const defaultProvider = this.config.get("DEFAULT_PAYMENT_PROVIDER", {
      infer: true,
    });

    if (defaultProvider === "payphone") {
      this.logger.debug(
        "Using PayphoneProvider (DEFAULT_PAYMENT_PROVIDER=payphone)",
      );
      return this.payphoneProvider;
    }

    return this.stripeProvider;
  }

  // ─── Delegation ────────────────────────────────────────────────────────────

  createCheckoutSession(
    userId: string,
    billingPlan: BillingPlan,
    successUrl: string,
    cancelUrl: string,
  ): Promise<CheckoutSessionResult> {
    return this.selectProvider().createCheckoutSession(
      userId,
      billingPlan,
      successUrl,
      cancelUrl,
    );
  }

  createPortalSession(
    userId: string,
    dto: CreatePortalSessionDto,
  ): Promise<PortalSessionResult> {
    return this.selectProvider().createPortalSession(userId, dto);
  }

  handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    return this.selectProvider().handleWebhook(rawBody, signature);
  }
}
