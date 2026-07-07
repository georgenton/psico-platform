import { argon2id } from "@noble/hashes/argon2";
import { base64UrlToBytes, stringToBytes } from "./base64";

/**
 * Argon2id parameters — fixed by ADR 0007 §A.
 *
 *   m = 64 MB · t = 3 iterations · p = 4 lanes · output = 16 bytes
 *
 * These are NOT configurable per call. Changing them mid-product would
 * break decryption for everyone unless we tag the cipher with a version
 * byte. We keep the door open by exposing `MASTER_KEY_VERSION` but the
 * value of `2` means "ADR 0007 parameters above". When we bump it, callers
 * must accept both versions until rotation is complete.
 *
 * Version 2 (2026-07): master key length dropped 32 → 16 bytes so the
 * recovery seed phrase is 12 words instead of 24. The master key never
 * touches the AEAD directly — it always passes through HKDF, which expands
 * a 16-byte IKM into 32-byte subkeys. 128 bits of key material is bank-grade
 * (AES-128) and, crucially, the master key's real entropy is already bounded
 * by the user's password, so this halves the recovery-phrase length with no
 * meaningful loss of security. See ADR 0007 §G.
 */
export const MASTER_KEY_VERSION = 2;

/** Master key length in bytes. 16 bytes = 128 bits = 12 BIP39 words. */
export const MASTER_KEY_LEN = 16;

const ARGON2_PARAMS = {
  t: 3, // iterations
  m: 65536, // 64 MB in KiB
  p: 4, // parallelism
  dkLen: MASTER_KEY_LEN, // 16-byte master key
} as const;

/**
 * deriveMasterKey — Argon2id(password, salt) → 16-byte master key.
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
