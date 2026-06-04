# Sprint S41 — Wire tests por workspace al CI + coverage opt-in

**Rama sugerida:** `feature/sprint-41-ci-wire-tests`
**Tests:** 16/16 mobile + 24/24 web + 358/359 API + 34/34 crypto (sin cambios — sprint de CI).

---

## 1. Scope

Cierra la deuda técnica de S39 y S40: hace VISIBLE en el GitHub Actions UI que cada workspace tiene su propia suite y status independientes. Añade coverage opt-in en web y mobile como infraestructura para floors futuros.

---

## 2. Decisiones

1. **Split del Test job en 4 steps named** (API, Crypto, Web, Mobile) en lugar de un solo `pnpm turbo run test --affected`. Pros: status independiente per-workspace, debugging más rápido (sabes cuál falló a primera vista), un fallo no esconde a los otros pass.
2. **Cada step usa `turbo run test --filter=@psico/<name>`** en lugar de `pnpm --filter`. Preserva el cache `.turbo` y respeta el pipeline definido en `turbo.json` (que ya tiene `dependsOn: ["^build"]`).
3. **Sin `--affected`** — los tests son rápidos (web 1.5s, mobile 1.7s, crypto 25s con Argon2id real, API 10s). Total agregado ~40s. La safety net (que TODOS los tests corran SIEMPRE) vale más que ahorrar segundos.
4. **Coverage como capability, no como gate.** v1 enable provider + reporter + script (`test:cov`), sin thresholds. Cuando crezcamos sobre 60% lines en archivos cubiertos, activar floor real. Razón: no queremos block en PRs por archivos no cubiertos (LectorShell, ChatArea, etc) mientras estamos en early stage.
5. **Provider v8 en web** (vitest), default en mobile (jest istanbul). Ambos producen `text` + `json-summary` para futura integración con dashboards.
6. **No coverage en API ni crypto.** Esos ya tienen tests sólidos (358 + 34). Si necesitamos floor ahí, se hace independiente cuando lleguemos a v1.

---

## 3. Cambios

### CI workflow

- `.github/workflows/ci.yml` — Test job reescrito:
  - Reemplaza `Test (affected, unit only — no DB in CI)` con 4 steps:
    - `Test · API (Vitest + Nest unit, no DB in CI)` → `turbo run test --filter=@psico/api`
    - `Test · Crypto (Argon2id + AEAD roundtrip)` → `turbo run test --filter=@psico/crypto`
    - `Test · Web (Vitest + RTL + jsdom)` → `turbo run test --filter=@psico/web`
    - `Test · Mobile (Jest + jest-expo + RNTL)` → `turbo run test --filter=@psico/mobile`
  - Cache `.turbo` preservado en todos.

### Web coverage

- `apps/web/package.json` — script `test:cov: vitest run --coverage`.
- `apps/web/vitest.config.ts` — `test.coverage`:
  - provider `v8`
  - include `src/components/dashboard/**/*.{ts,tsx}` + `_TourOverlay.tsx`
  - exclude `**/*.test.tsx`, `**/*.spec.tsx`
  - reporters `text`, `json-summary`
- Dev dep: `@vitest/coverage-v8@^2`.

### Mobile coverage

- `apps/mobile/package.json` — script `test:cov: jest --coverage --passWithNoTests`.
- `apps/mobile/jest.config.js`:
  - `collectCoverageFrom: src/**/*.{ts,tsx}` (excluye tests).
  - `coverageReporters: ["text", "json-summary"]`.

### Sin cambios

- API, crypto packages — sin cambios.
- Tests existentes — sin cambios.

---

## 4. Verificación

- `pnpm --filter @psico/web test:cov` corre 24/24 + emite coverage table (MoodHeatmap 100%, UsageCards 100%, WeeklySummaryCard 97.8%, etc).
- `pnpm --filter @psico/mobile test:cov` corre 16/16 + emite coverage table (UsageCards 100%, InvoicesList 100%, TourOverlay 100%).
- YAML validation: `python3 -c "import yaml; yaml.safe_load(...)"` OK.
- API tests + crypto sin cambios (358/358, 34/34).

---

## 5. Deuda técnica abierta

- **Coverage floors** — quedan en warn-only. Cuando expandamos a >60% lines globales en archivos cubiertos, activar `thresholds.lines: 60` en vitest config y `coverageThreshold` en jest config.
- **Coverage en API + crypto** — sin reporter wireado. Si quieres dashboard de coverage global, agregar `pnpm --filter @psico/api test:cov` con `vitest run --coverage` (vitest ya está).
- **Coverage dashboard** — emitimos `json-summary` pero nadie lo lee. Cuando haya 5+ workspaces con coverage, integrar Codecov o GitHub Actions artifact upload.
- **`--affected` sigue disponible** — el script `pnpm turbo run test --affected` sigue funcionando si lo invocamos manualmente; solo no es el default del CI.
- **Tests de screens completos con expo-router** — sigue diferido (S40 deuda).
- **Tests para Client Components grandes** (ChatArea, LectorShell, EcoShell) — siguen diferidos.

---

## 6. Resumen para Notion

**Qué cerramos en Sprint S41:**

- 4 steps named en CI Test job (API, Crypto, Web, Mobile) → visibilidad explícita per-workspace en GitHub Actions UI.
- Coverage opt-in en web (vitest + v8 provider) y mobile (jest istanbul) — capability sin gate.
- Scripts `test:cov` en ambos workspaces.
- Doc con decisiones y guidance para floors futuros.

**Qué viene:**

- Tests de Client Components grandes (ChatArea Eco, LectorShell, EcoShell).
- Coverage floors reales (60% lines) cuando lleguemos a v1.
- Coverage dashboard (Codecov / Artifact upload) cuando justifique.
- Tests de screens completos con `expo-router` harness.
- Pulso v2 admin dashboard.
- Bugfix #2 Stripe price IDs reales.
