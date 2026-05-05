import type { BillingPlan } from "../dto/checkout-session.dto";
import type { CreatePortalSessionDto } from "../dto/create-portal-session.dto";

export interface CheckoutSessionResult {
  url: string;
}

export interface PortalSessionResult {
  url: string;
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

  // ─── Optional extension points ─────────────────────────────────────────────

  // Returns the normalized event type string from a raw webhook payload
  // without full processing — useful for logging and routing decisions.
  getWebhookEventType?(rawBody: Buffer, signature: string): string;

  // Returns false for one-time payment providers (e.g. Payphone in Phase 1).
  supportsRecurring?(): boolean;
}

// Injection token used to register/retrieve providers in NestJS DI.
export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");
