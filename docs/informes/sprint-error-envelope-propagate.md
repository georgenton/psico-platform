# Sprint Error Envelope Propagate — `ErrorEnvelopeDto` en Users + Billing + Diario

**Fecha:** 2026-06-12
**Rama:** `feature/sprint-error-envelope-propagate`
**Tests:** 646/647 API (sin cambios) · 122/122 web · 20/20 mobile · 34/34 crypto

---

## Lo que se construyó

Sigue la deuda abierta del sprint anterior (#281, AuthController POC). Propaga el patrón `@ApiBadRequestResponse / @ApiUnauthorizedResponse / ...({ type: ErrorEnvelopeDto })` a los 3 controllers de mayor superficie del producto:

- **UsersController** (`/api/user/*`) — 15 endpoints. 400 + 401.
- **BillingController** (`/api/billing/*`) — 11 endpoints. 400 + 401.
- **DiarioController** (`/api/diario/*`) — 8 endpoints. 400 + 401 + **403** (PlanGuard).

Total: **34 endpoints × 2-3 status = 76 nuevas response references** typed con `ErrorEnvelopeDto` en `openapi.json`, sin tocar un solo handler.

### Decisiones por controller

**Users — 400 + 401 (no 429, no 403):**

- No tiene throttle a nivel controller (los throttles viven en Auth + Voice). Sin 429 wire.
- No tiene PlanGuard. Sin 403 wire. Si en un sprint futuro algún endpoint se gatea por Pro (e.g. `data-export` de cuentas Pro), agregar `@ApiForbiddenResponse` per-method.

**Billing — 400 + 401 (no 429, no 403):**

- Sin throttle declarado en el controller; el throttler global se encarga.
- No tiene PlanGuard — el plan se chequea a nivel feature module, no en `/billing` (billing es el módulo que GESTIONA el plan, no el que se gatea por él).
- Webhook (`POST /webhook`) hereda 400+401 también; no es un problema porque Stripe siempre firma con un cuerpo válido y no presenta JWT.

**Diario — 400 + 401 + 403:**

- `PlanGuard` activa el 403 (FREE puede crear hasta `PLAN_QUOTAS.diary.entriesPerMonth`, después 402 — pero el envelope shape es idéntico).
- Sin 429 (no throttle específico).
- Sin 410 (no token-consumption flows).

### Cliente generado

`packages/api-client/src/generated.ts`: **187.0 KB → 201.4 KB** (+14.4 KB, ~7.7% growth).

Consumers ahora pueden hacer type-safe error handling en cualquier flow crítico del producto:

```ts
const res = await diarioApi.createEntry({ ... });
if (!res.ok) {
  // typed body: ErrorEnvelopeDto
  if (res.body.code === "PLAN_QUOTA_EXCEEDED") { ... }
  if (res.body.statusCode === 403) { ... }
}
```

---

## Decisiones

1. **Class-level decorators (no per-method)** — los status codes aplican a TODOS los endpoints de la clase. Decorar la clase es ergonomic + DRY. Los casos que requieren un status code adicional (e.g. un endpoint específico que devuelve 410 GONE) usarán per-method en sprint futuro.
2. **No 429 en estos 3 controllers** — solo Auth tiene throttles per-controller; el throttler global del API emite 429 en todos lados, pero solo Auth lo declara explícitamente porque es la superficie más obvia (login, register, reset). Documentar 429 universal sería ruido en el cliente generado.
3. **403 solo en Diario** — único de los 3 con PlanGuard.
4. **Sin tests adicionales** — refactor metadata-only. La verificación visual de `openapi.json` confirma 76 referencias nuevas. El test alignment envelope-vs-filter es el siguiente sprint.
5. **Mantener `// eslint-disable-next-line consistent-type-imports`** en el import de `ErrorEnvelopeDto` — mismo pattern que el sprint anterior; el plugin necesita reflexión runtime.

---

## Smoke verification

```
API tests        646/647 (sin cambios — 1 sentinel skipped)
@psico/crypto    34/34
Web tests        122/122 (sin cambios)
Mobile tests     20/20 (sin cambios)
Typecheck        OK (API)
Lint             0 errors, 4 warnings preexistentes (any en specs de lector)
OpenAPI check    OK — generated.ts up to date
ErrorEnvelopeDto cobertura:
  Auth     → 8 ops · 400:8 401:8 429:8 (sprint anterior, intacto)
  Users    → 15 ops · 400:15 401:15
  Billing  → 11 ops · 400:11 401:11
  Diario   → 8 ops · 400:8 401:8 403:8
```

---

## Deuda técnica abierta

- **Otros controllers sin `ErrorEnvelopeDto` aplicado** — Books, Chapters, Progress, Eco, Voz, Lector, Patrones, Onboarding, Notifications, Pulso. El patrón está bien documentado; aplicación incremental en próximo sprint si se quiere cerrar la deuda.
- **No covers `409`/`410`/`422`** — necesitan per-method decorator. Auth ya tiene casos:
  - `/auth/reset-password` 410 GONE → declarar
  - `/auth/oauth/google` 409 EMAIL_ALREADY_REGISTERED → declarar
  - Diario `/entries/share` 422 → declarar
- **`details?` como `object`** — pierdes shape específico de cada error (validation errors vs domain context). Aceptable v1.
- **Sin spec test** que enforce shape match — siguiente sprint (Sprint 2/3 en serie actual).

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — refactor metadata-only.
3. Sprint 2/3 de la serie: **Spec test envelope-vs-filter alignment** (detección de drift cuando alguien añade un field al filter sin tocar el DTO).
4. Sprint 3/3: **Field-level JSDoc sembrado en DTOs críticos**.
