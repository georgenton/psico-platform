import { Transform, Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

/**
 * Query for GET /api/terapia/therapists/:id/availability — Sprint S64.
 *
 * Projects the therapist's recurring weekly availability onto the next
 * `days` calendar days starting today (UTC). Subtracts slots already
 * taken by existing SCHEDULED/IN_PROGRESS sessions.
 *
 * Defaults: days=14, slotMin=60 (one start time per hour). v1 doesn't
 * allow custom slot durations from the client — the design's "30 min vs
 * 50 min" picker lives in the booking step, not here.
 */
export class AvailabilityDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  @Transform(({ value }) => (value === undefined ? 14 : Number(value)))
  days?: number;
}
