import type { InvoiceSummary } from "@psico/types";
import type { BillingPlan } from "../dto/checkout-session.dto";
import type { CreatePortalSessionDto } from "../dto/create-portal-session.dto";

export interface CheckoutSessionResult {
  url: string;
}

export interface PortalSessionResult {
  url: string;
}

export interface CancelSubscriptionResult {
  cancelAtPeriodEnd: true;
  /** When the user's access ends (currentPeriodEnd from Stripe). */
  effectiveAt: Date;
}

export interface ReactivateSubscriptionResult {
  cancelAtPeriodEnd: false;
}

export interface IPaymentProvider {
  readonly name: string;

  // ─── Core methods (required) ───────────────────────────────────────────────

  createCheckoutSession(
    userId: string,
    billingPlan: BillingPlan,
    successUrl: string,
    cancelUrl: string,
  ): Promise<CheckoutSessionResult>;

  createPortalSession(
    userId: string,
    dto: CreatePortalSessionDto,
  ): Promise<PortalSessionResult>;

  handleWebhook(rawBody: Buffer, signature: string): Promise<void>;

  // ─── Sprint S7 — billing surface (required for all providers) ──────────────
  //
  // These mirror what the front needs for Mi Plan: invoice history, cancel
  // at period end, reactivate. A provider that legitimately cannot support
  // one (e.g. a future one-time-payment provider with no recurring billing
  // surface) should throw NotImplementedException; PaymentService delegates
  // the choice of provider.

  listInvoices(userId: string, limit: number): Promise<InvoiceSummary[]>;

  cancelAtPeriodEnd(
    userId: string,
    reason?: string,
  ): Promise<CancelSubscriptionResult>;

  reactivate(userId: string): Promise<ReactivateSubscriptionResult>;

  // ─── Optional extension points ─────────────────────────────────────────────

  // Returns the normalized event type string from a raw webhook payload
  // without full processing — useful for logging and routing decisions.
  getWebhookEventType?(rawBody: Buffer, signature: string): string;

  // Returns false for one-time payment providers (e.g. Payphone in Phase 1).
  supportsRecurring?(): boolean;
}

// Injection token used to register/retrieve providers in NestJS DI.
export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");
