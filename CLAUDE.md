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

### Próximo paso — Sesión 26

**Tres opciones disponibles:**

**Opción A — Sprint S10 AIModule conversacional:**
```bash
git checkout -b feature/sprint-s10-eco-chat
# Extender RAG existente con threads + messages E2E (ADR 0007)
# SSE streaming + safety/crisis detection
# Quota eco ya expuesta en /usage → ahora se respeta server-side
# Cierra el último counter de /usage (todos los placeholders)
```

**Opción B — Front UI consumiendo S6-S8:**
```bash
git checkout -b feature/sprint-mi-plan-front
# Web + mobile: pantalla Mi Plan consumiendo /usage, /invoices, /cancel
# Web + mobile: pantalla Voz consumiendo /voz/transcribe con MediaRecorder
# Web: /dashboard/plan, /dashboard/voz
# Mobile: /(tabs)/plan, /(tabs)/voz (nuevo)
```

**Opción C — Sprint S11 PatternsModule (Pro feature):**
```bash
git checkout -b feature/sprint-s11-patterns
# Análisis de patrones del Diario (heat-map por mood, tag clusters, etc.)
# Pro-tier only. Reads DiaryEntry.mood/tags (ya plaintext en el schema).
# Probablemente requiere AIModule conversacional primero para el "insights"
# generativo — re-evaluar el orden con el usuario.
```


**Decisión pendiente antes de S8 o S10:** si vamos por la pantalla Mi Plan primero (opción C), ¿quitamos los placeholders de los counters Eco/Voice (siempre 0) o los dejamos visibles como "Próximamente"?

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
