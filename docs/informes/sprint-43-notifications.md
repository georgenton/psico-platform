# Sprint S43 — Push infrastructure (device tokens + Expo)

**Rama sugerida:** `feature/sprint-43-notifications`
**Tests:** 370 API + 34 crypto (363 → 370, +7 nuevos · 1 skipped sentinel).

---

## 1. Scope re-evaluado

Sprint planificado originalmente con TRES piezas: (a) push infra, (b) WeeklyDigest processor, (c) InactiveNudge processor.

**Scope final: solo (a).** Razón: los processors requieren cron orchestration en `apps/api/src/worker.ts` + BullMQ delayed jobs + tests de scheduling + email templates. Eso es 1 sesión completa por sí solo y se merece su propia sprint con sus tradeoffs explícitos (timezone awareness, opt-out flow, etc).

S43 deja **listo todo el plumbing** — DeviceToken + endpoints + PushService + mobile integration. Los processors aterrizan en S44 con la infra ya cocinada.

---

## 2. Decisiones

1. **Plain fetch sobre `expo-server-sdk`** — el endpoint Expo Push API es un POST JSON simple. La SDK añade ~400KB para reconexión WebSocket que no usamos. `PushService` con fetch + 80 líneas hace lo mismo.
2. **`PushReceipt` con `invalidToken`** — el caller (futuro processor) lee `invalidToken` para `DELETE` el row de DeviceToken sin lógica adicional. Self-cleaning.
3. **Idempotency vía `unique(token)`** — DeviceToken usa `@unique` sobre el token de Expo. Upsert por token permite re-registrar el mismo device sin duplicar rows. También maneja account-switch en el mismo dispositivo (re-asigna userId).
4. **Mobile registra en `useEffect([user])`** — cuando `user` pasa de null a non-null, dispara registro. Idempotent en server, así que el cold-start no crea duplicados.
5. **`pushIdStore` en SecureStore** — guarda el ID del DeviceToken row para poder revocarlo en logout. Si SecureStore se pierde (reinstall), no pasa nada — el próximo registro hace upsert sobre el mismo token.
6. **No web push** — el design (`14-dynamic-island.md`) lo difiere a post-v1. El enum `DevicePlatform` ya tiene "WEB" para no hacer migration de schema cuando aterrice.
7. **No Apple Live Activities / Dynamic Island** — iOS-only, requiere widget extension + APNs config separado. Diferido fuera de scope v1.
8. **`lastNudgedAt` en User** — campo agregado al User para que el InactiveNudgeProcessor (S44) pueda evitar spam. Lo declaro acá porque va con la migración 20260605200000.

---

## 3. Cambios

### Schema (`apps/api/prisma/schema.prisma`)

- Enum `DevicePlatform { EXPO, WEB }`.
- Model `DeviceToken { id, userId, platform, token (@unique), deviceLabel?, createdAt, lastSeenAt }`.
- `User.deviceTokens DeviceToken[]` relation.
- `User.lastNudgedAt DateTime?` (Sprint S44 lo usa).
- Migración aditiva `20260605200000_s43_device_tokens/migration.sql`.

### Backend

- `apps/api/src/notifications/push.service.ts`:
  - `sendToTokens(tokens, message)` retorna `PushReceipt[]` con `status` + `invalidToken` (para que caller borre stales).
  - 5 unit tests con `fetch` mockeado: happy path, sin tokens válidos, `DeviceNotRegistered` flag, transport error, HTTP 5xx.
- `apps/api/src/notifications/devices.controller.ts`:
  - `POST /api/notifications/devices` (JwtAuthGuard, upsert por token, idempotente).
  - `DELETE /api/notifications/devices/:id` (deleteMany scoped al owner).
  - 2 unit tests: upsert idempotency + ownership scope.
- `notifications.module.ts` extendido con `DevicesController`, `PushService`, importa `PrismaModule`.

### Tipos + cliente

- `@psico/types` +3: `DevicePlatform`, `RegisterDeviceRequest`, `RegisterDeviceResponse`.
- `@psico/api-client` `notificationsApi` con `registerDevice` + `unregisterDevice`.
- `generated.ts` 94.2 KB → 96.1 KB.

### Mobile

- Deps: `expo-notifications@~0.29.14`, `expo-device@~7.0.3`.
- `apps/mobile/src/notifications/push-registration.ts`:
  - `tryRegisterPushToken()` — permission flow + Expo push token + POST a `/notifications/devices`.
  - `tryUnregisterPushToken(id)` — DELETE best-effort.
  - Configures foreground notification handler (banner + sound, no badge).
  - Android channel "default" en `setNotificationChannelAsync`.
- `apps/mobile/src/store/secure-store.ts` extendido con `pushIdStore`.
- `apps/mobile/src/context/auth.tsx`:
  - `useEffect([user])` registra el token cuando el user se autentica.
  - `handleUnauthenticated` revoca el token en logout.

### Sin cambios

- Web — sin push en v1.
- Endpoints existentes.

---

## 4. Verificación

- API tests: **370/370** + 1 skipped sentinel.
- @psico/crypto 34/34.
- API typecheck + lint OK (4 warnings preexistentes).
- Web typecheck + lint OK.
- Mobile typecheck + lint OK.
- OpenAPI `generate:check` in sync.

---

## 5. Deuda técnica abierta

- **S44 — WeeklyDigestProcessor + InactiveNudgeProcessor** — el lever real de retention. Necesita BullMQ cron en worker.ts + email template para digest + lógica de opt-in respect (`NotificationSettings.weeklyReport`, `dailyReminder`).
- **No usage UI para opt-in/out** — el user no puede silenciar push notifications desde la app. Cuando S44 aterrice, exponer en `/(tabs)/profile` o `/dashboard/security`.
- **`lastNudgedAt` sin tests** — el campo está pero nada lo escribe hasta S44.
- **Sin tracking de delivery success** — Expo retorna receipts después de ~30min. Para verificarlos hace falta otro processor `expo-receipt-poll`. Diferido — Expo handle internally enough for v1.
- **Sin retries en `tryRegisterPushToken`** — si el primer POST falla, no se reintenta hasta el próximo cold-start con `user` no-null. Aceptable: push no-crítico.
- **Web push (VAPID)** — diferido a post-v1.
- **Dynamic Island / Live Activities** — iOS-specific, requiere widget extension. Diferido fuera de v1.

---

## 6. Resumen para Notion

**Qué cerramos en Sprint S43:**

- `DeviceToken` schema + migración aditiva.
- `PushService` (Expo Push API via fetch) con 5 tests cubriendo happy path + error pruning.
- `DevicesController` (`POST/DELETE /api/notifications/devices`) con upsert idempotente.
- Mobile integration: `expo-notifications` + auto-register on auth + auto-unregister on logout.
- Tipos + `notificationsApi` cliente.

**Qué viene:**

- **S44** — Processors: `WeeklyDigestProcessor` (lunes 7am UTC, email + push) + `InactiveNudgeProcessor` (nightly, push). Aprovecha la infra ya cocinada.
- UI de opt-in/out de notifications.
- Bugfix #2 Stripe price IDs (tarea tuya).
