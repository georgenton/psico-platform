# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Psico Platform is a psychoeducation SaaS. The repo is a Turborepo monorepo managed with pnpm workspaces.

## Design source of truth

**El diseño completo del producto vive en `docs/design/`.** Es la fuente de verdad para shape de datos, endpoints, estados de pantalla y decisiones de privacidad.

### Cómo se usa

1. **Antes de implementar una pantalla nueva**, lee `docs/design/handoff/INDEX.md`. De ahí navegas al markdown específico (`docs/design/handoff/02-inicio.md`, etc.).
2. **Para diseñar un módulo NestJS desde cero**, primero genera el **Prisma schema** y el **DTO** desde el markdown del área. Eso te da el contrato. Luego el controller + service.
3. **Tabla consolidada de endpoints** está en `docs/design/handoff/99-endpoints.md` — útil para dimensionar y priorizar.
4. **Prototipos HTML** (`docs/design/*.html`) son navegables en el browser para entender flujos visuales. **No copies código de los `.jsx`** que viven ahí — son prototipos de diseño, no producción.

### Decisiones de privacidad (no negociables)

- **Diario** y **conversaciones de Eco** se almacenan E2E-encrypted. El backend recibe y devuelve `textCiphertext + textNonce`, nunca texto plano. La clave del usuario se deriva del password con Argon2id en el cliente. **No** existe path de recuperación criptográfica.
- **Crisis** (`/api/terapia/crisis`) es endpoint **público** sin auth. Es decisión ética: alguien en crisis no debería tener que loguearse para ver el número de la línea local.
- **Audio de voz** (`/api/voz/transcribe`) **no se almacena**. Solo se procesa para extraer transcript y se descarta.

### Mapeo de áreas de diseño → módulos NestJS actuales

**Actualizado 2026-06-13 tras audit completo.** Estado real verificado contra schema Prisma, módulos NestJS, web routes, mobile routes.

| Área de diseño | Backend | Web | Mobile | Estado |
|---|---|---|---|---|
| 01 — Onboarding (4 pasos + tour) | `OnboardingModule` (11 endpoints) | ✅ `/onboarding/*` (5 pantallas) | ✅ `(onboarding)/*` | ✅ **Completo** |
| 02 — Inicio (home) | `HomeModule` (3 endpoints) | ✅ `/dashboard` | ✅ `(tabs)/index.tsx` | ✅ **Completo** |
| 03 — Mi Biblioteca (catálogo) | `BooksModule` (12 endpoints) | ✅ `/dashboard/biblioteca` | ✅ `(tabs)/books/*` | ✅ **Completo** |
| 04 — Detalle de libro | `BooksModule` + `BookReview`/`BookFavorite`/`BookBookmark` | ✅ `/dashboard/biblioteca/[idOrSlug]` | ✅ `(tabs)/books/[slug]` | ✅ **Completo** |
| 05 — Lector + audio | `LectorModule` + `HighlightsModule` + `AnnotationsModule` (10 endpoints) | ✅ `/dashboard/biblioteca/[idOrSlug]/lector/[chapterOrder]` (full editor) | ✅ `(tabs)/books/[slug]/lector/[chapterOrder]` (view-only + heartbeat + annotations) | ✅ **Completo** (mobile text-selection diferido v2) |
| 06 — Diario (E2E) | `DiarioModule` (8 endpoints, cipher+nonce) + `@psico/crypto` | ✅ `/dashboard/diario` + `/dashboard/diario/[id]` (edit + delete) | ✅ `(tabs)/diario` + `(tabs)/diario/[id]` (edit + delete) | ✅ **Completo** |
| 07 — Voz (dictado) | `VoiceModule` (2 endpoints, Whisper + Deepgram providers) | ✅ `/dashboard/voz` (MediaRecorder) | ✅ `(tabs)/voz` (expo-av) | ✅ **Completo** |
| 08 — Eco (compañero IA) | `EcoModule` (7 endpoints, SSE streaming, crisis layers, cipher+nonce) | ✅ `/dashboard/eco` (chat + ThreadRail + crisis modal + reports) | ✅ `(tabs)/eco` (paridad + long-press reports) | ✅ **Completo** |
| 09 — Mi Plan (billing) | `BillingModule` (11 endpoints, doble exposure 90d con `SubscriptionModule` legacy) | ✅ `/dashboard/plan` | ✅ `(tabs)/plan` | ✅ **Completo** |
| 10 — Perfil | `UsersModule` (15 endpoints — profile, prefs, notifs, privacy, timezone, password rekey, data export, delete) | ✅ `/dashboard/perfil` + `/dashboard/security` + `/dashboard/notifications` | ✅ `(tabs)/profile` + `(tabs)/security` + `(tabs)/notifications` (deep-link only) | ✅ **Completo** |
| 11 — Terapia (18 sub-pantallas) | `TerapiaModule` (24 endpoints — Therapist, Sessions, Prescriptions, Crisis, Notifications, Reports) + `CrisisLog` público sin auth | ✅ `/dashboard/terapia/*` (10 rutas: hub, terapeutas, perfil, reservar, sesiones, sala, recetas, notificaciones, crisis) | ✅ `(tabs)/terapia/*` (paridad excepto admin) | ✅ **Completo** (gated por flag) |
| 12 — Patrones (insights) | `PatronesModule` (3 endpoints) + `WeeklySummary` (LLM-backed) + cron domingo | ✅ `/dashboard/patrones` (paywall FREE) | ✅ `(tabs)/patrones` (paywall FREE) | ✅ **Completo** |
| 13 — Rutas (bundles) | — | — | — | ❌ **No implementado** (no priorizado v1 — bundles de libros temáticos) |
| 14 — Dynamic Island | `LiveActivitiesModule` (stub backend con `LiveActivityToken` schema + APNs strategy ADR-0012) | — | — | ⚠️ **Backend stub solo** — falta iOS Live Activity surface + sesión activa cliente |
| 15 — Wallpapers | — | — | — | ❌ **No implementado** (no priorizado v1 — fondos descargables) |
| 16 — Editor de autor (B2B) | `AuthorModule` (16 endpoints — AuthorBook/Chapter/PublicationRequest/Earning/PayoutSetting) | ✅ `/autor/*` (dashboard, libros, capítulos, cobros) | — | ✅ **Completo** (web-only por diseño) |
| 17 — Pulso (back-office admin) | `PulsoModule` (12 endpoints — Overview con sparklines+deltas, Reports resolution, Cohort retention) + `PlatformMetricDaily` cron + `CohortRetentionWeek` cron | ✅ `/dashboard/admin/*` (overview, users, author-requests, reports, cohorts) | — | ✅ **Completo** (web-only por diseño) |

**Resumen:** 14/17 áreas completas (82 %). 1 área backend-stub (Dynamic Island). 2 áreas no implementadas y no priorizadas para v1 (Rutas, Wallpapers).

### Boundary v1 (lo que sí va al backend ahora)

Orden sugerido para los próximos sprints, alineado con `docs/design/handoff/99-endpoints.md`:

1. **Cerrar UsersModule** — surface de perfil, prefs, notifs, privacy. Pre-requisito de todo.
2. **HomeModule** — `/api/home` agrega de varios módulos para devolver el dashboard en una sola request.
3. **Expandir ContentModule** — favorites, bookmarks, reviews, highlights, annotations, lector session.
4. **DiaryModule (E2E)** — incluyendo crypto helpers en el cliente y `share-with-therapist` con re-encrypt efímero.
5. **Cerrar SubscriptionModule** — usage, customer-portal, invoice download.
6. **PatternsModule** — Pro feature, depende de DiaryModule.
7. **AIModule: capa Eco** — extender el RAG existente con threads + messages cifrados + SSE streaming + safety/crisis detection.
8. **OnboardingModule** — depende de UsersModule cerrado y ContentModule con recos.
9. **VoiceModule** — Pro only, depende de cuota de SubscriptionModule.

### v2 (después de validar v1 con usuarios pagos)

- TherapyModule (sólo cuando cierren los gates de Pulso — ver `docs/design/pulso/HANDOFF.md`)
- PulsoModule (back-office admin)
- AuthorModule (Editor de autor B2B)
- Push / Live Activities completas

## Commands

```bash
pnpm install          # Install all workspace dependencies
pnpm dev              # Start all apps and packages in dev mode (via Turborepo)
pnpm build            # Build all apps and packages
pnpm lint             # Lint all workspaces
pnpm test             # Run tests across all workspaces

# Run a single workspace
pnpm --filter @psico/api dev
pnpm --filter @psico/web dev
pnpm --filter @psico/mobile start

# Run a single test file (within a workspace)
pnpm --filter @psico/api test -- --testPathPattern=<file>
```

## Architecture

### Workspace layout

```
apps/
  api/       # NestJS REST API
  web/       # Next.js 14 (App Router)
  mobile/    # React Native + Expo
packages/    # Shared libraries (types, config, UI components, etc.)
docs/
  adr/       # Architectural decision records
  design/    # ⬅️ Diseño completo del producto — SOURCE OF TRUTH para UI/UX/endpoints
    handoff/         # Specs markdown por pantalla — empezar por INDEX.md
    pulso/HANDOFF.md # Spec de back-office
    *.html           # Prototipos navegables (no copiar código fuente)
```

### API — `apps/api`

NestJS application with a feature-module structure. Persistence is handled by Prisma (PostgreSQL). Redis is used for caching and session/queue work. Database schema lives in `apps/api/prisma/schema.prisma`; run `pnpm --filter @psico/api prisma migrate dev` to apply migrations in development.

### Web — `apps/web`

Next.js 14 using the App Router. All routes live under `apps/web/src/app/`. Server Components are the default; Client Components are opted in with `"use client"`.

### Mobile — `apps/mobile`

React Native with Expo. Start the dev client with `pnpm --filter @psico/mobile start` (Expo CLI).

### Shared packages — `packages/`

Cross-workspace code (shared types, ESLint/TypeScript configs, UI primitives, etc.). Import them via their workspace alias (e.g. `@psico/types`).

## CI/CD and tooling

- **Husky + lint-staged**: pre-commit hook runs linting and formatting on staged files.
- **Commitlint**: enforces Conventional Commits on every commit message.
- **Changesets**: manages versioning and changelogs for packages. Run `pnpm changeset` to create a new changeset before merging a feature.
- **GitHub Actions**: CI pipeline runs lint, build, and tests on every PR.

## Deployment

| Target     | Platform | Notes                                            |
| ---------- | -------- | ------------------------------------------------ |
| `apps/api` | Railway  | PostgreSQL and Redis also provisioned on Railway |
| `apps/web` | Vercel   | Connected to the `main` branch                   |

## Quality stack

- **ESLint + Prettier** — shared configs in `config/eslint-config` and `config/prettier-config`, consumed by all workspaces.
- **Vitest** — unit and integration tests. Test files live next to the source file they test (e.g. `auth.service.spec.ts` beside `auth.service.ts`).
- **Husky hooks**:
  - `pre-commit` → lint-staged
  - `commit-msg` → commitlint
  - `pre-push` → `vitest --changed`
- **Changesets release flow**: `pnpm changeset` → `pnpm changeset version` → commit `chore(release): vX.Y.Z` → push.

## NestJS modules — `apps/api`

Feature modules: `AuthModule` · `ContentModule` · `SubscriptionModule` · `UsersModule` · `AIModule` · `NotificationsModule` · `ProgressModule` · `AnalyticsModule`

**Próximos módulos según el diseño** (ver "Mapeo de áreas de diseño" arriba): `OnboardingModule` · `HomeModule` · `DiaryModule` · `VoiceModule` · `PatternsModule` · `TherapyModule` (v2) · `PulsoModule` (v2) · `AuthorModule` (v2).

Shared kernel (imported by all feature modules): `PrismaService` · `ConfigModule` · `LoggerService` · `ExceptionFilter` · global guards · global pipes.

Each module exposes its public surface through a `index.ts` barrel export.

## External integrations

| Integration                  | Purpose                                 | Module                |
| ---------------------------- | --------------------------------------- | --------------------- |
| **Stripe**                   | Subscriptions and webhooks              | `SubscriptionModule`  |
| **Claude API + pgvector**    | AI companion with RAG over book content | `AIModule`            |
| **Resend**                   | Transactional email                     | `NotificationsModule` |
| **Expo Notifications + FCM** | Push notifications                      | `NotificationsModule` |
| **PostHog**                  | Product analytics                       | `AnalyticsModule`     |
| **Cloudflare R2 / AWS S3**   | Storage for PDFs, audio, and video      | (shared infra)        |
| **Whisper / Deepgram**       | Voice transcription (`VoiceModule`)     | (nuevo, sesión 10+)   |
| **Daily.co / Whereby**       | Video for therapy sessions (v2)         | `TherapyModule` (v2)  |

## Code conventions

- TypeScript `strict` mode across the entire monorepo. Avoid `any`; if unavoidable, document the reason with a comment.
- Conventional Commits: `feat` · `fix` · `docs` · `chore` · `refactor` · `test` · `ci` · `perf`.
- Branch naming: `main` · `develop` · `feature/xxx` · `fix/xxx` · `release/vX.Y.Z` · `chore/xxx`.
- Semantic versioning: `MAJOR.MINOR.PATCH`.
- Architectural decisions documented as ADRs in `docs/adr/`.
- All code comments written in English.

## Business context

- **Target market**: Ecuador (validation) → LATAM (scale).
- **Monetisation**: Freemium → Pro $7/mo → Annual $59 → B2B $120+/mo.
- **Anchor books**: _Emociones en Construcción_ and _Familias Ensambladas_.
- **Roadmap**: M1–3 web + validation → M4–6 mobile app + AI → M7–9 B2B → M10+ LATAM.

## Mentor mode

This project doubles as a software architecture mentorship. When generating code:

1. **Lee primero el handoff de diseño** si la sesión involucra una pantalla o módulo nuevo. Cita explícitamente qué archivo de `docs/design/handoff/` usaste.
2. Briefly explain the architectural decision before writing any code.
3. Always produce complete, runnable code — never partial snippets.
4. State exactly which commands to run to verify the result.
5. Mark technical debt inline with `// TODO senior: <description>`.
6. Close every session with a **"Resumen para Notion"** block summarising what was built and what comes next.

### Design-driven workflow

Al implementar una pantalla nueva, sigue este orden:

1. **Leer** `docs/design/handoff/XX-area.md` completo.
2. **Listar** los endpoints que define + sus shapes de request/response.
3. **Diseñar Prisma schema** — modelos + relaciones + índices. Crear migración.
4. **Generar DTOs y tipos** en `@psico/types` para compartir con `apps/web` y `apps/mobile`.
5. **Implementar service** con todos los métodos requeridos por los endpoints.
6. **Implementar controller** con validación, guards (auth + tier), rate-limit donde aplique.
7. **Tests:** happy path + auth/tier denial + rate-limit + un caso de error.
8. **Si la pantalla tiene estado de privacidad E2E** (Diario, Eco), no aceptes texto plano en endpoints — solo `ciphertext + nonce`.
9. **Actualizar el session log** abajo con commit + tests + deuda técnica.

## Session log

### Sesión 1 — 2026-04-24 ✅ COMPLETADA

**Commit:** `chore: scaffold monorepo turborepo with all workspaces`

**Lo que se construyó:**

- Monorepo Turborepo v2 + pnpm workspaces con 11 workspaces
- 3 capas: config/ · packages/ · apps/
- Bootstrap mínimo: NestJS · Next.js 14 · Expo Router
- ESLint + Prettier + Husky + Commitlint + lint-staged operativos
- Changesets configurado
- ADR 0001 documentado
- pnpm install sin errores · build @psico/types exitoso

**Deuda técnica pendiente:**

- Corregir orden de condiciones en exports de packages (warning "types")
- Expandir @psico/types con tipos de dominio reales
- Restringir CORS a dominios de producción en main.ts

---

### Sesión 2 — 2026-04-26 ✅ COMPLETADA

**Rama:** `feature/auth-module`
**Commit:** `feat(api): implement AuthModule with JWT refresh 
tokens, Prisma schema and env validation`

**Lo que se construyó:**

- ConfigModule + validación Zod al startup
- PrismaService adaptado a Prisma 7
- AuthModule completo: register · login · refresh · logout
- JwtStrategy + JwtAuthGuard reutilizables
- 12 tests unitarios 12/12 pasando
- @psico/types v0.1.0 con changeset

**Deuda técnica:**

- Tipado PrismaClient en transacciones
- pnpm test --filter=[HEAD] en pre-push

---

### Sesión 3 — 2026-04-27 ✅ COMPLETADA

**Rama:** `feature/content-module`  
**PR:** #2 — squash mergeado a develop  
**Tests:** 19/19 pasando

**Lo que se construyó:**

- ADR 0003: slugs en URLs + Cloudflare R2
- Schema Prisma: Book · Chapter · Audio · Exercise · UserProgress
- @psico/types v0.2.0 — 8 tipos nuevos
- StorageModule @Global() portable a AWS S3
- ContentModule: books · chapters · progress
- PlanGuard + RolesGuard + @CurrentUser()
- Seed idempotente con 2 libros ancla
- 19/19 tests pasando

### Sesión 4 ✅ COMPLETADA — SubscriptionModule + Stripe + webhooks + 34 tests

### Sesión 5 ✅ COMPLETADA — Web app Next.js 14 (landing + auth + dashboard)

### Sesión 6 ✅ COMPLETADA — Deploy Railway + Vercel (producción activa)

### Sesión 6B — 2026-05-05 ✅ COMPLETADA

**Rama:** `feature/payment-pool`  
**Commit:** `feat(api): payment pool — refactor subscription module to multi-gateway strategy pattern`  
**Tests:** 67/67 pasando

**Lo que se construyó:**

- Paso 0: Resolvió conflictos de merge en 13 archivos (import type → eslint-disable)
- `IPaymentProvider` interface con métodos core + opcionales (`getWebhookEventType?`, `supportsRecurring?`)
- `StripeProvider` — lógica Stripe migrada desde SubscriptionService, 25 tests
- `PayphoneProvider` — stub Ecuador con documentación de endpoints reales, 6 tests
- `PaymentService` — selector de provider vía `DEFAULT_PAYMENT_PROVIDER` env var, 7 tests
- `SubscriptionService` — orquestador puro (delega pagos, retiene `getPlans` y `getMySubscription`), 14 tests
- Tokens DI nombrados: `STRIPE_PROVIDER` · `PAYPHONE_PROVIDER`
- `DEFAULT_PAYMENT_PROVIDER` agregado al env schema (default: `"stripe"`)
- ADR 0005: decisión PaymentPool + roadmap Fase 2

**Providers fase 2 (cuando haya volumen):**

- KushkiProvider — Ecuador + LATAM
- PlaceToPayProvider — alternativa local

### Sesión 7 ✅ COMPLETADA — Mobile app React Native + Expo Router (87 tests)

### Sesión 8 ✅ COMPLETADA — AIModule Claude API + pgvector + RAG (87 tests)

---

### Estado de producción — 2026-05-08

- API: https://psico-platform-production.up.railway.app
- Web: https://psico-platform-web.vercel.app
- Tests: 87/87 pasando
- Módulos activos en producción: Auth · Content · Subscription · AI
- AIModule: pgvector tablas creadas, pendiente ingest de libros ancla
- Fix definitivo: ESLint override para consistent-type-imports en archivos NestJS (services, controllers, guards, modules)

---

### Sesión 9 — 2026-05-25 ✅ COMPLETADA (código local, sin migrar/commit)

**Rama sugerida:** `feature/users-module`

**Lo que se construyó:**

- Schema Prisma extendido: 8 modelos nuevos (`UserPreferences`, `ReaderPreferences`, `NotificationSettings`, `PrivacySettings`, `Achievement`, `UserAchievement`, `EmailChangeRequest`, `DataExportRequest`) + 7 campos nuevos en `User` (`firstName`, `city`, `mood`, `moodUpdatedAt`, `currentStreakDays`, `longestStreakDays`, `streakLastDay`, `deleteRequestedAt`).
- `@psico/types` extendido con 14 tipos nuevos (`UserMeResponse`, `UserStats`, `AchievementProgress`, etc.).
- `apps/api/src/users/` completo: módulo + controller + service + 9 DTOs + 12 endpoints.
- 23 tests en `users.service.spec.ts` (happy path + edge cases) + 3 tests de auth posture en `users.controller.spec.ts`.
- Registrado en `app.module.ts`.

**Deuda técnica abierta (resuelve en sprints posteriores del Plan v2):**

- `requestEmailChange` no dispara email (resuelve en Sprint S2).
- `requestDataExport` no ejecuta el job (Sprint S3).
- `requestDelete` no hace hard delete al vencer cooldown (Sprint S3).
- `stats.diaryEntries` y `stats.minutesTotal` retornan 0 hasta Sprints S6/S7.
- Endpoints aterrizan en `/user/*` sin prefix `/api` hasta Sprint 0.A.

---

### Sesión 10 — 2026-05-25 ✅ COMPLETADA (planning, sin código)

**Output:** [IMPLEMENTATION_PLAN_v2.md](IMPLEMENTATION_PLAN_v2.md) (reemplaza al v1, marcado obsoleto).

**Lo que se hizo:**

- Lectura completa de `docs/design/handoff/` (17 archivos · ~2k líneas).
- Inventario consolidado: **146 endpoints únicos** en 17 módulos Nest.
- Plan en 4 fases / 30 sprints con grafo explícito de dependencias.
- 8 ADRs nuevos identificados (0006–0013): global prefix + URI versioning, E2E encryption para Diario/Eco, rate limiting + idempotency, OAuth Google/Apple, BullMQ + Redis para background jobs, multi-rol sin multi-tenant, video provider strategy (Daily.co), OpenAPI as source of truth.
- Estrategia de versionado: `/api/v1/*` con URI versioning de Nest; doble exposure por 90 días en breaking changes.
- Estrategia de documentación: Swagger auto-gen en `/api/docs`, `@psico/api-client` regenerado desde OpenAPI en CI, READMEs por módulo, CHANGELOGs por módulo grande, ADRs por decisión.

---

### Sesión 11 — 2026-05-25 ✅ COMPLETADA — Sprint 0.A

**Rama sugerida:** `feature/sprint-0a-global-prefix`
**Tests:** 125/125 pasando (baseline 87 + 38 nuevos)
**ADR producido:** [0006 — Global prefix + URI versioning](docs/adr/0006-global-prefix-uri-versioning.md)
**Bitácora:** [docs/informes/sprint-0a.md](docs/informes/sprint-0a.md)

**Lo que se construyó:**

- `main.ts` reescrito con `setGlobalPrefix("api", { exclude })`, `enableVersioning(URI, neutral)`, Swagger en `/api/docs`, HttpExceptionFilter global.
- `apps/api/src/shared/` creado con decorators (CurrentUser, RequiredPlan, RequiredRole) + guards (PlanGuard, RolesGuard) + filter (HttpExceptionFilter).
- `apps/api/src/content/guards/*` convertidos a re-exports `@deprecated` para migración gradual.
- `@ApiTags` agregado a 8 controllers existentes.
- Front clients (web `lib/api.ts`, mobile `client.ts` + `context/auth.tsx`) anteponen `/api` en el `baseUrl`.
- Deps agregadas: `@nestjs/swagger@8.1.1`, `@nestjs/throttler@6.5.0` (este último instalado pero no activado — Sprint 0.B).
- Dep faltante corregida: `"@psico/types": "workspace:*"` en `apps/api/package.json` (bug heredado de Sesión 9).

**Smoke test del bootstrap:**
- `GET /health` → 200 OK (exclusión funcionando)
- `GET /api/health` → 404 (exclusión bidireccional)
- `POST /api/auth/login {}` → 400 con envelope `{ statusCode, code: "VALIDATION_ERROR", message, details, timestamp, path }`
- `GET /api/docs-json` → OpenAPI 3.0.0 válido

**Bugs heredados de Sesión 9 corregidos (cf. bitácora §5):**
1. `@psico/types` no estaba en dependencies de `apps/api` (Vitest lo resolvía, tsc no).
2. Test de `getMe.initials` esperaba "JD" pero el service prioriza firstName → "JA".

**Deuda técnica abierta:**
- Throttler instalado pero sin reglas activas (Sprint 0.B).
- Pipeline `openapi.json → @psico/api-client` aún manual (Sprint 0.B).
- 6 features siguen importando desde `content/guards/*` re-exports `@deprecated`. Migran sprint a sprint. Cleanup total en S30.
- Migración Prisma `add_user_settings_and_account_lifecycle` (Sesión 9) sigue sin aplicarse en Railway prod.

---

### Sesión 12 — 2026-05-25 ✅ COMPLETADA — Sprint 0.B

**Rama sugerida:** `feature/sprint-0b-rate-limit-idempotency`
**Tests:** 140/140 pasando (125 → 140, +15)
**ADR producido:** [0008 — Rate limiting + Idempotency + OpenAPI codegen](docs/adr/0008-rate-limiting-idempotency-openapi-codegen.md)
**Bitácora:** [docs/informes/sprint-0b.md](docs/informes/sprint-0b.md)

**Lo que se construyó:**

- `RedisModule` global con factory `createRedisClient()` agnóstico al proveedor: usa `ioredis` real si `REDIS_URL` está seteado; cae a `ioredis-mock` en dev/test. `envSchema.superRefine` exige `REDIS_URL` en producción.
- `AppThrottlerModule` global — UN throttler (`default: 60/min`) con `RedisThrottlerStorage` custom (script Lua atómico INCR+PEXPIRE). `@SkipThrottle()` aplicado a `HealthController` para no bloquear monitores externos.
- `IdempotencyInterceptor` global con decorator opt-in `@Idempotent()`. Cache key `idemp:<userId>:<route>:<key>` con TTL 24h en Redis. Fire-and-forget en el SET.
- Pipeline OpenAPI → cliente generado: `apps/api/openapi.json` (emitido en boot dev) → `openapi-typescript` → `packages/api-client/src/generated.ts` (30.8 KB committed). Script `generate.mjs` con modo `--check` para CI.
- CI workflow `.github/workflows/openapi-diff.yml` bloquea PRs con drift entre back y cliente.
- Deps agregadas: `@nestjs-modules/ioredis@2.2.1`, `ioredis@5.10.1`, `ioredis-mock@8.13.1` (dev), `openapi-typescript@7.13.0` (dev en api-client).

**Bugs corregidos durante smoke test (cf. bitácora §5):**
1. **Throttler named — footgun de @nestjs/throttler v6:** múltiples throttlers nombrados aplican TODOS a TODOS los handlers por defecto. `patrones-regenerate: 1/día` baneaba todo. Fix: 1 solo throttler global, overrides per-handler.
2. **`/health` throttleado** — `setGlobalPrefix({ exclude })` afecta solo el prefijo, NO la pipeline de guards. Fix: `@SkipThrottle()` clase-level.
3. **DI inline mal armado** en RedisThrottlerStorage — refactor a construcción directa en factory (más testeable).
4. **ConfigService no resoluble** en tests aislados del RedisModule — refactor a función pura `createRedisClient(config)` testeable sin Nest.

**Smoke test del bootstrap:**
- `/health × 5` → 200, 200, 200, 200, 200 (sin throttle)
- `/api/auth/register × 65` → primer 429 en request #61 (límite 60/min default)
- Envelope del 429: `{ statusCode: 429, code: "RATE_LIMIT_EXCEEDED", message, timestamp, path }`
- `generate:check` → "OK — generated.ts is up to date"

**Deuda técnica abierta:**
- Upstash Redis en Railway prod sin provisionar (deploy bloqueado hasta entonces).
- Throttler IP-based — proxies pueden compartir IP. Sprint S1 agrega parse de `X-Forwarded-For`.
- `ioredis-mock` no soporta cluster ni comandos exóticos — si los necesitamos en sprint futuro, migrar CI a Redis real.
- E2E tests con supertest siguen sin existir. Sprint S1 los introduce.

---

### Sesión 13 — 2026-05-25 ✅ COMPLETADA — Sprint S1

**Rama sugerida:** `feature/sprint-s1-auth-hardening`
**Tests:** 159/159 pasando (140 → 159, +19: 9 audit + 10 E2E)
**ADRs producidos:** [0007 — E2E encryption Diario/Eco](docs/adr/0007-e2e-encryption-diario-eco.md) (anticipado, para S6/S9)
**Bitácora:** [docs/informes/sprint-s1.md](docs/informes/sprint-s1.md)

**Lo que se construyó (sin endpoints nuevos — endurecimiento):**

- **Throttles específicos:** `/api/auth/login` 5/15min/IP, `/api/auth/register` 10/hora/IP.
- **Tabla `AuthEvent`** con 6 tipos canónicos (`auth-event.type.ts`) + 3 índices estratégicos (userId/createdAt, type/createdAt, ipAddress/createdAt).
- **Audit logging sync con swallow-on-error** en register/login/refresh/logout. Captura IP + User-Agent + reason en cada caso.
- **Constant-time login preservado** (bcrypt-on-fake-hash siempre se ejecuta).
- **Primera infra E2E con supertest:** harness `createE2EApp` reutilizable + 10 tests del stack completo (global prefix, validation, JwtAuthGuard, ThrottlerGuard, HttpExceptionFilter, audit log).
- **`unplugin-swc` instalado** para que NestJS DI funcione en tests (esbuild no emite `design:paramtypes`).
- README del AuthModule.

**Bugs descubiertos por la nueva infra E2E (5, todos corregidos — cf. bitácora §4):**
1. Vitest esbuild no emite decorator metadata → SWC.
2. Mocks viejos de `@prisma/client` faltaban `PrismaClient` stub → SWC eagerly evaluates.
3. ESM directory imports rotos en `voyageai` → `deps.inline`.
4. Vitest default glob no matchea `*.e2e-spec.ts` → custom `include`.
5. Prisma `Json` field requiere cast a `never`.

**ADR 0007 anticipado:** documenta el modelo criptográfico completo (Argon2id `m=64MB t=3 p=4` + XChaCha20-Poly1305 + ECDH X25519 + HKDF). Escrito 4 sprints antes de su primer uso (S6) → buffer para review externa de seguridad.

**Deuda técnica abierta:**
- Migración Prisma del AuthEvent sigue sin aplicarse en Railway prod.
- E2E test usa mock de Prisma — no captura bugs de queries reales. Migrar a testcontainers en sprint futuro.
- Audit log podría requerir particionado mensual cuando crezca >10M rows.

---

### Sesión 14 — 2026-05-26 ✅ COMPLETADA — Sprint S2

**Rama sugerida:** `feature/sprint-s2-auth-email-oauth`
**Tests:** 179/179 pasando (159 → 179, +20: 13 unit + 7 E2E)
**ADR producido:** [0009 — OAuth via Google ID token verification](docs/adr/0009-oauth-with-google-id-token.md)
**Bitácora:** [docs/informes/sprint-s2.md](docs/informes/sprint-s2.md) (con 4 diagramas Mermaid)

**Decisiones del usuario aplicadas:**
1. Resend (no SendGrid) — confirmado.
2. Google "unverified" mientras la verification (4-6 sem) corre en paralelo — confirmado.
3. Apple Sign-in diferido (sin Apple Developer account) — solo Google en S2.

**Lo que se construyó:**

- **4 endpoints nuevos** en `/api/auth/*`: `forgot-password` (3/hora/IP, no-leak), `reset-password` (5/15min/IP, 410 GONE en token inválido, revoca todos los refresh), `verify-email` (consume token + marca `emailVerified=true`), `oauth/google` (10/15min/IP, ID token verification).
- **`NotificationsModule` global** con `ResendService` (fallback a consola en dev cuando no hay `RESEND_API_KEY`) + 2 templates HTML (`verify-email`, `password-reset`). Plain HTML por sobre @react-email/components para simplicidad.
- **`GoogleVerifier`** con `google-auth-library` — verifica ID token firmado por Google contra `GOOGLE_CLIENT_ID`. **No Passport redirect flow** (ADR 0009).
- **2 modelos Prisma:** `PasswordResetToken` + `EmailVerificationToken`. SHA-256(token) en DB; raw token solo en email. `consumedAt` para replay protection.
- **User schema:** `passwordHash` opcional + `authProvider` enum (LOCAL/GOOGLE) + `providerId` con `@@unique([authProvider, providerId])`.
- **Auto-linking rechazado por defecto:** Google email que colisiona con LOCAL → 409 EMAIL_ALREADY_REGISTERED (mensaje claro), sin merge silencioso.
- **Fire-and-forget verification email** desde `register()` — no bloquea el response, audit captura registro igual.
- **5 nuevos auth event types:** PASSWORD_RESET_REQUESTED, PASSWORD_RESET_COMPLETED, EMAIL_VERIFIED, OAUTH_REGISTER, OAUTH_LOGIN.

**Bugs corregidos durante S2 (4, todos documentados en bitácora §4):**
1. `passwordHash` ahora nullable rompió `bcrypt.compare` en `users.service.ts` (changePassword, requestDelete). Fix: guard explícito con `BadRequestException(OAUTH_USER_NO_PASSWORD)`.
2. Tests de Auth viejos rompieron por nuevas deps en constructor. Fix: agregar mocks (ResendService, GoogleVerifier) al spec.
3. Tests E2E nuevos pidieron extender `e2e-app.ts` con `passwordResetToken` + `emailVerificationToken`.
4. `vi.clearAllMocks` borra `mockResolvedValue` defaults. Fix: re-establecer en `beforeEach`.

**Smoke test del bootstrap:**
- `POST /api/auth/oauth/google` sin `GOOGLE_CLIENT_ID` → 400 OAUTH_NOT_CONFIGURED ✅
- `POST /api/auth/forgot-password` con email inválido → 400 VALIDATION_ERROR ✅
- Boot loggea warnings claros cuando RESEND_API_KEY / GOOGLE_CLIENT_ID faltan.

**Deuda técnica abierta:**
- Migraciones Prisma de S1+S2 sin aplicar en Railway (acumuladas desde Sesión 9). Sprint S3 las aplica.
- `RESEND_API_KEY` y `GOOGLE_CLIENT_ID` no configurados en Railway (S3 + cuando frontend integre Google Sign-in).
- `/api/auth/resend-verification` no existe — si Resend falla al register, usuario está sin verificar. S2.5 lo agrega (~30 min).
- Apple Sign-in queda como `AppleVerifier` análogo a `GoogleVerifier` cuando se obtenga Apple Developer account.

---

### Sesión 15 — 2026-05-26 ✅ COMPLETADA — Sprint S3

**Rama sugerida:** `feature/sprint-s3-users-worker`
**Tests:** 194/194 pasando (179 → 194, +15: 3 producer + 12 processors)
**ADR producido:** [0010 — BullMQ worker: mismo codebase, servicio Railway separado](docs/adr/0010-bullmq-worker-same-codebase-separate-service.md)
**Bitácora:** [docs/informes/sprint-s3.md](docs/informes/sprint-s3.md) (con 4 diagramas Mermaid)

**Decisiones del usuario aplicadas:**
1. Worker en servicio Railway **separado** del API — confirmado.
2. Data export en S3 solo perfil + progress + subscription (Diario/Eco se agregan en S6/S9) — confirmado.

**Lo que se construyó:**

- **Worker como segundo proceso Railway desde el mismo codebase** (ADR 0010): `apps/api/src/worker.ts` + `WorkerAppModule` con 3 processors; NO HTTP listener. `start:worker` script en `apps/api/package.json`.
- **3 queues BullMQ con retry policies específicas:**
  - `email`: 3 attempts, exponential 1s/5s/25s
  - `data-export`: 2 attempts, exponential 30s/15min, `removeOnFail: false`
  - `account-deletion`: 5 attempts, **`delay: 30 días`**
- **`JobsService` (producer)** con 3 métodos: `enqueueEmail`, `enqueueDataExport`, `enqueueAccountDeletion`. Centraliza la política de retry — feature services nunca tocan BullMQ directamente.
- **3 stubs de Sesión 9 ahora reales:**
  - `requestEmailChange` → enqueueEmail (Resend via worker, con HTML template).
  - `requestDataExport` → enqueueDataExport con `requestId`; el worker genera JSON, sube a R2, marca READY + fileUrl, envía email.
  - `requestDelete` → enqueueAccountDeletion con `delay: 30d`; el worker re-valida `deleteRequestedAt` + cooldown antes de ejecutar `prisma.user.delete()` (cascade).
- **Self-correcting account-deletion** (tres defensas):
  1. `delay: 30d` en BullMQ.
  2. Re-check de `User.deleteRequestedAt` (null = canceló).
  3. Re-check de `now - deleteRequestedAt >= 30d` usando timestamp **de la DB**.
- **`_meta.exportSchemaVersion: 1`** en data exports — preparado para evolución cuando S6/S9 agreguen Diario/Eco.
- **Final-attempt bookkeeping** en `DataExportProcessor`: marca `FAILED` solo en el último retry, deja PROCESSING en retries no-finales.

**Smoke test del worker:**
- `node dist/worker` boota limpio · 3 processors registrados · "Awaiting jobs from Redis…" · `kill -0` confirma proceso vivo.

**Deuda técnica abierta:**
- Migraciones acumuladas Prisma (Sesión 9 + S1 + S2 + S3) sin aplicar en Railway — bloqueante para deploy.
- Worker no provisionado en Railway aún (crear servicio cuando se haga deploy de S3).
- `REDIS_URL` (Upstash) sin configurar en Railway.
- Tests no ejercitan round-trip Redis → worker (ioredis-mock no soporta BullMQ delayed jobs correctamente). Aceptado: cobertura unit + smoke manual.
- BullMQ "failed jobs" UI no expuesta — operations debe usar `queue.getFailed()` por código.

---

### Sesión 16 — 2026-05-26 ✅ COMPLETADA — Sprint S4

**Rama sugerida:** `feature/sprint-s4-onboarding`
**Tests:** 217/217 pasando (194 → 217, +23: 20 service + 3 controller)
**ADR producido:** ninguno (sprint mecánico)
**Bitácora:** [docs/informes/sprint-s4.md](docs/informes/sprint-s4.md) (con 3 diagramas Mermaid)

**Lo que se construyó:**

- **11 endpoints** bajo `/api/onboarding/*` — implementación completa de `docs/design/handoff/01-onboarding.md`.
- **3 modelos Prisma:** `OnboardingMotivo` (catálogo, 7 entries seeded), `OnboardingMood` (catálogo, 7 entries), `OnboardingState` (1:1 con User).
- **Audit vs canonical separation:** `OnboardingState` captura **pick original** (motivosIds, initialMoodId, initialVoicePreference, recommendedBookId, chosenBookId); state vivo va a `User.firstName`, `User.mood`, `UserPreferences.voicePreference`.
- **Recommendation algorithm** en `constants.ts`: motivo → bookSlug mapping con fallback al anchor book (`emociones-en-construccion`). Why text personalizado por par `motivo:bookSlug` con fallback genérico.
- **Lifecycle guard** `assertNotAlreadyClosed()`: rechaza step POSTs con 400 después de skip o complete.
- **Validación catalog**: `saveStep1`/`saveStep2` valida cada id contra DB → 400 con código machine-readable + lista de IDs malos.
- **3 DTOs nuevos** + 5 con class-validator (motivosIds[1-5], moodId, firstName con regex Unicode, voicePreference enum, chosenBookId opcional).
- **Seed actualizado** con catálogos idempotentes (`upsert` por id).
- **`@psico/types`** extendido con 14 tipos nuevos. Cliente regenerado 35.0 KB → 44.9 KB.
- **README del módulo** documentando endpoints + audit vs canonical + cómo editar catalogs.

**Conceptos pedagógicos del sprint:**
- **Catálogos en DB vs constants en código** (4 dimensiones de decisión: frecuencia de cambio, necesidad de FK, editor no-técnico, i18n).
- **Audit vs canonical state**: cuando un dato puede cambiar y querrías analizar el original.
- **Idempotency-by-overwrite** vs Idempotency-Key strict: para flows guided (step writes, autosave) la idempotencia es semántica.
- **Validación en aplicación** sobre datos referenciados produce errores más accionables que dejar fallar la FK.
- **Fallback en cascada** para datos faltantes (cover token determinístico por hash, why text con tres niveles).

**Smoke test:**
- 11 endpoints `/api/onboarding/*` mapeados correctamente.
- Boot del API limpio.
- Cliente OpenAPI regenerado.

**Deuda técnica abierta:**
- Migración Prisma de S4 (3 modelos) acumulada — pendiente de aplicar en Railway.
- Seed no ejecutado en Railway — `/onboarding/motivos` devuelve `[]` hasta `prisma db seed`.
- `book.author` hardcoded "Marina Quintana" en recommendation (BookAuthor llega en S5).
- `chapter1Preview` usa `book.description` como stand-in (real preview llega con ChapterBlock en S5).
- Cover token derivado por hash del bookId (real `BookCover.token` llega en S22 Author).
- Frontend del onboarding (web + mobile) inexistente — front companion sprint S4-front pendiente.

---

### Sesión 17 — 2026-05-26 ✅ COMPLETADA — Sprint S5

**Rama sugerida:** `feature/sprint-s5-home-books`
**Tests:** 234/234 pasando (217 → 234, +17: 16 BooksService + 1 net HomeService)
**ADRs producidos:** ninguno (sprint orientado a feature)
**Bitácora:** [docs/informes/sprint-s5.md](docs/informes/sprint-s5.md) (con 4 diagramas Mermaid)

**Decisiones del usuario aplicadas:**
1. Rename directo (sin alias deprecated) — no hay consumers en producción.
2. `BookAuthor` como tabla nueva (preparado para Editor de autor B2B en S19).
3. `BookCategory` también tabla por mismo razonamiento.

**Lo que se construyó:**

- **13 endpoints nuevos:** 10 BooksModule (`list, recos, categories, authors, detail, listReviews, createReview, toggleFavorite, toggleBookmark, startBook`) + 3 HomeModule (`getHome, updateMood, dismissPrompt`).
- **6 modelos Prisma nuevos:** `BookAuthor`, `BookCategory`, `BookFavorite`, `BookBookmark`, `BookReview`, `ReflectionPrompt`, `DismissedReflectionPrompt`. Book extendido con 9 columnas (subtitle, summary, cover, coverArtUrl, pages, durationMinutes, language, authorId, categoryId, publishedAt).
- **`@psico/types` extendido con +50 tipos nuevos** (catálogo, detalle, home, enums).
- **Rebrand completo:** `apps/api/src/content/` eliminado. Top-level modules: `books/`, `chapters/`, `progress/`, `home/`. Routes `/content/*` → `/books|chapters|progress|home`.
- **Cliente frontend rebrand:** nuevo `booksApi` con 10 métodos; `contentApi` queda `@deprecated`. Web (landing + dashboard) y mobile (home + biblioteca + detail) migrados a la nueva shape.
- **Pipeline OpenAPI:** `generated.ts` regenerado de 30.8 KB → 53.0 KB.
- **Seed:** 7 categorías + 1 author Marina Quintana verificada + 7 reflection prompts + libros wired a author/category/cover/pages/durationMinutes.
- **READMEs del módulo Books y Home.**

**Bugs corregidos durante S5 (4, cf. bitácora §4):**
1. Conditional Prisma include produce union; helper cast localizado en books.service.ts:175.
2. Vitest mock `.findUnique().then(...)` undefined porque Promise.all hace 3 llamadas concurrentes; fix: `mockResolvedValue` rico.
3. Tests viejos llamaban a métodos eliminados (findAllPublished/findBySlug); rewrite total con 16 tests nuevos.
4. Web landing FALLBACK_BOOKS shape incompat; convertido a `BookListItem[]` envuelto en `BookListResponse`.

**Smoke test:**
- 51 rutas mapeadas bajo `/api/*` (10 Books + 3 Chapters + 2 Progress + 3 Home + el resto existente).
- `pnpm --filter @psico/api-client generate:check` → OK.
- Web typecheck + lint, Mobile typecheck + lint, API test + typecheck + lint → todos verdes.

**Deuda técnica abierta:**
- Migraciones S5 (`20260526180000_s5_books_*`) acumuladas — pendiente de aplicar en Railway.
- Seed S5 no ejecutado en Railway.
- `stats.diaryEntries`/`minutesTotal` siguen en 0 hasta DiaryModule (S6).
- `ecoMoment.pendingMessages` siempre 0 hasta AIModule conversacional (S10).
- Recos = stub "más recientes"; PatternsModule (S11) lo reemplaza.
- `UserProgress` no separa started vs completed; S6 refactoriza.
- Sin `DELETE` para chapters/reviews. Cuando exista, sincronizar `book.totalChapters` y `book.durationMinutes`.
- Frontend S5-front (skeleton states + favorites UI + reviews modal) pendiente, diferido por decisión hasta cierre Phase 1.

---

### Sesión 18 — 2026-05-26 ✅ COMPLETADA — Sprint S6

**Rama:** `feature/sprint-s6-diary-e2e`
**Tests:** 252/252 pasando (234 → 252, +18: 15 DiarioService + 3 privacy regression)
**ADR aplicado:** [0007 — E2E encryption Diario/Eco](docs/adr/0007-e2e-encryption-diario-eco.md) (escrito en S1, ahora en código)
**Bitácora:** [docs/informes/sprint-s6.md](docs/informes/sprint-s6.md) (con 4 diagramas Mermaid)

**Decisión del usuario aplicada:**
- Continuar backend → S6 DiaryModule (recomendación del Plan v2). Frontend companion sprint queda diferido al final de Fase 1.

**Lo que se construyó:**

- **7 endpoints nuevos** en `/api/diario/*`: list (paginado + moodMap + tags), prompt-of-the-day, detail, create, update, delete, share-with-therapist.
- **3 modelos Prisma:** `DiaryEntry` (cipher + nonce + plaintext metadata), `SharedDiaryEntry` (wrapped key + ephemeral pubkey + expiry), `DiaryPrompt` (catálogo curado, rotación por day-of-year hash).
- **Migración** `20260526210000_s6_diary_e2e_encryption/migration.sql`, additive.
- **`@psico/types` +14 tipos** del wire format (cipher + nonce + summary/detail responses).
- **3 custom DTO validators:** `@IsBase64UrlCipher()` (≤1.4 MB), `@IsBase64UrlNonce()` (24B exactos), `@IsBase64UrlBlob(maxLen)` (genéricos). Single source of truth para shape/size.
- **Privacy defense in depth:**
  - `diario.privacy.spec.ts` — walks `diario/`, `home/`, `users/`, falla si `logger.*`/`console.*` toca campo cifrado.
  - CI workflow job `privacy` en `.github/workflows/ci.yml` — corre el mismo grep antes de build.
- **Cipher/nonce pairing enforced** en `UpdateDiaryEntryDto` service-side (`CIPHER_NONCE_PAIRING`).
- **Share with therapist** persiste sin TherapyModule (v2 lo consume cuando aterrice).
- **Stats wired:** `UsersService.computeStats` y `HomeService.fetchStats` ya cuentan entries reales — `diaryEntries`/`minutesTotal`/`entriesThisWeek` salen de 0.
- **Cliente:** `diarioApi` con 7 métodos en `packages/api-client/src/diario.ts`. `apiClient.delete<T>()` añadido.
- **Seed:** 7 nuevos `DiaryPrompt` curados (distintos de `ReflectionPrompt` de Home).
- **READMEs:** `apps/api/src/diario/README.md`.

**Bugs corregidos durante S6 (3, cf. bitácora §4):**
1. Tests de Home + Users no mockeaban `prisma.diaryEntry.count` → cubrir con `.mockResolvedValue(0)` por defecto.
2. `apiClient` no tenía `delete<T>()` → añadido.
3. Prisma warning: `SharedDiaryEntry.entryId` requerido + `onDelete: SetNull` incompatible. Fix: nullable + documentar (audit trail).

**Smoke boot del API:**
- 58 rutas mapeadas bajo `/api/*` (51 previas + 7 Diario).
- `openapi.json`: 35 KB → 39 KB.
- `generated.ts`: 53 KB → 58 KB.

**Deuda técnica abierta:**
- Migración S6 sin aplicar en Railway (acumulada con todas las previas).
- `SharedDiaryEntry` expiry sweeper sin implementar (v2 TherapyModule).
- Sin rate limit específico en POST entries (60/min global aplica).
- Sin full-text search en diario (cipher → server no puede indexar; búsqueda cliente-side).
- `audioUrl` queda sin storage real hasta VoiceModule (S8).
- Recovery seed-phrase BIP39 es opt-in cliente-side (no aplica al server).

---

### Sesión 19 — 2026-05-26 ✅ COMPLETADA — Sprint S5-front (web)

**Rama:** `feature/sprint-s5-front` · **Commit:** `6effa37` (PR #75 mergeado)
**Tests:** 252/252 backend (sin cambios) + 8 rutas web build.
**Bitácora:** [docs/informes/sprint-s5-front.md](docs/informes/sprint-s5-front.md)

**Lo que se construyó:** 4 páginas (`/dashboard`, `/dashboard/biblioteca`, `/dashboard/biblioteca/[idOrSlug]`, `/dashboard/diario`) + 16 componentes en `apps/web/src/components/dashboard/{home,biblioteca,detalle,diario}/` + helper `cover-gradients.ts` + nav shell rebrand.

**Bug crítico descubierto:** `import type { *Dto }` en 8 controllers stripeaba la metadata runtime → `ValidationPipe` rechazaba todos los query params. Fix: convertir a value imports en books/chapters/progress/subscription/ai/users/diario/onboarding. Era latente desde S1; solo AuthController estaba correcto.

---

### Sesión 20 — 2026-05-27 ✅ COMPLETADA — Sprint S5-front-mobile

**Rama:** `feature/sprint-s5-front-mobile`
**Tests:** 252/252 backend (sin cambios) — sprint orientado a UI mobile.
**ADR aplicado:** ninguno
**Bitácora:** [docs/informes/sprint-s5-front-mobile.md](docs/informes/sprint-s5-front-mobile.md) (con 2 diagramas Mermaid)

**Decisión del usuario aplicada:** Opción A — replicar Home/Biblioteca/Detalle/Diario en RN antes de seguir con backend.

**Lo que se construyó:**

- **4 pantallas:** `/(tabs)` Inicio (rewrite), `/(tabs)/books` Biblioteca (rewrite), `/(tabs)/books/[slug]` Detalle (rewrite), `/(tabs)/diario` (nuevo).
- **Tabs layout rebrand:** 4 tabs visibles (Inicio · Libros · Diario · Mi plan); Perfil queda como `href: null` (deep-link only).
- **Helper:** `apps/mobile/src/components/dashboard/cover-colors.ts` — fallback de color sólido para CoverToken (sin `expo-linear-gradient` por elección).
- **Cliente API extendido:** nuevo `homeApi` en `packages/api-client/src/home.ts` (`get`, `updateMood`, `dismissPrompt`). Web no lo necesita (usa Server Components con cookies); mobile lo usa vía `apiClient` + `TokenStore`.
- **Pull-to-refresh** en Home.
- **Search debounced (250ms)** + view tabs + category chips horizontales en Biblioteca.
- **Composer del Diario disabled** (misma decisión ética que el web, ADR 0007 §G).

**Decisiones del sprint:**
1. Fallback de color sólido en lugar de gradiente — RN sin libs externas.
2. Pull-to-refresh solo en Home (no en Biblioteca/Diario que ya re-fetchan).
3. Composer disabled, no fake-crypto.
4. Avatar de autor con initials (sin `<Image>` por ahora).
5. `profile` tab oculta pero deep-link disponible.
6. Stats grid 2x1 mobile (3 cards apiladas) por ancho de pantalla.

**Smoke verification:**
- API tests 252/252.
- Web typecheck + lint + sin cambios.
- Mobile typecheck + lint OK.
- API-client build OK (homeApi añadido, 62 KB d.ts).
- OpenAPI generate:check in sync.

**Deuda técnica abierta:**
- Avatares reales (`<Image>` con `avatarUrl`).
- Gradientes en covers (agregar `expo-linear-gradient`).
- Cliente cripto S6-crypto (Composer Diario funcional).
- Mood selector funcional en composer.
- Toggles favorito/bookmark en BookGridCard.
- Modal "Escribir reseña".
- Pull-to-refresh en más pantallas.
- Reader screen.
- Eco screen (los shortcuts del Home apuntan a placeholder).
- Profile tab UI.

---

### Sesión 21 — 2026-05-27 ✅ COMPLETADA — Sprint S6-crypto

**Rama:** `feature/sprint-s6-crypto`
**Tests:** 276 pasando (252 API + 24 crypto package nuevos)
**ADR aplicado:** [0007 — E2E encryption Diario/Eco](docs/adr/0007-e2e-encryption-diario-eco.md) — completamente implementado (contrato → schema → cripto cliente real)
**Bitácora:** [docs/informes/sprint-s6-crypto.md](docs/informes/sprint-s6-crypto.md) (con 3 diagramas Mermaid)

**Decisión del usuario aplicada:** Opción A — implementar el cripto cliente que cierra el contrato escrito 4 sprints atrás.

**Lo que se construyó:**

- **Paquete `@psico/crypto`** v0.1.0 — pure JS (sin WASM, sin native modules):
  - `deriveMasterKey` (Argon2id m=64MB t=3 p=4 vía `@noble/hashes`)
  - `deriveSubKey` (HKDF-SHA256 vía `@noble/hashes`)
  - `encryptString` / `decryptString` (XChaCha20-Poly1305 vía `@noble/ciphers`)
  - base64url helpers
  - **24 tests** (roundtrip, avalanche, domain separation, AEAD rejection)
- **Backend:**
  - `User.cryptoSalt String?` (migración `20260527090000_s6_crypto_user_salt`)
  - Generación al `register` + OAuth Google
  - Exposición en `AuthResponseDto` (4 endpoints) y `UserMeResponse`
- **Web:**
  - `lib/crypto/diary-key-context.tsx` — Context, in-memory key (no localStorage)
  - `UnlockGate` + `ActiveComposer` (encripta body + excerpt) + `ActiveEntryList` (descifra excerpts memoized) + `DiarioShell`
  - Removed placeholders: `Composer.tsx`, `EntryList.tsx`, `CryptoNotice.tsx`
  - Diario page consume `/user/me` para el salt
- **Mobile:**
  - `src/crypto/diary-key-store.ts` (Expo SecureStore wrapper)
  - `src/crypto/diary-key-context.tsx` (restore on mount, persist on unlock)
  - `UnlockGate` + ActiveDiarioBody (composer + entries decrypt)
  - `AuthContext.logout` también limpia `diaryKeyStore`
- **Cliente API:**
  - `generated.ts` regenerated (57.9 KB → 59.5 KB) con `cryptoSalt` en 4 endpoints

**Decisiones del sprint:**
1. `@noble/hashes` + `@noble/ciphers` over WASM libs (portable web + RN, no bundling fragilidad).
2. Web: memoria de pestaña; Mobile: SecureStore. Divergencia intencional documentada en ADR.
3. Excerpt cipher por separado para list views sin descargar body completo.
4. `masterKey.fill(0)` después de derivar subkey (minimizar ventana de exposición).
5. Sin migración para cuentas legacy en este sprint (mini-sprint posterior).
6. Sin recovery seed phrase (BIP39) — UX significativo, validar con Pulso primero.

**Smoke verification:**
- Crypto tests 24/24 (incluye Argon2id reales, ~16s tiempo total).
- API tests 252/252.
- Web/Mobile typecheck + lint clean.
- Privacy invariant grep verde (sin ciphertext logged).
- OpenAPI generate:check in sync.

**Deuda técnica abierta:**
- Recovery seed phrase (BIP39) — ADR 0007 §G compromete opt-in.
- Migración cuentas legacy con `cryptoSalt = null`.
- Password change flow → re-encrypt del Diario.
- Detail view del entry (descifrar body completo, no solo excerpt).
- Share with therapist UI — backend ready desde S6, espera TherapyModule v2.
- Eco crypto wire — helper `eco-v1` listo, AIModule lo usará en S10.

---

### Sesión 22 — 2026-05-27 ✅ COMPLETADA — Sprint S6-crypto-polish

**Rama:** `feature/sprint-s6-crypto-polish`
**Tests:** 286 pasando (252 API + 34 crypto, +10 BIP39)
**Bitácora:** [docs/informes/sprint-s6-crypto-polish.md](docs/informes/sprint-s6-crypto-polish.md) (con diagrama de detail flow)

**Decisión del usuario aplicada:** Opción B — polish del cripto. Scope ajustado a 3 features (de 5 candidatos) para mantener PR limpio.

**Lo que se construyó:**

- **Backend:** `AuthService.ensureCryptoSalt(user)` — backfill idempotente del salt para cuentas legacy. Invocado en `login`, `refresh`, OAuth Google path 1. Cero downtime, cero scripts ops, cero overhead para cuentas inactivas.
- **`@psico/crypto` BIP39 toolkit:**
  - `masterKeyToSeedPhrase(key)` — 32B → 24 English words
  - `seedPhraseToMasterKey(phrase)` — reverso con normalización (whitespace + case)
  - `isValidSeedPhrase(phrase)` — validador no-throwing para formularios
  - Dep nueva: `@scure/bip39` v1.5.0
  - **+10 tests** (34 total ahora)
  - **Decisión cripto:** seed phrase = masterKey serializado (no PBKDF2 stretching). Recovery exacto bit-por-bit. Documentado.
- **Web detail view:**
  - `/dashboard/diario/[id]` Server Component
  - `EntryDetailView` con `DiaryKeyProvider` (gate-or-decrypt)
  - Decrypt body completo, render tags, related entries, delete con confirm in-place
  - List cards ahora navegan a detail
- **Mobile detail view:**
  - `app/(tabs)/diario/[id].tsx` con mismo gate-or-decrypt
  - Delete usa nativa `Alert.alert` con destructive style
  - List cards ahora navegan con stopPropagation en "Mostrar más"
  - `_layout.tsx` registra la nueva ruta

**Decisiones del sprint:**
1. Auto-gen salt en login, NO migration script — backfill bajo demanda
2. Seed phrase = masterKey serializado directo (32B exactos)
3. Delete confirm in-place web, Alert nativo mobile (UX idiomática)
4. List cards 100% navegables con stopPropagation para botones interiores
5. **Diferidos a sprints propios:** seed phrase UI (modal + recovery) + password change re-encrypt

**Smoke verification:**
- Crypto tests 34/34 (incluye Argon2id reales + BIP39)
- API tests 252/252
- Web build clean (Diario detail page 4 KB / 120 KB FL)
- Mobile typecheck + lint clean
- OpenAPI generate:check in sync
- Privacy guard verde

**Deuda técnica abierta:**
- Seed phrase UI (modal post-unlock + recovery flow en /login) — usa el toolkit ya escrito
- Password change re-encrypt — endpoint + flow cliente
- Edit entry (el detail tiene delete, falta edit)
- `User.cryptoSeedShownAt` flag para no spam-mostrar el modal

---

### Sesión 23 — 2026-05-27 ✅ COMPLETADA — Sprint seed-and-password-rekey

**Rama sugerida:** `feature/sprint-seed-and-password-rekey`
**Tests:** 286 pasando (252 API + 34 crypto, baseline mantenido)
**ADR aplicado:** [0007 §F + §G](docs/adr/0007-e2e-encryption-diario-eco.md) — password rotation + seed phrase recovery
**Bitácora:** [docs/informes/sprint-seed-and-password-rekey.md](docs/informes/sprint-seed-and-password-rekey.md)

**Lo que se construyó (cierre del módulo de cripto E2E):**

**Backend — 3 endpoints nuevos:**
- `POST /api/user/crypto-seed-acknowledged` — idempotente, marca `User.cryptoSeedShownAt`.
- `POST /api/user/password-change-with-rekey` — atómico: bcrypt(newPassword) + update User + UPDATE de cada DiaryEntry con cipher/nonce nuevos + revoca refresh tokens.
- `GET /api/diario/entries/raw-ciphers` — lean view (sin related-search) usado solo por el rekey flow.

**Schema:** `User.cryptoSeedShownAt: DateTime?` (migración `20260527110000_seed_phrase_shown_at`).

**DTOs:** `PasswordChangeWithRekeyDto` con `ArrayMaxSize(500)`, base64url validation, `NEW_PASSWORD_MIN=10`, `MAX_ENTRIES_PER_REKEY=500`.

**Web:**
- `SeedPhraseModal` (post-unlock first-time, confirm 3 de 24 palabras).
- `UnlockGate` con modo "seed" (textarea de 24 palabras → `seedPhraseToMasterKey` → `adoptMasterKey`).
- `/dashboard/security` con `ChangePasswordCard` (phase machine deriving → fetching → reencrypting → submitting → done).
- `DiaryKeyContext` extendido con `masterKey` + `adoptMasterKey`. Provider hoisted a `/dashboard/layout.tsx` para que la unlock sobreviva navegación.

**Mobile:**
- `SeedPhraseModal` (RN Modal con misma lógica).
- `UnlockGate` con modo seed paridad web.
- `(tabs)/security.tsx` accesible desde Perfil → "Cambiar contraseña".
- `DiaryKeyProvider` hoisted a `(tabs)/_layout.tsx`. masterKey RAM-only en mobile (subkey persistido en SecureStore como antes).

**Shared:**
- `@psico/types`: 6 tipos nuevos (`CryptoSeedAcknowledgedResponse`, `RekeyedDiaryEntry`, `PasswordChangeWithRekey*`, `DiaryRawCipher*`).
- `@psico/crypto`: re-exporta `randomBytes` para evitar que web/mobile dependan de `@noble/ciphers` directo.
- `@psico/api-client`: `diarioApi.listRawCiphers()` + `generated.ts` 58 KB → 62.1 KB.

**Bugs corregidos durante el sprint (4, cf. bitácora §5):**
1. Mobile: `crypto.getRandomValues` no tipado en RN → re-export de `randomBytes` desde `@psico/crypto`.
2. Mobile: `@noble/ciphers/webcrypto` no resoluble como import directo → mismo fix que #1.
3. `users.controller.spec.ts` esperaba 12 handlers — actualizado a 14.
4. Route order en `DiarioController`: `entries/raw-ciphers` declarado antes de `entries/:id` para evitar conflicto del path matcher.

**Smoke boot del API:** 60 rutas bajo `/api/*`. OpenAPI generate:check OK. Privacy spec OK.

**Deuda técnica abierta:**
- Sin unit tests dedicados para los 3 nuevos endpoints. Cubrir antes de cerrar Phase 1 (idempotencia del ack, mismatch del currentPassword, ownership de entry IDs, rollback de la transacción).
- Sin E2E full-circle test (encrypt → POST → decrypt con la nueva key).
- Mobile cold-start: `SeedPhraseModal` no se muestra si el usuario hace cold-start con subkey cached (masterKey null). Aceptable porque vuelve a aparecer en cualquier fresh unlock — pero un user que nunca bloquea su diario podría no verla.
- Migración `20260527110000_seed_phrase_shown_at` acumulada con las anteriores desde Sesión 9 — sin aplicar en Railway.
- Cap de 500 entries por rekey suficiente para v1, subir a 2500 cuando el feature madure.

---

### Sesión 24 — 2026-05-27 ✅ COMPLETADA — Sprint S7 SubscriptionModule

**Rama sugerida:** `feature/sprint-s7-subscription-usage`
**Tests:** 313 pasando (252 → 279 API + 34 crypto, +27 tests nuevos)
**ADRs aplicados:** ninguno nuevo (decisiones documentadas inline + bitácora §3)
**Bitácora:** [docs/informes/sprint-s7-subscription-usage.md](docs/informes/sprint-s7-subscription-usage.md)

**Decisiones del usuario lockeadas antes de implementar:**
1. `/usage` agregador único (no per-feature) — consistente con `/home`.
2. `POST /cancel` + `POST /reactivate` separados (no PATCH con action enum).
3. Counters live + cache Redis 5 min — BullMQ daily rollup escribe `BillingUsageDay` para Pulso, no para `/usage`.

**Lo que se construyó:**

**Backend — 4 endpoints nuevos:**
- `GET /api/subscriptions/usage` — agregador único (books/eco/voice/diary + quotas + period).
- `GET /api/subscriptions/invoices?limit=N` — pasa-thru a `stripe.invoices.list`.
- `POST /api/subscriptions/cancel` — Stripe `cancel_at_period_end=true` + mirror local + invalida cache.
- `POST /api/subscriptions/reactivate` — idempotente, revierte el cancel.

**Schema:** `BillingUsageDay { userId, day, booksCompleted, ecoMessages, voiceMinutes, diaryEntries }` con `(userId, day)` único. Migración `20260528000000_s7_billing_usage_day`.

**Servicios nuevos:**
- `UsageService` — agregador + cache Redis 5min con `invalidate(userId)` post cancel/reactivate.
- `PaymentService` extendido con `listInvoices/cancelAtPeriodEnd/reactivate` (delegating).
- `IPaymentProvider` interface +3 métodos requeridos; `StripeProvider` los implementa, `PayphoneProvider` los stubs.
- `quotas.ts` — `PLAN_QUOTAS` record: FREE 20/0/null, PRO 200/120/null, B2B unlimited.

**BullMQ:**
- Nueva queue `DAILY_USAGE` registrada en producer + worker.
- `JobsService.onModuleInit` registra `upsertJobScheduler` con cron `0 2 * * *` UTC.
- `DailyUsageProcessor` (worker) — fan-out single-job. Idempotente por unique key. Retry 5min/25min/2h.

**Shared:**
- `@psico/types` +14 tipos (Usage*, Invoice*, Cancel/Reactivate*).
- `@psico/api-client` +5 métodos (`createPortalSession`, `getUsage`, `listInvoices`, `cancel`, `reactivate`). `generated.ts` 62.1 KB → 65.5 KB.

**Bugs corregidos (3, bitácora §8):**
1. `Stripe.Invoice` como namespace no resoluble en Stripe v22 CJS → derivar con `Awaited<ReturnType<...>>`.
2. `SubscriptionService` + `JobsService` specs rompieron con deps nuevas en constructor.
3. Test reactivate fallaba: fixture `sub_stripe_123` vs prisma mock `sub_1` → unificados.

**Smoke boot:** 60+ rutas mapeadas bajo `/api/*`, log "Daily usage rollup scheduled · id=daily-usage-02-utc". OpenAPI generate:check OK.

**Deuda técnica abierta:**
- Eco/Voice counters siempre 0 hasta S8/S10. Quotas YA expuestas para que el front diseñe la UI desde día 1.
- `booksCompletedThisPeriod` aproximado (no usa un `book.completedAt` real).
- Sin enforcement de quotas — los feature modules tienen que respetarlas en S8/S10.
- Sin test integration del `DailyUsageProcessor` (depende de queries Prisma reales).
- 8 migraciones acumuladas en Railway (bloqueante de deploy).
- `InvoiceSummary` no incluye `description` ni `lineItems`.
- Cache invalidation no es proactiva en writes (5min stale window aceptable v1).

---

### Sesión 25 — 2026-05-27 ✅ COMPLETADA — Sprint S8 VoiceModule

**Rama sugerida:** `feature/sprint-s8-voice`
**Tests:** 296/296 API + 34/34 crypto (279 → 296, +17 tests nuevos)
**ADRs aplicados:** ninguno nuevo (decisión documentada en bitácora §3)
**Bitácora:** [docs/informes/sprint-s8-voice.md](docs/informes/sprint-s8-voice.md)

**Decisiones del usuario lockeadas:**
1. **Ambos providers via strategy pattern** (Whisper + Deepgram) — VOICE_PROVIDER env selecciona. Whisper default.
2. **Pre-flight reject 402 + post-flight track** — protege contra abuso financiero ($$$/min).
3. **Cap 25 MB (Whisper-native)** — sin chunking server-side, deuda para v2 si UX lo pide.

**Lo que se construyó:**

**Backend — 2 endpoints nuevos:**
- `POST /api/voz/transcribe` — multipart audio → transcript. Throttle 10/min/user. Quota gates: 403 FREE, 402 over-quota.
- `POST /api/voz/usage` — reconciliación opcional cliente/server.

**Schema:** `VoiceTranscription { userId, durationSec, language, provider, createdAt }` — SOLO metadata, audio nunca se almacena (07-voz.md privacy contract). Migración `20260529000000_s8_voice_transcription`.

**Provider strategy:**
- `IVoiceProvider` interface (analog a `IPaymentProvider`).
- `WhisperProvider` — POST multipart a OpenAI `/audio/transcriptions`.
- `DeepgramProvider` — POST binario a `/v1/listen?model=nova-3`.
- `VoiceService.selectProvider()` lee `VOICE_PROVIDER` env.
- Env `superRefine` exige la API key del provider activo.

**Wire-up con S7:**
- `UsageService.voice.minutesThisPeriod` ahora SUMa `VoiceTranscription.durationSec` real (antes hardcoded 0).
- `DailyUsageProcessor` (BullMQ nightly) popula `BillingUsageDay.voiceMinutes`.
- Post-transcripción: `usageService.invalidate(userId)` busta el cache 5-min.

**Shared:**
- `@psico/types` +3 tipos (`VoiceProvider`, `VoiceTranscribeResponse`, `VoiceUsageReport*`).
- `@psico/api-client` +1 `voiceApi.transcribe(blob, { language })` + nuevo `apiClient.postFormData<T>` para multipart. `generated.ts` 65.5 KB → 67.0 KB.

**Bugs corregidos (3, bitácora §7):**
1. `Stripe.Invoice` namespace pattern reusado para `StripeInvoice` — feedback de S7.
2. Test del Whisper provider con `makeConfig(undefined)` no rechazaba — JS default-parameter sustituye `undefined`. Fix: sentinel `Symbol("unset")`.
3. `@psico/api-client` no soportaba multipart — añadido `postFormData` que skip JSON-stringify + Content-Type.

**Smoke boot:** 2 rutas nuevas mapeadas, OpenAPI generate:check OK, todos los typecheck/lint verdes.

**Deuda técnica abierta:**
- Sin chunking >25 MB (v2 con ffmpeg).
- Sin streaming Deepgram WS (v2).
- Sin idempotencia (retry duplica costo — mitiga el throttle 10/min). Idempotency-Key header en S11.
- Sin tests del DeepgramProvider (mocks anidados; cubrir cuando ops lo active).
- `OPENAI_API_KEY` y `DEEPGRAM_API_KEY` no configurados en Railway — bloqueante para deploy del módulo.
- 9 migraciones acumuladas en Railway.
- Quota cuenta por billing period (no calendar month) cuando hay sub activa — documentado, edge case aceptable.

---

### Sesión 26 — 2026-05-27 ✅ COMPLETADA — Sprint S10 AIModule conversacional (Eco)

**Rama sugerida:** `feature/sprint-s10-eco-chat`
**Tests:** 323/323 API + 34/34 crypto (296 → 323, +27 tests nuevos · 1 skipped sentinel)
**ADRs aplicados:** [0007 §C](docs/adr/0007-e2e-encryption-diario-eco.md) — Eco hybrid encryption, parcialmente.
**Bitácora:** [docs/informes/sprint-s10-eco-chat.md](docs/informes/sprint-s10-eco-chat.md)

**Decisiones del usuario lockeadas:**
1. **Hybrid encryption** — cliente envía plaintext+ciphertext, server usa plaintext in-flight para LLM/crisis y persiste solo ciphertext. Assistant en plaintext.
2. **SSE** (Server-Sent Events) como protocolo de streaming.
3. **Ambos layers de crisis detection** — regex pre-LLM + [CRISIS] sentinel del LLM.

**Lo que se construyó:**

**Backend — 6 endpoints nuevos bajo `/api/eco/*`:**
- `GET /caps` — persona (name, voice, caps).
- `GET /threads`, `POST /threads`, `GET /threads/:id`, `DELETE /threads/:id`.
- `POST /messages` — SSE stream (delta/crisis/suggestion/done/error events). Throttle 30/min/user.
- `POST /messages/:id/report` — flag bad replies (HALLUCINATION/OFF_TONE/SENSITIVE_CONTENT/CRISIS_MISHANDLED/OTHER).

**Schema:**
- `EcoThread { id, userId, titleCiphertext?, titleNonce?, lastMessageAt }`.
- `EcoMessage { id, threadId, kind (USER/ASSISTANT/CRISIS/SUGGESTION), textCiphertext?, textNonce?, assistantText?, suggestedBookId?, input/outputTokens }`.
- `EcoMessageReport { id, messageId, userId, reason enum, comment? }`.
- Backward-compat: `Conversation` y `ConversationMessage` siguen vivos para `/ai/chat`.

**Crisis detection (dos layers):**
- **Layer 1** — `isCrisisText(plaintext)` regex con patrones unambiguos (`suicid`, `quitarme la vida`, `no quiero vivir`, inglés). Si match → emit `crisis` event, persiste `EcoMessage` con `kind=CRISIS`, NO llama al LLM.
- **Layer 2** — system prompt instruye al LLM a responder EXCLUSIVAMENTE con `[CRISIS]` como primer token si detecta señales. Streaming pipeline aborta + reemplaza con canned message.

**Quotas (`PLAN_QUOTAS.eco`):**
- FREE: 10 user-messages por UTC-day.
- PRO/ANNUAL: 200 user-messages por billing period.
- B2B: unlimited.

**Wire-up con S7:** 🎉 cierra el último counter de `/usage`:
- `UsageService.eco.messagesThisPeriod` ahora cuenta `EcoMessage` con `kind=USER`.
- `DailyUsageProcessor` popula `BillingUsageDay.ecoMessages` nightly.
- Post-mensaje: `usageService.invalidate(userId)` busta cache 5-min.

**Shared:**
- `@psico/types` +9 tipos (`EcoMessageKind`, `EcoPersona`, `EcoSseEvent` union, etc.).
- `@psico/api-client`: nuevo `ecoApi` con SSE consumer (`sendMessage` usa fetch + reader, parser de event/data frames). `generated.ts` 67.0 KB → 72.2 KB.

**Privacy invariant:** `eco.privacy.spec.ts` enforce no `logger.*`/`console.*` referencia `textPlaintext`, `textCiphertext`, `textNonce`, `titleCiphertext`, ni `titleNonce`.

**Bugs corregidos (3, bitácora §7):**
1. `Subject.complete()` en `finally` antes del error event → quota gate test veía 0 eventos. Fix: try/catch INSIDE el runner, emit error inline, complete una vez al final.
2. `UsageService` spec mock faltaba `ecoMessage.count`. Añadido al helper.
3. Anthropic SDK mock con `stream.on("text", ...)` necesitó drenar chunks vía `Promise.resolve().then` para que el listener se registre antes.

**Smoke boot:** 7 rutas nuevas mapeadas, OpenAPI generate:check OK, todos los typecheck/lint/privacy verdes.

**Deuda técnica abierta:**
- History parcial del user en LLM (solo current turn + assistant past turns; user past turns son ciphertext, server no puede decrypt). v2 con client-side summary.
- Sin frontend UI (chat screen web + mobile pendiente).
- `intent: "suggest"` no diferencia el system prompt todavía.
- Sin resumen de hilo cada 20 mensajes (design 08-eco.md §thread).
- Sin tests del LLM-sentinel path (layer 2). Layer 1 cubierto.
- 10 migraciones Prisma + 3 API keys (ANTHROPIC/OPENAI/DEEPGRAM) + RESEND_API_KEY + REDIS_URL sin configurar en Railway — bloqueante de deploy.
- `Conversation` viejo + `/ai/chat` siguen vivos. Cleanup en sprint separado cuando el front migre.

---

### Sesión 27 — 2026-05-27 ✅ COMPLETADA — Sprint front-fase1 (Mi Plan UI)

**Rama sugerida:** `feature/sprint-front-fase1`
**Tests:** 323/323 API + 34/34 crypto (sin cambios — sprint orientado a UI)
**Bitácora:** [docs/informes/sprint-front-fase1-mi-plan.md](docs/informes/sprint-front-fase1-mi-plan.md)

**Decisión del usuario:** scope reducido a "Mi Plan (web + mobile) primero" (de las 4 opciones disponibles). Voz y Eco UI quedan para sprints separados.

**Lo que se construyó:**

**Web (`apps/web`):**
- Server actions `cancelSubscriptionAction(formData)` + `reactivateSubscriptionAction()` con `revalidatePath("/dashboard/plan")`.
- Componentes nuevos en `src/components/dashboard/plan/`:
  - `UsageCards.tsx` — Server Component puro, 4 mini-cards (libros/eco/voz/diario) con progress bars y formato i18n.
  - `InvoicesList.tsx` — Server Component, tabla con date/amount/status pill/PDF link. Empty state.
  - `SubscriptionActions.tsx` — Client Component, modal de cancel con textarea de razón (480 chars), ReactivateButton conditional.
- `/dashboard/plan/page.tsx` paraleliza 4 fetches (`/me`, `/plans`, `/usage`, `/invoices`). `dynamic = "force-dynamic"`.

**Mobile (`apps/mobile`):**
- Componentes paridad en `src/components/dashboard/plan/`:
  - `UsageCards.tsx` — grid 2x2.
  - `InvoicesList.tsx` — lista stack con `Linking.openURL` para PDF.
  - `SubscriptionActions.tsx` — Card con badge, fecha, 3 botones, modal RN custom (no `Alert.prompt` por incompatibilidad Android).
- `(tabs)/plan.tsx` ahora orquesta `loadAll()` con `RefreshControl` pull-to-refresh + `onChanged` callback para invalidación manual.

**Shared (`@psico/api-client`):**
- `subscriptionApi.getMySubscription()` añadido (faltaba — el endpoint existe desde S4 pero el cliente nunca lo había wrapped).

**Bugs corregidos (3, bitácora §5):**
1. `Colors.sage[700]` no existe en theme mobile (solo `50/100/400/500/600`). Fix: usar 600.
2. `getMySubscription` faltaba en api-client. Añadido sin breaking changes.
3. TS strict null check en `inv.pdfUrl` — guards correctos en web (ternario) y mobile (`!` post-guard).

**UX trade-offs:**
- UsageCards visible para FREE como preview educativo ("vas a desbloquear esto").
- Cancel reason capture como free-text (no taxonomy todavía — esperar 50-100 cancels para data-driven design).
- Color rojo + progress bar rojo cuando `current >= quota` (sutil, sin gritar).
- Pull-to-refresh solo en mobile; web confía en `revalidatePath`.

**Smoke verification:**
- API tests 323/323 (sin cambios).
- Web/mobile typecheck + lint clean.
- Web `pnpm build` compila sin errores.
- OpenAPI generate:check OK.

**Deuda técnica abierta:**
- Sin tests UI dedicados (Vitest + React Testing Library). Esperar a tener más componentes para amortizar setup.
- Mobile `Linking.openURL` Stripe Portal no usa deep-link return → user vuelve manualmente. v2 requiere Universal Links setup.
- Web `<table>` no es responsive narrow (aceptable — desktop-first).
- Sin error toast global; cancel error aparece dentro del modal.

---

### Sesión 28 — 2026-05-27 ✅ COMPLETADA — Sprint front-voz (Voice UI)

**Rama sugerida:** `feature/sprint-front-voz`
**Tests:** 323/323 API + 34/34 crypto (sin cambios — sprint UI)
**Bitácora:** [docs/informes/sprint-front-voz.md](docs/informes/sprint-front-voz.md)

**Lo que se construyó:**

**Web:**
- `src/lib/voice/use-recorder.ts` — Hook MediaRecorder con state machine. Hard cap 10 min. Sin pausa/resume v1.
- `src/lib/voice/handoff.ts` — sessionStorage read-and-delete para pasar transcript a Diario.
- `src/components/dashboard/voz/VozRecorder.tsx` — Client Component orquestador con sub-components inline (Idle/Recording/Stopped/Transcribing/Ready/Errors).
- `/dashboard/voz/page.tsx` — Server shell con `?return=…` (default /dashboard/diario).
- ActiveComposer extendido con botón "🎙️ Dictar" + `useEffect` para `consumeVoiceHandoff` al mount.

**Mobile:**
- `expo-av@~15.0.0` instalado.
- `src/lib/voice/handoff.ts` — singleton in-memory (no AsyncStorage por privacidad).
- `(tabs)/voz.tsx` — paridad de state machine con web. `Audio.Recording.HIGH_QUALITY` preset. Registrado con `href: null`.
- Diario composer extendido con botón "🎙️ Dictar" + `useFocusEffect` para consumir handoff al regainar foco.

**Decisiones de diseño (bitácora §3):**
1. Handoff por storage (sessionStorage web, singleton mobile) — privacy default, no en URL/disk.
2. Single-take v1 — no pausa/resume.
3. Sin waveform — dot rojo + timer.
4. Cap 10 min cliente vs 25 MB server — UX honesta + cost containment.
5. Mobile usa `{uri,name,type}` shape vs Blob (Android pre-12 mishandle boundary).

**Error states cubiertos:** 403 PRO_REQUIRED, 402 QUOTA_EXCEEDED, 413 TOO_LARGE, 415 FORMAT, network, permission-denied, unsupported.

**Bugs corregidos (2):** `ApiError.status` → `statusCode`. Unused `blob` variable cleanup.

**Verificación:** API tests 323/323 (sin cambios), web/mobile typecheck + lint clean, web build clean, OpenAPI in sync.

**Deuda técnica abierta:**
- Sin tests UI dedicados.
- No waveform / no pausa-resume / no streaming partial transcript.
- Web fetch bypassa apiClient (no retry-on-401-refresh para flow voice).
- `OPENAI_API_KEY` / `DEEPGRAM_API_KEY` no configurados en Railway — bloqueante deploy.

---

### Sesión 29 — 2026-05-27 ✅ COMPLETADA — Sprint front-eco (Eco chat UI)

**Rama sugerida:** `feature/sprint-front-eco`
**Tests:** 323/323 API + 34/34 crypto (sin cambios — sprint UI)
**Bitácora:** [docs/informes/sprint-front-eco.md](docs/informes/sprint-front-eco.md)

**Lo que se construyó (último UI sprint de Fase 1):**

**Shared:**
- `DiaryKeyContext` extendido con `ecoKey` (derivado de masterKey vía HKDF/ECO_KEY_INFO en unlock + adoptMasterKey; zerificado en lock). Web + mobile paridad.
- Mobile `diaryKeyStore.saveEco/loadEco` para persistir en SecureStore. `clear()` borra ambas keys.
- `@psico/api-client`: nuevo `apiClient.getAccessToken()` público (necesario para el SSE bypass).

**Web (`apps/web`):**
- `/dashboard/eco/page.tsx` — Server shell paraleliza `/eco/caps` + `/eco/threads`.
- `EcoShell.tsx` — Client orchestrator, gates por ecoKey, auto-create thread vacío al landing.
- `ThreadRail.tsx` — sidebar con title decryption inline.
- `ChatArea.tsx` — message history + composer + SSE consumer + crisis handling.
- `CrisisModal.tsx` — non-dismissable banner con tel: deep link.
- `_DashboardShell` nav: nuevo item "🌿 Eco".
- `@psico/api-client` añadido como dep de web.

**Mobile (`apps/mobile`):**
- `(tabs)/eco/index.tsx` — chat completo, single screen.
- `KeyboardAvoidingView` iOS; `ScrollView.scrollToEnd` auto-scroll.
- `ThreadRailModal` (bottom-sheet idiomático mobile, no sidebar permanente).
- `CrisisModal.tsx` — paridad web con `Linking.openURL("tel:...")`.
- Eco registrado como tab visible con ícono `leaf` entre Diario y Mi plan.

**Decisiones (bitácora §4):**
1. Single context para diary + eco — masterKey deriva ambos.
2. Rail como sidebar permanente en web, modal bottom-sheet en mobile.
3. Hotline `tel:` deep link en ambas plataformas (one tap to dial en crisis).
4. Auto-scroll instant (web) / animated (mobile) — RN renderiza más lento que red.
5. Title decryption con fallback "🔒 Hilo cifrado" para password-rotation edge cases.

**Bugs corregidos (3):** `@psico/api-client` no era dep de web (añadido). `react-hooks/exhaustive-deps` rule no instalada en web (refactor a `useRef`). `apiClient.getAccessToken()` no existía (añadido).

**Privacy invariants:**
- `textPlaintext` SOLO va in-flight; nunca persiste cliente OR server.
- USER messages persisten cifrados; ASSISTANT/CRISIS persisten plaintext (LLM-generados).
- Title cipher rotation-tolerant (fallback graceful).

**Smoke verification:** API tests 323/323 (sin cambios), web/mobile typecheck + lint clean, web build clean, OpenAPI in sync.

**Deuda técnica abierta:**
- Sin tests UI dedicados (mismo argumento sprints anteriores).
- Reports UI no implementado (backend listo desde S10).
- No thread title generation (cliente cifrando primer msg → enviar como title).
- Sin paginación de mensajes (cargamos primera página de 50).
- Web api-client singleton no configurado (solo sendMessage usa baseUrl+token explícitos).
- Sin retry on SSE network disconnect mid-stream.
- `ANTHROPIC_API_KEY` no configurado en Railway — bloqueante deploy del módulo.

---

### Sesión 30 — 2026-06-01 ✅ COMPLETADA — Deploy a Railway + incident recovery + 3 bugfixes

**Rama:** `fix/deploy-prisma-corruption`
**Bitácora:** [docs/informes/deploy-2026-06-01-incident.md](docs/informes/deploy-2026-06-01-incident.md)

**Síntoma:** primer deploy a Railway desde Sesión 8. El servicio del API servía código pre-Sprint 0.A: `/api/health` 404 porque el global prefix `/api` (Sesión 11) no estaba en producción. Dos `railway up` fallaron con "Deploy failed".

**Causa raíz:** archivos `migration.sql` corruptos con `Loaded Prisma config from prisma.config.ts.` como primera línea literal (Prisma 7 imprime esa línea informativa a stdout al cargar `prisma.config.ts`; se filtró por pipe/redirect mal hecho al generar las migraciones). En Railway, `prisma migrate deploy` lo ejecutó como SQL → `ERROR: syntax error at or near "Loaded"`.

**Lo que se hizo:**
- `sed -i` para limpiar los archivos afectados (`20260526180000_s5_books_*` y `20260526210000_s6_diary_*`).
- `prisma migrate resolve --rolled-back` para reset del estado en Postgres.
- Re-deploy con migraciones limpias.
- `apps/api/railway.json` con `buildCommand: "pnpm install --frozen-lockfile && pnpm --filter @psico/api... build"` + `preDeployCommand: "pnpm --filter @psico/api migrate:deploy"`.
- `apps/web/vercel.json` con `installCommand: "cd ../.. && corepack enable && pnpm install --frozen-lockfile"`.

**3 bugfixes a posteriori:**
1. **Redirect propagation en Next.js layouts** — `serverFetch` lanza `redirect('/login')` pero los `catch {}` lo swallowaban. Fix: helper `isNextThrow(err)` en `apps/web/src/lib/api.server.ts` y re-throw en `dashboard/layout.tsx` + `biblioteca/[idOrSlug]/page.tsx`.
2. **Stripe price IDs reales** — pendiente, tarea del usuario.
3. **Pre-commit hook contra "Loaded Prisma config"** — `scripts/check-migration-sql.sh` que rechaza cualquier `migration.sql` cuya primera línea no sea SQL válida. Hooked vía `husky/.husky/pre-commit`.

**Smoke verification post-fix:**
- `GET /api/health` → 200 OK.
- Prisma migraciones aplicadas (8 acumuladas).
- Worker provisionado como segundo Railway service.
- Smoke walk con el usuario: register → unlock Diario → Eco chat ✅.

**Deuda técnica abierta:**
- Stripe price IDs reales (bugfix #2 sigue pending).
- `pnpm-lock.yaml` quedó duplicado (767 líneas) por `-X ours` merge — corregido con `pnpm install --no-frozen-lockfile`.

---

### Sesión 31 — 2026-06-02 ✅ COMPLETADA — Sprint S11 BillingModule + GET /api/plan + GET /api/billing/return

**Rama:** `feature/sprint-s11-billing-cleanup`
**Tests:** 323/323 API + 34/34 crypto (sin cambios — sprint sin lógica nueva en cripto)
**Bitácora:** [docs/informes/sprint-s11-billing-cleanup.md](docs/informes/sprint-s11-billing-cleanup.md)

**Decisión gigante:** NO movemos `apps/api/src/subscription/` físicamente — creamos `apps/api/src/billing/` que **reusa** los services del legacy module. El legacy controller queda activo con headers `Deprecation: true` + `Sunset` por 90 días según ADR 0006. Cuando esa ventana cierre (2026-08-31), una sesión futura colapsa todo a `billing/`.

**Lo que se construyó:**

**Backend:**
- `apps/api/src/billing/` nuevo con controller que delega a `SubscriptionService` + `UsageService` + `PaymentService`.
- `GET /api/billing/checkout-session` · `POST /api/billing/customer-portal` · `GET /api/billing/usage` · `GET /api/billing/invoices` · `POST /api/billing/cancel` · `POST /api/billing/reactivate` · `GET /api/billing/return`.
- **`GET /api/plan` envolvente** — agrega `/me + /plans + /usage + /invoices` en una sola request (consistente con `/api/home`).
- **`GET /api/billing/return`** — callback post-checkout que detecta status (paid/processing/failed) y produce mensaje accionable. Sin Universal Links en mobile, sin deep-link gymnastics.
- **Webhook doble exposure:** `/api/billing/webhook` + `/api/subscriptions/webhook` (legacy) ambos válidos por 90d.

**Cliente:**
- `packages/api-client/src/billing.ts` nuevo. `subscriptionApi` queda `@deprecated`.
- `generated.ts` 65.5 KB → 67.0 KB.

**Web:** `/dashboard/plan` migrado a `billingApi.getPlan()` (1 request en lugar de 4).
**Mobile:** `(tabs)/plan` migrado igual.

**Smoke verification:**
- API tests 323/323.
- OpenAPI in sync.
- Web typecheck + lint OK, build OK.
- Mobile typecheck + lint OK.

**Deuda técnica abierta:**
- Sunset 2026-08-31 del path `/api/subscriptions/*`.
- Stripe price IDs reales (bugfix #2 sigue pending).

---

### Sesión 32 — 2026-06-02 ✅ COMPLETADA — Sprint S6 LectorModule backend

**Rama:** `feature/sprint-s6-lector`
**Tests:** 348/349 (323 anteriores + 25 nuevos, 1 skipped sentinel)
**Bitácora:** [docs/informes/sprint-s6-lector.md](docs/informes/sprint-s6-lector.md)

**Lo que se construyó (último backend core de Phase 1):**

Cierra el core product que faltaba: la pantalla del **Lector** real. Hasta hoy `/dashboard/biblioteca/[slug]` mostraba metadata + lista de capítulos pero los capítulos no se podían leer porque su contenido no existía en DB. Este sprint introduce `ChapterBlock` (bloques tipados que reemplazan `Chapter.body String`), highlights, annotations, reading session heartbeat y audio signed URL — los 9 endpoints del diseño `docs/design/handoff/05-lector.md`.

**Schema (`apps/api/prisma/schema.prisma`):**
- `ChapterBlock { id, chapterId, order, kind, content, meta?, createdAt, updatedAt }`.
- `Highlight { id, userId, blockId, startOffset, endOffset, color, note? }`.
- `Annotation { id, userId, blockId, text }`.
- `ReadingSession { id, userId, chapterId, lastBlockId?, progressPct, timeSpentSec, completedAt? }`.
- Enums: `ChapterBlockKind` (PARAGRAPH/HEADING/QUOTE/PAUSE/EXERCISE), `HighlightColor` (YELLOW/BLUE/PINK).
- Migración `20260602100000_s6_lector_*` aditiva.

**Por qué `ChapterBlock` en lugar de `Chapter.body String`:**
1. Highlights/annotations anclan a un block ID estable, no a rangos en un string que cambia con cada edición editorial.
2. Audio playback puede mapearse por block ID (timestamps).
3. Renderizado tipado por bloque (un PAUSE no es un PARAGRAPH).

**Endpoints (9 nuevos):**
- `GET /api/lector/:bookId/:order` — fetcha capítulo + bloques + highlights/annotations del user + reading session.
- `PATCH /api/lector/session` — heartbeat cada 5s.
- `POST /api/lector/session/complete` — marca completedAt + dispara cascade en bookProgress.
- `GET/POST/PATCH/DELETE /api/lector/highlights` — CRUD.
- `GET/POST/PATCH/DELETE /api/lector/annotations` — CRUD.
- `PATCH /api/user/reader-preferences` — theme/font/fontSize/lineHeight.

**Seed:** 30 ChapterBlocks reales para los 2 libros ancla (Emociones en Construcción + Familias Ensambladas).

**Cliente:** `lectorApi`, `highlightsApi`, `annotationsApi`. `generated.ts` 67.0 KB → 72.0 KB.

**Smoke verification:**
- API tests 348/349 (323 → 348, +25 nuevos).
- OpenAPI in sync.
- Migración aplicada en producción Railway.

**Deuda técnica abierta:**
- Audio playback URLs: signed por R2, TTL 1h. No streaming, expone direct URL.
- `ChapterBlock.content` plaintext (no E2E) — books son contenido público licenciado.
- Sin búsqueda full-text en blocks (postgres `tsvector` candidate).

---

### Sesión 33 — 2026-06-02 ✅ COMPLETADA — Sprint S6-front Reader UI (web + mobile)

**Rama:** `feature/sprint-s6-front-lector`
**Tests:** 348/349 backend (sin cambios — sprint UI puro)
**Bitácora:** [docs/informes/sprint-s6-front-lector.md](docs/informes/sprint-s6-front-lector.md)

**Lo que se construyó (último UI de Fase 1):**

**Web — `/dashboard/biblioteca/[idOrSlug]/lector/[chapterOrder]`:**
- `page.tsx` Server Component — pre-fetcha el chapter con `serverFetch('/lector/:bookId/:order')` para first-paint con contenido real.
- `LectorShell.tsx` — Client orchestrator. Owns todos los state slices: highlights, annotations, prefs, selection, session. Optimistic UI on todas las mutaciones.
- `BlockRenderer.tsx` — Renderiza cada `ChapterBlockKind` con estilos del prototype `Lector.html`. Cada block expone `data-block-id` para hit-testing.
- `HighlightPopover.tsx` — Popover flotante anclado al `selection.rect`. 3 swatches (YELLOW/BLUE/PINK) + botón "✎ Nota".
- `AnnotationsPanel.tsx` — Side sheet derecho con composer + lista + inline edit + delete con confirm. Filtrable por bloque.
- `ReaderPreferencesModal.tsx` — Aa-style settings sheet (theme + font + fontSize + lineHeight).
- `use-heartbeat.ts` — Hook que dispara `PATCH /api/lector/session` cada 5s. Pausa cuando `document.hidden`. `keepalive: true` para que el último beat sobreviva navegación.

**Mobile:** vista view-only del lector + heartbeat + annotations CRUD via long-press. Web tiene la selección + highlights; mobile defiere a v2 (text selection en RN requiere libraries adicionales).

**Wire del "Leer →":** `ChaptersList.tsx` (detalle del libro) ahora envuelve cada row en `<Link href={\`/dashboard/biblioteca/${bookSlug}/lector/${ch.n}\`}>`.

**Smoke verification:**
- API tests 348/349 (sin cambios).
- Web typecheck + lint OK.
- Mobile typecheck + lint OK.

**Deuda técnica abierta:**
- Mobile text selection + highlight creation.
- Reader audio playback (audio URL ya viene del backend).
- Sin tests UI dedicados.

---

### Sesión 34 — 2026-06-03 ✅ COMPLETADA — Sprint S4-front Onboarding UI

**Rama:** `feature/sprint-s4-front-onboarding`
**Tests:** 348/349 backend (sin cambios)
**Bitácora:** [docs/informes/sprint-s4-front-onboarding.md](docs/informes/sprint-s4-front-onboarding.md)

**Lo que se construyó:**

Backend del onboarding estaba vivo desde Sesión 16 (Sprint S4) con 11 endpoints + 3 modelos Prisma + catálogos seeded. Hasta hoy ningún usuario nuevo lo veía — entraban al `/dashboard` directamente sin contexto, sin firstName, sin reco de libro inicial. Este sprint cierra el gap UI.

**Backend (cambio mínimo):**
- `UserMeResponse.onboardingState: { completedAt, skippedAt, tourCompletedAt } | null` — single source of truth.
- Sin migración Prisma (modelo `OnboardingState` ya existía desde S4).

**Web (`apps/web/src/app/(onboarding)/`):**
- 5-step route group con layout gating: Welcome → Motivos → Mood → Perfil → Recomendación.
- Server actions en cada step: `saveStep1Action(motivosIds)`, `saveStep2Action(moodId)`, `saveStep3Action(firstName, voicePreference)`, `closeOnboarding()`.
- Middleware en `apps/web/middleware.ts` redirige users sin onboarding a `/onboarding`.

**Mobile (`apps/mobile/app/(onboarding)/`):**
- 5 pantallas paridad con state machine.
- Tabs layout gating en `(tabs)/_layout.tsx` redirige a `/onboarding` si no `completedAt && !skippedAt`.

**Smoke verification:**
- API tests 348/349 (sin cambios).
- Web typecheck + lint OK, build OK.
- Mobile typecheck + lint OK.

**Deuda técnica abierta:**
- Tour overlay (paso 5 del design dice "tour" — quedó como `tourCompletedAt: null`).
- Reco copy puede mejorar con A/B test cuando hay datos.

---

### Sesión 35 — 2026-06-03 ✅ COMPLETADA — Sprint S10 PatronesModule + UI

**Rama sugerida:** `feature/sprint-s10-patrones`
**Tests:** 356/356 API + 34/34 crypto (348 → 356, +8 nuevos · 1 skipped sentinel)
**Bitácora:** [docs/informes/sprint-s10-patrones.md](docs/informes/sprint-s10-patrones.md)

**Decisiones lockeadas:**
1. Pro-only **soft-lock** (200 + `locked: true`), no 403. Mismo patrón que `home.ecoMoment`.
2. Aggregation **in-process** sobre plaintext metadata (`mood`, `tags`, `createdAt`). Cripto E2E del Diario solo protege `body`/`excerpt`.
3. `WeeklySummary` **persiste** con `@@unique([userId, weekStart])`. v1 narrative rule-based; LLM-backed cuando AIModule lo permita.
4. **Sincrónico**, no BullMQ. Aggregation <50ms para 90d.
5. `shareWithTherapist` queda **stub** hasta TherapyModule v2.

**Lo que se construyó:**

**Backend — 3 endpoints `/api/patrones/*`:**
- `GET /` → soft-lock FREE o full aggregate (moodMap + hourMood + weeklySummary + period descriptor).
- `POST /weekly-summary/regenerate` → 200 con summary · 403 FREE · 422 NOT_ENOUGH_ENTRIES (<7 weekly entries).
- `POST /share-with-therapist` → stub.

**Schema:** `WeeklySummary { userId, weekStart, headline, narrative, entriesUsed, generatedAt }`. Migración `20260604120000_s10_weekly_summary` ya aplicada en prod.

**`@psico/types` +12 tipos** (PatronesPeriod, PatronesResponse, PatronesMoodMapDay, PatronesHourMoodBucket, PatronesWeeklySummary, etc.).

**8 unit tests:** FREE soft-lock · PRO aggregation · hourMood buckets · fallback swatch · regenerate 403/422/upsert · share stub.

**Web (`apps/web/src/app/dashboard/patrones/page.tsx` + 3 components):**
- `MoodHeatmap.tsx` — calendar strip first-to-last ISO con `warm-100` para gap days.
- `HourMoodChart.tsx` — 24-bar horizontal chart, dominant mood per hour.
- `WeeklySummaryCard.tsx` — Client Component lavender gradient, regenerate handler con 422 inline.
- Header con tabs `?period=30d|90d|1y` como `<Link>` (zero-JS).
- Paywall card lavender gradient para FREE → CTA `/dashboard/plan`.
- Sidebar `_DashboardShell` extendido con `📊 Patrones`.

**Mobile (`apps/mobile/app/(tabs)/patrones.tsx` single-screen):**
- Tabbar item nuevo con `stats-chart` icon (6 ítems totales).
- Mismo state machine: loading | error | locked (paywall) | empty (<7) | full Pro.
- Pull-to-refresh, period tabs como Pressable chips, regenerate handler.

**Cliente:** `patronesApi` con 3 métodos. `generated.ts` regenerated, `generate:check` OK.

**Smoke verification:**
- API tests 356/356.
- @psico/crypto tests 34/34.
- Web typecheck + lint OK · Mobile typecheck + lint OK.
- OpenAPI in sync.

**Deuda técnica abierta:**
- `composeNarrative` rule-based v1 (placeholder LLM).
- Sin cache 5-min de getPatrones (justificable cuando period=1y).
- `shareWithTherapist` stub hasta TherapyModule v2.
- Mobile tabbar a 6 ítems — re-evaluar si se siente apretado.
- WeeklySummary nunca borra rows viejas (~104/año, no crítico).

---

### Sesión 36 — 2026-06-03 ✅ COMPLETADA — Sprint B (pulir Phase 1)

**Rama sugerida:** `feature/sprint-b-polish`
**Tests:** 356/356 API + 34/34 crypto (sin cambios — sprint UI/UX puro).
**Bitácora:** [docs/informes/sprint-b-polish.md](docs/informes/sprint-b-polish.md)

**Lo que se construyó (3 pulidos sobre el Eco chat):**

1. **Reports UI Eco (web)** — `ReportMessageModal` con 5 razones (HALLUCINATION/OFF_TONE/SENSITIVE_CONTENT/CRISIS_MISHANDLED/OTHER) + comentario opcional 500c. Botón "Reportar" muted bajo cada assistant bubble, filtered out local optimistic IDs.
2. **Paginación Eco (web)** — botón "↑ Mensajes anteriores" al tope cuando `hasMore`. Snapshot `scrollHeight + scrollTop` → fetch con `?cursor=oldestId` → prepend → restore vía `requestAnimationFrame`. Scroll-to-bottom effect respeta `loadingMore` para no re-anclar al fondo.
3. **Reports UI Eco (mobile)** — long-press 400ms en assistant bubble → Modal RN con misma lista de razones. Flash toast 4s al tope post-submit.

**Decisiones:**
- Botón visible vs context-menu (web): no-discoverable en touch.
- Long-press en mobile: gesture idiomático.
- Modal con radio-select sobre `Alert.alert`: 5 opciones + comentario opcional no caben en Alert.
- Mobile pagination diferido: data muestra threads cortos en v1.
- Flash 4s no bloqueante.

**Sin cambios:**
- Backend (endpoint `POST /eco/messages/:id/report` listo desde S10).
- `@psico/types` (EcoMessageReportReason ya existía).
- `@psico/api-client` (`reportMessage()` y `cursor` param ya existían).

**Smoke verification:**
- API tests 356/356.
- @psico/crypto 34/34.
- Web typecheck + lint OK · Mobile typecheck + lint OK.
- OpenAPI in sync.

**Deuda técnica abierta:**
- Mobile pagination si threads crecen.
- Edit/withdraw de un report.
- UI tests con Vitest + RTL (sprint propio).
- Tour overlay onboarding (sprint propio).
- Reports admin dashboard (Pulso v2).

---

### Sesión 37 — 2026-06-03 ✅ COMPLETADA — Sprint S37 Tour overlay onboarding

**Rama sugerida:** `feature/sprint-37-tour`
**Tests:** 356/357 API + 34/34 crypto (sin cambios — sprint UI).
**Bitácora:** [docs/informes/sprint-37-tour.md](docs/informes/sprint-37-tour.md)

**Decisión clave:** Backend ya tenía los 2 endpoints (`GET /api/onboarding/tour`, `POST /api/onboarding/tour/complete`) y el catálogo de steps desde Sesión 16. Sprint S37 monta los clientes web + mobile, cerrando `tourCompletedAt` que vivía en `null` en producción. Patrones añadido como 5° step (post-S35).

**Decisiones:**
1. Tour solo dispara con `completedAt && !tourCompletedAt`. Skip explícito del onboarding ⇒ no tour.
2. `showTour` se decide server-side (en layout), no por componente — single source of truth.
3. Persistencia vía `tourCompletedAt` en server, no localStorage — multi-device + analytics gratis.
4. Web: spotlight + coachmark sobre nav items. Mobile: modal centrado (tabs abajo no se prestan a highlight sin Reanimated/blur).
5. Click backdrop = Saltar (dismissal explícito + barato).
6. `Saltar` y `Terminar` ambos POST a `/tour/complete`; diferencia es `stepsCompleted` reportado.

**Lo que se construyó:**

**Backend:**
- `apps/api/src/onboarding/constants.ts` — agregado step 5 `target: "patrones"`.

**Web:**
- `apps/web/src/app/dashboard/_TourOverlay.tsx` — Client Component (nuevo). Fetch del catálogo + DOM query + spotlight + coachmark + state machine de steps.
- `apps/web/src/app/dashboard/_DashboardShell.tsx` — extendido con `tourTarget` por nav item + `data-tour-target` attribute + nueva prop `showTour`.
- `apps/web/src/app/dashboard/layout.tsx` — computa `showTour` y lo pasa al shell.

**Mobile:**
- `apps/mobile/src/components/TourOverlay.tsx` — RN Modal con paridad de state machine.
- `apps/mobile/app/(tabs)/_layout.tsx` — extrae `tourCompletedAt` de `/user/me` + monta `<TourOverlay>` post-Tabs.

**Smoke verification:**
- API tests 356/356.
- @psico/crypto 34/34.
- Web typecheck + lint OK · Mobile typecheck + lint OK.
- OpenAPI in sync.

**Deuda técnica abierta:**
- Mobile no highlightea tabs (decisión de scope — agregar con Reanimated/expo-blur si UX lo pide).
- Sin animación entre steps.
- No vuelve a aparecer si user lo cierra (intencional, pero podría añadirse botón "Volver a ver el tour" en Seguridad).
- `tourStepsCompleted` no se surface — primer panel de funnel cuando Pulso v2 aterrice.
- Tour es por user (no por device) — install mobile post-tour-web no lo dispara.

---

### Sesión 38 — 2026-06-03 ✅ COMPLETADA — Sprint S38 LLM-backed WeeklySummary

**Rama sugerida:** `feature/sprint-38-weekly-narrative`
**Tests:** 358/359 API + 34/34 crypto (356 → 358 · +2 nuevos · 1 skipped sentinel)
**Bitácora:** [docs/informes/sprint-38-llm-weekly.md](docs/informes/sprint-38-llm-weekly.md)

**Lo que se construyó:**

Reemplaza el `composeNarrative` rule-based del `PatronesService.regenerateWeeklySummary` con una llamada al LLM (Claude Sonnet 4.6 via `AIService`). El endpoint, request shape y response shape quedan idénticos — todo cambia bajo el capó.

**Backend:**
- `apps/api/src/ai/ai.service.ts` — nuevo `generateWeeklyNarrative(stats)` + `WEEKLY_SYSTEM_PROMPT` cacheable + parser `parseWeeklyOutput`.
- `apps/api/src/patrones/patrones.module.ts` — importa `AIModule`.
- `apps/api/src/patrones/patrones.service.ts` — inyecta AIService; nuevo `buildNarrative()` try LLM → catch fallback rule-based; helper `computeWeeklyStats()` module-level que centraliza el payload.
- `findMany` extendido con `tags: true` (plaintext metadata).

**Decisiones:**
1. Sonnet 4.6 (no Haiku) — 1×/semana/user, costo despreciable, tono pesa más.
2. Max tokens 512 + cache_control ephemeral en system prompt.
3. Format estricto `HEADLINE:`/`NARRATIVE:` parseado deterministic.
4. Fallback automático ante CUALQUIER error (key, network, parse, 5xx).
5. Tags incluidos (top 5) — plaintext desde S6, semánticos.
6. Sin cap por user (upsert sobre weekStart hace rate-limit natural).
7. Shape `WeeklySummary` sin cambios — consumers no se tocan.

**Privacy hard:** el LLM **nunca** ve `textCiphertext`, body, o texto del diario. Solo metadata categórica (entryCount, dominantMood, moodCounts, topTags, weekStartIso). Test explícito enforces que las keys del payload son exactamente esas — sin `textCiphertext`, sin `body`.

**Tests nuevos:**
- "calls the LLM with aggregated stats and persists its output" + verificación de privacy keys.
- "falls back to the rule-based composer when the LLM call throws" verifica que el headline contiene el mood dominante.

**Smoke verification:**
- API tests 358/358 (+1 skipped sentinel).
- @psico/crypto 34/34.
- API typecheck + lint OK (4 warnings preexistentes, sin errores nuevos).
- OpenAPI in sync (no shape changes).

**Deuda técnica abierta:**
- Sin cap Redis-backed por user/día (justificable cuando costos lo pidan).
- Sin telemetría en BillingUsageDay del LLM cost.
- Sin A/B entre LLM vs rule-based (pinned para Pulso v2).
- Prompt no usa `lastWeekSummary` como contexto editorial.
- Idioma español hardcoded.

---

### Sesión 39 — 2026-06-04 ✅ COMPLETADA — Sprint S39 UI tests web (Vitest + RTL)

**Rama sugerida:** `feature/sprint-39-web-ui-tests`
**Tests:** 24/24 web nuevos + 358/359 API + 34/34 crypto.
**Bitácora:** [docs/informes/sprint-39-web-ui-tests.md](docs/informes/sprint-39-web-ui-tests.md)

**Lo que se construyó:**

Primera capa de tests UI para `apps/web`. Setup completo Vitest + RTL + jsdom + jest-dom + user-event en el workspace, más cobertura de 5 componentes críticos del producto Phase 1.

**Setup:**
- Dev deps: `vitest@^2`, `@vitejs/plugin-react@^4`, `@testing-library/react@^16`, `@testing-library/jest-dom@^6`, `@testing-library/user-event@^14`, `jsdom@^25`.
- `vitest.config.ts` + `vitest.setup.ts` (jest-dom matchers + cleanup global).
- Scripts: `test` (run once) + `test:watch`.

**Tests creados:**
- `UsageCards` — 6 tests: null state, 4 cards renderizadas, progress bar aria-label, over-quota highlight, `ilimitado`, `no incluido`.
- `WeeklySummaryCard` — 4 tests: null state CTA, render con summary, 422 inline error, regenerate success.
- `ReportMessageModal` — 5 tests: render, radio + counter, POST con shape correcto, error inline, Cancelar.
- `MoodHeatmap` — 4 tests: empty state, cells por día consecutivo, gap-fills warm-100, heading.
- `TourOverlay` — 5 tests: first step, advance, Terminar (stepsCompleted=N), Saltar (stepsCompleted=actual), empty catalog dismiss silencioso.

**Decisiones:**
1. Vitest sobre Jest — mismo runner que API/crypto, sin context switch.
2. jsdom v25 sobre happy-dom — fricción default del ecosistema.
3. `globals: true` para `describe/it/expect` sin imports.
4. `vi.mock("next/navigation")` para `useRouter`.
5. `vi.mock("@psico/api-client")` para mockear cliente sin tocar red.
6. `vi.spyOn(globalThis, "fetch")` cuando el componente usa fetch directo.
7. Sin tests de Server Components (Next runtime complejo).
8. Sin coverage thresholds — sprint para sembrar, no enforce.

**Smoke verification:**
- Web tests 24/24 en 1.35s.
- Web typecheck + lint OK.
- API tests 358/358 (sin cambios).
- @psico/crypto 34/34.
- OpenAPI in sync.

**Deuda técnica abierta:**
- Sin tests para Client Components grandes (LectorShell, ChatArea Eco, EcoShell).
- Sin tests para hooks custom (use-heartbeat, useDiaryKey).
- Sin coverage thresholds.
- Wire de `pnpm test` web al workflow CI pendiente.
- Mobile UI tests (RN Testing Library) — sprint propio.
- Tests integration con MSW — cuando se justifique fidelidad.

---

### Sesión 40 — 2026-06-04 ✅ COMPLETADA — Sprint S40 UI tests mobile (Jest + RNTL + jest-expo)

**Rama sugerida:** `feature/sprint-40-mobile-ui-tests`
**Tests:** 16/16 mobile nuevos + 24/24 web + 358/359 API + 34/34 crypto.
**Bitácora:** [docs/informes/sprint-40-mobile-ui-tests.md](docs/informes/sprint-40-mobile-ui-tests.md)

**Lo que se construyó:**

Cierra la simetría que faltaba después de S39 (web): setup completo Jest + jest-expo + RN Testing Library en `apps/mobile` + cobertura de 3 componentes presentacionales críticos paralelos a los del web.

**Setup:**
- Dev deps: `jest@^29.7.0`, `jest-expo@~52.0.6`, `@testing-library/react-native@^12.9.0`, `react-test-renderer@18.3.1`, `@types/jest`, `@types/react-test-renderer`.
- `babel.config.js` con `babel-preset-expo` para Jest.
- `jest.config.js` con preset `jest-expo`, `setupFilesAfterEnv`, testMatch, transformIgnorePatterns **pnpm-safe** (regex con `(.*/)?<pkg>` que matchea cualquier profundidad), moduleNameMapper `@/*`.
- `jest.setup.ts` con `extend-expect` matchers + mock de `@expo/vector-icons` (el real falla con `loadedNativeFonts.forEach is not a function`).
- Scripts: `test` (`jest --passWithNoTests`) + `test:watch`.

**Tests creados:**
- `UsageCards mobile` — 6 tests: null state, 4 cards, ilimitado, no incluido, "de N", date range.
- `InvoicesList mobile` — 5 tests: null return, empty state, render con invoices, `Linking.openURL` con spy, omite botón cuando pdfUrl es null.
- `TourOverlay mobile` — 5 tests: first step, advance, Terminar con stepsCompleted=N, Saltar con index actual, empty catalog dismiss silencioso.

**Decisiones:**
1. Jest + jest-expo, no Vitest — RN babel preset no portable a Vitest.
2. transformIgnorePatterns pnpm-safe — sin esto, Flow types de `@react-native/js-polyfills` rompen el parser.
3. `babel.config.js` explícito — Jest no comparte el resolver de Metro.
4. Mock de `@expo/vector-icons` global en setup — render real necesita Expo's font-loading bridge.
5. `setupFilesAfterEnv` (no "setupFilesAfterEach" — no existe).
6. `@testing-library/react-native/extend-expect` para matchers.
7. Sin tests de screens completos con `expo-router` — diferido a S41.

**Smoke verification:**
- Mobile tests 16/16 en 1.7s.
- Mobile typecheck + lint OK.
- Web tests 24/24 (sin cambios).
- API tests 358/358 (sin cambios).
- @psico/crypto 34/34.

**Deuda técnica abierta:**
- Sin tests para screens completos con `expo-router` (requieren harness con Stack/Tabs mocked).
- Sin tests para `_layout.tsx` (useAuth + useDiaryKey context providers).
- Sin coverage thresholds (sembramos infra; floor 60% en sprint propio).
- Sin integración a CI workflow (cubre el sprint que sigue).
- Sin tests del crypto context ni del auth context.
- Reanimated mock no añadido (no needed v1; agregar cuando atravesemos animaciones).

---

### Sesión 41 — 2026-06-04 ✅ COMPLETADA — Sprint S41 CI tests por workspace + coverage opt-in

**Rama sugerida:** `feature/sprint-41-ci-wire-tests`
**Tests:** 16/16 mobile + 24/24 web + 358/359 API + 34/34 crypto (sin cambios — sprint CI).
**Bitácora:** [docs/informes/sprint-41-ci-wire-tests.md](docs/informes/sprint-41-ci-wire-tests.md)

**Lo que se construyó (cierra deuda técnica S39+S40):**

Hace visible en el GitHub Actions UI que cada workspace tiene su propia suite y status independientes. Añade coverage opt-in en web y mobile como infraestructura para floors futuros.

**CI workflow:**
- `.github/workflows/ci.yml` Test job reescrito — reemplaza el step monolítico `Test (affected)` con **4 steps named**:
  - `Test · API (Vitest + Nest unit)`
  - `Test · Crypto (Argon2id + AEAD roundtrip)`
  - `Test · Web (Vitest + RTL + jsdom)`
  - `Test · Mobile (Jest + jest-expo + RNTL)`
- Cada uno `pnpm turbo run test --filter=@psico/<name>` para preservar cache `.turbo`.
- `--affected` removido del flow CI: la safety net (TODOS los workspaces SIEMPRE) vale más que ahorrar ~40s.

**Coverage opt-in:**
- Web: `apps/web/vitest.config.ts` con `test.coverage` provider `v8` + reporter `text`/`json-summary`. Script `test:cov`. Dev dep `@vitest/coverage-v8@^2`.
- Mobile: `apps/mobile/jest.config.js` con `collectCoverageFrom: src/**/*.{ts,tsx}` + reporter `text`/`json-summary`. Script `test:cov`.
- Ambos warn-only (sin thresholds). Smoke local OK: MoodHeatmap 100% · UsageCards 100% · WeeklySummaryCard 97.8% (web); UsageCards 100% · InvoicesList 100% · TourOverlay 100% (mobile).

**Decisiones:**
1. Split named en lugar de un step monolítico — un fallo no esconde el status de los demás.
2. `turbo run test --filter` por workspace (no `pnpm --filter`) — preserva cache.
3. Sin `--affected` en CI — la safety net vale los segundos.
4. Coverage capability, no gate v1 — cuando crezcamos sobre 60% lines en archivos cubiertos, activar floor real.
5. Provider v8 en web (vitest), istanbul default en mobile (jest).
6. No coverage en API ni crypto (tests sólidos ya, ROI bajo).

**Smoke verification:**
- API tests 358/358 + 1 skipped sentinel · @psico/crypto 34/34 · Web 24/24 · Mobile 16/16.
- Web `test:cov` emite tabla con percentages por archivo.
- Mobile `test:cov` emite tabla equivalente.
- YAML válido (`python3 -c "import yaml; yaml.safe_load(...)"`).

**Deuda técnica abierta:**
- Coverage floors quedan en warn-only — activar `thresholds.lines: 60` cuando cobertura sea >60% en archivos cubiertos.
- Coverage en API + crypto sin wireado — agregar si queremos dashboard global.
- Coverage dashboard (Codecov / Artifact upload) no integrado — pendiente justificación.
- Tests de Client Components grandes (ChatArea, LectorShell, EcoShell) siguen sin cubrir.
- Tests de screens completos con `expo-router` siguen diferidos.

---

### Sesión 42 — 2026-06-04 ✅ COMPLETADA — Sprint S42 Pulso v2 · Admin reports Eco

**Rama sugerida:** `feature/sprint-42-pulso-reports`
**Tests:** 363/364 API + 34/34 crypto (358 → 363, +5 nuevos · 1 skipped sentinel).
**Bitácora:** [docs/informes/sprint-42-pulso-reports.md](docs/informes/sprint-42-pulso-reports.md)

**Lo que se construyó:**

Primera surface de **Pulso v2** — back-office para revisar reportes de mensajes de Eco. Design completo lista 6 vistas + 15 endpoints; este sprint shipea SOLO Reports inbox porque (a) la data ya se acumula sin surface, (b) tiene la privacy story más simple.

**Backend:**
- Nuevo `PulsoModule` con 2 endpoints ADMIN-only:
  - `GET /api/pulso/reports/eco/summary` — counts por reason (zero-fill).
  - `GET /api/pulso/reports/eco?reason=...&limit=...&cursor=...` — paginado, includes assistant snippet + threadId.
- `RolesGuard + @RequiredRole("ADMIN")` a nivel clase. PSYCHOLOGIST NO basta.
- Cursor pagination (peek-ahead con `take: limit + 1`).
- 5 unit tests: summary zero-fill, summary aggregation, list shape sin ciphertext, pagination, reason filter.

**Tipos + cliente:**
- `@psico/types` +4 shapes (`PulsoReportReason`, `PulsoReportRow`, `PulsoReportListResponse`, `PulsoReportSummary`).
- `@psico/api-client` `pulsoApi` con `getEcoSummary` + `listEcoReports`.
- `generated.ts` 92.5 KB → 94.2 KB.

**Web (`apps/web/src/app/dashboard/admin/reports/page.tsx`):**
- Server Component con gate `if user.role !== ADMIN → redirect("/dashboard")`.
- Pre-fetch summary + first page con `Promise.all`.
- `ReasonChips` con counts + active state via querystring.
- `ReportsList` con badges colored por reason + comment + assistant snippet trimmed + IDs truncados (8 chars).
- Sidebar nav: `ADMIN_NAV_ITEMS` separado, renderizado solo cuando `user?.role === "ADMIN"` con eyebrow "Pulso · Admin".

**Privacy hard:**
- El response **no contiene** ningún ciphertext (USER messages siguen cifrados).
- Solo expone assistant text (plaintext LLM output) trimmed a 240 chars.
- Test explícito verifica `JSON.stringify(row)` NO contiene "textCiphertext"/"textNonce".
- Admin ve userId + threadId truncados, sin email/PII.

**Decisiones:**
1. ADMIN-only (no PSYCHOLOGIST) — Pulso es operacional, no clínico.
2. Cursor pagination (más robusto que offset cuando rows crecen rápido).
3. Default limit 50, cap 100 — admin tooling.
4. Frontend gate redundante del backend gate (defensive).
5. Mobile out-of-scope — Pulso es desktop-only en v1.

**Smoke verification:**
- API tests 363/363 + 1 skipped sentinel.
- @psico/crypto 34/34.
- Typecheck + lint OK en API + Web.
- OpenAPI `generate:check` in sync.
- Boot del API muestra `/api/pulso/reports/eco/summary` y `/api/pulso/reports/eco` mapped.

**Deuda técnica abierta:**
- Resto de Pulso v2 (5 vistas adicionales) — diferido, requieren agregación nocturna.
- Sin filtros por rango de fecha en list.
- Sin "marcar como revisado" — añadir `status` field cuando volumen lo justifique.
- Sin export CSV.
- Sin link "Ver thread completo" en UI.
- Mobile companion diferido hasta que un admin lo pida.

---

### Sesión 43 — 2026-06-05 ✅ COMPLETADA — Sprint S43 Push infrastructure (device tokens + Expo)

**Rama sugerida:** `feature/sprint-43-notifications`
**Tests:** 370/371 API + 34/34 crypto (363 → 370, +7 nuevos · 1 skipped sentinel).
**Bitácora:** [docs/informes/sprint-43-notifications.md](docs/informes/sprint-43-notifications.md)

**Scope re-evaluado:** sprint planificado con (a) push infra + (b) WeeklyDigest + (c) InactiveNudge. Scope final: solo (a) — los processors requieren cron orchestration en worker.ts + BullMQ delayed jobs + email templates, eso se merece sprint propio (S44). S43 cierra **todo el plumbing**; los processors aterrizan en S44 con la infra ya cocinada.

**Schema:**
- Enum `DevicePlatform { EXPO, WEB }`.
- Model `DeviceToken { id, userId, platform, token @unique, deviceLabel?, createdAt, lastSeenAt }`.
- `User.deviceTokens DeviceToken[]` + `User.lastNudgedAt DateTime?` (para S44).
- Migración aditiva `20260605200000_s43_device_tokens`.

**Backend:**
- `push.service.ts` — plain fetch sobre Expo Push API (sin `expo-server-sdk`). Retorna `PushReceipt[]` con `invalidToken` flag para self-cleaning de DeviceNotRegistered.
- `devices.controller.ts` — `POST /api/notifications/devices` (upsert idempotente) + `DELETE /api/notifications/devices/:id`.
- NotificationsModule extendido. 7 unit tests.

**Mobile:**
- Deps: `expo-notifications` + `expo-device`.
- `push-registration.ts` con permission flow + token + POST.
- `pushIdStore` en SecureStore.
- `AuthContext`: `useEffect([user])` registra; logout revoca.

**Tipos + cliente:**
- 3 shapes nuevos, `notificationsApi` cliente.
- `generated.ts` 94.2 → 96.1 KB.

**Decisiones:**
1. Plain fetch sobre expo-server-sdk — ~400KB ahorrados.
2. `invalidToken` en receipt para self-cleaning.
3. Upsert por `@unique(token)` — idempotent + account-switch safe.
4. Mobile registra en `useEffect([user])`.
5. `pushIdStore` en SecureStore para revoke en logout.
6. No web push v1, no Live Activities (iOS-only).
7. `lastNudgedAt` declarado pre-S44 (evita 2 migrations).

**Smoke verification:**
- API tests 370/371. API + Web + Mobile typecheck + lint OK. OpenAPI in sync.

**Deuda técnica abierta:**
- **S44** — WeeklyDigestProcessor + InactiveNudgeProcessor.
- Sin UI de opt-in/out.
- Sin Expo receipts poller.
- Web push (VAPID) post-v1.

---

### Sesión 44 — 2026-06-05 ✅ COMPLETADA — Sprint S44 Notification processors

**Rama sugerida:** `feature/sprint-44-notification-processors`
**Tests:** 383/384 API + 34/34 crypto (370 → 383, +13 nuevos · 1 skipped sentinel).
**Bitácora:** [docs/informes/sprint-44-notification-processors.md](docs/informes/sprint-44-notification-processors.md)

**Lo que se construyó:**

Cierra la deuda de S43 — entrega los dos processors prometidos sobre la infra de push ya cocinada.

- **WeeklyDigestProcessor** — lunes 07:00 UTC. Email digest via Resend a usuarios con `weeklyReport=true` + push via PushService a quienes también tengan `dailyReminder=true` con device tokens. 7 unit tests.
- **InactiveNudgeProcessor** — nightly 18:00 UTC. Busca users con ≥1 entry alguna vez + sin actividad 3+ días + `dailyReminder=true` + `lastNudgedAt` null o > 4 días. Push solamente (no email diario). 6 unit tests.
- **Email template** `weekly-digest.template.ts` con stats en lista + CTA Patrones + "no activity" branch.
- **2 queues nuevas** (`WEEKLY_DIGEST`, `INACTIVE_NUDGE`) registradas en producer + worker.
- **2 crons** en `JobsService.onModuleInit` con retry policy.

**Decisiones:**
1. UTC en todos los crons — timezone-aware diferido hasta tener base que lo justifique.
2. Digest = email + push; Nudge = push solo.
3. `weeklyReport` controla email; `dailyReminder` gates push (flags independientes).
4. **Privacy hard:** digest NUNCA incluye texto del diario, solo categorical counts + tags (plaintext).
5. `lastNudgedAt` solo bump si receipt OK; if all stale, deja al user disponible para re-nudge.
6. Stale-token pruning inline en ambos processors (self-healing, sin job adicional).
7. Fanout en proceso (no per-user jobs) — mismo patrón que `DailyUsageProcessor`.
8. `dryRun` flag en InactiveNudge para ops sandboxing.
9. `patronesUrl` hardcoded a Vercel URL (refactor cuando lleguen custom domains).

**Smoke verification:**
- API tests 383/384.
- API typecheck + lint OK (4 warnings preexistentes).
- OpenAPI in sync (sin cambios al wire).

**Deuda técnica abierta:**
- Timezone-aware schedules (multi-fanout per-tz).
- Sin UI de opt-in/out en Settings.
- Sin Resend opens tracking ni Expo receipt poller.
- `SILENCE_DAYS`/`MIN_DAYS_BETWEEN_NUDGES` hardcoded.
- WeeklySummary (S38) no se wirea en el digest semanal.

---

### Sesión 45 — 2026-06-05 ✅ COMPLETADA — Sprint S45 Notifications UI + WeeklySummary wire

**Rama sugerida:** `feature/sprint-45-notifications-ui`
**Tests:** 384/385 API + 34/34 crypto (383 → 384, +1 nuevo · 1 skipped sentinel).
**Bitácora:** [docs/informes/sprint-45-notifications-ui.md](docs/informes/sprint-45-notifications-ui.md)

**Lo que se construyó:**

Cierra la **UX gap** que S43+S44 abrieron — el user ya tiene controles para opt-in/out de cada tipo de notification + wire del WeeklySummary (S38) dentro del digest email (cierra deuda S44).

**Cliente:**
- Nuevo `@psico/api-client/users.ts` con `usersApi.getMe()` + `usersApi.updateNotifications()`.

**Backend (sin tocar endpoints):**
- `weekly-digest.template.ts` extendido con `narrative?: { headline, body }` block lavender ABOVE stats.
- `WeeklyDigestProcessor` ahora `findUnique` sobre `weeklySummary(userId, weekStart)` y pasa al template si existe.
- +1 test verifica wire + privacy.

**Web (`/dashboard/notifications`):**
- Server Component pre-fetcha `/user/me`.
- `NotificationsForm` Client Component con 5 toggles + reminderTime input.
- Server action `updateNotificationsAction` con `revalidatePath`.
- Optimistic save + flash + inline error.
- Sidebar item "🔔 Notificaciones".

**Mobile (`/(tabs)/notifications`):**
- Switch nativos + TextInput para reminderTime + optimistic save.
- Shortcut card "Notificaciones" en profile screen antes de Seguridad.
- Registered con `href: null` (deep-link only desde Perfil).

**Decisiones:**
1. Optimistic UI sin botón Save — toggle = save inmediato.
2. Flash "Guardado" 2.5-3s.
3. Errores inline globales (no per-row).
4. Narrative ABOVE stats en email — editorial cálido primero, cifras después.
5. Wire WeeklySummary en lookup-only, NO genera (PatronesService es el productor).
6. No tocar backend — endpoint `PATCH /api/user/notifications` existía desde S9.

**Smoke verification:**
- API tests 384/385.
- Typecheck + lint OK en API + Web + Mobile.
- OpenAPI in sync.

**Deuda técnica abierta:**
- Sin tests UI para los componentes settings.
- `reminderTime` no aplica timezone (conecta cuando S44 deuda TZ aterrice).
- Sin "Enviar email de prueba".
- Sin `pushEnabled` separado de `dailyReminder`.
- WeeklySummary no se auto-genera el viernes para el digest del lunes.

---

### Sesión 46 — 2026-06-05 ✅ COMPLETADA — Sprint S46 Auto-generate WeeklySummary

**Rama sugerida:** `feature/sprint-46-auto-weekly-summary`
**Tests:** 392/393 API + 34/34 crypto (384 → 392, +8 nuevos · 1 skipped sentinel)
**Bitácora:** [docs/informes/sprint-46-auto-weekly-summary.md](docs/informes/sprint-46-auto-weekly-summary.md)

**Lo que se construyó (cierre del loop S38 → S44 → S45):**

Hasta S45, el flujo era: S38 genera narrative LLM al click, S44 manda digest lunes 07:00 UTC, S45 lee `WeeklySummary` SI existe. La fila casi nunca existía → digest casi nunca incluía editorial. S46 lo cierra con un cron que pre-genera la fila los domingos 23:00 UTC para que cuando el digest del lunes la busque, la encuentre.

**Backend:**
- `QueueName.WEEKLY_SUMMARY_GENERATION` + payload + `RUN_WEEKLY_SUMMARY_GENERATION` job name en `queue-names.ts`.
- `JobsService.onModuleInit` registra cron `0 23 * * 0 UTC` (Sunday 23:00 UTC). Retry 3/exp 5min/25min/2h.
- `JobsModule.registerQueue` + `WorkerAppModule.registerQueue` extendidos.
- `WorkerAppModule` ahora importa `PatronesModule` (cascade: `AIModule` + `PrismaModule`) para que el worker pueda invocar el LLM.
- `WeeklySummaryGenerationProcessor` — fan-out + retry shell. Query Pro+ users con `weeklyReport=true`, llama `PatronesService.regenerateWeeklySummary(userId, plan)` per user. Swallow per-user errors:
  - `NOT_ENOUGH_ENTRIES` → contador `skippedNotEnough`, continue.
  - `ForbiddenException` (race con plan change) → log + continue.
  - Cualquier otro → contador `failed`, log + continue.
- `dryRun=true` short-circuita los LLM calls (útil ops cuando Anthropic spend está near-cap).

**Decisiones:**
1. Domingo 23:00 UTC (no viernes) — cubre semana completa Mon→Sun ISO + 8h buffer antes del digest lunes 07:00.
2. Reusar `PatronesService.regenerateWeeklySummary` en lugar de duplicar — processor solo es fan-out + error isolation.
3. Candidate set: Pro+ con `weeklyReport=true` — FREE devuelve 403, weeklyReport=false el digest skipea de todas formas.
4. Failure isolation per-user — un LLM 5xx no aborta la run.
5. Idempotente — upsert sobre `(userId, weekStart)` significa retries seguros.
6. Worker importa PatronesModule — Anthropic SDK boota en worker; si key falta, fallback rule-based per user.

**Tests (+8):**
- `weekly-summary.processor.spec.ts` — 7 tests: unknown job, where-clause shape + per-user calls, NOT_ENOUGH_ENTRIES swallowed, ForbiddenException swallowed, arbitrary error swallowed, dryRun, empty candidates.
- `jobs.service.spec.ts` — +1 test asserts cron `weekly-summary-sunday-23-utc` + pattern `0 23 * * 0` + job name + retry policy. Constructor del spec actualizado a 7 args.

**Sin cambios:**
- Schema, migración, tipos compartidos, OpenAPI surface (cron interno).
- UI (botón manual "Regenerar" sigue ahí para casos antes del cron).

**Privacy invariant preservado:**
- ADR 0007 intacto. `computeWeeklyStats` opera solo sobre `mood` + `tags` + `createdAt`.
- LLM recibe `{ entryCount, dominantMood, moodCounts, topTags, weekStartIso }` — nunca body, nunca cipher.
- Processor S46 delega 100% al `PatronesService` que ya tiene el invariant cubierto.

**Deuda técnica abierta:**
- Timezone-aware scheduling (S44 deuda sigue abierta).
- Sin telemetría LLM cost en `BillingUsageDay`.
- Sin alerting si el worker está caído un domingo.
- `WeeklyDigestProcessor.lastDigestSentAt` sigue sin tracking (idempotencia del digest).
- Sin diff between weeks anterior/actual en el prompt LLM.

---

### Sesión 47 — 2026-06-05 ✅ COMPLETADA — Sprint S47 Web Push (VAPID)

**Rama sugerida:** `feature/sprint-47-web-push`
**Tests:** 400 API + 24 web + 34 crypto (392 → 400, +8 nuevos · 1 skipped sentinel)
**Bitácora:** [docs/informes/sprint-47-web-push.md](docs/informes/sprint-47-web-push.md)

**Lo que se construyó:**

Cierra la simetría mobile/web del push. Mobile tenía push real desde S43; web se quedaba sin notifications fuera del email. Después de este sprint, ambos transports están en producción detrás de la misma interfaz.

**Backend:**
- `web-push@^3.6.7` + `@types/web-push` deps.
- Script `pnpm --filter @psico/api gen:vapid` — one-shot para generar el VAPID keypair y los 3 envs a stdout.
- `envSchema` extendido con `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` (todos opcionales — half-set state rejected por `superRefine`).
- `RegisterDeviceDto.token` length: 256 → 2048 (para serialized PushSubscription).
- `PushService` rewrite a dual-platform:
  - Inyecta `ConfigService` para leer VAPID.
  - Particiona tokens por shape: ExponentPushToken / web: / unknown.
  - `sendExpo` (lógica S43 intacta) + nuevo `sendWeb` (web-push lib, Promise.allSettled).
  - 404/410 del Web Push service → `invalidToken` para pruning automático.
  - `ensureVapid()` memoiza el setup de claves.
  - `parseWebToken()` exportado para tests.

**Web:**
- `apps/web/public/sw.js` — service worker mínimo (push + notificationclick). Sin caching de assets — feature dedicado.
- `apps/web/src/lib/web-push.ts` — `detectWebPushSupport`, `urlBase64ToUint8Array`, `subscribeWebPush(apiBase, accessToken)`, `unsubscribeWebPush(...)`.
- `apps/web/src/components/dashboard/notifications/WebPushToggle.tsx` — Client Component con state machine de 7 phases (loading/unsupported/blocked/off/on/submitting/error). Auth via `apiBase + accessToken` props (patrón EcoShell).
- `/dashboard/notifications` ahora renderiza `<WebPushToggle>` ARRIBA del form.

**Decisiones clave:**
1. `web-push` lib oficial sobre custom JWT/AES-GCM — implementar a mano son ~500 líneas cripto delicado.
2. Token shape `web:<JSON>` para reusar la columna `DeviceToken.token` existente.
3. VAPID env trio: tolerate "todos vacíos" (web push disabled), reject half-set.
4. SW dedicado a push (no Workbox / no offline caching) — versionado por comentario.
5. Lazy + memoized VAPID init en el service.
6. `Promise.allSettled` para fan-out a cada push service (cada sub hits endpoint distinto).
7. Auth via props (no `apiClient` singleton) — mismo patrón que EcoShell, paridad con cookies del web.
8. `BufferSource` cast manual para satisfacer TS lib.dom — documentado en línea.

**Tests (+8 API):**
- `push.service.spec.ts` extendido: constructor a 1 arg (ConfigService mock), `vi.mock("web-push")` con hoisted spies.
- 5 tests nuevos: web sin VAPID, web envía + receipt ok, web 410 → invalidToken, web malformado → invalidToken, orden preservado en mixed batch.
- 4 tests para `parseWebToken`.

**Privacy / security:**
- VAPID private key vive solo en Railway env (API + worker). Nunca en git, nunca en Vercel.
- Web Push payloads se cifran in-transit (ECDH + AES-GCM) — push services intermedios no ven title/body. Solo el browser con la subscription key descifra.
- DiaryEntry ciphertext sigue sin entrar en notifications (ADR 0007 intacto).

**Deuda técnica abierta:**
- Generar VAPID en prod (`pnpm gen:vapid`) y configurar Railway (API + worker) + Vercel (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`). Sin esto el toggle muestra "Falta configurar VAPID".
- Sin tests del SW — requiere Playwright E2E con push test endpoint.
- No re-prompt programático tras `denied` (limitación del spec del browser).
- Sin retry on web push per-sub failure (BullMQ retry global solo).
- iOS Safari < 16.4 sin Web Push; 16.4+ requiere PWA instalada.
- Tour S37 sigue sin re-trigger; idem deuda timezone-aware schedules.

---

### Sesión 48 — 2026-06-05 ✅ COMPLETADA — Sprint S48 Pulso v2 · Overview

**Rama sugerida:** `feature/sprint-48-pulso-overview`
**Tests:** 404/405 API + 24 web + 34 crypto (400 → 404, +4 nuevos · 1 skipped sentinel)
**Bitácora:** [docs/informes/sprint-48-pulso-overview.md](docs/informes/sprint-48-pulso-overview.md)

**Lo que se construyó:**

Segunda surface de Pulso v2 después del reports inbox (S42). Admin tiene ahora un dashboard de "cómo va la plataforma" en una sola pantalla con KPIs agrupados en 4 secciones: Users · Engagement · Content · Business.

**Backend:**
- `@psico/types`: 6 nuevos shapes (`PulsoOverviewResponse` + 4 blocks + `PulsoOverviewPeriod`).
- `PulsoService.getOverview()` agregado al servicio existente. Cache Redis 5min (key global `pulso:overview`).
- 4 bloques en el response:
  - **Users**: total + newToday + newThisWeek + newThisMonth.
  - **Engagement**: DAU/WAU/MAU (distinct users con cualquier actividad en la ventana).
  - **Content**: diaryEntries · ecoMessages USER · ecoCrisis · voiceMinutes · readingSessions (todos last 7d).
  - **Business**: paidUsers (PRO/ANNUAL/B2B) + reportsBacklog (total reports en v1).
- `countActiveUsers(since)` private — une distinct userIds de 4 tablas via `Set<userId>` en aplicación.
- `RedisModule` importado en `PulsoModule`.
- `GET /api/pulso/overview` ADMIN-only.

**Cliente:** `pulsoApi.getOverview()`. OpenAPI regenerado.

**Web:**
- `KpiCard.tsx` componente compacto (label/value/helper/accent — danger/warning/success).
- `/dashboard/admin/overview/page.tsx` Server Component con grid de KPIs. ADMIN gate doble (backend + frontend redirect). `accent="danger"` para crisis count cuando > 0.
- Sidebar nav: "📊 Pulso · Overview" ARRIBA de "📋 Pulso · Reports".

**Decisiones clave:**
1. Rolling windows (24h/7d/30d) — no calendar boundaries.
2. Sin sparklines v1 — `recharts` no justificable para 2-3 curvas.
3. Cache Redis 5min single global key.
4. Active = diary OR eco USER OR voice OR reading. Dedupe via Set en aplicación.
5. `paidUsers` por `User.plan` (no chequea `Subscription.status`).
6. `reportsBacklog = total` v1.
7. Privacy invariant FUERTE — test explícito.

**Tests (+4):** zero state · aggregation · cache hit · privacy invariant.

**Privacy preservada:**
- Response NUNCA contiene `userId`/`email`/IP/snippet.
- ADMIN-only doble gate: backend `RolesGuard + @RequiredRole("ADMIN")` + frontend redirect.

**Deuda técnica abierta:**
- Sin time series / sparklines — sprint propio cuando exista tabla `PlatformMetricDaily`.
- DAU/WAU/MAU via Set en aplicación — escalable hasta ~100k MAU.
- Sin "vs período anterior" delta.
- `paidUsers` no chequea `Subscription.status` — confiamos en `User.plan` por webhook.
- `reportsBacklog = total` v1.
- Cache 5min no invalida en writes.

---

### Sesión 49 — 2026-06-06 ✅ COMPLETADA — Sprint S49 Pulso v2 · Reports resolution flow

**Rama sugerida:** `feature/sprint-49-reports-resolved`
**Tests:** 411/412 API + 24 web + 34 crypto (404 → 411, +7 nuevos · 1 skipped sentinel)
**Bitácora:** [docs/informes/sprint-49-reports-resolved.md](docs/informes/sprint-49-reports-resolved.md)

**Lo que se construyó (cierre del loop S42 → S48 → S49):**

Cierra el loop de admin operations sobre Pulso v2. Después de S42 (inbox) y S48 (overview), el admin podía VER reports pero no MARCAR nada. S49 entrega resolución idempotente + tabs de filtro + UI inline + cache invalidation.

**Schema (`EcoMessageReport`):**
- 3 columnas nuevas: `resolvedAt DateTime?`, `resolvedBy String?`, `resolutionNote String?`.
- Índice compuesto `@@index([resolvedAt, createdAt])` para que el count del backlog (S48) se mantenga barato.
- Migración aditiva `20260606000000_s49_report_resolution`. Rows existentes son implícitamente "open".

**Backend:**
- `markResolved(reportId, adminUserId, note?)` — idempotente (re-resolving sobreescribe). Throws `NotFoundException("REPORT_NOT_FOUND")` si no existe. Busta cache `pulso:overview`.
- `markUnresolved(reportId)` — symmetric inverse, limpia los 3 campos.
- `listEcoReports({ ..., status })` con default `open`. `statusWhereClause` helper module-level.
- `getEcoReportSummary(status?)` propaga el filtro.
- `getOverview.business.reportsBacklog` ahora narrow a `where: { resolvedAt: null }` — **cierra deuda S48**.
- Bug-fix de paso: `readingSession` usaba `updatedAt` (no existe) — corregido a `lastSeenAt`.

**2 endpoints nuevos** bajo `/api/pulso/reports/eco/:id/`:
- `POST /resolve` (idempotente)
- `POST /unresolve`

ADMIN-only doble gate (heredado del controller).

**Tipos compartidos:**
- `PulsoReportRow` extendido con resolución.
- `PulsoReportStatus = "open" | "resolved" | "all"`.
- `PulsoMarkResolvedRequest { note?: string }`.

**Cliente:** `pulsoApi.markResolved(id, body)` y `markUnresolved(id)`. `listEcoReports` con propagación de status.

**Web:**
- Server actions `markReportResolvedAction` y `markReportUnresolvedAction` con `revalidatePath` de reports + overview.
- `StatusTabs.tsx` zero-JS tab strip (`<Link>` × 3).
- `ResolveRowActions.tsx` Client Component con state machine: composer de nota opcional + botón "Marcar resuelto" / "Reabrir" + optimistic `useTransition` + inline error.
- `ReportsList.tsx` extendido con `<ResolveRowActions row={row} />` por row.
- `/dashboard/admin/reports/page.tsx` parsea `?status=…`, fetcha con filtro, renderiza `<StatusTabs>`.

**Decisiones clave:**
1. Resolución idempotente, no transición de estado — re-marking sobreescribe.
2. Default `status=open` en list + summary. Admin landea en inbox accionable.
3. `statusWhereClause` helper module-level → spread-able sin nullish checks.
4. Cache invalidation post mutation (sin esto, KPI del backlog stale 5min).
5. `revalidatePath` toca reports + overview (cierra el loop visual).
6. UI server-driven con tabs + querystring (zero JS); composer de nota inline Client Component.
7. Note inline, no modal — triage de muchos rows seguidos es más rápido.

**Tests (+7):** backlog narrow · markResolved happy · markResolved 404 · markUnresolved · status filter open/resolved/all.

**Privacy preservada:**
- Doble gate ADMIN backend + frontend.
- `resolutionNote` es texto admin-side; no toca cripto del Diario.
- Privacy invariant del Overview NO afectado.

**Deuda técnica abierta:**
- Sin tests UI dedicados para ResolveRowActions / StatusTabs.
- `resolvedBy` no se renderiza en UI (falta join al User).
- Sin auditoría de cambios (admin A → B → A perdemos el historial).
- Sin bulk resolve.
- Mobile no tiene este flow.
- Sin email "report nuevo" para admins.

---

### Sesión 50 — 2026-06-08 ✅ COMPLETADA — Sprint S50 Pulso v2 · Time series + sparklines

**Rama sugerida:** `feature/sprint-50-pulso-timeseries`
**Tests:** 422/423 API + 24 web + 34 crypto (411 → 422, +11 nuevos · 1 skipped sentinel)
**Bitácora:** [docs/informes/sprint-50-pulso-timeseries.md](docs/informes/sprint-50-pulso-timeseries.md)

**Lo que se construyó (cierre visual del Overview):**

Cierra la deuda más visible de S48 ("sin time series / sparklines" + "sin vs período anterior delta"). Entrega tabla materializada de snapshots diarios + cron nightly + extensión del Overview.

**Schema (`PlatformMetricDaily`):**
- Row per UTC day. PK `day`. 11 columns: users (total/new/paid), engagement (dau), content (diary/eco/ecoCrisis/voice/reading), pulso ops (reportsOpened/reportsResolved).
- Migración aditiva — tabla empieza vacía; el cron la llena desde mañana.

**Backend:**
- `QueueName.PLATFORM_SNAPSHOT` + `RUN_PLATFORM_SNAPSHOT` + payload.
- `JobsService.onModuleInit` registra cron `30 2 * * *` UTC.
- `PlatformSnapshotProcessor` — resuelve "yesterday in UTC" (override via `targetDay`), computa 4 bloques en paralelo, upserts en `day` PK. `dryRun: true` no escribe.
- `PulsoService.buildSeriesAndDeltas(now)` — 30-day window zero-filled + `percentDelta` last-7 vs prev-7 (clamp 999, null branches).
- `getOverview` response extiende con `series` + `deltas`. Cache 5min hereda.

**Tipos compartidos:**
- `PulsoOverviewSeries` (7 metrics × number[]).
- `PulsoOverviewDeltas` (5 metrics × number | null).
- `PulsoOverviewResponse` extendido (backward-compat).

**Web:**
- `Sparkline.tsx` — inline SVG polyline + opcional fill, sin libs externas.
- `DeltaBadge.tsx` — chip ↑/↓% con color sage/rose. `inverted` flag para métricas tipo "más = peor".
- `KpiCard.tsx` extendido con props opcionales `series?`, `delta?`, `deltaInverted?`. Backward-compat.
- `/dashboard/admin/overview` — 6 sparklines + 5 deltas wired.

**Decisiones clave:**
1. Tabla separada de `BillingUsageDay` (platform-wide vs per-user, DAU no es suma).
2. Snapshot de "ayer" no "hoy" — closed window, idempotente.
3. Cron 02:30 UTC — justo después del billing rollup.
4. 30-day window default.
5. Last-7 vs prev-7 para delta — menos ruidoso.
6. Clamp delta a 999 cuando prev=0.
7. Sparkline inline SVG — 0 KB runtime.
8. `KpiCard` backward-compat.
9. `deltaInverted` flag para reports/crisis.
10. **Privacy invariant FUERTE**: counts only, ningún userId en la tabla.

**Tests (+11):** processor (6) + series/deltas (4) + cron registration (1).

**Privacy preservada:**
- `PlatformMetricDaily` columns son integer+float counts only.
- DAU dedupe vía `Set<userId>` en RAM, IDs nunca llegan a la columna.
- ADMIN-only doble gate intacto.

**Deuda técnica abierta:**
- Backfill histórico (script ops). Cron natural cierra el gap en 1 semana.
- Sin window selector. 30 es default duro.
- `paidUsers` sin delta (acumulativo).
- Tests UI para Sparkline/DeltaBadge.
- Sin alerting cuando el cron NO corre.

---

### Sesión 51 — 2026-06-08 ✅ COMPLETADA — Sprint S51 Pulso v2 · Cohort retention triangle

**Rama sugerida:** `feature/sprint-51-cohort-retention`
**Tests:** 433/434 API + 24 web + 34 crypto (422 → 433, +11 nuevos · 1 skipped sentinel)
**Bitácora:** [docs/informes/sprint-51-cohort-retention.md](docs/informes/sprint-51-cohort-retention.md)

**Lo que se construyó (cierre analítico de Pulso v2):**

Cierra el loop analítico de Pulso v2 con la métrica clásica SaaS: retention curves por cohort de signup. Después de Overview, Reports y time series, el admin tiene respondida la pregunta "¿se queda la gente que entra?" en un heatmap clásico SaaS.

**Schema (`CohortRetentionWeek`):**
- PK compuesta `(cohortWeek, weekOffset)`. Columns: cohortSize, activeUsers, generatedAt, updatedAt.
- Índice descendente sobre `cohortWeek`.
- Migración aditiva — tabla empieza vacía; el cron la llena el primer lunes post-deploy.

**Backend:**
- `QueueName.COHORT_RETENTION` + payload + `RUN_COHORT_RETENTION` job name.
- `JobsService.onModuleInit` registra cron `0 3 * * 1 UTC` (Lunes 03:00 — justo después del platform snapshot 02:30).
- `CohortRetentionProcessor`:
  - Resuelve `horizonWeeks` (default 52) + lista de Mondays.
  - Para cada cohort: fetch users + `Set<userId>` en RAM.
  - Para cada `weekOffset` 0..N: `countActiveCohortMembers` via Set intersection.
  - Upsert idempotente sobre `(cohortWeek, weekOffset)`.
  - `dryRun` flag.
- `PulsoService.getCohortRetention()` — fetch ordenado + reshape rows + precompute `pct` server-side + cache Redis 5min.
- `GET /api/pulso/cohorts` ADMIN-only.

**Tipos compartidos:** `PulsoCohortCell`, `PulsoCohortRow`, `PulsoCohortRetentionResponse`.

**Cliente:** `pulsoApi.getCohorts()`. OpenAPI regenerado.

**Web:**
- `CohortHeatmap.tsx` — tabla HTML triangular con HSL gradient lavender. Sticky left column. Empty-state copy claro.
- `/dashboard/admin/cohorts/page.tsx` Server Component con ADMIN doble gate.
- Sidebar: `📐 Pulso · Cohorts` como 3a entrada admin.

**Decisiones clave:**
1. Tabla materializada con PK compuesta — triangle O(N²) precomputed.
2. Weekly cron — cohorts son week-anchored.
3. Activity definition reusada de S50 (consistency).
4. Cohort filter client-side (Set intersection) — escala.
5. `pct` precomputado + guard divide-by-zero.
6. Cache Redis 5min.
7. Heatmap como `<table>` — accessible.
8. HSL interpolation para gradient.
9. **Privacy invariant FUERTE**: tabla solo integer counts; userId-sets en RAM se descartan antes del upsert.

**Tests (+11):**
- `cohort-retention.processor.spec.ts` (6): unknown job, no users, single cohort, dryRun, intersection guard, triangle math.
- `pulso.service.spec.ts` (4): empty, group + precompute pct, divide-by-zero, cache hit.
- `jobs.service.spec.ts` (1): cron registration.

**Privacy preservada:**
- `CohortRetentionWeek` columns son integer counts only.
- Processor maneja `Set<userId>` en RAM; IDs nunca llegan a Postgres.
- ADMIN-only doble gate.

**Deuda técnica abierta:**
- Cron primer-run vacío hasta el lunes post-deploy.
- Sin cell hover drill-down.
- Sin filtros (date range, cohort size threshold).
- Sin exportación CSV.
- Sin alerting si week-1 retention cae.
- Sin retention por feature.
- Tests UI dedicados para CohortHeatmap.

---

### Sesión 52 — 2026-06-08 ✅ COMPLETADA — Audit cleanup (ADRs + changesets + tag)

**Rama sugerida:** `chore/changesets-adrs-cleanup`
**Tests:** 433/434 API + 24 web + 34 crypto (sin cambios — sprint de housekeeping)
**Bitácora:** inline en este session log (sin .md dedicado por convención de housekeeping).

**Lo que se construyó (deuda acumulada que la auditoría destapó):**

Una auditoría sistemática del estado del proyecto reveló:
- **18 changesets pendientes sin consumir** desde S34 (último publish 2026-06-03).
- **2 ADRs faltantes** del Plan v2: 0011 (multi-rol) y 0013 (OpenAPI as source of truth).
- **`@psico/crypto` sin CHANGELOG.md.**

S52 cierra todo esto:

**ADRs nuevos:**
- `docs/adr/0011-multi-rol-sin-multi-tenant.md` — documenta el `User.role` enum (USER/AUTHOR/PSYCHOLOGIST/ADMIN) y justifica multi-rol sobre single tenant para evitar overhead de query scoping.
- `docs/adr/0013-openapi-as-source-of-truth.md` — formaliza el pipeline `apps/api → openapi.json → generated.ts` que vive en código desde S12 + el CI `openapi-diff.yml` que enforce.

**CHANGELOGs:**
- `@psico/crypto` ahora tiene CHANGELOG.md con entrada inicial 0.1.0 documentando los primitives + sprints S21/S22/S23.

**Changesets consolidados (5 nuevos):**
- `sprint-s10-patrones.md` — S35 PatronesModule tipos.
- `sprint-s42-pulso-reports.md` — S42 Pulso reports tipos.
- `sprint-s43-notifications.md` — S43 push notifications tipos.
- `sprint-s45-notifications-ui.md` — S45 usersApi + WeeklyDigest wire.
- `sprint-s48-s51-pulso-v2.md` — bundle de S48+S49+S50+S51 Pulso v2 tipos.

**Limpieza de changesets viejos:**
- Removidas referencias a `@psico/web` y `@psico/mobile` (config ignora apps).
- Eliminados 3 changesets que quedaron vacíos tras el strip.

**Version bumps consumidos (`pnpm changeset version`):**
| Paquete | Antes | Después |
|---|---|---|
| `@psico/types` | 0.8.0 | **0.9.0** |
| `@psico/api-client` | 0.0.7 | **0.1.0** |
| `@psico/crypto` | 0.1.0 | **0.2.0** |

**Decisiones de housekeeping:**
1. Single version bump consolidado en lugar de 17 versiones intermedias — releases granulares se pueden hacer a partir de aquí.
2. Changesets retroactivos descritos por sprint (no por commit individual) para mantener el CHANGELOG legible.
3. Sin git tags por ahora — el repo no tiene historial de tags y agregarlos retroactivamente sería confuso. Cuando hagamos el próximo release significativo, etiquetar desde ahí.
4. `@psico/web` y `@psico/mobile` siguen en el ignore — son apps internas, no se publican.

**Smoke verification:**
- API tests 433/434, web tests 24/24, crypto tests 34/34. Sin regresiones.
- Typecheck verde en API + Web + Mobile + types + crypto + api-client.
- Build de los 3 paquetes publishables OK.
- OpenAPI `generate:check` in sync.

**Cobertura post-S52 del proyecto:**
- **12 de 13 áreas v1** del diseño implementadas (92 %).
- **8 ADRs activos + 5 históricos = 13 total.** Solo 0012 (Video provider) queda pendiente para Terapia v2.
- **39 bitácoras** docs/informes + 41 sesiones en CLAUDE.md (S1-S10 inline por convención).
- **507 tests** (API 433 + web 24 + mobile 16 + crypto 34).
- **116 endpoints REST** en producción.

---

### Sesión 53 — 2026-06-08 ✅ COMPLETADA — Sprint S53 Notificaciones conscientes del huso horario

**Rama sugerida:** `feature/sprint-53-timezone-aware`
**Tests:** 451/452 API + 34/34 crypto + 24/24 web + 16/16 mobile (433 → 451, +18 API · 1 skipped sentinel · total 525)
**Bitácora:** [docs/informes/sprint-53-timezone-aware.md](docs/informes/sprint-53-timezone-aware.md)

**Lo que se construyó (cierra deuda S44 + S46):**

Desde Sprint S44 los crons (WeeklyDigest, InactiveNudge) aterrizaban a horas duras UTC. Los users en Ecuador recibían el digest semanal a las **2 am** local. S53 lo cierra.

**Backend:**
- Nuevo helper `apps/api/src/jobs/utils/timezone.ts` puro sobre `Intl.DateTimeFormat` (cero deps): `userLocalHour`, `userLocalWeekday`, `isUserLocalHour`, `isValidTimezone`.
- Endpoint `PATCH /api/user/timezone` con `UpdateTimezoneDto`; valida IANA via constructor probe; 400 `INVALID_TIMEZONE` en garbage; idempotente (`Profile.upsert`).
- `getMe` ahora expone `UserMeResponse.user.timezone` (desde `Profile.timezone`).
- **WeeklyDigestProcessor** refactorizado: cron `0 7 * * 1 UTC` → `0 * * * * UTC` (hourly). Per-user gate: solo envía si `userLocalHour(now, tz) === 7 && userLocalWeekday(now, tz) === 1`.
- **InactiveNudgeProcessor** idem: cron `0 18 * * *` → `0 * * * *`. Per-user gate: `userLocalHour(now, tz) === 18`.
- **Backward compat:** users con `timezone === null` fallback a UTC (preserva S44 para legacy).
- `nowIso` opcional en payload de ambos jobs (test-only escape hatch para fijar el instante UTC sin mockear `Date.now()`).

**Tipos:** `@psico/types`: `UpdateTimezoneRequest`, `UserProfileSummary.timezone: string | null`.

**Cliente:** `usersApi.updateTimezone({ timezone })`. `generated.ts` 96.1 KB → 101.0 KB.

**Web:** Server action `setTimezoneAction(timezone)` con swallow-on-error. Client Component `_TimezoneSync.tsx` invisible (one-shot via `useRef`). Monteado en `dashboard/layout.tsx` cuando `me.user.timezone === null`.

**Mobile:** `AuthContext.probeTimezone()` fire-and-forget. Disparado desde `login`, `register`, y el cold-start refresh path. RN Hermes soporta `Intl.DateTimeFormat` desde SDK 50.

**Decisiones:**
1. Hourly cron + per-user filter (no per-user cron jobs).
2. `Intl.DateTimeFormat` puro — cero deps; Node 20 trae ICU completo.
3. Fallback graceful a UTC para legacy.
4. Auto-detect en cada login (no esperar settings UI explícito).
5. `nowIso` en payload solo para tests deterministas.

**Tests (+18):**
- `timezone.spec.ts` (8): fallback UTC, IANA válidos, day-rollover Tokyo/Guayaquil, garbage handling.
- `weekly-digest.processor.spec.ts` (4): Guayaquil-12UTC=07local, Guayaquil-07UTC skip, Tokyo Sun22UTC=Mon07JST, legacy null→UTC.
- `inactive-nudge.processor.spec.ts` (3): Guayaquil-23UTC=18local, 18UTC=13local skip, legacy null→UTC.
- `users.controller.spec.ts` (handler count 13 → 14).
- Helpers `jobOf` updated en ambos specs legacy con `nowIso` injection por default.

**Bugs corregidos (4):**
1. Test handler list desactualizada.
2-3. Tests legacy fallaban porque `now = new Date()` no caía en Mon 07:00 / 18:00 UTC.
4. `@ts-expect-error` sin descripción → eslint error.

**Smoke verification:**
- API tests 451/452 + crypto 34/34 + web 24/24 + mobile 16/16 (525/526 total).
- Typecheck + lint OK en API + web + mobile.
- OpenAPI generate:check OK.

**Privacy preservada:** `Profile.timezone` es plaintext (equivalente a `country` existente desde S15). ADR 0007 intacto.

**Deuda técnica abierta:**
- Settings UI explícito para fijar TZ manual.
- Tests UI dedicados del `TimezoneSync` web.
- DST transitions: cron hourly puede saltar/duplicar en spring-forward/fall-back. Mitigación: agregar `lastDigestSentAt` cuando duela.
- Optimización SQL futura: filter por TZ-bucket en el `findMany` cuando user count crezca.

---

### Sesión 54 — 2026-06-08 ✅ COMPLETADA — Sprint S54 TimezoneCard Settings UI + tests UI

**Rama sugerida:** `feature/sprint-54-timezone-settings`
**Tests:** 451/452 API + 34/34 crypto + 38/38 web + 20/20 mobile (525 → 543, +18 UI · 1 skipped sentinel)
**Bitácora:** [docs/informes/sprint-54-timezone-settings.md](docs/informes/sprint-54-timezone-settings.md)

**Lo que se construyó (cierra deuda S53 + deuda tests S39/S47/S53):**

- Server action `setTimezoneActionStrict` además del silent `setTimezoneAction` para distinguir probe invisible vs UI explícita.
- Web `TimezoneCard.tsx` — muestra stored vs browser TZ, botón "Usar la de mi dispositivo" en mismatch, `<select>` con todas las IANA del browser (fallback a 22 zonas LATAM/EU/Asia). Optimistic save + flash + inline error.
- Mobile `TimezoneCard.tsx` — paridad con Modal + FlatList sobre `Intl.supportedValuesOf`. `onChanged` callback.
- Wire web: `/dashboard/notifications/page.tsx`. Wire mobile: `(tabs)/notifications.tsx`.

**Tests UI (+18):**
- Web `TimezoneCard.test.tsx` (6) — null state, render, submit success, inline error, mismatch button branches.
- Web `_TimezoneSync.test.tsx` (3) — fires on needsProbe, no-op false, one-shot useRef.
- Web `WebPushToggle.test.tsx` (5) — unsupported, blocked, off, subscribe + flip, error VAPID.
- Mobile `TimezoneCard.test.tsx` (4) — render, modal open, device row.

**Decisiones:**
1. Dos server actions (silent vs strict) — el strict throws para UI.
2. Auto-submit en select change (sin botón Save).
3. Fallback hardcoded de 22 TZs cuando `Intl.supportedValuesOf` no está.
4. Mobile Modal + FlatList — sin picker libraries.
5. Refactor `useTransition` → `useState(pending)` para tests determinísticos.
6. Mobile test del "pick → commit" full flow saltado (jest-expo + Modal + FlatList frágil); cubierto por web test.

**Bugs corregidos durante S54:**
1. `useTransition` async no flusheaba en jsdom → refactor a useState plain.
2. `navigator.serviceWorker` no en jsdom → `Object.defineProperty` stub.
3. `Intl.DateTimeFormat` retorna TZ del host CI → spyOn pattern para pinear.
4. Modal y FlatList no renderizan children en jest-expo → `jest.mock("react-native")` con stubs.

**Smoke verification:**
- API tests 451/452 (sin cambios).
- @psico/crypto 34/34.
- Web tests 38/38 (+14).
- Mobile tests 20/20 (+4).
- Typecheck + lint OK en web + mobile.

**Privacy preservada:** `Profile.timezone` plaintext (ADR 0007 intacto). `TimezoneCard` no toca cripto del Diario.

**Deuda técnica abierta:**
- Mobile test del commit completo (pick → press → onChanged) — diferido hasta RN 0.77+.
- Botón "Reset to auto-detect" en TimezoneCard si UX lo pide.
- WebPushToggle "unsubscribe" path no testeado.
- E2E real test del `TimezoneSync` con layout SC sigue siendo deuda.

---

### Sesión 55 — 2026-06-13 ✅ COMPLETADA — Sprint Lector Audio Metadata

**Rama sugerida:** `feature/sprint-lector-audio-metadata`
**Tests:** 654/655 API + 122/122 web + 20/20 mobile + 34/34 crypto (sin nuevos)
**Bitácora:** [docs/informes/sprint-lector-audio-metadata.md](docs/informes/sprint-lector-audio-metadata.md)

**Lo que se construyó (cierra deuda de `sprint-lector-audio-background`):**

Hasta hoy el lock-screen en iOS y los controles MediaSession en Android mostraban "Sin título" porque `expo-av` 15 no permite setear metadata dinámica desde JavaScript. Este sprint extiende `LectorAudioResponse` con `metadata: { title, subtitle, artist, artworkUrl }` para que (a) el audio bar renderee artwork + título en ambos clientes; (b) cuando ops embeba tags ID3v2/m4a al subir archivos (receta `ffmpeg` documentada en el nuevo `apps/api/src/lector/README.md`), el lock-screen leerá los tags del archivo directamente; (c) cuando llegue el día de migrar a `expo-audio` o `react-native-track-player`, el `LectorAudioMetadata` ya está en el contrato.

**Backend:**
- `LectorService.getAudio()` extiende la query de `book` con `title`, `cover`, `coverArtUrl`, `author: { name }`.
- Return añade `metadata` con resolución de artwork: `book.coverArtUrl ?? book.cover ?? ""` (URL real PNG → token gradient).
- `title` se compone server-side como `Cap. N · Título`.
- 1 test nuevo: "uses coverArtUrl when present and falls back to cover token otherwise".

**Web:** fila nueva en `AudioBar.tsx` arriba de los controles nativos. `<img>` cuando `artworkUrl` empieza por `http`, `<div>` con `linear-gradient` cuando es token.

**Mobile:** mismo header en `LectorAudioBar.tsx`. `<Image>` con `uri` o `<View>` con `coverColor()` del helper de S5-front-mobile.

**Decisiones:**
1. Embed file-tags + API contract en mismo sprint (vs migrar a expo-audio — ~3-5 días).
2. `title = "Cap. N · Título"` server-side (centraliza el formato).
3. `artworkUrl` puede ser URL real o token de gradient (forward-compat con `coverArtUrl` cuando llegue Author B2B).
4. Sin endpoint nuevo + sin migración Prisma — solo derivar campos existentes.

**Cliente:** `generated.ts` regenerado (323 KB → 327 KB). `getAudio()` castea explícitamente a `LectorAudioResponse` así que la tipización fluye.

**Smoke verification:**
- API 654/655 + crypto 34/34 + web 122/122 + mobile 20/20.
- typecheck + lint OK en los 3 workspaces.
- OpenAPI `generate:check` in sync.

**Deuda técnica abierta:**
- Migrar a `expo-audio` o `react-native-track-player` para metadata dinámica desde JS.
- Re-ejecutar embed ffmpeg para archivos m4a ya subidos a R2.
- Sin validación cover ≤ 500×500 server-side (sprint Author B2B).
- Sin tests UI dedicados del LectorAudioBar.

---

### Sesión 56 — 2026-06-13 ✅ COMPLETADA — Sprint Lector Audio Tests UI

**Rama sugerida:** `feature/sprint-lector-audio-tests`
**Tests:** 135/135 web (+13 nuevos) · 29/29 mobile (+9 nuevos) · 654/655 API + 34/34 crypto (sin cambios)
**Bitácora:** [docs/informes/sprint-lector-audio-tests.md](docs/informes/sprint-lector-audio-tests.md)

**Lo que se construyó (cierra deuda del sprint anterior):**

Hasta hoy el AudioBar — web y mobile — no tenía tests propios, era el componente más complejo del Lector sin coverage. 22 tests nuevos cubriendo:

**Web (`AudioBar.test.tsx`, 13 tests):**
- Pill toggle: cerrada en mount sin fetch; primer fetch con Bearer al abrir.
- Fetch state branches: 403 upsell Pro + link a `/dashboard/plan`; 404 not-found; network error + retry.
- Metadata rendering: `<img>` cuando artworkUrl es URL; gradient `<div>` cuando es token; subtitle + artist; `<audio>` con URL signed.
- Speed control: 4 chips con 1× activo; flip aria-pressed al picar 1.5×.
- Sleep timer (`vi.useFakeTimers`): Off activo por default; picar 15m arma countdown.

**Mobile (`LectorAudioBar.test.tsx`, 9 tests):**
- Mock de `expo-av` con `mock*` prefix (requisito del Jest hoister).
- Pill toggle: sin llamadas en mount; `setAudioModeAsync` ANTES de `Sound.createAsync` (verifica orden de background-audio).
- Fetch state branches: `{ statusCode: 403/404 }` + error genérico.
- Metadata rendering: título + subtitle/artist; play button + 4 speed chips; Off + 1× como únicos selected.

**Decisiones clave:**
1. Mock `fetch` global (web) vs mock `lectorApi.getAudio` (mobile) — cada cliente consume su propia capa.
2. `mock*` prefix en mobile (única forma de referenciar vars en factory de `jest.mock`).
3. `MockInstance<typeof fetch>` (Vitest) en lugar de `ReturnType<typeof vi.spyOn>` (colapsa a `unknown`).
4. `useFakeTimers` solo en el group de sleep timer — fuera bloquea `waitFor`.
5. Sleep chip "Off active" via filter sobre `getAllByRole("button")` con `accessibilityState.selected===true`.

**Smoke verification:**
- Web tests 135/135 (+13). Mobile tests 29/29 (+9).
- Web typecheck + lint OK. Mobile typecheck + lint OK.
- API + crypto sin cambios.

**Deuda técnica abierta:**
- Audio playback lifecycle (play/pause/onStatus) no cubierto — requiere mock de audio nativo.
- Transcript sync no probado — depende de `currentTime` que avanza con audio real.
- Speed `setRateAsync` mobile sin verificar `shouldCorrectPitch`.
- Web sleep timer fire (pause después N min) sin tests del HTMLAudioElement mock.
- Tests del LectorShell (block render + highlights + annotations + heartbeat) siguen sin cobertura.

---

### Sesión 57 — 2026-06-17 ✅ COMPLETADA — Sprint Ops Bundle (código de Sprint 1)

**Rama sugerida:** `feature/sprint-ops-bundle`
**Tests:** 660/661 API (+6 nuevos · 1 skipped sentinel) + 34 crypto + 135 web + 29 mobile
**Bitácora:** [docs/informes/sprint-ops-bundle.md](docs/informes/sprint-ops-bundle.md)
**Roadmap:** [docs/ROADMAP.md §3-4 — Sprint 1](docs/ROADMAP.md)

**Lo que se construyó:**

Cierra la parte código de Sprint 1 del roadmap. Las tareas ops puras (Stripe price IDs en Railway, API keys en Railway, embed real de audio files) quedan en backlog del usuario.

1. **`scripts/embed-audio-metadata.mjs`** — Node 20+ bulk ffmpeg embed para tags ID3v2/m4a. Manifest JSON, idempotente, `--dry-run`. Sin deps externas.
2. **`GET /api/health/integrations`** ADMIN-only — reporta `{configured: boolean, stub?: true}` por cada integración (Stripe, Anthropic, Voice, Resend, Google, Redis, VAPID, R2). NO leak de valores.
3. **Boot-time banner** en `main.ts` — lista `[MISSING]`/`[STUB]` por item al arrancar. Silente en prod cuando todo OK.
4. **6 unit tests** del `IntegrationsService` cubriendo empty env, stubs, voice routing, bootIssues shape.

**Decisiones:**
1. Endpoint ADMIN-only (no público) — el shape revela qué integraciones espera el sistema.
2. `stub` detection heurística por regex `/stub|test/i`.
3. Sin breaking change al `/health` simple — los monitores externos siguen igual.
4. `require()` dinámico en main.ts para resolver el servicio sin circularidad.
5. Banner silente en prod cuando OK — solo informa si hay issues.

**Smoke verification:**
- API tests 660/661 + crypto 34 + web 135 + mobile 29.
- typecheck + lint OK.
- Boot banner detecta 11 issues con env stubs reales.
- Script ffmpeg `--dry-run` válido con manifest sample.
- OpenAPI `generate:check` in sync.

**Deuda ops (no código — usuario en Railway/Stripe):**
- Stripe price IDs reales (Pro mensual, Pro anual, B2B).
- API keys: Anthropic, OpenAI, Resend, Google Client ID, VAPID trio.
- Embed real con ffmpeg + subir a R2 los 4 archivos m4a.

---

### Sesión 58 — 2026-06-17 ✅ COMPLETADA — Sprint Sentry (Sprint 2 del roadmap)

**Rama sugerida:** `feature/sprint-sentry`
**Tests:** 667/668 API (+7 nuevos · 1 skipped sentinel) + 34 crypto + 135 web + 29 mobile
**Bitácora:** [docs/informes/sprint-sentry.md](docs/informes/sprint-sentry.md)

**Lo que se construyó (cierra Sprint 2 del roadmap):**

Wire de Sentry en los 4 surfaces para tener traza de bugs en prod sin recrear el ambiente.

1. **API NestJS** — `@sentry/node@^8`, helper `apps/api/src/observability/sentry.ts` con `initSentry()` + `captureException()`. Init en `main.ts` antes de todo. Hook al `HttpExceptionFilter` para reportar 5xx con `{method, path, statusCode, code}` context.
2. **Worker** — mismo SDK, init en `worker.ts`. Idempotent flag previene doble-init.
3. **Web Next.js** — `@sentry/nextjs@^8` con `instrumentation.ts` + `sentry.server.config.ts` + `sentry.client.config.ts` + `sentry.edge.config.ts`. **Session Replay HARD-OFF** porque grabaría el composer del Diario abierto (plaintext on screen).
4. **Mobile Expo** — `@sentry/react-native@^6`, init en `app/_layout.tsx` al module load. **attachScreenshot/attachViewHierarchy HARD-OFF** por la misma razón.

**Decisiones clave:**
1. `sentryEnabled` flag separado de `initialised` — distingue "init corrió como no-op (sin DSN)" de "init wired al SDK real".
2. `beforeSend` scrubea `authorization`/`cookie`/`x-api-key`/`stripe-signature` — Sentry default solo cubre `authorization`.
3. Session replay + screenshots HARD-OFF en cliente — defensive privacy contra plaintext del Diario.
4. `tracesSampleRate: 0.1` prod / 1.0 dev. Edge 0.05 porque middleware corre por request.
5. DSN cliente vs server separado en web.
6. No corrí `npx @sentry/wizard` — wire mínimo controlable.

**7 tests nuevos** en `apps/api/src/observability/sentry.spec.ts`: empty DSN no-op, init con DSN, idempotencia, header scrubbing, `captureException` con/sin context, no-op cuando init nunca corrió.

**Smoke verification:**
- API tests 667/668 (+7) · crypto 34 · web 135 · mobile 29.
- typecheck + lint OK en los 4 surfaces.

**Qué queda para activar en prod (ops):**
- Crear proyecto Sentry y obtener DSNs.
- Configurar en Railway (API + worker), Vercel (web), EAS Build (mobile).
- Validar con throw 500 controlado post-deploy.

**Deuda técnica abierta:**
- Source maps web no se suben (correr wizard cuando importe).
- Mobile config plugin (`app.json`) no añadido — necesario antes de submit a App Store para dSYM/ProGuard.
- BullMQ `worker.on("failed")` no wireado explícitamente.
- Tests UI dedicados del wire web/mobile diferidos.

---

### Sesión 59 — 2026-06-17 ✅ COMPLETADA — Sprint 3 (E2E re-encrypt + LectorShell UI)

**Rama sugerida:** `feature/sprint-e2e-rekey-lectorshell`
**Tests:** 668/669 API (+1 E2E rekey) + 142/142 web (+7 LectorShell) + 34 crypto + 29 mobile
**Bitácora:** [docs/informes/sprint-e2e-rekey-lectorshell.md](docs/informes/sprint-e2e-rekey-lectorshell.md)

**Lo que se construyó (cierra Sprint 3 del roadmap):**

1. **E2E full-circle del re-encrypt del Diario** — `apps/api/src/users/rekey.e2e-spec.ts`. Ejerce: derive key₁ → encrypt cipher₁ → login HTTP → POST entry → derive key₂ → re-encrypt → POST rekey → decrypt cipher₂ con key₂ ✅. Plus negative control (key₁ no decrypta cipher₂) + assertion atómica de refresh tokens revocados. ~8s por dos Argon2id derivations + HTTP real.
2. **LectorShell UI tests** — 7 tests cubriendo: header (book + chapter title), blocks render en orden, botones aria-label, progress bar style width, annotations panel toggle (cerrado por default + revela annotations al abrir), conditional copy del complete CTA ("sigue leyendo" vs "casi al final" cuando ≥0.9). Mocks: `next/navigation`, `AudioBar`, IntersectionObserver.
3. **Harness extendido** — `apps/api/src/test/e2e-app.ts` ahora incluye `diaryEntry` mock.

**Bug descubierto:**
- **Salt length DTO mismatch:** `password-change-with-rekey.dto.ts` valida `Length(24, 28)` para `newCryptoSalt`, pero `auth.service.ts` produce salts de 22 chars (16 bytes b64url). Cualquier rekey real falla con 400. Mitigado en el E2E con 18-byte salts. **Fix queda como sprint propio** porque cambia el comportamiento de cuentas legacy.

**Decisiones:**
1. E2E con Prisma mock — coherente con harness existente. La cripto es real; la cuenta cripto es lo que se garantiza.
2. `AudioBar` mockeado — tiene su propio test desde el sprint anterior.
3. IntersectionObserver stub global — jsdom no lo implementa.
4. Conditional copy en lugar de button presence — el botón siempre renderiza por decisión UX.
5. Text-selection flow NO cubierto — diferido a Sprint 4.

**Smoke verification:**
- API tests 668/669 + web 142/142 + crypto 34/34 + mobile 29/29.
- typecheck + lint OK en API + Web.

**Deuda técnica abierta:**
- Salt length DTO mismatch — sprint propio para reconciliar.
- Testcontainers para E2E API.
- Text-selection en LectorShell test — Sprint 4.
- `use-heartbeat` hook sin test propio.
- Annotations CRUD en LectorShell no cubierto.

---

### Sesión 60 — 2026-06-17 ✅ COMPLETADA — Sprint 4 (Mobile highlights v1)

**Rama sugerida:** `feature/sprint-mobile-highlights`
**Tests:** 37/37 mobile (+8 BlockActionsSheet) + 668 API + 142 web + 34 crypto
**Bitácora:** [docs/informes/sprint-mobile-highlights.md](docs/informes/sprint-mobile-highlights.md)

**Lo que se construyó (cierra Sprint 4 del roadmap):**

Mobile lector tenía paridad funcional pendiente con web: read + annotations OK, pero **no se podía resaltar**. Este sprint cierra esa deuda con la decisión pragmática de **block-level highlights v1**: long-press en el párrafo marca el bloque entero (`startOffset:0, endOffset:content.length`), reusa el mismo contrato server, ship hoy. Character-level queda diferido hasta que RN tenga selection API estable.

1. **Pantalla mobile** — long-press abre `BlockActionsSheet` con 3 swatches (Amarillo/Azul/Rosa), "Añadir nota" y "Cancelar". Cuarta acción destructiva "Quitar resaltado" gated por `hasHighlight`. Optimistic insert/remove con temp ID. BlockView aplica tint (bg + borderLeft) del primer highlight del block.
2. **`BlockActionsSheet`** extraído a `apps/mobile/src/components/dashboard/lector/` para testabilidad. Componente 100% presentacional + helper `highlightStyleFor(color)`.
3. **8 tests nuevos** del sheet: render, gating del destructive row, callbacks (3 colores + nota + quitar + cancel), `highlightStyleFor` retorna paleta correcta.

**Decisiones:**
1. Block-level v1 vs character-level — RN no tiene selection API first-party; libraries unmaintained para SDK 52.
2. Tint del primer highlight (no merged) — design no define multi-color overlap.
3. Optimistic UI con temp ID — feedback visual instantáneo + rollback al error.
4. TestID en BlockView `block-${id}-${color?}` — útil para tests integrados.
5. Long-press substituye al prompt directo de annotation — gestures unificados.

**Smoke verification:**
- Mobile tests 37/37 + typecheck + lint OK.
- API + web + crypto sin cambios.

**Deuda técnica abierta:**
- Character-level highlights — esperar RN 0.78+ con selection API.
- Multi-color en mismo block — char-level lo resuelve naturalmente.
- Sin test integrado del flow completo (long-press → sheet → POST).
- `note?` en highlight no se setea — feature separada de annotation v1.

---

### Sesión 61 — 2026-06-17 ✅ COMPLETADA — Sprint 5 audit + fix salt-length DTO

**Rama sugerida:** `fix/salt-length-dto`
**Tests:** 674/675 API (+6 nuevos DTO · 1 skipped sentinel) · web/mobile/crypto sin cambios
**Bitácora:** [docs/informes/sprint-fix-salt-length.md](docs/informes/sprint-fix-salt-length.md)

**Lo que se descubrió:**

Empezamos Sprint 5 del roadmap (Recovery seed phrase + Edit entry mobile). Auditoría con agent reveló que **ambos flows ya estaban wireados** desde sprints anteriores:

- **Seed phrase modal web** — montado en `DiarioShell.tsx:69` con gate `!seedAlreadyShown && !ackInThisSession && masterKey`.
- **Seed phrase modal mobile** — `(tabs)/diario/index.tsx:121-126` con lazy-fetch de `/user/me` post-unlock + POST `/api/user/crypto-seed-acknowledged`.
- **Edit entry mobile** — `(tabs)/diario/[id].tsx` con state machine completo + PATCH a `/api/diario/entries/:id`.

El roadmap del 2026-06-13 listaba esos items como pendientes basándose en una auditoría que no miró el detalle de los archivos. Honesto reflejarlo en el doc.

**Lo que sí se construyó: fix del salt-length DTO**

Cierra deuda explícita del Sprint 3 (`sprint-e2e-rekey-lectorshell`): el DTO validaba `Length(24, 28)` para `newCryptoSalt` pero `auth.service.ts` produce salts de 22 chars (16 bytes b64url). Cualquier rekey real fallaba con 400.

1. `apps/api/src/users/dto/password-change-with-rekey.dto.ts` — `SALT_B64_LEN = 24` reemplazado por `SALT_B64_MIN = 22 / MAX = 28`. Comment corregido (era erróneo: 16 bytes b64url unpadded son 22 chars, no 24).
2. `apps/api/src/users/rekey.e2e-spec.ts` — el E2E de Sprint 3 usaba `randomBytes(18)` como workaround. Reemplazado por `randomBytes(16)` (idéntico a auth.service). Convierte el test en regression guard real.
3. `apps/api/src/users/dto/password-change-with-rekey.dto.spec.ts` (nuevo) — 6 tests del DTO cubriendo: acepta 22/24/28, rechaza 21/29, rechaza chars no-b64url.

**Decisiones:**
1. Fix solo el DTO, no cambiar auth.service. Razones: cuentas legacy ya tienen salts de 22 chars; no hay security benefit subir a 18 bytes (encima del floor de 128 bits); single-point fix.
2. Mantener rango 22-28 — forward-compat con clientes futuros que generen salts ligeramente más grandes.

**Smoke verification:**
- API tests 674/675 + typecheck + lint OK.
- E2E rekey corre con salts de 22 chars idénticos a auth real.

---

### Sesión — 2026-07-08 ✅ COMPLETADA — Mapa Emocional · Híbrido Fase A

**Rama sugerida:** `feature/emotional-map-hybrid-phase-a`
**Bitácora:** [docs/informes/emotional-map-hybrid-phase-a.md](docs/informes/emotional-map-hybrid-phase-a.md)

**Contexto:** el usuario probó el Mapa Emocional con 1 reflexión + 3 chats con Eco y obtuvo un radar casi todo al 50 % (dato fabricado). Pidió: cómo se mide, que el usuario vea cómo se llena + botón ⓘ, más completo (reflexiones + Eco + contenido), y respetando el cifrado E2E. Eligió la dirección **"Híbrido: on-device + checkins"**. Esta es la **Fase A** (honestidad + señales ricas + transparencia), sin tocar el cifrado.

**Lo que se construyó:**
- **Confianza por dimensión** — `EmotionalMapResult` extendido con `confidence`, `dimensions[]` y `coverage`. Ejes por debajo de `CONFIDENCE_FLOOR=0.15` muestran "Reuniendo datos" en vez de 50 % falso. `pct` promedia solo ejes cubiertos.
- **Señales ricas** — `compute()` ahora lee Eco USER (+ días distintos), voz, highlights, annotations y sesiones completadas, además del diario. Conexión y Consciencia se encienden desde Eco aunque solo haya 1 reflexión.
- **Transparencia** — web `MapInfoButton` (modal ⓘ con explicación por dimensión + garantía de privacidad), `MapStage` con banner "tu mapa se está formando" (`coverage<0.4`), `MapDims` con estado "Reuniendo datos" + `sources`. Mobile paridad completa (`app/(tabs)/mapa.tsx` con Modal RN).
- **TTL adaptativo** — mapas en formación cachean 15 min (no 24 h) para que la primera reflexión se refleje en minutos.

**Privacidad (ADR 0007 intacto):** el servicio nunca selecciona columnas cipher/nonce; el LLM solo recibe frecuencias categóricas + counts. `emotional-map.privacy.spec.ts` verde.

**Verificación:** API 729/730 · Web 256/256 · Mobile 43/43 · typecheck + lint verdes · OpenAPI in sync. Sin migración, sin endpoint nuevo.

**Siguiente:** Fase B (análisis on-device del texto, sube solo números) + Fase C (micro-checkins validados WHO-5 / auto-compasión) — PRs aparte.

---

### Sesión — 2026-07-09 ✅ COMPLETADA — Mapa Emocional · Etapa 0 (banco de personas offline)

**Rama:** `feature/emotional-map-benchmark` · **PR #452** (develop) + **#453** (sync a main)
**Doc:** [docs/research/emotional-map-benchmark.md](docs/research/emotional-map-benchmark.md)
**Tests:** API 750/751 (sin nuevos endpoints) · typecheck + lint + privacy verdes · OpenAPI in sync.

**Contexto:** el usuario pidió, antes de seguir con mejoras del modelo, (a) un **roadmap por etapas** sólido y (b) un **banco de usuarios sintéticos** para simular "un usuario entra N días e interactúa así → esto le sale". Eligió **Etapa 0 (banco) primero, sabor offline**.

**Lo que se construyó:**
- **Refactor:** la matemática del scoring se extrajo de `EmotionalMapService.compute()` a una función pura `scoreEmotionalMap(input, provider)` en `apps/api/src/emotional-map/emotional-map.scoring.ts`. El servicio ahora solo hace fetch a Prisma (9 queries) y delega. **Comportamiento preservado** (service spec 11/11).
- `benchmark/personas.ts` — 10 arquetipos (nuevo-3d … trimestre-disciplinado, volátil, recuperándose, declive, esporádico, casi-plano) + `buildPersonaInput()` determinista (seeded mulberry32, anclado a `NOW_REF`).
- `benchmark/benchmark.spec.ts` — corre cada persona por el scoring REAL, imprime la tabla, y asserta comportamiento por persona (gathering vs active, confianza ↑ con historia, plano > volátil en estabilidad, cobertura ~ engagement). 5 tests.
- `docs/research/emotional-map-benchmark.md` — tabla capturada + interpretación.

**Hallazgo (para la tesis):** el modelo **v0** lee los saltos normales de ±1 categoría (ok↔good↔great) como volatilidad real → la **Estabilidad sub-reporta** en personas "estables" (trimestre estable = 0%, solo casi-plano = 100%). Argumento concreto y numérico para el **v1 ordinal-latente** (Etapa 4). Además: hoy conviene surfacer Tono/Recuperación con más peso que Estabilidad con poca data (Etapa 1).

**Reconciliación de sync (importante):** el PR #453 destapó que `main` cargaba una versión **monolítica stale** de `emotional-map.service.ts` (427 líneas) que un sync previo con `-X ours` no había actualizado. El sync forzó el árbol a coincidir exactamente con `develop` (`git checkout origin/develop -- .` → `git diff origin/develop` vacío verificado). `main` y `develop` ahora tienen contenido idéntico.

**Privacidad (ADR 0007):** scoring + personas consumen solo ánimo ordinal + timestamps + conteos. Cero texto. Privacy spec verde sobre el código nuevo.

---

### Sesión — 2026-07-09 ✅ COMPLETADA — Mapa Emocional · Etapa 1 (ejes confiables primero)

**Rama:** `feature/emotional-map-stage-1` · **PR** develop + sync a main
**Doc:** [docs/research/emotional-map-benchmark.md](docs/research/emotional-map-benchmark.md) (v0.2, tabla recapturada)
**Tests:** API 752/753 (+2 benchmark) · Web 260 (+1 MapAffectDynamics) · Mobile 43 · typecheck + lint + privacy verdes · OpenAPI in sync.

**Contexto:** cierra el hallazgo de la Etapa 0 — el modelo v0 leía los saltos ordinales normales (±1 nivel) como volatilidad real, así que las personas estables leían 0% de Estabilidad.

**Dos cambios (validados contra el banco):**
1. **Estabilidad desde la dispersión estacionaria + piso de ruido de medición** (`ou.ts` `ouToAxes`). Ahora la estabilidad se calcula sobre `σ_stat = √(σ²/2θ)` (cuánto se aleja el ánimo de su base a largo plazo) menos un piso de ruido ordinal (`STABILITY_MEASUREMENT_SD=0.35`, `STABILITY_REF_SD=0.6`). Antes→después: dos-semanas 0%→**54%**, mes-constante 28%→**62%**, trimestre 0%→**64%**; volátil 0%→0% ✓ y casi-plano 100%→100% ✓ se preservan.
2. **Gating por eje** (`scoring.ts` `computeAffectDynamics`). Tono base + Estabilidad desde ~8 registros (`MIN_OBS_FOR_FIT`); Recuperación + Inercia (derivadas de θ, sesgo severo en series cortas) gated a `RECOVERY_MIN_OBS=20`. Nuevo campo `EmotionalMapAffectDynamics.recoveryNeeded`. La UI (web `MapAffectDynamics` + mobile `mapa.tsx`) muestra "Reuniendo datos · ~N más" en vez de un número poco fiable.

**Tests nuevos (benchmark):** "persona estable ±1 lee estabilidad >0.4" + "recovery/inertia gated hasta recoveryNeeded". Test `ou.spec` de monotonicidad (calm>volatile) preservado.

**Límite honesto (motiva Etapa 4):** personas con **tendencia** (recuperándose, en declive) leen estabilidad baja porque OU asume estacionariedad y trata una tendencia como varianza alta. El modelo v1 ordinal-latente con componente de tendencia (Etapa 4) separaría "voy hacia arriba" de "reboto sin rumbo".

**Privacidad (ADR 0007):** solo cambia la matemática sobre ánimo ordinal + timestamps. Cero texto. Privacy spec verde.

---

### Sesión — 2026-07-09 ✅ COMPLETADA — Mapa Emocional · Etapa 2 (micro-checkins)

**Rama:** `feature/emotional-map-stage-2-checkins` · **PR #470** (develop) + **#471** (sync a main)
**Tests:** API 757/758 (+7: 4 MoodService + 1 benchmark + specs ajustados) · Web 269 (+2 MoodChip) · Mobile 48 · typecheck ×3 + lints + privacy verdes · OpenAPI in sync.

**Qué se construyó:** después de marcar el ánimo del día, el MoodChip (web) / Modal (mobile) hace **una pregunta de 5 segundos** que rota entre 6 ítems adaptados de instrumentos validados (TMMS-24 claridad, SCS-SF auto-compasión, MAAS consciencia), escala 0–4, cero texto. Las respuestas alimentan **Claridad/Compasión/Consciencia como ejes MEDIDOS** del mapa (badge "Medido"), con la señal medida sobre-escribiendo al LLM por eje (mismo patrón que OU→Calma).

- **Schema:** `CheckinResponse {userId, itemKey, score Int, createdAt}` + índices; migración `20260709220000_stage2_checkin_response` aditiva.
- **Catálogo compartido** en `@psico/types`: `CHECKIN_ITEMS` (6), `CHECKIN_SCALE` (5 anclas), tipos request/response. Añadir un ítem = editar el catálogo, sin migración.
- **Endpoints:** `GET /api/mood/checkin/next` (rotación server-side: cooldown rolling ~20h, menos-respondida primero) + `POST /api/mood/checkin` (valida `@IsIn(CHECKIN_ITEM_KEYS)`, invalida cache del mapa fire-and-forget).
- **Scoring:** `computeCheckinAxes` — value = mean/4, confianza satura a 5 respuestas por eje; `measuredAxis()` helper; `EmotionalMapDimension.measured?: boolean` (opcional, cache-tolerant).
- **Banco:** persona `checkin-3sem` + test "checkins turn axes into MEASURED"; control sin checkins sigue unmeasured.
- **Seed demo:** cuentas ≥14 días reciben historial de checkins (re-correr `node scripts/seed-demo-users.mjs` en Railway post-deploy).

**Privacidad (ADR 0007):** puntajes ordinales + timestamps, cero texto. Privacy specs verdes.

---

### Sesión — 2026-07-09 ✅ COMPLETADA — Mapa Emocional · Etapa 4 (modelo v1 ordinal-latente con tendencia)

**Rama:** `feature/emotional-map-stage-4`
**Tests:** API 760/761 (+3: 2 ou.spec + 1 benchmark) · Web 271 (+2 MapAffectDynamics) · Mobile 48 · typecheck ×3 + lints + privacy + OpenAPI verdes.
**Doc:** [docs/research/emotional-map-benchmark.md](docs/research/emotional-map-benchmark.md) §Etapa 4.

**Qué cierra:** el límite honesto de la Etapa 1 — OU asume estacionariedad, así que "voy mejorando" leía como varianza (recuperándose-2m: estabilidad ~0%).

**El modelo v1** (`fitOuWithTrend` en `dynamics/ou.ts`): descompone `x(t) = a + b·t + z(t)` — tendencia lineal OLS + OU de media cero sobre los **residuos detrendados**. La tendencia solo se acepta con |t-stat| ≥ 2 **y** ≥1 nivel ordinal de movimiento total en la ventana (`TREND_T_STAT`, `TREND_MIN_TOTAL`); si no, cae al fit v0 → personas estacionarias intactas.

**Resultados (banco):** recuperándose-2m estabilidad ~0%→**80%**, tono 98% (nivel ACTUAL de la tendencia, no promedio de ventana); declive-mes estabilidad **59%**, tono 19% (honesto); volátil 0% ✓ sin tendencia; estables/casi-plano sin cambios ✓.

**Wire:** `EmotionalMapAffectDynamics.trend?: "up" | "down" | null` (opcional, cache-tolerant).

**UI (web + mobile):** la dirección lidera el titular («Vas en buena dirección: tu ánimo viene subiendo estas semanas») + nota tintada (sage para up, warm para down) explicando que el tono refleja el hoy y que subir/bajar no cuenta como inestabilidad. `affect-copy.ts` twins con `TREND_NOTE` + headline trend-aware.

**Privacidad (ADR 0007):** solo matemática sobre ánimo ordinal + timestamps. Cero texto.

**Pendiente research (Etapa R):** probit ordinal completo con umbrales estimados — el v1 aproxima la medición ordinal con el piso de ruido de Etapa 1 + descomposición de tendencia.

---

### Sesión — 2026-07-09 ✅ COMPLETADA — Mapa Emocional · Etapa 3 (intervalos ± bootstrap)

**Rama:** `feature/emotional-map-stage-3-intervals`
**Tests:** API 764/765 (+4: 3 bootstrap.spec + 1 benchmark) · Web 273 (+2 MapAffectDynamics) · Mobile 48 · typecheck ×3 + lints + privacy + OpenAPI verdes.

**Qué cierra:** la última etapa v1 del roadmap — surfacear la incertidumbre que `bootstrapOuCI` ya sabía calcular. Los chips del bloque afectivo ahora leen «72% ±8» con nota en el footer («El ± marca el rango probable de cada valor»).

- **`bootstrapAxesCI`** (`dynamics/bootstrap.ts`): cada réplica bootstrap se mapea por `ouToAxes` ANTES de tomar percentiles — correcto para estabilidad, que depende de σ y θ conjuntamente. Determinista (seed fijo) → cache reproducible.
- **`TrendOuFit.obsForFit` + `levelNowSe`**: el bootstrap corre sobre la MISMA serie que usó el fit (residuos detrendados cuando hay tendencia); el ± del tono con tendencia sale del SE de predicción OLS en t_last (el μ bootstrap describiría la media residual ≈ 0).
- **Wire:** `EmotionalMapAffectDynamics.margins?: {baseline, recovery, stability} | null` — half-widths 90% en unidades 0–1, opcional/cache-tolerant, null por eje cuando está gated.
- **Comportamiento (banco):** los márgenes se ENCOGEN con la historia — estabilidad ±38 (n=10) → ±25 (n=21) → ±20 (n=77); gathering → null; casi-plano → ~0 (certeza real); volátil ±2 (confiadamente inestable).
- **UI web + mobile:** chip "±N" (filtro de ruido ≤0.4pp) + nota de footer condicional. `affect-copy.ts` twins con `AffectStoryRow.margin`.

**Privacidad (ADR 0007):** solo remuestreo matemático sobre la serie ordinal ya usada. Cero texto.

---

### Sesión — 2026-07-09 ✅ COMPLETADA — Mapa Emocional · Etapa 5 (EWS / resiliencia + E5/E6 del paper)

**Rama:** `feature/emotional-map-stage-5-ews`
**Tests:** API 771/772 (+7: E5 + E5b + E6 + 3 ews.spec + 1 benchmark) · Web 274 (+1) · Mobile 48 · typecheck ×3 + lints + privacy + OpenAPI verdes.
**Docs:** [paper-1-results.md](docs/research/paper-1-results.md) v0.2 (E1–E6 completos) · [emotional-map-benchmark.md](docs/research/emotional-map-benchmark.md) §Etapa 5.

**Qué cierra:** la Etapa 5 del roadmap — early-warning signals por critical slowing down (van de Leemput et al. 2014) + los dos experimentos que faltaban del Paper 1.

- **Detector** (`dynamics/ews.ts`): AC1 + varianza sobre ventanas rodantes (50%) de la serie detrendada; tendencia por Kendall τ; dispara solo si AMBAS suben con τ ≥ 0.65. Gate honesto a ≥60 registros (gates de suficiencia del paper §4.5).
- **Calibración E5** (falsos positivos bajo el nulo estacionario, R=150): grilla τ×regla → punto de operación **FP 6.0% / sensibilidad 40%** (E5b, θ-ramp). Sensibilidad limitada = limitación conocida de los EWS, declarada, no escondida.
- **E6** (missingness 20/50/70%, R=30): μ casi inmune (RMSE 0.062→0.073 a 70% missing); σ acotado (0.051→0.135). Respalda el claim "diseñado para dato disperso real".
- **`simulateOuThetaRamp`** en `synthetic.ts` — θ colapsando linealmente (aproximación a transición) para E5b + banco.
- **Banco:** persona `senal-temprana` (90d: mitad estable → caminata persistente amplificándose) lee **rising** (τ 0.87/0.84); trimestre estable lee **steady**; todos con n<60 → **insufficient**.
- **Wire:** `EmotionalMapAffectDynamics.ews?: {status, tauAc, tauVar, needed} | null` (opcional, cache-tolerant).
- **UI (web + mobile):** nota de autocuidado NO-diagnóstica con tinte lavender, SOLO cuando rising: «Señal temprana: … No es un diagnóstico — tómalo como una invitación a cuidarte…». El flujo de crisis existente queda intacto y separado.

**Privacidad (ADR 0007):** solo matemática sobre la serie ordinal + timestamps. Cero texto.

---

### Sesión — 2026-07-09 ✅ COMPLETADA — Mapa Emocional · Etapa 6 (análisis on-device del texto · Fase B)

**Rama:** `feature/emotional-map-stage-6-ondevice`
**Tests:** API 783/784 (+12: 9 text-features.spec + 3 service) · Web 274 · Mobile 48 · typecheck ×3 + lints + privacy ×4 + OpenAPI verdes.

**Qué cierra:** la última etapa de producto del roadmap — el texto del diario (la señal más rica) alimenta el mapa SIN romper el E2E: el cliente descifra (ya lo hacía en el composer), analiza localmente, y **solo suben números**.

- **Analizador compartido** `analyzeReflectionText` en `@psico/types/text-features.ts` — UNA fuente para web y mobile (cero divergencia). Léxico ES curado (acentos normalizados): auto-foco (Pennebaker), lenguaje absolutista (Al-Mosaiwi 2018), affect labeling, insight/causal, self-kind vs self-critic. Devuelve 10 densidades 0–1 + wordCount; null bajo 5 tokens.
- **Schema:** `DiaryTextFeature` (SOLO columnas numéricas + `entryId? @unique` para upsert). Migración `20260709235000_stage6_diary_text_feature` aditiva.
- **Endpoint:** `POST /api/emotional-map/text-features` — DTO numbers-only (`@IsNumber @Min(0) @Max(1)` × 9 + wordCount), guard de ownership sobre entryId (403 `TEXT_FEATURE_NOT_YOURS`), invalidación del cache del mapa fire-and-forget.
- **Scoring:** `computeTextAxes` — claridad = insight+causal; consciencia = affect labeling; compasión = balance kind−critic alrededor de 0.5 (calla sin evidencia de self-talk). Confianza satura a `TEXT_GOOD_N=8` entradas. **Precedencia: checkin > texto > LLM** (ambos como Medido; source «El lenguaje de tus reflexiones — analizado en tu dispositivo; solo números salen de él»).
- **Clients:** hooks post-guardado en composers web + mobile (best-effort, jamás afecta el guardado). `emotionalMapApi.logTextFeatures` nuevo.
- **Seed demo:** cuentas ≥14 días reciben features verosímiles por arquetipo (re-correr `node scripts/seed-demo-users.mjs` post-deploy).

**Privacidad (ADR 0007):** el DTO no tiene NINGÚN campo capaz de portar texto; whitelist pipe descarta extras; la tabla no tiene columna de texto. El servidor sigue sin poder leer ni una palabra del diario.

---

### 🗺️ Roadmap por etapas — Mapa Emocional (acordado 2026-07-09)

Plan sólido, por etapas, cada una un PR aparte que se valida contra el banco de la Etapa 0.

| Etapa | Qué | Estado |
|---|---|---|
| **0** | Banco de personas offline (cimiento de validación) | ✅ **HECHO** |
| **1** | Ejes confiables primero — Tono base + Estabilidad desde ~8 registros; gate Recuperación/Inercia a 20. Estabilidad desde σ estacionaria + piso de ruido ordinal | ✅ **HECHO** |
| **2** | Micro-checkins (Fase C) — 6 ítems adaptados de instrumentos validados (TMMS-24/SCS-SF/MAAS); Claridad/Compasión/Consciencia pasan a MEDIDOS; persona "checkin diario" en el banco | ✅ **HECHO** |
| **3** | Intervalos ± (bootstrap) visibles en la UI — `bootstrapAxesCI` en espacio de ejes; chips "72% ±8" + nota en el footer; márgenes se encogen con la historia | ✅ **HECHO** |
| **4** | **Modelo v1 ordinal-latente con tendencia** — `x(t) = a + b·t + OU`; estabilidad sobre residuos detrendados, tono = nivel actual, `trend` up/down en el wire. Cierra el hallazgo de la Etapa 0 | ✅ **HECHO** |
| **5** | EWS / resiliencia (critical slowing down) — detector calibrado (FP 6%, gate ≥60 obs) + nudge no-diagnóstico + E5/E6 del paper | ✅ **HECHO** |
| **6** | Análisis on-device del texto (Fase B / Capa 8) — analizador ES compartido en @psico/types, 10 features numéricos, precedencia checkin > texto > LLM. Respeta E2E | ✅ **HECHO** |
| **R** | Research: Bayesiano/partículas, DSEM/mlVAR networks, NSGA-II multiobjetivo, validación clínica | ⬜ paper |

**Banco end-to-end real** (inyectar personas en DB de prueba + llamar la API real) queda como siguiente sabor del banco cuando se justifique probar la fontanería completa.

---

### Sesión — 2026-07-09 ✅ COMPLETADA — Sprint A · Ingesta de capítulos reales (Parte I de *Emociones en Construcción*)

**Rama:** `feature/chapter-ingestion` · **PR #480** (develop) + sync a main
**Bitácora:** [docs/informes/sprint-a-chapter-ingestion.md](docs/informes/sprint-a-chapter-ingestion.md)
**Tests:** API 783/784 · Web 274 · Mobile 48 · typecheck ×3 + lints + privacy + OpenAPI verdes (sin tests nuevos — contenido + tooling).

**Contexto:** para probar la app con un usuario real (entrar, leer, subrayar, anotar, conversar con Eco, ver cómo lo mide el Mapa) hacía falta texto de verdad. El usuario aportó los 3 primeros capítulos de *Emociones en Construcción* (Parte I) en prosa. Actividades y videos aún no existen como features → se colocan **mocks** para que esos bloques rendericen y el flujo se vea completo.

**Lo que se construyó:**
- **`apps/api/scripts/ingest-chapter-md.mjs`** — parser heurístico Markdown **o** prosa plana → `ChapterBlock`s. Primera línea = título; líneas cortas sin punto = headings; el resto = párrafos. Secciones "Actividades" → sus párrafos como `EXERCISE` + una card `✍️` mock. Inyecta una `PAUSE` de respiración ~45 % y una card `🎬 Video (próximamente)` antes de referencias. Idempotente por REEMPLAZO (⚠️ cascade sobre highlights/annotations). Lee sidecars `titles.json` / `parts.json`.
- **`apps/api/content/emociones-en-construccion/`** — `capitulo-01/02/03.md` + `titles.json` (títulos canónicos) + `parts.json` (los 3 son Parte 1 "Deconstruyendo lo que sabíamos").

**Bugs corregidos:** (1) título del Cap. 3 parseado como párrafo de 600 chars → `titles.json` + guard `takeTitle` (≤120 chars, sin punto final); (2) sección "Actividades" del Cap. 3 = 31 párrafos → parser mantiene prosa + una card mock, no fuerza todo a EXERCISE.

**Deuda:** reproductor de video real · actividades interactivas reales · ingestar Partes II/III · re-ingesta destructiva (migrar a diff cuando haya marcas reales).

---

### Sesión — 2026-07-09 ✅ COMPLETADA — Sprint A.2 · Partes del libro + Modo Libro/Guía

**Rama:** `feature/book-parts` · **PR #481** (develop) + **#482** (sync a main)
**Bitácora:** [docs/informes/sprint-a2-book-parts.md](docs/informes/sprint-a2-book-parts.md)
**Tests:** API 783/784 · Web 277 (+3 ChaptersList) · Mobile 48 · typecheck ×3 + lints + OpenAPI verdes.

**Contexto:** *Emociones en Construcción* tiene 3 partes; los capítulos ingestados son la **Parte I**. El usuario pidió que la Parte I quede clara en la UI y que los 3 capítulos funcionen en **Modo Libro y Modo Guía**.

**Lo que se construyó:**
- **Schema:** `Chapter.partNumber Int?` + `Chapter.partTitle String?` (nullable → fallback a lista plana). Migración aditiva `20260710000000_chapter_part_grouping`. El script de ingesta ya los escribía desde `parts.json`.
- **Backend:** `books.service.buildChaptersList` + `lector.service` devuelven part number/title; `@psico/types` extendido (cache-tolerant).
- **Web:** `ChaptersList` reescrito con `groupByPart` (headings "PARTE I · …" o lista plana); `LectorShell` header con "· Parte I". +3 tests.
- **Mobile:** heading de parte en el detalle + eyebrow "· PARTE I" en el lector.
- **Modo Libro/Guía verificado:** ambos modos rinden los 3 capítulos. Modo Guía muestra el `AudioBar` con placeholder honesto **"Audio en producción"** (los m4a aún no están en R2); cuando ops los suba, reproduce sin cambios cliente.

**Nota de sync:** #482 se mergeó por squash — el repo no permite merge commits. `main` quedó idéntico a `develop` (diff vacío verificado).

**Deuda:** subir los m4a a R2 · tabla `BookPart` cuando llegue Author B2B · Partes II/III.

---

### Sesión — 2026-07-09 ✅ COMPLETADA — Sprint B · Eco contextual en el lector

**Rama:** `feature/eco-contextual-reader` · **PR #483** (develop) + **#484** (sync a main)
**Bitácora:** [docs/informes/sprint-b-eco-contextual.md](docs/informes/sprint-b-eco-contextual.md)
**Tests:** API 783/784 · Web 277 · Mobile 53 (+5: acción Eco en BlockActionsSheet + EcoTopicCard) · Crypto 34 · typecheck ×3 + lints + OpenAPI verdes.

**Contexto:** con los capítulos ya legibles, cerrar el bucle de acompañamiento — que Eco aparezca al abrir un capítulo sugiriendo un tema, y que al subrayar se pueda saltar a profundizar con el pasaje pre-cargado. El resto (sugerencias adaptativas, nudges post-ejercicio) a backlog. Para los prompts de capítulo el usuario eligió **"Yo las genero"** (las redactó el asistente).

**Lo que se construyó:**
- **`EcoTopicCard`** (web + mobile) — tarjeta descartable al inicio del capítulo con un abre-conversación curado. Prompts en `ECO_CHAPTER_PROMPTS` (`@psico/types/eco-chapter-prompts.ts`) por `(bookSlug, chapterOrder)` + fallback por título. Los 3 capítulos de la Parte I tienen tema propio (el título de la tarjeta es el tema de conversación, distinto del título del capítulo).
- **Subrayar → profundizar:** web `HighlightPopover` gana botón "🌿 Eco"; mobile `BlockActionsSheet` gana fila "🌿 Conversar con Eco". Ambos arman el prompt del pasaje y navegan a Eco.
- **Handoff lector → Eco:** web `sessionStorage` (per-tab, consumido una vez al montar → siembra el composer vía `seededRef`); mobile singleton en RAM consumido en `useFocusEffect` (el seed sobrevive el unlock gate). Cargan `source: { bookSlug, chapterOrder, kind }`.

**Privacidad (ADR 0007):** el texto de los libros es contenido PÚBLICO licenciado, no el Diario cifrado — llevar un pasaje entre pantallas no toca ningún ciphertext ni el Mapa. El composer cifra el mensaje del usuario como siempre.

**Bug corregido:** Jest hoist rule en `EcoTopicCard.test.tsx` — la variable del factory `jest.mock` debe tener prefijo `mock` **al inicio** (`pushMock` → `mockPush`).

**Deuda (backlog aprobado):** sugerencias adaptativas según interacción + Mapa · nudges post-ejercicio · video/actividades reales · character-level highlights en mobile.

---

### Sesión — 2026-07-10 ✅ COMPLETADA — Panel compañero del lector (dock/sheet) + actividades interactivas

**Ramas:** `feature/reader-companion-dock` (#487/#488) · `feature/reader-companion-sheet` (#489/#490) · `feature/interactive-exercises` (#491/#492)
**Bitácora:** [docs/informes/sprint-reader-companion.md](docs/informes/sprint-reader-companion.md)
**Tests:** Web 281 · Mobile 58 · API 783/784 · Crypto 34 · typecheck ×3 + lints + privacy + OpenAPI verdes.

**Contexto:** el subrayar→Eco del Sprint B **navegaba** a `/dashboard/eco` y el lector perdía su lugar. El usuario pidió (a) un texto claro «Pregúntale a Eco» en vez de solo un ícono, (b) una ventana lateral tipo Copilot de GitHub que se abra sin salir del lector, (c) distinguir **notas** (apunte sobre el texto) de **reflexiones** (escritura sobre ti). Eligió **Dock completo (3 pestañas: Eco/Notas/Reflexión)** + **Modo Guía como está**.

**Lo que se construyó:**
- **Panel compañero** — web = drawer derecho (`ReaderCompanionDock`), mobile = bottom sheet (`ReaderCompanionSheet`), ambos con 3 pestañas 🌿 Eco · ✎ Notas · 🪷 Reflexión. El lector queda montado detrás (nunca se pierde el lugar). Solo la pestaña activa se monta.
- **Distinción Notas vs Reflexión:** Notas = plaintext (annotation, ancla a `blockId`); Reflexión = **cifrada E2E** (DiaryEntry) que alimenta el Mapa. Dos superficies de escritura con contratos de privacidad opuestos en un solo panel.
- **Seed override pattern:** `passage` (crudo, envuelto por-tab) · `ecoSeed` (prompt Eco listo) · `reflexionSeedOverride` (consigna Reflexión lista), en precedencia.
- **`EcoChat` reutilizable** extraído de la pantalla Eco mobile (SSE, crisis, reveal máquina de escribir, paginación, reporte); la pantalla quedó como wrapper delgado y el sheet monta el mismo componente.
- **`EcoTopicCard` → abre el panel** (no navega) vía `onOpen?(prompt)` opcional; igual `HighlightPopover` (web) y `BlockActionsSheet` (mobile) ganan «🌿 Eco» + «🪷 Reflexión» que abren el dock/sheet sembrado.
- **Actividades interactivas** (backlog #1): catálogo curado `CHAPTER_EXERCISES` en `@psico/types` (como `ECO_CHAPTER_PROMPTS`), 100 % cliente, cero backend. `reflect` → abre Reflexión sembrada (entrada cifrada → Mapa); `breathe` → ejercicio guiado inhala/sostén/exhala animado (overlay web / Modal mobile). **No re-ingesta** (evita borrar highlights por cascade).

**Privacidad (ADR 0007):** Notas plaintext por diseño; Reflexión cifrada (solo ciphertext + números on-device); libros son contenido público; respiración es UX pura.

**Bug clave (#488):** `git merge -X theirs` dejó el árbol sucio y committeó código viejo de `LectorShell.tsx` → CI `TS17001`. Causa: `git checkout origin/develop -- . && git add -A` sin committear antes del push. Fix `--amend` + `--force-with-lease`. **Workflow endurecido:** verificar blob MATCH contra `origin/develop` antes de cada push de sync (#490, #492 limpios).

**Deuda (backlog aprobado):** nudges post-ejercicio *(siguiente)* · sugerencias adaptativas de Eco · reproductor de video real · character-level highlights mobile.

---

### Sesión — 2026-07-10 ✅ COMPLETADA — Nudges post-ejercicio (backlog #2)

**Rama:** `feature/post-exercise-nudges` · **PR #494** (develop) + sync a main
**Bitácora:** [docs/informes/sprint-post-exercise-nudges.md](docs/informes/sprint-post-exercise-nudges.md)
**Tests:** Web 286 (+5) · Mobile 63 (+5) · API 783/784 · Crypto 34 · typecheck ×3 + lints + OpenAPI verdes.

**Qué cierra:** segundo ítem del backlog. Al **terminar** una actividad, invita a seguir en vez de dejar un callejón: la **respiración** (fase "Listo") muestra dos CTAs suaves («🪷 Escribir cómo me siento» → Reflexión sembrada · «🌿 Conversar con Eco» → Eco sembrado); la **reflexión guardada** añade «🌿 Conversarlo con Eco» que salta a la pestaña Eco. Cero backend, cero migración, todo cliente reusando el dock/sheet.

**Cómo:**
- Seeds compartidos en `@psico/types/chapter-exercises.ts`: `breatheReflectSeed`, `breatheEcoSeed`, `reflexionEcoSeed` (web + mobile dicen lo mismo).
- Web: `BreathingExercise` gana `onReflect?`/`onAskEco?`; `ReflexionTab` gana `onAskEco?`; `ReaderCompanionDock` los propaga; `LectorShell` centraliza el patrón de apertura en `openEcoInDock`/`openReflexionInDock` y los reusa en los 4 sitios (reduce duplicación).
- Mobile: paridad — `BreathingExercise` + `ReflexionSheetTab` + `ReaderCompanionSheet` + la pantalla reusa el `openCompanion(tab, opts)` existente.

**Privacidad (ADR 0007):** los nudges solo abren una superficie / siembran un composer con texto genérico nuestro; la reflexión se cifra como siempre y ningún texto del usuario viaja entre pantallas.

**Tests:** `BreathingExercise.test.tsx` web (+5, `vi.useFakeTimers`) y mobile (+5, `jest.useFakeTimers` + `clearAllTimers` en afterEach para callar el loop de Animated tras el unmount).

**Deuda (backlog aprobado):** sugerencias adaptativas de Eco *(siguiente)* · reproductor de video real · character-level highlights mobile · subir los m4a a R2.

---

### Sesión — 2026-07-10 ✅ COMPLETADA — Reproductor de video en el lector (backlog #3)

**Rama:** `feature/lector-video-player` · **PR #496** (develop) + sync a main
**Bitácora:** [docs/informes/sprint-lector-video-player.md](docs/informes/sprint-lector-video-player.md)
**Tests:** API 783/784 · Web 294 (+8) · Mobile 63 · Crypto 34 · typecheck ×3 + lints + OpenAPI verdes.

**Qué cierra:** tercer ítem del backlog. La card mock «🎬 próximamente» se convierte en un **reproductor real**: reproduce inline cuando ops sube el archivo, o muestra un placeholder con forma de reproductor («En producción») hasta entonces — mismo patrón que «Audio en producción» de Modo Guía.

**Decisión clave:** el video es **inline por bloque** (una cápsula dentro del flujo de lectura), no por capítulo como el audio → encaja como un `ChapterBlock` kind `VIDEO` con la URL en `meta.videoUrl`.

**Cómo:**
- **Schema:** valor `VIDEO` en `ChapterBlockKind` + migración aditiva `20260710120000_chapter_block_video_kind`.
- **Helper compartido `videoBlockInfo(block)`** en `@psico/types` — única fuente de verdad web + mobile. Detecta kind `VIDEO` **o** (backward-compat) `EXERCISE` con prefijo `🎬` → la data ya sembrada sube al reproductor **sin re-ingestar** (no pierde highlights). Devuelve `{url, poster, caption, durationSec}`.
- **Ingest script:** `VIDEO_MOCK` → bloque kind `VIDEO` (caption limpio).
- **Web `VideoBlock`** (`<video>` o placeholder) wireado en `BlockRenderer`; **Mobile `VideoBlock`** (`expo-av` `Video` o placeholder) wireado en `BlockView`.
- **README §video** con la guía ops (ffmpeg MP4 +faststart, poster, UPDATE del `meta`).

**Privacidad (ADR 0007):** videos = contenido público licenciado; `videoUrl` es URL pública directa (sin firmar, sin cripto). Nada del Diario/Eco toca la reproducción.

**Tests:** `VideoBlock.test.tsx` web (+8) cubre el helper (detección VIDEO + 🎬 legacy + parse meta) y el componente (placeholder / `<video>` real / caption).

**Deuda / ops:** subir los videos reales a R2 + setear `meta.videoUrl` (como los m4a del audio) · migración sin aplicar en Railway.

**Backlog restante:** refinar Eco con contenido *(siguiente, pedido del usuario)* · sugerencias adaptativas de Eco · character-level highlights mobile.

---

### Sesión — 2026-07-11 ✅ COMPLETADA — Mapa Emocional V2 · Fase A (auditoría) + Fase B (contratos)

**Rama:** `feature/emotional-map-v2-fase-b`
**Bitácora:** [docs/informes/sprint-v2-fase-b-contratos.md](docs/informes/sprint-v2-fase-b-contratos.md)
**Docs nuevos:** [docs/architecture/emotional-map-v2.md](docs/architecture/emotional-map-v2.md) · [docs/product/emotional-map-copy-contract.md](docs/product/emotional-map-copy-contract.md) · [docs/product/learning-vs-emotional-map.md](docs/product/learning-vs-emotional-map.md) · [docs/research/emotional-map-model-registry.md](docs/research/emotional-map-model-registry.md) · [ADR 0014](docs/adr/0014-emotional-map-v2-facts-narrator.md)

**Contexto:** el usuario entregó el prompt maestro "PSICOCONTENT — Auditoría y diseño de la arquitectura V2". La **Fase A** (auditoría read-only, secciones A–M) verificó contra el repo: engagement alimenta ejes psicológicos (conexión/propósito), el LLM crea puntuaciones numéricas, `pct` global "Comprensión emocional" (web + mobile), "Te recuperas rápido" desde n=20 vs paper que exige ~100, "Confianza 100%" alcanzable con n=40 (cobertura CI real ≈78%), **EWS serializado al cliente público** (sensibilidad 40%), análisis local de texto **sin opt-in** y **sin borrado en cascada** de derivados, y la landing prometiendo que Eco "relee lo que escribiste" (imposible con E2E). Lo que ya está bien: cripto E2E, crisis flow separado del mapa, Eco con RAG y sin impersonación, banco de personas, núcleo matemático OU publicable.

**Decisión de producto del usuario:** el Mapa Emocional **se transforma, no se elimina**.

**Fase B construida (cero cambio de comportamiento público):**
- `shared/flags.ts` (6 flags env-based, defaults = comportamiento actual; `EMOTIONAL_MAP_OU` absorbido).
- `emotional-map/model-registry.ts` + spec — IDs canónicos H1/OU-G0/OU-GT/OU-O1/EWS-R1/TXT-L1/CHK-S1; gates anclados a constantes reales (RECOVERY_MIN_OBS=20 pineado como violación conocida).
- Palancas en el scoring puro: `ewsPublic` (false → `ews: null` en el wire) y `llmScoringEnabled` (false → provider jamás llamado, sin números fabricados).
- **Fix privacidad:** FK CASCADE `DiaryTextFeature.entryId → DiaryEntry` (migración `20260711000000_text_feature_entry_cascade` con limpieza de huérfanos).
- Ratchets: `emotional-map.v2-contract.spec.ts` (violaciones 5.1/5.2/5.3 pineadas + tests de palancas) y `copy-contract.spec.ts` (15 términos prohibidos × 8 archivos públicos, snapshot exacto de hoy).

**Decisiones pendientes de aprobación (L1–L6, detalle en emotional-map-v2.md §6):** ~~L1 hotfix B'~~ (✅ aprobada e implementada — ver sesión siguiente) · L2 radar restringido a autoinforme · L3 LLM→Narrator · L4 opt-in análisis local · L6 alcance LearningDashboard.

---

### Sesión — 2026-07-11 ✅ COMPLETADA — Mapa Emocional V2 · Fase B' (hotfix L1)

**Rama:** `feature/emotional-map-hotfix-b-prime`
**Bitácora:** [docs/informes/sprint-v2-fase-b-prime-hotfix.md](docs/informes/sprint-v2-fase-b-prime-hotfix.md)
**Tests:** API 797/798 (1 skipped sentinel) · Web 299 · Mobile 65 · typecheck ×3 + lints + OpenAPI verdes.

**Qué cierra:** la decisión **L1** aprobada por el usuario ("vamos con L1") — los tres claims públicos que el paper no sostiene, usando las palancas pre-cableadas en Fase B:

1. **EWS fuera del wire público** — `EMOTIONAL_MAP_EWS_PUBLIC` default off (sensibilidad 40 %, E5). El detector sigue corriendo interno para research/banco (la función pura mantiene default true; persona `senal-temprana` intacta). La UI además ignora `ews` defensivamente aunque un blob cacheado lo traiga.
2. **Gate de recuperación 20 → 100** — `RECOVERY_MIN_OBS = 100` (θ no identificable bajo n≈100, E1). Fila con nota honesta "Reuniendo más información · ~N registros más".
3. **Copy afectivo neutro descriptivo** — twins `affect-copy.ts` reescritos: "Nivel central en categorías agradables" (no "tu ánimo de base es bueno"), "Ritmo de retorno estimado" (no "te recuperas rápido"), "Variación alrededor de tu tendencia" (no "muy parejo"); headlines de tendencia neutrales. "Confianza N %" → `evidenceBaseLabel` (base limitada/moderada/más sólida). `EWS_NOTE`/`ewsNote` eliminados.
4. **Landing sin claim falso** — chat demo ya no dice "releyendo lo que escribiste esta semana" (imposible con E2E); Eco reflexiona sobre la conversación presente y la resonancia se propone confirmable.

**Ratchets encogidos (nunca crecen):** `copy-contract.spec.ts` 8 → 5 archivos pineados (MapAffectDynamics + ambos affect-copy limpios); "KNOWN VIOLATION 7.4" del v2-contract reemplazada por asserts del flag OFF + vista research viva.

**Sin migración, sin endpoint nuevo, sin cambio de shape** — `ews` era opcional desde Etapa 5. ADR 0007 intacto.

**Decisiones abiertas restantes:** L2 (radar solo autoinforme) · L3 (LLM→Narrator) · L4 (opt-in análisis local) · ~~L6~~ (✅ resuelta en Fase C — ver sesión siguiente).

---

### Sesión — 2026-07-11 ✅ COMPLETADA — Mapa Emocional V2 · Fase C (aprendizaje ≠ mapa)

**Rama:** `feature/emotional-map-fase-c-learning`
**Bitácora:** [docs/informes/sprint-v2-fase-c-learning.md](docs/informes/sprint-v2-fase-c-learning.md)
**Tests:** API 800/801 (+3 palanca) · Web 298 · Mobile 65 · typecheck ×3 + lints + OpenAPI verdes.

**Qué cierra:** la Fase C del programa V2 y la decisión **L6**, con un ajuste razonado sobre la recomendación: **Evolución ES el LearningDashboard** (ya existía con página + endpoint + hitos); en vez de duplicar superficie, se completó con los contadores que faltaban.

1. **`EvolucionStats` +2 campos** — `conversacionesEco` (mensajes USER, all-time) + `marcasLectura` (highlights + annotations). Web `EvoQuarter` y mobile evolución ganan las dos filas. Sin migración, sin cambio OpenAPI.
2. **El mapa deja de presentar actividad como fuentes** (cambio público) — web `MapFeed` y el feed del mapa mobile se reemplazan por un puntero a Mi Evolución ("son parte de tu recorrido, no una medida de tu mundo interior"); ambas pantallas del mapa ya no fetchean `/evolucion`.
3. **Palanca `EMOTIONAL_MAP_V2` cableada** (default off) — con el flag: conexión/propósito dejan de derivar de engagement (confianza 0, "Reuniendo datos" hasta resonancias de Fase E), voz sale de claridad, ecoDays sale de compasión/consciencia, y el **payload del LLM queda en `{entryCount, activeDays}`** (campos de engagement ahora opcionales en el provider interface, prompt condicional).
4. **Ratchets encogidos:** copy-contract 5 → 4 archivos (MapFeed limpio; mapa mobile pierde "minutos de lectura"); v2-contract +3 tests (inversión `+highlights ⇒ mapa no cambia` con flag on · payload sin engagement · default off).

**Privacidad (ADR 0007):** intacta — solo counts y metadata categórica.

**Decisiones abiertas restantes:** L2 (radar solo autoinforme) · L3 (LLM→Narrator) · ~~L4~~ (✅ resuelta en Fase D — ver sesión siguiente). Encender `EMOTIONAL_MAP_V2` queda como decisión de producto por config.

---

### Sesión — 2026-07-11 ✅ COMPLETADA — Mapa Emocional V2 · Fase D (opt-in del análisis local + evidencia)

**Rama:** `feature/emotional-map-fase-d-consent`
**Bitácora:** [docs/informes/sprint-v2-fase-d-consent.md](docs/informes/sprint-v2-fase-d-consent.md)
**Tests:** API 806/807 (+6) · Web 298 · Mobile 65 · typecheck ×3 + lints + OpenAPI verdes.

**Qué cierra:** la Fase D del programa V2 y la decisión **L4** — el análisis on-device del texto (TXT-L1) pasa de silencioso a **consentimiento explícito con borrado en cascada**, más la versión lite del Evidence Ledger.

1. **Opt-in con tres capas de enforcement** — `PrivacySettings.localTextAnalysis` default **false** (migración aditiva `20260711120000`); `POST /emotional-map/text-features` → **403 `TEXT_ANALYSIS_NOT_ENABLED`** sin consentimiento; `compute()` no lee `DiaryTextFeature` sin opt-in (filas pre-consentimiento quedan dormidas). **Opt-out ⇒ `deleteMany` de derivados** + invalidación del cache (`emotionalMapCacheKey` exportado; `UsersService` ganó inject de Redis).
2. **Clientes** — helper cacheado `textAnalysisConsent()` (twins web/mobile, fails closed); los 4 puntos de análisis (composers Diario + pestaña Reflexión del dock/sheet) verifican consentimiento ANTES de analizar. Consent cards en Seguridad (web switch + confirm inline "Desactivar y borrar"; mobile Switch + Alert destructivo, auto-cargada).
3. **Evidence lite** — `EmotionalMapDimension.evidence?: {modelId, n} | null` (cache-tolerant) con IDs del Model Registry (OU-GT/OU-G0 · CHK-S1 · TXT-L1 · H1) + n de observaciones; el modal ⓘ (web + mobile) muestra "Método X · basado en N registros". El Ledger persistido llega con ARC (Fase E).
4. **Cambio público intencional:** con default off, el texto deja de alimentar el mapa para TODOS hasta optar in — ejes "Medido" por texto vuelven a LLM/"Reuniendo datos". Seed demo consiente (`localTextAnalysis: true`) para conservar la fuente; re-correr `seed-demo-users.mjs` post-deploy.

**Privacidad (ADR 0007):** reforzada — el consentimiento gobierna incluso los datos numéricos derivados; el texto sigue E2E siempre.

**Decisiones abiertas restantes:** L2 (radar solo autoinforme) · L3 (LLM→Narrator) — Fase F. Deuda: migración + re-seed en Railway; el texto consentido aún puntúa ejes (V2 lo quiere descriptivo, Fase F).

---

### Sesión — 2026-07-11 ✅ COMPLETADA — Mapa Emocional V2 · Fase E (ciclo ARC: resonancias confirmadas)

**Rama:** `feature/emotional-map-fase-e-arc`
**Bitácora:** [docs/informes/sprint-v2-fase-e-arc.md](docs/informes/sprint-v2-fase-e-arc.md)
**Tests:** API 812/813 (+6) · Web 301 (+3 MapResonances) · Mobile 67 (+2 sheet) · typecheck ×3 + lints + OpenAPI verdes.

**Qué cierra:** la Fase E — el principio "nada entra al mapa silenciosamente" se vuelve código. Subrayar ya no es señal implícita: nace la **resonancia confirmada** (Anclar → Relacionar → Confirmar), la única señal de contenido admitida en el mapa y la fuente legítima que Conexión esperaba bajo V2.

1. **`Resonance` + `ResonancesModule`** — schema (conceptKey único por user, fuente, fecha; sin texto, sin status: toda fila ES una confirmación) + migración `20260711140000`; GET/POST (upsert idempotente)/DELETE (borrado real + ownership) con invalidación del cache del mapa.
2. **Catálogo `CHAPTER_CONCEPTS`** en @psico/types (patrón ECO_CHAPTER_PROMPTS) — concepto curado por capítulo para los 3 de la Parte I + fallback estable. El content graph con tablas (Concept/ContentUnit/BookManifest) se difiere a Author B2B (mismo criterio que L6).
3. **Modelo `ARC-C1`** (registry + scoring): bajo `EMOTIONAL_MAP_V2`, conexión = conceptos confirmados distintos / 4, confianza satura a 2, `measured: true`, evidencia `{ARC-C1, n}`, sources «Las resonancias que confirmaste sobre tus lecturas». El scoring legacy las ignora (ratchet). Flag `CONTENT_RESONANCE` default **on** (el ciclo es consentimiento explícito por diseño).
4. **UI:** web `ResonanceNudge` post-subrayado (una vez por capítulo+sesión, sessionStorage) + sección **«Mis resonancias»** en el mapa (procedencia completa: Confirmado por ti · Cap. N · fecha + Quitar con server action optimistic); mobile fila «🌱 Me resonó» en `BlockActionsSheet` (props opcionales, hint «solo si lo confirmas») + sección paridad en el mapa (Alert destructivo + rollback).

**Privacidad (ADR 0007):** la fila lleva solo metadata de catálogo — nunca el texto subrayado; todo es un tap explícito y todo puede borrarse.

**Deuda:** migración en Railway · propósito sigue "Reuniendo datos" bajo V2 (flujo de temas importantes → Fase F) · fuentes ECO/EXERCISE del enum sin UI (Fase H).

---

### Sesión — 2026-07-11 ✅ COMPLETADA — Mapa Emocional V2 · Fase F (UI V2 + L2 + L3)

**Rama:** `feature/emotional-map-fase-f-ui-v2`
**Bitácora:** [docs/informes/sprint-v2-fase-f-ui-v2.md](docs/informes/sprint-v2-fase-f-ui-v2.md)
**Tests:** API 820/821 (+8) · Web 312 (+11) · Mobile 70 (+3) · typecheck ×3 + lints + OpenAPI verdes.

**Qué cierra:** la última fase del núcleo V2 — las dos decisiones abiertas (**L2** y **L3**) + la UI V2 completa, todo detrás de un rollout server-driven con **cero cambio público** hoy (flags en default).

1. **L3 — el LLM jamás puntúa bajo V2** — `provider.score()` no se invoca (invierte la KNOWN VIOLATION 5.3 bajo el flag); ejes interpretativos sin check-in → "Reuniendo datos". Nace el **Narrator NAR-L1** (`EMOTIONAL_MAP_NARRATOR` default off): método opcional `narrate(facts)` que recibe SOLO números ya calculados y devuelve copy `{headline, body}`; cualquier fallo → mapa intacto sin narrative. Apagarlo no cambia datos (Facts/Narrator, principio 3).
2. **L2 — radar restringido a autoinforme** — la UI V2 no tiene radar de 6 ejes ni "Comprensión emocional N %"; el radar queda solo como **«Cómo me describí»** (3 ejes CHK-S1, chip "Autoinformado", triángulo solo con los 3 respondidos). El mini-map de Inicio usa el mismo componente en modo compact.
3. **Wire V2 + secciones** — `v2` marker (solo con `EMOTIONAL_MAP_V2` on **y** `EMOTIONAL_MAP_LEGACY_UI` off; el service lo strippea en la ventana de dual-run) · `momento` (último ánimo literal) · `lenguaje` (**TXT-L1 pasa a descriptivo-only bajo V2** — cierra deuda de Fase D: el texto ya no puntúa ejes) · `narrative`. `pct` queda en el wire por compat (cron snapshots/Evolución) pero la UI V2 nunca lo renderiza. Gate de tendencia bajo V2: dirección retenida hasta `TREND_PUBLIC_MIN_OBS=60`.
4. **UI V2 web + mobile** — componentes `MapMomento`/`MapSelfReport`/`MapLenguaje`/`MapNarrative` (web) + `MapSelfReportCard` (mobile); páginas ramifican por `map.v2`; modal ⓘ con copy V2 y «charlas con Eco» (única frase pública que cambia hoy).
5. **Ratchets:** copy-contract +6 archivos limpios y snapshot 4→3 (MapInfoButton limpio; lo pineado vive solo en ramas legacy → Fase G las borra); v2-contract +6 tests; service spec +3 (dual-run); registry +NAR-L1 con spec pineando IDs.

**Privacidad (ADR 0007):** el Narrator recibe solo números/tokens categóricos ya calculados — nunca texto ni ciphertext.

**Encender la UI V2** = `EMOTIONAL_MAP_V2=on` + `EMOTIONAL_MAP_LEGACY_UI=off` (decisión de producto por config, con dual-run intermedio opcional). **Siguiente:** Fase G (retiro del layout legacy + serie de Evolución) · Fase H (Eco contextual + flujo de «temas importantes» para Propósito).

---

### Sesión — 2026-07-11 ✅ COMPLETADA — Mapa Emocional V2 · Fase G (el V2 es el producto)

**Rama:** `feature/emotional-map-fase-g-legacy-retirement`
**Bitácora:** [docs/informes/sprint-v2-fase-g-legacy-retirement.md](docs/informes/sprint-v2-fase-g-legacy-retirement.md)
**Tests:** API 820/821 · Web 306 · Mobile 70 · typecheck ×3 + lints + OpenAPI verdes.

**Qué cierra:** la fase de transición del programa V2 — a diferencia de B–F (todo detrás de flags), **este PR SÍ cambia el producto**:

1. **Defaults flipped** — `EMOTIONAL_MAP_V2` default **on** · `EMOTIONAL_MAP_LEGACY_UI` default **off**. `EMOTIONAL_MAP_V2=off` en Railway queda como palanca de rollback a nivel de datos (el scoring legacy sobrevive solo para eso; specs pineados con `pinLegacyMode()`).
2. **Layout legacy BORRADO** — MapStage/MapDims (web, + test) + rama stage/dims del mapa mobile + radar 6-ejes/% del mini-map de Inicio; los clientes renderizan la UI V2 siempre, null-tolerant ante rollback. MapInfoButton con copy V2 único.
3. **Copy-ratchet en CERO** — `KNOWN_VIOLATIONS = {}`; cualquier término prohibido en superficie pública del mapa rompe el build, sin excusa legacy.
4. **Evolución: «Cobertura de tu mapa»** — `EmotionalMapSnapshot.coverage` (migración aditiva `20260711180000`), cron escribe pct+coverage, charts web/mobile trazan cobertura («cuánta información tienes, no cómo estás») y saltan filas pre-Fase-G. `pct` queda sin consumidor de UI — solo historial + rollback.
5. **Seed demo** confirma 2 resonancias de la Parte I (Conexión se enciende bajo V2). Re-correr `seed-demo-users.mjs` post-deploy.

**Deuda ops:** migraciones `20260711120000` + `20260711140000` + `20260711180000` + re-seed en Railway.
**Siguiente:** Fase H — Eco contextual (scopes + citas + propuestas confirmables) + flujo de «temas importantes confirmados» → fuente de Propósito. Remoción total de `pct` cuando cierre la ventana de rollback.

---

### Sesión — 2026-07-12 ✅ COMPLETADA — Mapa Emocional V2 · Fase H (Eco contextual + ARC-P1 Propósito)

**Rama:** `feature/emotional-map-fase-h-eco-contextual`
**Bitácora:** [docs/informes/sprint-v2-fase-h-eco-contextual.md](docs/informes/sprint-v2-fase-h-eco-contextual.md)
**Tests:** API 828/829 (+4) · Web 308 (+2) · Mobile 70 · typecheck ×3 + lints + OpenAPI verdes.

**Qué cierra:** la última fase del programa V2 — Eco se vuelve contextual al lector y **Propósito** obtiene su fuente legítima (cerraba el último eje que reunía datos bajo V2).

1. **Scope de lectura** — `EcoScope {bookSlug, chapterOrder}` opcional en `POST /api/eco/messages` (dock web / sheet mobile). Acota el RAG al libro, ancla el prompt al tema del capítulo y ofrece el concepto como resonancia confirmable. Sin scope, Eco standalone sin cambios.
2. **Citas deterministas** — `done.sources: EcoSource[]` lista los pasajes libro/capítulo realmente recuperados (de los hits del RAG, nunca claims del LLM); UI «Contexto consultado: …».
3. **Ciclo ARC completo** — `done.resonanceOffer` propone el concepto del capítulo; solo un tap explícito lo persiste con `source: "eco"` (nada silencioso). Chip web + card mobile.
4. **ARC-P1 → Propósito** — `Resonance.important` (migración aditiva `20260712000000`) + `PATCH /api/resonances/:id` + toggle ⭐ en «Mis resonancias». Bajo V2, Propósito = temas importantes distintos / 3 (satura), «Medido», evidencia `{ARC-P1, n}`. Legacy conserva el propósito por progreso de lectura (ratchet).
5. **Registry** +ARC-P1 · **spec** pinea el id.

**Privacidad (ADR 0007):** `EcoScope`/`EcoSource` = metadata de catálogo (contenido público), `important` es un booleano; el mensaje a Eco sigue cifrado E2E.

**Deuda ops:** aplicar migración `20260712000000` en Railway.
**Programa V2 CERRADO** con Fase H (A→H): aprendizaje ≠ mapa, sin pct global, LLM nunca puntúa, todo con procedencia + confirmación explícita. Fase I/J (media multimodal + safety tiers) post-v1.

---

### Próximo paso — arco de libros cerrado

📖 **El roadmap maestro del Mapa Emocional vive en la tabla de arriba** (Etapas 0-6 ✅, R = paper). **El roadmap de infra vive en [docs/ROADMAP.md](docs/ROADMAP.md)** (Sprints 1-5 cerrados + bug de Sprint 3).

**Estado tras el arco de libros (Sprints A → A.2 → B):** un usuario ya puede entrar a un capítulo real de *Emociones en Construcción* (Parte I), leerlo en Modo Libro o Modo Guía, subrayar/anotar, saltar a Eco con el pasaje pre-cargado, y ver cómo el Mapa lo mide.

**Backlog aprobado por el usuario (para retomar):**
- **Reproductor de video real** — hoy card mock `🎬` en los capítulos.
- **Actividades interactivas reales** — hoy card mock `✍️` + prosa.
- **Sugerencias adaptativas de Eco** según cómo el usuario interactúa con libro/video/actividades + según el Mapa Emocional.
- **Nudges post-ejercicio.**

**Otros candidatos (polish / infra):**
- **Subir los m4a de los 3 capítulos a R2** para que Modo Guía reproduzca de verdad (hoy "Audio en producción").
- **`expo-av` → `expo-audio`** — metadata dinámica lock-screen + character-level highlights mobile.
- **Settings UI: explicit TZ selector** · **Testcontainers para E2E API**.
- **Freeze v1 + validación** — el código crítico está cerrado; faltan los items ops (Stripe price IDs + API keys + ffmpeg embed real).

---

### Histórico — Sesión 57 (deploy ops, no código)

**🎉 Pulso v2 completo + audit cleanup ✅.** Tres caminos:

**Opción A — Deploy a Railway (recomendado):**
```bash
# Prerequisito para probar con users reales:
# - Aplicar 10 migraciones Prisma acumuladas desde S9
# - Configurar 6 envs: ANTHROPIC/OPENAI/DEEPGRAM/RESEND/REDIS/GOOGLE_CLIENT_ID
# - Smoke test cada endpoint en producción
# - Provisionar worker Railway service (running dist/worker)
```

**Opción B — Sprint deuda técnica UI (Reports + tests + paginación):**
```bash
git checkout -b feature/sprint-front-polish
# UI tests (Vitest + RTL setup + happy paths web)
# Reports UI: long-press / context menu en assistant msgs
# Thread title generation: cliente cifra el primer msg → POST /threads
# Paginación de mensajes en /eco/threads/:id
```

**Opción C — Sprint S11 PatternsModule (Pro feature):**
```bash
git checkout -b feature/sprint-s11-patterns
# Análisis de patrones del Diario: heatmap mood, tag clusters
# Pro-tier only. Reads DiaryEntry.mood/tags (plaintext en schema).
# Usa EcoModule (S10) para generar "insights" narrativos.
```

---

### Estado del repo al cerrar Sesión 11

- Back local: 33 rutas mapeadas correctamente bajo `/api/*` + 2 excluidas (`/health`, `/subscriptions/webhook`).
- Tests: 125/125.
- Front local: cliente web + mobile + cold-start mobile actualizados.
- Documentación: Plan v2 + ADR 0006 + Bitácora Sprint 0.A en `docs/informes/`.
- Sin commitear: cambios de Sprint 0.A + cambios de Sesión 9. Recomendado: dos PRs separados (`feat(api): UsersModule` y `feat(api): global prefix + Swagger + shared kernel`).
- ADRs: 0001–0006 escritos; 0007–0013 pendientes.

---

### Estado del repo al cerrar Sesión 10

- API en producción: 23 endpoints (sin prefix `/api`). Tests: 87/87.
- Código local sin commit: schema Prisma extendido + `@psico/types` extendido + `apps/api/src/users/` (12 endpoints) + 26 tests nuevos de UsersModule.
- Planes vigentes: `IMPLEMENTATION_PLAN_v2.md` (este es el válido); `IMPLEMENTATION_PLAN.md` y `BACK_AUDIT.md` quedan como referencia histórica.
- ADRs: 0001–0005 escritos; 0006–0013 pendientes (uno por sprint que los dispare).
