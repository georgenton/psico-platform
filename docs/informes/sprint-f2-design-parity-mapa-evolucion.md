# Sprint F2 — Paridad visual con Claude Design en Mapa + Evolución

**Fecha:** 2026-06-21
**Rama:** `feat/sprint-f2-design-parity-mapa-evolucion`
**Scope:** Mapa Emocional · Mi Evolución (web)
**Tests:** 184/184 web, 34/34 crypto, 668+ API (sin cambios)

## Contexto

Sprint F1 cerró Reflexiones · Patrones · Exploraciones. F2 termina la paridad estructural con `docs/design/redesign-v2/dashboard/` en las dos pantallas que quedaban con header genérico (`greet-*` en lugar de `screen-head`): **Mapa Emocional** y **Mi Evolución**.

Las dos comparten el patrón `screen-head` con eb eyebrow + botón Exportar a la derecha, así que F2 incluye un Client Component compartido (`ExportButton`) y los componentes específicos de cada pantalla.

| Pantalla           | Antes                                                                                                                                               | Después                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mapa Emocional** | `greet-eyebrow` + `greet`, `.card.insight` con radar a la izquierda y % a la derecha, `AxisBreakdown` con 6 tarjetas grandes. Sin export, sin feed. | `screen-head` + Exportar + `.map-grid` 2-col: `.map-stage` (dark gradient + radar + ms-score) + `.map-dims` (6 axis rows) + `.map-feed` con `.feed-chips`. |
| **Mi Evolución**   | `greet-eyebrow` + `greet`, `StatsGrid` + `MilestonesList`. Sin export.                                                                              | `screen-head` + Exportar + `.evo-top` 2-col (`.evo-chart` snapshot SVG + `.evo-quarter` highlights) + `.tl` timeline de milestones.                        |

## Lo que se construyó

### Componentes nuevos

- `apps/web/src/components/dashboard/shell/ExportButton.tsx` — Client Component compartido. `window.print()` deja al usuario guardar la vista como PDF nativo del browser.
- `apps/web/src/components/dashboard/mapa/MapStage.tsx` — `.map-stage` dark gradient con Radar + ms-score (`pct` + provider).
- `apps/web/src/components/dashboard/mapa/MapDims.tsx` — `.map-dims` con 6 `.dim` rows (icon + axis name + valor % + bar). Trend chip queda `flat` hasta tener historicals.
- `apps/web/src/components/dashboard/mapa/MapFeed.tsx` — `.map-feed` con `.feed-chips` derivados de `EvolucionStats`. Solo renderiza chips con count > 0, oculto entero si no hay data.
- `apps/web/src/components/dashboard/evolucion/EvoChart.tsx` — `.card.evo-chart` con SVG single-dot (snapshot actual) + copy honesto explicando que se va a llenar con tiempo.
- `apps/web/src/components/dashboard/evolucion/EvoQuarter.tsx` — `.card.evo-quarter` con 3 rows derivados de `EvolucionStats` (reflexiones, capítulos, racha actual/mejor).
- `apps/web/src/components/dashboard/evolucion/MilestonesTimeline.tsx` — `.tl` timeline con `.tl-item` por milestone. Ordenados: unlocked primero (por fecha), in-progress al final con variant `next` (dot dashed + label "Próximo paso").

### Páginas reescritas

- `apps/web/src/app/dashboard/mapa/page.tsx` — Server Component con `Promise.allSettled([/home, /evolucion])`. Layout: `screen-head` + `map-grid` + `map-feed`.
- `apps/web/src/app/dashboard/evolucion/page.tsx` — Server Component con `Promise.allSettled([/evolucion, /home])`. Layout: `screen-head` + `evo-top` + `MilestonesTimeline`.

### Limpieza

- Eliminado `apps/web/src/components/dashboard/mapa/AxisBreakdown.tsx` — reemplazado por `MapDims` que sí cumple design parity (era un grid de 2x3 cards, ahora son rows compactas con bar al estilo del design).
- Eliminado `apps/web/src/components/dashboard/evolucion/StatsGrid.tsx` y `MilestonesList.tsx` — reemplazados por `EvoQuarter` + `MilestonesTimeline`. No tenían tests (los `StatsGrid` con tests son los de `home/` y `perfil/`, distintos).

## Decisiones de diseño

1. **`ExportButton` con `window.print()` en lugar de un endpoint nuevo.** El browser ya hace el trabajo pesado (imprime a PDF) y la vista es printable-friendly. Endpoint dedicado de export PDF se agrega cuando un user real lo pida.
2. **`MapDims.d-trend` queda en `flat`.** El diseño muestra "+8%", "+18%" como deltas, pero no tenemos historicals del emotional map. Surface el % actual como honesto sustituto hasta que el backend snap-shot mensual exista.
3. **`MapFeed` filtra chips con count = 0.** User nuevo no ve un row de ceros; los chips emergen cuando hay actividad real. El chip de "Conversaciones con Eco" queda visible pero `opacity: 0.55` con `—` y tooltip "próximamente cuando exista el contador agregado" — comunica el roadmap.
4. **`EvoChart` con single-dot.** Sin historicals reales prefiero mostrar el snapshot actual con copy claro ("Cuando acumules más meses…") en lugar de fabricar datos. Cuando el backend agregue `EmotionalMapSnapshot` mensual, esto se llena solo.
5. **`EvoQuarter` con 3 rows derivados de `EvolucionStats`.** El diseño muestra "3 patrones nuevos · 17 insights · +18% autocompasión" pero esos no existen hoy. Mejor cifras honestas (reflexiones · capítulos · racha) que se mueven con la actividad real del user.
6. **`MilestonesTimeline` alterna sage en filas impares.** Mirror del design (tl-item normal/sage en zigzag). In-progress queda al final con dashed dot.

## Verificación

- `pnpm --filter @psico/web typecheck` ✅
- `pnpm --filter @psico/web lint` ✅
- `pnpm --filter @psico/web test` → 184/184
- `pnpm --filter @psico/api-client generate:check` ✅
- Backend + crypto: sin cambios (sprint web-only).

## Deuda técnica abierta

- **F3** queda como sprint posterior: Inicio copy polish · Biblioteca intro note · Eco layout polish.
- **EmotionalMapSnapshot mensual.** Tabla + cron + extensión de `HomeService` para devolver `series: { month, pct }[]` permitiría llenar la línea real en `EvoChart`. Sin tests UI dedicados para los componentes F2 — mismo argumento que F1: estructurales + integrados con páginas server-rendered. RTL llega cuando tengamos un sprint dedicado.
- **`map-feed` "Conversaciones con Eco"** sigue con dash. Cuando aparezca un counter (probablemente en `EvolucionStats`), wire el número.
- **`EvoQuarter` no muestra el campo `+18% autocompasión`** del design — requiere mes-anterior vs mes-actual para cada eje del emotional map. Mismo gating que el chart.
- **`ExportButton` sin telemetría.** Si vale la pena saber qué % de users lo usa, agregar evento PostHog `pulso:export-clicked`.

## Privacy invariant

Sprint F2 es 100% presentational (sin tocar backend). ADR 0007 intacto. Los datos vienen de `/home` (cached emotional map) y `/evolucion` (stats + milestones) que ya respetan los gates de privacidad.
