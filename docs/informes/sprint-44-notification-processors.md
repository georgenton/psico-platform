# Sprint S44 — Notification processors (WeeklyDigest + InactiveNudge)

**Rama sugerida:** `feature/sprint-44-notification-processors`
**Tests:** 383 API + 34 crypto (370 → 383, +13 nuevos · 1 skipped sentinel).

---

## 1. Scope

Cierra la deuda de S43 — entrega los dos processors prometidos sobre la infra de push ya cocinada:

1. **WeeklyDigestProcessor** — lunes 07:00 UTC. Envía email digest a usuarios con `weeklyReport=true` + push a quienes además tengan `dailyReminder=true` con device tokens registrados.
2. **InactiveNudgeProcessor** — nightly 18:00 UTC. Busca usuarios silenciosos hace 3+ días con `dailyReminder=true` y los nudgea con push (no email).

Sin tocar:

- Schema (lo único nuevo, `User.lastNudgedAt`, ya estaba desde S43).
- Mobile / Web — purely server-side.
- Tipos compartidos / OpenAPI.

---

## 2. Decisiones

1. **2 queues nuevas** — `WEEKLY_DIGEST` + `INACTIVE_NUDGE`. Cada una con su processor + cron en `JobsService.onModuleInit`.
2. **UTC en todos los crons** — 07:00 UTC = 2am GYE, 03:00 EDT. Para el digest semanal, esto entrega el email cuando empieza el lunes en Latam y antes del mediodía en EU. La complejidad de timezone-aware schedules no se justifica con la base de users actual.
3. **Doble canal en digest, single en nudge** — el digest semanal usa email + push porque es un evento "esperado" (suscripción). El nudge usa solo push porque email diario sería spam.
4. **`weeklyReport` vs `dailyReminder` como flags separados** — el primero controla email; el segundo gates push. Una persona puede recibir email pero no push, y viceversa.
5. **Privacy preserved** — el digest NUNCA incluye texto del diario. Solo categorical counts + tags (plaintext metadata que el user mismo escribió).
6. **`lastNudgedAt` solo se bumpea cuando hay al menos un receipt OK** — si todos los tokens están stale, el processor borra los stales y deja al user disponible para re-nudge la próxima noche cuando re-instale.
7. **Stale-token pruning inline** — ambos processors borran tokens con `DeviceNotRegistered` antes de continuar. Self-healing sin job adicional.
8. **Fanout-en-processo** (no per-user jobs) — mismo patrón que `DailyUsageProcessor`. Una tirada nocturna toca DAU users (a este escala bien bounded).
9. **`dryRun` en InactiveNudge** — útil para ops: cuántos candidatos hay sin enviar push. No incluido en WeeklyDigest por simplicidad.
10. **`patronesUrl` hardcoded** — `https://psico-platform-web.vercel.app/dashboard/patrones`. Cuando hagamos i18n + custom domains, mover a config. v1 acepta.

---

## 3. Cambios

### Queue infrastructure (`apps/api/src/jobs/queue-names.ts`)

- 2 nuevas queues: `WEEKLY_DIGEST`, `INACTIVE_NUDGE`.
- 2 payloads: `WeeklyDigestJobPayload`, `InactiveNudgeJobPayload`.
- 2 job names: `RUN_WEEKLY_DIGEST`, `SEND_INACTIVE_NUDGE`.

### Producer (`apps/api/src/jobs/jobs.service.ts`)

- 2 `upsertJobScheduler` calls en `onModuleInit`:
  - Weekly: `pattern: "0 7 * * 1"` UTC.
  - Nightly: `pattern: "0 18 * * *"` UTC.
- Cada uno con `attempts: 3` + backoff exponencial (5min/25min/2h).
- 2 nuevos `@InjectQueue` en el constructor.

### Producer module (`apps/api/src/jobs/jobs.module.ts`)

- `BullModule.registerQueue` extendido con las 2 nuevas queues.

### Worker module (`apps/api/src/jobs/worker.module.ts`)

- `BullModule.registerQueue` extendido.
- `providers` extendido con `WeeklyDigestProcessor` + `InactiveNudgeProcessor`.

### WeeklyDigestProcessor (`apps/api/src/jobs/processors/weekly-digest.processor.ts`)

- Inyecta `PrismaService`, `ResendService`, `PushService`.
- `process()`:
  - Resuelve `weekStart` (Lunes 00:00 UTC de la semana pasada, o override).
  - `findMany` users con `weeklyReport=true` + `isActive=true`. Pre-fetch device tokens en mismo query.
  - Por user: `findMany` diary entries + `count` eco messages + computa dominant mood + top tags.
  - Llama `ResendService.send` con `weeklyDigestEmail` template.
  - Si tiene tokens + `dailyReminder=true`: `PushService.sendToTokens`.
  - Prune Expo `DeviceNotRegistered` flags.
- Fallo per-user NO aborta el run (catch + log + continue).

### InactiveNudgeProcessor (`apps/api/src/jobs/processors/inactive-nudge.processor.ts`)

- Inyecta `PrismaService`, `PushService`.
- `process()`:
  - Construye cutoffs: silence 3 días, between-nudges 4 días.
  - `findMany` con compound `where`:
    - `notificationSettings.dailyReminder=true`
    - `diaryEntries.some({})` (has written ever)
    - `NOT diaryEntries.some({ createdAt: { gte: silenceCutoff } })`
    - `OR (lastNudgedAt null, lastNudgedAt < nudgeCutoff)`
  - Si `dryRun=true`: log y exit.
  - Por candidato con tokens: push + prune stales + bump `lastNudgedAt` si receipt OK.

### Email template (`apps/api/src/notifications/templates/weekly-digest.template.ts`)

- `weeklyDigestEmail(props)` retorna `RenderedEmail`.
- HTML con stats en lista + CTA "Ver tu mapa emocional →".
- Plain text con misma info.
- "No activity" branch con copy más suave.
- Footer con instrucción para opt-out.

### Tests

- `weekly-digest.processor.spec.ts` — **7 tests**: unknown job names, email+push happy, no tokens (email only), `dailyReminder=false` (email only), stale token pruning, "no activity" copy, per-user failure doesn't abort.
- `inactive-nudge.processor.spec.ts` — **6 tests**: unknown job names, where clause shape, skip no tokens, push+bump on ok, no bump if all stale, dryRun.

### Sin cambios

- `JobsService.spec.ts` — Skip pattern de onModuleInit en NODE_ENV=test sigue funcionando para las 2 nuevas crons.
- Esquema Prisma — `User.lastNudgedAt` ya existía desde S43.

---

## 4. Verificación

- API tests: **383/383** + 1 skipped sentinel.
- @psico/crypto: 34/34 (sin cambios).
- API typecheck + lint OK (4 warnings preexistentes).
- OpenAPI `generate:check`: in sync.

---

## 5. Deuda técnica abierta

- **Timezone-aware schedules** — un user en Tokio recibe el digest "lunes 07:00 UTC" = lunes 16:00 hora local. Aceptable v1, pero idealmente el digest aterriza domingo noche en LATAM (≈8pm GYE = 01:00 lunes UTC). Cuando tengamos i18n + timezone field en Profile, hacer un fan-out per-timezone.
- **Sin opt-in UI** — el user no puede silenciar el digest desde la app. Cuando entremos al perfil ampliado, exponer `weeklyReport`, `dailyReminder` toggles.
- **Sin tracking de email engagement** — Resend ofrece open/click webhooks. Cuando lleguemos a v2 podemos enrich `BillingUsageDay` con `digestOpened`.
- **`patronesUrl` hardcoded** — debería leer de `WEB_BASE_URL` env. Refactor cuando aterricen custom domains.
- **Expo receipts no se pollean** — el push se da por entregado en cuanto Expo responde 200. Para verificar deliveries reales, agregar `expo-receipt-poll` job 30min después. Diferido.
- **`SILENCE_DAYS` y `MIN_DAYS_BETWEEN_NUDGES` hardcoded** — cuando tengamos data, A/B testear estos thresholds.
- **El digest no usa `WeeklySummary` (S10/S38)** — el row de WeeklySummary tiene un narrative editorial generado por Claude. Podríamos incluirlo en el email. Diferido porque el digest semanal solo se manda lunes mientras el WeeklySummary se regenera on-demand; quería desacoplarlos.

---

## 6. Resumen para Notion

**Qué cerramos en Sprint S44:**

- `WeeklyDigestProcessor` — lunes 7am UTC, email + push según preferences.
- `InactiveNudgeProcessor` — nightly 18:00 UTC, push para usuarios silenciosos.
- 2 queues + crons registrados via `JobsService.onModuleInit`.
- Email template `weekly-digest.html` con tono cálido + privacy hard.
- 13 tests nuevos cubriendo todos los branches.

**Qué viene:**

- UI de opt-in/out de notifications (Settings screen).
- Timezone-aware scheduling (multi-fanout).
- Tracking de Resend opens + Expo receipt poller.
- Wire `WeeklySummary` (S38) en el digest semanal.
- Bugfix #2 Stripe price IDs (tarea tuya).
