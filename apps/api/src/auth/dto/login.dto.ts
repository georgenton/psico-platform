import { IsEmail, IsString } from "class-validator";

/**
 * Body for `POST /api/auth/login` — exchange email + password for an
 * access/refresh token pair.
 *
 * Throttled to 5 requests / 15 min / IP. On invalid credentials the
 * server still runs bcrypt against a fake hash to keep the response time
 * constant — prevents user-enumeration via timing.
 */
export class LoginDto {
  /** The email used at registration. */
  @IsEmail()
  email!: string;

  /**
   * The user's password. Never logged, never echoed back. The server
   * compares against the bcrypt hash and discards the plaintext after.
   */
  @IsString()
  password!: string;
}
