/**
 * AuthResponseDto — shared by /auth/register, /auth/login, /auth/refresh,
 * /auth/oauth/google.
 *
 * `user.cryptoSalt` is the base64url-encoded 16-byte Argon2id salt. It is
 * NOT a secret — leaking it to an attacker doesn't help without the
 * password. The client uses it immediately on login to derive the master
 * key (ADR 0007 §A) and never needs to send it back.
 *
 * Nullable for accounts registered BEFORE Sprint S6-crypto; new accounts
 * always populate it.
 */
export class AuthResponseDto {
  accessToken!: string;
  refreshToken!: string;
  user!: {
    id: string;
    email: string;
    name: string;
    role: string;
    plan: string;
    /** base64url 16-byte Argon2id salt, or null for legacy accounts. */
    cryptoSalt: string | null;
  };
}
