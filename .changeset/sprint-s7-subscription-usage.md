---
"@psico/types": minor
"@psico/api-client": minor
---

Sprint S7 — SubscriptionModule completo.

Four new endpoints close the billing surface per docs/design/handoff/09-plan.md.

**Backend (`@psico/api`):**

- `GET /api/subscriptions/usage` — single aggregator: books completed, eco
  messages, voice minutes, diary entries, plus per-plan quotas. Cached in
  Redis for 5 minutes.
- `GET /api/subscriptions/invoices?limit=N` — passthrough to `stripe.invoices.list`.
- `POST /api/subscriptions/cancel` — Stripe `cancel_at_period_end=true` +
  local mirror + busts the usage cache.
- `POST /api/subscriptions/reactivate` — idempotent, reverts the cancel.
- Schema: new `BillingUsageDay` rollup table, populated nightly at 02:00
  UTC by the new BullMQ `daily-usage` queue. Read by Pulso admin (v2), not
  by the live `/usage` endpoint.
- `IPaymentProvider` interface gains three required methods (`listInvoices`,
  `cancelAtPeriodEnd`, `reactivate`); StripeProvider implements them,
  PayphoneProvider stubs them.

**`@psico/types`:**

- `UsageResponse` + sub-shapes (`UsagePeriod`, `UsageBooks`, `UsageEco`,
  `UsageVoice`, `UsageDiary`).
- `InvoiceSummary`, `InvoiceListResponse`, `InvoiceStatus`.
- `CancelSubscriptionRequest`, `CancelSubscriptionResponse`,
  `ReactivateSubscriptionResponse`.

**`@psico/api-client`:**

- `subscriptionApi.createPortalSession`, `.getUsage`, `.listInvoices`,
  `.cancel`, `.reactivate`.
- `generated.ts` regenerated from the updated OpenAPI spec (62.1 KB → 65.5 KB).

**Quotas (default):**

| Plan       | Eco msgs  | Voice mins | Diary entries |
| ---------- | --------- | ---------- | ------------- |
| FREE       | 20        | 0          | unlimited     |
| PRO/ANNUAL | 200       | 120        | unlimited     |
| B2B        | unlimited | unlimited  | unlimited     |

`null` means unlimited. Enforcement lives in the feature modules; this
sprint only exposes the caps.

Eco/Voice counters return 0 until AIModule conversational (S10) and
VoiceModule (S8) land — the response shape is stable from day 1.
