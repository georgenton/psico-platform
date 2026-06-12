# Sprint Error Envelope — `ErrorEnvelopeDto` para 4xx/429 en Auth

**Fecha:** 2026-06-12
**Rama:** `feature/sprint-narrow-users-billing`
**Tests:** 646/647 API · 122/122 web · 20/20 mobile · 34/34 crypto (sin cambios — metadata)

---

## Lo que se construyó

Cierra otra deuda del Swagger CLI plugin sprint (#269). Hasta hoy el cliente no tenía shape para errors — cada 4xx aparecía como `Record<string, never>`, aunque el `HttpExceptionFilter` (Sprint 0.A) ya emite un envelope unificado `{ statusCode, code, message, details?, timestamp, path }`. Hoy ese contrato está en OpenAPI + cliente generado.

### Shared (`apps/api/src/shared/dto/error-envelope.dto.ts`)

Nuevo `ErrorEnvelopeDto` class — single source of truth para la wire shape de errors. Cada field con JSDoc explicando uso (que el plugin surface como `description`). Shape match exacto con `HttpExceptionFilter.normalize()`.

### Auth controller (`apps/api/src/auth/auth.controller.ts`)

Decorators a nivel **clase** (cubren todos los endpoints automáticamente):

```ts
@ApiTags("Auth")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiTooManyRequestsResponse({ type: ErrorEnvelopeDto })
@Controller("auth")
export class AuthController { ... }
```

Resultado: 8 endpoints × 3 status (400/401/429) × `ErrorEnvelopeDto` = **24 nuevas response references** en openapi.json sin tocar handlers.

### Cliente generado

`packages/api-client/src/generated.ts`: **175.5 KB → 182.5 KB** (~4% growth).

Consumers ahora pueden hacer type-safe error handling:

```ts
// Pseudocode
const res = await authApi.login({ email, password });
if (!res.ok) {
  // typed body: ErrorEnvelopeDto
  if (res.body.code === "AUTH_INVALID_CREDENTIALS") { ... }
  if (res.body.statusCode === 429) { ... }
}
```

---

## Decisiones

1. **`ErrorEnvelopeDto` en `apps/api/src/shared/dto/`** — nueva carpeta. Lugar lógico para DTOs cross-module shared.
2. **Class-level decorators (no per-method)** — los 3 status codes aplican a TODOS los Auth endpoints. Decorar la clase es ergonomic + DRY.
3. **3 status codes (no más, no menos)**:
   - `400` — VALIDATION_ERROR / DTO shape errors (todos los endpoints)
   - `401` — AUTH_INVALID_CREDENTIALS / refresh expired (login/refresh path)
   - `429` — RATE_LIMIT_EXCEEDED (todos los endpoints están throttled)
4. **Sin `409`/`410`/`422` aquí** — esos los lleva endpoints específicos (e.g. password reset 410). Aplicarlos requiere per-method decorator. Diferido al sprint propio.
5. **Sin tests adicionales** — refactor metadata-only. Shape contract entre filter y DTO se verifica visualmente; futuro podría cubrirse con un spec.
6. **`details?: unknown`** — el plugin lo refleja como `type: object` en OpenAPI. Aceptable; en práctica el cliente narrow vía code/branching.

---

## Smoke verification

- API tests **646/647** (sin cambios).
- @psico/crypto **34/34**.
- Web tests **122/122** (sin cambios).
- Mobile tests **20/20** (sin cambios).
- Typecheck + lint OK en API + Web + Mobile.
- OpenAPI generate:check OK.
- Verified manually: `ErrorEnvelopeDto` schema completo en openapi.json + referencias en 400/401/429 de los 8 endpoints Auth.

---

## Deuda técnica abierta

- **Otros controllers sin `ErrorEnvelopeDto` aplicado** — UsersController, BooksController, BillingController, etc. Patrón documentado, aplicación incremental.
- **No covers `409`/`410`/`422`** — necesitan per-method decorator porque no todos los endpoints los pueden lanzar.
- **`details?` como `object`** — perdido específico de cada shape (validation errors vs domain context). Aceptable v1.
- **Sin spec test** que enforce `ErrorEnvelopeDto` shape matches `HttpExceptionFilter.normalize()` output. Si alguien añade un field al filter sin tocar el DTO, drift silencioso. Considerar.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — refactor metadata-only.
3. Próximos sprints: **Aplicar pattern a UsersController + BillingController**, **Field-level JSDoc sembrado**, **Observability (Sentry)**, **Spec test envelope-vs-filter alignment**.
