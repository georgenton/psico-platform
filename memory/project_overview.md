---
name: Project overview
description: Psico Platform monorepo structure, stack, and scaffold status
type: project
---

Turborepo + pnpm v10 monorepo fully scaffolded as of 2026-04-24 (Sesión 1).

**Why:** Psychoeducation SaaS targeting Ecuador → LATAM. Three runtimes (API, Web, Mobile) share types and client code.

**Structure:**

- `apps/api` — NestJS 10, CommonJS, Prisma + Redis (not yet wired), deploys to Railway
- `apps/web` — Next.js 14 App Router, deploys to Vercel
- `apps/mobile` — Expo SDK ~52 with expo-router
- `packages/types` — shared TypeScript interfaces (User and future domain types)
- `packages/ui` — React web components (empty scaffold, M4+)
- `packages/hooks` — shared React hooks (empty scaffold, M4+)
- `packages/api-client` — typed fetch wrapper (empty scaffold, M2+)
- `config/typescript-config` — base, nextjs, react-native tsconfig presets
- `config/eslint-config` — ESLint 8 + @typescript-eslint shared config
- `config/prettier-config` — Prettier 3 shared config

**Key decisions:**

- NestJS tsconfig is standalone (not extending base.json) because it requires `module: CommonJS` + `moduleResolution: node` + `emitDecoratorMetadata`
- `pnpm.onlyBuiltDependencies` set in root package.json for esbuild, @nestjs/core, unrs-resolver
- apps (api, web, mobile) are in `.changeset/config.json` ignore list — only packages get versioned

**How to apply:** When working in this repo, always reference workspace packages with `workspace:*`. Run builds with `turbo build` from root to respect the dependency graph.
