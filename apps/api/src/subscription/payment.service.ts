import { Inject, Injectable, Logger } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import type { InvoiceSummary } from "@psico/types";
import type { Env } from "../config";
import type { BillingPlan } from "./dto/checkout-session.dto";
import type { CreatePortalSessionDto } from "./dto/create-portal-session.dto";
import type {
  CancelSubscriptionResult,
  CheckoutSessionResult,
  IPaymentProvider,
  PortalSessionResult,
  ReactivateSubscriptionResult,
  TherapyCheckoutOpts,
  TherapyCheckoutResult,
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

  // ─── Sprint S66.A ─────────────────────────────────────────────────────────

  createTherapyCheckout(
    opts: TherapyCheckoutOpts,
  ): Promise<TherapyCheckoutResult> {
    return this.selectProvider().createTherapyCheckout(opts);
  }

  // ─── Sprint S7 ─────────────────────────────────────────────────────────────

  listInvoices(userId: string, limit: number): Promise<InvoiceSummary[]> {
    return this.selectProvider().listInvoices(userId, limit);
  }

  cancelAtPeriodEnd(
    userId: string,
    reason?: string,
  ): Promise<CancelSubscriptionResult> {
    return this.selectProvider().cancelAtPeriodEnd(userId, reason);
  }

  reactivate(userId: string): Promise<ReactivateSubscriptionResult> {
    return this.selectProvider().reactivate(userId);
  }

  /**
   * Sprint S11. Reads the status of a Stripe Checkout session so the front
   * can render the `/dashboard/plan/success` page without polling.
   *
   * Throws if the active provider does not implement `getCheckoutSessionStatus`
   * — today only Stripe does. Payphone redirects through its own protocol
   * and never reaches `/api/billing/return`, so we keep this method
   * provider-bound rather than synthesising a fake status.
   */
  getCheckoutSessionStatus(sessionId: string): Promise<{
    status: "success" | "processing" | "failed";
    subscriptionId: string | null;
  }> {
    const provider = this.selectProvider();
    if (!provider.getCheckoutSessionStatus) {
      throw new Error(
        `Provider ${provider.name} does not support checkout session lookup.`,
      );
    }
    return provider.getCheckoutSessionStatus(sessionId);
  }
}
