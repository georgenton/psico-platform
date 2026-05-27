import { xchacha20poly1305 } from "@noble/ciphers/chacha";
// `randomBytes` lives in the `webcrypto` subpath since @noble/ciphers v1.
// It uses crypto.getRandomValues under the hood — web, RN (Hermes 0.74+),
// and modern Node all ship it natively. No polyfills needed.
import { randomBytes } from "@noble/ciphers/webcrypto";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  bytesToString,
  stringToBytes,
} from "./base64";

/**
 * XChaCha20-Poly1305 AEAD wrapper.
 *
 * Per ADR 0007 §A:
 *   - 256-bit key (32 bytes)
 *   - 192-bit nonce (24 bytes) generated random per write
 *   - Poly1305 tag (16 bytes) appended to the cipher
 *   - AAD optional (not used in v1 — could be the entry id, kept for v2)
 *
 * Returns base64url strings (textCiphertext, textNonce) ready for the
 * wire. The backend DTO expects exactly this shape.
 */

export const NONCE_LEN = 24;
export const KEY_LEN = 32;

export interface CipherEnvelope {
  /** base64url, includes the Poly1305 tag. */
  ciphertext: string;
  /** base64url, exactly 24 bytes decoded. */
  nonce: string;
}

/**
 * encryptString(plaintext, key) → { ciphertext, nonce }
 *
 * Generates a fresh random nonce per call. NEVER reuse a nonce with the
 * same key — under XChaCha20 with 24-byte nonces the birthday bound is
 * 2^96 messages, which is effectively unreachable, but the principle still
 * stands: one write, one nonce.
 */
export function encryptString(
  plaintext: string,
  key: Uint8Array,
): CipherEnvelope {
  if (key.length !== KEY_LEN) {
    throw new Error("CRYPTO_INVALID_KEY_LENGTH");
  }
  const nonce = randomBytes(NONCE_LEN);
  const aead = xchacha20poly1305(key, nonce);
  const cipher = aead.encrypt(stringToBytes(plaintext));
  return {
    ciphertext: bytesToBase64Url(cipher),
    nonce: bytesToBase64Url(nonce),
  };
}

/**
 * decryptString(envelope, key) → plaintext
 *
 * Authenticated decryption. Throws on:
 *   - wrong key
 *   - tampered ciphertext (Poly1305 tag mismatch)
 *   - malformed base64url
 *   - invalid UTF-8 (TextDecoder strict mode)
 *
 * The thrown error is intentionally generic (`CRYPTO_DECRYPT_FAILED`) so
 * callers don't have to discriminate cause from UI — a failed decrypt
 * always means "this is not yours" or "this was modified."
 */
export function decryptString(
  envelope: CipherEnvelope,
  key: Uint8Array,
): string {
  if (key.length !== KEY_LEN) {
    throw new Error("CRYPTO_INVALID_KEY_LENGTH");
  }
  let nonce: Uint8Array;
  let cipher: Uint8Array;
  try {
    nonce = base64UrlToBytes(envelope.nonce);
    cipher = base64UrlToBytes(envelope.ciphertext);
  } catch {
    throw new Error("CRYPTO_DECRYPT_FAILED");
  }
  if (nonce.length !== NONCE_LEN) {
    throw new Error("CRYPTO_DECRYPT_FAILED");
  }

  let plain: Uint8Array;
  try {
    const aead = xchacha20poly1305(key, nonce);
    plain = aead.decrypt(cipher);
  } catch {
    throw new Error("CRYPTO_DECRYPT_FAILED");
  }

  try {
    return bytesToString(plain);
  } catch {
    throw new Error("CRYPTO_DECRYPT_FAILED");
  }
}
