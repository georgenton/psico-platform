# Sprint S38 — LLM-backed WeeklySummary

**Rama sugerida:** `feature/sprint-38-weekly-narrative`
**Tests:** 358 API + 34 crypto pasando (356 → 358 · +2 nuevos LLM/fallback · 1 skipped sentinel).
**Diseño ref:** docs/design/handoff/12-patrones.md §"Resumen semanal" — sin cambios al contrato HTTP.

---

## 1. Scope

Reemplaza el `composeNarrative` rule-based del `PatronesService.regenerateWeeklySummary` con una llamada al LLM (Claude Sonnet 4.6 via `AIService`). El endpoint, request shape y response shape quedan idénticos — todo cambia bajo el capó.

**Privacy hard:** el LLM **nunca** ve `textCiphertext`, ni el body, ni cualquier texto del diario. Solo recibe metadata agregada (`entryCount`, `dominantMood`, `moodCounts`, `topTags`, `weekStartIso`). Misma garantía que da el composer rule-based.

---

## 2. Decisiones

1. **Claude Sonnet 4.6**, no Haiku. El narrative es 2-3 párrafos cortos y empáticos — la diferencia de costo es despreciable para una llamada que se ejecuta a lo sumo 1×/semana/user, y la calidad de tono cálido pesa más que el ahorro.
2. **Max tokens 512** (≈450 caracteres en español + headline). Caps de costo predictible.
3. **System prompt pinneado** con un cache_control ephemeral — el prompt es estable y se cacheará a través de llamadas en la misma ventana de 5min.
4. **Format estricto en el prompt** (`HEADLINE: ...\nNARRATIVE: ...`). Parser deterministic en `parseWeeklyOutput`. Si el LLM se sale de formato → throw → fallback.
5. **Fallback automático al rule-based** ante CUALQUIER error (missing key, network, parse fail, anthropic 5xx). El user NUNCA ve un card vacío; solo ve un tono editorial menos "personal" si el LLM falló.
6. **Tags incluidos en el contexto** (top 5 por frecuencia) — son tokens semánticos que el user mismo escribió como etiquetas. Plaintext en el schema desde S6.
7. **Sin cap explícito por usuario** — el upsert sobre `(userId, weekStart)` ya hace el rate-limit natural. El throttler global (60/min) cubre el abuso por retries.
8. **No tocamos el shape de `WeeklySummary`** — `{headline, narrative, entriesUsed, generatedAt}` queda igual. Los consumers (web + mobile WeeklySummaryCard) no requieren cambios.

---

## 3. Cambios

### Backend

- `apps/api/src/ai/ai.service.ts`:
  - Nuevo método `generateWeeklyNarrative(stats)` con su propio `WEEKLY_SYSTEM_PROMPT` (módulo-level, cacheable).
  - Parser `parseWeeklyOutput(raw)` deterministic + null-safe.
  - Logger `tokens in=X out=Y` para visibilidad de costo.
- `apps/api/src/patrones/patrones.module.ts`:
  - Importa `AIModule` (exporta AIService).
- `apps/api/src/patrones/patrones.service.ts`:
  - Constructor recibe `AIService`.
  - `regenerateWeeklySummary` ahora hace `await this.buildNarrative(entries, weekStart)`.
  - Nuevo `buildNarrative()` privado: try LLM → catch + warn log → composeNarrative.
  - Nueva función pure module-level `computeWeeklyStats(entries, weekStart)` que centraliza la construcción del payload — auditable a simple vista.
  - `findMany` extendido con `tags: true` (plaintext metadata, ADR 0007 §C).
  - `composeNarrative` mantenida — único cambio: acepta el tipo extendido pero solo lee `mood`.

### Tests

- `apps/api/src/patrones/patrones.service.spec.ts`:
  - Fixture `buildAi()` con stub default.
  - `entry()` extendido con tags opcional.
  - **+2 tests nuevos:**
    - "calls the LLM with aggregated stats and persists its output" — verifica que el LLM se invoca, que el output llega al row, y **que las keys del payload son exactamente `{entryCount, dominantMood, moodCounts, topTags, weekStartIso}`** (privacy invariant).
    - "falls back to the rule-based composer when the LLM call throws" — verifica que el headline final contiene el mood dominante (signature del composer).
  - Todos los tests existentes actualizados al nuevo constructor.

### Sin cambios

- Endpoint `POST /api/patrones/weekly-summary/regenerate` — wire idéntico.
- `@psico/types` `PatronesWeeklySummary` — shape idéntico.
- `@psico/api-client` `patronesApi.regenerateWeeklySummary()` — sin cambios.
- Web `WeeklySummaryCard.tsx` + mobile equivalente — sin cambios.

---

## 4. Verificación

- API tests: **358/358** + 1 skipped sentinel.
- @psico/crypto: 34/34.
- API typecheck: clean.
- API lint: 4 warnings preexistentes (no nuevos errores).
- OpenAPI `generate:check`: in sync (no shape changes).

---

## 5. Deuda técnica abierta

- **Sin cap por usuario / día.** Si el endpoint se vuelve costoso (cada call: ~$0.0015 a precio sonnet-4-6), añadir Redis-backed throttle `1×/24h/user` análogo al patrón de UsageService. Por ahora el upsert idempotente es suficiente.
- **Sin telemetría de uso del LLM en BillingUsageDay.** El daily-usage processor cuenta `eco.messages` pero no este endpoint. Cuando entremos a v2 con costos reales, añadir `weeklyNarratives` al rollup nightly.
- **Sin A/B entre LLM y rule-based.** Sería útil saber si el LLM mejora la satisfacción percibida. Cuando Pulso v2 aterrice, podemos flagear el path tomado en `WeeklySummary.generationSource` (nueva columna `"llm"|"rule"`).
- **El prompt no usa el `lastWeekSummary` como contexto.** El editor podría ganar continuidad referenciándolo. Diferido a v2.
- **Idioma hardcoded en español.** Cuando hagamos i18n completa, el system prompt necesita branches por idioma.
- **El system prompt clínico no menciona crisis detection.** En el endpoint del companion (Eco) sí lo hace; aquí no porque el LLM no recibe texto del user. Pero si el `dominantMood` es "tristeza profunda" o similar, debería empujar a buscar apoyo. Quedó simple en v1.

---

## 6. Resumen para Notion

**Qué cerramos en Sprint S38:**

- `AIService.generateWeeklyNarrative` con Claude Sonnet 4.6.
- `PatronesService.regenerateWeeklySummary` ahora LLM-first con fallback rule-based silencioso.
- 2 tests nuevos: happy path LLM + fallback en error. Privacy invariant explícito sobre las keys pasadas al LLM.
- 0 cambios al wire ni a tipos compartidos.

**Qué viene:**

- Cap por user/día con Redis (cuando los costos lo justifiquen).
- A/B telemetry (cuando Pulso v2 lo permita).
- Sprint S39: UI tests Vitest+RTL, Bugfix #2 Stripe price IDs, o Pulso v2 admin reports.
