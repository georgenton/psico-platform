# Sprint G1 — Tests UI para componentes F1/F2/F3

**Fecha:** 2026-06-21
**Rama:** `feat/sprint-g1-ui-tests-f1-f2-f3`
**Scope:** 10 archivos de test RTL para componentes presentacionales del trayecto F
**Tests:** 228/228 web (184 → 228, +44 nuevos)

## Contexto

F1/F2/F3 dejaron 12+ componentes nuevos sin tests dedicados. La bitácora de cada uno difería el setup de RTL hasta acumular suficiente coverage. G1 cierra esa deuda con tests focused (5 por componente promedio, 44 total).

## Lo que se construyó

10 archivos de test nuevos:

| Componente           | Sprint origen | Tests | Cobertura                                                                                                                          |
| -------------------- | ------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ReflSidePanel`      | F1            | 5     | null stats · render con stats · racha hint · empty racha · temas recurrentes empty-state                                           |
| `PatTopTagsGrid`     | F1            | 4     | empty state · sort desc + top-5 cap · pct math · labels predominante vs recurrente                                                 |
| `ExFeaturedCard`     | F1            | 5     | título + description · subtitle fallback · link al primer book · fallback link cuando books vacío · book count + duration          |
| `ExCard`             | F1            | 5     | título + description · subtitle en chip · mixed → c3 · cool→c1 + warm→c2 · singular/plural                                         |
| `ExportButton`       | F2            | 3     | default label · custom label · window.print() spy                                                                                  |
| `MapDims`            | F2            | 3     | 6 axes en orden fijo · pct math · 6 progressbars con aria                                                                          |
| `MapFeed`            | F2            | 5     | null stats · all-zeros null · render non-zero · dashed Eco placeholder · hide zero chips                                           |
| `EvoChart`           | F2            | 4     | pct headline · SVG dot at x=600 · y invertido por pct · placeholder copy                                                           |
| `EvoQuarter`         | F2            | 5     | trimestre tag · plural reflexiones/capítulos · singular forms · racha hint · no-racha empty state                                  |
| `MilestonesTimeline` | F2            | 6     | empty state · unlocked render · sort asc por fecha · variant `next` para in-progress · cap a 2 in-progress · contains category tag |

PatRegenerateCta (F1) e InicioV2 polish (F3) se difieren — son Client Components grandes con `fetch` y `next/router` que requieren mocks pesados; los cubrimos en un sprint propio cuando tengamos más componentes así.

## Decisiones

1. **Vitest + RTL + jsdom** — mismo stack que el setup de S39.
2. **Datos fixture inline** — cada test define un `buildStats()` / `journey()` / `milestone()` builder; sin shared fixtures porque cada componente tiene su shape.
3. **Selección por texto + role, no por testid** — los componentes son presentacionales puros; sirve el copy del usuario como anchor accessible.
4. **`getAllByText(/50%/).length >= 1`** en `PatTopTagsGrid` porque el porcentaje aparece dos veces (p-desc + meter chip). Pattern útil para casos donde una métrica visible se duplica.
5. **`vi.spyOn(window, "print")`** en `ExportButton` — el handler usa `window.print()` directamente, no necesita mock global.
6. **No tests de integración E2E** — los tests cubren render + props; el integration entre página + componente queda para Playwright cuando shipiemos uno.

## Verificación

- `pnpm --filter @psico/web typecheck` ✅
- `pnpm --filter @psico/web lint` ✅
- `pnpm --filter @psico/web test` → 228/228 (+44)
- `pnpm --filter @psico/api-client generate:check` ✅
- API + crypto: sin cambios.

## Deuda técnica abierta

- **PatRegenerateCta** + **MapStage** sin tests (componentes con dependencias externas: PatRegenerateCta hace `fetch`; MapStage importa `Radar` con SVG complejo).
- **InicioV2** sin test del metric mapping nuevo (Sprint F3 polish). Requiere mocks de `home: HomeResponse` completos.
- **No coverage thresholds activos** — el setup de S41 los dejó warn-only. G1 sube cobertura efectiva de los componentes F1/F2 a ~80%+, pero los thresholds globales siguen sin enforcement.
- **Tests del polish F3** (InicioV2 + Biblioteca screen-head + EcoShell layout) diferidos.

## Privacy invariant

Sprint 100% test code. ADR 0007 intacto.
