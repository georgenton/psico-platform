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

| Área de diseño | Módulo NestJS | Estado |
|---|---|---|
| Onboarding (`01-onboarding.md`) | `OnboardingModule` (nuevo) | Por hacer |
| Inicio (`02-inicio.md`) | `HomeModule` (nuevo, agrega de varios) | Por hacer |
| Mi Biblioteca (`03-biblioteca.md`) | `ContentModule` | ✅ Parcial — falta favorites/bookmarks |
| Detalle de libro (`04-detalle.md`) | `ContentModule` | ✅ Parcial — falta reviews |
| Lector (`05-lector.md`) | `ContentModule` + `ProgressModule` | ✅ Parcial — falta highlights/annotations |
| Diario (`06-diario.md`) | `DiaryModule` (nuevo, **E2E**) | Por hacer |
| Voz (`07-voz.md`) | `VoiceModule` (nuevo) | Por hacer |
| Eco (`08-eco.md`) | `AIModule` (extender con threads/messages **E2E**) | ✅ RAG built — falta capa conversacional |
| Mi Plan (`09-plan.md`) | `SubscriptionModule` | ✅ Hecho — falta usage + customer-portal |
| Perfil (`10-perfil.md`) | `UsersModule` | Por hacer (estructura existe, falta surface) |
| Terapia (`11-terapia.md`) | `TherapyModule` (nuevo, **gated**) | v2 — esperar a que cierren los gates de Pulso |
| Patrones (`12-patrones.md`) | `PatternsModule` (nuevo, Pro) | Por hacer |
| Rutas (`13-rutas.md`) | `SubscriptionModule` o `ContentModule` | Probablemente no implementar en v1 |
| Dynamic Island (`14-dynamic-island.md`) | `NotificationsModule` | Por hacer (Live Activities) |
| Wallpapers (`15-wallpapers.md`) | `ContentModule` o nuevo | No prioridad v1 |
| Editor de autor (`16-author.md`) | `AuthorModule` (nuevo, rol B2B) | v2 |
| Pulso (`17-pulso.md`) | `PulsoModule` (nuevo, rol admin) | v2 — tras validar v1 |

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

### Próximo paso — Sesión 56 (deploy ops, no código)

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
