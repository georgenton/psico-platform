---
"@psico/types": minor
---

feat(types): add Subscription, SubscriptionStatus, PlanInfo and billing types (v0.3.0)

New exports:

- `SubscriptionStatus` — union type for subscription lifecycle states
- `BillingInterval` — PRO_MONTHLY | PRO_YEARLY | B2B
- `Subscription` — subscription domain entity
- `PlanInfo` / `PlanPrice` — plan catalog response shapes
- `CheckoutSessionResponse` / `PortalSessionResponse` — Stripe session URL responses
