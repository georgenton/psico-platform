import { IsNotEmpty, IsString } from "class-validator";

/**
 * Query for `GET /api/billing/return?session_id=cs_xxx`.
 *
 * Stripe Checkout appends `session_id` to the configured `successUrl` when
 * the user completes payment. The frontend's success page hits this endpoint
 * once with the session_id to confirm the result without polling
 * `getMySubscription()` (which would race with the Stripe webhook).
 */
export class BillingReturnQueryDto {
  @IsString()
  @IsNotEmpty()
  session_id!: string;
}
