# PR-2B — Mood nullable atómico + atestación de selección versionada

**Rama:** `feature/pr-2b-mood-nullable`
**Estado:** implementado — **HOLD antes del merge** (no desplegar en esta sesión).
**Contrato congelado:** [docs/architecture/emotional-map-mood-normalization.md §PR-2B](../architecture/emotional-map-mood-normalization.md).

PR-2A dejó `mood` **requerido** en el API para no fabricar un `"ok"` neutro. PR-2B
hace el stack null-capable **de forma atómica** (backend + tipos + cliente + web +
mobile en un solo PR) y habilita la atestación versionada de selección explícita
(`explicit-v1`). Un solo PR con commits internos; **sin sub-PRs desplegables**.

---

## A. Diff — qué cambió

### Backend (`apps/api`)

- **Schema:** `MoodLog.moodSelectionVersion String?` + `DiaryEntry.moodSelectionVersion String?`.
  Migración aditiva `20260715230000_pr2b_mood_selection_version` (dos `ADD COLUMN … TEXT`).
- **Normalizer** (`mood/mood-normalization.ts`): input `explicitlySelected: boolean` → `selectionVersion?: string | null`.
  La explicitud se **deriva** de una atestación conocida (`mood-log-v1` / `explicit-v1` / `seed-v1`).
  Fail-loud: lanza en atestación **desconocida** o atestación **sin mood canónico**
  (backstop bajo los 400 del DTO/servicio). Devuelve la 9ª columna `moodSelectionVersion`.
- **DTOs** (`reflexiones/dto`): `create` mood opcional/nullable (`@ValidateIf(v !== undefined && v !== null)`),
  `update` mood three-way (absent / `null` / canónico). Ambos ganan
  `moodSelectionVersion?` restringido por `@IsIn(CLIENT_SELECTION_VERSIONS)` → el cliente
  SOLO puede mandar `explicit-v1` (las server-owned las rechaza con 400).
- **Servicio** (`reflexiones.service.ts`):
  - `create`: mood ausente/null → `not_selected`; canónico + `explicit-v1` → eligible;
    canónico sin versión → legacy/ineligible; `selectionVersion` sin mood → 400.
  - `update`: distingue **absent vs null** con `hasOwnProperty`. Absent → preserva;
    `null` → limpia (`not_selected`); canónico + `explicit-v1` → eligible; canónico distinto
    sin versión → ineligible; **mismo canónico sin versión sobre fila eligible → preserva
    (no degrada)**; `selectionVersion` sin/`null` mood → 400.
  - `toSummary` / `toDetail`: devuelven `mood: DiaryMoodId | null` real (se quitó el throw
    `DIARY_MOOD_INTEGRITY`); nunca coaccionan a `"ok"`.
  - **Invalidación best-effort** del cache del mapa: `create`/`delete` siempre; `update` solo
    si cambió mood o tags (text-only no). `ReflexionesModule` importa `EmotionalMapModule`.
- **`mood.service.ts`** (`POST /api/mood`): rechaza token no canónico como `MOOD_INVALID`
  **antes** de estampar `mood-log-v1` (si no, el normalizer estricto tiraría 500). Sigue
  persistiendo el canónico + `mood-log-v1`.
- **Seeds** (`seed-demo-users.mjs`, `seed-mood-history.mjs`): `moodNorm()` añade `moodSelectionVersion: "seed-v1"`.

### Consumidores (F6)

- **`momento` / serie OU** (`emotional-map.service.ts` `buildMoodSeries`): admite SOLO moods
  con respaldo del servidor. DiaryEntry únicamente `eligible + normalized`; MoodLog `eligible +
normalized`, con **fallback temporal** al raw canónico solo para MoodLog histórico
  (pre-PR-2A). **Nunca** un DiaryEntry raw/legacy. Un mood null nunca es observación.
- **Patrones** (`patrones.service.ts` + `ai.service.ts`): `dominantMood: string | null` (sin
  fallback `"calma"`); la narrativa (LLM y rule-based) **no inventa** un ánimo cuando no hubo
  registro — escribe sobre el hábito de escritura.
- **Related entries** (`reflexiones.service.getDetail`): un mood null no relaciona; la cláusula
  `OR` se arma condicionalmente (sin `{}` match-all); sin mood ni tags → `[]`.
- **Invalidación de cache**: ver arriba.

### Tipos + cliente

- `@psico/types`: `EXPLICIT_SELECTION_VERSION`, `MOOD_SELECTION_VERSIONS`, `CLIENT_SELECTION_VERSIONS`,
  `MoodSelectionVersion`; `MoodNormalization.moodSelectionVersion`; `DiaryEntrySummary.mood` y
  `DiaryEntryDetail.mood` → `DiaryMoodId | null`; `Create/UpdateDiaryEntryRequest.mood?` nullable +
  `moodSelectionVersion?`.
- `@psico/api-client`: `generated.ts` regenerado (booteando el API para emitir `openapi.json`).

### Front (web + mobile)

- **Web:** `ActiveComposer`, `companion/ReflexionTab` (create con contrato explicit-v1),
  `ActiveEntryList`, `EntryDetailView` (render null → "Sin ánimo registrado").
- **Mobile:** `reflexiones/index` (create + lista), `reflexiones/[id]` (detail + edit PATCH),
  `companion/ReflexionSheetTab` (create).
- Composers arrancan en `null`; tap selecciona/deselecciona; al enviar mandan `mood` +
  `moodSelectionVersion:"explicit-v1"` solo si hay pick; sin pick omiten ambos. Nunca `"ok"`.

---

## B. Matriz de estado — create / update

### `POST /api/reflexiones/entries` (create)

| Entrada                           | `mood` guardado | `moodSelectionVersion` | eligible                              | reason                  |
| --------------------------------- | --------------- | ---------------------- | ------------------------------------- | ----------------------- |
| sin `mood` (ausente)              | `null`          | `null`                 | no                                    | `not_selected`          |
| `mood: null`                      | `null`          | `null`                 | no                                    | `not_selected`          |
| canónico + `explicit-v1`          | canónico        | `explicit-v1`          | **sí**                                | `null`                  |
| canónico `"ok"`, sin versión      | `ok`            | `null`                 | no                                    | `ambiguous_default`     |
| canónico ≠ `ok`, sin versión      | canónico        | `null`                 | no                                    | `pre_normalizer_review` |
| `moodSelectionVersion` sin `mood` | —               | —                      | **400** `MOOD_SELECTION_WITHOUT_MOOD` |
| versión ≠ `explicit-v1` (cliente) | —               | —                      | **400** (DTO `@IsIn`)                 |

### `PATCH /api/reflexiones/entries/:id` (update — vía `hasOwnProperty`)

| Entrada                                                  | Efecto sobre las columnas de mood                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| `mood` ausente                                           | **preserva** (no toca ninguna columna de mood)                       |
| `mood: null`                                             | **limpia** → `mood=null`, `not_selected`, ineligible                 |
| canónico + `explicit-v1`                                 | re-deriva → eligible                                                 |
| canónico distinto, sin versión                           | re-deriva → ineligible (`pre_normalizer_review`/`ambiguous_default`) |
| **mismo** canónico, sin versión, sobre fila **eligible** | **preserva** (no-degrade)                                            |
| `moodSelectionVersion` sin mood / con `mood: null`       | **400** `MOOD_SELECTION_WITHOUT_MOOD`                                |
| versión ≠ `explicit-v1`                                  | **400** (DTO `@IsIn`)                                                |

---

## C. Tests

**API (unit):**

- `mood-normalization.spec.ts` — reescrito al API `selectionVersion`: MOOD_LOG/SEED/DIARY eligibles,
  ambiguous_default / pre_normalizer_review / legacy / unknown / not_selected, **+2 throws**
  (versión desconocida; versión sin mood). INV-1 sobre casos válidos.
- `reflexiones.service.spec.ts` — integridad flip (null → `mood:null`, sin throw); create
  `explicit-v1`→eligible, sin-mood→not_selected, versión-sin-mood→400; update null→clears,
  `explicit-v1`→eligible, **no-degrade** idempotente, versión-sin-mood→400. Mock de `EmotionalMapService`.
- `mood.service.spec.ts` — sigue verde (rechaza no canónico como `MOOD_INVALID` antes de la atestación).
- `update-entry.dto.spec.ts` — null ahora **permitido**; `moodSelectionVersion` acepta `explicit-v1`,
  rechaza `mood-log-v1`/`seed-v1`.
- Suite completa: **952 passed / 1 skipped** (el fallo en corrida completa es un **timeout flaky**
  de `auth.e2e-spec throttler`, ajeno a PR-2B — pasa 18/18 aislado).

**Web / Mobile:** ver deliverable D + resumen de verificación al pie.

---

## D. Compatibilidad mobile (release gate)

**Veredicto: sin builds externos antiguos → se puede shipear web+mobile juntos.**

- `apps/mobile` **no** tiene `eas.json` (sin perfiles de build EAS), sin config de submit,
  `version: "1.0.0"` default, sin canal OTA. La app corre en **Expo Go** (dev) contra el bundle
  de Metro de la rama actual. **No hay instalaciones externas** de un build pre-PR-2B.

**Análisis forward-compat (si existiera un cliente viejo):** el backend es forward-compatible —
un cliente viejo manda `mood: "<canónico>"` sin `moodSelectionVersion` → `ambiguous_default` /
`pre_normalizer_review` (guardado, ineligible), **sin crash**, idéntico a PR-2A. El único riesgo
sería un cliente viejo **leyendo** una entrada con `mood: null` (posible 500/crash si hace
`DIARY_MOODS.find(...).emoji`), pero eso requiere un cliente nuevo que cree la entrada null +
un cliente viejo que la lea — imposible aquí porque no hay clientes viejos y toda entrada
pre-PR-2B tiene mood no-null. **Estrategia si algún día hay builds en tienda:** subir la versión
mínima soportada / gating por `runtimeVersion`, y hacer que los lectores toleren `mood: null`
(que es justo lo que hace PR-2B) antes de permitir crear entradas null.

---

## E. Runbook de despliegue (para cuando se apruebe el merge)

**No desplegar en esta sesión.** Cuando se despliegue:

1. **Aplicar la migración** `20260715230000_pr2b_mood_selection_version` (aditiva, dos `ADD COLUMN`)
   vía `prisma migrate deploy` en Railway (API + worker comparten DB). Cero downtime.
2. **`CACHE_EPOCH=2`** en **API y worker** (ambos servicios Railway). Motivo: `momento` y la serie
   OU ahora filtran por elegibilidad; un mapa cacheado pre-PR-2B podría contener moods que PR-2B
   excluiría. Bumpear `CACHE_EPOCH` invalida los mapas cacheados sin tocar los facts persistidos.
3. **`FACTS_EPOCH` sin cambio.** (Decisión explícita del owner: no se toca este PR.)
4. **`EMOTIONAL_MAP_OU` permanece off.** Sin backfill de ninguna columna.
5. **Sin backfill** de `moodSelectionVersion` para filas legacy — quedan `null` (ineligibles),
   consistente con PR-2A. El CHECK **no** se endurece para exigir `moodSelectionVersion` (eso sería
   PR-2C, tras backfill).
6. **Re-seed opcional** (`seed-demo-users.mjs`) si se quiere que las cuentas demo tengan
   `moodSelectionVersion: "seed-v1"`.
7. Smoke post-deploy (solo metadata/counts, sin texto): crear reflexión con pick → `eligible=true`;
   crear sin pick → `mood=null` render "Sin ánimo registrado"; PATCH `mood:null` limpia; `POST /api/mood`
   con token legacy → 400.

---

## F. CI

- `openapi-diff.yml`: `generated.ts` ya regenerado y committeado — `generate:check` debe quedar in-sync.
- `scripts/check-migration-sql.sh`: la migración empieza con SQL válido (comentario `--` + `ALTER TABLE`).
- Job `privacy`: sin nuevos `logger`/`console` sobre campos cifrados (PR-2B solo toca metadata
  categórica de mood, nunca cipher/nonce).
- commitlint: subjects en minúscula.
