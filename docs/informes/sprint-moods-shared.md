# Sprint Moods Shared — Extraer MOODS a @psico/types

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-moods-shared`
**Tests:** 609/610 API · 122/122 web · 20/20 mobile · 34/34 crypto (sin cambios — refactor)

---

## Lo que se construyó

Cierra deuda histórica acumulada en sprints S5/S6/S10/Diary-edit-meta y demás: el catálogo de moods estaba duplicado en **6 archivos** entre web y mobile. Hoy queda en `@psico/types` como single source of truth.

### Auditoría inicial

Dos sets conceptualmente distintos:

- **Diary moods** — 4 lugares, shape `{ id, emoji, label }`, 7 entries (calma/foco/energia/reflexion/alegria/ansiedad/tristeza).
- **Therapy moods** — 2 lugares, shape `{ id, label }` (emoji embedded en label), 5 entries (calmo/ansioso/triste/energico/cansado).

Conservados separados — no mezcla — porque el Diario tiene granularidad rica de journaling y Terapia es check-in post-sesión.

### Cambios

**`packages/types/src/index.ts`:**

- `DiaryMoodOption` interface + `DIARY_MOODS: readonly DiaryMoodOption[]`.
- `DiaryMoodId = (typeof DIARY_MOODS)[number]["id"]` — type-level enum derivado.
- `TherapyMoodOption` interface + `THERAPY_MOODS: readonly TherapyMoodOption[]`.
- `TherapyMoodId` análogo.

**Web (3 archivos):**

- `apps/web/src/components/dashboard/diario/ActiveComposer.tsx` — local const removed.
- `apps/web/src/components/dashboard/diario/EntryDetailView.tsx` — local const removed.
- `apps/web/src/components/dashboard/terapia/SessionDetailShell.tsx` — local const removed.

**Mobile (3 archivos):**

- `apps/mobile/app/(tabs)/diario/index.tsx` — local const removed.
- `apps/mobile/app/(tabs)/diario/[id].tsx` — local const removed.
- `apps/mobile/app/(tabs)/terapia/sesiones/[id].tsx` — local const removed.

Cada uno ahora importa `DIARY_MOODS` o `THERAPY_MOODS` de `@psico/types` y opcionalmente re-asigna a `const MOODS = DIARY_MOODS` para mantener identifier names locales sin diff visual.

---

## Decisiones

1. **Dos sets separados, no merge** — Diario tiene 7 moods con emoji standalone (visible como chip); Terapia tiene 5 con emoji en el label (one-line list). IDs y shapes distintos. Mezclar habría requerido normalizar ambos lados y romper el wire format.
2. **`@psico/types` runtime export, no `@psico/shared-constants` package** — tsup ya compila tanto `.d.ts` como `.mjs`/`.js`. Los constants viajan como valores runtime. Crear un package nuevo es overhead innecesario.
3. **`readonly` + `as const`** — el cliente nunca debe mutar el catálogo. TS lo enforce.
4. **`DiaryMoodId`/`TherapyMoodId` derivados** — type-level enums sin pagar costo de runtime enum. Se pueden usar para narrowing en futuras DTOs.
5. **Backend DTOs no cambian** — la columna `mood` en Prisma es `String` libre. Los IDs son convención compartida entre Onboarding seed + clientes. Si quisiéramos enforce a backend-level, sería migrar a `enum` Prisma — fuera de scope.
6. **Mantener `const MOODS = DIARY_MOODS` local** en cada archivo — keep identifier consistency con el código existente. Menos diff visual, mismo comportamiento.

---

## Privacy

- Sin cambios. Los IDs de mood son plaintext metadata desde S6 (ya viajaban así, ya están en `User.mood` plaintext en DB).
- ADR 0007 intacto.

---

## Smoke verification

- API tests **609/610** (sin cambios).
- @psico/crypto **34/34**.
- Web tests **122/122** (sin cambios).
- Mobile tests **20/20** (sin cambios).
- Typecheck + lint OK en API + web + mobile.
- OpenAPI generate:check OK (no shape changes en wire).

---

## Deuda técnica abierta

- **`@psico/types` sin runner de tests** — el package solo exporta types + 2 constants. Agregar Vitest para tests triviales (count del array, shape) sería over-engineering. Aceptable.
- **Backend no usa los constants** — `OnboardingService` carga moods de DB (catálogo seeded). Para enforce que web/mobile y DB coinciden, considerar comparar contra `OnboardingMood` seed en CI. Diferido.
- **No type-narrowing en DTOs** — `CreateDiaryEntryDto.mood: string` podría ser `DiaryMoodId`. Requiere wire-format alignment con backend; valuable pero out-of-scope.
- **TherapyMoodOption.label tiene emoji embedded** — diferente al Diario shape. UX legítima para sessions, pero si querés filtrar por emoji a futuro, refactor.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — refactor puro, sin cambios al wire.
3. Próximos sprints: **Observability (Sentry)**, **Type narrowing en DTOs Diario/Therapy**, **Backend mood enforcement en CI**.
