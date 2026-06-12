import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsPositive,
} from "class-validator";

/**
 * Body for `POST /api/books/:slug/chapters` — admin-only chapter
 * authoring. RolesGuard + `@RequiredRole("ADMIN")` gates the endpoint.
 *
 * `order` collision returns 409 — re-order existing chapters via
 * `PATCH` before inserting at an occupied slot.
 */
export class CreateChapterDto {
  /**
   * Display order within the book (1-indexed). Used as the chapter
   * identifier in `/dashboard/biblioteca/[slug]/lector/[order]`.
   * Collision with an existing chapter returns 409 `ORDINAL_TAKEN`.
   */
  @IsInt()
  @IsPositive()
  order: number;

  /**
   * Display title of the chapter. Shown in the reader header + the
   * chapter list on the book detail page.
   */
  @IsString()
  @IsNotEmpty()
  title: string;

  /**
   * Optional short description shown in the chapter list (1-2 lines
   * preview). Plain text.
   */
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Optional estimated reading time in minutes. Used to roll up the
   * book's `durationMinutes` on the detail screen and to size session
   * progress. Author's best guess — server doesn't validate against
   * actual content.
   */
  @IsOptional()
  @IsInt()
  @IsPositive()
  durationMinutes?: number;
}
