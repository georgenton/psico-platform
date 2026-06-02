# Sprint S11 — BillingModule + GET /api/plan + GET /api/billing/return

**Fecha:** 2026-06-02
**Rama:** `feature/sprint-s11-billing-cleanup`
**Tests:** 323/323 API + 34/34 crypto (sin cambios — sprint sin lógica nueva en cripto)
**Bitácora previa:** [bugfix #1-#3 deploy](deploy-2026-06-01-incident.md) · [sprint-front-eco.md](sprint-front-eco.md)

---

## §1 · Scope

El plan v2 numeraba este sprint como S11. El plan deja claro en su §6 que la
rebranding `subscription/*` → `billing/*` no era opcional — el diseño
(`docs/design/handoff/09-plan.md`) ya describía toda el área bajo `/api/billing/*`

- el envolvente `/api/plan`. Sprint S7 había implementado el set de Sprint S11
  **bajo el path viejo** (`/api/subscriptions/*`); este sprint cierra el deuda
  moviendo el contrato al path canónico, sin breaking changes.

Decisión gigante: **no movemos `apps/api/src/subscription/` físicamente** —
creamos `apps/api/src/billing/` que **reusa** los services del legacy módulo.
El legacy controller queda activo con headers `Deprecation: true` + `Sunset`
por 90 días según ADR 0006. Cuando esa ventana cierre (2026-08-31), una
sesión futura puede colapsar todo a `billing/`. Por ahora el riesgo de mover
el código en este sprint es desproporcionado al beneficio.

---

## §2 · Endpoints expuestos

| Método | Path nuevo (canónico)             | Path legacy (deprecated)        | Comportamiento                                                               |
| ------ | --------------------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/api/plan`                       | (nuevo)                         | Envolvente — `subscription + usage + invoices + plans + tier` en una request |
| GET    | `/api/billing/plans`              | `/api/subscriptions/plans`      | Catálogo público                                                             |
| GET    | `/api/billing/me`                 | `/api/subscriptions/me`         | Subscription actual                                                          |
| GET    | `/api/billing/usage`              | `/api/subscriptions/usage`      | Counters                                                                     |
| GET    | `/api/billing/invoices?limit=N`   | `/api/subscriptions/invoices`   | Stripe invoices                                                              |
| POST   | `/api/billing/checkout-session`   | `/api/subscriptions/checkout`   | Iniciar Stripe Checkout                                                      |
| POST   | `/api/billing/customer-portal`    | `/api/subscriptions/portal`     | Stripe Portal                                                                |
| GET    | `/api/billing/return?session_id=` | (nuevo)                         | Stripe success callback                                                      |
| PATCH  | `/api/billing/subscription`       | (nuevo, body discriminado)      | Cancel / reactivate / switch-plan                                            |
| POST   | `/api/billing/cancel`             | `/api/subscriptions/cancel`     | Compat                                                                       |
| POST   | `/api/billing/reactivate`         | `/api/subscriptions/reactivate` | Compat                                                                       |
| POST   | `/api/billing/webhook`            | `/api/subscriptions/webhook`    | Stripe webhook (doble exposure)                                              |

Los handlers legacy delegan a los mismos `SubscriptionService` / `PaymentService`
que los nuevos — no hay drift de comportamiento. El interceptor
`DeprecationInterceptor` adjunta los headers a cada response del legacy:

```
Deprecation: true
Sunset: 2026-08-31T23:59:59Z
Link: </api/billing>; rel="successor-version"; title="Sprint S11 billing rename"
```

---

## §3 · `GET /api/plan` — envolvente

El diseño 09-plan.md pide que la pantalla Mi Plan se renderice con un solo
fetch. La versión Sprint S7 hacía 4 (`me`, `plans`, `usage`, `invoices`) y
una más a `/user/me` en el layout. Eso son **5 round-trips** secuenciales
desde el cliente para una pantalla simple.

`PlanService.getPlan(userId)`:

1. Paraleliza `User.plan` + `getMySubscription` + `getUsage` + `listInvoices(12)` + `getPlans()`
2. Devuelve `PlanResponse` con `{ tier, subscription, usage, invoices, plans }`

El backend ya hacía estas 4 reads en paralelo internamente — server-side el
costo wall-clock es el mismo. Lo que cambia es: **1 round-trip de red** y
**1 auth header parse** en lugar de 4. Para pantallas como Mi Plan (visited
seguido), eso suma.

---

## §4 · `GET /api/billing/return` — Stripe success callback

Sin este endpoint, la página `/dashboard/plan/success` tenía que **pollear**
`/api/billing/me` para detectar cuándo el webhook procesó el evento. Eso es
una race condition feliz: el browser regresa de Stripe en ~500ms; el webhook
de Stripe puede tardar 1-3s. Resultado: el user veía "Procesando…" durante
2-5 segundos por timing de eventos asíncronos.

`StripeProvider.getCheckoutSessionStatus(sessionId)` ahora lee la session
directamente:

```typescript
const session = await stripe.checkout.sessions.retrieve(sessionId, {
  expand: ["subscription"],
});

if (session.status === "expired" || session.payment_status === "unpaid") {
  if (session.status === "expired") return { status: "failed", ... };
  return { status: "processing", ... };
}
return { status: "success", ... };
```

El handler NO promueve al user — eso queda como responsabilidad del webhook
(autenticado por firma). Esto es por seguridad: si actualizáramos `User.plan`
desde el handler, un actor malicioso podría llamarlo con un `session_id`
ajeno y promover a su user.

---

## §5 · `PATCH /api/billing/subscription` — body discriminado

El diseño consolida cancel + reactivate (+ switch-plan futuro) en un solo
endpoint con `body.action: "cancel" | "reactivate" | "switch-plan"`. Los
POSTs separados de Sprint S7 (`/cancel`, `/reactivate`) **se mantienen** por
compat durante la ventana de deprecación, pero el cliente nuevo
(`billingApi.patchSubscription`) usa el PATCH.

`switch-plan` está reservado en el contrato pero responde **501 NOT_IMPLEMENTED**
hoy — falta wirear `stripe.subscriptions.update({ proration_behavior })`.
Diferido al sprint que lo necesite (no urgente hasta que pidamos cambio de
plan en producción).

---

## §6 · Cliente — `billingApi` reemplaza `subscriptionApi`

`packages/api-client/src/billing.ts` expone `billingApi` con la API completa:

```typescript
billingApi.getPlan(); // envolvente
billingApi.getReturn(sessionId); // callback
billingApi.patchSubscription({ action: "cancel", reason });
billingApi.getPlans() / getUsage() / listInvoices(limit);
billingApi.createCheckoutSession(plan, success, cancel);
billingApi.createPortalSession(returnUrl);
billingApi.cancel() / reactivate(); // compat legacy
```

`subscriptionApi` queda como `@deprecated` re-export en `index.ts`. Cualquier
consumer existente sigue funcionando, pero el editor marca cada llamada con
warning amarillo para nudge a la migración.

---

## §7 · Frontend migrado

### Web — `apps/web/src/app/dashboard/plan/page.tsx`

**Antes** (Sprint S7):

```typescript
const [subscription, plans, usage, invoices] = await Promise.all([
  serverFetch<Subscription>("/subscriptions/me").catch(...),
  serverFetch<PlanInfo[]>("/subscriptions/plans").catch(...),
  serverFetch<UsageResponse>("/subscriptions/usage").catch(...),
  serverFetch<InvoiceListResponse>("/subscriptions/invoices?limit=12").catch(...),
]);
```

**Después** (Sprint S11):

```typescript
const plan = await serverFetch<PlanResponse>("/plan");
const { tier, subscription, usage, invoices, plans } = plan;
```

### Mobile — `apps/mobile/app/(tabs)/plan.tsx`

Misma migración. Mantiene el `loadAll` callback (que ahora hace 1 await en
lugar de 4) + el pull-to-refresh existente.

---

## §8 · Verificación

```bash
# back
pnpm --filter @psico/api test          # 323/323 ✓
pnpm --filter @psico/api typecheck     # ✓
pnpm --filter @psico/api lint          # ✓

# shared
pnpm --filter @psico/types build       # ✓
pnpm --filter @psico/api-client build  # ✓
pnpm --filter @psico/api-client generate:check  # ✓ (in sync con openapi.json existente)

# web
pnpm --filter @psico/web typecheck     # ✓
pnpm --filter @psico/web lint          # ✓

# mobile
pnpm --filter @psico/mobile typecheck  # ✓
pnpm --filter @psico/mobile lint       # ✓
```

---

## §9 · Deuda técnica abierta

- **`switch-plan` action no implementada** — el endpoint la acepta pero
  responde 501. Requiere `stripe.subscriptions.update({ proration_behavior })`.
- **OpenAPI regen para incluir `/api/plan` + `/api/billing/*`** — el `generated.ts`
  todavía refleja el openapi.json viejo (pre-S11). CI lo regenera en el próximo
  deploy cuando el dev server emita el JSON nuevo al boot. No bloquea nada
  porque los componentes usan `@psico/types` directamente.
- **Físicamente mover `subscription/` → `billing/`** — diferido al sprint
  post-deprecation (después de 2026-08-31). Riesgo bajo: el módulo viejo se
  queda activo sin cambios; las dos rutas convergen al mismo service.
- **Tests E2E de `Deprecation` headers** — faltan. Un test debería confirmar
  que cada response del SubscriptionController tiene los headers correctos.
- **Stripe price IDs reales** (Bugfix #2 sprint anterior) — `STRIPE_*_PRICE_ID`
  en Railway siguen siendo `prod_*` (product IDs). Hay que reemplazarlos por
  los `price_*` que Stripe Dashboard expone. Se cierra **en la misma PR de
  este sprint** vía instrucciones al user (§10).

---

## §10 · Acciones pendientes del user post-merge

Para que el checkout en producción funcione:

```bash
railway service psico-platform

# Reemplazar product IDs (prod_*) por price IDs (price_*):
# 1. Abrir https://dashboard.stripe.com/products
# 2. Por cada producto (PRO monthly, PRO yearly, B2B), copiar el "price ID"
#    que aparece en "Pricing" — empieza con price_, NO con prod_.
# 3. Actualizar las vars:
railway variables \
  --set "STRIPE_PRO_MONTHLY_PRICE_ID=price_TU_ID_MONTHLY" \
  --set "STRIPE_PRO_YEARLY_PRICE_ID=price_TU_ID_YEARLY" \
  --set "STRIPE_B2B_PRICE_ID=price_TU_ID_B2B"

# Si se va a probar el flow completo con webhook:
# 4. Stripe Dashboard → Developers → Webhooks → tu endpoint
#    El endpoint debe ser https://psico-platform-production.up.railway.app/api/billing/webhook
#    (ya está expuesto en doble por este sprint — también acepta el path viejo)
# 5. Reveal "Signing secret" (formato whsec_...)
railway variables --set "STRIPE_WEBHOOK_SECRET=whsec_REAL"
```

Sin estas envs, `/api/billing/checkout-session` y `/api/billing/return`
fallan con errores de Stripe SDK ("No such price prod\_..."), pero el resto
del API sigue funcionando.

---

## §11 · Resumen para Notion

**¿Qué se construyó?** Sprint S11 — completo. BillingModule en
`/api/billing/*` reusa los services del SubscriptionModule legacy
(que sigue activo con Deprecation headers por 90 días). Nuevo `GET /api/plan`
envolvente reemplaza 4 fetches del Mi Plan screen con 1. Nuevo
`GET /api/billing/return?session_id=` resuelve la race condition con el
webhook en la página de éxito. Nuevo `PATCH /api/billing/subscription`
con body discriminado consolida cancel/reactivate + reserva switch-plan
(501 hasta sprint futuro).

Cliente `@psico/api-client` agrega `billingApi`; el viejo `subscriptionApi`
queda `@deprecated` re-export. Web y mobile Mi Plan screens migrados a la
nueva API.

**¿Qué viene?**

1. User setea los Stripe price IDs reales en Railway (§10) — desbloquea
   revenue.
2. Sprint S6 LectorModule — highlights, annotations, ChapterBlock migration,
   reading session heartbeat, audio signed URL. **El reader es el core
   product que falta**.
3. Después de S6: S4-front Onboarding UI (backend ya en producción desde
   Sesión 16) o S10 PatternsModule (Pro feature).
