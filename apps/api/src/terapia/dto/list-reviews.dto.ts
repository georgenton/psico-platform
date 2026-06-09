import { Transform, Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

/**
 * Query for GET /api/terapia/therapists/:id/reviews — Sprint S63.
 */
export class ListReviewsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Transform(({ value }) => (value === undefined ? 1 : Number(value)))
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @Transform(({ value }) => (value === undefined ? 10 : Number(value)))
  pageSize?: number;
}
