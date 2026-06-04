# Sprint S39 — UI tests web (Vitest + RTL)

**Rama sugerida:** `feature/sprint-39-web-ui-tests`
**Tests web nuevos:** 24/24 (5 archivos) — primer batch de tests UI del proyecto.
**Tests API/crypto:** 358/359 + 34/34 (sin cambios).

---

## 1. Scope

Primera capa de tests UI para `apps/web`. Setup completo de Vitest + React Testing Library en el workspace + cobertura de 5 componentes críticos del producto Phase 1:

1. **UsageCards** — 4 cards de quota (libros / eco / voz / diario) + paywall del FREE + over-quota highlight.
2. **WeeklySummaryCard** — null state, render con summary, 422 inline error, regenerate success.
3. **ReportMessageModal** — radio group con 5 razones, comment counter, POST eco/report, error inline.
4. **MoodHeatmap** — empty state + dense calendar con gap-fills.
5. **TourOverlay** — fetch catálogo, advance/back, Terminar POST con stepsCompleted real, Saltar con index actual, empty catalog dismiss silencioso.

Mobile UI tests quedan para sprint propio — el setup de React Native Testing Library con Expo SDK 53+ tiene fricción adicional (jest preset, Reanimated mocks, Expo modules) que merece su propia decisión técnica.

---

## 2. Decisiones

1. **Vitest sobre Jest.** Vitest comparte runtime con Vite (HMR rapidísimo en `--watch`), tiene mejor TS-out-of-the-box, y es el mismo runner que ya usan @psico/api y @psico/crypto. Cero contexto switching.
2. **`jsdom` v25** sobre `happy-dom`. happy-dom es más rápido pero algunas queries de RTL (especialmente `screen.getByRole`) tienen edge cases que requieren workarounds. jsdom es la fricción default del ecosistema.
3. **`globals: true`** — sin tener que importar `describe/it/expect` en cada file. Matchea el estilo de los tests API.
4. **`vitest.setup.ts`** importa `@testing-library/jest-dom/vitest` una sola vez y registra `afterEach(cleanup)`. Sin duplicación por archivo.
5. **Alias `@/`** replicado del tsconfig para que los imports en tests sean idénticos a los de runtime.
6. **`vi.mock("next/navigation")`** para los componentes que llaman `useRouter()`. Devuelve un stub con `refresh: vi.fn()`.
7. **`vi.mock("@psico/api-client")`** para mockear el cliente sin tocar la red. Evita el `MSW` setup que sería overkill para este sprint.
8. **`vi.spyOn(globalThis, "fetch")`** cuando el componente usa fetch directo (WeeklySummaryCard) en lugar del apiClient.
9. **Sin tests de páginas (Server Components)** — los Server Components de Next ejecutan en runtime de servidor y necesitan harness más complejo. Cubrimos los Client Components donde vive toda la lógica interactiva.
10. **Sin tests visuales** (Chromatic/Percy). Eso es un sprint propio cuando se justifique el costo.

---

## 3. Cambios

### Setup

- `apps/web/package.json`:
  - dev deps: `vitest@^2 @vitejs/plugin-react@^4 @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14 jsdom@^25`.
  - scripts: `test` (vitest run) + `test:watch` (vitest).
- `apps/web/vitest.config.ts` — environment jsdom, alias `@/`, setupFile, glob `src/**/*.{test,spec}.{ts,tsx}`.
- `apps/web/vitest.setup.ts` — jest-dom matchers + cleanup global.

### Tests creados

| File                                                           | Tests  |
| -------------------------------------------------------------- | ------ |
| `src/components/dashboard/plan/UsageCards.test.tsx`            | 6      |
| `src/components/dashboard/patrones/WeeklySummaryCard.test.tsx` | 4      |
| `src/components/dashboard/eco/ReportMessageModal.test.tsx`     | 5      |
| `src/components/dashboard/patrones/MoodHeatmap.test.tsx`       | 4      |
| `src/app/dashboard/_TourOverlay.test.tsx`                      | 5      |
| **Total**                                                      | **24** |

### Sin cambios

- Componentes de producción no se tocaron (objetivo del sprint: verificar lo que ya hay).
- API, mobile, types, api-client — sin cambios.

---

## 4. Verificación

- **Web tests:** 24/24 en 1.35s (incluyendo setup).
- **Web typecheck + lint:** clean.
- **API tests:** 358/358 + 1 skipped sentinel (sin cambios).
- **@psico/crypto:** 34/34.
- **OpenAPI `generate:check`:** in sync.

---

## 5. Deuda técnica abierta

- **Sin tests para Client Components grandes** (LectorShell del Reader, ChatArea de Eco, EcoShell). Esos tienen mucha lógica state-machine y merecen su propio batch. Diferido por scope.
- **Sin tests para hooks custom** (`use-heartbeat`, `useDiaryKey`). Hookean a state externo (DOM events, contexts) y necesitan harness con providers.
- **Sin coverage thresholds en `vitest.config.ts`.** El sprint actual es para sembrar infraestructura, no para enforcing coverage. Próximo sprint: añadir `coverage.thresholds.lines: 60` como floor.
- **Sin integración a CI.** Workflow `.github/workflows/ci.yml` no corre `pnpm --filter @psico/web test` aún. Conviene añadir un step "Web Tests" cuando este sprint mergeé.
- **Mobile UI tests** — RN Testing Library con Expo SDK 53. Sprint S40 candidato.
- **Visual regression** (Chromatic/Percy/Argos) — solo cuando un diseñador esté revisando PRs visuales.
- **Tests de integración con MSW** — para flows que tocan múltiples endpoints. Hoy mockeamos al nivel del cliente; MSW da más fidelidad.

---

## 6. Resumen para Notion

**Qué cerramos en Sprint S39:**

- Setup Vitest + RTL + jsdom + jest-dom en `apps/web`.
- 5 archivos de test cubriendo 24 cases sobre los componentes más críticos del producto Phase 1.
- Patrones repetibles: mock `next/navigation`, mock `@psico/api-client`, `vi.spyOn(fetch)` para fetch directo.
- Doc con decisiones y patrones para el resto del equipo.

**Qué viene:**

- Mobile UI tests (RN Testing Library) — sprint propio S40.
- Wire `pnpm test` del web a CI workflow.
- Coverage thresholds como floor (60%).
- Tests para componentes complejos (LectorShell, ChatArea) cuando se justifique.
- Bugfix #2 Stripe price IDs reales (tarea del usuario).
- Pulso v2 admin dashboard.
