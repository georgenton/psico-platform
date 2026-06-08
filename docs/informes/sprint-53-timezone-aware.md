# Sprint 53 — Notificaciones conscientes del huso horario

**Fecha:** 2026-06-08
**Rama sugerida:** `feature/sprint-53-timezone-aware`
**Tests:** 451/452 API + 34/34 crypto + 24/24 web + 16/16 mobile (+11 nuevos · 1 skipped sentinel)
**ADRs aplicados:** ninguno nuevo (decisión documentada inline).

---

## 1 · Por qué este sprint

Desde S44 (WeeklyDigest) y S46 (auto-generate WeeklySummary), las cron jobs de notificaciones aterrizaban a horas duras **UTC**:

| Cron           | Antes            | Hora local Ecuador (UTC-5) | Hora local Madrid (UTC+1) | Hora local Tokyo (UTC+9) |
| -------------- | ---------------- | -------------------------- | ------------------------- | ------------------------ |
| Weekly digest  | Lunes 07:00 UTC  | Lunes 02:00 🌙             | Lunes 08:00 ☕            | Lunes 16:00 ☀️           |
| Inactive nudge | Diario 18:00 UTC | Diario 13:00 ☀️            | Diario 19:00 ☀️           | Diario 03:00 🌙          |

Resultado: los users en Ecuador (target principal de la validación v1) recibían el digest semanal a las **2 am** local, y los de Tokyo el nudge a las **3 am**. Deuda recurrente abierta desde S44.

S53 cierra el loop.

---

## 2 · Lo que se construyó

### Backend

**Nuevo helper** `apps/api/src/jobs/utils/timezone.ts` — puros wraps sobre `Intl.DateTimeFormat`:

- `userLocalHour(now, timezone): number` — la hora local 0-23 del user.
- `userLocalWeekday(now, timezone): number` — 0=Sun..6=Sat (mismas semantics que `Date.getDay()`).
- `isUserLocalHour(now, timezone, targetHour): boolean` — sugar.
- `isValidTimezone(tz): boolean` — delega al constructor de Intl (canonical IANA validation, sin lista hardcoded).

Cero deps nuevas. Node 20 trae ICU completo en Railway, idem mobile/web.

**`PATCH /api/user/timezone`** nuevo endpoint:

- `UpdateTimezoneDto { timezone: string }` con `class-validator` (length 1..64) + `isValidTimezone()` service-side.
- 400 `INVALID_TIMEZONE` cuando el IANA name no resuelve.
- Idempotente: `Profile.upsert({ where: { userId }, ... })` — re-PATCH con el mismo valor es no-op.
- Returns refreshed `UserMeResponse`.

**Cron schedulers refactorizados:**

- **WeeklyDigest:** `pattern: "0 7 * * 1"` (Mon 07:00) → `"0 * * * *"` (cada hora).
- **InactiveNudge:** `pattern: "0 18 * * *"` (18:00 daily) → `"0 * * * *"` (cada hora).

**Processors refactorizados con per-user TZ gate:**

- `WeeklyDigestProcessor` — añade `profile: { select: { timezone: true } }` al `findMany`. Per user, calcula `userLocalHour(now, tz) === 7 && userLocalWeekday(now, tz) === 1` (lunes 07:00 local). Skip silencioso si no match. Tests pueden injectar `nowIso` en el payload para ejercitar el gate sin depender del wall-clock.
- `InactiveNudgeProcessor` — análogo, gate por `userLocalHour(now, tz) === 18`. `nowIso` extension en el payload.
- **Backwards compat:** si `profile.timezone === null` (cuentas legacy + cuentas pre-S53), fallback a UTC. Los users sólo migran cuando hacen login y el cliente envía el `PATCH`.

**Wire de `UserProfileSummary.timezone`** en `getMe`:

- `UserMeResponse.user.timezone: string | null` ahora viene poblado desde `Profile.timezone`.
- Web layout consume esto para decidir si dispara el probe (one-shot per page load).

### Tipos compartidos

- `@psico/types`: nuevo `UpdateTimezoneRequest { timezone: string }` + extiende `UserProfileSummary` con `timezone: string | null`.

### Cliente

- `@psico/api-client`: nuevo `usersApi.updateTimezone({ timezone })`.
- `generated.ts`: 96.1 KB → **101.0 KB**, `/api/user/timezone` añadido al spec.

### Web

- `apps/web/src/actions/timezone.ts` — server action `setTimezoneAction(timezone)` con swallow-on-error.
- `apps/web/src/app/dashboard/_TimezoneSync.tsx` — Client Component invisible. `useEffect` único: lee `Intl.DateTimeFormat().resolvedOptions().timeZone` y dispara la server action si `needsProbe`.
- `apps/web/src/app/dashboard/layout.tsx` — calcula `needsTimezoneProbe = me?.user.timezone === null` y monta el probe.

### Mobile

- `apps/mobile/src/context/auth.tsx` — añade `probeTimezone()` helper memoizado que llama `usersApi.updateTimezone()`. Disparado desde `login`, `register`, y el cold-start refresh path. Fire-and-forget, errores swallow.

### Tests (+11)

- `apps/api/src/jobs/utils/timezone.spec.ts` (8 tests) — fallback UTC, IANA válidos comunes, day-rollover Tokyo, day-rollback Guayaquil, garbage handling.
- `weekly-digest.processor.spec.ts` — 4 tests TZ-aware nuevos: Guayaquil-12UTC=07local, Guayaquil-07UTC=02local skip, Tokyo-22UTC=Mon07JST (rollover), legacy null→UTC fallback.
- `inactive-nudge.processor.spec.ts` — 3 tests TZ-aware: Guayaquil-23UTC=18local send, 18UTC=13local skip, legacy null→UTC fallback.

Updates a tests legacy (todos pasaron `jobOf({})` antes; ahora un helper inyecta `nowIso` fijo a Mon 07:00 UTC / 18:00 UTC para que los users null-tz crucen el gate sin tocar TZ).

`users.controller.spec.ts` — handlers list extendida con `updateTimezone` (13 → 14).

---

## 3 · Decisiones

1. **Hourly cron con per-user filter** (no per-user cron jobs). Schedule cada hora UTC; cada user "recibe" cuando su local hour matchea el target. Una y solo una vez por semana.

2. **`Intl.DateTimeFormat` puro, sin deps.** Considerado `date-fns-tz`, `luxon`, `moment-timezone`. Descartados:
   - ICU de Node 20 ya bundlea toda la tabla IANA.
   - Bundle de cliente cero.
   - Una sola superficie de testing.

3. **Fallback graceful a UTC** cuando el TZ del user es null o garbage. No queremos que un user con TZ legacy pierda todas sus notificaciones. Comportamiento de S44 preservado.

4. **`nowIso` en payload solo para tests.** No expuesto en la UI ni en el cron, sólo facilita escribir tests deterministas sin `vi.useFakeTimers` (que rompía con BullMQ workers).

5. **Auto-detect siempre que el cliente hace login** (web + mobile). No esperamos a settings UI explícito. El TZ "current" del device es la mejor heurística de "where am I right now".

6. **Web one-shot per page load** (vía `useRef`), mobile en cada login event. Difference es intencional: web load-page = explícit user gesture y RN re-mount es menos frecuente.

7. **Mobile sobreescribe en cada login** (incluyendo cold-start). Si el user viaja, su próxima sesión actualiza la TZ — desired behavior. Idempotente backend.

8. **Tests TZ gate sin Date.now()-mocking.** El processor acepta `nowIso` para que los tests fijen el instante UTC. Más limpio que mockear el sistema clock global.

---

## 4 · Bugs corregidos durante S53

1. **`users.controller.spec.ts` test de handlers** esperaba 13 nombres; ahora hay 14 (`updateTimezone`). Updated array.
2. **`weekly-digest.processor.spec.ts` legacy tests fallaban** con TZ gate activa porque `now = new Date()` no caía en lunes 07:00 UTC. Fix: helper `jobOf` ahora inyecta `nowIso: LEGACY_MONDAY_07_UTC` por default.
3. **`inactive-nudge.processor.spec.ts` análogo.** Helper inyecta `nowIso: LEGACY_18_UTC` por default.
4. **`@ts-expect-error` en `timezone.spec.ts`** sin descripción → eslint error `ban-ts-comment`. Fix: agregué razón corta.

---

## 5 · Smoke verification

```
API tests       451/452 (+1 skipped sentinel)
Crypto tests     34/34
Web tests        24/24
Mobile tests     16/16
Total            525/526

@psico/api typecheck     ✅
@psico/api lint          ✅ (4 warnings preexistentes)
@psico/web typecheck     ✅
@psico/web lint          ✅
@psico/mobile typecheck  ✅
@psico/mobile lint       ✅

OpenAPI generate         ✅ 96.1 KB → 101.0 KB
OpenAPI generate:check   ✅ OK
```

---

## 6 · Privacy invariant preservado

- ADR 0007 (E2E Diario/Eco) intacto. El TZ que el cliente envía NO depende ni toca claves, ciphertext, o plaintext del diario.
- `Profile.timezone` es plaintext, semantically equivalente a `Profile.country` que ya existía desde S15.
- Los crons procesan metadata categórica (mood, tags, counts); el TZ gate es plain timing, no toca contenido.

---

## 7 · Deuda técnica abierta

- **Settings UI explícito** para el TZ — hoy es invisible. Si el user quiere "fijar" su TZ porque viaja, no puede. Agregar dropdown en `/dashboard/notifications` cuando UX lo justifique.
- **Tests UI dedicados** del `TimezoneSync` web (probe trigger + skip path).
- **Cron `WEEKLY_DIGEST_SCHEDULER` corre 24×/día** ahora — overhead de 23 ejecuciones que solo skipean. Para 10k+ users, considerar particionar por TZ-bucket. Para v1 (~hundreds), trivial.
- **`InactiveNudgeProcessor` no escribe `lastNudgedAt` cuando salta por TZ gate** — correcto. Pero el query SQL del candidato sigue retornando al user. Optimización: filtrar por TZ-bucket en SQL cuando user count crezca.
- **DST transitions** — `Intl.DateTimeFormat` los honra correctamente, pero el cron hourly puede "saltar" 02:00 local en spring-forward o "duplicar" en fall-back. Para los users en TZs con DST (US, EU), uno de esos lunes podrían recibir el digest 2 veces o 0. Aceptable en v1; agregar `lastDigestSentAt` cuando duela.
- **`UserMeResponse.user.timezone`** ahora exigido en consumers — Web y Mobile ya lo consumen. No hay otros consumers vía OpenAPI client.

---

## 8 · Cobertura post-S53

- **117 endpoints REST** en producción (+1 `/user/timezone`).
- **13 ADRs activos.**
- **525 tests totales** (api 451 + crypto 34 + web 24 + mobile 16).
- **40 bitácoras** en `docs/informes/`.
- Notificaciones aterrizan a las horas correctas locales del user.
