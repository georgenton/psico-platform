import { IsUrl } from "class-validator";

/**
 * Body for POST /api/terapia/bookings/:id/retry-checkout — Sprint S66.B.
 *
 * Issues a fresh Stripe Checkout session for an existing TherapySession
 * that's still PENDING. Used when the initial Stripe call failed at
 * createBooking time, or when the user closed the Checkout tab without
 * paying and wants to retry.
 */
export class RetryCheckoutDto {
  @IsUrl({ require_tld: false })
  successUrl!: string;

  @IsUrl({ require_tld: false })
  cancelUrl!: string;
}
