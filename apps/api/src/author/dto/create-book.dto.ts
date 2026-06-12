import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * Body for `POST /api/autor/libros` — create a new book draft in the
 * Editor de autor. RolesGuard + `@RequiredRole("AUTHOR")` gates the
 * endpoint.
 *
 * Creates an `AuthorBook` row in `DRAFT` status. The book is private
 * to the author until they submit it for review (`POST .../publicar`)
 * and Pulso approves it (S71.B).
 *
 * Authors can create as many drafts as they want — no ownership cap
 * in v1.
 */
export class CreateAuthorBookDto {
  /**
   * Draft title (2–120 chars). Editable later via `PATCH .../libros/:id`
   * up until the book is published. Bound to author's choice — no
   * uniqueness check, since drafts are private.
   */
  @IsString()
  @MinLength(2, { message: "El título debe tener al menos 2 caracteres." })
  @MaxLength(120)
  title!: string;

  /**
   * Optional ID of a template to scaffold the book with. v1 templates
   * include `"emociones-12"` (12-chapter emotion-mapping arc) and
   * `"familia-8"` (8-chapter family-systems arc). When omitted the
   * book starts empty with a single placeholder chapter.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  templateId?: string;
}
