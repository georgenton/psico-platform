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

### Próximo paso — Sesión 18

**Sprint S6 — DiaryModule con E2E encryption**

```bash
git checkout -b feature/sprint-s6-diary-e2e
# ADR 0007 ya escrito (Sprint S1) — implementación
# Cliente-side crypto: Argon2id + XChaCha20-Poly1305 + ECDH X25519 + HKDF
# Backend recibe textCiphertext + textNonce, nunca texto plano
# share-with-therapist con re-encrypt efímero
# stats.diaryEntries y stats.minutesTotal se llenan
```

**Decisión bloqueante antes de S6:**
1. ¿Hacemos el web companion sprint (S5-front) primero, o continuamos backend → frontend en paralelo al final de Fase 1?

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
