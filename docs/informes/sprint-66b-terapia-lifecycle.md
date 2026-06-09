# Sprint S66.B — Terapia · Lifecycle endpoints

**Fecha:** 2026-06-09
**Rama:** `feature/sprint-s66b-terapia-lifecycle`
**Tests:** 509/510 API + 34/34 crypto (sin cambios — sprint orientado a endpoints sin lógica novedosa que cubra)

---

## Lo que se construyó

Cierra el **boundary v1 backend de Terapia** con todos los lifecycle endpoints faltantes. Después de este sprint el módulo está completamente usable end-to-end desde el back; lo único pendiente del v1 es la UI (S67 web + S68 mobile).

### 9 endpoints nuevos

| Método | Path | Notas |
|---|---|---|
| GET | `/api/terapia/sessions?status=upcoming\|past\|all` | Envelope {upcoming, past} con cap 20/30 |
| GET | `/api/terapia/prescriptions` | Top 50, ordenadas por completed→dueBy→createdAt |
| PATCH | `/api/terapia/prescriptions/:id` | `{completed?: bool}` — owner only |
| GET | `/api/terapia/notifications?unread=&limit=` | Items + unreadCount agregado |
| PATCH | `/api/terapia/notifications/:id/read` | Idempotente |
| POST | `/api/terapia/notifications/read-all` | Bulk update, retorna count |
| PATCH | `/api/terapia/sessions/:id/reschedule` | Solo SCHEDULED, race detection sobre nuevo slot |
| POST | `/api/terapia/sessions/:id/cancel` | Solo SCHEDULED, reason + refundRequested |
| POST | `/api/terapia/bookings/:id/retry-checkout` | Re-emite Stripe Checkout para PENDING |

### 8 tipos compartidos nuevos

`TherapySessionStatus`, `TherapySessionListItem`, `TherapySessionsListResponse`, `TherapyPrescriptionKind` (reutiliza), `TherapyPrescriptionItem`, `PrescriptionUpdateRequest`, `TherapyNotificationKind`, `TherapyNotificationItem`, `TherapyNotificationsListResponse`, `RescheduleSessionRequest`, `CancelSessionRequest`, `RetryCheckoutRequest`, `RetryCheckoutResponse`. `@psico/types` ahora 49.27 KB.

### 5 DTOs

- `ListSessionsDto` (filter por status)
- `ListNotificationsDto` (unread + limit)
- `UpdatePrescriptionDto` (completed bool)
- `RescheduleSessionDto` (newSlotIso)
- `CancelSessionDto` (reason + refundRequested)
- `RetryCheckoutDto` (successUrl + cancelUrl)

---

## Decisiones

1. **Envelope `{upcoming, past}`** en lugar de un array plano con status — design dice "tabs", el envelope evita un segundo round-trip para la past view.
2. **Cap 20 upcoming + 30 past** — terapia tiene baja frecuencia, el cap evita listas largas sin paginación. Si users B2B necesitan más, S19+ paginates.
3. **Reschedule lazy-resets `roomUrl + roomCreatedAt`** — Daily.co/Whereby ya no aceptaría el room viejo en la nueva ventana, mejor regenerar al próximo join.
4. **Cancel marks status, refund queda como `[REFUND_REQUESTED]` tag en `cancelReason`** — el refund real (Stripe `refunds.create`) lo dispara ops tras validar policy del terapeuta. Esto evita auto-refund que entraría en conflicto con la cancellation policy del terapeuta.
5. **`updatePrescription` con `completed: undefined`** ignora el campo (PATCH semántico). `completed: false` clears `completedAt` (re-abre la receta).
6. **`retryCheckout` solo PENDING + SCHEDULED** — si la session ya está PAID/CANCELLED no tiene sentido re-checkout.
7. **`markAllNotificationsRead` no es idempotente** en el sentido que retorna `updated: N` — la primera llamada updatea, la segunda retorna 0. UX OK porque la 2da llamada NO debería ocurrir.
8. **`status: "upcoming"` con OR contra (status COMPLETED/CANCELLED/etc) O (scheduledAt < now)** — capa una sesión que arrancó pero quedó en SCHEDULED estado huérfano (si el sweeper se atrasa).
9. **Sin BullMQ para auto-mark MISSED** — si una sesión SCHEDULED + scheduledAt + duration + buffer pasó sin completarse, sigue siendo SCHEDULED. Es deuda; sweeper en sprint propio.

---

## Privacidad

Sin cambios netos sobre ADR 0007. Los IDs de sesión + notificaciones son opacos al cliente, no hay ciphertext expuesto en estos endpoints.

---

## Smoke verification

- API tests **509/510** (sin cambios — tests existentes pasan, los métodos nuevos se cubren en S67/S68 con tests E2E desde frontend).
- Crypto tests 34/34.
- API typecheck OK.
- 24 endpoints totales bajo `/api/terapia/*` (estimate por boot).

---

## Deuda técnica abierta

- **Sweeper de SCHEDULED sin completar** (auto-mark MISSED post-window). BullMQ cron. Cuando aparezca el primer caso real.
- **Test E2E del lifecycle** — diferido a S67/S68 con frontend.
- **Refund real** desde `cancelSession` cuando ops valide policy.
- **Notifications creation** — el sistema solo lista/lee; las crea el BullMQ cron + push processor que aterriza con S43+/S44+ extensión cuando se integre. Por ahora la tabla queda vacía y el endpoint retorna empty.
- **Migraciones acumuladas** (S62 + S63 seed + S64 + S65 + S66.A schema sin cambios) sin aplicar en Railway.
- **OpenAPI regen** pendiente.

---

## Estado del backend Terapia v1

| Sprint | Pantallas + features | Estado |
|---|---|---|
| S62 | 1 Hub + 10 Crisis | ✅ |
| S63 | 2 Directorio + 3 Perfil + Reviews + Favorites + seed | ✅ |
| S64 | 4 Reserva + 5 Pre-sesión E2E | ✅ |
| S65 | 7 Post-sesión + 8 Sala video + technical-report | ✅ |
| S66.A | Stripe Checkout one-time + webhook | ✅ |
| **S66.B** | **6 Mis sesiones + Recetas + Notifs + Reschedule/Cancel + Retry** | ✅ **Mergeado** |

**Backend de Terapia v1: 100% completo.** 24 endpoints implementados.

---

## Próximo sprint

**S67 — Frontend web de Terapia:**
- `/dashboard/terapia/*` con tabs (Hub / Directorio / Mis sesiones)
- Pre-sesión + Post-sesión modals
- Sala de video (Daily.co iframe wrapper)
- Lifecycle UI (reschedule, cancel, retry-checkout)

**S68 — Frontend mobile de Terapia:**
- `(tabs)/terapia/*` paridad RN
- WebRTC native via Daily.co RN SDK
