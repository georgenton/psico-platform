# Sprint DTO JSDoc Round 5 — DTOs v2 (Terapia + Author + Onboarding)

**Fecha:** 2026-06-12
**Rama:** `feature/sprint-dto-jsdoc-round-5`
**Tests:** 653/654 API (sin cambios) · 122/122 web · 20/20 mobile · 34/34 crypto

---

## Lo que se construyó

Décimo sprint de la serie OpenAPI improvement. Cubre los DTOs v2 que en round 4 quedaron como deuda — TerapiaModule (v2 hub completo), Onboarding restante, y Author estructura/AI help.

### DTOs sembrados (11 schemas + 2 inline params = 13 surfaces, 34 fields)

| DTO                                 | Endpoint                                       | Fields |
| ----------------------------------- | ---------------------------------------------- | ------ |
| `OnboardingStep2Dto`                | `POST /api/onboarding/step2`                   | 1/1    |
| `OnboardingCompleteDto`             | `POST /api/onboarding/complete`                | 1/1    |
| `OnboardingTourCompleteDto`         | `POST /api/onboarding/tour/complete`           | 1/1    |
| `UpdateChapterDto`                  | `PATCH /api/autor/libros/:id/capitulos/:n`     | 6/6    |
| `ChapterBlockDto` (nested)          | dentro de UpdateChapterDto                     | 3/3    |
| `AuthorAiHelpDto`                   | `POST /api/autor/libros/:id/ai-help`           | 4/4    |
| `CrisisLogDto`                      | `POST /api/terapia/crisis/log` (público)       | 3/3    |
| `AvailabilityDto` (inline params)   | `GET /api/terapia/therapists/:id/availability` | 1/1    |
| `SessionFeedbackDto`                | `POST /api/terapia/sessions/:id/feedback`      | 4/4    |
| `RescheduleSessionDto`              | `PATCH /api/terapia/sessions/:id/reschedule`   | 1/1    |
| `ListTherapistsDto` (inline params) | `GET /api/terapia/therapists`                  | 9/9    |

**Total: 34 fields nuevos documentados.**

### Foco temático

- **Therapy v2 hub** (5 DTOs) — crisis log público (privacy-preserving audit), directorio con filtros multi-eje, availability projection 14 días, feedback con E2E split (rating/tags plaintext + noteCiphertext), reschedule con SLOT_TAKEN.
- **Author B2B editor** (3 DTOs) — UpdateChapter con optimistic concurrency (expectedVersion → 409), ChapterBlock con 5 kinds, AI helper con 4 intent prompts.
- **Onboarding tail** (3 DTOs) — step2 mood catalog, complete con chosenBookId nullable, tour-complete con stepsCompleted analytics.

### Cliente generado

`packages/api-client/src/generated.ts`: **326.5 KB → 335.3 KB** (~3% growth).

---

## Estado acumulado post-round-5

| Round          | DTOs            | Fields         | PR      |
| -------------- | --------------- | -------------- | ------- |
| Round 1 (#287) | 5 schemas       | 25             | merged  |
| Round 2 (#293) | 10 schemas      | 42             | merged  |
| Round 3 (#295) | 11 schemas      | 26             | merged  |
| Round 4 (#299) | 11 schemas      | 34             | merged  |
| Round 5 (este) | 13 surfaces     | 34             | abierto |
| **Total**      | **50 surfaces** | **161 fields** |         |

Cobertura cualitativa: **TODOS** los DTOs activos en endpoints v1 y v2 están sembrados. Los pocos DTOs que quedan son metadata-only DTOs muy simples (e.g. ListSessionsDto con un solo `status` filter) o internos a módulos no expuestos públicamente.

---

## Decisiones

1. **CrisisLogDto enfatiza el contrato público + privacy-preserving** — para devs nuevos, la sorpresa de que el endpoint sea sin auth + nunca capture texto es importante. JSDoc lo deja explícito.
2. **UpdateChapterDto explica optimistic concurrency a fondo** — el `expectedVersion` field es el feature más sutil del editor. JSDoc cita el código de error y el comportamiento opt-in.
3. **AuthorAiHelpDto documenta cada intent** — el enum único `revisar`/`ejemplo`/`tono`/`simplificar` no es obvio si solo ves el tipo. Cada intent tiene su system prompt distinto en backend.
4. **SessionFeedbackDto destaca el privacy split** — rating + tags plaintext (analytics-safe), note E2E (privado al user). Cross-reference a ADR 0007 §A.
5. **Inline query params** (Availability, ListTherapists) son `parameters`-level en OpenAPI; el plugin no genera schema components separados pero sí emite `description` en cada param.
6. **Sin tocar service** — refactor metadata-only.

---

## Smoke verification

```
API tests        653/654 (sin cambios — 1 sentinel skipped)
@psico/crypto    34/34
Web tests        122/122 (sin cambios)
Mobile tests     20/20 (sin cambios)
Typecheck        OK
Lint             0 errors, 4 warnings preexistentes
OpenAPI dump     304.2 KB → 310.6 KB
generated.ts     326.5 KB → 335.3 KB
```

---

## Deuda técnica abierta

- **DTOs metadata triviales sin sembrar** — ListSessionsDto, ListReviewsDto, ListNotificationsDto, CancelSessionDto, RetryCheckoutDto, TechnicalReportDto, UpdatePrescriptionDto, UpdatePrepDto, UpdateStructureDto, UpdatePayoutSettingsDto. ~10 DTOs con 1-3 fields cada uno. ROI marginal a esta altura.
- **`@example` tags** sigue diferido.
- **Sin spec test** que enforce description per-field.

---

## Cierre de la serie OpenAPI improvement

Con este sprint cierra esencialmente la serie:

| #   | PR                                                            | Foco                        |
| --- | ------------------------------------------------------------- | --------------------------- |
| 1   | [#281](https://github.com/georgenton/psico-platform/pull/281) | POC ErrorEnvelopeDto Auth   |
| 2   | [#283](https://github.com/georgenton/psico-platform/pull/283) | Propagación a 3 controllers |
| 3   | [#285](https://github.com/georgenton/psico-platform/pull/285) | Alignment spec              |
| 4   | [#287](https://github.com/georgenton/psico-platform/pull/287) | JSDoc round 1 (5 DTOs)      |
| 5   | [#289](https://github.com/georgenton/psico-platform/pull/289) | Cierre 19 controllers       |
| 6   | [#291](https://github.com/georgenton/psico-platform/pull/291) | Per-method 409/410/422      |
| 7   | [#293](https://github.com/georgenton/psico-platform/pull/293) | JSDoc round 2 (10 DTOs)     |
| 8   | [#295](https://github.com/georgenton/psico-platform/pull/295) | JSDoc round 3 (11 DTOs)     |
| 9   | [#299](https://github.com/georgenton/psico-platform/pull/299) | JSDoc round 4 (11 DTOs)     |
| 10  | (este)                                                        | JSDoc round 5 (13 surfaces) |

**Estado final**: 164/165 endpoints con envelope completo, 16 endpoints con 409/410/422 per-method, **50 surfaces / 161 fields** con JSDoc field-level, 1 alignment spec con 7 tests, `generated.ts` 175 KB → 335 KB (+91%, todo type info útil).

---

## Próximo paso

Cierra la serie OpenAPI. Sprints candidatos siguientes:

- **Bugfix #2 Stripe price IDs reales** — deuda de ops desde Sesión 30 (más urgente para revenue).
- **Observability (Sentry)** — sin instrumentación los crashes en prod son opacos.
