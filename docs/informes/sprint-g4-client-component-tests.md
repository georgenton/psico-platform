# Sprint G4 — Tests UI focused para InicioV2 + EcoShell

**Fecha:** 2026-06-21
**Rama:** `feat/sprint-g4-client-component-tests`
**Tests:** 236/236 web (228 → 236, +8)

## Contexto

G1 cubrió componentes presentacionales de F1/F2. Faltaban los 3 Client Components grandes del producto:

- **InicioV2** — Server-rendered shell del dashboard. Renderiza 5 metrics + hero + actividad + continue book.
- **LectorShell** — Client Component pesado con state machine, hooks, heartbeat. **Ya tenía 7 tests desde Sprint 3** (LectorShell.test.tsx). G4 NO duplica.
- **EcoShell** — Client Component con context gating (DiaryKeyContext).

G4 cierra InicioV2 + EcoShell. Tests focused: branches principales, sin cubrir interacciones de fetch (esas viven en ChatArea/ThreadRail tests cuando aterricen).

## Lo que se construyó

### `InicioV2.test.tsx` — 5 tests

- Renderiza los 5 metric cards con cifras honestas (Reflexiones · Insights G2b · Patrones G2b · Minutos · Días seguidos).
- Greeting block con firstName + city eyebrow.
- Mini-map con pct del emotionalMap.
- Empty activity → fallback "Empieza con una respiración".
- ContinueBook → CTA link al lector con la ruta correcta.

### `EcoShell.test.tsx` — 3 tests

- Legacy fallback cuando `isLegacyAccount: true`.
- Locked fallback con CTA a Diario cuando `ecoKey: null`.
- Eco-layout grid + disclaimer al final del rail cuando `ecoKey` está unlocked.

Mock pattern: `vi.spyOn(diaryKeyContext, "useDiaryKey")` con shape correcta del `DiaryKeyState` (debugging del shape descubrió: campo es `key` no `diaryKey`; no hay `isUnlocked`/`isLocked` — solo `unlocking`/`restoring`/`error`).

## Decisiones

1. **No duplicar LectorShell** — ya cubierto en Sprint 3.
2. **No probar SSE/fetch en EcoShell** — esos paths viven en ChatArea (no tested). G4 cubre el shell, no el contenido.
3. **`as never` evitado** — la firma del spy correcta acepta el shape sin casting.
4. **Snapshot del rail con `Date` real** — `EcoThreadRailItem.lastMessageAt: Date`, no string.

## Verificación

- `pnpm --filter @psico/web typecheck` ✅
- `pnpm --filter @psico/web lint` ✅
- `pnpm --filter @psico/web test` → 236/236 (+8)

## Deuda técnica abierta

- **ChatArea + ThreadRail tests** — quedaron sin coverage. SSE consumer + report modal + paginación. Sprint propio cuando los flujos se estabilicen.
- **InicioV2 con todos los branch del insightToday** (streak/mood-trend/book-progress/neutral) — actualmente solo testeo `null`. Branches de insight quedan al sprint G4b si vale la pena.
- **Mobile equivalents** — sin tests para `(tabs)/index.tsx` ni `(tabs)/eco`. Requieren mocks pesados de expo-router.

## Privacy invariant

Sprint 100% test code. Mocks no tocan cripto ni red. ADR 0007 intacto.

## Cierre del trayecto G

Con G4 mergeado, los 5 sprints del trayecto G están cerrados:

- **G1** — 44 tests UI para componentes F1/F2.
- **G2** — EmotionalMapSnapshot mensual + EvoChart serie real.
- **G2b** — HomeStats con insightsCount + patternsCount reales.
- **G2c** — ESLint override consistent-type-imports para NestJS injectables.
- **G3** — Consistency sweep screen-head para perfil/plan/notifs/security.
- **G4** — Tests UI para InicioV2 + EcoShell.
- **G-polish** — Re-trigger tour button (cierra deuda S37).

Total: 236 tests web (228 antes de G4) + 727 tests API (725 antes de polish) + EmotionalMapSnapshot persistido + bug pattern del `import type` resuelto config-side + tour replay funcional.
