# Sprint S10 — PatronesModule + UI

**Rama sugerida:** `feature/sprint-s10-patrones`
**Tests:** 356 API + 34 crypto pasando (348 → 356, +8 nuevos · 1 skipped sentinel preservado).
**Design ref:** [`docs/design/handoff/12-patrones.md`](../design/handoff/12-patrones.md)

---

## 1. Decisiones lockeadas antes de escribir código

1. **Pro-only soft-lock**, no `Forbidden 403`. El endpoint devuelve `200 { locked: true, entryCount }` para FREE — el front renderiza paywall sin romper la nav. Patrón análogo a `home.ecoMoment`.
2. **Aggregación in-process** desde plaintext metadata. La cripto E2E del Diario (ADR 0007) protege `body`/`excerpt`; `mood`, `tags`, `createdAt` viven plaintext en el schema desde S6. El servidor PUEDE leerlos — y los necesita para que Patrones tenga algo que mostrar.
3. **WeeklySummary persiste** (no se recalcula on-read). Tabla `WeeklySummary @@unique([userId, weekStart])`, idempotent upsert. v1 usa narrativa rule-based (`composeNarrative` placeholder); cuando AIModule lo permita, el cuerpo del summary se genera con Claude. El endpoint queda igual.
4. **Sincrónico, no BullMQ.** Aggregation < 50ms para 90 días de entries. No vale la pena un job. Si crece a 1y x 100 entries/día, sí.
5. **`PatronesShareWithTherapist` queda stub** retornando `{ ok: true, status: "stub" }`. TherapyModule v2 lo consume cuando aterrice.

---

## 2. Backend

### Schema

Modelo nuevo `WeeklySummary`:

```prisma
model WeeklySummary {
  id          String   @id @default(cuid())
  userId      String
  weekStart   DateTime
  headline    String
  narrative   String
  entriesUsed Int      @default(0)
  generatedAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, weekStart])
  @@index([userId, weekStart(sort: Desc)])
}
```

Migración aditiva `20260604120000_s10_weekly_summary/migration.sql` aplicada a prod.

### Endpoints

| Method | Path                                      | Auth | Tier     | Resultado                                                |
| ------ | ----------------------------------------- | ---- | -------- | -------------------------------------------------------- |
| GET    | `/api/patrones?period=30d\|90d\|1y`       | JWT  | FREE+Pro | 200 soft-lock (FREE) o full response (Pro)               |
| POST   | `/api/patrones/weekly-summary/regenerate` | JWT  | Pro      | 200 con summary · 403 FREE · 422 NOT_ENOUGH_ENTRIES (<7) |
| POST   | `/api/patrones/share-with-therapist`      | JWT  | Pro      | 200 stub (TherapyModule v2 lo consume)                   |

### Aggregation

`PatronesService.getPatrones(userId, userPlan, period)`:

- `resolvePeriod("30d"|"90d"|"1y")` → `{ from, to, label }` con `to = ahora`.
- `prisma.diaryEntry.findMany({ userId, createdAt: { gte: from, lte: to } })` — sólo lee plaintext metadata.
- `aggregateMoodMap(entries)` — agrupa por ISO date (`createdAt.toISOString().slice(0,10)`), la **última entry del día gana** (interesa el mood del cierre).
- `aggregateHourMood(entries)` — 24 buckets por `createdAt.getUTCHours()`, contando moods.
- `swatch` por mood viene del catálogo `OnboardingMood`; fallback `FALLBACK_SWATCH = "#C7C0B5"` si vacío.
- `composeNarrative(entries)` — rule-based v1 (placeholder LLM): mapea conteos y tags más frecuentes a un párrafo editorial.

### Constants

- `MIN_ENTRIES_FOR_FULL_VIEW = 7` — umbral para que `regenerate` produzca summary y empty-state para vista Pro full.
- `MIN_ENTRIES_FOR_WEEKLY = 7` — mismo umbral para el rollup semanal.

### Tests (8 nuevos)

`patrones.service.spec.ts`:

- FREE → `locked: true` con `entryCount`.
- PRO con suficientes entries agrega moodMap (latest-entry-per-day).
- 24-bucket hourMood.
- Fallback swatch cuando catálogo vacío.
- regenerate: 403 ForbiddenException para FREE.
- regenerate: lanza `"NOT_ENOUGH_ENTRIES"` con <7 entries.
- regenerate: upserts row cuando hay ≥7.
- shareWithTherapist devuelve stub.

---

## 3. Frontend

### Web — `apps/web/src/app/dashboard/patrones/page.tsx`

Server Component:

1. `serverFetch<PatronesResponse>('/patrones?period=30d')`.
2. Construye `swatchByMood` desde el `moodMap` que viene del server.
3. Renderiza:
   - **FREE** → `<PaywallCard entryCount>` con CTA → `/dashboard/plan`.
   - **PRO < 7** → empty state nudge → `/dashboard/diario`.
   - **PRO ≥ 7** → `<WeeklySummaryCard>` + `<MoodHeatmap>` + `<HourMoodChart>` + disclaimer.

Componentes en `apps/web/src/components/dashboard/patrones/`:

- `MoodHeatmap.tsx` — densa calendar strip de la primera a la última ISO date, gap-fills con `warm-100` para "espacios de silencio".
- `HourMoodChart.tsx` — 24-bar horizontal chart, dominant mood per hour, alto normalizado.
- `WeeklySummaryCard.tsx` — Client Component con lavender gradient. POST `/patrones/weekly-summary/regenerate` con `apiBase + token`. Maneja 422 inline.

Tabs de período (`?period=30d|90d|1y`) en el `Header` como `<Link>` (zero-JS).

Sidebar `_DashboardShell.tsx` extendido con `📊 Patrones` entre Eco y Mi plan.

### Mobile — `apps/mobile/app/(tabs)/patrones.tsx`

Single-screen con state machine `loading | error | locked | empty | full`. Patrones agregado al tabbar con `stats-chart` ícono — quedaron 6 tabs visibles, aceptable en pantallas modernas.

Reusa el mismo cliente `patronesApi` del paquete `@psico/api-client`. Maneja 422 vía `ApiError.statusCode === 422`.

Pull-to-refresh manual. Tabs de período como `Pressable` chips.

### Cliente

`packages/api-client/src/patrones.ts`:

```ts
export const patronesApi = {
  get: (period = "30d") =>
    apiClient.get<PatronesResponse>(`/patrones?period=${period}`),
  regenerateWeeklySummary: () =>
    apiClient.post<PatronesRegenerateResponse>(
      "/patrones/weekly-summary/regenerate",
      {},
    ),
  shareWithTherapist: (p) =>
    apiClient.post<PatronesShareWithTherapistResponse>(
      "/patrones/share-with-therapist",
      p,
    ),
};
```

`generated.ts` regenerado y `generate:check` verde.

---

## 4. Verificación

- API tests: **356/356** + 1 skipped sentinel.
- @psico/crypto: 34/34.
- `generate:check`: OK.
- Web `typecheck` + `lint`: clean.
- Mobile `typecheck` + `lint`: clean.
- Privacy invariants intactos (no se loggea `textCiphertext`/`textNonce`).

---

## 5. Deuda técnica abierta

- `composeNarrative` es rule-based. Cuando AIModule expose un método `generateWeeklyNarrative(entries)`, el endpoint llama al LLM (probablemente con cap diario de 1 regenerate por user). Sin cambios al wire.
- `getPatrones` recorre entries dos veces (moodMap + hourMood). Para `period=1y` con >1k entries vale la pena cachear el resultado por (userId, period) 5min con la misma estrategia de UsageService.
- `shareWithTherapist` devuelve stub. TherapyModule v2 lo conecta.
- Mobile tabbar quedó con 6 ítems. Si una validación de UX dice que se siente apretado, esconder `patrones` del tab y wirearlo desde el Home (shortcut card).
- Sin tests E2E del flujo (regenerate → cache invalidation cliente → re-fetch). Quedó cubierto unit-side.
- WeeklySummary nunca borra rows viejas. Para users con 2 años de uso, son ~104 rows — no es problema, pero cuando entremos a v2 con un dashboard de tendencias multi-año podemos hacer un partition por año.

---

## 6. Resumen para Notion

**Qué cerramos en S10:**

- 3 endpoints `/api/patrones/*` (get, weekly-summary/regenerate, share-with-therapist).
- WeeklySummary tabla con migración aplicada.
- 8 unit tests verdes (356 total).
- UI completa web (page + 3 componentes + sidebar) y mobile (tab nuevo).
- Cliente `patronesApi` + OpenAPI in sync.

**Qué viene:**

- **B — pulir Phase 1** (tour overlay onboarding, reports UI Eco, paginación de mensajes, UI tests Vitest+RTL, animations en el composer del diario).
- LLM-backed `composeNarrative` cuando AIModule lo permita.
- TherapyModule v2 consume el endpoint de share.
