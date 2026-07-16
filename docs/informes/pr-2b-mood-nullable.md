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
  - `toSummary` / `toDetail`: devuelven el `mood` RAW `string | null` (sin cast a `DiaryMoodId`,
    honesto con vocabulario legacy histórico; se quitó el throw `DIARY_MOOD_INTEGRITY`); nunca
    coaccionan a `"ok"`.
  - **Invalidación best-effort** del cache del mapa: `create`/`delete` siempre; `update` solo
    si cambió mood o tags (text-only no). `ReflexionesModule` importa `EmotionalMapModule`.
- **`mood.service.ts`** (`POST /api/mood`): rechaza token no canónico como `MOOD_INVALID`
  **antes** de estampar `mood-log-v1` (si no, el normalizer estricto tiraría 500). Sigue
  persistiendo el canónico + `mood-log-v1`.
- **Seeds** (`seed-demo-users.mjs`, `seed-mood-history.mjs`): `moodNorm()` añade `moodSelectionVersion: "seed-v1"`.

### Consumidores (F6) — todos filtran por elegibilidad

Regla común: un consumidor solo usa un mood que el servidor **avala** —
`moodEligibleForDynamics = true` **y** `moodNormalized != null`. Proyección canónica
`effectiveMood = eligible && normalized != null ? normalized : null`.

- **`momento` / serie OU** (`emotional-map.service.ts` `buildMoodSeries`): admite SOLO moods
  con respaldo del servidor. DiaryEntry únicamente `eligible + normalized`; MoodLog `eligible +
normalized`, con **fallback temporal** al raw canónico **solo cuando TODA la metadata
  server-owned está en null** — los 8 campos (`moodNormalized`, `moodProvenance`,
  `moodExplicitlySelected`, `moodVocabularyVersion`, `moodNormalizerVersion`, `moodClientVersion`,
  `moodSelectionVersion`, `moodExclusionReason`). Cualquier campo definido ⇒ la fila fue tocada por
  el normalizador ⇒ el fallback queda prohibido (nunca resucita un raw stale/excluido). **Nunca**
  un DiaryEntry raw/legacy. Un mood null nunca es observación.
- **Patrones** (`patrones.service.ts` `getPatrones` + `regenerateWeeklySummary`): selecciona
  `moodNormalized` + `moodEligibleForDynamics`, proyecta `effectiveMood`, y lo usa para `moodMap`,
  `hourMood`, `dominantMood` y ambas narrativas. `dominantMood: string | null` (sin fallback
  `"calma"`); un mood ineligible **no** entra al heatmap ni a los buckets; la narrativa (LLM y
  rule-based) **no inventa** un ánimo — escribe sobre el hábito de escritura. entryCount + tags
  se preservan.
- **WeeklyDigest** (`jobs/processors/weekly-digest.processor.ts`): misma proyección — un mood
  ineligible **no** cuenta hacia `dominantMood`; tags + conteo de entradas siguen contando.
- **Related entries** (`reflexiones.service.getDetail`): el mood es criterio de relación **solo**
  si `moodEligibleForDynamics && moodNormalized != null`, relacionando contra
  `{ moodEligibleForDynamics: true, moodNormalized: <canónico> }` (nunca el raw). Un mood null o
  ineligible no relaciona; la cláusula `OR` se arma condicionalmente (sin `{}` match-all); sin
  mood elegible ni tags → `[]`.
- **Invalidación de cache**: ver arriba.

### Tipos + cliente

- `@psico/types`: `EXPLICIT_SELECTION_VERSION`, `MOOD_SELECTION_VERSIONS`, `CLIENT_SELECTION_VERSIONS`,
  `MoodSelectionVersion` (server) + `ClientMoodSelectionVersion` (= `explicit-v1`, cliente);
  `MoodNormalization.moodSelectionVersion`; **respuesta** `DiaryEntrySummary.mood` y
  `DiaryEntryDetail.mood` → `string | null` (raw histórico); **request**
  `Create/UpdateDiaryEntryRequest.mood?: DiaryMoodId | null` + `moodSelectionVersion?: ClientMoodSelectionVersion`.
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

**Veredicto técnico del repositorio:** no encontramos configuración ni artefactos de distribución
externa.

**Gate de producción:** pendiente de confirmación humana en TestFlight, Google Play, APK/IPA
externos y Expo/EAS OTA.

Auditado canal por canal (no solo "no hay eas.json"):

| Canal                        | Evidencia                                                                      | Resultado                                     |
| ---------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| EAS builds                   | sin `eas.json`, sin `projectId`/`owner`/`extra.eas` en `app.json`              | ninguno producido                             |
| TestFlight                   | sin `.ipa`, sin `credentials`, sin `GoogleService*` trackeados                 | inexistente                                   |
| Google Play internal testing | sin `.apk`, sin `store.config`, sin `.easignore`                               | inexistente                                   |
| APK/IPA compartidos          | ninguno en el repo                                                             | inexistente                                   |
| Expo Updates / canales OTA   | sin key `updates`, sin `runtimeVersion`, sin dep `expo-updates`, sin `channel` | ningún bundle publicado llega a app instalada |

Solo `slug: "psico-platform"` (scaffold default). La app corre en **Expo Go** (dev) contra el
bundle de Metro de la rama actual. El repositorio **no puede demostrar** por sí solo la ausencia de
testers externos — un build pudo hacerse fuera del repo (EAS remoto, Xcode/Android Studio local).
Por eso el gate de producción exige **confirmación humana** (checklist abajo).

**Análisis forward-compat (si existiera un cliente viejo):** el backend es forward-compatible —
un cliente viejo manda `mood: "<canónico>"` sin `moodSelectionVersion` → `ambiguous_default` /
`pre_normalizer_review` (guardado, ineligible), **sin crash**, idéntico a PR-2A. El único riesgo
sería un cliente viejo **leyendo** una entrada con `mood: null` (posible 500/crash si hace
`DIARY_MOODS.find(...).emoji`), pero eso requiere un cliente nuevo que cree la entrada null +
un cliente viejo que la lea — imposible aquí porque no hay clientes viejos y toda entrada
pre-PR-2B tiene mood no-null. **Estrategia si algún día hay builds en tienda:** subir la versión
mínima soportada / gating por `runtimeVersion`, y hacer que los lectores toleren `mood: null`
(que es justo lo que hace PR-2B) antes de permitir crear entradas null.

**El repositorio por sí solo NO prueba la ausencia de testers externos** — sólo prueba que este
repo no configura ningún canal. Un build pudo hacerse fuera del repo (EAS remoto, Xcode/Android
Studio local). Por eso el gate de deploy exige **confirmación humana** antes de desplegar (no
bloquea CI):

- [ ] **App Store Connect / TestFlight** — sin builds distribuidos a testers externos.
- [ ] **Google Play Console** — sin builds en internal / closed / open testing.
- [ ] **APK/IPA compartidos** — ninguno enviado fuera del repo (Drive, Slack, etc.).
- [ ] **Expo / EAS Updates** — sin canal OTA publicado apuntando a un runtime instalado.

Si CUALQUIERA existe: **detener el deploy** y aplicar la estrategia de compat de arriba
(min-version / `runtimeVersion` + lectores null-tolerant) antes de habilitar la creación de
entradas sin mood.

---

## E. Runbook de despliegue (para cuando se apruebe el merge)

**No desplegar en esta sesión.** ⚠️ **El ORDEN es obligatorio: API antes que web.** Un web
nuevo contra una API vieja (PR-2A) NO es compatible — el web nuevo puede **omitir** `mood`
(que PR-2A rechaza como `mood` requerido → 400) y envía `moodSelectionVersion` (columna/campo
que PR-2A no conoce → 400 `forbidNonWhitelisted`). Por eso el backend va PRIMERO y el web
DESPUÉS de confirmarlo.

**Secuencia definitiva y determinista (el ORDEN es obligatorio):**

1. **`CACHE_EPOCH=2` en API y worker** (ambos servicios Railway), como **skip-deploy** (setear el
   env sin disparar un build todavía). Invalida los mapas cacheados (que filtran por elegibilidad)
   sin tocar los facts. **`FACTS_EPOCH` sin cambio.** `EMOTIONAL_MAP_OU` **off**.
2. **Pausar la promoción a producción de Vercel** (Ignored Build Step / auto-deploy off) — un web
   nuevo contra API PR-2A vieja rompe (omite `mood` → 400 requerido; manda `moodSelectionVersion`
   → 400 `forbidNonWhitelisted`).
3. **Pausar el worker / schedulers** (o elegir una ventana fuera del cron del domingo). Motivo: el
   cron de S46 no debe crear un `WeeklySummary` nuevo entre el deploy y la higiene, que la higiene
   borraría acto seguido.
4. **Ejecutar las migraciones como una release phase única** — `prisma migrate deploy`
   (`20260715230000_pr2b_mood_selection_version`, aditiva, dos `ADD COLUMN`) como paso propio,
   **antes** de desplegar el código nuevo. Motivo: ningún proceso nuevo debe consultar las columnas
   antes de que existan.
5. **Confirmar que la migración quedó aplicada** (`prisma migrate status` / inspección de
   `_prisma_migrations`).
6. **Desplegar la API** (Railway). Esperar `SUCCESS`.
7. **Higiene de WeeklySummary — DRY RUN** desde un shell de confianza:
   ```bash
   node apps/api/scripts/pr2b-weekly-summary-hygiene.mjs            # → weekly_summaries_found=<n>
   ```
8. **Revisar el conteo** (`weekly_summaries_found=<n>`) y confirmar la intención. ⚠️ Aplicar es una
   **pérdida**: los summaries existentes se borran y **NO** se reconstruyen retroactivamente
   (`regenerateWeeklySummary` solo produce la semana actual). Las siguientes corridas generan
   summaries nuevos desde ese momento; **la historia editorial previa se pierde**.
9. **Higiene de WeeklySummary — `--apply`**:
   ```bash
   node apps/api/scripts/pr2b-weekly-summary-hygiene.mjs --apply    # → weekly_summaries_deleted=<n>
   ```
10. **Desplegar / reanudar el worker** (Railway) — recién ahora el cron puede volver a correr.
11. **Identity match:** la línea de identidad (`rt=… sha=<releaseSha> responseFp=… factsFp=…
cacheEpoch=2 factsEpoch=1`) debe reflejar el nuevo `sha` y `cacheEpoch=2` en API y worker.
12. **Smoke API** (ADMIN, solo metadata/counts, sin texto): crear reflexión con pick →
    `eligible=true`; sin pick → `mood=null`; PATCH `mood:null` limpia; `POST /api/mood` con token
    legacy → 400.
13. **Promover el web** (Vercel) — reanudar el auto-deploy o promover manualmente
    (`vercel deploy --prod` / _Promote_), una vez la API nueva está verificada.
14. **Smoke del web:** crear reflexión sin tocar el ánimo → guarda con `mood=null` y **el chip
    queda deseleccionado** para la siguiente entrada (reset-on-save); copy "guardada en tu diario".
15. **Cerrar / revocar la sesión de Railway** usada para los pasos ops.

**Por qué este orden:** (a) ningún worker/API nuevo consulta `moodSelectionVersion` antes de que la
migración lo cree (pasos 4–6); (b) con el worker pausado (paso 3) un summary nuevo no puede ser
creado y luego borrado por la higiene (pasos 7–10); (c) el web nuevo nunca habla con una API vieja
(paso 2 → 13). **`FACTS_EPOCH` sin cambio · OU off · sin backfill histórico.**

**Sin backfill** de `moodSelectionVersion` para filas legacy — quedan `null` (ineligibles),
consistente con PR-2A. El CHECK **no** se endurece para exigir `moodSelectionVersion` (eso es
PR-2C, tras backfill). **Re-seed opcional** (`seed-demo-users.mjs`) si se quiere que las cuentas
demo tengan `moodSelectionVersion: "seed-v1"`.

---

## F. CI

- `openapi-diff.yml`: `generated.ts` ya regenerado y committeado — `generate:check` debe quedar in-sync.
- `scripts/check-migration-sql.sh`: la migración empieza con SQL válido (comentario `--` + `ALTER TABLE`).
- Job `privacy`: sin nuevos `logger`/`console` sobre campos cifrados (PR-2B solo toca metadata
  categórica de mood, nunca cipher/nonce).
- commitlint: subjects en minúscula.
