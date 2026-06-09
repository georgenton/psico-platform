# Sprint S64 — Terapia · Reserva + Pre-sesión (con E2E intention)

**Fecha:** 2026-06-09
**Rama:** `feature/sprint-s64-terapia-booking`
**Tests:** 497/498 API + 34/34 crypto (483 → 497, +14 nuevos · 1 skipped sentinel)

---

## Lo que se construyó

Aterrizan las **pantallas 4 y 5** del diseño de Terapia (Reserva 3-pasos + Pre-sesión). El boundary de S64 hace toda la lógica de **availability + booking + E2E intention** pero **defiere Stripe Checkout a S65** (junto con la sala de video y el webhook). Razón: integrar el checkout one-time + webhook handler + sweeper de pagos fallidos es un sprint dedicado por sí solo; mezclarlo acá perjudica la observabilidad.

### Schema cambios

`TherapySession` extendido con:
- `paymentStatus: TherapyPaymentStatus` (`PENDING` / `PAID` / `FAILED` / `REFUNDED`), default `PENDING`.
- `stripeCheckoutSessionId: String?` para correlar con el webhook futuro.
- Índice `[paymentStatus]` para que el sweeper de S65 sea rápido.

Migración `20260609230000_s64_therapy_booking` aditiva.

### Endpoints (4 nuevos)

| Método | Path | Notas |
|---|---|---|
| GET | `/api/terapia/therapists/:id/availability?days=14` | Proyección semanal sobre próximos N días, descuenta booked |
| POST | `/api/terapia/bookings` | Crea session SCHEDULED + PENDING. Race detection. `checkoutUrl: null` (S65) |
| GET | `/api/terapia/sessions/:id/prep` | Solo owner. Devuelve session + prep (intentionCiphertext/nonce/mood/sharedEntryIds) |
| PATCH | `/api/terapia/sessions/:id/prep` | Owner only. Cipher/nonce pairing enforced. Locks cuando status != SCHEDULED |

### Tipos compartidos (+6 shapes)

`AvailabilitySlot`, `TherapistAvailabilityResponse`, `TherapyPaymentStatus`, `CreateBookingRequest`, `CreateBookingResponse`, `SessionPrepResponse`, `UpdateSessionPrepRequest`. `@psico/types` ahora pesa 46.43 KB.

### Tests (+14)

`terapia.service.spec.ts` extendido:
- **getAvailability** (3): 404 missing, projection + sin booking, where clause con SCHEDULED/IN_PROGRESS.
- **createBooking** (5): 404 missing, 400 modality not offered, 400 past slot, 409 SLOT_TAKEN, happy path con PENDING.
- **getSessionPrep** (3): 404 missing, 403 not owner, happy path shape.
- **updateSessionPrep** (3): 400 cipher/nonce pairing, 400 status != SCHEDULED, happy update con refresh.

---

## Privacidad

ADR 0007 aplicado al pre-session intention:
- `intentionCiphertext + intentionNonce` viajan **siempre juntos** (pairing enforcement en service).
- DTO `UpdateSessionPrepDto` valida largos máximos del cipher (8 KB) y nonce (64 chars base64url).
- El service **nunca loggea** los campos cifrados — el privacy spec global ya cubre este patrón.
- `checkInMood` es plaintext metadata (token categórico tipo "ansioso"), igual que `DiaryEntry.mood`.
- `sharedEntryIds` apunta a `SharedDiaryEntry` (re-encrypt ephemeral creado por el diario flow); este endpoint solo lleva los IDs.

---

## Decisiones

1. **Stripe wiring deferido a S65** — integrar one-time checkout + webhook + sweeper requiere su propio sprint con tests dedicados de cada path (success/expired/failed/refunded). Acoplarlo acá perdería claridad. El campo `paymentStatus` queda implementado para que el wire-up sea minimalmente invasivo.
2. **`createBooking` retorna `checkoutUrl: null` ahora** — el frontend debe mostrar un badge "Pendiente de pago — S65 wirea Stripe" hasta el sprint siguiente. Permite testear el flow UX sin bloquear.
3. **Cadencia de slots fija de 60 min, durationMin=50 default** — el diseño habla de "30 vs 50 min" pero v1 estandariza en 50 hasta tener data. Si el usuario quiere 30 min lo pasa por durationMin en el booking; el slot start time es lo único que se proyecta.
4. **Race detection con `findFirst` inmediatamente antes del create** — ventana muy chica para un race real, pero existe. La solución real (advisory lock o unique constraint compuesto en `(therapistId, scheduledAt)` con status WHERE) la dejo para S66 cuando se evidencien colisiones reales.
5. **`PREP_LOCKED` cuando status != SCHEDULED** — una vez la sesión arranca (IN_PROGRESS) o se completó/canceló, no aceptamos cambios a la intention/mood/sharedEntries. Coherente con el design.
6. **`joinUrl: null` en getSessionPrep** — Daily.co token issuance lo hace S65. La pantalla 5 (pre-session) se renderiza igual; el botón "Unirse a sala" queda disabled con tooltip "Disponible 5 min antes".

---

## Smoke verification

- API tests **497/498** (+14 nuevos · 1 skipped sentinel).
- Crypto tests 34/34.
- API typecheck OK.
- Schema valid.

---

## Deuda técnica abierta

- **Stripe Checkout one-time + webhook handler (CHECKOUT_SESSION_COMPLETED / CHECKOUT_SESSION_EXPIRED)** — sprint S65.
- **Sweeper de PENDING > 1h** — cancela sessions con paymentStatus PENDING + scheduledAt - 1h pasado. BullMQ cron. S65.
- **Daily.co token issuance** — `POST /api/terapia/sessions/:id/join` que llama `DailyVideoProvider.createJoinToken`. S65.
- **Unique constraint `(therapistId, scheduledAt)` con WHERE status NOT IN (CANCELLED, MISSED)** — refactor de S66 si vemos colisiones.
- **Migración acumulada S62+S64** sin aplicar en Railway.
- **`SharedDiaryEntry` re-encrypt flow** — el ID compartido apunta a un blob que el cliente debe crear ANTES de mandar sharedEntryIds. Hoy aceptamos los IDs sin verificar que el blob exista; en S66 agregamos validación.
- **OpenAPI regen** sigue pendiente.

---

## Próximo sprint

**S65 — Sala video + Post-sesión + Stripe wire:**
- `DailyVideoProvider` real implementando `IVideoProvider` (ADR 0014)
- POST `/api/terapia/sessions/:id/join` — emite Daily token
- POST `/api/terapia/sessions/:id/feedback` — rating + tags + noteCiphertext E2E
- POST `/api/terapia/sessions/:id/technical-report`
- Stripe Checkout one-time wire-up
- Webhook handler para CHECKOUT_SESSION_COMPLETED → marca PAID
- BullMQ sweeper de PENDING > 1h
