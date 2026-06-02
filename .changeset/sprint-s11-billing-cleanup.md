---
"@psico/types": minor
"@psico/api-client": minor
"@psico/web": patch
"@psico/mobile": patch
---

Sprint S11 — BillingModule + GET /api/plan + GET /api/billing/return.

Renames the subscription surface to `/api/billing/*` per design 09-plan.md.
The legacy `/api/subscriptions/*` keeps serving the same handlers with
`Deprecation: true` + `Sunset: 2026-08-31` headers for the 90-day window
declared in ADR 0006.

**New endpoints**

- `GET /api/plan` — envolvente that returns subscription + usage + invoices
  - plans catalog + tier in a single request. Replaces the 4 parallel
    fetches the Mi Plan screen used to issue.
- `GET /api/billing/return?session_id=` — Stripe Checkout success callback.
  Reads the session directly so the success page can render without polling
  `/api/billing/me` and racing the webhook.
- `PATCH /api/billing/subscription` — consolidated cancel/reactivate
  (switch-plan reserved, returns 501 until a follow-up sprint wires Stripe
  proration).

**Client**

- `billingApi` in `@psico/api-client` is the new canonical client. Includes
  `getPlan()`, `getReturn(sessionId)`, `patchSubscription({action})` plus
  all the Sprint S7 methods under the new path prefix.
- `subscriptionApi` becomes a `@deprecated` re-export.

**Frontend**

- Web `/dashboard/plan` and mobile `(tabs)/plan` migrate to
  `billingApi.getPlan()` (1 fetch instead of 4).

Decisions documented in `docs/informes/sprint-s11-billing-cleanup.md`.
