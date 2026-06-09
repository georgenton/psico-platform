import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from "class-validator";

/**
 * Body for POST /api/terapia/bookings — Sprint S64.
 *
 * The 3-step UX (modality → slot → confirm) collapses to ONE request to
 * the backend: by the time the user clicks "Confirm" the frontend has
 * everything. State between steps stays client-side.
 *
 * `successUrl` and `cancelUrl` are optional because Stripe is NOT wired
 * yet in S64 (lands in S65). When present, S65's StripeProvider will
 * pass them to checkout.sessions.create.
 */
export class CreateBookingDto {
  @IsString()
  @Length(1, 64)
  therapistId!: string;

  @IsDateString()
  slotIso!: string;

  @IsIn(["INDIVIDUAL", "COUPLE", "FAMILY"])
  modality!: "INDIVIDUAL" | "COUPLE" | "FAMILY";

  @IsOptional()
  @IsString()
  @Length(1, 64)
  firstReasonId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(120)
  durationMin?: number;

  @IsOptional()
  @IsUrl({ require_tld: false })
  successUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  cancelUrl?: string;
}
