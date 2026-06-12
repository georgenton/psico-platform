import { IsString, Matches, MaxLength, MinLength } from "class-validator";

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
   * New password (8–72 characters). Bcrypt silently truncates anything
   * past 72 bytes, so the upper bound is enforced explicitly to surface
   * that as a validation error.
   *
   * The server hashes with bcrypt before persisting; raw plaintext never
   * touches storage or logs. The previous password hash is overwritten —
   * there is no history.
   */
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}
