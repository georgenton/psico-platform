---
"@psico/types": minor
"@psico/api-client": minor
---

Sprint S53 — Notificaciones conscientes del huso horario.

**`@psico/types`:**

- New `UpdateTimezoneRequest { timezone: string }` — payload del nuevo endpoint
  `PATCH /api/user/timezone`.
- `UserProfileSummary` extendido con `timezone: string | null` — null = el
  cliente aún no ha hecho probe; los crons de notificaciones fallback a UTC
  hasta que se setea.

**`@psico/api-client`:**

- New `usersApi.updateTimezone({ timezone })` — idempotente, auto-llamado
  por web y mobile post-login con
  `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- `generated.ts` regenerado desde el OpenAPI spec: 96.1 KB → 101.0 KB con
  el path `/api/user/timezone` añadido.

**Backend impact (no shape changes, behavioral):**

- `WeeklyDigestProcessor` y `InactiveNudgeProcessor` ahora corren hourly UTC
  (era Mon 07:00 y daily 18:00) y filtran per-user por su local hour/weekday
  via `Intl.DateTimeFormat`. Users en LATAM ya no reciben el digest a las
  2 am local.
- Backward compat: users con `timezone === null` (legacy + pre-S53) fallback
  a UTC, preservando comportamiento S44.
