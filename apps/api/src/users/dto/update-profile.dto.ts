import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsUrl,
  ValidateIf,
} from "class-validator";

/**
 * Body for `PATCH /api/user/profile` — update editable profile fields.
 * All fields optional; only sent fields are touched. Pass `null` to clear
 * a nullable field (`city` / `country` / `avatarUrl`).
 */
export class UpdateProfileDto {
  /**
   * Display first name shown in the home greeting and in transactional
   * emails. 1–100 chars. The `name` field (legacy full display name) is
   * not editable here.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  /**
   * Free-text city. Plaintext — used to size therapy listings by
   * proximity. Pass `null` to clear. Max 100 chars.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(100)
  city?: string | null;

  /**
   * ISO 3166-1 alpha-2 country code (exactly 2 chars, e.g. `"EC"`,
   * `"PE"`). Used by `/terapia/crisis` to pick the right hotline. Pass
   * `null` to clear — the service then falls back to a generic
   * international list.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2)
  @MinLength(2)
  country?: string | null;

  /**
   * R2 signed URL to the user's avatar image. Set by the avatar upload
   * endpoint (`POST /user/avatar`); callers can also pass `null` to
   * clear and revert to initials-based fallback.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl({ require_tld: false })
  avatarUrl?: string | null;
}
