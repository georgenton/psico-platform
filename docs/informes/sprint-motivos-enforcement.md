# Sprint Motivos Enforcement — Seed ↔ RECOMMENDATION_BY_MOTIVO alignment

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-motivos-enforcement`
**Tests:** 626/627 API (+11) · 122/122 web · 20/20 mobile · 34/34 crypto

---

## Lo que se construyó

Mirror del sprint anterior (`mood-enforcement`). El seed de `OnboardingMotivo` estaba hardcoded en `seed.ts` y `RECOMMENDATION_BY_MOTIVO` + `RECOMMENDATION_REASON` vivían como maps separados sin chequeo de coverage. Si alguien añadía un motivo nuevo y olvidaba la reco map, el OnboardingService caería al fallback silently. Hoy CI lo enforce.

### Backend (`apps/api/src/onboarding/constants.ts`)

- `OnboardingMotivoSeed` interface + `MOTIVO_SEED_CATALOG: readonly OnboardingMotivoSeed[]` — single source of truth (7 entries).
- `KNOWN_ANCHOR_BOOK_SLUGS: readonly string[]` — closed set de book slugs que el onboarding recommender puede retornar.

### Seed (`apps/api/prisma/seed.ts`)

- Importa `MOTIVO_SEED_CATALOG` en lugar del array literal hardcoded.
- Cero cambios funcionales.

### Test (`apps/api/src/onboarding/motivos-alignment.spec.ts`)

11 tests del invariant:

1. Seed tiene al menos un motivo.
2. Cada motivo tiene una entry en `RECOMMENDATION_BY_MOTIVO`.
3. Cada book slug recomendado es conocido.
4. `RECOMMENDATION_BY_MOTIVO` no tiene orphan keys (motivo sin seed row).
5. `FALLBACK_BOOK_SLUG` es un book conocido.
6. `FALLBACK_REASON` es string no-vacío.
7. `RECOMMENDATION_REASON` keys siguen shape `motivo:book` con IDs conocidos.
8. Cada par (motivo, recommended book) tiene tailored reason.
9. Seed `order` 1-indexed contiguous.
10. Seed ids únicos.
11. Seed icons son strings no-vacíos.

Failure message dice exactamente cuál archivo editar:

> If this test fails, you forgot to update one side when adding/renaming a
> motivo or anchor book. Update both:
>
> - SEED catalog: `apps/api/src/onboarding/constants.ts` (MOTIVO_SEED_CATALOG).
> - Recos map: `apps/api/src/onboarding/constants.ts` (RECOMMENDATION_BY_MOTIVO + RECOMMENDATION_REASON).
> - Books seed: `apps/api/prisma/seed.ts` (and KNOWN_ANCHOR_BOOK_SLUGS).

---

## Decisiones

1. **`KNOWN_ANCHOR_BOOK_SLUGS` como closed set local** — no exposurea desde `@psico/types` porque es server-only metadata (cliente no necesita saber qué libros son anchor).
2. **Test "tailored reason exists" es soft (assertable)** — service ya tiene fallback graceful, pero missing reason señala editorial work incompleto. Aún así enforced como expect.
3. **Sin update de RECOMMENDATION_BY_MOTIVO contenido** — el contenido ya estaba alineado al seed (auditoria mostró 7+7+7); el sprint solo adds enforcement.
4. **`KNOWN_ANCHOR_BOOK_SLUGS` desacoplado del `Book` table** — si en el futuro queremos enforce contra DB real, sería test integration que cuesta más. v1 con closed set es suficiente y rápido.
5. **`icon` validation light (non-empty string only)** — enforce contra lucide-react icon list sería mantenimiento alto sin payoff (icons rara vez cambian).
6. **Sin cambios al frontend** — la UI consume `/onboarding/motivos` desde DB; este sprint no toca el cliente.

---

## Privacy

- Sin cambios. Catalog público vía `/api/onboarding/motivos` desde S4.

---

## Smoke verification

- API tests **626/627** (+11 nuevos).
- @psico/crypto **34/34**.
- Web tests **122/122** (sin cambios).
- Mobile tests **20/20** (sin cambios).
- Typecheck + lint OK en API.

---

## Deuda técnica abierta

- **Sin enforcement de `OnboardingMood.swatch` aligned con UI design tokens** — los hex colors son free-form, no chequea contra paleta sage/lavender/warm.
- **`KNOWN_ANCHOR_BOOK_SLUGS` no se cross-checks con `Book` table real** — un libro despublicado o con slug cambiado en DB no rompe los tests. Caso edge — usually catched en deploy smoke.
- **`RECOMMENDATION_BY_MOTIVO` content stagnant** — el algoritmo es 1-to-1 estático. Cuando aterricen más libros, la heurística debería involucrar tags/categorías.
- **Frontend mobile motivos icon no usa lucide** — el catalog devuelve "wind"/"cloud-rain" como strings; cliente mobile mapea a Ionicons. Si alguna vez agrega mismatch, falla silently. Diferido.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — refactor del seed + test puro.
3. Próximos sprints: **Observability (Sentry)**, **Type narrowing en DTOs** (`mood: DiaryMoodId`), **Enforcement análogo de book categories**.
