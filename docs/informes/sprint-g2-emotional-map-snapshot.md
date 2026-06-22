# Sprint G2 — EmotionalMapSnapshot mensual + EvoChart con serie real

**Fecha:** 2026-06-21
**Rama:** `feat/sprint-g2-emotional-map-snapshot`
**Scope:** Schema + cron + endpoint extension + EvoChart wire
**Tests:** 725/726 API (+4 G2) + 228/228 web

## Contexto

F2 dejó `EvoChart` con un fallback honesto: un solo dot del snapshot actual y copy "cuando acumules más meses…". G2 cierra esa deuda persistiendo snapshots mensuales del emotional map, exponiéndolos por `/api/evolucion`, y wireando el chart para renderizar la polilínea cuando hay 2+ puntos.

El score actual ya estaba cacheado 24h en Redis (`EmotionalMapService`); G2 añade el historial sin tocar el path live.

## Lo que se construyó

### Schema (`apps/api/prisma/schema.prisma`)

- Modelo `EmotionalMapSnapshot { id, userId, month, pct, values, provider, createdAt }`.
- `@@unique([userId, month])` para idempotencia del cron.
- `@@index([userId, month])` para el lookup descendiente.
- `onDelete: Cascade` — borrar el user limpia su historial.
- Migración aditiva `20260621000000_g2_emotional_map_snapshot`.
- `User.emotionalMapSnapshots EmotionalMapSnapshot[]` relation.

### Cron + processor

- `QueueName.EMOTIONAL_MAP_SNAPSHOT` + payload `EmotionalMapSnapshotJobPayload { targetMonth?, dryRun? }` + `JobName.RUN_EMOTIONAL_MAP_SNAPSHOT`.
- `JobsService.onModuleInit` registra cron `0 4 1 * *` UTC (1st de mes, 04:00). Retry 3 / 5min/25min/2h. Logs `Emotional-map snapshot scheduled · id=...`.
- `JobsModule` + `WorkerAppModule` registran la queue. WorkerAppModule importa `EmotionalMapModule` para inyectar el service.
- `EmotionalMapSnapshotProcessor` (worker): fan-out single-job. Candidate set = users con ≥1 DiaryEntry o ≥1 ReadingSession (skipea cold accounts para no llenar la tabla con snapshots neutros). Por-user error isolation (LLM 5xx → log + continue).

### Endpoint (`/api/evolucion`)

- `EvolucionResponse` extendido con `emotionalSeries: EvolucionEmotionalSeriesPoint[]`. Cada punto: `{ monthIso: "YYYY-MM-DD", pct: 0..100 }`. Sorted ascending. Máx 12 meses.
- `EvolucionService.fetchEmotionalSeries` corre en paralelo con stats + achievements.
- `@psico/types` extendido con `EvolucionEmotionalSeriesPoint`.

### Cliente

- `packages/api-client/src/generated.ts` regenerated (336 KB).

### Web (`EvoChart`)

- `EvoChart` ahora acepta `series?: EvolucionEmotionalSeriesPoint[]`. Default empty → fallback snapshot único (igual que F2).
- Cuando `series.length >= 2`: renderiza polyline + área filled lavender + dot por mes + grid horizontal + month labels en la fila `.ec-x`. Calcula delta `+N pts en M meses`.
- Helpers `scaleX` y `mapPctToY` con padding y bounds documentados.
- `formatMonth` mapea `YYYY-MM-DD` → "ene"/"feb"/etc.
- Página `/dashboard/evolucion` pasa `series={evolucion.emotionalSeries}`.

### Tests (+4)

- `emotional-map-snapshot.processor.spec.ts`: no-op unknown job · dryRun count sin write · upsert per candidate · per-user error isolation.
- `jobs.service.spec.ts` extendido con mock de la nueva queue (constructor a 10 args).
- `evolucion.service.spec.ts` extendido con mock `emotionalMapSnapshot.findMany` default a `[]` — todos los tests existentes pasan sin cambios.

## Decisiones

1. **Mensual, no diario**. La métrica es lenta — el ritmo del chart es uno por mes. Más frecuencia es ruido.
2. **No backfill histórico**. La tabla empieza vacía; los users ven el fallback hasta que pase su primer mes con el cron activo. Honesto vs fabricar pasado retroactivamente con prompts viejos.
3. **Fan-out single-job (no per-user)**. v1 scale ~1k users → un pass sequential cabe holgadamente en el timeout del job.
4. **Cold accounts excluidos**. Sin DiaryEntry ni ReadingSession → no snapshot. Evita llenar la tabla con `0.5` neutros mensuales.
5. **`(userId, month)` unique**. Cron retries son idempotentes; ops backfills sobreescriben sin duplicar.
6. **Fallback graceful en EvoChart**. Series vacía o length=1 → el snapshot-only render con copy claro. Series ≥2 → polyline real.
7. **Series cap a 12 meses**. Diseño muestra ~6; sobrecubrir da contexto sin saturar.
8. **No tests de integración con Redis real**. Mismo patrón que los demás processors — Vitest mocks + smoke manual.
9. **HomeStats contadores diferidos a G2b**. `insightsCount`/`exercisesCount`/`patternsCount` requieren cascade (HomeService + InicioV2 + types) — split para mantener PR enfocado.

## Verificación

- `pnpm --filter @psico/api typecheck` ✅
- `pnpm --filter @psico/api test` → 725/726 (+4 G2 · 1 skipped sentinel)
- `pnpm --filter @psico/web typecheck` ✅
- `pnpm --filter @psico/web lint` ✅
- `pnpm --filter @psico/web test` → 228/228
- `pnpm --filter @psico/api-client generate:check` ✅

## Deuda técnica abierta

- **G2b** (sprint propio): contadores reales en HomeStats (`insightsCount`, `exercisesCount`, `patternsCount`). Inicio sigue con etiquetas honestas (Meta semanal · Minutos de lectura) hasta entonces.
- **EvoChart tests** del path con `series.length >= 2`. G1 cubrió el fallback; el wire con serie real espera tests RTL en un sprint propio (necesita más fixture data).
- **Migración G2 sin aplicar en Railway** (acumulada con cualquier otra pendiente). Cuando se haga deploy, `prisma migrate deploy` la aplica.
- **Cron solo se activa post-deploy**. Hasta entonces la tabla está vacía y todos los users ven el fallback. Esperado.
- **Sin smoke test live del cron** (requiere Redis real). Job runs en testcontainers cuando esa infra exista.
- **Series sin per-month delta visual**. Diseño muestra "+12 pts este mes" — implementado al cierre del último vs primer punto. Por-punto deltas (highlight cuando hay salto grande) queda para v2.
- **Reflexiones+ReadingSession candidate set** podría perder users que solo usan Eco. Cuando v1 tenga más Eco-only users, agregar OR `ecoMessages: { some: {} }`.

## Privacy invariant

`EmotionalMapSnapshot` solo guarda `pct` + `values` (6 floats) + provider name. NUNCA almacena el body de entries ni metadata identificable más allá del userId. ADR 0007 intacto: el cripto E2E del Diario no se ve afectado — el provider opera sobre `mood`/`tags`/`createdAt` plaintext metadata.
