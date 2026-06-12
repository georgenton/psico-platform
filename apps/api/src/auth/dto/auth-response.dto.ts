/**
 * AuthResponseDto — shared by `/auth/register`, `/auth/login`,
 * `/auth/refresh`, and `/auth/oauth/google`.
 *
 * Contains the credentials needed for the client to make authenticated
 * requests and to derive the E2E master key for the Diario / Eco modules
 * (ADR 0007).
 */

/**
 * The authenticated user's public profile, embedded in every auth flow
 * response. Safe to render in the UI — contains no secrets.
 */
export class AuthUserDto {
  /** Stable opaque user ID (UUID v4). */
  id!: string;

  /** Login email. Always lowercase as stored. */
  email!: string;

  /** Display name shown in the UI and in transactional emails. */
  name!: string;

  /**
   * Authorization role: typically `"USER"`. Other values: `"AUTHOR"`,
   * `"PSYCHOLOGIST"`, `"ADMIN"`. Frontend uses this to show admin /
   * author surfaces.
   */
  role!: string;

  /**
   * Active plan tier: `"FREE"`, `"PRO"`, `"ANNUAL"`, or `"B2B"`. Gates
   * Pro-only features in the UI; the API also re-enforces server-side.
   */
  plan!: string;

  /**
   * base64url-encoded 16-byte Argon2id salt used by the client to derive
   * the E2E master key (ADR 0007 §A). NOT a secret — useless without the
   * password. `null` for legacy accounts created before Sprint S6-crypto;
   * the server backfills it on next login so this value stops being
   * `null` for an account after one successful login.
   */
  cryptoSalt!: string | null;
}

/**
 * Response payload for every successful authentication flow.
 *
 * `accessToken` is short-lived (~15 min) and goes in the `Authorization:
 * Bearer ...` header. `refreshToken` is long-lived (~30 days), single-use,
 * and rotated by `/auth/refresh`. Both are opaque JWTs — clients should
 * not parse them.
 */
export class AuthResponseDto {
  /**
   * Short-lived JWT (~15 min). Send as
   * `Authorization: Bearer <token>` on every authenticated request.
   */
  accessToken!: string;

  /**
   * Long-lived JWT (~30 days), single-use. POST to `/auth/refresh` to
   * exchange for a new access+refresh pair. The presented refresh token
   * is invalidated atomically on rotation.
   */
  refreshToken!: string;

  /** The authenticated user's public profile. */
  user!: AuthUserDto;
}
