# ADR 0001 — Monorepo with Turborepo + pnpm Workspaces

**Date:** 2026-04-24
**Status:** Accepted

## Context

Psico Platform requires three separate runtimes: a NestJS REST API, a Next.js 14 web app, and a React Native (Expo) mobile app. Without a monorepo, sharing types, UI primitives, and API client code requires publishing packages to a registry on every change, slowing iteration significantly during the M1–M3 validation phase.

## Decision

Use a **Turborepo**-managed monorepo with **pnpm workspaces**. All apps and shared packages live in a single Git repository under `apps/` and `packages/`. Tooling configs (TypeScript, ESLint, Prettier) are extracted into `config/` packages and consumed via `workspace:*` references.

## Alternatives Considered

| Option          | Rejected Reason                                                    |
| --------------- | ------------------------------------------------------------------ |
| Separate repos  | High cross-cutting change overhead during rapid validation         |
| Nx              | Heavier setup; Turborepo is sufficient for this scale              |
| Yarn workspaces | pnpm is stricter on phantom dependencies; avoids runtime surprises |
| Lerna           | Superseded by Turborepo for task orchestration                     |

## Consequences

**Benefits:**

- Single `pnpm install` bootstraps the entire platform.
- Turborepo's task graph ensures packages build before consumers (`"dependsOn": ["^build"]`).
- Remote caching via Turborepo will halve CI times once team grows.
- Changesets manages cross-package versioning without a registry.

**Trade-offs:**

- Larger Git clone for contributors who only work on one app.
- Turborepo task graphs require discipline: every workspace must declare its inputs/outputs correctly or caching misbehaves.

**Deployment remains independent:**

- `apps/api` → Railway
- `apps/web` → Vercel
- `apps/mobile` → Expo EAS
