# ADR 0005 — PaymentPool: Multi-Gateway Architecture with Strategy Pattern

**Date:** 2026-05-05  
**Status:** Accepted  
**Deciders:** Jorge Quizamanchuro

---

## Context

The `SubscriptionModule` was a Stripe-coupled monolith: `SubscriptionService` held all
Stripe initialization, checkout logic, portal logic, and webhook processing in one class.
This blocked the business goal of supporting Payphone — an Ecuadorian payment gateway —
without a full rewrite of the subscription flow.

Psico Platform's target market is Ecuador (validation phase), where card-based
international gateways like Stripe have lower adoption than local wallets. Payphone
(pagomedios.com) is the dominant local option. Ignoring it means losing a significant
segment of Ecuadorian users who prefer local payment methods.

### Constraints

- Phase 1: Stripe must remain fully operational with zero regression.
- Phase 2 (Payphone) integration does not have a committed timeline.
- A new provider must be addable without modifying existing provider code (Open/Closed).
- Provider selection must be environment-configurable for zero-code switchover.

---

## Decision

Introduce a **Strategy pattern** via a `IPaymentProvider` interface. Each payment
gateway is a provider that implements the interface. A `PaymentService` holds all
registered providers and selects the active one based on a config variable.

### Interface

```typescript
interface IPaymentProvider {
  readonly name: string;
  createCheckoutSession(...): Promise<CheckoutSessionResult>;
  createPortalSession(...):   Promise<PortalSessionResult>;
  handleWebhook(...):         Promise<void>;
  // optional extensions:
  getWebhookEventType?(...):  string;
  supportsRecurring?():       boolean;
}
```

### Provider registry (NestJS DI)

| Token               | Class              | Phase |
| ------------------- | ------------------ | ----- |
| `STRIPE_PROVIDER`   | `StripeProvider`   | 1     |
| `PAYPHONE_PROVIDER` | `PayphoneProvider` | 2     |

### Selection logic

`PaymentService.selectProvider()` reads `DEFAULT_PAYMENT_PROVIDER` from `ConfigService`.
Valid values: `"stripe"` (default) | `"payphone"`.

`SubscriptionService` becomes a pure orchestrator: it holds provider-agnostic concerns
(`getPlans`, `getMySubscription`) and delegates all payment operations to `PaymentService`.

---

## File structure

```
apps/api/src/subscription/
  providers/
    payment-provider.interface.ts   ← IPaymentProvider + DI tokens
    provider-tokens.ts
    stripe/
      stripe.provider.ts
      stripe.provider.spec.ts       ← 25 tests
    payphone/
      payphone.provider.ts          ← stub; real API: pay.pagomedios.com
      payphone.provider.spec.ts     ← 6 tests
  payment.service.ts                ← strategy selector
  payment.service.spec.ts           ← 10 tests
  subscription.service.ts           ← orchestrator
  subscription.service.spec.ts      ← 14 tests (updated)
  subscription.module.ts
```

---

## Consequences

### Positive

- **Open for extension:** adding KushkiProvider or PlaceToPayProvider requires only a
  new file + one line in `SubscriptionModule`. Nothing else changes.
- **Zero regression:** `StripeProvider` is the extracted, unchanged implementation of the
  old `SubscriptionService`. All 25 Stripe-specific tests pass.
- **Environment-switchable:** `DEFAULT_PAYMENT_PROVIDER=payphone` routes all new
  checkout sessions to Payphone with no deployment required.
- **Better test isolation:** each provider has its own spec file with granular mocking.

### Negative / trade-offs

- **Per-request provider selection is not yet implemented.** Phase 2 will need
  country-level routing (e.g. Ecuadorian users → Payphone, international → Stripe).
  The `selectProvider()` method is the natural place to add this logic.
- **Payphone stub raises `NotImplementedException`** until Phase 2. Do not set
  `DEFAULT_PAYMENT_PROVIDER=payphone` in production.
- **`supportsRecurring()`** is optional. Services that call `createPortalSession` on a
  provider returning `false` will get a `NotImplementedException`. A future guard
  could check this before routing.

---

## Alternatives considered

| Alternative                                                            | Rejected because                                                                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Keep monolith, add `if (provider === 'stripe')` branches               | Violates Open/Closed; grows indefinitely as providers are added                                                   |
| NestJS module per provider (separate `StripeModule`, `PayphoneModule`) | Overkill for Phase 1; complicates DI wiring without payoff                                                        |
| Abstract factory pattern                                               | More indirection than needed; Strategy is sufficient since provider selection is runtime config, not compile-time |

---

## Phase 2 implementation notes (Payphone Ecuador)

- **Checkout endpoint:** `POST https://pay.pagomedios.com/api/button/pay`
- **Auth:** `Authorization: Bearer <AppSecret>`, `AppId` in body
- **Webhook verification:** compare `X-PayPhone-Token` header against
  `PAYPHONE_WEBHOOK_TOKEN` env var
- **No recurring billing:** Payphone is a one-time payment gateway.
  `supportsRecurring()` returns `false`. Subscriptions must be simulated via
  periodic checkout or a separate recurring job.
- **New env vars needed:** `PAYPHONE_APP_ID`, `PAYPHONE_APP_SECRET`,
  `PAYPHONE_WEBHOOK_TOKEN`
