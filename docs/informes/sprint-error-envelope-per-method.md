# Sprint Error Envelope Per-Method — 409/410/422 en endpoints específicos

**Fecha:** 2026-06-12
**Rama:** `feature/sprint-error-envelope-per-method`
**Tests:** 653/654 API (sin cambios) · 122/122 web · 20/20 mobile · 34/34 crypto

---

## Lo que se construyó

Quinto sprint de la serie OpenAPI improvement (#281 POC Auth · #283 Users/Billing/Diario · #285 alignment spec · #287 field-level JSDoc · #289 cierre total controllers · este per-method).

Los sprints previos cubrieron status codes universales (400/401/403/429) a nivel clase. Quedaron 3 categorías de errores que solo aplican a endpoints específicos — `@ApiConflictResponse` (409), `@ApiGoneResponse` (410), `@ApiUnprocessableEntityResponse` (422). Hoy los 16 endpoints que los lanzan están documentados.

### Cobertura per-method

| Endpoint                                       | Status | Razón documentada                |
| ---------------------------------------------- | ------ | -------------------------------- |
| `POST /api/auth/register`                      | 409    | Email already in use             |
| `POST /api/auth/oauth/google`                  | 409    | Email collide con LOCAL provider |
| `POST /api/auth/reset-password`                | 410    | Token inválido/expirado/usado    |
| `POST /api/auth/verify-email`                  | 410    | Token inválido/consumido         |
| `POST /api/user/email-change-request`          | 409    | Email collision con otra cuenta  |
| `POST /api/books` (admin)                      | 409    | Slug taken                       |
| `POST /api/books/{slug}/chapters` (admin)      | 409    | Ordinal taken                    |
| `POST /api/patrones/weekly-summary/regenerate` | 422    | NOT_ENOUGH_ENTRIES               |
| `POST /api/terapia/bookings`                   | 409    | SLOT_TAKEN                       |
| `PATCH /api/terapia/sessions/{id}/reschedule`  | 409    | SLOT_TAKEN                       |
| `PATCH /api/autor/libros/{id}/capitulos/{n}`   | 409    | CHAPTER_VERSION_CONFLICT         |
| `POST /api/autor/libros/{id}/publicar`         | 409    | BOOK_NOT_DRAFT                   |
| `POST /api/autor/libros/{id}/despublicar`      | 409    | BOOK_NOT_PUBLISHED               |
| `POST /api/pulso/author-requests/{id}/approve` | 409    | Request not PENDING              |
| `POST /api/pulso/author-requests/{id}/reject`  | 409    | Request not PENDING              |
| `POST /api/pulso/users/{id}/role`              | 409    | Role already set                 |

**16 endpoints × 1 status cada uno = 16 nuevas response references typed.**

Cada `@ApiXxxResponse` incluye `description:` con el código machine-readable que el cliente espera (e.g. `SLOT_TAKEN`, `BOOK_NOT_DRAFT`) para que los devs sepan cómo narrow en el front sin abrir el código del backend.

### Cliente generado

`packages/api-client/src/generated.ts`: **293.9 KB → 299.4 KB** (~2% growth).

### Lo que el cliente ahora narra

Sample del impacto para los devs frontend:

```ts
// VS Code hover sobre la operación auth.register
post["/api/auth/register"]:
  Responses:
    200: AuthResponseDto
    400: ErrorEnvelopeDto - Validation error
    401: ErrorEnvelopeDto - Unauthorized
    409: ErrorEnvelopeDto - Email is already registered.   // ← nuevo
    429: ErrorEnvelopeDto - Rate limit exceeded
```

Los `description:` se propagan al `generated.ts` como comentarios JSDoc en cada response shape, y los IDEs los muestran en autocomplete.

---

## Decisiones

1. **Por-method en lugar de class-level** — estos status codes NO aplican a todos los endpoints del controller. Aplicarlos class-level introducía noise documental masivo (e.g. `POST /api/terapia/crisis` no puede devolver `SLOT_TAKEN`).
2. **Descripciones machine-readable code en text** — cada `description` cita el código exacto (`SLOT_TAKEN`, `BOOK_NOT_DRAFT`, `CHAPTER_VERSION_CONFLICT`, `NOT_ENOUGH_ENTRIES`) para que el dev sepa cómo branch. El cliente usa `body.code === "..."`, no `statusCode === 409`.
3. **Sin tocar el service** — todos los throws ya existen desde sprints originales. Esto es metadata-only.
4. **Patrones 422 documentado** — el rule es categorical (`NOT_ENOUGH_ENTRIES` vs validation 400). En UI eso significa "render empty state acumulador" en vez de "show validation error message".
5. **Auth 410 vs 401** — token-consumption flows usan 410 GONE (resource is permanently gone) en lugar de 401 (need to re-auth). El cliente debe redirigir a "solicitar nuevo enlace", no a login. Esa distinción ahora está en el contrato.

---

## Smoke verification

```
API tests        653/654 (sin cambios — 1 sentinel skipped)
@psico/crypto    34/34
Web tests        122/122 (sin cambios)
Mobile tests     20/20 (sin cambios)
Typecheck        OK (API)
Lint             0 errors, 4 warnings preexistentes
OpenAPI dump     278.7 KB → 283.9 KB
generated.ts     293.9 KB → 299.4 KB

Per-method cobertura verificada con script:
  ✓ POST /api/auth/register → 409
  ✓ POST /api/auth/reset-password → 410
  ✓ POST /api/auth/verify-email → 410
  ✓ POST /api/auth/oauth/google → 409
  ✓ POST /api/user/email-change-request → 409
  ✓ POST /api/books → 409
  ✓ POST /api/books/{slug}/chapters → 409
  ✓ POST /api/patrones/weekly-summary/regenerate → 422
  ✓ POST /api/terapia/bookings → 409
  ✓ PATCH /api/terapia/sessions/{id}/reschedule → 409
  ✓ PATCH /api/autor/libros/{id}/capitulos/{n} → 409
  ✓ POST /api/autor/libros/{id}/publicar → 409
  ✓ POST /api/autor/libros/{id}/despublicar → 409
  ✓ POST /api/pulso/author-requests/{id}/approve → 409
  ✓ POST /api/pulso/author-requests/{id}/reject → 409
  ✓ POST /api/pulso/users/{id}/role → 409

  16/16 ✓
```

---

## Deuda técnica abierta

- **Field-level JSDoc round 2** — los DTOs sin descriptions per-field aún son ~30. Aplicación incremental.
- **`details.code` enum** — `ErrorEnvelopeDto.details` queda como `unknown`. Los códigos machine-readable (SLOT_TAKEN, BOOK_NOT_DRAFT, etc) se documentan en el `description:` libre pero no son enum-validados. Sprint propio si querés enforce.
- **Sin spec test** que enforce que un `@ApiXxxResponse` per-method matcha con el throw real del service — todavía manual. La consistency entre service y controller se verifica visualmente.
- **Sin tests de regression** que detecten si alguien remueve un decorator per-method sin querer.

---

## Cierre de la serie OpenAPI improvement

Con este sprint cierran los **5 sprints** de OpenAPI improvement:

| #   | PR                                                            | Foco                                     | Tests   |
| --- | ------------------------------------------------------------- | ---------------------------------------- | ------- |
| 1   | [#281](https://github.com/georgenton/psico-platform/pull/281) | POC `ErrorEnvelopeDto` en AuthController | 646/647 |
| 2   | [#283](https://github.com/georgenton/psico-platform/pull/283) | Propagar a Users + Billing + Diario      | 646/647 |
| 3   | [#285](https://github.com/georgenton/psico-platform/pull/285) | Spec alignment envelope ↔ filter         | 653/654 |
| 4   | [#287](https://github.com/georgenton/psico-platform/pull/287) | Field-level JSDoc en 5 DTOs              | 653/654 |
| 5   | [#289](https://github.com/georgenton/psico-platform/pull/289) | Cierre total 19 controllers restantes    | 653/654 |
| 6   | (este)                                                        | Per-method 409/410/422                   | 653/654 |

**Cobertura final**:

- 164/165 endpoints con envelope 400+401 typed (Health excluido)
- 60 con 403, 33 con 429
- 16 endpoints con 409/410/422 per-method
- 1 spec test (7 tests) enforce alignment DTO ↔ filter
- 25 fields documentados con JSDoc en 5 DTOs críticos
- `generated.ts`: 175.5 KB inicial → 299.4 KB final (+70%, todo es type info útil)

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — refactor metadata-only.
3. Próximos sprints candidatos:
   - **Bugfix #2 Stripe price IDs reales** — deuda de ops desde Sesión 30, deuda más urgente para producción.
   - **Observability (Sentry)** — deuda macro.
   - **Field-level JSDoc seeding round 2** — incremental.
   - **Polish UX Phase 1** — audio playback lector, edit entry diario, mobile highlights/pagination.
