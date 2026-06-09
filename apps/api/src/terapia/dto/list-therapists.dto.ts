import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";

/**
 * Query for GET /api/terapia/therapists — Sprint S63.
 *
 * All filters are optional. Pagination defaults to page=1, pageSize=20.
 *
 * Sort options:
 *   - "rating"    → avgRating desc (default)
 *   - "price-asc" → priceUsd asc
 *   - "price-desc"→ priceUsd desc
 *   - "popular"   → popularity desc (curated by ops)
 */
export class ListTherapistsDto {
  @IsOptional()
  @IsString()
  @Length(1, 32)
  motivo?: string;

  @IsOptional()
  @IsIn(["INDIVIDUAL", "COUPLE", "FAMILY"])
  modalidad?: "INDIVIDUAL" | "COUPLE" | "FAMILY";

  @IsOptional()
  @IsString()
  @Length(1, 32)
  genero?: string;

  @IsOptional()
  @IsString()
  @Length(2, 8)
  language?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  priceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  priceMax?: number;

  @IsOptional()
  @IsIn(["rating", "price-asc", "price-desc", "popular"])
  sort?: "rating" | "price-asc" | "price-desc" | "popular";

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
  @Max(100)
  @Transform(({ value }) => (value === undefined ? 20 : Number(value)))
  pageSize?: number;
}
