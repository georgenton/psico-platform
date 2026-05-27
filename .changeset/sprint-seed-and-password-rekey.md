---
"@psico/types": minor
"@psico/api-client": minor
"@psico/crypto": patch
---

Sprint seed-and-password-rekey — Backup UI + atomic password rotation.

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
