# IMPLEMENTATION_PLAN_v2.md

Plan completo de implementación del back de Psico Platform para alcanzar el diseño documentado en [docs/design/handoff/](docs/design/handoff/).

**Fecha de generación:** 2026-05-25
**Reemplaza:** [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) (v1, basado en lista corta — quedó obsoleto)
**Estado del back al generar este plan:** Sesión 9 cerrada con `UsersModule` parcial. 8 módulos en producción.
**Cobertura del plan:** 146 endpoints únicos · 17 módulos Nest · 5 ADRs nuevos.

---

## Tabla de contenido

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Decisiones transversales (ADRs requeridos)](#2-decisiones-transversales-adrs-requeridos)
3. [Estrategia de versionado y documentación](#3-estrategia-de-versionado-y-documentación)
4. [Mapa de módulos Nest](#4-mapa-de-módulos-nest)
5. [Inventario de los 146 endpoints](#5-inventario-de-los-146-endpoints)
6. [Plan por fases y sprints](#6-plan-por-fases-y-sprints)
   - Fase 0 — Fundamentos
   - Fase 1 — Experiencia core (M1–M6)
   - Fase 2 — Terapia v1 (cuando cierren los gates)
   - Fase 3 — B2B + Back-office
   - Fase 4 — Extras y v2 backlog
7. [Definition of Done por sprint](#7-definition-of-done-por-sprint)
8. [Riesgos y mitigaciones](#8-riesgos-y-mitigaciones)
9. [Checklist para empezar la siguiente sesión](#9-checklist-para-empezar-la-siguiente-sesión)

---

## 1. Resumen ejecutivo

### Qué hay hoy

| Módulo | Estado | Endpoints expuestos | Comentario |
|--------|--------|---------------------|------------|
| `AuthModule` | ✅ Producción | 4 (`register`, `login`, `refresh`, `logout`) | Falta: forgot/reset/verify-email, OAuth. |
| `ContentModule` (Books + Chapters + Progress) | ✅ Producción | 7 | Namespace `/content/*`, requiere rename. |
| `SubscriptionModule` | ✅ Producción | 5 | Namespace `/subscriptions/*`, requiere rename a `/billing/*`. |
| `AIModule` | ✅ Producción | 4 | Requiere rebrand a `EcoModule` + SSE + cifrado. |
| `StorageModule` | ✅ Producción | (interno) | R2/S3, ya usado por chapters/audio. |
| `HealthModule` | ✅ Producción | 1 | OK. |
| `PrismaModule` | ✅ Producción | (interno) | OK. |
| `UsersModule` | 🟡 Sesión 9 — código local | 12 | Aún sin migración Prisma aplicada, sin global prefix, sin email/queue infra. |

**Endpoints en producción que aterrizan en path v1 correcto:** 0 (todos sin `/api`).
**Endpoints requeridos por el diseño:** 146.
**Endpoints implementados (incluso parcial):** 23 (16 %).

### Qué construye este plan

Lleva el back de 23 endpoints fragmentados → 146 endpoints estructurados según diseño, con:

- API uniformemente bajo `/api/*` con versionado preparado (`/api/v1/*` opcional vía URI versioning de Nest).
- **OpenAPI/Swagger** generado automáticamente, publicado en `/api/docs` en dev/staging.
- **E2E encryption** real para Diario y Eco — cifrado en cliente, ciphertext en DB.
- **OAuth** (Google + Apple).
- **Rate limiting** por endpoint con `@nestjs/throttler`.
- **Idempotency keys** vía interceptor global en POSTs críticos.
- **Background jobs** vía BullMQ + Redis (data export, cuentas a borrar, weekly summaries, Pulso snapshots, transcripción de voz, IA helper de autor).
- **SSE streaming** para Eco messages + Author AI help.
- **Audit logs** para Pulso admin writes y Terapia bookings.
- **Multi-rol** (USER, AUTHOR, THERAPIST, ADMIN) sin tenant_id.

### Calendario macro (estimado)

| Fase | Duración | Sprints | Objetivo |
|------|----------|---------|----------|
| 0 — Fundamentos | 2 semanas | 0.A, 0.B | Cuerpo del back listo para crecer. |
| 1 — Core | 12 semanas | S1 – S12 | App usable end-to-end para mercado FREE+PRO. |
| 2 — Terapia v1 | 6 semanas | S13 – S18 | Vertical de terapia activada tras gates. |
| 3 — B2B | 8 semanas | S19 – S26 | Author + Pulso completos. |
| 4 — Extras | 4 semanas | S27 – S30 | Push, Wallpapers, Rutas. |
| 5 — v2 backlog | — | (futuro) | Terapeuta panel, Empleador, Matching, Progreso. |

**Total estimado:** 32 semanas · ~8 meses con 1 persona full-time. Realistic con paralelismo: 5–6 meses.

---

## 2. Decisiones transversales (ADRs requeridos)

Estas decisiones NO se reabren mientras dure el plan v2. Cada una debe quedar capturada en un ADR antes de tocar el código del sprint que las usa.

### ADR 0006 — Global API prefix + URI versioning

- **Decisión:** `app.setGlobalPrefix("api")` + `app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })`.
- **Consecuencia:** rutas pueden declararse en controllers como `@Controller({ path: "user", version: "1" })` y aterrizan en `/api/v1/user/*`. La docs viva del diseño dice `/api/user/*` sin versión — exponemos **ambos** alias inicialmente: `/api/*` y `/api/v1/*` apuntan al mismo handler; cuando saquemos v2 de una ruta, `/api/*` apunta al "stable" y `/api/v1/*` queda fijo.
- **Sprint:** 0.A.

### ADR 0007 — E2E encryption para Diario y Eco

- **Decisión:** clave maestra derivada en cliente con Argon2id (params: `m=64MB, t=3, p=4`) a partir de `password + per-user salt`. Server guarda **solo** ciphertext (XChaCha20-Poly1305, nonce 24B). Diario y Eco messages reciben `{ ciphertext, nonce }`.
- **No-recovery:** si el usuario pierde la password, pierde Diario y Eco. Esto debe ser explícito en la UI (banner en Diario y al cambiar password).
- **Cambio de password:** re-encriptar payload localmente con nueva clave; durante la transición se acepta doble clave por 24h.
- **Eco LLM inference:** server descifra **en memoria del worker**, envía al LLM, descarta. Nunca persiste plaintext ni en logs.
- **Sharing con terapeuta (Diario):** re-encrypt con `ephemeralKey` derivada del terapeuta — el cliente del paciente lo hace.
- **Sprint que lo introduce:** S6 (Eco) — Diario lo hereda en S7.

### ADR 0008 — Rate limiting + Idempotency

- **Rate limiting:** `@nestjs/throttler` con `ThrottlerGuard` global. Overrides por handler vía decorator. Reglas iniciales:
  - `/api/eco/messages` → 30/min/user; FREE: 10/día.
  - `/api/voz/transcribe` → 5/min/user.
  - `/api/auth/login` → 5/15min/IP.
  - `/api/auth/forgot-password` → 3/hora/IP.
  - default → 60/min/user.
- **Idempotency:** interceptor global `IdempotencyInterceptor` que lee header `Idempotency-Key` (UUID v7). Para POSTs en `/billing/checkout-session`, `/terapia/bookings`, `/diario/entries`, `/eco/messages`: cachea respuesta en Redis 24h, devuelve la misma para reintentos.
- **Sprint:** 0.B.

### ADR 0009 — OAuth con Passport (Google + Apple)

- **Decisión:** `passport-google-oauth20` + `passport-apple` con `AuthCodeFlow`. Backend recibe el code, intercambia por token, crea/loguea usuario, retorna JWT pair propio. Usuario OAuth no tiene `passwordHash` — flujo de password reset deshabilitado en su perfil.
- **Field nuevo en User:** `authProvider: "local" | "google" | "apple"`.
- **Sprint:** S2.

### ADR 0010 — Background jobs con BullMQ + Redis

- **Decisión:** un proceso `apps/worker` separado consume colas Redis. Colas:
  - `email` (Resend, prioridad alta)
  - `data-export` (ZIP de diario + eco + progress, sube a R2, signed URL 7d)
  - `account-deletion` (hard delete tras 30 días)
  - `weekly-summary` (regenera Patrones semanal)
  - `pulso-snapshots` (agregación nocturna)
  - `voz-transcribe` (Whisper)
  - `author-ai-help` (Anthropic SSE → buffer + replay)
- **Despliegue:** Railway service separado, mismo Redis que la API.
- **Sprint:** S3 (introduce `EmailModule` + worker scaffolding); cada feature posterior agrega sus jobs.

### ADR 0011 — Multi-rol sin multi-tenant

- **Decisión:** roles `USER` (default), `AUTHOR`, `THERAPIST`, `ADMIN` viven en `User.role`. No hay tabla `Tenant`; B2B se modela vía `Employer` (FK opcional en User).
- **Guards:** `@RequireRole("ADMIN")` (existe), agregar `@RequireRole("AUTHOR")`, `@RequireRole("THERAPIST")`.
- **Sprint:** S19 (Author) define `AUTHOR`; S13 (Terapia) define `THERAPIST` para v2.

---

## 3. Estrategia de versionado y documentación

### Versionado de API

- **Path:** todas las rutas viven bajo `/api/*`. Cuando saquemos v2 de una ruta, `/api/v1/<old>` y `/api/<new>` se exponen ambos hasta retirar la v1.
- **Compat window:** mínimo 90 días entre la introducción del nuevo path y la deprecación del viejo. Deprecation headers: `Deprecation: true` + `Sunset: <RFC 3339>`.
- **Breaking changes** disparan nuevo path versionado, nunca se cambian respuestas in-place.

### Versionado de paquetes

- **Changesets** ya configurado. Cada paquete (`@psico/types`, `@psico/api-client`, `@psico/hooks`, `@psico/ui`) tiene su semver propio.
- **`@psico/api-client` y `@psico/types`** se publican como **alpha** mientras dure este plan: `0.x.0-alpha.N`. Pasan a `1.0.0` solo cuando la API esté estable.
- **`@psico/api`** (server) no es paquete publicado — su versión vive en `CHANGELOG.md` propio.

### Documentación

- **OpenAPI:** integrar `@nestjs/swagger` en S0.B. Cada controller anotado con `@ApiTags`, `@ApiOperation`, `@ApiResponse`. Generación automática a `apps/api/openapi.json` en build. Servido en `GET /api/docs` (Swagger UI) en dev y staging; deshabilitado en prod.
- **OpenAPI → cliente tipado:** `openapi-typescript` corre en CI y emite `packages/api-client/src/generated.ts`. El cliente HTTP del front pasa a usar los tipos generados, eliminando drift.
- **ADRs:** [docs/adr/](docs/adr/) — 5 nuevos en este plan (0006–0010 + 0011).
- **Module README:** cada módulo nuevo trae `apps/api/src/<mod>/README.md` con: propósito, contratos, dependencias, deuda técnica. Se valida con un test E2E que el README existe.
- **Session log:** `CLAUDE.md` recibe una entrada por sprint (`### Sesión N — fecha`). Incluye commit hash, módulos tocados, deuda nueva.
- **CHANGELOG por módulo grande** (Auth, Billing, Eco, Diario, Terapia, Pulso, Author): `apps/api/src/<mod>/CHANGELOG.md` con cambios significativos.
- **Comentarios en código:** español para context histórico, inglés para spec técnica — congruente con CLAUDE.md.

### CI/CD adiciones

| Job | Trigger | Acción |
|-----|---------|--------|
| `lint` | PR | ESLint + Prettier check |
| `typecheck` | PR | `tsc --noEmit` por workspace |
| `test` | PR | Vitest, threshold de cobertura 70 % en módulos nuevos |
| `prisma-validate` | PR que toca `schema.prisma` | `prisma validate` + `prisma migrate diff` contra `main` |
| `openapi-diff` | PR | `openapi-diff` contra `main`; bloquea breaking changes sin major bump |
| `audit-endpoints` | PR | script que compara handlers exportados vs `docs/design/handoff/99-endpoints.md`; falla si hay drift sin actualización del doc |

---

## 4. Mapa de módulos Nest

Topología objetivo al cerrar el plan v2:

```
apps/api/src/
  app.module.ts
  main.ts                       ← setGlobalPrefix("api") + enableVersioning() + Swagger + Throttler

  shared/                       ← Nuevo: shared kernel (decorators, guards, interceptors, filters)
    decorators/
      current-user.decorator.ts
      required-role.decorator.ts
      required-plan.decorator.ts
      idempotency-key.decorator.ts
    guards/
      jwt-auth.guard.ts         ← re-export desde auth
      roles.guard.ts
      plan.guard.ts
    interceptors/
      idempotency.interceptor.ts
      logging.interceptor.ts
    filters/
      http-exception.filter.ts
    pipes/
      zod-validation.pipe.ts

  prisma/                       ← Existe
  storage/                      ← Existe
  config/                       ← Existe (extender envSchema)

  auth/                         ← Existe — expandir
    strategies/
      jwt.strategy.ts
      google.strategy.ts        ← S2
      apple.strategy.ts         ← S2

  users/                        ← Sesión 9 — completar migración + integrar email/queues

  onboarding/                   ← S4 nuevo

  home/                         ← S12 nuevo (último — depende de todo)

  books/                        ← S5 — reemplaza content/books/*

  lector/                       ← S6 — extrae content/chapters + content/progress

  diario/                       ← S7 nuevo (depende ADR 0007)

  voz/                          ← S8 nuevo (Pro feature)

  eco/                          ← S9 — rebrand de ai/* + SSE + cifrado

  patrones/                     ← S10 nuevo (Pro feature)

  billing/                      ← S11 — rebrand de subscription/*

  reflection-prompts/           ← S12 (forma parte de Home pero merece módulo propio)

  terapia/                      ← S13–S18 nuevo (Fase 2)
    sub-modules: hub, therapists, bookings, sessions, crisis, prescriptions, intake, notifications

  autor/                        ← S19–S23 nuevo (Fase 3)
    sub-modules: dashboard, libros, capitulos, ai-help, versions, publicacion, cobros

  pulso/                        ← S24–S26 nuevo (Fase 3)

  push/                         ← S27 nuevo

  wallpapers/                   ← S28 nuevo

  rutas/                        ← S29 nuevo

  notifications/                ← S3 nuevo (Resend + email templates)

  jobs/                         ← S3 nuevo (BullMQ producer side)

apps/worker/                    ← S3 nuevo — proceso separado, consume colas
```

---

## 5. Inventario de los 146 endpoints

Numeración estable. Cada endpoint mapea a un sprint. Estado actual: ✅ existe / ⚠️ parcial / ❌ no existe.

### 5.1 Auth & cuenta (8 endpoints) — Sprint S1, S2

| # | Método | Ruta | Estado | Sprint | Notas |
|---|--------|------|--------|--------|-------|
| 1 | POST | `/api/auth/register` | ⚠️ | S1 | Falta solo prefix. |
| 2 | POST | `/api/auth/login` | ⚠️ | S1 | Falta prefix + rate-limit. |
| 3 | POST | `/api/auth/logout` | ⚠️ | S1 | Falta prefix. |
| 4 | POST | `/api/auth/refresh` | ⚠️ | S1 | Falta prefix. |
| 5 | POST | `/api/auth/forgot-password` | ❌ | S2 | Requiere ResendModule + `PasswordResetToken`. |
| 6 | POST | `/api/auth/reset-password` | ❌ | S2 | |
| 7 | POST | `/api/auth/verify-email` | ❌ | S2 | Requiere `EmailVerificationToken`. |
| 8 | POST | `/api/auth/oauth/:provider` | ❌ | S2 | Google + Apple (`provider`: `google`/`apple`). ADR 0009. |

### 5.2 Usuario (12 endpoints) — Sprint S3

| # | Método | Ruta | Estado | Sprint | Notas |
|---|--------|------|--------|--------|-------|
| 9 | GET | `/api/user/me` | 🟡 | S3 | Código en Sesión 9. Falta migración + global prefix. |
| 10 | PATCH | `/api/user/profile` | 🟡 | S3 | Idem. |
| 11 | POST | `/api/user/avatar` | 🟡 | S3 | Idem. |
| 12 | PATCH | `/api/user/preferences` | 🟡 | S3 | |
| 13 | PATCH | `/api/user/reader-preferences` | 🟡 | S3 | |
| 14 | PATCH | `/api/user/notifications` | 🟡 | S3 | |
| 15 | PATCH | `/api/user/privacy` | 🟡 | S3 | |
| 16 | PATCH | `/api/user/mood` | 🟡 | S3 | |
| 17 | POST | `/api/user/email-change-request` | 🟡 | S3 | Depende ResendModule (S2). |
| 18 | POST | `/api/user/password-change` | 🟡 | S3 | |
| 19 | POST | `/api/user/data-export` | 🟡 | S3 | Depende BullMQ worker (S3). |
| 20 | POST | `/api/user/delete-request` | 🟡 | S3 | Depende scheduler. |

### 5.3 Onboarding (11 endpoints) — Sprint S4

| # | Método | Ruta | Estado | Sprint | Notas |
|---|--------|------|--------|--------|-------|
| 21 | GET | `/api/onboarding/intro` | ❌ | S4 | Contenido editorial — vive en seed. |
| 22 | POST | `/api/onboarding/skip` | ❌ | S4 | |
| 23 | GET | `/api/onboarding/motivos` | ❌ | S4 | Catálogo de seed. |
| 24 | POST | `/api/onboarding/step1` | ❌ | S4 | `motivosIds` → `User.onboardingMotivos`. |
| 25 | GET | `/api/onboarding/moods` | ❌ | S4 | |
| 26 | POST | `/api/onboarding/step2` | ❌ | S4 | mood inicial → reusa `User.mood`. |
| 27 | POST | `/api/onboarding/step3` | ❌ | S4 | firstName + voicePreference. |
| 28 | GET | `/api/onboarding/recommendation` | ❌ | S4 | Algoritmo simple basado en motivos+mood. |
| 29 | POST | `/api/onboarding/complete` | ❌ | S4 | Marca `User.onboardingCompletedAt`. |
| 30 | GET | `/api/onboarding/tour` | ❌ | S4 | Pasos de tour de UI (constante). |
| 31 | POST | `/api/onboarding/tour/complete` | ❌ | S4 | |

### 5.4 Books & Lector (19 endpoints) — Sprints S5, S6

| # | Método | Ruta | Estado | Sprint | Notas |
|---|--------|------|--------|--------|-------|
| 32 | GET | `/api/books` | ⚠️ | S5 | Hoy `/content/books`. Falta `recos`, `categories`, `authors`. |
| 33 | GET | `/api/books/recos` | ❌ | S5 | Recomendaciones personalizadas. |
| 34 | GET | `/api/books/categories` | ❌ | S5 | Catálogo público. |
| 35 | GET | `/api/books/authors` | ❌ | S5 | Catálogo público. |
| 36 | GET | `/api/books/:id` | ⚠️ | S5 | Hoy `/content/books/:slug`. Aceptar id o slug. |
| 37 | POST | `/api/books/:id/start` | ❌ | S5 | Modelo `BookStart` o `startedAt` en UserBookState. |
| 38 | POST | `/api/books/:id/favorite` | ❌ | S5 | Toggle. |
| 39 | POST | `/api/books/:id/bookmark` | ❌ | S5 | Toggle. Distinto a favorite (favorite=guardar para más tarde; bookmark=marca dentro del libro). |
| 40 | GET | `/api/books/:id/reviews` | ❌ | S5 | Paginado. |
| 41 | POST | `/api/books/:id/reviews` | ❌ | S5 | Solo si `userProgress.completedAt`. |
| 42 | GET | `/api/lector/:bookId/:chapterN` | ⚠️ | S6 | Hoy `/content/books/:slug/chapters/:order`. |
| 43 | GET | `/api/lector/:bookId/:chapterN/audio` | ❌ | S6 | Signed URL + transcript. |
| 44 | PATCH | `/api/lector/session` | ❌ | S6 | Heartbeat (batch cada 5s desde cliente). |
| 45 | POST | `/api/lector/:bookId/:chapterN/complete` | ⚠️ | S6 | Hoy `/content/progress/:chapterId`. |
| 46 | POST | `/api/highlights` | ❌ | S6 | Modelo `Highlight`. |
| 47 | DELETE | `/api/highlights/:id` | ❌ | S6 | |
| 48 | POST | `/api/annotations` | ❌ | S6 | Modelo `Annotation`. |
| 49 | PATCH | `/api/annotations/:id` | ❌ | S6 | |
| 50 | DELETE | `/api/annotations/:id` | ❌ | S6 | |

### 5.5 Diario (7 endpoints) — Sprint S7

Depende de ADR 0007 — payload cifrado.

| # | Método | Ruta | Estado | Sprint | Notas |
|---|--------|------|--------|--------|-------|
| 51 | GET | `/api/diario/entries` | ❌ | S7 | Devuelve `textCiphertext` + `textNonce`. |
| 52 | GET | `/api/diario/entries/:id` | ❌ | S7 | |
| 53 | POST | `/api/diario/entries` | ❌ | S7 | Recibe ciphertext, valida formato pero no descifra. |
| 54 | PATCH | `/api/diario/entries/:id` | ❌ | S7 | |
| 55 | DELETE | `/api/diario/entries/:id` | ❌ | S7 | Hard delete (E2E — no hay nada que retener). |
| 56 | GET | `/api/diario/prompt-of-the-day` | ❌ | S7 | Determinístico por `userId + UTC date`. |
| 57 | POST | `/api/diario/entries/:id/share` | ❌ | S7 / S13 | Habilita en S7 con stub; activa real cuando exista Terapia. |

### 5.6 Voz (2 endpoints) — Sprint S8

| # | Método | Ruta | Estado | Sprint | Notas |
|---|--------|------|--------|--------|-------|
| 58 | POST | `/api/voz/transcribe` | ❌ | S8 | Whisper vía worker; máx 60MB; NO almacena audio. |
| 59 | POST | `/api/voz/usage` | ❌ | S8 | Reporta segundos; Pro tiene 120 min/mes. |

### 5.7 Eco (7 endpoints) — Sprint S9

| # | Método | Ruta | Estado | Sprint | Notas |
|---|--------|------|--------|--------|-------|
| 60 | GET | `/api/eco/threads` | ⚠️ | S9 | Hoy `/ai/conversations`. |
| 61 | POST | `/api/eco/threads` | ❌ | S9 | Hoy implícito; explicit en S9. |
| 62 | GET | `/api/eco/threads/:id` | ⚠️ | S9 | Hoy `/ai/conversations/:id/messages`. Agregar metadata. |
| 63 | DELETE | `/api/eco/threads/:id` | ❌ | S9 | |
| 64 | POST | `/api/eco/messages` | ⚠️ | S9 | Hoy `/ai/chat`. **Migrar a SSE.** Cifrado. |
| 65 | POST | `/api/eco/messages/:id/report` | ❌ | S9 | Razones: hallucination / off-tone / sensitive. |
| 66 | GET | `/api/eco/caps` | ❌ | S9 | Persona configurada (texto estático en seed). |

### 5.8 Plan & Billing (8 endpoints) — Sprint S11

| # | Método | Ruta | Estado | Sprint | Notas |
|---|--------|------|--------|--------|-------|
| 67 | GET | `/api/plan` | ❌ | S11 | Devuelve siempre JSON (FREE no es 404). Incluye `compare[]` + `faq[]` + `trust[]`. |
| 68 | POST | `/api/billing/checkout-session` | ⚠️ | S11 | Hoy `/subscriptions/checkout`. |
| 69 | GET | `/api/billing/return` | ❌ | S11 | Callback post-checkout (validar session_id de Stripe). |
| 70 | PATCH | `/api/billing/subscription` | ❌ | S11 | Switch plan / cancel / reactivate. |
| 71 | POST | `/api/billing/customer-portal` | ⚠️ | S11 | Hoy `/subscriptions/portal`. |
| 72 | GET | `/api/billing/invoices` | ❌ | S11 | Stripe `invoices.list({ customer })`. |
| 73 | GET | `/api/billing/usage` | ❌ | S11 | books/eco/voz this month. |
| 74 | POST | `/api/billing/webhook` | ⚠️ | S11 | Hoy `/subscriptions/webhook`. Migración coordinada con Stripe Dashboard. |

### 5.9 Home (2 endpoints) — Sprint S12

| # | Método | Ruta | Estado | Sprint | Notas |
|---|--------|------|--------|--------|-------|
| 75 | GET | `/api/home` | ❌ | S12 | Compone Users + Books + Diario + Eco + Patrones + Plan. |
| 76 | POST | `/api/reflection-prompts/:id/dismiss` | ❌ | S12 | |

### 5.10 Patrones (3 endpoints) — Sprint S10

| # | Método | Ruta | Estado | Sprint | Notas |
|---|--------|------|--------|--------|-------|
| 77 | GET | `/api/patrones` | ❌ | S10 | Pro only. |
| 78 | POST | `/api/patrones/weekly-summary/regenerate` | ❌ | S10 | Rate-limit 1/día. |
| 79 | POST | `/api/patrones/share-with-therapist` | ❌ | S10 / S13 | Stub en S10; activa real en S13. |

### 5.11 Terapia v1 boundary (26 endpoints) — Sprints S13–S18

| # | Método | Ruta | Estado | Sprint | Notas |
|---|--------|------|--------|--------|-------|
| 80 | GET | `/api/terapia/hub` | ❌ | S13 | Hub overview. |
| 81 | GET | `/api/terapia/therapists` | ❌ | S14 | Directorio + filtros. |
| 82 | GET | `/api/terapia/therapists/filters` | ❌ | S14 | Opciones disponibles. |
| 83 | GET | `/api/terapia/therapists/:id` | ❌ | S14 | Perfil completo. |
| 84 | GET | `/api/terapia/therapists/:id/reviews` | ❌ | S14 | |
| 85 | POST | `/api/terapia/therapists/:id/favorite` | ❌ | S14 | Toggle. |
| 86 | GET | `/api/terapia/therapists/:id/availability` | ❌ | S15 | Slots de 14 días. |
| 87 | POST | `/api/terapia/bookings` | ❌ | S15 | Stripe charge + slot lock. **Idempotency key.** |
| 88 | GET | `/api/terapia/sessions` | ❌ | S16 | Mis sesiones (upcoming/past). |
| 89 | GET | `/api/terapia/sessions/:id/prep` | ❌ | S16 | Pre-sesión. |
| 90 | PATCH | `/api/terapia/sessions/:id/prep` | ❌ | S16 | Intención cifrada E2E. |
| 91 | POST | `/api/terapia/sessions/:id/join` | ❌ | S16 | Token Daily.co (TTL 2h). |
| 92 | POST | `/api/terapia/sessions/:id/feedback` | ❌ | S16 | Post-sesión. |
| 93 | PATCH | `/api/terapia/sessions/:id/reschedule` | ❌ | S17 | |
| 94 | POST | `/api/terapia/sessions/:id/cancel` | ❌ | S17 | Política de refund. |
| 95 | POST | `/api/terapia/sessions/:id/technical-report` | ❌ | S17 | |
| 96 | GET | `/api/terapia/crisis` | ❌ | S13 | **Público, sin auth** — datos de líneas por país. |
| 97 | POST | `/api/terapia/crisis/log` | ❌ | S13 | Audit sin contenido. |
| 98 | GET | `/api/terapia/prescriptions` | ❌ | S18 | Recetas activas. |
| 99 | PATCH | `/api/terapia/prescriptions/:id` | ❌ | S18 | Marcar hecho. |
| 100 | GET | `/api/terapia/notifications` | ❌ | S18 | |
| 101 | PATCH | `/api/terapia/notifications/:id/read` | ❌ | S18 | |
| 102 | POST | `/api/terapia/notifications/read-all` | ❌ | S18 | |
| 103 | GET | `/api/terapia/intake` | ❌ | S15 | Cuestionario. |
| 104 | PATCH | `/api/terapia/intake` | ❌ | S15 | |
| 105 | POST | `/api/terapia/intake/complete` | ❌ | S15 | |

### 5.12 Autor B2B (18 endpoints) — Sprints S19–S23

Requiere rol `AUTHOR`. Esquema de datos separado: `AuthorProfile`, `AuthorBookDraft`, `BookVersion`, `AuthorPayout`.

| # | Método | Ruta | Estado | Sprint | Notas |
|---|--------|------|--------|--------|-------|
| 106 | GET | `/api/autor/dashboard` | ❌ | S19 | |
| 107 | POST | `/api/autor/libros` | ❌ | S19 | Crea draft. |
| 108 | GET | `/api/autor/libros/:id` | ❌ | S19 | |
| 109 | PATCH | `/api/autor/libros/:id` | ❌ | S19 | |
| 110 | DELETE | `/api/autor/libros/:id` | ❌ | S19 | Archive. |
| 111 | GET | `/api/autor/libros/:id/capitulos/:n` | ❌ | S20 | |
| 112 | PATCH | `/api/autor/libros/:id/capitulos/:n` | ❌ | S20 | Autosave cada 10s desde cliente. |
| 113 | POST | `/api/autor/libros/:id/capitulos/:n/audio` | ❌ | S20 | Multipart. |
| 114 | POST | `/api/autor/libros/:id/ai-help` | ❌ | S21 | SSE stream. Anthropic. |
| 115 | GET | `/api/autor/libros/:id/versiones` | ❌ | S21 | Snapshots 5min. |
| 116 | POST | `/api/autor/libros/:id/versiones/:vid/restore` | ❌ | S21 | |
| 117 | PATCH | `/api/autor/libros/:id/diseno` | ❌ | S22 | Cover settings. |
| 118 | POST | `/api/autor/libros/:id/cover-image` | ❌ | S22 | Multipart. |
| 119 | PATCH | `/api/autor/libros/:id/estructura` | ❌ | S22 | Reorder. |
| 120 | GET | `/api/autor/libros/:id/publicacion` | ❌ | S23 | Checklist publication. |
| 121 | POST | `/api/autor/libros/:id/publicar` | ❌ | S23 | Submit a review (estado `in-review`). |
| 122 | POST | `/api/autor/libros/:id/despublicar` | ❌ | S23 | |
| 123 | GET | `/api/autor/cobros` | ❌ | S23 | Revenue share. |

### 5.13 Pulso (admin back-office) (15 endpoints) — Sprints S24–S26

Rol `ADMIN`. Datos materializados nocturnamente en `pulso_snapshots`.

| # | Método | Ruta | Estado | Sprint | Notas |
|---|--------|------|--------|--------|-------|
| 124 | GET | `/api/pulso/overview` | ❌ | S24 | Payload completo del dashboard. |
| 125 | GET | `/api/pulso/books` | ❌ | S24 | Lista libros. |
| 126 | GET | `/api/pulso/books/:id` | ❌ | S24 | Drill-down libro. |
| 127 | GET | `/api/pulso/funnel` | ❌ | S25 | Funnel + cohortes + breakpoint detail. |
| 128 | GET | `/api/pulso/terapia/gates` | ❌ | S25 | Gates pre-launch. |
| 129 | POST | `/api/pulso/terapia/override` | ❌ | S25 | Audit log obligatorio. |
| 130 | PATCH | `/api/pulso/terapia/status` | ❌ | S25 | Encender Terapia. |
| 131 | GET | `/api/pulso/podcast` | ❌ | S26 | Estado. |
| 132 | POST | `/api/pulso/podcast/episodes` | ❌ | S26 | |
| 133 | PATCH | `/api/pulso/podcast/episodes/:n` | ❌ | S26 | |
| 134 | GET | `/api/pulso/podcast/episodes/:n/metrics` | ❌ | S26 | |
| 135 | GET | `/api/pulso/resources` | ❌ | S26 | |
| 136 | POST | `/api/pulso/resources/pieces` | ❌ | S26 | |
| 137 | PATCH | `/api/pulso/resources/pieces/:id` | ❌ | S26 | |
| 138 | GET | `/api/pulso/resources/pieces/:id/metrics` | ❌ | S26 | |

### 5.14 Push + Wallpapers + Rutas (7 endpoints) — Sprints S27–S29

| # | Método | Ruta | Estado | Sprint | Notas |
|---|--------|------|--------|--------|-------|
| 139 | POST | `/api/push/token` | ❌ | S27 | Registra APNs/FCM. |
| 140 | POST | `/api/push/live-activity` | ❌ | S27 | Server-initiated. |
| 141 | DELETE | `/api/push/live-activity/:id` | ❌ | S27 | |
| 142 | GET | `/api/wallpapers` | ❌ | S28 | Catálogo. |
| 143 | GET | `/api/wallpapers/:id/download` | ❌ | S28 | Signed URL. |
| 144 | GET | `/api/rutas` | ❌ | S29 | Bundles. **Opcional v1** según producto. |
| 145 | GET | `/api/rutas/:slug` | ❌ | S29 | |

### 5.15 Health (1 endpoint) — existe

| # | Método | Ruta | Estado | Sprint | Notas |
|---|--------|------|--------|--------|-------|
| 146 | GET | `/api/health` | ⚠️ | S0.A | Solo agregar prefix. |

### 5.16 v2 backlog (no en este plan, registrar para tracking)

- POST `/api/terapia/match` (Matching asistido)
- GET `/api/terapia/progreso` (Longitudinal)
- GET `/api/terapia/b2b/entitlement`
- `/api/terapeuta/*` (vista terapeuta — producto separado)
- `/api/empleador/*` (vista HR — producto separado)
- GET `/api/lector/:bookId/:chapterN/rise` (Lector experimental)

---

## 6. Plan por fases y sprints

### Fase 0 — Fundamentos (2 semanas)

#### Sprint 0.A — Global prefix, versioning, Swagger, shared kernel

**Objetivo:** que toda ruta futura nazca con `/api`, esté versionada y aparezca en Swagger.

**Endpoints introducidos:** 0 nuevos; **re-mapping de los 23 actuales** a `/api/*` con alias temporal sin prefix.

**Archivos:**
- `apps/api/src/main.ts` — `setGlobalPrefix("api")`, `enableVersioning({ type: URI, defaultVersion: "1" })`, `SwaggerModule.setup("/api/docs", ...)`. Exclude Stripe webhook.
- `apps/api/src/shared/` — crear directorio. Mover `current-user.decorator.ts` desde `content/guards/`, `required-role.decorator.ts`, `required-plan.decorator.ts`. Re-export.
- `apps/api/src/shared/filters/http-exception.filter.ts` — formato JSON único `{ statusCode, message, code, timestamp, path }`.
- `apps/api/src/shared/pipes/zod-validation.pipe.ts` — para handlers que prefieran Zod sobre class-validator.
- ADR 0006 escrito.
- `apps/api/package.json` — agregar `@nestjs/swagger`, `@nestjs/throttler`.

**Tests:**
- E2E test que `GET /api/health` retorna 200 y `GET /health` también (alias durante transición).
- Swagger se genera sin errores: `pnpm --filter @psico/api start` y `curl http://localhost:3001/api/docs-json | jq` no falla.

**Depende de:** —

---

#### Sprint 0.B — Rate limiting, idempotency, error envelope, OpenAPI → cliente

**Objetivo:** plataforma operativa segura. Cliente front consume tipos generados.

**Archivos:**
- `apps/api/src/shared/interceptors/idempotency.interceptor.ts` — lee `Idempotency-Key`, cachea response en Redis 24h.
- `apps/api/src/shared/throttler/throttler.config.ts` — config global del ThrottlerGuard.
- `apps/api/src/shared/decorators/throttle.ts` — sugar para override por handler.
- Redis client en `apps/api/src/redis/redis.module.ts` (`@nestjs-modules/ioredis`).
- ADR 0008 escrito.
- CI workflow `openapi-diff.yml` que valida cada PR.
- `packages/api-client/scripts/generate.mjs` — corre `openapi-typescript` contra `apps/api/openapi.json`.
- `.github/workflows/audit-endpoints.yml`.

**Tests:**
- `idempotency.interceptor.spec.ts`: misma key → misma response, distinta key → execute.
- `throttler` aplica límite por IP/usuario.

**Depende de:** 0.A.

---

### Fase 1 — Experiencia core (12 sprints)

#### Sprint S1 — AuthModule rate-limit + audit

**Objetivo:** endurece el AuthModule existente. Sin endpoints nuevos.

**Endpoints:** #1–#4 con prefix `/api/auth/*` (ya existen; cierra alias sin prefix).

**Archivos:**
- `auth.controller.ts` — `@Throttle(...)` en login/register/refresh.
- `auth.service.ts` — agrega `audit` log a tabla `AuthEvent` (login OK, login FAIL, refresh, logout). Útil para Pulso y para alerts.
- Prisma: agregar `AuthEvent` (userId nullable, type, ip, userAgent, createdAt). Index por userId+createdAt.
- README de módulo Auth.
- CHANGELOG Auth `1.1.0`.

**Tests:** mantener 12/12; agregar 3 para audit y throttler.

**Depende de:** 0.A + 0.B.

---

#### Sprint S2 — Auth email flows + OAuth

**Endpoints:** #5, #6, #7, #8.

**Archivos:**
- `apps/api/src/notifications/notifications.module.ts` — Resend client + templates (React Email).
- `apps/api/src/notifications/templates/password-reset.tsx`, `verify-email.tsx`, `email-change.tsx`.
- Prisma: `PasswordResetToken`, `EmailVerificationToken`. Hash SHA-256, expiresAt, usedAt.
- `auth.controller.ts` — handlers forgot-password / reset-password / verify-email / `oauth/:provider`.
- `auth/strategies/google.strategy.ts`, `apple.strategy.ts` (passport).
- Prisma: `User.authProvider` enum + Google/Apple `User.providerId` opcional.
- env schema: `RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID/SECRET`, `APPLE_*`.
- ADR 0009 escrito.

**Tests:** mocks de Resend + Google OAuth + Apple OAuth.

**Depende de:** S1.

---

#### Sprint S3 — UsersModule production-ready + Email + Worker scaffolding

**Endpoints:** #9–#20 (los 12 — código de Sesión 9 ya existe localmente).

**Archivos:**
- Aplicar migración Prisma `add_user_settings_and_account_lifecycle` (ya generada en Sesión 9).
- Conectar `requestEmailChange` con `NotificationsModule` (Resend).
- `apps/worker/` — nuevo workspace con BullMQ consumers.
- Colas: `email`, `data-export`, `account-deletion`.
- Crear `EmailWorker`, `DataExportWorker`, `AccountDeletionWorker`. Solo el de email tiene lógica real en este sprint; los otros consumen pero stub.
- `apps/api/src/jobs/jobs.module.ts` — producers (encola jobs).
- ADR 0010 escrito.

**Tests:** integration tests con BullMQ test driver.

**Depende de:** S2.

---

#### Sprint S4 — OnboardingModule

**Endpoints:** #21–#31.

**Archivos:**
- Prisma: `OnboardingState` (userId 1:1, motivosIds[], moodId, voicePreference, completedAt, tourCompletedAt, skipped).
- `OnboardingMotivo`, `OnboardingMood` catálogo (seed).
- `onboarding.controller.ts`, `onboarding.service.ts`, DTOs por step.
- `OnboardingRecommendationService` — algoritmo simple: motivos → bookId del catálogo (mapping seed).
- README onboarding.

**Tests:** happy paths por step + skip + tour.

**Depende de:** S3.

---

#### Sprint S5 — BooksModule rebrand + favorites/bookmark/reviews/recos/catalogos

**Endpoints:** #32–#41.

**Archivos:**
- Prisma: `BookFavorite` (userId, bookId), `BookBookmark` (idem), `BookReview` (rating, text, isApproved), `BookCategory`, `BookAuthor` (separar autor de campo plano).
- Migrar `Book.authorId` (FK) → `BookAuthor`.
- `books/books.module.ts` — nuevo namespace `/api/books/*`. Mantener alias `/api/content/books/*` 90 días.
- `books.service.ts` con métodos `findAll(filters)`, `findRecos(userId)`, `getCategories`, `getAuthors`, `toggleFavorite`, `toggleBookmark`, `getReviews`, `createReview`, `start`.
- `books.controller.ts`.
- Update `@psico/types` con `Book`, `BookSummary`, `BookCategory`, `BookAuthor`, `BookReview`, `BookRecommendation`.
- Update `@psico/api-client`.
- Update web/mobile para consumir nuevo namespace.
- CHANGELOG books.

**Tests:** filtros + paginación + 403 en review sin completar.

**Depende de:** S4.

---

#### Sprint S6 — LectorModule (texto, audio, session, highlights, annotations)

**Endpoints:** #42–#50.

**Archivos:**
- Prisma: `ChapterBlock` (chapterId, order, kind enum, content, meta json), `ReadingSession` (userId, bookId, chapterN, lastBlockSeen, timeSpentSec, lastReadAt), `Highlight` (userId, blockId, start, end, color, note opt), `Annotation` (userId, blockId, text).
- Migrar `Chapter.body` plano → `ChapterBlock[]` con migración data transformation.
- `lector/lector.module.ts` — encapsula los handlers GET capítulo, GET audio (signed URL), PATCH session, POST complete.
- `lector/highlights.controller.ts`, `lector/annotations.controller.ts` con CRUD.
- Ownership check en PATCH/DELETE.
- Audio: `getSignedUrl` desde StorageService con TTL 1h.

**Tests:** ownership + paywall (Pro chapter, FREE user) + session batched.

**Depende de:** S5.

---

#### Sprint S7 — DiarioModule (E2E encrypted)

**Endpoints:** #51–#57.

**Archivos:**
- Prisma: `JournalEntry` (userId, mood, kind, promptId opt, **textCiphertext**, **textNonce**, tags[], wordCount, audioUrl opt, audioDurationSec opt, sharedWithTherapistId opt, sharedUntil opt), `JournalPrompt` (text, category, isActive).
- `diario/diario.module.ts`.
- `diario.service.ts` con métodos CRUD + `getPromptOfTheDay(userId, date)` determinístico (`hash(userId+date) % activePrompts`).
- DTOs con validación de ciphertext (base64 url-safe + max 1MB).
- ADR 0007 escrito.
- Seed: 60 prompts iniciales.
- Background job: actualizar `User.currentStreakDays` y `longestStreakDays` cuando se crea una entrada.

**Tests:** server **NUNCA** descifra. Test que verifica que `textCiphertext` se persiste tal cual. Ownership.

**Depende de:** S6 + ADR 0007.

---

#### Sprint S8 — VozModule (Pro)

**Endpoints:** #58, #59.

**Archivos:**
- Prisma: `VozUsage` (userId, month, secondsUsed). Update atómico.
- `voz/voz.controller.ts` — `POST transcribe` con FileInterceptor (max 60MB), valida MIME audio/*.
- Worker `voz-transcribe`: lee buffer → Whisper API → devuelve transcript. No persiste audio.
- `voz/voz.service.ts` — chequea cuota FREE (0) / Pro (120 min/mes) antes de encolar.
- Decorator `@RequiredPlan("PRO")` aplicado.
- Rate limit `5/min/user`.

**Tests:** quota exceeded → 402; format inválido → 415; > 60MB → 413.

**Depende de:** S3 (worker scaffold) + S7 (modelo de uso ya en Diario).

---

#### Sprint S9 — EcoModule rebrand + SSE + cifrado + crisis

**Endpoints:** #60–#66.

**Archivos:**
- Prisma: `EcoThread` (userId, summary opt encrypted, lastMessageAt), `EcoMessage` (threadId, role, **textCiphertext**, **textNonce**, suggestions json), `EcoMessageReport` (messageId, reason, comment, status).
- Migrar `Conversation` → `EcoThread`, `ConversationMessage` → `EcoMessage` con script de migración.
- `eco/eco.module.ts`, `eco.controller.ts`, `eco.service.ts`.
- Handler `POST /messages` retorna `text/event-stream`. Eventos: `delta`, `suggestion`, `done`, `crisis`.
- Worker o in-process: descifra en memoria → Anthropic SDK con streaming → re-cifra delta a delta para devolver al cliente. **Nunca persiste plaintext.**
- Crisis detection: lista de palabras-clave en server + classifier ligero → corta el stream con evento `crisis` y redirige a `/api/terapia/crisis`.
- Rate limit: 30/min/user; FREE: 10/día.
- `EcoCapsService` — devuelve persona desde config.

**Tests:** SSE shape + crisis trigger + ownership en thread + quota FREE.

**Depende de:** S8 + ADR 0007.

---

#### Sprint S10 — PatronesModule (Pro)

**Endpoints:** #77–#79.

**Archivos:**
- Prisma: `WeeklySummary` (userId, weekStart, headline, narrativeCiphertext, narrativeNonce, generatedAt).
- `patrones/patrones.controller.ts` + service.
- Cómputo: el servidor agrega `moodMap` desde `JournalEntry.mood` (no requiere descifrar). `themes`, `vocab` se calculan **cliente-side** post-decrypt (privacy-preserving).
- Worker `weekly-summary`: cada lunes 03:00 UTC genera summary para usuarios Pro activos. Anthropic resume `[entries últimos 7 días → texto editorial]` — el resumen también se cifra antes de persistir.
- Rate limit regenerate: 1/día/user.

**Tests:** FREE → 403; menos de 7 entradas → 422 "Insuficiente data"; correlations honesty (UI test).

**Depende de:** S7 + S9.

---

#### Sprint S11 — BillingModule rebrand + invoices + usage + subscription PATCH

**Endpoints:** #67–#74.

**Archivos:**
- Renombrar `subscription/` → `billing/` (git mv).
- `billing.controller.ts` con:
  - `GET /plan` (envolvente — devuelve siempre JSON con `tier`, `plans[]`, `compare[]`, `faq[]`).
  - `POST /checkout-session` (alias del actual + idempotency key).
  - `GET /return?session_id=` (callback).
  - `PATCH /subscription` (switch / cancel / reactivate).
  - `POST /customer-portal`.
  - `GET /invoices` (wrap `stripe.invoices.list`).
  - `GET /usage` (joins books/eco/voz this month).
  - `POST /webhook` con doble exposure (`/api/billing/webhook` + `/subscriptions/webhook` por 30 días).
- Stripe Dashboard: agregar nuevo webhook URL **antes** de retirar el viejo.
- ADR 0004 actualizado (referencia paths nuevos).

**Tests:** webhook idempotency, switch-plan, reactivate.

**Depende de:** S10.

---

#### Sprint S12 — HomeModule (aggregator)

**Endpoints:** #75, #76.

**Archivos:**
- `home/home.controller.ts` (un solo handler GET).
- `home.service.ts` compone `UsersService.getMe`, `BooksService.findContinueReading`, `EcoService.recentThread`, `DiarioService.lastEntry + promptOfTheDay`, `BillingService.usage`, `PatronesService.weeklyGoalProgress`, `BooksService.recos`.
- `reflection-prompts/` mini módulo: `ReflectionPrompt` model con `dismissedAt`.
- HTTP cache header `Cache-Control: private, max-age=60`.

**Tests:** cada dependency mockeada; verificar shape exacto.

**Depende de:** S1–S11.

---

### Fase 2 — Terapia v1 (6 sprints)

Activación condicionada a los **gates de Pulso** (`/api/pulso/terapia/gates` cerrados en verde). Mientras tanto, los endpoints existen pero detrás de feature flag `terapia.enabled === false` que retorna 503 con `{ status: "pre-launch" }`.

#### Sprint S13 — TerapiaModule scaffold + Hub + Crisis

**Endpoints:** #80, #96, #97 + activación de #57 (diario share) y #79 (patrones share).

**Archivos:**
- Prisma: `Therapist` (id, name, licenseNumber, licenseVerified, bio, specialties[], modalities[], languages[], priceUsd, avgRating, reviewsCount, country, currency, acceptsInsurance, coverToken, isActive).
- `TherapistFavorite`.
- `CrisisLine` (country, name, phone, whatsapp, chatUrl, availability, languages[]).
- `CrisisLog` (userId, trigger, contactedLineId opt, createdAt).
- `terapia/terapia.module.ts` con feature flag from config.
- `terapia/hub.controller.ts`, `terapia/crisis.controller.ts`.
- `TerapiaConfig.enabled` desde env + Pulso PATCH `/pulso/terapia/status` lo actualiza vía Redis.
- Seed: 6 crisis lines (EC, MX, CO, AR, ES, US).

**Tests:** crisis es público (no auth); flag off → 503 en hub.

**Depende de:** S12.

---

#### Sprint S14 — Therapists directory + perfil + reviews + favorites

**Endpoints:** #81–#85.

**Archivos:**
- Prisma: `TherapistReview` (userId, therapistId, rating, text, isApproved).
- `TherapistEducation`, `TherapistCertification` (json arrays embebidos o tablas según UI).
- `therapists.controller.ts`, `therapists.service.ts` con filtros + paginación.

**Tests:** filtros combinados, search.

**Depende de:** S13.

---

#### Sprint S15 — Availability + Bookings + Intake

**Endpoints:** #86–#87, #103–#105.

**Archivos:**
- Prisma: `TherapistSlot` (therapistId, startAt, durationMin, isBooked), `Booking` (userId, therapistId, slotId, modality, firstReasonId, paymentMethodId, status, joinUrl opt, refundStatus opt, idempotencyKey unique).
- `Intake` (userId, answers json, completedAt).
- `bookings.controller.ts`: Stripe charge inside transaction + slot lock with SELECT FOR UPDATE.
- Idempotency obligatoria en bookings.
- ADR adicional: "Concurrency en bookings" (no abro nuevo ADR — incluir en CHANGELOG de Terapia).

**Tests:** doble-booking → 409; refund flow; intake autosave.

**Depende de:** S14.

---

#### Sprint S16 — Sessions: prep + feedback + join (video)

**Endpoints:** #88–#92.

**Archivos:**
- Prisma: `Session` (id, bookingId, scheduledAt, durationMin, modality, status, joinUrlExpiresAt opt), `SessionPrep` (sessionId 1:1, intentionCiphertext, intentionNonce, checkInMood, sharedEntryIds[]), `SessionFeedback` (sessionId 1:1, rating, tags[], noteCiphertext opt).
- Integración Daily.co o Whereby: `GET /sessions/:id/join` solo si dentro de ventana de 5 min antes. Crea joinToken.
- SessionLifecycleWorker: a 5 min antes envía push (S27) y notif (#100); a la hora de end, marca status=`completed`.

**Tests:** ventana de join; ownership.

**Depende de:** S15 + S7 (cifrado E2E).

---

#### Sprint S17 — Reschedule + cancel + technical-report

**Endpoints:** #93–#95.

**Archivos:**
- `bookings.service.ts` agrega `reschedule()` y `cancel()` con política de refund (>24h gratis; 12-24h 50%; <12h 0%).
- `TechnicalReport` (sessionId, issue, description, createdAt).

**Tests:** refunds por ventana.

**Depende de:** S16.

---

#### Sprint S18 — Prescriptions + Notifications

**Endpoints:** #98–#102.

**Archivos:**
- Prisma: `Prescription` (id, prescribedByTherapistId, userId, kind, targetId, dosage, note, dueBy, completedAt), `TerapiaNotification` (userId, kind, title, body, actionUrl, readAt, createdAt).
- `prescriptions.controller.ts`, `notifications.controller.ts`.

**Depende de:** S17.

---

### Fase 3 — B2B + Back-office (8 sprints)

#### Sprint S19 — AuthorModule scaffold + Books CRUD

**Endpoints:** #106–#110.

**Archivos:**
- Prisma: `AuthorProfile` (userId 1:1, title, licenseNumber, verified, payoutMethodId opt), `AuthorBookDraft` (status enum, replaces `Book` for draft state).
- Migrar `Book.authorId` para apuntar a `User.id` (rol AUTHOR).
- Guard `@RequireRole("AUTHOR")`.
- `autor/dashboard.controller.ts`, `autor/libros.controller.ts`.

**Depende de:** S5.

---

#### Sprint S20 — Capítulos editor + audio upload

**Endpoints:** #111–#113.

**Archivos:**
- Reutilizar `ChapterBlock` del S6.
- Versioning automático: cada `PATCH /capitulos/:n` crea fila en `BookVersion` (snapshot json).
- `capitulos.controller.ts` con conflict detection (etag-like).

**Tests:** conflict en doble sesión.

**Depende de:** S19.

---

#### Sprint S21 — AI Help + Versions

**Endpoints:** #114–#116.

**Archivos:**
- `autor/ai-help.controller.ts` retorna SSE.
- Worker `author-ai-help` corre Anthropic con prompt template por `intent`.
- Versions restore: copia snapshot json a chapter actual.

**Depende de:** S9 (SSE infra) + S20.

---

#### Sprint S22 — Diseño + Estructura

**Endpoints:** #117–#119.

**Archivos:**
- Prisma: `BookCover` (kind, gradientToken, imageUrl, titlePlacement, font).
- `diseno.controller.ts`, multipart upload de cover-image vía StorageService.
- `estructura.controller.ts` PATCH reorder con transacción.

**Depende de:** S20.

---

#### Sprint S23 — Publicación + Cobros

**Endpoints:** #120–#123.

**Archivos:**
- `Publication` (bookId, status enum, submittedAt, approvedAt opt, rejectedAt opt, rejectionReason opt, reviewerNotes opt).
- Publication review queue lo procesa ADMIN (Pulso).
- `AuthorPayout` (userId, month, revenueShareUsd, paidAt opt). Stripe Connect o transferencia manual en MVP.
- `cobros.controller.ts`.

**Depende de:** S22.

---

#### Sprint S24 — PulsoModule scaffold + Overview + Books admin

**Endpoints:** #124–#126.

**Archivos:**
- Prisma: `PulsoSnapshot` (date, period enum, payload json), `PulsoAuditLog` (actorId, action, payload, createdAt).
- Worker `pulso-snapshots` nocturno: agrega PostHog + Postgres → escribe snapshot.
- `pulso/overview.controller.ts`, `pulso/books.controller.ts`.
- Cache HTTP `private, max-age=300`.
- Guard `@RequireRole("ADMIN")`.

**Depende de:** integración PostHog + S12.

---

#### Sprint S25 — Pulso Funnel + Terapia gates

**Endpoints:** #127–#130.

**Archivos:**
- `pulso/funnel.controller.ts`, `pulso/terapia.controller.ts`.
- POST override + PATCH status escriben a `PulsoAuditLog`.
- PATCH status también dispara invalidación de cache de feature flag de Terapia (Redis).

**Depende de:** S24 + S13.

---

#### Sprint S26 — Pulso Podcast + Resources

**Endpoints:** #131–#138.

**Archivos:**
- Prisma: `PodcastEpisode`, `ResourcePiece`, `ResourceFormat` (catálogo).
- `pulso/podcast.controller.ts`, `pulso/resources.controller.ts`.

**Depende de:** S25.

---

### Fase 4 — Extras (4 sprints)

#### Sprint S27 — PushModule (APNs/FCM + Live Activities)

**Endpoints:** #139–#141.

**Archivos:**
- Prisma: `DeviceToken` (userId, platform, token, isActive).
- `push.controller.ts`.
- `LiveActivityService` con APNs HTTP/2.
- Integrar con Terapia (sesión countdown), Lector (Pro), Eco (Pro).

**Depende de:** S16.

---

#### Sprint S28 — WallpapersModule

**Endpoints:** #142, #143.

**Archivos:**
- Prisma: `Wallpaper` (id, title, byline, theme, seasonal, tierRequired), `WallpaperFormat` (wallpaperId, device, width, height, bytes, r2Key).
- `wallpapers.controller.ts`, signed URL via StorageService.

**Depende de:** S5.

---

#### Sprint S29 — RutasModule (opcional v1)

**Endpoints:** #144, #145.

**Archivos:**
- Prisma: `Bundle` (slug, title, subtitle, description, outcomeTags[], byline, priceUsd, discountPct, popularity, isActive), `BundleBook` (bundleId, bookId, order).
- `rutas.controller.ts`.
- Si pricing model "por-libro": integrar con BillingModule un nuevo SKU.

**Depende de:** S5 + S11.

---

#### Sprint S30 — Cleanup final + docs + ADRs faltantes

**Objetivo:** retirar aliases legacy, completar todos los READMEs, generar `apps/api/openapi.json` v1 estable.

**Archivos:**
- Borrar handlers en `/auth/*`, `/content/*`, `/subscriptions/*`, `/ai/*` sin prefijo `/api`.
- Borrar columnas/tablas legacy si las hay.
- Generar `docs/api/v1.html` (Redoc) y publicar como artefacto del repo.
- Marcar `@psico/api-client` y `@psico/types` como `1.0.0`.
- Cerrar todas las TODOs `senior:` que se hayan acumulado.

**Depende de:** todos los sprints anteriores.

---

## 7. Definition of Done por sprint

Un sprint **NO** se cierra hasta que todas estas casillas estén marcadas:

- [ ] Migración Prisma aplicada en CI y en Railway staging — `prisma migrate deploy` corre limpio.
- [ ] Endpoints nuevos con DTO validado (class-validator o ZodPipe).
- [ ] Test happy path + auth denial + edge case por endpoint nuevo. Cobertura ≥ 70 % en líneas nuevas.
- [ ] `@psico/types` extendido y publicado (changeset minor).
- [ ] `@psico/api-client` regenerado desde OpenAPI (CI lo hace, validar diff).
- [ ] Swagger muestra todos los endpoints nuevos con `@ApiTags`, `@ApiOperation`, `@ApiResponse`.
- [ ] `apps/api/src/<module>/README.md` actualizado (o creado).
- [ ] CHANGELOG del módulo grande actualizado.
- [ ] CLAUDE.md "Session log" agregado.
- [ ] ADR creado si el sprint introdujo patrón nuevo.
- [ ] Sin regresiones: `pnpm --filter @psico/api test` verde con baseline incrementada.
- [ ] OpenAPI diff CI: si hay breaking, está justificado en la PR description.

---

## 8. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| **Migración Stripe webhook URL** | Media | Alto | Doble exposure por 30 días en S11. Comparar event counts en ambos paths antes de retirar. |
| **E2E encryption mal implementado** | Media | Crítico | ADR 0007 + revisión externa de criptografía antes de mergear S7. Tests específicos que afirman que el server NUNCA tiene plaintext. |
| **Concurrencia en bookings** | Alta | Alto | `SELECT FOR UPDATE` + `idempotencyKey` único + retry policy. Tests de carga antes de S15 cerrar. |
| **OAuth en producción** (Google verificado) | Alta | Medio | Solicitar verificación Google a inicios de S2; iniciar review process que toma 4-6 semanas. |
| **Worker que cae sin notificar** | Media | Alto | Sentry + dead-letter queue + heartbeat job que pinea status cada 5 min. |
| **Cifrado bloquea búsqueda full-text en Diario** | Alta | Medio | Aceptado en ADR 0007: búsqueda es cliente-side post-decrypt. Documentar en handoff de UI. |
| **Daily.co/Whereby vendor lock-in** (S16) | Media | Medio | Encapsular en `VideoProviderService` con interface. Mismo patrón que PaymentPool. |
| **Anthropic rate limits en SSE de Eco** | Alta | Alto | Quota interna (cap antes que Anthropic). Fallback a respuesta no-stream si SSE falla. |
| **Pulso snapshots con datos obsoletos** | Baja | Bajo | `generatedAt` en cada response. UI muestra hora. |
| **Drift entre OpenAPI y código** | Alta | Medio | CI job `openapi-diff` + `audit-endpoints` falla la PR. |
| **Cobertura de tests baja en módulos B2B** | Alta | Medio | Definir budget de tests por módulo en CLAUDE.md antes de empezar Author. |
| **Cliente front no se actualiza al ritmo del back** | Media | Alto | Versionar `@psico/api-client` alpha y abrir PRs paralelas al web y mobile en cada sprint. |

---

## 9. Checklist para empezar la siguiente sesión

Cuando vuelvas a abrir Claude Code en esta repo:

### Estado al cerrar esta sesión

- ✅ Plan v2 producido: este archivo.
- ✅ Plan v1 marcado obsoleto: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) sigue ahí como referencia histórica.
- ✅ BACK_AUDIT.md sigue válido como snapshot 2026-05-25 (no regenerar).
- ✅ Schema Prisma extendido con `UsersModule` (Sesión 9) — listo para migrar.
- ✅ `@psico/types` extendido con 14 tipos nuevos.
- ✅ `apps/api/src/users/` con 12 endpoints (controller + service + 12 DTOs + 2 specs).
- ✅ `UsersModule` registrado en `app.module.ts`.

### Lo primero que toca en Sesión 10

1. Abrir el sprint que toque siguiendo el orden de [sección 6](#6-plan-por-fases-y-sprints).
2. Si es **Sprint 0.A** (recomendado empezar aquí):
   ```bash
   git checkout -b feature/sprint-0a-global-prefix
   pnpm --filter @psico/api add @nestjs/swagger @nestjs/throttler @nestjs-modules/ioredis ioredis
   # Editar apps/api/src/main.ts → agregar setGlobalPrefix, enableVersioning, SwaggerModule.setup
   # Crear apps/api/src/shared/ con decorators movidos
   # Test E2E que /api/health responde
   # ADR 0006
   ```
3. Si vas a **finalizar UsersModule (Sprint S3)**:
   ```bash
   git checkout -b feature/users-module-s3
   pnpm --filter @psico/api prisma migrate dev --name add_user_settings_and_account_lifecycle
   pnpm --filter @psico/api test -- users.service.spec
   # Verificar que el global prefix de 0.A está aplicado (de lo contrario los tests E2E no usarán /api)
   ```

### Decisiones pendientes que bloquean sprints

| Decisión | Bloquea | Necesita |
|----------|---------|----------|
| ¿Versioning URI o solo path? | Sprint 0.A | Tu input (default propuesto: URI con `/api/v1`). |
| ¿Cuándo encender E2E para Diario+Eco? | S7, S9 | ADR 0007 firmado. |
| ¿Daily.co vs Whereby para Terapia? | S16 | Llamada con vendors. Por defecto: Daily.co (mejor SDK). |
| ¿Worker en mismo Railway service o separado? | S3 | Costo Railway. Default: separado. |
| ¿Stripe Connect para Author payouts o transferencia manual? | S23 | Aceptación de complejidad fiscal. Default v1: manual con CSV export. |
| ¿Rutas (bundles) en v1 o backlog? | S29 | Producto. Default: backlog si Pro sub se mantiene. |

### Cómo retomar

Cuando llegues a la siguiente sesión, di solo:
- "Empecemos **Sprint 0.A**" → te llevo línea por línea desde `main.ts`.
- "Empecemos **Sprint S3** (cerrar Users)" → asumo 0.A hecho y voy directo al modulo.
- "Revisemos el plan" → reabro este archivo y validamos si algo cambió.

---

## Apéndice A — ADRs nuevos a producir durante el plan

| ADR | Título | Sprint que lo dispara |
|-----|--------|----------------------|
| 0006 | Global API prefix + URI versioning | 0.A |
| 0007 | E2E encryption para Diario y Eco | S6 (justo antes de S7) |
| 0008 | Rate limiting + Idempotency | 0.B |
| 0009 | OAuth (Google + Apple) | S2 |
| 0010 | Background jobs con BullMQ | S3 |
| 0011 | Multi-rol sin multi-tenant | S19 |
| 0012 | Video provider strategy (Daily.co) | S16 |
| 0013 | OpenAPI as source of truth para `@psico/api-client` | 0.B |

## Apéndice B — Tabla de dependencias entre sprints

```
                                          ┌──────────┐
                                          │ Sprint 0A│
                                          └─────┬────┘
                                                │
                                          ┌─────▼────┐
                                          │ Sprint 0B│
                                          └─────┬────┘
                                                │
                                          ┌─────▼────┐
                                          │ Sprint S1│
                                          └─────┬────┘
                                                │
                                          ┌─────▼────┐
                                          │ Sprint S2│  ←── Resend + OAuth
                                          └─────┬────┘
                                                │
                                          ┌─────▼────┐
                                          │ Sprint S3│  ←── UsersModule prod-ready + Worker
                                          └─────┬────┘
                                                │
                  ┌──────────┬──────────┬──────┴──────┬──────────┐
                  │          │          │             │          │
            ┌─────▼────┐┌────▼─────┐┌───▼──────┐┌─────▼────┐┌────▼─────┐
            │ Sprint S4││Sprint S5 ││Sprint S11││Sprint S13││Sprint S27│
            │  (Onb.)  ││ (Books)  ││(Billing) ││(Terapia) ││  (Push)  │
            └────┬─────┘└────┬─────┘└────┬─────┘└────┬─────┘└──────────┘
                 │           │           │           │
                 │     ┌─────▼─────┐     │     ┌─────▼─────┐
                 │     │Sprint S6  │     │     │S14 … S18  │
                 │     │ (Lector)  │     │     │ (Terapia) │
                 │     └─────┬─────┘     │     └───────────┘
                 │           │           │
                 │     ┌─────▼─────┐     │
                 │     │Sprint S7  │←────┤
                 │     │ (Diario)  │     │
                 │     └─────┬─────┘     │
                 │           │           │
                 │     ┌─────▼─────┐     │
                 │     │Sprint S8  │     │
                 │     │  (Voz)    │     │
                 │     └─────┬─────┘     │
                 │           │           │
                 │     ┌─────▼─────┐     │
                 │     │Sprint S9  │     │
                 │     │  (Eco)    │     │
                 │     └─────┬─────┘     │
                 │           │           │
                 │     ┌─────▼─────┐     │
                 │     │Sprint S10 │     │
                 │     │ (Patrones)│     │
                 │     └─────┬─────┘     │
                 │           │           │
                 └─────┬─────┴───────────┘
                       │
                 ┌─────▼─────┐
                 │Sprint S12 │  ←── HomeModule (cierra Fase 1)
                 └─────┬─────┘
                       │
                 ┌─────▼─────┐
                 │S19 … S23  │  ←── Autor B2B
                 └─────┬─────┘
                       │
                 ┌─────▼─────┐
                 │S24 … S26  │  ←── Pulso admin
                 └─────┬─────┘
                       │
                 ┌─────▼─────┐
                 │S28 / S29  │  ←── Wallpapers / Rutas
                 └─────┬─────┘
                       │
                 ┌─────▼─────┐
                 │Sprint S30 │  ←── Cleanup + 1.0.0
                 └───────────┘
```

---

**Fin del plan v2.**
*Última actualización: 2026-05-25 · Próxima revisión: tras cerrar Sprint 0.B.*
