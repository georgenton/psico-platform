# Sprint S67.B — Terapia web · Reserva + Pre-sesión E2E + Detalle de sesión

**Fecha:** 2026-06-09
**Rama:** `feature/sprint-s67b-terapia-booking-web`
**Tests:** web 50/50 + crypto 34/34 + API 509/510 (sin cambios netos — sprint UI)

---

## Lo que se construyó

Cierra el flow E2E de Terapia desde el web: encuentra → reserva → paga (Stripe) → prepara (E2E intention) → une a la sala (Daily.co URL). El único pendiente del v1 es **sala video iframe-embedded** (que requiere el Daily JS SDK, ~150 KB) — por ahora la sala abre en otra pestaña con la roomUrl real.

### 2 pages nuevas

```
/dashboard/terapia/reservar/[therapistId]      # 3-pasos modality → slot → confirm + Stripe
/dashboard/terapia/sesiones/[id]               # Detalle con pre-sesión E2E + cancel + join
```

### 2 Client Components nuevos

- **`BookingFlow.tsx`** — state machine de 3 pasos. Lazy-loads availability al entrar al paso 2 (zero overhead si el user se va antes). Slots agrupados por día con `groupSlotsByDay()` que filtra solo días con slots disponibles.
- **`SessionDetailShell.tsx`** — usa `useDiaryKey()` para cripto E2E del intention. Decrypta al mount + encrypt onBlur del textarea. mood + intention son fields independientes (cada uno guarda por su cuenta). Window check `[-5min, +duration+15min]` activa el botón "Unirse" con el roomUrl real (target=_blank por ahora).

### 4 server actions nuevas

- `createBookingAction(therapistId, slotIso, modality, firstReasonId?)` — POSTea booking + redirect al checkoutUrl de Stripe. Failure-tolerant: si la llamada falla con un error de validación, retorna `{error}` al cliente; si Stripe down, lleva al detail de la session pendiente.
- `updateSessionPrepAction(sessionId, body)` — PATCH del pre-session.
- `joinSessionAction(sessionId)` — POST `/sessions/:id/join` y retorna roomUrl.
- `retryCheckoutAction(sessionId)` — POST `/bookings/:id/retry-checkout` + redirect.
- (extra) `resolveAppOrigin()` helper local — mismo patrón del subscription action.

### Backend touch-up

- `SessionPrepResponse.session.status` añadido al tipo y al service. Sin esto el front no podía saber si la session estaba SCHEDULED vs COMPLETED para decidir si mostrar el composer o el feedback. Cambio aditivo, retrocompatible.

### `@psico/types`

49.27 → 49.31 KB. Un solo campo nuevo.

---

## Privacidad

Reusa el mismo `DiaryKeyProvider` del Diario. La master key se deriva una sola vez al login + se mantiene en memoria mientras la session web esté abierta. El intention texto **nunca** se envía sin cifrar. La nonce nueva se genera por `encryptString` por cada save.

Pairing del cipher+nonce: el service backend rechaza con 400 `CIPHER_NONCE_PAIRING` si solo uno viene. El front siempre los manda juntos.

---

## Decisiones

1. **Sala video como link target=_blank** — el iframe embedded de Daily.co necesita su SDK pesado y un wrapper con permisos de mic/cam. Lo dejamos para S67.C para que este sprint no infle el bundle web.
2. **`startTransition` + `useTransition`** en cada flow async — `pending` deshabilita botones, los updates se mantienen suspended hasta que la action termina.
3. **Mood + intention guardan independientes** — cada uno tiene su propio PATCH. Eficiente para el caso típico donde el user updatea uno y no el otro.
4. **`router.refresh()` tras cancel** — re-fetcha la Server Component para que el detail re-renderice con `status=CANCELLED`.
5. **`window.prompt` para cancel reason** — UX rápida y honesta. Si UX exige modal custom, refactor en S67.C.
6. **Failure-tolerant `createBookingAction`** — el server action mismo hace `redirect(checkoutUrl)` si Stripe está configurado. Si retorna `{error}`, el cliente lo muestra. Si Stripe down y session creada pero sin checkoutUrl, redirige al detail.
7. **`groupSlotsByDay` filtra días sin slots disponibles** — evita "Lunes (todos ocupados)" — solo días con al menos 1 slot libre se renderizan.
8. **Composer disabled hasta paymentStatus=PAID** — UX honesta. Antes del pago el user no puede preparar la sesión porque la sesión podría cancelarse por timeout.

---

## Estados visuales cubiertos

**Reservar:**
- Step 1: modalidad (con o sin razón seleccionada)
- Step 2: loading availability + grid + selected slot + sin slots
- Step 3: confirm con summary + error inline

**Detalle de sesión:**
- SCHEDULED + PENDING → CTA "Pagar ahora" + composer disabled
- SCHEDULED + PAID + fuera de ventana → "La sala se abre 5 min antes" + composer enabled
- SCHEDULED + PAID + dentro de ventana → CTA "Unirse a la sala →"
- COMPLETED → solo el header
- CANCELLED → solo el header con status badge rojo
- Diary key locked → "Desbloqueá tu Diario para escribir tu intención"

---

## Smoke verification

- Web typecheck OK
- Web lint clean
- Web build OK (28 páginas pre-rendered, las 2 nuevas como `force-dynamic`)
- Web tests 50/50 (sin cambios)
- API tests 509/510 (sin cambios)
- Crypto 34/34

---

## Deuda técnica abierta

- **Sala video iframe-embedded** con Daily.co SDK — S67.C. Wrapper que pide permisos de mic/cam, gestiona el join token, mostrar el iframe, ofrecer botón "Salir" que cierra al provider real.
- **Post-sesión modal/page** con rating + tags + noteCiphertext E2E — S67.C.
- **Modal de cancel custom** en lugar de `window.prompt` — refactor cosmético.
- **Reschedule UI** — S67.C.
- **Selector de "compartir entrada del diario"** en pre-sesión — UI más compleja, los IDs los acepta el backend desde S64 pero el blob re-encrypted ephemeral aún no se genera cliente-side.
- **Tests UI** con Vitest + RTL para los 2 components — sprint propio.
- **Notificaciones page + Recetas page + Crisis page** — S67.C.

---

## Próximo sprint

**S67.C — Sala video + Post-sesión + Lifecycle UI:**
- `daily-js` integrado, sala embedded con permisos
- Post-sesión modal/page (rating + tags + note cifrado)
- Notificaciones page (`/dashboard/terapia/notificaciones`)
- Recetas page con toggle completed
- Crisis page (`/dashboard/terapia/crisis`)
- Reschedule UI

**S68 — Frontend mobile RN paridad** después.
