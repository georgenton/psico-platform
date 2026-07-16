# ADR 0015 — Auth revision: server-side invalidation of live access tokens

**Status:** Accepted
**Date:** 2026-07-16

## Context

Access tokens are stateless JWTs with a 15-minute lifetime. `JwtStrategy` used
to validate them purely from the signature + `exp` claim — no database lookup.
That left a gap: server-side state changes (account disabled, password changed,
sessions revoked) did **not** invalidate an already-issued access token. It kept
working until its natural expiry. During the demo-credential incident
(2026-07-16) this surfaced concretely: `isActive=false` alone did not cut a live
session.

## Decision

Introduce a per-account **auth revision** counter and bind every access token to
the revision it was minted under.

1. `User.authRevision Int @default(0)`.
2. Every token emitter embeds `ar: user.authRevision` in the JWT (all funnel
   through `AuthService.issueTokens`: register, login, refresh, OAuth
   register, OAuth login).
3. `JwtStrategy.validate` is now **async** and does a DB lookup on every
   request. It rejects (flat 401) when:
   - the token has no `sub`,
   - the token has no `ar` (legacy token — fail-closed),
   - the user does not exist,
   - `user.isActive === false`,
   - `user.authRevision !== payload.ar`.
4. Revocation = **bump `authRevision` + delete all refresh tokens**, always
   together in one transaction (`revokeAllUserSessions(tx, userId)`). The bump
   kills live access tokens on their next request; the delete kills the ability
   to mint new ones from a stolen refresh token. Applied to: disable (incident
   response), password change, password reset, logout-all, and sensitive role
   change.

No Redis in v1 — the check is a single indexed `User` lookup, already the
cheapest query in the request path.

## Consequences

- **One-time global re-login on deploy.** Access tokens minted before this
  release carry no `ar` claim and are rejected. Refresh still works (refresh
  re-mints with `ar`), so clients recover on their next refresh; UX is a single
  re-auth.
- **+1 DB read per authenticated request.** Acceptable — it's a PK lookup.
- Per-device `logout` keeps soft-revoking a single refresh token and does **not**
  bump the revision (signing out one device must not sign out the others).
- Distinct from crisis / kill-switch flows — those are unchanged.

## Alternatives considered

- **Redis denylist of revoked token jti.** More moving parts, needs Redis on the
  hot path, and TTL bookkeeping. Deferred; the counter covers the need.
- **Shorter token lifetime.** Narrows but never closes the window, and increases
  refresh churn.
