# Sprint Error Envelope Propagate (cierre) — `ErrorEnvelopeDto` en TODOS los controllers restantes

**Fecha:** 2026-06-12
**Rama:** `feature/sprint-error-envelope-propagate-rest`
**Tests:** 653/654 API (sin cambios) · 122/122 web · 20/20 mobile · 34/34 crypto

---

## Lo que se construyó

Cuarto sprint de la serie OpenAPI improvement (#281 POC Auth · #283 Users/Billing/Diario · #285 alignment spec · #287 field-level JSDoc · este #289 cierre total).

Hasta hoy: 5 controllers (Auth, Users, Billing, Diario, y los 8 sembrados con JSDoc) tenían el envelope typed. Los otros 19 controllers seguían sin él — Books, Chapters, Eco, Voz, Lector, Highlights, Annotations, Patrones, Onboarding, Notifications, Pulso, Home, Progress, Plan, LiveActivities, AI, Terapia, Subscription (legacy), Author. Hoy todos lo tienen.

### Cobertura final por controller

| Controller     | Tag                       | Ops        | 400                   | 401 | 403 | 429 |
| -------------- | ------------------------- | ---------- | --------------------- | --- | --- | --- |
| Auth           | Auth                      | 8          | ✓8                    | ✓8  | —   | ✓8  |
| Users          | Users                     | 15         | ✓15                   | ✓15 | —   | —   |
| Billing        | Billing                   | 12         | ✓12                   | ✓12 | —   | —   |
| Diario         | Diario                    | 8          | ✓8                    | ✓8  | ✓8  | —   |
| Books          | Books                     | 12         | ✓12                   | ✓12 | ✓12 | —   |
| Chapters       | Chapters                  | 3          | ✓3                    | ✓3  | ✓3  | —   |
| Eco            | Eco                       | 7          | ✓7                    | ✓7  | —   | ✓7  |
| Voice          | Voice                     | 2          | ✓2                    | ✓2  | ✓2  | ✓2  |
| Lector         | Lector                    | 4          | ✓4                    | ✓4  | —   | —   |
| Highlights     | Highlights                | 2          | ✓2                    | ✓2  | —   | —   |
| Annotations    | Annotations               | 3          | ✓3                    | ✓3  | —   | —   |
| Patrones       | Patrones                  | 3          | ✓3                    | ✓3  | ✓3  | —   |
| Onboarding     | Onboarding                | 11         | ✓11                   | ✓11 | —   | —   |
| Notifications  | Notifications             | 2          | ✓2                    | ✓2  | —   | —   |
| Pulso          | Pulso                     | 12         | ✓12                   | ✓12 | ✓12 | —   |
| Home           | Home                      | 2          | ✓2                    | ✓2  | —   | —   |
| Progress       | Progress                  | 2          | ✓2                    | ✓2  | —   | —   |
| Plan           | Billing                   | (incluido) | —                     | —   | —   | —   |
| LiveActivities | LiveActivities            | 3          | ✓3                    | ✓3  | —   | —   |
| AI             | AI · Eco                  | 4          | ✓4                    | ✓4  | ✓4  | —   |
| Terapia        | Terapia                   | 24         | ✓24                   | ✓24 | —   | —   |
| Subscription   | Subscription (deprecated) | 9          | ✓9                    | ✓9  | —   | —   |
| Author         | autor                     | 16         | ✓16                   | ✓16 | ✓16 | ✓16 |
| Health         | Health                    | 1          | (excluido por diseño) |     |     |     |

**Total: 165 endpoints · 164 con 400+401 envelope typed · 60 con 403 · 33 con 429.**

### Cliente generado

`packages/api-client/src/generated.ts`: **212.3 KB → 293.9 KB** (+38% growth).

### Mapping de status codes por tipo de guard

| Guard / Throttle                                                                     | Status agregado                      |
| ------------------------------------------------------------------------------------ | ------------------------------------ |
| Cualquier handler (universal)                                                        | `400 VALIDATION_ERROR` (class-level) |
| `JwtAuthGuard` o sin guard pero presente algún `@UseGuards(JwtAuthGuard)` per-method | `401 UNAUTHORIZED` (class-level)     |
| `PlanGuard` + `@RequiredPlan(...)` o soft-lock por plan                              | `403 FORBIDDEN`                      |
| `RolesGuard` + `@RequiredRole(...)`                                                  | `403 FORBIDDEN`                      |
| `@Throttle(...)` o controller throttle-decorated                                     | `429 RATE_LIMIT_EXCEEDED`            |

### Health excluido

`HealthController` queda intencionalmente sin envelope:

- No autenticado (`SkipThrottle` desde S0.B).
- Solo retorna 200 OK o el `terminus` health-check JSON.
- Es el único endpoint que monitoring externo polea — su shape debe ser predecible para Pingdom/Railway healthcheck.

---

## Decisiones

1. **Class-level decorators sin per-method overrides** — Auth tiene per-method `@ApiOperation` + `@ApiOkResponse` per-method que sobreviven; el envelope class-level no los pisa.
2. **Terapia tiene endpoints públicos** (`crisis`) — declarar 401 class-level introduce ruido visual en Swagger UI para esos, pero los públicos no degradan funcionalmente. Alternativa per-method era 4× más código sin valor real.
3. **Subscription (deprecated)** se cubre igualmente — sigue activo durante el sunset window de 90 días (hasta 2026-08-31). Coherente con `/api/billing`.
4. **Sin status codes adicionales** (409/410/422) — los que aplican (Auth `/reset-password` 410, `/oauth/google` 409, Diario `/share` 422) quedan para el sprint per-method que viene después.
5. **Voice declara 403 + 429** además de los universales — sus dos endpoints lanzan ambos (PRO_REQUIRED + over-quota + throttle).

---

## Smoke verification

```
API tests        653/654 (sin cambios — 1 sentinel skipped)
@psico/crypto    34/34
Web tests        122/122 (sin cambios)
Mobile tests     20/20 (sin cambios)
Typecheck        OK (API)
Lint             0 errors, 4 warnings preexistentes
OpenAPI dump     188.6 KB → 278.7 KB
generated.ts     212.3 KB → 293.9 KB

Cobertura ErrorEnvelopeDto:
  Auth          8 ops × 400+401+429 = 24 refs
  Users        15 ops × 400+401      = 30 refs
  Billing      12 ops × 400+401      = 24 refs
  Diario        8 ops × 400+401+403 = 24 refs
  Books        12 ops × 400+401+403 = 36 refs
  Chapters      3 ops × 400+401+403 =  9 refs
  Eco           7 ops × 400+401+429 = 21 refs
  Voice         2 ops × 400+401+403+429 = 8 refs
  Lector        4 ops × 400+401      =  8 refs
  Highlights    2 ops × 400+401      =  4 refs
  Annotations   3 ops × 400+401      =  6 refs
  Patrones      3 ops × 400+401+403 =  9 refs
  Onboarding   11 ops × 400+401      = 22 refs
  Notifications 2 ops × 400+401      =  4 refs
  Pulso        12 ops × 400+401+403 = 36 refs
  Home          2 ops × 400+401      =  4 refs
  Progress      2 ops × 400+401      =  4 refs
  Plan          (incluido en Billing)
  LiveActivities 3 ops × 400+401     =  6 refs
  AI            4 ops × 400+401+403 = 12 refs
  Terapia      24 ops × 400+401      = 48 refs
  Subscription  9 ops × 400+401      = 18 refs
  Author       16 ops × 400+401+403+429 = 64 refs

  Total ~421 refs (vs 100 antes del sprint). Health excluido.
```

---

## Deuda técnica abierta

- **Per-method `409`/`410`/`422`** — Auth `/reset-password` 410 GONE, `/oauth/google` 409 EMAIL_ALREADY_REGISTERED, Diario `/share` 422. Sprint propio.
- **Field-level JSDoc en DTOs restantes** — el sprint anterior cubrió 5 DTOs; quedan ~30. Aplicación incremental.
- **`ErrorEnvelopeDto.details` schema** — sigue como `unknown` (`object` en OpenAPI). Vale la pena definir variants por code (e.g. `VALIDATION_ERROR.details: string[]`) en sprint propio si los consumers reportan que les cuesta narrow.
- **Sin tests de regression** que detecten si alguien elimina un decorator class-level sin querer. El alignment spec del sprint anterior solo cubre la shape del DTO, no su presencia per-controller.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — refactor metadata-only.
3. Próximos sprints candidatos:
   - **Per-method 409/410/422** en endpoints específicos (Auth, Diario share, OAuth).
   - **Field-level JSDoc seeding round 2** — UpdateDiaryEntryDto, CreateThreadDto/SendMessageDto Eco, ReportMessageDto, CreateBookFavoriteDto, etc.
   - **Observability (Sentry)** — sigue como deuda macro.
   - **Bugfix #2 Stripe price IDs reales** — deuda de ops desde Sesión 30.
