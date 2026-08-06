# Sprint S69 — DailyVideoProvider real (Daily.co REST API)

**Fecha:** 2026-06-09
**Rama:** `feature/sprint-s69-daily-video-provider`
**Tests:** 522/523 API (509 → 522, +13 nuevos · 1 skipped sentinel) + web 50/50 + mobile 20/20 + crypto 34/34
**ADR aplicado:** [0020 — Video provider Daily.co](docs/adr/0020-video-provider-daily-co.md) — escrito en S65, ahora implementado.

---

## Lo que se construyó

Cierra el último gap del backend de Terapia v1. Hasta ahora `joinSession` devolvía `fake-room://session-XXX` desde `ConsoleVideoProvider`; este sprint introduce `DailyVideoProvider` que llama a la Daily.co REST API real con `DAILY_API_KEY`. Selector via env.

### Implementación

- **`apps/api/src/terapia/providers/daily-video.provider.ts`** — implementa `IVideoProvider`:
  - `createRoom`: `POST /v1/rooms` con `privacy: "private"`, `properties.exp`, `enable_recording: false`, `enable_chat: false`, `max_participants: 2`, `eject_at_room_exp: true`. **Idempotente**: si Daily devuelve 409 (room existe), fetch el room y devuelve la URL existente.
  - `createJoinToken`: `POST /v1/meeting-tokens` con `properties.room_name`, `user_name`, `is_owner`, `exp`.
  - `destroyRoom`: `DELETE /v1/rooms/:name`. **404 swallow** (room ya borrado = idempotente).
  - `isConfigured`: true sólo si ambos `DAILY_API_KEY` + `DAILY_DOMAIN` presentes.
  - 2 helpers puros exportados: `roomNameFor(sessionId)` y `nameFromUrl(roomUrl)`.
- **`env.schema.ts`** extendido con `VIDEO_PROVIDER` (`"console" | "daily"`, default `console`), `DAILY_API_KEY`, `DAILY_DOMAIN`. **superRefine** gate: si `VIDEO_PROVIDER=daily` y falta cualquiera de los 2, el boot falla con mensaje claro.
- **`terapia.module.ts`** refactorizado: `VIDEO_PROVIDER` ahora es `useFactory` que selecciona console vs daily desde `ConfigService.get("VIDEO_PROVIDER")`. Misma técnica que `PaymentService` + `VoiceProvider`.

### Tests (+13)

`daily-video.provider.spec.ts`:

- `isConfigured` flags (false sin key, true con todo).
- `createRoom` happy path — verifica URL/method/headers/body shape (privacy, max_participants, enable_recording=false).
- `createRoom` 409 → fetch existing room → retorna URL.
- `createRoom` 500 → throw `DAILY_CREATE_ROOM_FAILED:500`.
- `createJoinToken` happy path — verifica room_name extracted from URL, user_name, is_owner.
- `destroyRoom` happy path — verifica DELETE URL.
- `destroyRoom` 404 → swallow (resolves undefined).
- `createRoom` con key vacío → throw `DAILY_NOT_CONFIGURED`.
- `roomNameFor` (3 tests) — prefijo, char stripping, cap a 100.
- `nameFromUrl` (2 tests) — extract de URL, null sobre malformed.

Mock de `fetch` vía `vi.stubGlobal("fetch", ...)`. `ConfigService` mockeado como objeto plano (typeof `as unknown as ConfigService` — no instancia real).

### Sin cambios

- **API surface** intacta — `IVideoProvider` interface no cambió. `TerapiaService.joinSession` sigue llamando `this.video.createRoom` + `createJoinToken` y solo se entera del provider seleccionado por DI.
- **Frontend** intacto — el web `VideoRoom.tsx` ya hace branch en `roomUrl.startsWith("https://")` para mostrar el stub demo vs cargar Daily SDK. Cuando ops setee `VIDEO_PROVIDER=daily` en prod, las URLs pasarán a `https://psico.daily.co/session-...` automáticamente.
- **OpenAPI/cliente** — sin shape changes. `generate:check` OK.

---

## Decisiones

1. **`fetch` nativo de Node 20** — sin `@daily-co/daily-server` sdk. Lib oficial pesa ~80KB y solo wraps los mismos 3 endpoints REST. Ahorrar deuda transitiva (Sentry, etc.).
2. **`privacy: "private"`** — solo el join token autoriza acceso. Sin token = 403 del Daily.
3. **`enable_recording: false`** explícito — privacy default. Para v1 no grabamos. Si el día que cambie, este flag toca + ADR update.
4. **`enable_chat: false`** — sin chat de texto. Si el user/terapeuta necesitan compartir algo, lo hacen verbalmente o por la URL del Diario (E2E).
5. **`max_participants: 2`** — sesión 1:1. Pareja/familia tienen su modalidad propia con sala distinta.
6. **`eject_at_room_exp: true`** — al hit del exp, todos out. Backstop frente al timer del cliente que podría desfasarse.
7. **Idempotent `createRoom`** — el flow real: al `joinSession`, si la sala ya existe (porque hubo un retry), `409 → GET` la encuentra. Si el ops borra accidentalmente, el siguiente join crea nueva con mismo nombre.
8. **`name = session-<sessionId>`** prefix — facilita debugging en el dashboard de Daily. `[a-zA-Z0-9_-]` filter para evitar URL chars.
9. **`destroyRoom` 404 = success** — idempotent path para evitar throwear cuando el job de cleanup corre 2 veces o el ops borró manual.
10. **`Logger` para errores, no `throw` para destroyRoom** — la sala expira sola; mejor degradar a warning que romper el cleanup chain.

---

## Privacy

- **Sesiones NO se graban** — `enable_recording: false` en cada room.
- **Sin chat persistido** — `enable_chat: false`.
- **Tokens de join son short-lived** (caducan con la sesión + grace de 15min en `joinSession` lógica).
- **Daily.co tiene TLS** end-to-end para el control plane; el media (WebRTC) es peer-to-peer cuando posible con fallback TURN. ADR 0014 §C documenta esto.
- **No logging del room URL** en producción (Logger captura solo el code path, no la URL completa para evitar leaks en log aggregators).

---

## Smoke verification

- API tests 522/523 (+13 nuevos).
- API typecheck OK.
- API lint clean (1 `eslint-disable-next-line` documentado para `ConfigService` value import — mismo patrón de PushService).
- OpenAPI `generate:check` OK.
- @psico/crypto 34/34, web 50/50, mobile 20/20 sin cambios.

---

## Deuda técnica abierta

- **Provisión del subdomain Daily** — ops crea cuenta en daily.co, obtiene `DAILY_API_KEY` y configura `DAILY_DOMAIN=<subdomain>.daily.co`. Bloqueante para deploy del provider real.
- **`turn-only` policy** — para usuarios con NAT extremo, Daily soporta `properties.geo: "lima"` + TURN forzado. Cuando tengamos primeros usuarios fuera de Quito, ajustar.
- **Recording opt-in** — si en v2 el user/terapeuta pide grabar para revisar, agregar flag en `TherapySession` + flip `enable_recording: true` por room.
- **Pre-call lobby** — Daily soporta `enable_prejoin_ui: true` para que el user testee mic/cam antes. Útil UX, fuera de scope S69.
- **Daily webhooks** — endpoint que captura `meeting.ended`/`meeting.participant-joined` para precisar `actualDurationSec` en `TherapySession`. Sprint propio.
- **Metric:** `BillingUsageDay.therapyMinutes` no existe aún. Cuando se contabilice para billing B2B, agregar.
- **Token refresh mid-call** — si la sesión se extiende >2h, el cliente actual no auto-renueva el token. Daily corta. v1 OK porque 50 min < 2h, pero documentar.

---

## Próximo paso

**Cuando ops provisione Daily**:

1. `DAILY_API_KEY` en Railway envs (API service).
2. `DAILY_DOMAIN=psico.daily.co` (subdomain real).
3. `VIDEO_PROVIDER=daily` flip.
4. Smoke en producción: reservar sesión paid → join → recibir URL `https://psico.daily.co/session-XXX` → frontend (web/mobile) abre iframe/Linking real.

Hasta ese día, el sistema sigue funcionando con `ConsoleVideoProvider` y el front muestra la "Sala demo" sin romper UX.

---

## Próximos sprints candidatos

- **S70 — Stripe Universal Links / deeplink return** (mobile)
- **S71 — Sala video embedded mobile WebView** (depende de Daily real)
- **S72 — Daily webhooks** (`actualDurationSec`, métricas reales)
