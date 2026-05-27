---
"@psico/api-client": patch
---

Sprint front-fase1 (Mi Plan) — web + mobile UI for the SubscriptionModule
endpoints landed in S7.

**`@psico/api-client`:** new `subscriptionApi.getMySubscription()` method.
The endpoint existed since S4 but had no client wrapper.

**Web (`@psico/web`):**

- New components under `src/components/dashboard/plan/`:
  - `UsageCards` — Server Component, 4 mini-cards with progress bars.
  - `InvoicesList` — Server Component, table with PDF links.
  - `SubscriptionActions` — Client Component, cancel modal + reactivate.
- Server actions `cancelSubscriptionAction` + `reactivateSubscriptionAction`
  with `revalidatePath("/dashboard/plan")`.
- `/dashboard/plan` page paralelises 4 fetches (`/me`, `/plans`, `/usage`,
  `/invoices`).

**Mobile (`@psico/mobile`):**

- New components under `src/components/dashboard/plan/` — RN paridad of
  the web set.
- `(tabs)/plan.tsx` adds `loadAll()` orchestrator + `RefreshControl`
  pull-to-refresh + integrated `SubscriptionActions` card.

Decisions: usage visible to FREE as preview, cancel reason capture as
free-text (no taxonomy), `Linking.openURL` for invoice PDFs.
