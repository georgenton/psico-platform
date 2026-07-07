// Public surface of @psico/crypto.
//
// The package implements the cryptographic contract of ADR 0007 in pure
// JavaScript so it runs identically on web (browser + Next.js), React Native
// (Expo/Hermes), and Node (server-side tests). No WASM, no native modules.
//
// Anti-patterns this package fights:
//   - Re-implementing the wire format (base64url, nonce length) in each app.
//   - Sneaking ciphertext into logs (forbidden by ADR 0007; CI grep enforces).
//   - Storing the master key on disk in plaintext (callers are responsible
//     for using SecureStore/Keychain on mobile, in-memory on web).

export { deriveMasterKey, MASTER_KEY_VERSION, MASTER_KEY_LEN } from "./argon2";
export { deriveSubKey, DIARY_KEY_INFO, ECO_KEY_INFO } from "./hkdf";
export {
  encryptString,
  decryptString,
  KEY_LEN,
  NONCE_LEN,
  type CipherEnvelope,
} from "./aead";
// Re-export the secure RNG used internally so callers (e.g. the password-
// change-with-rekey flow that needs a fresh 16-byte salt) don't have to
// reach into `@noble/ciphers` themselves. Works on web, RN/Hermes, Node.
export { randomBytes } from "@noble/ciphers/webcrypto";
export {
  masterKeyToSeedPhrase,
  seedPhraseToMasterKey,
  isValidSeedPhrase,
  SEED_PHRASE_WORD_COUNT,
} from "./bip39";
export {
  base64UrlToBytes,
  bytesToBase64Url,
  bytesToString,
  stringToBytes,
} from "./base64";
