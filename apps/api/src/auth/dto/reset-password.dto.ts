import { IsString, Matches } from "class-validator";

import { IsNewPassword } from "../../shared/validators/is-new-password.validator";

/**
 * Body for `POST /api/auth/reset-password` — consume a password-reset
 * token from the email link and set a new password.
 *
 * Throttled to 5 requests / 15 min / IP. On success, all active refresh
 * tokens are revoked (forced logout everywhere). If the token is invalid,
 * expired, or already consumed, the server responds 410 GONE so the UI
 * can route the user to "request a new link" instead of "try again".
 */
export class ResetPasswordDto {
  /**
   * Raw reset token from the email link, base64url 32–128 chars. The
   * server hashes (SHA-256) before lookup — the raw token only ever
   * touches the email and this request body.
   */
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{32,128}$/, {
    message: "Invalid token format",
  })
  token!: string;

  /**
   * The new password, against the same shared policy as register — see
   * `@psico/types` (`password-policy`). Minimum measured in characters,
   * ceiling measured in bytes, because bcrypt truncates at 72 bytes.
   *
   * The server hashes with bcrypt before persisting; raw plaintext never
   * touches storage or logs. The previous password hash is overwritten —
   * there is no history.
   *
   * Note what this endpoint recovers and what it does not: it restores
   * access to the account, not the diary. `cryptoSalt` is untouched, so a
   * new password derives a different master key and the entries stay
   * unreadable without the recovery phrase. That is the design, and the
   * product copy now says so.
   */
  @IsString()
  @IsNewPassword()
  newPassword!: string;
}
