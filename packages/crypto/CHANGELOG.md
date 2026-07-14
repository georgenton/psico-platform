# @psico/crypto

## 0.3.0

### Minor Changes

- 99759b8: Switch the recovery seed phrase to the Spanish BIP39 wordlist (was English).
  The master key is unchanged; only its 12-word representation differs. This is
  a hard break for any phrase generated under the English wordlist — acceptable
  pre-launch (no real users), but a documented migration would be required if we
  ever change the wordlist again. Rationale: the audience is Ecuador → LATAM.
- 0130b66: Recovery phrase reduced from 24 to 12 words (ADR 0007 §G v2).

  The master key length drops 32 → 16 bytes (256 → 128 bits). The key never
  touches the AEAD directly — it always passes through HKDF, which expands the
  16-byte IKM into the 32-byte subkeys XChaCha20-Poly1305 needs, so entry
  encryption is unchanged. 128 bits is bank-grade and the master key's real
  entropy is already bounded by the user's password, so this halves the
  recovery-phrase length with no meaningful loss of security.

  Breaking: `MASTER_KEY_VERSION` is now `2`. Data encrypted under a 32-byte
  master key (v1) will not decrypt with a 16-byte key. Pre-launch accounts must
  re-register; a dual-version migration is required before this ships to real
  production data. New exports: `MASTER_KEY_LEN`, `SEED_PHRASE_WORD_COUNT`.

## 0.2.0

### Minor Changes

- 217e47e: Sprint S6-crypto-polish — BIP39 seed phrase toolkit.

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

### Patch Changes

- 298ed0c: Sprint seed-and-password-rekey — Backup UI + atomic password rotation.

  Closes the two flows deferred from S6-crypto-polish: showing the BIP39 seed
  phrase as a one-time backup, recovering access from that phrase, and
  rotating the user's password while re-encrypting every diary entry without
  plaintext ever leaving the device.

  **Backend (`@psico/api`):**
  - `POST /api/user/crypto-seed-acknowledged` — idempotent, marks
    `User.cryptoSeedShownAt`.
  - `POST /api/user/password-change-with-rekey` — atomic transaction:
    bcrypt(newPassword), update `passwordHash` + `cryptoSalt`, UPDATE every
    `DiaryEntry` with the client-supplied re-encrypted cipher/nonce, revoke
    every active refresh token.
  - `GET /api/diario/entries/raw-ciphers` — lean fetch (no related-search,
    no tags) used exclusively by the rekey flow to avoid N detail calls.
  - Schema: `User.cryptoSeedShownAt: DateTime?` + migration.
  - DTOs cap `ArrayMaxSize(500)` per rekey, base64url validation for
    cipher/nonce, `NEW_PASSWORD_MIN=10`.

  **`@psico/types`:**
  - `UserMeResponse.cryptoSeedShownAt` (Date | null).
  - New: `CryptoSeedAcknowledgedResponse`, `RekeyedDiaryEntry`,
    `PasswordChangeWithRekeyRequest`, `PasswordChangeWithRekeyResponse`,
    `DiaryRawCipherEntry`, `DiaryRawCiphersResponse`.

  **`@psico/api-client`:**
  - `diarioApi.listRawCiphers()`.
  - `generated.ts` regenerated from updated OpenAPI spec (58 KB → 62.1 KB).

  **`@psico/crypto`:**
  - Re-exports `randomBytes` from `@noble/ciphers/webcrypto` so app code can
    generate fresh salts without a direct dependency on `@noble/ciphers`.

  **Web (`@psico/web`):**
  - `SeedPhraseModal` post-unlock first-time, with 3-of-24 confirm step.
  - `UnlockGate` gains a "seed phrase recovery" mode that bypasses Argon2id.
  - New `/dashboard/security` route with `ChangePasswordCard` running the
    full rekey phase machine client-side.
  - `DiaryKeyProvider` hoisted to `/dashboard/layout.tsx` so unlock state
    survives navigation between Diario and Security; the context now exposes
    `masterKey` + `adoptMasterKey` alongside the subkey.

  **Mobile (`@psico/mobile`):**
  - `SeedPhraseModal` (RN `Modal`), `UnlockGate` seed-mode, and
    `(tabs)/security.tsx` mirror the web flow.
  - `DiaryKeyProvider` hoisted to `(tabs)/_layout.tsx`. masterKey is
    RAM-only on mobile (only the subkey is persisted in SecureStore).

## 0.1.0

### Minor Changes

- **Initial release.** Pure JS cryptographic primitives for client-side
  E2E encryption of Diario and Eco. Implements the spec defined in
  [ADR 0007](../../docs/adr/0007-e2e-encryption-diario-eco.md).

  **What's exported:**
  - `deriveMasterKey(password, salt)` — Argon2id with `m=64MB, t=3, p=4`
    via `@noble/hashes`. Returns a 32-byte master key.
  - `deriveSubKey(masterKey, info)` — HKDF-SHA256 sub-key derivation.
    Used to split the master key into purpose-specific keys
    (`diary-v1`, `eco-v1`).
  - `encryptString(key, plaintext)` / `decryptString(key, ciphertext, nonce)`
    — XChaCha20-Poly1305 via `@noble/ciphers`. Returns base64url-encoded
    cipher + 24-byte nonce.
  - `masterKeyToSeedPhrase(key)` / `seedPhraseToMasterKey(phrase)` —
    BIP39 24-word recovery via `@scure/bip39`. Master key serializes
    bit-for-bit so recovery is exact.
  - `isValidSeedPhrase(phrase)` — non-throwing validator for forms.
  - `randomBytes(n)` — re-export from `@noble/ciphers/webcrypto` so
    web and mobile don't need to import noble directly.
  - base64url helpers.

  **Sprints that built this:**
  - Sprint S21 (`sprint-s6-crypto`) — Argon2id + HKDF + XChaCha20-Poly1305
    primitives + 24 tests.
  - Sprint S22 (`sprint-s6-crypto-polish`) — BIP39 seed phrase toolkit
    - 10 additional tests.
  - Sprint S23 (`sprint-seed-and-password-rekey`) — `randomBytes` re-export.

  **Why "pure JS" matters:** every primitive runs in the browser AND React
  Native without WASM or native modules. Web uses Web Crypto-backed
  randomness; mobile falls back to `expo-crypto`-compatible sources via
  noble's runtime detection.

  **Privacy invariant:** the server never sees a derived key, a plaintext,
  or a seed phrase. Argon2id runs in the client. The server stores
  `User.cryptoSalt` only.
