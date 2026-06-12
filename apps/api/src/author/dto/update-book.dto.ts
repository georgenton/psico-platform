import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

/**
 * Body for `PATCH /api/autor/libros/:id` — edit the metadata of an
 * `AuthorBook` draft. All fields optional; only sent fields are
 * updated.
 *
 * Only DRAFT and IN_REVIEW books are editable. Published books
 * require an unpublish-edit-resubmit cycle (`POST .../despublicar`
 * first). The service enforces ownership — authors can only touch
 * their own books.
 */
export class UpdateAuthorBookDto {
  /**
   * New title (2–120 chars). Same constraints as `CreateAuthorBookDto`.
   */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title?: string;

  /**
   * Optional subtitle (up to 200 chars). Shown below the title on the
   * cover and detail header. Often a clarifying second line —
   * "Un manual para…" style.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtitle?: string;

  /**
   * Long-form summary shown on the book detail screen. Up to 2000 chars
   * (~400 words). Plain text — markdown not interpreted in v1.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  /**
   * Cover palette token used as fallback when no `coverArtUrl` is set.
   * One of `"warm"` / `"cool"` / `"mixed"` — drives the gradient the
   * front renders. Plugin emits the enum in OpenAPI.
   */
  @IsOptional()
  @IsString()
  @IsIn(["warm", "cool", "mixed"], {
    message: "cover debe ser warm, cool o mixed.",
  })
  cover?: string;

  /**
   * R2 URL of a custom cover image. When present, takes precedence
   * over `cover` (the palette token). Set via the cover-image upload
   * endpoint, then this PATCH wires it.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverArtUrl?: string;

  /**
   * Optional `BookCategory.id` (max 64 chars). Shown in the catalog
   * filter chips on `Mi Biblioteca`. Service validates the ID exists
   * in the category table.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryId?: string;

  /**
   * ISO-639-1 language code (e.g. `"es"`, `"en"`). v1 only Spanish is
   * surfaced in the catalog, but author can mark drafts as English for
   * future expansion.
   */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  language?: string;
}
