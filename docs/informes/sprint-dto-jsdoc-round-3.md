# Sprint DTO JSDoc Round 3 — 10 DTOs adicionales (Lector + Billing + Onboarding + Voice + Diario)

**Fecha:** 2026-06-12
**Rama:** `feature/sprint-dto-jsdoc-round-3`
**Tests:** 653/654 API (sin cambios) · 122/122 web · 20/20 mobile · 34/34 crypto

---

## Lo que se construyó

Octavo sprint de la serie OpenAPI improvement (round 1: #287, round 2: #293).

Round 3 expande con 10 DTOs más, alcanzando un total acumulado de **25 schemas, 26 fields nuevos**. La cobertura ahora abarca todas las áreas del producto v1.

### DTOs sembrados

| DTO                                    | Endpoint                             | Fields                                                                              |
| -------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| `CreateHighlightDto`                   | `POST /api/highlights`               | 5/5 — blockId, startOffset, endOffset, color, note                                  |
| `CreateAnnotationDto`                  | `POST /api/annotations`              | 2/2 — blockId, text                                                                 |
| `UpdateAnnotationDto`                  | `PATCH /api/annotations/:id`         | 1/1 — text                                                                          |
| `LectorSessionHeartbeatDto`            | `PATCH /api/lector/session`          | 5/5 — bookId, chapterOrder, lastBlockId, timeSpentDeltaSec, progressPct             |
| `CreateCheckoutSessionDto`             | `POST /api/billing/checkout-session` | 3/3 — billingPlan, successUrl, cancelUrl                                            |
| `CancelSubscriptionDto`                | `POST /api/billing/cancel`           | 1/1 — reason                                                                        |
| `ListInvoicesQueryDto` (inline params) | `GET /api/billing/invoices`          | 1/1 — limit                                                                         |
| `OnboardingStep1Dto`                   | `POST /api/onboarding/step1`         | 1/1 — motivosIds                                                                    |
| `OnboardingStep3Dto`                   | `POST /api/onboarding/step3`         | 2/2 — firstName, voicePreference                                                    |
| `TranscribeQueryDto` (inline params)   | `POST /api/voz/transcribe`           | 1/1 — language                                                                      |
| `ShareDiaryEntryDto`                   | `POST /api/diario/entries/:id/share` | 5/5 — therapistId, ciphertextForTherapist, wrappedKey, userOneShotPubKey, expiresAt |

**Total: 26 fields nuevos documentados** across 11 DTOs (9 con sub-schemas + 2 inline query params).

### Foco temático

- **Lector** (4 DTOs) — anchoring del highlight/annotation por blockId, heartbeat clamping, monotonic progressPct
- **Billing** (3 DTOs) — Stripe Checkout flow, cancel idempotencia, invoice paging
- **Onboarding** (2 DTOs) — catalog validation, recommendation algorithm input
- **Voice** (1 DTO) — Pro-only + quota gating + audio-discarded contract
- **Diario** (1 DTO) — E2E share con ECDH X25519 ephemeral one-shot keys (ADR 0007 §E)

### Cliente generado

`packages/api-client/src/generated.ts`: **310.5 KB → 317.8 KB** (~2% growth).

---

## Estado total post-round-3

| Round          | DTOs           | Fields        | PR      |
| -------------- | -------------- | ------------- | ------- |
| Round 1 (#287) | 5 schemas      | 25            | merged  |
| Round 2 (#293) | 10 schemas     | 42            | merged  |
| Round 3 (este) | 11 schemas     | 26            | abierto |
| **Total**      | **26 schemas** | **93 fields** |         |

Cobertura cualitativa: TODAS las áreas v1 del producto tienen al menos un DTO documentado.

---

## Smoke verification

```
API tests        653/654 (sin cambios)
@psico/crypto    34/34
Web tests        122/122 (sin cambios)
Mobile tests     20/20 (sin cambios)
Typecheck        OK
Lint             0 errors, 4 warnings preexistentes
OpenAPI dump     292.2 KB → 297.6 KB
generated.ts     310.5 KB → 317.8 KB

Verificación per-schema:
  CreateHighlightDto             → 5/5
  CreateAnnotationDto            → 2/2
  UpdateAnnotationDto            → 1/1
  LectorSessionHeartbeatDto      → 5/5
  CreateCheckoutSessionDto       → 3/3
  CancelSubscriptionDto          → 1/1
  ListInvoicesQueryDto (inline)  → 1/1
  OnboardingStep1Dto             → 1/1
  OnboardingStep3Dto             → 2/2
  TranscribeQueryDto (inline)    → 1/1
  ShareDiaryEntryDto             → 5/5
```

---

## Deuda técnica abierta

- **Round 4** — DTOs aún sin sembrar: Books admin (Create/Update), Chapters admin, Author (todos), Patrones (GetQuery), Subscription portal/patch, Onboarding step2/complete/tour, Lector reader-preferences. ~15 DTOs.
- **`@example`** sigue diferido.
- **No spec test** que enforce description per-field.

---

## Próximo paso

Sprint Polish UX Phase 1 (edit entry Diario web + paginación Eco mobile).
