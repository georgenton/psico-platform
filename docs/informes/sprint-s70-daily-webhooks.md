# Sprint S70 — Daily.co webhooks (captura de duración real de sesión)

**Fecha:** 2026-06-10
**Rama:** `feature/sprint-s70-daily-webhooks`
**Tests:** 543/544 API (525 → 543, +18 nuevos · 1 skipped sentinel) + 24 web + 20 mobile + 34 crypto
**ADR:** ninguno (sprint orientado a integración, no a decisión de arquitectura).

---

## Lo que se construyó

Cierra el loop con Daily.co: hasta S69 sabíamos cuándo el usuario hacía `joinSession` (creaba la sala), pero **no** sabíamos cuándo realmente empezó o terminó la sesión, ni cuánto duró. Este sprint mete los webhooks de Daily.co dentro de un endpoint con verificación HMAC y mapea los eventos a updates de `TherapySession`.

### Schema

- `TherapySession.actualDurationSec Int?` — segundos reales (distinto a `durationMin`, la duración planeada).
- Migración aditiva `20260610200000_s70_daily_webhooks/migration.sql`.

### Endpoint

```
POST /api/terapia/webhooks/daily
```

- **No requiere JWT** — Daily.co no puede autenticar como usuario.
- **`@SkipThrottle()`** — un meeting puede emitir varios eventos en pocos segundos.
- **HMAC SHA-256** del raw body validado contra `DAILY_WEBHOOK_SECRET` (header `X-Webhook-Signature` o fallback `X-Daily-Signature`).
- **Fail-closed**: si `DAILY_WEBHOOK_SECRET` no está seteado, responde 503 — un entorno mal configurado no debe aceptar cambios de estado anónimos.

### Service

`DailyWebhookService` con 3 responsabilidades:

1. `isConfigured()` — true solo cuando hay secret.
2. `verifySignature(rawBody, header)` — HMAC SHA-256 con `timingSafeEqual` (ataque por timing imposible).
3. `process(event)` — mapea los 4 eventos:

| Event | Action |
|---|---|
| `meeting.started` | Set `startedAt`, promueve `SCHEDULED → IN_PROGRESS` (preserva `CANCELLED`) |
| `meeting.ended` | Set `endedAt` + `actualDurationSec` (de `payload.duration` o `endedAt - startedAt`), promueve a `COMPLETED` |
| `participant.joined/left` | No-op (logged) |

**Idempotente**: re-aplicar el mismo evento es un no-op cuando ya hay timestamp (`{status: "duplicate"}`). Daily a veces reintenta eventos.

### Helper

`sessionIdFromRoomName(roomOrUrl)` — extrae `clxyz...` de `session-clxyz...` o de la URL completa. Reverso de `roomNameFor()` del provider.

### Tests (+18)

`daily-webhook.service.spec.ts`:
- 4 tests de `isConfigured` + `verifySignature` (incluyendo HMAC válido, mismatch, missing header, no secret)
- 8 tests de `process`: ignore missing room, ignore non-session room, ignore unknown session, `meeting.started` flow, idempotency, no override de CANCELLED, `meeting.ended` con/sin `duration` reportado, idempotency end, no promueve CANCELLED a COMPLETED, participant events no-op
- 4 tests de `sessionIdFromRoomName`: extract de prefix, null en non-session, null en empty id, extracción desde URL completa

---

## Decisiones

1. **Endpoint dentro de `TerapiaModule`** (no en su propio módulo) — comparte `PrismaService` y `ConfigService`, no necesita aislamiento.
2. **Fail-closed cuando no hay secret** (503, no 200 silencioso) — un misconfig en prod debe bloquear, no aceptar eventos anónimos.
3. **HMAC con `timingSafeEqual`** — defensa estándar contra side-channel timing. Length-check primero (early exit cuando largos difieren).
4. **No usar SDK de Daily** — la verificación es 4 líneas con `node:crypto`. SDK añadiría peso transitivo (sigue patrón S47 con `web-push` solo cuando sumaba valor real).
5. **`participant.joined/left` ignorados** — Pulso podría agregarlos para engagement metrics en futuro, pero v1 no los persiste.
6. **`status` preservado al recibir `meeting.started`/`ended` cuando ya está `CANCELLED`** — Daily podría mandar eventos de meetings que fueron canceladas pero alguien entró por error a la URL antes del cleanup.
7. **`actualDurationSec` fallback** — si Daily no manda `payload.duration`, calculo `(endedAt - startedAt) / 1000`. Si no hay `startedAt`, queda null.
8. **Path `/api/terapia/webhooks/daily`** (no `/api/webhooks/...`) — agrupado bajo Terapia para coherencia. Stripe también usa `/api/subscriptions/webhook` por la misma razón.
9. **Reusar `nameFromUrl()` del provider** para parsear roomUrl — DRY.
10. **`@ApiTags("terapia")`** — Swagger lo agrupa con el resto del módulo. Daily-internal, pero útil para ops.

---

## Smoke verification (local)

- API typecheck OK.
- API lint clean (4 warnings preexistentes, sin errores nuevos).
- API tests 543/544 (525 → 543, +18 nuevos · 1 skipped sentinel).
- Migración syntax OK (`prisma generate` corre limpio).

---

## Deuda técnica abierta

- **Configurar webhook en Daily.co dashboard** después del deploy: registrar la URL `https://psico-platform-production.up.railway.app/api/terapia/webhooks/daily` con un secret. Se hace una vez vía `POST /v1/webhooks` con `url` + `hmac`.
- **Setear `DAILY_WEBHOOK_SECRET`** en Railway envs (debe coincidir con el secret registrado en Daily). Si quedan sin setear, el endpoint responde 503 (fail-closed).
- **Persistir `participant.joined/left`** para engagement metrics en Pulso v2 — actualmente no-op.
- **Webhook signed/encrypted con timestamp anti-replay** — el header de Daily no incluye timestamp, así que un atacante con acceso al cuerpo + signature puede re-sendear. Mitigación menor: Daily firma el body completo (incluye `event_ts`), pero no usamos ese ts para rechazar viejos. Cuando importe, agregar tolerancia de ±5 min en `event_ts`.
- **Tests e2e con supertest** del endpoint (signature válida vs inválida vs missing). Cubrir cuando algo del controller cambie.
- **Retry policy** — Daily reintenta eventos hasta 24h si nuestro endpoint no responde 2xx. Confiamos en eso. Si quisiéramos garantías más fuertes, agregar BullMQ queue antes de aplicar.

---

## Próximo paso

1. Merge a `develop` → sync a `main` → push.
2. Esperar que Railway despliegue (~5 min).
3. **Acción manual**: registrar el webhook en Daily.co vía API con el secret que setearé en Railway.
4. **Smoke test E2E real**: cuando suceda una sesión real (ventana de join abierta), verificar que `actualDurationSec` se popula.
