import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { MASTER_KEY_LEN } from "./argon2";
import { stringToBytes } from "./base64";

/**
 * HKDF subkey derivation (RFC 5869).
 *
 * masterKey → diaryKey | ecoKey via HKDF-Expand with a per-namespace
 * `info` label. The `info` is the namespace, NOT the secret — its purpose
 * is domain separation so a leak of one namespace's key can't be replayed
 * against another.
 *
 * ADR 0007 §B fixes the labels:
 *   "diary-v1" → diary entries (Sprint S6)
 *   "eco-v1"   → eco messages  (Sprint S10)
 *
 * The "v1" suffix is the algorithm-and-parameters version. When we rotate
 * (e.g. switch hash, change output length) we bump to "diary-v2" so old
 * keys remain derivable for migration.
 */

export const DIARY_KEY_INFO = "diary-v1";
export const ECO_KEY_INFO = "eco-v1";

const SUBKEY_LEN = 32; // 32 bytes — matches XChaCha20-Poly1305 key size.

/**
 * deriveSubKey — HKDF-Expand(masterKey, info) → 32-byte subkey.
 *
 * Salt: empty. We treat the master key as already-extracted (Argon2id
 * already mixed in randomness); per RFC 5869 §3.3 the salt can be omitted
 * when the IKM is already a uniformly random pseudo-random key.
 *
 * The master key is 16 bytes (ADR 0007 §A v2); HKDF-Expand happily takes a
 * 16-byte IKM and produces the 32-byte subkey the AEAD needs.
 */
export function deriveSubKey(masterKey: Uint8Array, info: string): Uint8Array {
  if (masterKey.length !== MASTER_KEY_LEN) {
    throw new Error("CRYPTO_INVALID_MASTER_KEY_LENGTH");
  }
  return hkdf(sha256, masterKey, undefined, stringToBytes(info), SUBKEY_LEN);
}
