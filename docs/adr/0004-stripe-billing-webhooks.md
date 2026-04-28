# ADR 0004 — SubscriptionModule: Stripe como proveedor de billing con sincronización por webhooks

**Fecha:** 2026-04-28
**Estado:** Aceptado
**Autores:** Jorge Quizamanchuro

---

## Contexto

Psico Platform monetiza con un modelo freemium. Los planes de pago son:

| Plan   | Precio               | Audiencia                              |
| ------ | -------------------- | -------------------------------------- |
| FREE   | $0                   | Todos los usuarios registrados         |
| PRO    | $7/mes o $59/año     | Usuarios individuales (2 meses gratis) |
| ANNUAL | $59/año              | Alias del PRO anual (mismo precio)     |
| B2B    | $120/mes (≤50 users) | Equipos / instituciones                |

El `Plan` enum ya existe en el schema Prisma y en el `PlanGuard` del ContentModule. La tarea es añadir la capa de billing que mantiene ese campo sincronizado con el estado real del pago.

Se evaluaron las siguientes decisiones:

### Decisión A — Proveedor de pagos

| Opción         | Documentación | Soporte LATAM | Precios      | Notas                         |
| -------------- | ------------- | ------------- | ------------ | ----------------------------- |
| **Stripe**     | Excelente     | Sí            | 2.9% + $0.30 | SDK maduro, webhooks robustos |
| MercadoPago    | Media         | Excelente     | 3.49%+       | Dominante en LATAM consumer   |
| PayPal         | Buena         | Sí            | 3.49%+       | Alta fricción en Ecuador      |
| Kushki (local) | Limitada      | Ecuador       | Variable     | Útil para tarjetas locales    |

### Decisión B — Source of truth del plan de usuario

| Opción                                 | Consecuencia                                                       |
| -------------------------------------- | ------------------------------------------------------------------ |
| **Stripe (sincronizado por webhook)**  | La BD refleja lo que Stripe dice; un pago fallido revoca el acceso |
| Base de datos (Stripe como referencia) | Riesgo de desincronización si el webhook no llega                  |
| Polling a Stripe en cada request       | Latencia alta, dependencia online en hot path                      |

---

## Decisiones

### A — Stripe como único proveedor de billing

Usamos **Stripe** por su SDK de Node.js maduro, soporte de webhooks confiable, y documentación de integración con NestJS bien probada en producción. MercadoPago se evaluará en M7–M9 (B2B LATAM) si el mercado lo requiere — la abstracción del `SubscriptionModule` permite añadirlo sin cambiar los contratos HTTP.

Los Stripe Price IDs para el mercado ecuatoriano son:

- `STRIPE_PRO_MONTHLY_PRICE_ID` → $7.00 USD / mes
- `STRIPE_PRO_YEARLY_PRICE_ID` → $59.00 USD / año
- `STRIPE_B2B_PRICE_ID` → $120.00 USD / mes

### B — Stripe es la source of truth; la BD es una réplica sincronizada por webhooks

El campo `User.plan` y el modelo `Subscription` en la BD **reflejan** el estado de Stripe, no lo definen. El flujo es:

```
Usuario paga en Stripe Checkout
  → Stripe emite webhook (customer.subscription.created / updated / deleted)
  → SubscriptionModule procesa el evento
  → Actualiza Subscription.status y User.plan en PostgreSQL
  → PlanGuard del ContentModule lee User.plan desde la BD (sin latencia de red)
```

La idempotencia de webhooks se garantiza con el modelo `StripeEvent` (upsert por `stripeEventId`). Si Stripe reintenta un evento ya procesado, la operación es un no-op seguro.

### C — Checkout Session en lugar de Payment Intents directos

Usamos **Stripe Checkout** (hosted page) en lugar de Elements embebidos. Razones:

- Manejo automático de SCA (Strong Customer Authentication) por Stripe — relevante para tarjetas europeas si el producto escala.
- Sin PCI scope adicional — Psico Platform nunca ve datos de tarjeta.
- Tiempo de implementación 10× menor que Elements custom.

El **Billing Portal** de Stripe permite al usuario gestionar su suscripción (upgrade, downgrade, cancelación) sin que el equipo construya esas pantallas.

---

## Modelo de datos

```
User
  stripeCustomerId  String?  @unique   // se crea al primer checkout

Subscription
  stripeSubscriptionId  String   @unique
  stripePriceId         String
  stripeCustomerId      String
  status                SubscriptionStatus  // ACTIVE | TRIALING | PAST_DUE | CANCELED | INCOMPLETE
  plan                  Plan
  currentPeriodStart    DateTime
  currentPeriodEnd      DateTime
  cancelAtPeriodEnd     Boolean

StripeEvent
  stripeEventId  String  @unique   // Stripe event.id
  type           String            // e.g. "customer.subscription.updated"
  processedAt    DateTime
```

---

## Consecuencias

**Positivas:**

- El hot path (PlanGuard) nunca llama a Stripe — latencia de BD local.
- Webhooks con idempotencia robusta: re-delivery seguro.
- El Billing Portal elimina el 80% de la UI de billing del backlog.
- Migrar a MercadoPago en el futuro solo requiere un nuevo handler de webhooks y no rompe el contrato de `User.plan`.

**Negativas / trade-offs:**

- Si el webhook tarda (raro, pero posible), hay una ventana de desincronización. Aceptable para el caso de uso.
- Stripe no soporta pago en efectivo / transferencia bancaria Ecuador — se resolverá con Kushki o MercadoPago en M7+.
- El `stripeCustomerId` en `User` crea acoplamiento leve. Se acepta por la simplicidad que aporta.

---

## Alternativas descartadas

**MercadoPago ahora:** Dominante en consumer LATAM, pero su SDK es significativamente más complejo y su documentación para suscripciones recurrentes es incompleta. Se revisará en fase B2B.

**Polling a Stripe:** Latencia inaceptable en cada request autenticado. El PlanGuard se ejecuta en cada llamada al ContentModule.

**Elements embebidos:** Agrega PCI scope y semanas de implementación sin ventaja real en la fase de validación.

---

## Referencias

- [Stripe Checkout — integration guide](https://stripe.com/docs/checkout/quickstart)
- [Stripe Billing Portal](https://stripe.com/docs/billing/subscriptions/integrating-customer-portal)
- [Stripe Webhooks — best practices](https://stripe.com/docs/webhooks/best-practices)
- [NestJS + Stripe — community patterns](https://docs.nestjs.com/techniques/http-module)
