# Sprint G2b — HomeStats con insightsCount + patternsCount

**Fecha:** 2026-06-21
**Rama:** `feat/sprint-g2b-home-stats-counters`
**Tests:** 725/726 API (sin cambios) + 228/228 web

## Contexto

F3 dejó las métricas de Inicio honestas pero con dos placeholders parciales:

- "Meta semanal" → `weeklyGoalPct` (porcentaje, no count). OK pero "Meta" no es lo que el diseño llamaba "Insights".
- "Patrones" → `home.recos.length` (count de libros recomendados, no de patrones).

G2b cierra esa deuda con dos contadores reales sin tocar el shape del response:

- `insightsCount` = `WeeklySummary.count` para el usuario. Cada row del summary semanal es un insight Eco editorial.
- `patternsCount` = distinct tags lowercased a través de todas las `DiaryEntry` del user. Proxy honesto del "patrón detectado" hasta que el LLM pattern detector aterrice.

## Lo que se construyó

### `@psico/types`

- `HomeStats` extendido con `insightsCount: number` + `patternsCount: number`. JSDoc explica cada uno.

### Backend (`HomeService.fetchStats`)

- Dos queries paralelas nuevas:
  - `weeklySummary.count({ where: { userId } })` → `insightsCount`.
  - `diaryEntry.findMany({ where: { userId }, select: { tags: true } })` → para distinct count en RAM.
- Distinct con normalización `trim().toLowerCase()` para que "Trabajo" y "trabajo" cuenten como uno.
- Test spec actualizado con mocks default seguros (`weeklySummary.count` → 0, `diaryEntry.findMany` → []).

### Cliente

- `packages/api-client/src/generated.ts` regenerado (336 KB).

### Web (`InicioV2`)

- Metric #2 reescrito: ahora muestra `insightsCount` con label "Insights" + helper "de Eco" (era "Meta semanal").
- Metric #3 reescrito: ahora muestra `patternsCount` (era `home.recos.length`) con label "Patrones".
- Los otros 3 (Reflexiones, Minutos, Días seguidos) sin cambios.

## Decisiones

1. **Tags lowercased + normalizados** — evita inflación por casing inconsistente del cliente.
2. **`weeklySummary.count` sin filtro de fecha** — cuenta histórico total. Cuando el cron de S46 corre cada domingo, el counter sube sin que el usuario tenga que hacer nada.
3. **Distinct en RAM, no SQL** — Prisma no tiene DISTINCT sobre array elements. Para v1 (~1k users con ~50 entries promedio) el cost es trivial.
4. **Sin migración** — usamos schemas existentes. La privacidad del ADR 0007 está intacta: tags son plaintext metadata (igual que mood + createdAt).
5. **Métricas siguen siendo 5** — no hubo cambio de count. Misma grilla, contenido más real.

## Verificación

- `pnpm --filter @psico/types build` ✅
- `pnpm --filter @psico/api typecheck` ✅
- `pnpm --filter @psico/api test` → 725/726 (sin cambios)
- `pnpm --filter @psico/web typecheck` ✅
- `pnpm --filter @psico/web lint` ✅
- `pnpm --filter @psico/web test` → 228/228 (sin cambios)
- `pnpm --filter @psico/api-client generate:check` ✅

## Deuda técnica abierta

- **`exercisesCount`** fuera de scope. Requiere tracking de ChapterBlock kind=EXERCISE visits o tabla nueva. Mantenemos `minutesThisWeek` en su lugar (sigue siendo honesto).
- **InicioV2 tests** no cubren el metric mapping nuevo. Cuando shipiemos tests para Client Components grandes (InicioV2 + LectorShell + EcoShell) los agregamos juntos.
- **PatronesService.themes** ya hace distinct count parecido — podríamos consolidar a una sola fuente cuando lleguen los patterns LLM-backed.

## Privacy invariant

Sprint G2b lee solo metadata server-side: `WeeklySummary.userId/weekStart` (sin headline/narrative) y `DiaryEntry.tags` (plaintext desde S6 spec). NUNCA toca `textCiphertext` ni `excerptCiphertext`. ADR 0007 intacto.
