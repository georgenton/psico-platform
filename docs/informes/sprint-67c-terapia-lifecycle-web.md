# Sprint S67.C — Terapia web · Post-sesión + Notificaciones + Recetas + Crisis

**Fecha:** 2026-06-09
**Rama:** `feature/sprint-s67c-terapia-lifecycle-web`
**Tests:** web 50/50 + crypto 34/34 + API 509/510 (sin cambios — sprint UI)

---

## Lo que se construyó

Cierra el resto del flow web de Terapia. Después de S67 (Hub + Directorio + Perfil + Mis sesiones) y S67.B (Reserva + Pre-sesión + Detalle), este sprint entrega:

### 3 pages nuevas

```
/dashboard/terapia/crisis           # Líneas + safety tips + pasos siguientes
/dashboard/terapia/notificaciones   # Listado con mark-all-read + bullet "sin leer"
/dashboard/terapia/recetas          # Pendientes/Completadas con toggle
```

### 1 modal nuevo

- **`FeedbackModal.tsx`** — abierto desde `SessionDetailShell` cuando la sesión ya pasó pero el status sigue SCHEDULED/IN_PROGRESS. Rating 1-5 ★ + tags chips + note opcional E2E cifrada. Encrypt con `useDiaryKey().key` antes de salir del navegador. Submit → POST `/sessions/:id/feedback` → backend marca `COMPLETED`.

### 3 components reusables

- **`MarkAllReadButton.tsx`** — Client Component opt-in para el header de Notificaciones.
- **`PrescriptionToggle.tsx`** — Client Component con state optimistic; UI cambia inmediatamente al click.
- **`FeedbackModal.tsx`** — modal con backdrop click-to-close.

### Wire-up en SessionDetailShell

- Botón "Cerrar y dejar feedback →" aparece cuando `nowMs > end && status ∈ {SCHEDULED, IN_PROGRESS} && paymentStatus === PAID`. Sustituye al botón "Cancelar" en esa ventana.
- Botón abre `<FeedbackModal>` en el mismo árbol.

### 4 server actions nuevas

- `submitFeedbackAction(sessionId, body)` — POST `/sessions/:id/feedback` con rating + tags + noteCiphertext/noteNonce opcionales.
- `togglePrescriptionAction(prescriptionId, completed)` — PATCH `/prescriptions/:id`.
- `markAllNotificationsReadAction()` — POST `/notifications/read-all`.
- `markNotificationReadAction(notificationId)` — PATCH `/notifications/:id/read`.

### Hub extendido

- 2 cards nuevas en el grid del Hub: "📋 Lo que tu terapeuta sugirió" → `/recetas` y "🔔 Notificaciones" → `/notificaciones`. Suman a las 2 existentes (Encontrar terapeuta + Apoyo inmediato).

---

## Privacidad

- **Note de feedback E2E** — encrypt con la misma `diaryKey` derivada en el unlock del Diario. Si el user no tiene unlock, el modal acepta rating + tags pero permite escribir nota mostrando una nota inline "Desbloqueá tu Diario para cifrar la nota" (en ese caso simplemente NO incluye `noteCiphertext` en el payload). El backend recibe solo cipher + nonce, nunca plaintext.
- **Crisis page público sin auth** — el endpoint `/terapia/crisis` es `@Public()` por decisión ética (ver `docs/design/handoff/11-terapia.md` y CLAUDE.md). Esta página fetch desde el dashboard ya autenticado por contexto de navegación, pero el backend mismo no requiere token.

---

## Decisiones

1. **FeedbackModal monta dentro de `SessionDetailShell`** — comparten el mismo `DiaryKeyProvider`, evita pasar la key como prop o recrear el context.
2. **Botón "Cerrar y dejar feedback" sustituye "Cancelar"** post-end — coherente con el lifecycle: ya no tiene sentido cancelar después de la sesión, solo cerrarla.
3. **`togglePrescriptionAction` optimistic** — UI cambia inmediatamente al click; si el server rechaza, lo absorbe (catch sin alert). Para v1 el tradeoff (UX rápida vs feedback de error) lo decidimos por UX.
4. **`MarkAllReadButton` con state local `done`** — después del submit muestra "✓ Listo" y se deshabilita; evita doble-click + da feedback visual.
5. **Notification bullet con `lavender-300`** para sin-leer, `warm-200` para leídas — mismo patrón que el Inbox del web.
6. **Recetas: Pendientes ARRIBA, Completadas ABAJO** — semántica de inbox.
7. **Crisis page con CTAs ordenadas: 📞 Llamar → 💬 WhatsApp → Chat web** — el más urgente primero.
8. **`tel:` deep link sanitiza el phone** con regex `[^+0-9]` (mismo patrón que CrisisModal de Eco).

---

## Smoke verification

- Web typecheck OK
- Web lint clean
- Web build OK (con 3 páginas nuevas más, las 3 como `force-dynamic`)
- Web tests 50/50 (sin cambios)
- API tests 509/510 (sin cambios)
- @psico/crypto 34/34 (sin cambios)

---

## Deuda técnica abierta

- **Sala video iframe-embedded** con Daily SDK — sigue siendo S67.D. Wrapper con permission flow + token lifecycle.
- **Tests UI** dedicados para los 4 nuevos components (Vitest + RTL).
- **Reschedule UI** — el backend tiene `POST /sessions/:id/reschedule` desde S66.B, falta UI.
- **TherapistSummary timestamp en feedback** — no se muestra "hace X tiempo".
- **Loader / skeleton states** en las nuevas pages — actualmente Server Components blocking; navegación se siente lenta cuando el API responde despacio.
- **Inline error en `togglePrescriptionAction`** — actualmente swallow; idealmente revertir el optimistic update con toast.
- **Notification action URL handling** — link directo; si el target route no existe, 404 silencioso.

---

## Próximo sprint

**S67.D — Sala video Daily SDK + Reschedule UI:**
- `daily-js` integrado, sala embedded con permisos
- Reschedule modal con picker de slot
- (opcional) Refactor de cancel modal de `window.prompt` a custom modal

**S68 — Frontend mobile RN paridad** después.
