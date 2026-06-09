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

export interface TherapyCheckoutOpts {
  userId: string;
  sessionId: string;
  /** Final amount in `currency`. Stripe receives cents. */
  priceUsd: number;
  currency: string;
  /** Free text shown in the Stripe Checkout product line. */
  productName: string;
  successUrl: string;
  cancelUrl: string;
}

export interface TherapyCheckoutResult {
  url: string;
  stripeCheckoutSessionId: string;
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

  // ─── Sprint S66.A — one-time therapy payments ─────────────────────────────
  //
  // Stripe Checkout `mode: 'payment'`. Metadata `{ kind: 'therapy_booking',
  // sessionId }` so the webhook handler recognizes this flow and updates
  // `TherapySession.paymentStatus` instead of touching Subscription rows.
  //
  // Providers that legitimately cannot support one-time (e.g. PayphoneProvider
  // phase 1) should throw `NotImplementedException`.

  createTherapyCheckout(
    opts: TherapyCheckoutOpts,
  ): Promise<TherapyCheckoutResult>;

  // ─── Sprint S11 — checkout session lookup ──────────────────────────────────
  //
  // After Stripe Checkout completes, the user's browser is redirected to
  // /dashboard/plan/success with `session_id=cs_xxx` appended. The front
  // hits `GET /api/billing/return?session_id=...` once; this method does
  // the read against the provider so we can confirm payment without polling
  // /subscriptions/me (which would race the webhook).
  //
  // Implementations should not require the call to be idempotent — Stripe's
  // own `sessions.retrieve` is read-only and safe to call many times.

  getCheckoutSessionStatus?(sessionId: string): Promise<CheckoutSessionStatus>;

  // ─── Optional extension points ─────────────────────────────────────────────

  // Returns the normalized event type string from a raw webhook payload
  // without full processing — useful for logging and routing decisions.
  getWebhookEventType?(rawBody: Buffer, signature: string): string;

  // Returns false for one-time payment providers (e.g. Payphone in Phase 1).
  supportsRecurring?(): boolean;
}

export interface CheckoutSessionStatus {
  /**
   * "success" — payment captured, subscription is active or trialing.
   * "processing" — Stripe still processing (async methods like bank xfer).
   *   The front should retry on the next visit.
   * "failed" — payment declined or session expired.
   */
  status: "success" | "processing" | "failed";
  /** Provider-side subscription id, if one was created. */
  subscriptionId: string | null;
}

// Injection token used to register/retrieve providers in NestJS DI.
export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");
