import { IsUrl } from "class-validator";

/**
 * Body for `POST /api/billing/customer-portal` — open Stripe's hosted
 * billing portal so the user can manage payment methods, view past
 * invoices, and cancel from Stripe-side if they prefer.
 *
 * Returns a one-shot Stripe URL the front redirects to. After the user
 * finishes managing their subscription, Stripe redirects them to
 * `returnUrl`. Web uses the dashboard; mobile uses a deep link that
 * opens the app back to Mi Plan.
 */
export class CreatePortalSessionDto {
  /**
   * Where Stripe should redirect after the user closes the portal.
   * Web: `/dashboard/plan`. Mobile: a Universal Link / deep link back
   * to `(tabs)/plan`. The session is single-use — Stripe burns it
   * when the user finishes.
   */
  @IsUrl({}, { message: "returnUrl must be a valid URL" })
  returnUrl!: string;
}
