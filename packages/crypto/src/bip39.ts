import {
  entropyToMnemonic,
  mnemonicToEntropy,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { MASTER_KEY_LEN } from "./argon2";

/**
 * BIP39 seed phrase utilities (ADR 0007 §G).
 *
 * Design decision (custom interpretation of "recovery seed phrase"):
 *
 *   The seed phrase IS the masterKey serialized.
 *
 * 16-byte masterKey = 128 bits = 12 BIP39 English words (128-bit entropy
 * + 4-bit checksum = 132 bits / 11 bits per word).
 *
 * Standard BIP39 derives a key FROM a seed phrase via PBKDF2; we go the
 * opposite direction (key → words → key). The trade-off:
 *
 *   - Recovery is exact: 12 words ↔ same masterKey, bit-for-bit.
 *   - Password is not strictly required for recovery — anyone with the
 *     seed phrase can read the diary. This means the seed phrase MUST be
 *     treated like the diary itself: store it like you'd store a paper
 *     copy of your most private journal.
 *
 * Why 12 words and not 24 (ADR 0007 §G v2, 2026-07):
 *   - The master key's real entropy is bounded by the user's password, so
 *     serializing 256 bits was theatrical — 128 bits is already more than
 *     any realistic password provides.
 *   - 12 words halves the cognitive load for a non-technical, emotionally
 *     vulnerable audience. A 24-word wall + a re-type quiz reads like a
 *     crypto-wallet chore, not a wellness product.
 *   - 128 bits is bank-grade (AES-128) and uncrackable by brute force.
 *
 * The UX flow:
 *   1. After first unlock, show a modal with the 12 words + one-tap
 *      "Copiar"/"Descargar" and a single "ya las guardé" checkbox. No quiz.
 *   2. Backend marks `User.cryptoSeedShownAt = now`.
 *   3. The words can be viewed again any time in Ajustes → Seguridad.
 *
 * The recovery flow:
 *   1. User on unlock gate → "Olvidé mi contraseña, tengo mi frase"
 *   2. Inputs 12 words → seedPhraseToMasterKey() locally
 *   3. Reads the cryptoSalt from /user/me
 *   4. deriveSubKey(recoveredMasterKey, "diary-v1") → diaryKey
 *   5. User can now read AND set a new password (re-encrypt flow on top).
 */

/** Number of words in the recovery phrase (16-byte entropy → 12 words). */
export const SEED_PHRASE_WORD_COUNT = 12;

/**
 * Convert a 16-byte master key to a 12-word BIP39 mnemonic.
 *
 * Throws if the input is not exactly 16 bytes — BIP39 entropy must be one
 * of {16, 20, 24, 28, 32} bytes, and we only support 16 to match our master
 * key length. No silent truncation.
 */
export function masterKeyToSeedPhrase(masterKey: Uint8Array): string {
  if (masterKey.length !== MASTER_KEY_LEN) {
    throw new Error("CRYPTO_INVALID_MASTER_KEY_LENGTH");
  }
  return entropyToMnemonic(masterKey, wordlist);
}

/**
 * Convert a 12-word BIP39 mnemonic back to a 16-byte master key.
 *
 * Throws on:
 *   - wrong word count (not 12)
 *   - invalid words (not in the BIP39 English wordlist)
 *   - checksum mismatch (user mistyped a word)
 *
 * The error is intentionally generic so a "wrong word" doesn't leak
 * "your 7th word is invalid" — the UI just says "those words don't match a
 * valid recovery phrase."
 */
export function seedPhraseToMasterKey(phrase: string): Uint8Array {
  // Normalize: trim + collapse whitespace + lowercase. Users tend to type
  // with weird capitalization or double spaces when transcribing from paper.
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  const words = normalized.split(" ");

  if (words.length !== SEED_PHRASE_WORD_COUNT) {
    throw new Error("CRYPTO_INVALID_SEED_PHRASE");
  }
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error("CRYPTO_INVALID_SEED_PHRASE");
  }
  return mnemonicToEntropy(normalized, wordlist);
}

/**
 * Lightweight check used by the UI to validate "is this the correct seed?"
 * BEFORE we actually try to use it. Returns true/false without throwing, so
 * a form-level "the phrase looks invalid" message is straightforward.
 */
export function isValidSeedPhrase(phrase: string): boolean {
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  const words = normalized.split(" ");
  if (words.length !== SEED_PHRASE_WORD_COUNT) return false;
  try {
    return validateMnemonic(normalized, wordlist);
  } catch {
    return false;
  }
}
