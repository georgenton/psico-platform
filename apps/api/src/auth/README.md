# AuthModule

JWT-based authentication with rotating refresh tokens, audit logging, and per-IP rate limiting.

**Endpoints:** all under `/api/auth/*` (post Sprint 0.A). All return JSON envelopes via the global `HttpExceptionFilter`.

| Method | Path                            | Auth                  | Throttle              | Body                        | Returns                                   |
| ------ | ------------------------------- | --------------------- | --------------------- | --------------------------- | ----------------------------------------- |
| POST   | `/api/auth/register`            | —                     | 10 / hour / IP        | `{ email, password, name }` | `201 { accessToken, refreshToken, user }` |
| POST   | `/api/auth/login`               | —                     | 5 / 15 min / IP       | `{ email, password }`       | `200 { accessToken, refreshToken, user }` |
| POST   | `/api/auth/refresh`             | refresh token in body | global default 60/min | `{ refreshToken }`          | `200 { accessToken, refreshToken, user }` |
| POST   | `/api/auth/logout`              | bearer                | global default        | `{ refreshToken }`          | `204 No Content`                          |
| POST   | `/api/auth/forgot-password`     | —                     | 3 / hour / IP         | `{ email }`                 | `200 { ok: true }` (no-leak — always 200) |
| POST   | `/api/auth/reset-password`      | —                     | 5 / 15 min / IP       | `{ token, newPassword }`    | `204 No Content`                          |
| POST   | `/api/auth/verify-email`        | —                     | global default        | `{ token }`                 | `200 { ok: true, userId }`                |
| POST   | `/api/auth/resend-verification` | —                     | 3 / hour / IP         | `{ email }`                 | `200 { ok: true }` (no-leak — always 200) |
| POST   | `/api/auth/oauth/google`        | —                     | 10 / 15 min / IP      | `{ idToken }`               | `200 { accessToken, refreshToken, user }` |

## Token model

- **Access token (`accessToken`):** JWT signed with `JWT_SECRET`, 15-min expiry. Carries `{ sub: userId, email, role, plan }`. Sent in the `Authorization: Bearer <token>` header.
- **Refresh token (`refreshToken`):** opaque 64-byte hex string, 30-day expiry. Stored in DB as SHA-256 hash (raw value never touches disk). Single-use: every `/refresh` rotates it.
- **Rotation:** every successful `/refresh` revokes the old refresh token and issues a new pair atomically (Prisma `$transaction`). Presenting a revoked or expired token → `401 UNAUTHORIZED` + an `AuthEvent{ type: "REFRESH_REUSED" }` row (security signal).

## Audit log — `AuthEvent` table

Every auth action writes one row synchronously. Failure of the audit write is swallowed (does not block the auth outcome), but logged for follow-up.

| `type`           | When                              | `userId`        | `metadata`                                                                                  |
| ---------------- | --------------------------------- | --------------- | ------------------------------------------------------------------------------------------- |
| `REGISTER`       | New account created               | new user.id     | —                                                                                           |
| `LOGIN_OK`       | Successful login                  | user.id         | —                                                                                           |
| `LOGIN_FAIL`     | Failed login                      | user.id or null | `{ reason: "USER_NOT_FOUND" \| "WRONG_PASSWORD" \| "ACCOUNT_INACTIVE" }`                    |
| `REFRESH`        | Refresh token rotated             | user.id         | —                                                                                           |
| `REFRESH_REUSED` | Revoked/expired token presented   | user.id or null | `{ reason: "TOKEN_REVOKED" \| "TOKEN_EXPIRED" \| "TOKEN_NOT_FOUND" \| "ACCOUNT_INACTIVE" }` |
| `LOGOUT`         | Refresh token revoked client-side | user.id         | `{ revokedCount: number }`                                                                  |

**IP + User-Agent** are captured from the request (`X-Forwarded-For` first, falling back to socket address).

**Indexes on AuthEvent:**

- `(userId, createdAt desc)` — per-user history (Pulso, data export)
- `(type, createdAt desc)` — global alerts ("all LOGIN_FAIL in last hour")
- `(ipAddress, createdAt desc)` — IP-based abuse detection

## Rate limiting

Throttler config is global (see `apps/api/src/shared/throttler/throttler.module.ts`). Auth overrides via `@Throttle({ default: { ... } })` on the controller handlers.

- `/api/auth/login` — **5 / 15 min / IP**. OWASP-recommended baseline. Keys by IP+route so an attacker cycling emails shares one budget.
- `/api/auth/register` — **10 / hour / IP**. Slows email-spam bots.
- `/api/auth/forgot-password` and `/api/auth/resend-verification` — **3 / hour / IP** each. Same shape of endpoint: unauthenticated, takes an address, sends mail.
- `/api/auth/refresh` and `/api/auth/logout` — fall back to global default (60/min/user).

When exceeded, returns `429 RATE_LIMIT_EXCEEDED` with the standard envelope.

### The second limit on `resend-verification`, and why it exists

The throttler keys by **IP**, which protects our own mail cost but not the
person being targeted: anyone with a handful of addresses — or a handful of
IPs — could use the endpoint to bomb one inbox. So `resendVerification` also
enforces **3 verification emails per hour per account**, keyed by the account
rather than the caller.

That budget is **derived**, not bookkept: it is a `count` of
`EmailVerificationToken` rows in the trailing hour, and one such row is
written for every send. The limit therefore counts the very thing it limits —
no second ledger to drift, no new table, no migration, and it survives a Redis
restart, which a cache-backed counter would not.

**Checking it and spending it are one indivisible step.** The first version
counted and then created in two separate statements, so two simultaneous
requests with two sends already in the window could both read «two», both
pass, and leave four. Both now run in one transaction that first takes
`pg_advisory_xact_lock` keyed by the account — the same mechanism billing uses
to serialise one person's subscription events. The lock, the count and the
reservation live in `verification-send-budget.ts`, and
`verification-send-budget.pg-spec.ts` proves it with two real PostgreSQL
connections racing for the last slot: only one gets it, and the test also
checks that the loser was seen **waiting on the lock** — so a pass can't come
from two requests that simply didn't overlap.

Three consequences worth knowing before changing it:

- The email `register()` sends counts, and it reserves its slot through the
  **same** locked step, so a resend racing a registration can't push the
  account past the ceiling. A brand-new account has two resends left in its
  first hour. That is the right reading: they already got one.
- The row is written **before** anything is sent, so a failing provider
  spends budget. Deliberate — otherwise a Resend outage turns the endpoint
  into an unmetered retry loop.
- **Sending happens outside the transaction.** A lock held across the
  provider's latency would make every other request for that account wait on
  Resend.

Being over budget is invisible to the caller (still `200 { ok: true }`); the
`AuthEvent` row carries `metadata.reason = "ADDRESS_RATE_LIMITED"`.

### How the address is matched

`register()` stores the address exactly as typed and `login()` looks it up
exactly, so some accounts carry capitals — 3 of 19 on staging, measured on
2026-11-23. The first version of `resendVerification` lowercased before an
exact lookup, so for those accounts it answered 200 and did nothing, audited as
`USER_NOT_FOUND`. Now it tries the **exact** address (trimmed) first and falls
back to a **case-insensitive** match only when that match is **unique**. Two
accounts that differ only by case are not guessed between: same 200, audited
as `AMBIGUOUS_CASE`. The email goes to the address **as stored**.

`forgotPassword` had the very same lowercase-then-exact lookup, so an account
stored with capitals could not recover its password either. Both flows now go
through `findAccountByTypedAddress`, so they can't drift apart again. That is
the only change to the recovery flow accepted in PR 868: templates, TTL, the
recipient guard and the no-leak contract are untouched.

### The response does not wait for the provider

The first version awaited Resend on the one branch that sends, so a slow
provider made «this address can get a resend» measurably slower than every
other answer. `resendVerification` now hands the rendered email to the
**`email` queue** — the BullMQ path the email-change and data-export notices
already use, with 3 attempts and backoff — and the **worker** delivers it. The
`AuthEvent` row records `{ queued: true }` (or `{ enqueueFailed: true }` if
Redis refused the job); the provider's own outcome is in the queue's
attempts/failed list and the worker's log.

What the response still awaits is our own infrastructure: the locked
reservation (one short PostgreSQL transaction) and the enqueue (one Redis
write). The E2E pins this with a **controlled 1.5 s provider delay**: the
sending branch answers under that, and the provider is not called inside the
request.

**What the tests do NOT prove.** Equal status and equal body (pinned in the
E2E) plus «no provider wait» (pinned with the delay) is not the same as
equal latency. The sending branch still does a transaction and a queue write
the other branches skip. Nothing here claims the branches are
indistinguishable in time.

`register()` keeps delivering in-process and un-awaited, as it did when the
mail journey was accepted (PR 868): its latency was never on its response.

## Constant-time login (timing attack mitigation)

`AuthService.login()` always runs `bcrypt.compare` — even when the email doesn't exist — using a placeholder hash. This prevents an attacker from distinguishing "wrong password" from "user not registered" by measuring response time. The user-facing error is always `"Invalid credentials"` (the audit log captures the real reason internally).

## Strategies

- **`JwtStrategy`** (`strategies/jwt.strategy.ts`) — extracts JWT from `Authorization: Bearer <token>`. Validates against `JWT_SECRET`. Returns `AuthenticatedUser { userId, email, role, plan }` to be attached to `request.user`.
- **Future (Sprint S2):** `GoogleStrategy`, `AppleStrategy` for OAuth (ADR 0009).

## Guards

- **`JwtAuthGuard`** — wraps Passport's `AuthGuard("jwt")`. Apply at controller or handler level with `@UseGuards(JwtAuthGuard)`.

## Used by

| Module               | Uses                                      |
| -------------------- | ----------------------------------------- |
| `UsersModule`        | `JwtAuthGuard` + `AuthenticatedUser` type |
| `AIModule`           | `JwtAuthGuard`                            |
| `ContentModule`      | `JwtAuthGuard` (chapters, progress)       |
| `SubscriptionModule` | `JwtAuthGuard` (me, checkout, portal)     |

## Email flows (Sprint S2)

| Endpoint              | What it does                                                                                                                                                            | Token TTL |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `forgot-password`     | If email matches LOCAL user: generates token, emails reset link, audits PASSWORD_RESET_REQUESTED. Always returns 200 (no-leak).                                         | 1 hour    |
| `reset-password`      | Consumes token in transaction with: password rotation + revoke ALL refresh tokens (forces re-login everywhere). 410 GONE if token invalid/expired/used.                 | —         |
| `verify-email`        | Consumes token, sets `User.emailVerified=true`. Sent automatically after `register()` (fire-and-forget).                                                                | 24 hours  |
| `resend-verification` | Issues another verification link for an address. Always returns 200 (no-leak), whether the address is unknown, already verified, OAuth, or over its per-address budget. | 24 hours  |

Token storage strategy (`PasswordResetToken`, `EmailVerificationToken` tables):

- SHA-256 hash of raw token persisted; raw value only in email body.
- `consumedAt` set on use → replay protection (second call → 410).
- Old rows can be GC'd after `consumedAt + 30d` or `expiresAt + 7d`. Cleanup job is future work.

## OAuth (Sprint S2)

`POST /api/auth/oauth/google` accepts a Google ID token (obtained client-side via Google Identity Services on web / Google Sign-In SDK on mobile) and verifies it server-side via `google-auth-library`. **No redirect flow** — see [ADR 0009](../../../../docs/adr/0009-oauth-with-google-id-token.md).

Three behaviours:

- `providerId` matches existing GOOGLE user → `OAUTH_LOGIN` + tokens.
- `providerId` new + email free → CREATE user `authProvider=GOOGLE`, `passwordHash=null`, `emailVerified=true` (trusting Google's verification). Audit `OAUTH_REGISTER`.
- `providerId` new + email collides with LOCAL user → `409 EMAIL_ALREADY_REGISTERED`. **No auto-linking** for security.

If `GOOGLE_CLIENT_ID` is not configured, the endpoint returns `400 OAUTH_NOT_CONFIGURED`. Deploys that don't yet have OAuth wired up still boot and serve other endpoints normally.

## Future work

| Feature                                        | Sprint                                   |
| ---------------------------------------------- | ---------------------------------------- |
| `/auth/oauth/apple`                            | deferred — needs Apple Developer account |
| MFA via TOTP                                   | post-v1                                  |
| WebAuthn passkeys                              | post-v1                                  |
| Audit log surfacing in Pulso                   | S25                                      |
| Account linking (`POST /api/user/link-google`) | post-v1                                  |
| Cleanup job for old reset/verify tokens        | S3 (BullMQ worker)                       |

## Testing

- **Unit:** `auth.service.spec.ts` — 49 tests covering all flows + audit events + constant-time guarantee. (The count said 21 until 2026-11-19; it had been stale for several sprints.)
- **PostgreSQL:** `verification-send-budget.pg-spec.ts` — 4 tests, two real connections racing for the per-account budget (CI `test:locks`).
- **E2E:** `auth.e2e-spec.ts` — 25 tests booting the full AppModule with mocked Prisma. Covers global prefix, validation envelope, throttler, JwtAuthGuard, and end-to-end register → login → logout.

On the two no-leak endpoints the split between the two files is not arbitrary.
The service spec proves each branch does the right thing; only the E2E can
show the branches are **indistinguishable from outside** — same status, same
body — because a unit test asserting "resolves" never sees the status code the
caller reads. `resend-verification` has both, including a control that the
success path answers identically to the refusals.

Run: `pnpm --filter @psico/api test`
