import {
  entropyToMnemonic,
  mnemonicToEntropy,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

/**
 * BIP39 seed phrase utilities (Sprint S6-crypto-polish, ADR 0007 §G).
 *
 * Design decision (custom interpretation of "recovery seed phrase"):
 *
 *   The seed phrase IS the masterKey serialized.
 *
 * 32-byte masterKey = 256 bits = 24 BIP39 English words (256-bit entropy
 * + 8-bit checksum = 264 bits / 11 bits per word).
 *
 * Standard BIP39 derives a key FROM a seed phrase via PBKDF2; we go the
 * opposite direction (key → words → key). The trade-off:
 *
 *   - Recovery is exact: 24 words ↔ same masterKey, bit-for-bit.
 *   - Password is not strictly required for recovery — anyone with the
 *     seed phrase can read the diary. This means the seed phrase MUST be
 *     treated like the diary itself: store it like you'd store a paper
 *     copy of your most private journal.
 *
 * The UX flow (built in a follow-up sprint):
 *   1. After first unlock post-Sprint S6, show modal: "Aquí están las 24
 *      palabras que recuperan tu diario si pierdes tu contraseña. Anótalas
 *      en papel y guárdalas como guardas un documento importante."
 *   2. Confirmation: re-type 3 random words to confirm the user saw them.
 *   3. Backend marks `User.cryptoSeedShownAt = now` (DB column added later).
 *
 * The recovery flow:
 *   1. User on /login → "Olvidé mi contraseña, tengo el seed phrase"
 *   2. Inputs 24 words → seedPhraseToMasterKey() locally
 *   3. Reads the cryptoSalt from the auth response (legacy flow OK)
 *   4. derivesSubKey(recoveredMasterKey, "diary-v1") → diaryKey
 *   5. User can now read AND set a new password (re-encrypt flow on top).
 */

/**
 * Convert a 32-byte master key to a 24-word BIP39 mnemonic.
 *
 * Throws if the input is not exactly 32 bytes — BIP39 entropy must be one
 * of {16, 20, 24, 28, 32} bytes, and we only support 32 to match our
 * master key length. No silent truncation.
 */
export function masterKeyToSeedPhrase(masterKey: Uint8Array): string {
  if (masterKey.length !== 32) {
    throw new Error("CRYPTO_INVALID_MASTER_KEY_LENGTH");
  }
  return entropyToMnemonic(masterKey, wordlist);
}

/**
 * Convert a 24-word BIP39 mnemonic back to a 32-byte master key.
 *
 * Throws on:
 *   - wrong word count (not 24)
 *   - invalid words (not in the BIP39 English wordlist)
 *   - checksum mismatch (user mistyped a word)
 *
 * The error is intentionally generic so a "wrong word" doesn't leak
 * "your 17th word is invalid" — the UI just says "those words don't
 * match a valid recovery phrase."
 */
export function seedPhraseToMasterKey(phrase: string): Uint8Array {
  // Normalize: trim + collapse whitespace + lowercase. Users tend to type
  // with weird capitalization or double spaces when transcribing from
  // paper.
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  const words = normalized.split(" ");

  if (words.length !== 24) {
    throw new Error("CRYPTO_INVALID_SEED_PHRASE");
  }
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error("CRYPTO_INVALID_SEED_PHRASE");
  }
  return mnemonicToEntropy(normalized, wordlist);
}

/**
 * Lightweight check used by the UI to validate "is this the correct seed?"
 * BEFORE we actually try to use it. Returns true/false without throwing,
 * so a form-level "the phrase looks invalid" message is straightforward.
 */
export function isValidSeedPhrase(phrase: string): boolean {
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  const words = normalized.split(" ");
  if (words.length !== 24) return false;
  try {
    return validateMnemonic(normalized, wordlist);
  } catch {
    return false;
  }
}
