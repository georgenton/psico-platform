import { IsInt, IsString, Length, Max, Min } from "class-validator";

/**
 * POST /books/:id/reviews body.
 *
 * Rating is 1..5 stars (no half-stars in v1 to keep math simple).
 * Text is required and bounded so we don't accept a 50 MB markdown payload.
 * The service additionally checks that the user finished the book before
 * accepting the review (see 04-detalle.md §acciones).
 */
export class CreateBookReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @Length(1, 4000)
  text!: string;
}
