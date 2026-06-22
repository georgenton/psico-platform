# Sprint G3 — Consistency sweep para perfil/plan/notifications/security

**Fecha:** 2026-06-21
**Rama:** `feat/sprint-g3-consistency-sweep`
**Tests:** 228/228 web (sin cambios)

## Contexto

El diseño v2 cubre 8 pantallas internas (Inicio · Mapa · Evolución · Patrones · Reflexiones · Exploraciones · Biblioteca · Eco). Las cuatro pantallas de configuración (Perfil · Mi plan · Notificaciones · Seguridad) NO están en el design HTML, pero tenían cada una su propio header Tailwind (`text-[26px]`, `text-[28px]`, `text-2xl`) — inconsistentes entre sí y con las pantallas internas.

G3 aplica el patrón `screen-head` + `screen-sub` con el eb "Cuenta y privacidad" a las cuatro pantallas. No es paridad con design spec (no hay) — es coherencia interna entre todas las páginas del dashboard.

## Lo que se construyó

- `apps/web/src/app/dashboard/perfil/page.tsx` — Reemplazado `<header>` Tailwind por `screen-head` + `screen-sub`. Misma copy. También error path.
- `apps/web/src/app/dashboard/plan/page.tsx` — Misma transformación.
- `apps/web/src/app/dashboard/notifications/page.tsx` — Misma transformación + error path.
- `apps/web/src/app/dashboard/security/page.tsx` — Misma transformación.

Eb unificado: "Cuenta y privacidad". Sin tocar componentes hijos.

## Decisiones

1. **Eb "Cuenta y privacidad" para los 4**. Las pantallas son sobre la cuenta del usuario — un eyebrow común da continuidad visual sin pretender diseño donde no existe.
2. **No tocar componentes hijos**. Solo headers. El cuerpo (ProfileHeader, NotificationsForm, ChangePasswordCard, etc.) queda intacto.
3. **Error paths también swap**. Notifications + Perfil tienen un branch sin data — también lleva el screen-head.
4. **No nuevas surfaces**. Sprint mecánico, sin nueva interactividad ni endpoints.

## Verificación

- `pnpm --filter @psico/web typecheck` ✅
- `pnpm --filter @psico/web lint` ✅
- `pnpm --filter @psico/web test` → 228/228 (sin cambios)

## Deuda técnica abierta

- Mobile equivalents tienen su propio `<View>` con `Text` — no aplican el patrón web. Sweep mobile diferido (sin diseño v2 mobile para estas pantallas).
- Estos 4 headers no tienen tests UI dedicados (ni los necesitan — son markup estático).

## Privacy invariant

Sprint 100% markup. ADR 0007 intacto.

## Cierre del trayecto G

- G1 sembró tests UI de los componentes F1/F2/F3 (44 nuevos).
- G2 cerró deuda F2 — EvoChart ahora renderiza serie real cuando hay 2+ snapshots mensuales.
- G3 unificó headers de las 4 pantallas de configuración.

Con los tres sprints mergeados, el dashboard tiene paridad estructural completa con el design + tests UI básicos + el primer endpoint backend que llena un placeholder de F2 con data real.
