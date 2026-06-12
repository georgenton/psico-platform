# Sprint DTO JSDoc Round 2 — field-level descriptions en 8 DTOs adicionales

**Fecha:** 2026-06-12
**Rama:** `feature/sprint-dto-jsdoc-round-2`
**Tests:** 653/654 API (sin cambios) · 122/122 web · 20/20 mobile · 34/34 crypto

---

## Lo que se construyó

Séptimo sprint de la serie OpenAPI improvement (continuación de #287 que sembró 5 DTOs).

Round 1 cubrió Auth básico (Register, Login, AuthResponse, AuthUser) + Diario create + Users mood. Round 2 expande a 8 DTOs adicionales abarcando flujos críticos que aún quedaban opacos.

### DTOs sembrados

| DTO                            | Endpoint                                    | Fields con JSDoc                                                                               |
| ------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `UpdateDiaryEntryDto`          | `PATCH /api/diario/entries/:id`             | 6/6 — mood, textCipher, textNonce, excerptCipher, excerptNonce, tags                           |
| `ResetPasswordDto`             | `POST /api/auth/reset-password`             | 2/2 — token, newPassword                                                                       |
| `OAuthGoogleDto`               | `POST /api/auth/oauth/google`               | 1/1 — idToken                                                                                  |
| `SendEcoMessageDto`            | `POST /api/eco/messages` (SSE)              | 5/5 — threadId, textPlaintext, textCipher, textNonce, intent                                   |
| `ReportEcoMessageDto`          | `POST /api/eco/messages/:id/report`         | 2/2 — reason, comment                                                                          |
| `UpdateProfileDto`             | `PATCH /api/user/profile`                   | 4/4 — firstName, city, country, avatarUrl                                                      |
| `UpdateNotificationsDto`       | `PATCH /api/user/notifications`             | 6/6 — dailyReminder, reminderTime, streakReminders, ecoReplies, terapiaReminders, weeklyReport |
| `CreateBookingDto`             | `POST /api/terapia/bookings`                | 7/7 — therapistId, slotIso, modality, firstReasonId, durationMin, successUrl, cancelUrl        |
| `PasswordChangeWithRekeyDto`   | `POST /api/user/password-change-with-rekey` | 4/4 — currentPassword, newPassword, newCryptoSalt, reencryptedEntries                          |
| `ReencryptedEntryDto` (nested) | (dentro de password-change-with-rekey)      | 5/5 — id, textCipher, textNonce, excerptCipher, excerptNonce                                   |

**Total: 42 fields nuevos documentados** (8 top-level DTOs + 2 nested = 10 schemas).

### Foco temático del round

- **E2E crypto** — `UpdateDiaryEntryDto`, `SendEcoMessageDto`, `PasswordChangeWithRekeyDto`, `ReencryptedEntryDto`. Explican el modelo cripto ADR 0007 a nivel field (nonce pairing, hybrid encryption, rekey transaction).
- **Auth flows secundarios** — `ResetPasswordDto`, `OAuthGoogleDto`. Documentan el comportamiento 410 GONE y el contrast con local auth (ADR 0009).
- **Settings frontend-críticos** — `UpdateProfileDto`, `UpdateNotificationsDto`. Documentan qué hace cada toggle, cuál pushea, cuál emailea (cierra confusión con S43+S44 timezone-aware).
- **Therapy booking** — `CreateBookingDto`. Documenta el SLOT_TAKEN race condition + Stripe wiring deferred a S65.

### Cliente generado

`packages/api-client/src/generated.ts`: **299.4 KB → 310.5 KB** (~4% growth, todas descripciones).

Sample del impacto en el cliente:

```ts
// VS Code hover sobre SendEcoMessageDto.textPlaintext
SendEcoMessageDto: {
    /**
     * @description Ephemeral plaintext of the user's message. Server uses it for the
     *     LLM prompt + layer-1 crisis regex detection, then drops it. NEVER
     *     persists, NEVER logs, NEVER returns in any response. The privacy
     *     spec enforces this at CI time.
     *
     *     Hard cap 2000 chars (~500 tokens) to control LLM cost and stay
     *     under the design's "respuestas cortas" voice.
     */
    textPlaintext: string;
    ...
};
```

Devs ya no necesitan abrir el backend para entender el modelo cripto del Diario o el contrato de privacy del Eco.

---

## Decisiones

1. **Foco en E2E + privacy** — donde más sufren los devs nuevos. El comentario del field cita ADR 0007 con número de sección, lo que les permite saltar al ADR cuando dudan.
2. **`CreateThreadDto` skipped** — el endpoint `POST /api/eco/threads` no recibe body (auto-create vacío). No hay DTO que documentar.
3. **`ReencryptedEntryDto` documentado completo** — es nested dentro de `PasswordChangeWithRekeyDto`. El plugin lo emite como sub-schema porque es una class.
4. **Sin tocar service** — refactor metadata-only.
5. **Cita ADRs por sección** — e.g. `ADR 0007 §A` (key derivation), `§C` (Eco hybrid encryption), `§F` (rekey). Anchorage explícito para nuevos contributors.

---

## Smoke verification

```
API tests        653/654 (sin cambios — 1 sentinel skipped)
@psico/crypto    34/34
Web tests        122/122 (sin cambios)
Mobile tests     20/20 (sin cambios)
Typecheck        OK (API)
Lint             0 errors, 4 warnings preexistentes
OpenAPI dump     283.9 KB → 292.2 KB
generated.ts     299.4 KB → 310.5 KB

Verificación per-schema:
  UpdateDiaryEntryDto          → 6/6 fields con description
  ResetPasswordDto             → 2/2
  OAuthGoogleDto               → 1/1
  SendEcoMessageDto            → 5/5
  ReportEcoMessageDto          → 2/2
  UpdateProfileDto             → 4/4
  UpdateNotificationsDto       → 6/6
  CreateBookingDto             → 7/7
  PasswordChangeWithRekeyDto   → 4/4
  ReencryptedEntryDto (nested) → 5/5

  Total: 42 fields documentados
```

---

## Estado total post-round-2

| Round               | DTOs                                                                      | Fields        | PR      |
| ------------------- | ------------------------------------------------------------------------- | ------------- | ------- |
| Round 1 (#287)      | 5 (Register, Login, AuthResponse, AuthUser, CreateDiaryEntry, UpdateMood) | 25            | merged  |
| Round 2 (este)      | 8 + 2 nested = 10 schemas                                                 | 42            | abierto |
| **Total acumulado** | **15 schemas**                                                            | **67 fields** |         |

Los DTOs sembrados cubren los flujos más visibles del producto:

- Auth completo (register, login, refresh, reset, verify, oauth, change-with-rekey)
- Diario E2E (create + update + rekey)
- Eco SSE (send + report)
- Users settings (profile, mood, notifications)
- Terapia booking

DTOs aún sin per-field JSDoc (~25): Books admin (Create/Update), Chapters (Create/Audio), Lector (Highlight/Annotation), Onboarding (Step1-3/Complete/Tour), Voice (Transcribe), Author (todos), Subscription (Checkout/Portal/Cancel/Reactivate/Patch), Patrones (GetQuery).

---

## Deuda técnica abierta

- **Round 3** — ~25 DTOs más quedan sin field-level JSDoc. Aplicación incremental cuando algún consumer reporte confusión.
- **`@example` tags** — el plugin no los procesa sin schema-level config adicional. Sería valioso para `cryptoSalt`, `idToken`, `slotIso` con ejemplos reales. Diferir.
- **Sin spec test** que enforce que cada field publica tiene description.

---

## Cierre de la serie OpenAPI improvement (estado actualizado)

| #   | PR                                                            | Foco                          |
| --- | ------------------------------------------------------------- | ----------------------------- |
| 1   | [#281](https://github.com/georgenton/psico-platform/pull/281) | POC AuthController            |
| 2   | [#283](https://github.com/georgenton/psico-platform/pull/283) | Propagar Users/Billing/Diario |
| 3   | [#285](https://github.com/georgenton/psico-platform/pull/285) | Alignment spec                |
| 4   | [#287](https://github.com/georgenton/psico-platform/pull/287) | JSDoc round 1 (5 DTOs)        |
| 5   | [#289](https://github.com/georgenton/psico-platform/pull/289) | Cierre 19 controllers         |
| 6   | [#291](https://github.com/georgenton/psico-platform/pull/291) | Per-method 409/410/422        |
| 7   | (este)                                                        | JSDoc round 2 (8 DTOs)        |

**Cobertura total**:

- 164/165 endpoints con 400+401 envelope typed
- 60 con 403, 33 con 429, 16 con 409/410/422 per-method
- 67 fields documentados across 15 schemas críticos
- 1 spec test (7 tests) enforce alignment DTO ↔ filter
- `generated.ts`: 175.5 KB inicial → 310.5 KB (+77%, todo type info útil)

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — refactor metadata-only.
3. Próximos sprints candidatos:
   - **Bugfix #2 Stripe price IDs reales** — deuda de ops desde Sesión 30.
   - **Observability (Sentry)** — deuda macro.
   - **JSDoc round 3** — ~25 DTOs restantes.
   - **Polish UX Phase 1** — audio playback lector, edit entry diario, mobile highlights/pagination.
