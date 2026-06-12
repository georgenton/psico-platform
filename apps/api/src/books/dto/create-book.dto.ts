import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  IsIn,
  Matches,
} from "class-validator";

const VALID_PLANS = ["FREE", "PRO", "ANNUAL", "B2B"] as const;

/**
 * Body for `POST /api/books` — admin-only book creation. RolesGuard +
 * `@RequiredRole("ADMIN")` gates the endpoint.
 *
 * Slug must be unique across the catalog; collision returns 409
 * `SLUG_TAKEN`. Books surface in the front by slug, not by ID — the
 * choice is permanent in the sense that changing it later invalidates
 * any external links.
 */
export class CreateBookDto {
  /**
   * URL slug for the book — must be lowercase kebab-case (matches
   * `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`). Used in `/dashboard/biblioteca/[slug]`
   * and as the canonical identifier. Pick carefully: changing it later
   * breaks bookmarks and shared links.
   */
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug must be lowercase kebab-case (e.g. mi-libro)",
  })
  slug: string;

  /**
   * Display title. Shown in the book card, the detail header, and the
   * reader chrome. No length cap because Spanish titles can run long
   * ("Familias Ensambladas: un manual para…").
   */
  @IsString()
  @IsNotEmpty()
  title: string;

  /**
   * Long-form description shown on the detail screen + meta tags. Plain
   * text; markdown not interpreted in v1.
   */
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * R2 URL of the cover image. Optional — when omitted, the front uses
   * the `coverToken`-based gradient fallback.
   */
  @IsOptional()
  @IsUrl()
  coverUrl?: string;

  /**
   * Minimum plan tier required to access the book. `"FREE"` means the
   * book shows in the catalog for all users; higher tiers gate it
   * behind the paywall. Plugin emits the enum in OpenAPI.
   */
  @IsIn(VALID_PLANS)
  plan: (typeof VALID_PLANS)[number];
}
