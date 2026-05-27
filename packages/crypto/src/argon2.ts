import { argon2id } from "@noble/hashes/argon2";
import { base64UrlToBytes, stringToBytes } from "./base64";

/**
 * Argon2id parameters — fixed by ADR 0007 §A.
 *
 *   m = 64 MB · t = 3 iterations · p = 4 lanes · output = 32 bytes
 *
 * These are NOT configurable per call. Changing them mid-product would
 * break decryption for everyone unless we tag the cipher with a version
 * byte. We keep the door open by exposing `MASTER_KEY_VERSION` but the
 * value of `1` means "ADR 0007 parameters above". When we bump it, callers
 * must accept both versions until rotation is complete.
 */
export const MASTER_KEY_VERSION = 1;

const ARGON2_PARAMS = {
  t: 3, // iterations
  m: 65536, // 64 MB in KiB
  p: 4, // parallelism
  dkLen: 32, // 32-byte master key
} as const;

/**
 * deriveMasterKey — Argon2id(password, salt) → 32-byte master key.
 *
 * Salt MUST be unique per user (the backend generates it at register and
 * exposes it via /api/user/me). Re-using a salt across users halves the
 * effort for an attacker with leaked ciphertext from multiple accounts.
 *
 * Performance: ~500-800ms on a mid-range phone, ~200-400ms on desktop.
 * Do NOT call per request — derive once at unlock and keep the result in
 * memory for the session.
 */
export async function deriveMasterKey(
  password: string,
  saltBase64Url: string,
): Promise<Uint8Array> {
  if (!password) throw new Error("CRYPTO_EMPTY_PASSWORD");
  if (!saltBase64Url) throw new Error("CRYPTO_EMPTY_SALT");

  const salt = base64UrlToBytes(saltBase64Url);
  if (salt.length < 16) {
    // A 16-byte salt is the OWASP minimum. We don't accept smaller — the
    // backend always generates 16 bytes, so smaller means tampered/legacy.
    throw new Error("CRYPTO_SALT_TOO_SHORT");
  }

  const passwordBytes = stringToBytes(password);
  return argon2id(passwordBytes, salt, ARGON2_PARAMS);
}
