---
"@psico/types": minor
"@psico/api-client": minor
---

Sprint S6-crypto — End-to-end encryption en producción.

`@psico/types`:

- `AuthUser.cryptoSalt: string | null` added — base64url Argon2id salt
  returned at register / login / refresh / oauth.
- `UserMeResponse.cryptoSalt: string | null` added — same value, returned
  from GET /api/user/me so web Server Components can hydrate without an
  extra round-trip.

`@psico/api-client`:

- `generated.ts` regenerated to include the new `cryptoSalt` field in 4
  endpoints. No new methods; the client surface is unchanged.

New package: `@psico/crypto` v0.1.0 (private):

- Pure JS Argon2id + HKDF-SHA256 + XChaCha20-Poly1305 (via @noble/hashes
  and @noble/ciphers).
- Powers the Diary E2E encryption client-side in web + mobile.
- See docs/informes/sprint-s6-crypto.md and ADR 0007 for the contract.
