# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Psico Platform is a psychoeducation SaaS. The repo is a Turborepo monorepo managed with pnpm workspaces.

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

1. Briefly explain the architectural decision before writing any code.
2. Always produce complete, runnable code — never partial snippets.
3. State exactly which commands to run to verify the result.
4. Mark technical debt inline with `// TODO senior: <description>`.
5. Close every session with a **"Resumen para Notion"** block summarising what was built and what comes next.

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

### Sesión 4 — PENDIENTE

**Rama:** `feature/subscription-module`
Stripe · planes · webhooks · billing portal ·
integración con Plan enum existente

### Sesión 5 — PENDIENTE

Web app: landing page · auth pages · dashboard básico con Next.js 14

### Sesión 6 — PENDIENTE

AIModule: RAG sobre contenido de libros · pgvector · Claude API companion
