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
 * Body for `POST /api/terapia/bookings` — Sprint S64 (book a therapy
 * session).
 *
 * The 3-step UX (modality → slot → confirm) collapses to ONE request to
 * the backend: by the time the user clicks "Confirm" the frontend has
 * everything. State between steps stays client-side.
 *
 * If another user takes the same slot in the meantime, the service
 * responds 409 `SLOT_TAKEN` and the UI re-fetches availability to let
 * the user pick again.
 */
export class CreateBookingDto {
  /**
   * Stable opaque ID of the therapist (UUID). The client gets it from
   * the directory or detail screens.
   */
  @IsString()
  @Length(1, 64)
  therapistId!: string;

  /**
   * ISO-8601 UTC timestamp of the slot start (e.g.
   * `"2026-06-15T14:30:00.000Z"`). The server validates the slot
   * exists in the therapist's published availability + isn't already
   * booked.
   */
  @IsDateString()
  slotIso!: string;

  /**
   * Session modality: `"INDIVIDUAL"` (1 client), `"COUPLE"` (2), or
   * `"FAMILY"` (3+). Affects the Stripe price + the video room
   * configuration (S65).
   */
  @IsIn(["INDIVIDUAL", "COUPLE", "FAMILY"])
  modality!: "INDIVIDUAL" | "COUPLE" | "FAMILY";

  /**
   * Optional ID from the catalog of first-time reasons (e.g.
   * "anxiety", "couples-counselling"). Helps the therapist prep before
   * the first session. Subsequent bookings can omit it.
   */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  firstReasonId?: string;

  /**
   * Session length in minutes (15–120). Defaults to the therapist's
   * default if omitted. Must match an available slot length.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(120)
  durationMin?: number;

  /**
   * Stripe Checkout success redirect URL. Not used in S64 (Stripe
   * wiring lands in S65); when present, S65's StripeProvider passes it
   * to `checkout.sessions.create`.
   */
  @IsOptional()
  @IsUrl({ require_tld: false })
  successUrl?: string;

  /**
   * Stripe Checkout cancel redirect URL. Same v1 status as
   * `successUrl` — passed through to Stripe in S65 when wired.
   */
  @IsOptional()
  @IsUrl({ require_tld: false })
  cancelUrl?: string;
}
