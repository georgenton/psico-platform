import { IsEmail, IsString, MinLength, MaxLength } from "class-validator";

import { IsNewPassword } from "../../shared/validators/is-new-password.validator";

/**
 * Body for `POST /api/auth/register` — new account creation with email
 * and password.
 *
 * Throttled to 10 requests / hour / IP at the controller level.
 */
export class RegisterDto {
  /**
   * The user's email address. Must be a valid RFC 5321 address. Used as
   * the unique login identifier and as the destination for verification
   * + password-reset emails.
   */
  @IsEmail()
  email!: string;

  /**
   * Password, checked against the shared policy in `@psico/types`
   * (`password-policy`): a 15-character minimum and no composition rules,
   * so a short phrase qualifies. The number lives there, not here, because
   * four different minimums used to be scattered across four DTOs.
   *
   * The ceiling is measured in BYTES, not characters, because that is what
   * bcrypt truncates at. Forty "ñ" are 40 characters and 80 bytes: counting
   * characters let them through and the verifier silently kept the first 72.
   *
   * The server hashes with bcrypt before persisting; the raw password
   * never reaches storage and never appears in any log.
   */
  @IsString()
  @IsNewPassword()
  password!: string;

  /**
   * Display name (2–100 chars). Shown in the UI and in transactional
   * emails. Not used for authentication.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;
}
