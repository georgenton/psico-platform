import { IsString, MinLength } from "class-validator";

/**
 * Body for `POST /api/auth/oauth/google` — exchange a Google ID token
 * for our own access + refresh pair.
 *
 * Throttled to 10 requests / 15 min / IP. On collision with an existing
 * `authProvider=LOCAL` user (same email), responds 409 EMAIL_ALREADY_REGISTERED
 * — auto-linking is rejected by default to avoid silent account merges
 * (ADR 0009).
 */
export class OAuthGoogleDto {
  /**
   * Google ID token (JWT) obtained client-side from Google Identity
   * Services (web) or Google Sign-In SDK (mobile). The backend verifies
   * the signature against Google's public keys via `google-auth-library`
   * — no Passport redirect flow.
   *
   * Typical length: ~1000–1500 characters. The token is single-use from
   * our perspective: we extract identity claims and discard.
   */
  @IsString()
  @MinLength(64)
  idToken!: string;
}
