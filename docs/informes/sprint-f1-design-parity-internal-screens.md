# Sprint F1 — Paridad visual con Claude Design en pantallas internas

**Fecha:** 2026-06-21
**Rama:** `feat/sprint-f1-design-parity-internal-screens`
**Scope:** Reflexiones · Patrones · Exploraciones (web)
**Tests:** 184/184 web, 34/34 crypto, 668+ API (sin cambios)

## Contexto

Las últimas iteraciones (B6a/B6b/B6c, Sprint D, Sprint E1, Sprint E2) cerraron el shell del dashboard y dos pantallas (Inicio, Mapa). Una auditoría sistemática vs `docs/design/redesign-v2/dashboard/` identificó 21+ gaps de paridad visual en las pantallas internas — la copy estaba bien, pero el armado HTML/CSS divergía.

Sprint F1 alinea **estructuralmente** tres pantallas con prioridad alta:

| Pantalla          | Antes                                                                                      | Después                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Reflexiones**   | Una sola columna con DiarioShell apilado a un placeholder. Sin `screen-head` ni sidepanel. | `screen-head` + `screen-sub` + `.refl-grid` 2-col: DiarioShell a la izquierda + `.refl-side` con stats reales a la derecha.       |
| **Patrones**      | Header propio en Tailwind, sin toolbar, weekly summary como Card aparte.                   | `screen-head` con `eb` eyebrow + `pat-toolbar` de 6 chips + `pat-grid` con `.card.pat-wide` (insight) y 5 `.card.pat` (top tags). |
| **Exploraciones** | Tailwind grid con JourneyCard "ancho".                                                     | `screen-head` + `screen-sub` + `.card.ex-feature` (featured) + `.sec-label` + `.explore-grid` con `.card.ex-card`.                |

## Lo que se construyó

### Componentes nuevos

- `apps/web/src/components/dashboard/diario/ReflSidePanel.tsx` — sidepanel server-component que renderiza dos `.card.rs-card` (Tu mes en reflexiones · Temas recurrentes). Consume `EvolucionStats` (Sprint E1) directamente, con empty state cuando el fetch falla.
- `apps/web/src/components/dashboard/patrones/PatTopTagsGrid.tsx` — renderiza top-5 `.card.pat` desde `PatronesResponse.themes` con icon + count + porcentaje + bar.
- `apps/web/src/components/dashboard/patrones/PatRegenerateCta.tsx` — Client Component con el `.pw-cta` button para regenerar el weekly summary directamente desde el insight pat-wide.
- `apps/web/src/components/dashboard/exploraciones/ExFeaturedCard.tsx` — `.card.ex-feature` con cover lavanda + body + footer con CTA "Empezar →". Toma la primera journey como featured.
- `apps/web/src/components/dashboard/exploraciones/ExCard.tsx` — `.card.ex-card` para el grid. Mapea `coverToken: "cool"|"warm"|"mixed"` → `c1`/`c2`/`c3` del design.

### Páginas reescritas

- `apps/web/src/app/dashboard/reflexiones/page.tsx` — Server Component con cuatro fetches paralelos (entries, prompt, me, evolucion). Layout: `screen-head` + `.refl-grid` con DiarioShell + ReflSidePanel.
- `apps/web/src/app/dashboard/patrones/page.tsx` — Reescrito con `ScreenHead` + `Toolbar` + `pat-grid` con `card.pat-wide` (insight) y `PatTopTagsGrid`. Period tabs como chips del design (`30 días`/`90 días`/`1 año`).
- `apps/web/src/app/dashboard/exploraciones/page.tsx` — Reescrito con `screen-head` + featured + `sec-label` + `explore-grid`.

### Limpieza

- Eliminado `JourneyCard.tsx` + `JourneyCard.test.tsx` (5 tests). Reemplazados por ExCard/ExFeaturedCard que sí cumplen design parity. Por instrucciones del CLAUDE.md ("If you are certain that something is unused, you can delete it completely"), sin alias deprecated.

## Decisiones de diseño

1. **CSS classes ya estaban en `dashboard-design.css`.** Las 30+ clases (`.refl-grid`, `.refl-side`, `.rs-card`, `.pat-toolbar`, `.pat-grid`, `.pat-wide`, `.ex-feature`, `.explore-grid`, `.ex-card`, etc.) fueron portadas en Sprint B2. F1 solo wirea los componentes a esa CSS.
2. **No fake-progress en ex-feature.** El design muestra una progress bar con "40% completado". No tenemos tracking de progreso por journey todavía, así que el bar queda en 0% y el label dice "N libros · M horas" en su lugar. Honesto en lugar de fake.
3. **6 chips de toolbar en Patrones, solo "Todos" activo.** Los otros 5 quedan disabled con tooltip "Próximamente". Comunica el roadmap sin engañar al user.
4. **ReflSidePanel reusa `EvolucionStats` de Sprint E1.** Sin endpoint nuevo. El sidepanel ya tiene data real (días activos en 30d, rachas), y dejamos "Temas recurrentes" como empty-state copy hasta que tengamos clustering real.
5. **PatTopTagsGrid usa `themes` no `topTags`.** `PatronesMoodMapDay.topTags` no existe; `PatronesResponse.themes` sí (id, label, count). Ese campo backend ya existía desde Sprint S35.

## Verificación

- `pnpm --filter @psico/web typecheck` ✅
- `pnpm --filter @psico/web lint` ✅
- `pnpm --filter @psico/web test` → 184/184
- `pnpm --filter @psico/api-client generate:check` ✅
- API + crypto tests: sin cambios (sprint web-only).

## Deuda técnica abierta

- **F2** queda como sprint siguiente: Mapa feed-chips + grid · Evolución screen-head + quarterly card + export.
- **F3** queda como sprint posterior: Inicio copy polish · Biblioteca intro note · Eco layout polish.
- Sin tests UI dedicados para los componentes F1 (ReflSidePanel, PatTopTagsGrid, ExCard, ExFeaturedCard). El typecheck + lint + integración con páginas server-rendered los cubre estructuralmente; tests con RTL llegan en un sprint propio cuando F2/F3 también shipean.
- "Temas recurrentes" en ReflSidePanel es empty-state hasta que tengamos clustering real desde el LLM. Cuando el endpoint devuelva temas, swap del copy al render del `.rs-theme` row.
- `ex-feature` muestra el primer journey con bar al 0% — cuando tengamos tracking de progreso (i.e. `UserJourneyProgress` schema), wire el porcentaje real.

## Privacy invariant

Sprint F1 es 100% presentational (sin tocar backend, sin nuevas surfaces de datos). ADR 0007 intacto. Los datos del sidepanel vienen de `/evolucion` que ya respeta los gates de privacidad.
