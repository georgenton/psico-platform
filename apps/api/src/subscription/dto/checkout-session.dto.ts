import { IsEnum, IsUrl } from "class-validator";

/**
 * Plan tiers that can be purchased via Stripe Checkout.
 *
 * - `PRO_MONTHLY` — $7/mo, recurring
 * - `PRO_YEARLY` — $59/yr, recurring (the anchor offer)
 * - `B2B` — $120+/mo, recurring (sales-assisted; price negotiated)
 */
export enum BillingPlan {
  PRO_MONTHLY = "PRO_MONTHLY",
  PRO_YEARLY = "PRO_YEARLY",
  B2B = "B2B",
}

/**
 * Body for `POST /api/billing/checkout-session` — start a Stripe
 * Checkout session for the desired plan.
 *
 * The server creates a Stripe Checkout session with our `STRIPE_*_PRICE_ID`
 * for the plan and returns the URL. The client redirects (web) or opens
 * an in-app browser (mobile) to complete payment.
 *
 * On completion Stripe redirects to `successUrl?session_id=...`; the
 * front then calls `GET /api/billing/return?session_id=...` to confirm
 * status (paid / processing / failed). The webhook is the canonical
 * write path — this callback is just for UX confirmation.
 */
export class CreateCheckoutSessionDto {
  /**
   * Plan tier to purchase. Plugin emits the enum in OpenAPI.
   */
  @IsEnum(BillingPlan)
  billingPlan!: BillingPlan;

  /**
   * Where Stripe should redirect after successful payment. Stripe
   * appends `?session_id=...` automatically. The front passes that to
   * `/billing/return` to confirm.
   */
  @IsUrl({}, { message: "successUrl must be a valid URL" })
  successUrl!: string;

  /**
   * Where Stripe should redirect if the user aborts payment. No state
   * change happens; the front can just return the user to the plan
   * picker.
   */
  @IsUrl({}, { message: "cancelUrl must be a valid URL" })
  cancelUrl!: string;
}
