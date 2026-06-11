# Sprint Mood Enforcement — Seed ↔ DIARY_MOODS alignment test

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-mood-enforcement`
**Tests:** 615/616 API (+6) · 122/122 web · 20/20 mobile · 34/34 crypto

---

## Lo que se construyó

Cierra deuda explícita del sprint anterior. Después de extraer `DIARY_MOODS` a `@psico/types`, había riesgo de drift entre el catalog UI y el catalog seeded en `OnboardingMood`. Si alguien añade "calmo" al UI sin tocar el seed, el frontend muestra una opción que el backend no acepta. Hoy lo enforce a CI.

### Backend (`apps/api/src/onboarding/constants.ts`)

- Nuevo `OnboardingMoodSeed` interface + `MOOD_SEED_CATALOG: readonly OnboardingMoodSeed[]` — single source of truth para el seed.
- 7 entries con `id` + `label` (alineado con `DIARY_MOODS`) + `swatch` + `order` (SEED-only metadata para el mood picker del Inicio mobile).

### Seed (`apps/api/prisma/seed.ts`)

- Importa `MOOD_SEED_CATALOG` en lugar del array literal hardcoded.
- Cero cambios funcionales — mismas filas se upsertean.

### Test (`apps/api/src/onboarding/moods-alignment.spec.ts`)

6 tests del invariant:

1. Same count en ambos lados.
2. Same IDs en mismo orden.
3. Matching labels per id.
4. SEED `order` es 1-indexed contiguous (no gaps).
5. SEED ids son únicos.
6. SEED swatches son hex colors válidos.

Failure message dice exactamente cuál archivo editar:

> If this test fails, you forgot one side of the catalog. Update both:
>
> - SEED catalog: `apps/api/src/onboarding/constants.ts` (MOOD_SEED_CATALOG).
> - UI catalog: `packages/types/src/index.ts` (DIARY_MOODS).

### CI

El test corre automáticamente con el resto de la suite API (matched by `*.spec.ts` glob). CI workflow ya tenía split por workspace desde S41 — sin cambios.

---

## Decisiones

1. **Constants in `constants.ts`, not duplicate in seed.ts** — single import en seed; cero risk de divergencia si alguien edita una pero no la otra.
2. **Test en `src/onboarding/*.spec.ts`** — runs como unit, no requiere DB. Pure assertion sobre dos arrays in-memory.
3. **No test de `THERAPY_MOODS`** — terapia no tiene un catálogo seeded en DB (los moods se almacenan como string libre en `SessionPrep.checkInMood`). Diferido hasta que aparezca un OnboardingTherapyMood o similar.
4. **Test no enforce `emoji` ni `swatch`** — son orthogonal a la wire layer. UI puede cambiar el emoji sin tocar el seed. SEED puede cambiar el swatch sin tocar la UI.
5. **`MOOD_SEED_CATALOG` es `readonly`** — TS enforce que no se mute en runtime.

---

## Privacy

- Sin cambios. Los IDs/labels son catalog-level metadata, ya públicos vía `/api/onboarding/moods`.
- ADR 0007 intacto.

---

## Smoke verification

- API tests **615/616** (+6 nuevos).
- @psico/crypto **34/34**.
- Web tests **122/122** (sin cambios).
- Mobile tests **20/20** (sin cambios).
- Typecheck + lint OK en API.
- Seed parsea sin error (validado vía `ts-node prisma/seed.ts` — falla en DB connect, no en imports).

---

## Deuda técnica abierta

- **Sin enforcement de `OnboardingMotivo` catalog** — el seed tiene un motivos array hardcoded equivalente. Si en futuro UI consume motivos como const compartido, mismo treatment.
- **Sin test que verifique que `RECOMMENDATION_BY_MOTIVO` cubre todos los motivos del seed** — small gap, podría haber motivo sin reco.
- **Migration safety** — añadir un mood requiere: (a) editar `MOOD_SEED_CATALOG`, (b) editar `DIARY_MOODS`, (c) correr el seed en cada env. Sin migration Prisma porque el catalog vive en data, no en schema. Aceptable.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — refactor del seed + test (no toca runtime).
3. Próximos sprints: **Observability (Sentry)**, **Type narrowing en DTOs Diario** (`mood: DiaryMoodId`), **Enforcement análogo de motivos/categories**.
