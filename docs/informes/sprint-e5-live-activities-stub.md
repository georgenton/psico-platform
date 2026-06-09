# Sprint E.5 — Live Activities backend stub

**Fecha:** 2026-06-09
**Rama:** `feature/sprint-e5-live-activities-stub`
**Tests:** 461/462 API + 34/34 crypto + 50/50 web + 20/20 mobile (451 → 461, +10 nuevos · 1 skipped sentinel)
**ADR:** [0012 — Live Activities via APNs strategy](../adr/0012-live-activities-via-apns-strategy.md)

---

## Lo que se construyó

Backend plumbing completo para Live Activities (iOS 16.1+ Dynamic Island) **sin** trabajo nativo iOS. Sigue el patrón provider-strategy de Stripe (S6B) y Voice (S8). Cuando llegue el Apple Developer account ($99/año), un solo bind cambia y todo el roundtrip queda activo.

### Backend

**Schema:**
- Enum `LiveActivityKind { TERAPIA_SESSION, LECTOR_ACTIVE, ECO_ACTIVE }`.
- Model `LiveActivityToken { id, userId, activityId, kind, pushToken, bundleId, createdAt, dismissedAt }`.
- `@@unique([userId, activityId])` + índices `[userId]` + `[dismissedAt]`.
- Migración `20260609100000_e5_live_activities` (aditiva, generada manualmente para no aplicar a Railway aún).

**Endpoints (3) bajo `/api/push/live-activity/*`:**
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/` | JWT | Registrar / refresh APNs token per-activity (upsert) |
| GET | `/active` | JWT | Lista actividades vivas del user |
| DELETE | `/:activityId` | JWT | Dismiss + APNs end-event si configurado |

**Provider strategy:**
- `IApnsProvider` interface (analog a IPaymentProvider).
- `ConsoleApnsProvider` (no-op + log, default v1).
- DI token `APNS_PROVIDER` para swap futuro a `Apns2Provider` real.
- Bind en `LiveActivitiesModule.providers`.

**`LiveActivitiesService`:**
- `register(userId, dto)` — upsert idempotente sobre (userId, activityId).
- `dismiss(userId, activityId)` — manda APNs end-event si configurado, marca `dismissedAt` (no delete).
- `listActive(userId)` — non-dismissed only.
- `pushUpdate(userId, activityId, contentState, opts)` — para background jobs futuros. Retorna `{ ok, reason }` (not_configured | invalid_token | undefined).

**Wire en `app.module.ts`** entre PulsoModule y la línea de TODO senior.

### Tests (+10)

`live-activities.service.spec.ts`:
1. register — upsert con shape correcto + retorna provider state.
2. dismiss — 404 si no existe.
3. dismiss — idempotente si ya dismissed.
4. dismiss — manda end-event + marca dismissedAt.
5. dismiss — marca dismissedAt aunque APNs falle (swallow).
6. pushUpdate — not_configured cuando provider es stub.
7. pushUpdate — prune row cuando APNs retorna invalidToken (410).
8. pushUpdate — happy path delivery.
9. pushUpdate — 404 si no existe o ya dismissed.
10. listActive — solo non-dismissed.

---

## Decisiones

1. **Stub primero, real después** — el design mismo dice "No es prioridad v1". El stub permite mobile prebuild + Widget extension dev en paralelo.
2. **Provider strategy** — mismo patrón ya conocido (Stripe, Voice). 1 línea swap a `Apns2Provider`.
3. **`isProviderConfigured` en response del register** — para que el cliente sepa que el push real no va a llegar.
4. **`dismissedAt` soft-delete** — keep audit trail; cron de pruning weekly como deuda.
5. **`PATCH` para updates no entrega** — solo register/dismiss desde cliente. Updates server-driven van por `LiveActivitiesService.pushUpdate()` desde jobs.
6. **Migración no aplicada a Railway** — se acumula con todas las pendientes desde S9. Aplicar todas juntas en deploy.
7. **No tocar `NotificationsModule`** — Live Activities es ortogonal a regular push (DeviceToken). Módulo separado.

---

## Privacidad

ADR 0012 §"Privacidad — no negociable" prohíbe contentState con:
- `textCiphertext` / `textNonce` del Diario.
- `assistantText` / userText plaintext de Eco.
- Material derivado de la seed BIP39.

Sí permite: IDs opacos, counters, strings UI cortos no-E2E (título de capítulo público, nombre del terapeuta).

`ConsoleApnsProvider` loggea `contentState` a stdout — caller responsable del invariant.

---

## Smoke verification

- API tests 461/462.
- @psico/crypto 34/34.
- API typecheck OK.
- API lint: 4 warnings preexistentes (sin errores nuevos).
- Schema valid (`npx prisma validate`).

---

## Deuda técnica abierta

- **Apple Developer account + `.p8` + Team ID + Bundle ID** — bloqueante para el swap a `Apns2Provider` real.
- **Mobile app integration** — `expo-modules-core` + Activity widget en Swift. Requiere prebuild + Xcode 15+.
- **`Apns2Provider` real** — lib `apns2` (HTTP/2 a `api.push.apple.com`). 1 archivo nuevo.
- **Cron de pruning** weekly sobre `dismissedAt < now() - 7d`.
- **Env vars** APNS_TEAM_ID, APNS_KEY_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID, APNS_ENVIRONMENT — sin configurar en Railway.
- **Background jobs** que invocan `pushUpdate` — TerapiaSession countdown, Lector chapter progress, Eco "responding". 0 implementados v1.
- **Migración acumulada** con todas las de S9+.
- **Tipos compartidos (`@psico/types`)** — no agregados v1 porque mobile no consume todavía. Cuando la mobile UI llegue, exponer `LiveActivityKind` + DTOs.
