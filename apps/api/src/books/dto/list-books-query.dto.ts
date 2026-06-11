import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";

const VIEWS = ["catalogo", "mis", "recos", "favoritos", "guardados"] as const;
const SORTS = ["recent", "alpha", "marina"] as const;

/**
 * Query params for GET /books — driven by 03-biblioteca.md.
 *
 * All fields optional. The service decides defaults so the controller stays
 * dumb. Pagination is clamped to keep DB pressure bounded:
 *   - page    ≥ 1
 *   - perPage ∈ [1, 60]   (UI never asks for more than ~48)
 */
export class ListBooksQueryDto {
  @IsOptional()
  @IsIn(VIEWS)
  view?: (typeof VIEWS)[number];

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  authorId?: string;

  @IsOptional()
  @IsIn(SORTS)
  sort?: (typeof SORTS)[number];

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  perPage?: number;
}
