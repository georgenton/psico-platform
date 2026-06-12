import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsOptional } from "class-validator";
import { CreateBookDto } from "./create-book.dto";

/**
 * Body for `PATCH /api/books/:slug` — admin-only book update. RolesGuard
 * + `@RequiredRole("ADMIN")` gates the endpoint.
 *
 * Inherits all fields from `CreateBookDto` as optional (via
 * `PartialType`) plus `isPublished` for catalog visibility control.
 * Slug is technically updateable but breaking change for any external
 * links — change with care.
 */
export class UpdateBookDto extends PartialType(CreateBookDto) {
  /**
   * Toggle catalog visibility. `false` hides the book from
   * `GET /api/books` (the public list) without deleting it; admins can
   * still read the detail by direct slug. Use to soft-retire books or
   * to stage new ones before launch.
   */
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
