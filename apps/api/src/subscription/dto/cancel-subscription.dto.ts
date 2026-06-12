import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Cap the reason length to avoid abuse (someone POSTing a 1MB string)
 * and stay under Stripe's 500-char per-metadata-value limit.
 */
const MAX_REASON_LEN = 480;

/**
 * Body for `POST /api/billing/cancel` — cancel the active subscription
 * at the end of the current billing period.
 *
 * The call is idempotent: re-cancelling a subscription already marked
 * for cancellation is a no-op. The user retains Pro access until the
 * period end; `POST /api/billing/reactivate` reverses the decision while
 * the period is still active.
 *
 * Cancel reason is recorded in Stripe `subscription.metadata.cancelReason`
 * for retention analytics — surface in Pulso when we get 50–100 cancels
 * to spot patterns.
 */
export class CancelSubscriptionDto {
  /**
   * Optional free-text reason the user typed in the cancel modal.
   * Capped at 480 chars (Stripe metadata cap). Not validated for
   * sentiment / category — analytics teams categorize later.
   */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_REASON_LEN)
  reason?: string;
}
