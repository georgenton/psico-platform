import { IsString, MinLength, MaxLength } from "class-validator";

/**
 * Body for `POST /api/user/password-change` — change the password for
 * an authenticated user without the E2E rekey flow.
 *
 * This is the **legacy / OAuth-friendly** flavour. Users with E2E diary
 * data should use `/password-change-with-rekey` instead — that variant
 * re-encrypts every diary entry under the new master key in one
 * transaction.
 *
 * On success: bcrypt update + active refresh tokens are revoked
 * (forced logout everywhere). For OAuth users (no `passwordHash`) the
 * service returns 400 `OAUTH_USER_NO_PASSWORD`.
 */
export class PasswordChangeDto {
  /**
   * The user's current password. Verified against the bcrypt hash
   * before any write. Never logged.
   */
  @IsString()
  currentPassword!: string;

  /**
   * New password (8–72 chars). Bcrypt silently truncates anything past
   * 72 bytes, so the upper bound is enforced explicitly. Same rules as
   * register — picking weak passwords is the user's choice.
   */
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}
