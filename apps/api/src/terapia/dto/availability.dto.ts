import { Transform, Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

/**
 * Query params for `GET /api/terapia/therapists/:id/availability` —
 * Sprint S64.
 *
 * Projects the therapist's recurring weekly availability onto the next
 * `days` calendar days starting today (UTC). The service subtracts
 * slots already taken by existing `SCHEDULED` / `IN_PROGRESS` sessions
 * so the response shows only bookable slots.
 *
 * v1 doesn't allow custom slot durations from the client — the design's
 * "30 min vs 50 min" picker lives in the booking step, not here. The
 * `60`-min default keeps the response shape tight.
 */
export class AvailabilityDto {
  /**
   * How many calendar days forward to project (1–30). Default 14 when
   * omitted — matches the 2-week therapist booking horizon in the
   * design. The `Transform` decorator coerces the query string to a
   * number and applies the default if absent.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  @Transform(({ value }) => (value === undefined ? 14 : Number(value)))
  days?: number;
}
