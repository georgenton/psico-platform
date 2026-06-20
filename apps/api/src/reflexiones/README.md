# DiarioModule

Sprint S6. End-to-end encrypted journal entries. The server is a **blind
mailbox** for entry bodies — it stores ciphertext + nonce + non-sensitive
metadata (mood, tags, prompt) and never sees plaintext.

## Endpoints

| Method | Path                        | Purpose                         |
| ------ | --------------------------- | ------------------------------- |
| GET    | `/diario/entries`           | Paginated list + moodMap + tags |
| GET    | `/diario/prompt-of-the-day` | Rotation by day-of-year hash    |
| GET    | `/diario/entries/:id`       | Detail (full cipher body)       |
| POST   | `/diario/entries`           | Create                          |
| PATCH  | `/diario/entries/:id`       | Edit (cipher/nonce must rotate) |
| DELETE | `/diario/entries/:id`       | Delete                          |
| POST   | `/diario/entries/:id/share` | Re-encrypted share to therapist |

All endpoints require `Authorization: Bearer <token>`.

## Design source

- `docs/design/handoff/06-diario.md`
- `docs/adr/0007-e2e-encryption-diario-eco.md` (crypto contract)

## Crypto contract (server side)

The server treats `textCiphertext`, `textNonce`, `excerptCiphertext`,
`excerptNonce`, `ciphertextForTherapist`, and `wrappedKey` as **opaque
strings**. It MUST NOT:

- decrypt or attempt to decrypt
- log the values (CI grep + spec test enforce this)
- pass them to external services (Sentry, APM, analytics)

The server WILL:

- validate base64url shape and bounded size
- enforce cipher/nonce pairing on update (you can't change one without the other)
- echo `excerptCiphertext` back on create so the client can update its cache

## DTO validation

Custom validators live in `dto/ciphertext-validators.ts`:

- `@IsBase64UrlCipher()` — base64url, ≤ 1.4 MB
- `@IsBase64UrlNonce()` — base64url, exactly 24 bytes (32 chars unpadded)
- `@IsBase64UrlBlob(maxLen)` — generic base64url, custom length cap

These are the single source of truth for shape/size. Add a new encrypted
field once → decorate with `@IsBase64UrlCipher()`. Don't re-implement.

## Privacy regression

`diario.privacy.spec.ts` walks `apps/api/src/diario/`, `apps/api/src/home/`,
and `apps/api/src/users/` and fails if any `logger.*`/`console.*` call
references a ciphertext field. The same grep runs in CI as a separate job
(see `.github/workflows/ci.yml` → `privacy`) so the invariant is checked
even when tests are skipped.

## Sharing with a therapist

Per ADR 0007 §E:

1. Client decrypts the entry locally with `diaryKey`.
2. Client fetches the therapist's X25519 pubkey (Therapy v2).
3. Client derives a shared secret via `ECDH(myPriv, therapistPub)`.
4. Client generates an ephemeral key, encrypts the plaintext with it,
   wraps the ephemeral key with the shared secret, and sends both
   blobs + its one-shot pubkey + an optional expiry.
5. Server stores the row and enforces the expiry cap (default 7 days,
   max 30 days).

The server cannot reconstruct the plaintext — it lacks the therapist's
private key. Therapist reads via `/api/terapia/shared-entries/:id` when
TherapyModule lands (v2).

## Stats integration

`UsersService.computeStats` and `HomeService.fetchStats` count
`DiaryEntry` rows for the user (`userId, createdAt` only — never the
cipher). The home dashboard's `entriesThisWeek` and the perfil bundle's
`diaryEntries` / `minutesTotal` light up automatically as users journal.

## TODOs

- `kind = "voz"` entries reference `audioUrl` but the audio module
  (VoiceModule, Sprint S8) is not yet built. The DTO accepts the URL so
  the wire format is forward-compatible.
- Background sweeper for expired `SharedDiaryEntry` rows lands when
  TherapyModule (v2) ships; for v1 nothing reads them yet.
- Cap entries-per-user (anti-DoS) is intentionally absent — the storage
  cost is bounded by ciphertext size, which is already capped at ~1 MB.
