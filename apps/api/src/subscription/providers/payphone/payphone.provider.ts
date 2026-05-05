import { Injectable, NotImplementedException } from "@nestjs/common";
import type { BillingPlan } from "../../dto/checkout-session.dto";
import type { CreatePortalSessionDto } from "../../dto/create-portal-session.dto";
import type {
  CheckoutSessionResult,
  IPaymentProvider,
  PortalSessionResult,
} from "../payment-provider.interface";

/**
 * Payphone Ecuador — Phase 2 stub.
 *
 * Real integration reference:
 *   Checkout endpoint : POST https://pay.pagomedios.com/api/button/pay
 *   Auth              : AppId + AppSecret in Authorization header (Bearer token)
 *   Webhook           : POST to our endpoint; verified by a shared token sent
 *                       in the X-PayPhone-Token header (compare against env var
 *                       PAYPHONE_WEBHOOK_TOKEN).
 *   Docs              : https://developers.payphone.com.ec/
 *
 * Payphone is a one-time-payment gateway (no native recurring billing).
 * supportsRecurring() returns false; our PaymentService skips portal for it.
 *
 * TODO senior: implement Payphone API integration for Phase 2 (Ecuador market).
 *   Steps:
 *   1. Add PAYPHONE_APP_ID + PAYPHONE_APP_SECRET + PAYPHONE_WEBHOOK_TOKEN to Env schema.
 *   2. Create PayphoneCheckoutDto and PayphoneWebhookDto.
 *   3. Implement createCheckoutSession() — call /api/button/pay, return redirectUrl.
 *   4. Implement handleWebhook() — verify X-PayPhone-Token, upsert subscription.
 *   5. createPortalSession() may stay NotImplemented (no self-serve portal in Payphone).
 */
@Injectable()
export class PayphoneProvider implements IPaymentProvider {
  readonly name = "payphone";

  async createCheckoutSession(
    _userId: string,
    _billingPlan: BillingPlan,
    _successUrl: string,
    _cancelUrl: string,
  ): Promise<CheckoutSessionResult> {
    throw new NotImplementedException(
      "Payphone checkout not yet implemented — Phase 2",
    );
  }

  async createPortalSession(
    _userId: string,
    _dto: CreatePortalSessionDto,
  ): Promise<PortalSessionResult> {
    // Payphone has no self-serve billing portal equivalent.
    throw new NotImplementedException(
      "Payphone does not support a billing portal",
    );
  }

  async handleWebhook(_rawBody: Buffer, _signature: string): Promise<void> {
    throw new NotImplementedException(
      "Payphone webhook handler not yet implemented — Phase 2",
    );
  }

  getWebhookEventType(_rawBody: Buffer, _signature: string): string {
    // TODO senior: parse the Payphone payload and return a normalized event type.
    return "payphone.unknown";
  }

  supportsRecurring(): boolean {
    return false;
  }
}
