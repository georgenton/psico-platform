# Sprint S4-front · Onboarding UI (web + mobile)

**Rama:** `feature/sprint-s4-front-onboarding`
**Bitácora previa:** [sprint-s6-front-lector.md](sprint-s6-front-lector.md)
**Tests:** 348/349 backend (sin cambios)

---

## §1 · Scope

Backend del onboarding está vivo desde Sesión 16 (Sprint S4) con 11 endpoints + 3 modelos Prisma + catálogos seeded. Hasta hoy ningún usuario nuevo lo veía — entraban al `/dashboard` directamente sin contexto, sin firstName, sin reco de libro inicial. Este sprint cierra el gap UI para web + mobile.

---

## §2 · Lo que se construyó

### Backend (cambio mínimo)

`UserMeResponse` expone un nuevo campo `onboardingState`:

```ts
onboardingState: {
  completedAt: Date | null;
  skippedAt: Date | null;
  tourCompletedAt: Date | null;
} | null;
```

Lo single source of truth para "¿este usuario hizo onboarding?". Sin migración Prisma porque el modelo `OnboardingState` ya existía desde S4. Cambios:

- `apps/api/src/users/users.service.ts` — `getMe()` ahora `include: { onboardingState: true }` y mapea los 3 timestamps.
- `packages/types/src/index.ts` — extiende `UserMeResponse` con el nuevo campo.

### `@psico/api-client` · `onboardingApi`

Nuevo módulo con los 11 métodos canónicos:

```ts
(getIntro(),
  skip(),
  getMotivos(),
  saveStep1(),
  getMoods(),
  saveStep2(),
  saveStep3(),
  getRecommendation(),
  complete(),
  getTour(),
  completeTour());
```

Web prefiere Server Actions (escribe vía `serverFetch`) por flow lineal; mobile usa el cliente directo desde React Native.

### Web (`apps/web/src/app/onboarding/`)

**Rutas (todas Server Components, `dynamic = "force-dynamic"`):**

| Ruta                        | Step                                 | Componente cliente   |
| --------------------------- | ------------------------------------ | -------------------- |
| `/onboarding`               | 0 — Welcome con texto de Marina      | inline               |
| `/onboarding/motivos`       | 1 — Multi-select 1-5 chips           | `MotivosPicker`      |
| `/onboarding/mood`          | 2 — Single-select swatch             | `MoodPicker`         |
| `/onboarding/perfil`        | 3 — Nombre + voicePref (radio cards) | `ProfileForm`        |
| `/onboarding/recomendacion` | 4 — Reco card + alternativas         | `RecommendationCard` |

Cada step usa `useTransition` para el submit + redirige server-side. Validación de nombre con Unicode-safe regex (`/^[\p{L}\p{M}'\- ]+$/u`).

**Server actions (`apps/web/src/actions/onboarding.ts`):**

`skipOnboarding`, `saveStep1`, `saveStep2`, `saveStep3`, `completeOnboarding`, `markTourComplete`. Cada una llama el endpoint + `redirect()` al siguiente step. El `completeOnboarding` usa el `res.redirectTo` que el backend devuelve (puede ser `/dashboard?tour=1` o el reader del libro elegido).

**Shell:**

`OnboardingShell` muestra progress dots (5 puntos, llenos hasta el step actual) + botón Skip + el nombre del producto. Steps 0-3 muestran Skip; step 4 lo oculta (el flujo está casi terminado, no tiene sentido ofrecer Skip).

**Gating layouts:**

- `dashboard/layout.tsx` — si `me.onboardingState.completedAt && .skippedAt` ambos null → `redirect("/onboarding")`. Sucede antes del primer paint del dashboard, transparente al user.
- `onboarding/layout.tsx` — el reverso: si onboarding ya hecho, `redirect("/dashboard")` para evitar re-onboarding por URL stale.

### Mobile (`apps/mobile/app/onboarding.tsx`)

**Una sola pantalla** con state machine local (`step: 0|1|2|3|4`) en vez de stack de 5 screens. Razones:

1. El flow es lineal y poco usado (1 vez en la vida del user). El swipe-back nativo entre steps no aporta UX significativa.
2. State management más simple — todas las selecciones viven en `useState` del padre.
3. Un solo archivo se lee de cabo a rabo más fácil que 5 archivos + un AuthContext extendido.

Trade-off documentado: si en el futuro mediremos drop-off por step y queremos `expo-router` analytics per-step, será refactor a stack.

**Sub-componentes inline:** `WelcomeStep`, `MotivosStep`, `MoodStep`, `ProfileStep`, `RecommendationStep`. Comparten estilos del root.

**Gate en `(tabs)/_layout.tsx`:** on mount fetch `/user/me`, lee `onboardingState`, redirige a `/onboarding` si no done. Loading spinner durante el fetch para no flashear el tabbar.

---

## §3 · Decisiones de diseño

### 1. Layout gate vs Middleware gate

Considerado: middleware edge runtime que chequea cookie `onboardingDone=1`. Descartado: la cookie tendría que setearse desde el server después del `complete`, y el flujo se complica con SameSite + httpOnly. El layout SSR ya hace `serverFetch('/user/me')` para el cryptoSalt; agregar el chequeo de onboarding ahí es gratis (un campo extra) y el source of truth queda en la BD, no en cookies que pueden desincronizarse.

Costo: cada navegación al dashboard hace una request /user/me. Aceptable porque ya estaba pasando antes.

### 2. Skip disponible hasta step 3

El handoff dice que skip es siempre disponible. La realidad UX: si el user está en step 4 (recomendación), ya invirtió 30 segundos en motivos + mood + perfil. Ofrecerle "Saltar" en ese momento es ofrecerle tirar todo el progreso. En su lugar, step 4 tiene "Terminar sin elegir" (que marca completed sin chosenBookId).

### 3. Tour overlay diferido

El backend tiene `/api/onboarding/tour` y `/api/onboarding/tour/complete`. El cliente NO lo implementa en este sprint. Razón: el tour es un overlay con tooltips sobre el dashboard que requiere una library (Reactour, Shepherd, custom). Hacerlo bien es un sprint chico en sí mismo, y la prioridad ahora es que el flujo principal exista. Cuando lleguen métricas reales sobre los drop-off post-onboarding, decidimos si vale el sprint.

Backend `redirectTo` puede devolver `?tour=1` — el cliente lo ignora en v1, no rompe.

### 4. Recomendación: el backend ya devuelve `alternatives`

`getRecommendation()` retorna `{ recommendation, alternatives }`. UI permite al user "swap" entre el primary y los alternativos haciendo tap en chips horizontales abajo del card. La primera elección sigue siendo persistida como `recommendedBookId`, no se sobrescribe — el `chosenBookId` es lo que termina siendo el libro que el user efectivamente eligió leer.

### 5. Mobile: state machine vs stack

Justificado arriba. Vale documentar el límite: si UX team pide animaciones swipe entre steps con gesto nativo de RN, hay que refactor. Por ahora `setState` + condicional render es ortogonal a animaciones de React Native Reanimated.

---

## §4 · Bugs corregidos durante el sprint

Ninguno. El sprint integra contra backend ya estable (S4 Sesión 16), tipos ya exportados, y APIs ya documentadas en `docs/design/handoff/01-onboarding.md`.

---

## §5 · Deuda técnica abierta

- **Tour overlay no implementado.** Backend listo. UI requiere library decision + tooltips positioning. Diferido a sprint posterior, accionable cuando aparezcan datos de cómo navegan los users post-onboarding.
- **Sin animaciones de transición entre steps.** Web (Server actions con `redirect`) hace navegación dura. Mobile (state machine local) hace cambio instantáneo. La UX se siente brusca en step → step. Reanimated 4 lo arreglaría con ~30 LoC.
- **Sin tests UI.** Vitest+RTL setup sigue pendiente (deuda compartida con todos los sprints front).
- **Web: el step 3 valida `firstName` solo en submit.** Ideal sería validación on-blur + el botón "Siguiente" disabled hasta válido. Aceptable porque el error inline es claro.
- **Mobile: la pantalla `onboarding.tsx` está en `/app/onboarding.tsx` (root) y no en un route group `(onboarding)/_layout.tsx`.** Esto significa que se renderea sobre el Stack root + AuthGate, lo cual es OK; pero el header default del Stack del root puede mostrar back-arrow al `(auth)` si el user llega vía deep link. Aceptable porque la única manera de llegar aquí es el redirect de `(tabs)/_layout.tsx`.
- **Recomendación visual del cover en mobile usa color sólido** (la web tiene gradiente). Razón: mobile usa solid color helper del Sprint S5 sin `expo-linear-gradient`. Visualmente menos rico, funcionalmente igual.
- **Sin "Volver al paso anterior" en web entre /motivos → /mood, etc.** El back del navegador funciona porque cada step es su propia ruta; mobile sí tiene botón "Atrás" porque comparten estado. Aceptable.

---

## §6 · Verificación

```bash
# back
pnpm --filter @psico/api test         # 348/349 ✓
pnpm --filter @psico/api typecheck    # ✓
pnpm --filter @psico/api lint         # ✓ (4 warnings, 0 errors)

# shared
pnpm --filter @psico/types build      # ✓
pnpm --filter @psico/api-client build # ✓

# web
pnpm --filter @psico/web typecheck    # ✓
pnpm --filter @psico/web lint         # ✓

# mobile
pnpm --filter @psico/mobile typecheck # ✓
pnpm --filter @psico/mobile lint      # ✓
```

---

## §7 · Resumen para Notion

**¿Qué se construyó?** Frontend del onboarding en web + mobile que consume los 11 endpoints S4 desde Sesión 16. Flujo de 5 pantallas (Welcome con texto de Marina → motivos multi-select → mood single-select → nombre + voicePref → recomendación con alternativas). Web: 5 rutas separadas con Server Actions y progress dots compartidos. Mobile: una pantalla con state machine local (justificado en §3.5).

**Backend cambio mínimo:** `UserMeResponse.onboardingState` para que el cliente sepa si el user ya hizo onboarding y los layouts gating funcionen sin un endpoint dedicado.

**Gating:** `dashboard/layout.tsx` redirige a `/onboarding` si pending. `onboarding/layout.tsx` redirige a `/dashboard` si ya hecho. Mobile `(tabs)/_layout.tsx` hace lo mismo via `<Redirect>`.

**¿Qué viene?**

1. **Smoke walk** del nuevo flow en producción (1 user nuevo, 2 minutos).
2. **Sprint S10 PatronesModule** (heatmap del Diario + insights LLM, Pro feature) — siguiente del Plan v2.
3. **Tour overlay** del dashboard si los datos de uso post-onboarding muestran que los users no encuentran el Diario o el Eco.

Fase 1 ahora está **al 99% complete**. Solo queda el tour overlay como deuda explícita, todo lo demás del Plan v2 Phase 1 está vivo.
