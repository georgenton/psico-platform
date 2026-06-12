import { IsEmail, IsString, MinLength, MaxLength } from "class-validator";

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
   * Password (8–72 characters). Bcrypt silently truncates anything past
   * 72 bytes, so the upper bound is enforced explicitly to surface that
   * truncation as a validation error instead of a silent confidence
   * downgrade.
   *
   * The server hashes with bcrypt before persisting; the raw password
   * never reaches storage and never appears in any log.
   */
  @IsString()
  @MinLength(8)
  @MaxLength(72)
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
