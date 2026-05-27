---
"@psico/crypto": minor
---

Sprint S6-crypto-polish — BIP39 seed phrase toolkit.

`@psico/crypto`:

- New `masterKeyToSeedPhrase(key)` — encodes a 32-byte master key as 24
  English BIP39 words (256 bits + 8-bit checksum).
- New `seedPhraseToMasterKey(phrase)` — reverses the encoding. Normalizes
  whitespace + case. Throws `CRYPTO_INVALID_SEED_PHRASE` on bad input.
- New `isValidSeedPhrase(phrase)` — boolean form-level validator.
- New dependency: `@scure/bip39` (Paul Miller; same ecosystem as @noble/\*).
- 10 new tests covering roundtrip, normalization, error paths, end-to-end
  recovery flow.

The UI flows (show modal post-unlock, recovery on /login) are deferred to
a dedicated sprint that depends on this toolkit.
