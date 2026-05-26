# AuthModule

JWT-based authentication with rotating refresh tokens, audit logging, and per-IP rate limiting.

**Endpoints:** all under `/api/auth/*` (post Sprint 0.A). All return JSON envelopes via the global `HttpExceptionFilter`.

| Method | Path                        | Auth                  | Throttle              | Body                        | Returns                                   |
| ------ | --------------------------- | --------------------- | --------------------- | --------------------------- | ----------------------------------------- |
| POST   | `/api/auth/register`        | —                     | 10 / hour / IP        | `{ email, password, name }` | `201 { accessToken, refreshToken, user }` |
| POST   | `/api/auth/login`           | —                     | 5 / 15 min / IP       | `{ email, password }`       | `200 { accessToken, refreshToken, user }` |
| POST   | `/api/auth/refresh`         | refresh token in body | global default 60/min | `{ refreshToken }`          | `200 { accessToken, refreshToken, user }` |
| POST   | `/api/auth/logout`          | bearer                | global default        | `{ refreshToken }`          | `204 No Content`                          |
| POST   | `/api/auth/forgot-password` | —                     | 3 / hour / IP         | `{ email }`                 | `200 { ok: true }` (no-leak — always 200) |
| POST   | `/api/auth/reset-password`  | —                     | 5 / 15 min / IP       | `{ token, newPassword }`    | `204 No Content`                          |
| POST   | `/api/auth/verify-email`    | —                     | global default        | `{ token }`                 | `200 { ok: true, userId }`                |
| POST   | `/api/auth/oauth/google`    | —                     | 10 / 15 min / IP      | `{ idToken }`               | `200 { accessToken, refreshToken, user }` |

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
- `/api/auth/refresh` and `/api/auth/logout` — fall back to global default (60/min/user).

When exceeded, returns `429 RATE_LIMIT_EXCEEDED` with the standard envelope.

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

| Endpoint          | What it does                                                                                                                                            | Token TTL |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `forgot-password` | If email matches LOCAL user: generates token, emails reset link, audits PASSWORD_RESET_REQUESTED. Always returns 200 (no-leak).                         | 1 hour    |
| `reset-password`  | Consumes token in transaction with: password rotation + revoke ALL refresh tokens (forces re-login everywhere). 410 GONE if token invalid/expired/used. | —         |
| `verify-email`    | Consumes token, sets `User.emailVerified=true`. Sent automatically after `register()` (fire-and-forget).                                                | 24 hours  |

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
| `/auth/resend-verification`                    | S2.5 (small)                             |
| `/auth/oauth/apple`                            | deferred — needs Apple Developer account |
| MFA via TOTP                                   | post-v1                                  |
| WebAuthn passkeys                              | post-v1                                  |
| Audit log surfacing in Pulso                   | S25                                      |
| Account linking (`POST /api/user/link-google`) | post-v1                                  |
| Cleanup job for old reset/verify tokens        | S3 (BullMQ worker)                       |

## Testing

- **Unit:** `auth.service.spec.ts` — 21 tests covering all flows + audit events + constant-time guarantee.
- **E2E:** `auth.e2e-spec.ts` — 10 tests booting the full AppModule with mocked Prisma. Covers global prefix, validation envelope, throttler, JwtAuthGuard, and end-to-end register → login → logout.

Run: `pnpm --filter @psico/api test`
