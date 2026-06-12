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
 * Query params for `GET /api/terapia/therapists` — Sprint S63.
 *
 * Public therapist directory. All filters optional; combined with AND
 * semantics. Pagination defaults to `page=1`, `pageSize=20`.
 *
 * Sort options:
 * - `rating` → average rating desc (default)
 * - `price-asc` / `price-desc` → priceUsd ascending/descending
 * - `popular` → curated popularity score from ops
 */
export class ListTherapistsDto {
  /**
   * Catalog ID of a primary motive (e.g. `"anxiety"`). Filters to
   * therapists who declare expertise in that motive. Max 32 chars
   * for opaque IDs.
   */
  @IsOptional()
  @IsString()
  @Length(1, 32)
  motivo?: string;

  /**
   * Therapy modality the user wants: `"INDIVIDUAL"`, `"COUPLE"`, or
   * `"FAMILY"`. Filters to therapists who offer that modality.
   * Plugin emits the enum in OpenAPI.
   */
  @IsOptional()
  @IsIn(["INDIVIDUAL", "COUPLE", "FAMILY"])
  modalidad?: "INDIVIDUAL" | "COUPLE" | "FAMILY";

  /**
   * Catalog ID of a preferred therapist gender (e.g. `"female"`,
   * `"male"`, `"non-binary"`). Surfaces in the design as "preferencia
   * de género del terapeuta".
   */
  @IsOptional()
  @IsString()
  @Length(1, 32)
  genero?: string;

  /**
   * ISO-639-1 language code (e.g. `"es"`, `"en"`) the therapist
   * speaks. 2–8 chars to accept variants like `"es-419"`.
   */
  @IsOptional()
  @IsString()
  @Length(2, 8)
  language?: string;

  /**
   * Minimum session price in USD cents-resolved-to-units (0–10000).
   * Combined with `priceMax` for ranges.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  priceMin?: number;

  /**
   * Maximum session price in USD (0–10000). Combined with `priceMin`
   * for ranges.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  priceMax?: number;

  /**
   * Sort order for the result set. Defaults to `"rating"`.
   */
  @IsOptional()
  @IsIn(["rating", "price-asc", "price-desc", "popular"])
  sort?: "rating" | "price-asc" | "price-desc" | "popular";

  /**
   * Page number (1-indexed). Default 1 via the `Transform` decorator
   * that coerces query string to number and applies the default.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Transform(({ value }) => (value === undefined ? 1 : Number(value)))
  page?: number;

  /**
   * Items per page (1–100). Default 20.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => (value === undefined ? 20 : Number(value)))
  pageSize?: number;
}
