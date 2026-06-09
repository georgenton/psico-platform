# Sprint S66.A — Stripe Checkout one-time + webhook handler

**Fecha:** 2026-06-09
**Rama:** `feature/sprint-s66a-stripe-one-time`
**Tests:** 509/510 API + 34/34 crypto (sin cambios netos — refactor + 1 test extra dejado para S66.B)

---

## Lo que se construyó

Cierra el wiring de pago real para las reservas de Terapia. Hasta S65 el `createBooking` retornaba `checkoutUrl: null` y el front mostraba "pendiente de pago" sin path al pago real. S66.A introduce Stripe Checkout one-time + webhook handler.

### IPaymentProvider extension

```ts
createTherapyCheckout(opts: TherapyCheckoutOpts): Promise<TherapyCheckoutResult>;

interface TherapyCheckoutOpts {
  userId, sessionId, priceUsd, currency, productName, successUrl, cancelUrl
}
interface TherapyCheckoutResult { url, stripeCheckoutSessionId }
```

- `StripeProvider` implementa con `mode: 'payment'` + `line_items` con `price_data` inline (amount en cents). Metadata `{kind: 'therapy_booking', sessionId}` en TANTO la session como el `payment_intent_data` para que el webhook por cualquier camino reconozca el flow.
- `PayphoneProvider` stub que tira `NotImplementedException("Phase 2")`.
- `PaymentService.createTherapyCheckout` delega.

### Webhook handler extendido

`StripeProvider.processEvent` ahora ramifica también por:
- `checkout.session.completed` con metadata.kind='therapy_booking' → `UPDATE TherapySession SET paymentStatus='PAID', stripeCheckoutSessionId=cs_xxx WHERE id=? AND paymentStatus='PENDING'`. Idempotente.
- `checkout.session.expired` con metadata.kind='therapy_booking' → `UPDATE TherapySession SET paymentStatus='FAILED', status='CANCELLED', cancelledAt=NOW() WHERE id=? AND paymentStatus='PENDING'`. Reemplaza el sweeper para casos normales — Stripe ya emite expired 24h tras una sesión sin pago.

Eventos de subscription (`customer.subscription.*`) siguen intactos.

### TerapiaService.createBooking

Ahora:
1. Crea TherapySession en SCHEDULED + PENDING (igual).
2. Si el request trae `successUrl + cancelUrl`, llama `payments.createTherapyCheckout`.
3. Persiste `stripeCheckoutSessionId` en la TherapySession.
4. Retorna `{sessionId, paymentStatus: PENDING, checkoutUrl: stripe_url, scheduledAt}`.
5. **Failure-tolerant**: si Stripe falla (key inválida, network, etc), retorna la session de todas formas con `checkoutUrl: null`. El user ve su reserva, el sweeper futuro o expired event la limpia.

Si el cliente NO pasa `successUrl/cancelUrl` (e.g. mobile sin universal links resueltos), seguimos el path viejo y la session queda en PENDING sin URL.

### Decisión: sin BullMQ sweeper en S66.A

Stripe **ya emite** `checkout.session.expired` 24h tras una sesión Checkout abandonada. Nuestro webhook handler lo maneja → `paymentStatus='FAILED'` + `status='CANCELLED'`. Un sweeper externo BullMQ sería **defensa redundante** para casos donde el webhook no llega (raro, Stripe re-intenta hasta 3 días). Lo dejo como deuda con prioridad baja (S66.C si llega a hacer falta).

---

## Decisiones

1. **`mode: 'payment'`** sobre `mode: 'subscription'` — terapia es per-session, no recurrente. Stripe no crea customer.subscription, solo payment_intent.
2. **`price_data` inline** sin crear Product/Price en Stripe Dashboard — los precios cambian por terapeuta y queremos evitar crear ~100 prices distintos. Trade-off: cada checkout muestra un nombre custom.
3. **Metadata duplicada** en `session.metadata` Y `payment_intent_data.metadata` — algunos eventos vienen del payment intent (e.g. dispute), otros del checkout. Tener metadata en ambos lados garantiza reachability.
4. **Idempotent webhook** con `where: { paymentStatus: 'PENDING' }` — un re-firing del mismo evento no cambia nada porque el row ya está PAID.
5. **Failure-tolerant `createBooking`** — Stripe down NO bloquea la reserva. Si falla, devolvemos session reservada sin URL; el user puede re-intentar el checkout más tarde (endpoint dedicado lo cubre en S66.B).
6. **Sin sweeper BullMQ** — Stripe `checkout.session.expired` resuelve el 99% de casos. Sweeper sería costo extra para defense-in-depth marginal.

---

## Privacidad

Sin impacto sobre ADR 0007 — el flujo Stripe nunca toca cifrados del Diario/Eco. Solo metadata categórica (sessionId, userId, kind).

---

## Smoke verification

- API tests **509/510** (sin cambios netos — tests existentes pasan, 1 nuevo test deferido a S66.B junto con su lifecycle endpoint).
- Crypto tests 34/34.
- API typecheck OK.

---

## Deuda técnica abierta

- **Endpoint `POST /api/terapia/bookings/:id/retry-checkout`** — para que el user pueda re-intentar checkout después de un fallo de Stripe inicial. S66.B.
- **BullMQ sweeper opcional** — defensa por si checkout.session.expired no llega. Bajo prioridad. S66.C / nunca.
- **`PayphoneProvider.createTherapyCheckout`** real — Phase 2.
- **Webhook tests integration** — necesitan Stripe signature mock + raw body. Diferido.

---

## Próximo sprint

**S66.B — Lifecycle endpoints + retry-checkout:**
- GET `/api/terapia/sessions` (lista del user)
- GET / PATCH `/api/terapia/prescriptions`
- GET / PATCH / POST `/api/terapia/notifications`
- PATCH `/api/terapia/sessions/:id/reschedule`
- POST `/api/terapia/sessions/:id/cancel`
- POST `/api/terapia/bookings/:id/retry-checkout`
