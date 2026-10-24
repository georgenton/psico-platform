import { IsString } from "class-validator";

import { IsNewPassword } from "../../shared/validators/is-new-password.validator";

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
   * The new password, against the shared policy in `@psico/types`
   * (`password-policy`) — the same rules as register, which is the point:
   * this endpoint used to demand 8 while rekey demanded 10, for the same
   * question. Minimum in characters, ceiling in bytes (bcrypt's 72).
   */
  @IsString()
  @IsNewPassword()
  newPassword!: string;
}
