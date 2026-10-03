import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { IsAvatarUrlOrAssetPath } from "./avatar-url.validator";

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
   * The user's avatar, as one of exactly two shapes:
   *
   *   - a path this API issued — `/api/content-assets/avatars/…`, what
   *     `POST /user/avatar` returns since the bucket became private. It is a
   *     stable path that redirects to a short-lived signed GET; it is NOT a
   *     signed URL, which is what the previous docstring here claimed and would
   *     have been a dead link within minutes of being stored.
   *   - an absolute http(s) URL, for an image hosted elsewhere. Google sign-in
   *     writes `claims.picture` into this same column.
   *
   * Pass `null` to clear and revert to the initials fallback.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsAvatarUrlOrAssetPath()
  avatarUrl?: string | null;
}
