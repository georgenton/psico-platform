import { Transform, Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";

/**
 * Query for GET /api/terapia/notifications — Sprint S66.B.
 */
export class ListNotificationsDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? value === "true" : Boolean(value),
  )
  @IsBoolean()
  unread?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => (value === undefined ? 20 : Number(value)))
  limit?: number;
}
