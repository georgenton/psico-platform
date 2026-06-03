# Sprint S37 — Tour overlay onboarding (cierre paso 5)

**Rama sugerida:** `feature/sprint-37-tour`
**Tests:** 356/357 API + 34/34 crypto (sin cambios — sprint UI/UX).
**Backend used:** endpoints `GET /api/onboarding/tour` y `POST /api/onboarding/tour/complete` ya existentes desde Sprint S4 (Sesión 16).
**Design ref:** [`docs/design/handoff/01-onboarding.md` §Tour de la app](../design/handoff/01-onboarding.md).

---

## 1. Scope

Cierra el último frente de Phase 1 onboarding: el **overlay del tour** que aparece después de completar el flow de 4 pasos. Hasta hoy `tourCompletedAt` siempre vivía en `null` en producción — el backend tenía los endpoints y el catálogo de steps, pero ningún cliente los montaba.

Sin cambios al contrato HTTP. El único cambio backend es **catálogo**: añadir Patrones como step 5 (post-S35).

---

## 2. Decisiones

1. **Tour solo dispara para users que completaron onboarding** (`completedAt && !tourCompletedAt`). Quien hizo `skip` del onboarding NO ve el tour — opt-out claro.
2. **`showTour` se decide a nivel de layout** (no por componente). Single source of truth en `dashboard/layout.tsx` (web) y `(tabs)/_layout.tsx` (mobile). Eso evita race conditions y permite mostrarlo una sola vez por sesión.
3. **Persistencia vía `tourCompletedAt` en server**, no localStorage. Decisión multi-device: si el user empieza el tour en mobile y termina en web, el server arbitra. Y nos da analytics gratis (`tourStepsCompleted` para funnel en Pulso v2).
4. **Web usa spotlight + coachmark**; **mobile usa modal centrado**. En web la nav está al lado, el spotlight funciona; en mobile los tabs están abajo y el target sería invisible — modal centrado es más honesto.
5. **`Saltar` y `Terminar` ambos POSTean `/tour/complete`**, lo que cambia es el `stepsCompleted`. Saltar reporta cuántos vio antes de abandonar; Terminar reporta `steps.length`. Útil para entender drop-off por step.
6. **Click fuera del coachmark (web) = saltar**. Conservador: dismissal explícito sin coste cognitivo.
7. **Patrones añadido como step 5 (post-S35)**. La página ya existe en la nav; el tour debe explicarla.

---

## 3. Cambios

### Backend

- `apps/api/src/onboarding/constants.ts` — agregado step 5 `target: "patrones"` al array `TOUR_STEPS`. Sin migración (el catálogo vive in-process).

### Web

- `apps/web/src/app/dashboard/_DashboardShell.tsx`:
  - Extendido `NAV_ITEMS` con `tourTarget: "inicio" | "biblioteca" | "diario" | "eco" | "patrones" | null`.
  - Cada `<Link>` lleva `data-tour-target={item.tourTarget ?? undefined}` para que el overlay encuentre el DOM node.
  - Nueva prop `showTour: boolean`; cuando es `true` monta `<TourOverlay />` al final del shell.
- `apps/web/src/app/dashboard/_TourOverlay.tsx` — **nuevo**. Client Component:
  - Fetch del catálogo vía `onboardingApi.getTour()` on mount.
  - State machine: `stepIdx`, `targetRect`, `dismissed`.
  - DOM query `[data-tour-target="..."]` + `getBoundingClientRect` para anclar el spotlight.
  - Resize listener recomputa `targetRect`.
  - Botones Saltar / Anterior / Siguiente / Terminar.
  - Click backdrop = Saltar.
  - POST `completeTour({ stepsCompleted })` en cierre, swallow on error.
- `apps/web/src/app/dashboard/layout.tsx`:
  - Computa `showTour = Boolean(onboarding?.completedAt && !onboarding?.tourCompletedAt)` server-side.
  - Pasa a `<DashboardShell showTour={...}>`.

### Mobile

- `apps/mobile/app/(tabs)/_layout.tsx`:
  - Extiende `useEffect` para extraer `tourCompletedAt`.
  - Nuevo state `showTour: boolean`.
  - Mount `<TourOverlay onClose={() => setShowTour(false)} />` post-Tabs cuando aplica.
- `apps/mobile/src/components/TourOverlay.tsx` — **nuevo**. RN `Modal` con backdrop + card centrado:
  - Mismo state machine que web.
  - Saltar / Anterior / Siguiente / Terminar.
  - POST a `completeTour` igual.
  - No intenta highlight de tabs (decisión §2.4).

---

## 4. Verificación

- API tests: **356/356** + 1 skipped sentinel (sin cambios).
- @psico/crypto: 34/34.
- Web typecheck + lint: clean.
- Mobile typecheck + lint: clean.
- OpenAPI `generate:check`: in sync (no shape changes).

---

## 5. Deuda técnica abierta

- **Mobile no highlightea tabs.** Decisión de scope — el highlight requeriría `expo-blur` + position absolute calculada desde `useTabBarHeight()`. Si feedback dice que el tour mobile se siente desconectado, hacerlo en sprint corto.
- **Sin animación entre steps.** El step change es instantáneo. Cuando esté el motion library RN (Reanimated), añadir un cross-fade.
- **No vuelve a aparecer.** Si el user lo cierra accidentalmente, `tourCompletedAt` queda seteado y no hay forma de re-disparar. Tal vez añadir un botón "Volver a ver el tour" en `/dashboard/security` o equivalente — pero es nicho.
- **`tourStepsCompleted` no se surface en ningún dashboard todavía**. Cuando Pulso v2 aterrice, esta métrica abre el primer panel de funnel post-onboarding.
- **El tour es por user, no por device.** Si el user instala el app móvil después de haber hecho el tour en web, no lo ve. Aceptable por v1 — el flow del onboarding completo en mobile aparte da suficiente contexto.

---

## 6. Resumen para Notion

**Qué cerramos en Sprint S37:**

- Tour overlay web (spotlight + coachmark sobre nav items).
- Tour overlay mobile (modal centrado paridad).
- `Patrones` añadido como 5° step del catálogo.
- Persistence vía `tourCompletedAt` + `tourStepsCompleted` (server-side).
- Tests intactos: 356/356 + 34/34.

**Qué viene:**

- UI tests con Vitest + RTL (sprint propio).
- LLM-backed WeeklySummary (AIModule wire).
- Mobile pagination en Eco (si la data lo justifica).
- Bugfix #2 Stripe price IDs reales (tarea del usuario).
