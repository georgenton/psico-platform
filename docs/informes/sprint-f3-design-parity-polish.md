# Sprint F3 — Polish final de paridad visual (Inicio · Biblioteca · Eco)

**Fecha:** 2026-06-21
**Rama:** `feat/sprint-f3-design-parity-polish`
**Scope:** Inicio · Biblioteca · Eco (web)
**Tests:** 184/184 web, 34/34 crypto, 668+ API (sin cambios)

## Contexto

F1 cerró Reflexiones · Patrones · Exploraciones. F2 cerró Mapa · Evolución. F3 es el polish que termina de cerrar la paridad estructural con `docs/design/redesign-v2/dashboard/`:

| Pantalla       | Antes                                                                                                                                                                                | Después                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Inicio**     | Métricas con mapeo bogus (`weeklyGoalPct` etiquetado "Insights", `minutesThisWeek` etiquetado "Ejercicios"). Activity timeline sin chips `+ mapa` / `+ patrón`. TODO senior pending. | Métricas con etiquetas honestas (Meta semanal · Minutos de lectura). Activity rows con `a-fed` chip por tipo (`+ mapa` para diary, `+ patrón` para eco, `+ calma` para voice). |
| **Biblioteca** | Hero Tailwind sin paridad. Sin `lib-note` callout.                                                                                                                                   | `screen-head` con eb "El vehículo, no el destino" + `lib-note` lavender con la frase del diseño.                                                                               |
| **Eco**        | Tailwind header redundante ("Eco" + subtítulo) + layout con `flex gap-4`. Sin `eco-disclaimer`.                                                                                      | Sin header redundante (el title vive en el chat header del shell). `.eco-layout` 1fr-320px grid + `.eco-rail` con disclaimer al final.                                         |

## Lo que se construyó

### Inicio (`apps/web/src/components/dashboard/home/InicioV2.tsx`)

- **Métricas honestas**:
  - 1. Reflexiones → `entriesThisWeek` (label "esta semana")
  - 2. Meta semanal → `weeklyGoalPct%` (era "Insights" con mapeo bogus)
  - 3. Patrones → `recos.length`
  - 4. Minutos de lectura → `minutesThisWeek` (era "Ejercicios", removí TODO senior)
  - 5. Días seguidos → `streakDays`
- **Activity `a-fed` chip**: `ACTIVITY_FED` record mapea `ActivityFeedItemType` → `"+ mapa"|"+ comprensión"|"+ patrón"|"+ calma"`. Cada row del timeline ahora muestra el chip entre `a-meta` y `a-time`.

### Biblioteca (`apps/web/src/app/dashboard/biblioteca/page.tsx`)

- Hero Tailwind reemplazado por `.screen-head` con eb eyebrow + `.lib-note` callout lavender con SVG de estrella inline y la copy del diseño.

### Eco (`apps/web/src/app/dashboard/eco/page.tsx` + `apps/web/src/components/dashboard/eco/EcoShell.tsx`)

- Página `/dashboard/eco` ya no envuelve `EcoShell` en su propio `<header>` Tailwind. Renderiza directo, mismo patrón que el design.
- `EcoShell` reemplaza `<div className="flex gap-4 sm:gap-6">` por `<div className="eco-layout">` (grid 1fr 320px del diseño).
- Chat takes col-1; `.eco-rail` envuelve `ThreadRail` + nuevo `EcoDisclaimer` component al final.
- `EcoDisclaimer` renderiza `.eco-disclaimer` con SVG lock + copy del diseño ("Eco es un acompañante de autoconocimiento — complementa, no reemplaza, la terapia profesional").

## Decisiones

1. **No nuevo backend**. Las métricas honestas usan campos que ya existen en `HomeStats`. Cuando aparezcan contadores reales para insights/exercises/patterns, swap a esos sin tocar el layout.
2. **`a-fed` micro-chip**. El diseño tiene `+ mapa`, `+ patrón`, `+ calma`. Mapping fijo por `ActivityFeedItemType` — no requiere data nueva del backend.
3. **Eco header out**. El design no tiene H1 fuera del chat — el `.eco-chead` (avatar + "Eco" + "Construyendo tu mapa") cumple ese rol. Quitarlo evita duplicación.
4. **ThreadRail dentro de `.eco-rail`**. ThreadRail mantiene su Tailwind interno (`hidden sm:block w-64`); solo lo wrappeo en `.eco-rail` (sticky + flex column) y agrego el disclaimer abajo. Sin refactor profundo de ThreadRail.
5. **Sin tests UI para los cambios**. Son ediciones de copy y wrappers de className — el typecheck + lint + tests existentes los cubren. Tests con RTL llegan cuando F1+F2+F3 acumulen suficiente para amortizar setup.

## Verificación

- `pnpm --filter @psico/web typecheck` ✅
- `pnpm --filter @psico/web lint` ✅
- `pnpm --filter @psico/web test` → 184/184
- `pnpm --filter @psico/api-client generate:check` ✅
- API + crypto: sin cambios.

## Deuda técnica abierta

- **Contadores reales en HomeStats**: `insightsCount`, `patternsCount`, `exercisesCount`. Hoy las etiquetas son honestas pero podríamos sumar más cifras genuinas.
- **Eco children con design classes**: `ChatArea` + `ThreadRail` siguen con Tailwind interno. Refactor mayor; el shell ya está alineado.
- **Mood checkin card en Inicio**. El diseño tiene `.mood-checkin` arriba; en B6b se decidió moverlo al topbar (MoodChip). Decisión vigente — no se restaura.
- **Tests UI dedicados para InicioV2** (metric mapping + activity chips). Diferidos al sprint de UI tests que acumulará F1+F2+F3.

## Privacy invariant

Sprint 100% presentational (sin tocar backend). ADR 0007 intacto. Los datos vienen de `/home` y `/activity` que ya respetan los gates de privacidad.

## Cierre del trayecto F

Con F3 mergeado, las 8 pantallas internas del dashboard (Inicio · Mapa · Evolución · Patrones · Reflexiones · Exploraciones · Biblioteca · Eco) están estructuralmente alineadas con `docs/design/redesign-v2/dashboard/`. Quedan refinamientos de copy y polish menor pero el armado HTML/CSS es paridad.
