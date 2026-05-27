import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Optional free-text reason captured for retention analytics. We cap the
 * length to avoid abuse (someone POSTing a 1MB string) and to keep the
 * Stripe metadata under its own 500-char per-value limit.
 */
const MAX_REASON_LEN = 480;

export class CancelSubscriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_REASON_LEN)
  reason?: string;
}
