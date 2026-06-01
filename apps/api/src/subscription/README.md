# SubscriptionModule

Owns the user's billing lifecycle: plans, checkout, customer portal, webhooks,
invoices, usage, cancel/reactivate.

## Architecture (post-Sprint S7)

```
SubscriptionController (HTTP surface)
        │
        ▼
SubscriptionService (orchestrator)
   │           │              │
   │           │              ▼
   │           │      UsageService ── Redis (5-min cache)
   │           │              │
   │           │              ▼
   │           │           PrismaService
   │           ▼
   │      PaymentService (provider selector)
   │           │
   │           ├── StripeProvider   (Phase 1, default)
   │           └── PayphoneProvider (Phase 2 stub)
   ▼
PrismaService (Subscription, BillingUsageDay, StripeEvent)
```

`SubscriptionService` is the only thing other feature modules import. It
delegates payment-gateway work to `PaymentService` (which selects the active
provider) and usage aggregation to `UsageService` (which reads from live
tables with a Redis cache).

## HTTP surface

All endpoints under `/api/subscriptions/*`. Auth on everything except
`/plans` (catalog, public) and `/webhook` (Stripe signature-verified).

| Method | Path                        | Auth | Description                             |
| ------ | --------------------------- | ---- | --------------------------------------- |
| GET    | `/subscriptions/plans`      | —    | Plan catalog                            |
| GET    | `/subscriptions/me`         | ✓    | The user's current subscription row     |
| POST   | `/subscriptions/checkout`   | ✓    | Create a Stripe Checkout session        |
| POST   | `/subscriptions/portal`     | ✓    | Create a Stripe Customer Portal session |
| GET    | `/subscriptions/usage`      | ✓    | Aggregated consumption (Sprint S7)      |
| GET    | `/subscriptions/invoices`   | ✓    | Stripe invoice history (Sprint S7)      |
| POST   | `/subscriptions/cancel`     | ✓    | Cancel at period end (Sprint S7)        |
| POST   | `/subscriptions/reactivate` | ✓    | Revert cancel-at-period-end (Sprint S7) |
| POST   | `/subscriptions/webhook`    | —    | Stripe webhook (signature-verified)     |

## `/subscriptions/usage` — the aggregator

One endpoint returns every counter the Mi Plan screen needs. Decision rationale
in [`docs/informes/sprint-s7-subscription-usage.md`](../../../../docs/informes/sprint-s7-subscription-usage.md#§3) — short version:

- Counters live in different feature modules (Diary, AI, Voice) so
  aggregating server-side is the minimum-friction surface for the front.
- Cached in Redis for 5 minutes per user — Mi Plan reloads on every visit
  but a chatty mobile client doesn't melt the DB.
- Counter sources today:
  - `books.completedThisPeriod` — live `UserProgress` join with `Chapter.totalChapters`.
  - `diary.entriesThisPeriod` — `DiaryEntry.count` in the period.
  - `eco.messagesThisPeriod`, `voice.minutesThisPeriod` — placeholder 0
    until AIModule conversational (S10) and VoiceModule (S8) land. The
    quotas are exposed so the UI can render "0 of 200" correctly.

## Plan quotas

Defined in [`quotas.ts`](./quotas.ts). `null` means unlimited.

| Plan   | Eco messages | Voice minutes | Diary entries |
| ------ | ------------ | ------------- | ------------- |
| FREE   | 20           | 0             | unlimited     |
| PRO    | 200          | 120           | unlimited     |
| ANNUAL | 200          | 120           | unlimited     |
| B2B    | unlimited    | unlimited     | unlimited     |

Enforcement lives in the feature modules that consume each counter — the
`/usage` endpoint only exposes the caps.

## Daily usage rollup (BullMQ)

A nightly job at 02:00 UTC populates `BillingUsageDay` rows for every active
user. The table is used by:

- **Pulso admin** (v2) — cohort metrics, usage trends.
- **Audit** — "did this user exceed their limit on day X?"

The `/usage` endpoint does NOT read this table — it queries live tables for
freshness. The two paths are intentionally independent so a rollup outage
doesn't break user-facing UX.

See [`apps/api/src/jobs/processors/daily-usage.processor.ts`](../jobs/processors/daily-usage.processor.ts)
for the rollup logic. The scheduler is registered by `JobsService.onModuleInit`.

## Provider strategy

`PaymentService.selectProvider()` returns Stripe today (controlled by
`DEFAULT_PAYMENT_PROVIDER` env). The `IPaymentProvider` interface is
deliberately small and explicit — see [`providers/payment-provider.interface.ts`](./providers/payment-provider.interface.ts).

Sprint S7 added three required methods to the interface (`listInvoices`,
`cancelAtPeriodEnd`, `reactivate`). The Payphone stub returns empty arrays
and throws `NotImplementedException` accordingly — when Payphone lands in
Phase 2 those will be wired to the corresponding Payphone API endpoints,
or routed through a different UX (Payphone doesn't have recurring billing).
