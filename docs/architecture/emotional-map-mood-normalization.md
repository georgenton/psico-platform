# PR-2 — Normalización de mood (rediseño) · SIN CÓDIGO

Diseño read-only. Cierra la conflación de vocabularios de ánimo que hoy alimenta
el modelo OU con basura silenciosa. **No** se implementa en este PR, **no** se
activa OU, **no** se construye Guide V1. La activación de OU es un cambio
operacional posterior (§E).

**Principio rector:** el modelo v0 (OU) debe consumir SOLO observaciones de ánimo
que sepamos, con certeza, que el usuario eligió explícitamente y en un vocabulario
canónico conocido. Todo lo demás se conserva crudo pero se marca **no elegible** —
nunca se mapea a `0` (neutral) como hoy.

---

## Contrato congelado (PR-2) — confirmado

Los 11 invariantes del contrato, con la sección que los fija. **Congelado: la
implementación no se desvía de esto sin re-aprobar.**

1. ✅ **Campos equivalentes en `MoodLog` y `DiaryEntry`** — las 8 columnas se
   añaden idénticas a AMBOS modelos (§C.2).
2. ✅ **`moodNormalized` es categoría canónica, NO `Int`** — enum `MoodCanonical`
   (`hard|low|ok|good|great`); el número (`MOOD_SCALAR`) vive en el modelo v0, no
   en la DB (§C.1).
3. ✅ **`provenance` / `eligible` / `exclusionReason` los calcula el SERVIDOR** —
   nunca vienen del payload del cliente; el pipe de whitelist descartaría un
   intento de setearlos (§C.4).
4. ✅ **`source`/`provenance` se determina por el ENDPOINT** — `checkin` desde
   `POST /api/mood`, `reflexion` desde `/api/reflexiones/entries`; el cliente no
   la declara (§C.4, §D.3).
5. ✅ **`MoodLog` vacío NO se persiste** — sin token válido → 400, cero filas
   (§C.3, §D.3).
6. ✅ **`DiaryEntry` sin mood se permite** — `mood` pasa a nullable; guardar sin
   pick no crea observación elegible (§C.3, §D.3).
7. ✅ **`User.mood` NUNCA entra al OU** — es espejo de display; su colisión de
   ruta + write free-text son **issue/PR separado** de higiene (§B.2, §D.4).
8. ✅ **El backfill preserva el crudo** — el `mood` original nunca se muta; el job
   solo escribe las 8 columnas nuevas (§D.2).
9. ✅ **El OU consume SOLO filas elegibles** — la fetch filtra
   `moodEligibleForDynamics = true`; legacy/unknown quedan fuera (no a `0`) (§C.4,
   §D.3).
10. ✅ **`FACTS_EPOCH` cambia al activar** — `EMOTIONAL_MAP_OU` es un FACTS flag;
    encenderlo exige `EMOTIONAL_MAP_FACTS_EPOCH++` (§E.2).
11. ✅ **OU permanece OFF durante toda la migración** — schema, backfill, writes,
    fetch cableada-pero-dormida; activar es un cambio operacional posterior
    (cabecera, §D, §E.2).

---

## Contexto: la conflación actual (verificada contra el repo)

- La fetch del scoring lee **dos** fuentes con el mismo `select { mood, createdAt }`
  y las **concatena en una sola serie** sin etiquetar el origen ni escalar por
  fuente: `moodSeries = [...diaryMoodRows, ...moodLogRows]`
  ([emotional-map.service.ts:262](apps/api/src/emotional-map/emotional-map.service.ts:262),
  fuentes en `:202-205` y `:206-209`).
- La serie pasa por `computeAffectDynamics` → `moodToScalar(r.mood)`
  ([emotional-map.scoring.ts:674](apps/api/src/emotional-map/emotional-map.scoring.ts:674))
  que usa `MOOD_SCALAR = {great:1, good:0.5, ok:0, low:-0.5, hard:-1}`
  ([ou.ts:27-37](apps/api/src/emotional-map/dynamics/ou.ts:27)).
- **Landmine:** cualquier token fuera de ese set (p.ej. legacy `calma/foco/energia`
  que aún viven en `DiaryEntry.mood` históricos) cae a **`0` neutral**
  ([ou.ts:37](apps/api/src/emotional-map/dynamics/ou.ts:37)) — inyecta "neutralidad"
  ficticia en lugar de excluirse.
- `MoodLog.mood` "ok" y `DiaryEntry.mood` "ok" se tratan idénticos, pero significan
  cosas distintas: el check-in "ok" es una **elección explícita**; el "ok" del
  diario es el **valor por defecto** del composer
  ([ActiveComposer.tsx:44](apps/web/src/components/dashboard/diario/ActiveComposer.tsx:44),
  [ReflexionTab.tsx:70](apps/web/src/components/dashboard/lector/companion/ReflexionTab.tsx:70),
  [ReflexionSheetTab.tsx:67](apps/mobile/src/components/dashboard/lector/companion/ReflexionSheetTab.tsx:67),
  [reflexiones/index.tsx:149](<apps/mobile/app/(tabs)/reflexiones/index.tsx:149>)) — casi
  siempre no elegido.

---

## B. Matriz real de fuentes de mood

Cada ruta que **escribe** un ánimo, con su vocabulario, obligatoriedad, y si es
input del OU. Citas `file:line` al árbol principal.

### B.1 — Inputs del modelo OU (lo que PR-2 debe normalizar)

| #   | Ruta / handler                                                                                                                                             | Campo DB                       | Vocabulario (def)                                                                                                                                                          | ¿Requerido?                                              | Cliente(s)                                                                                                                                                   | Feeds OU           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| 1   | `POST /api/mood` · `MoodService.log` ([mood.service.ts:64-67](apps/api/src/mood/mood.service.ts:64))                                                       | `MoodLog.mood` (+ `User.mood`) | ordinal `DIARY_MOOD_IDS` great/good/ok/low/hard ([types:1799](packages/types/src/index.ts:1799)); `@IsIn` ([log-mood.dto.ts:19](apps/api/src/mood/dto/log-mood.dto.ts:19)) | **Sí** (`mood!`)                                         | web `MoodChip` ([:70](apps/web/src/components/dashboard/shell/MoodChip.tsx:70)); mobile home faces ([index.tsx:121](<apps/mobile/app/(tabs)/index.tsx:121>)) | **Sí**             |
| 2   | `POST /api/reflexiones/entries` · `ReflexionesService.create` ([reflexiones.service.ts:120-123](apps/api/src/reflexiones/reflexiones.service.ts:120))      | `DiaryEntry.mood`              | ordinal `DIARY_MOOD_IDS`; `@IsIn` ([create-entry.dto.ts:39](apps/api/src/reflexiones/dto/create-entry.dto.ts:39))                                                          | **Sí** (`mood!`, sin `@IsOptional`, columna sin default) | web `ActiveComposer` (default "ok"), web `ReflexionTab`, mobile `ReflexionSheetTab`, mobile composer — **todos default "ok"**                                | **Sí**             |
| 3   | `PATCH /api/reflexiones/entries/:id` · `ReflexionesService.update` ([reflexiones.service.ts:168-171](apps/api/src/reflexiones/reflexiones.service.ts:168)) | `DiaryEntry.mood`              | ordinal `DIARY_MOOD_IDS` ([update-entry.dto.ts:34](apps/api/src/reflexiones/dto/update-entry.dto.ts:34))                                                                   | **Opcional** (`@IsOptional`, solo si se envía)           | mobile detail edit ([[id].tsx:215](<apps/mobile/app/(tabs)/reflexiones/[id].tsx:215>))                                                                       | **Sí**             |
| 4   | seed `seed-mood-history.mjs` ([createMany :123](apps/api/scripts/seed-mood-history.mjs:123))                                                               | `MoodLog.mood`                 | literal local `["hard","low","ok","good","great"]` ([:33](apps/api/scripts/seed-mood-history.mjs:33)) — no importa el catálogo                                             | siempre escribe                                          | script ops                                                                                                                                                   | **Sí** (test data) |
| 5   | seed `seed-demo-users.mjs` ([createMany :190](apps/api/scripts/seed-demo-users.mjs:190))                                                                   | `MoodLog.mood`                 | literal local ([:30](apps/api/scripts/seed-demo-users.mjs:30))                                                                                                             | siempre escribe                                          | script ops                                                                                                                                                   | **Sí** (test data) |

> No hay writes de `DiaryEntry`/`MoodLog` en `prisma/seed.ts`, ni en los ingest
> scripts. `seed.ts` solo siembra el **catálogo** `OnboardingMood` (§B.3).

### B.2 — Escritores de `User.mood` (espejo de "ánimo actual" — NO es input del OU)

`User.mood` es un mirror de display (saludo, getMe, export). **La fetch del OU no
lo lee** — solo `MoodLog` + `DiaryEntry`. Pero está roto y hay que anotarlo:
**4 escritores, 3 vocabularios, y una colisión de ruta.**

| #   | Ruta / handler                                                                                                                                    | Vocabulario                                                                                                                                                                       | Riesgo                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| a   | `POST /api/mood` · `MoodService.log` ([:68-71](apps/api/src/mood/mood.service.ts:68))                                                             | ordinal `DIARY_MOOD_IDS`                                                                                                                                                          | ok                                                                                                         |
| b   | `PATCH /api/user/mood` · `HomeService.updateMood` ([home.service.ts:275-278](apps/api/src/home/home.service.ts:275))                              | **free-text** — DTO solo `@IsString @IsNotEmpty` ([update-mood.dto.ts:4-5](apps/api/src/home/dto/update-mood.dto.ts:4)); el doc-comment miente ("validado contra DIARY_MOOD_IDS") | **acepta cualquier string**                                                                                |
| c   | `PATCH /api/user/mood` · `UsersService.updateMood` ([users.service.ts:433-437](apps/api/src/users/users.service.ts:433))                          | `WELLNESS_MOOD_IDS` (8 valores: great/good/calm/neutral/tired/anxious/sad/angry) ([types:1840-1849](packages/types/src/index.ts:1840))                                            | **colisión**: misma ruta que (b), DTO y vocabulario distintos; gana uno según orden de registro de módulos |
| d   | `POST /api/onboarding/step2` · `OnboardingService.saveStep2` ([onboarding.service.ts:162-165](apps/api/src/onboarding/onboarding.service.ts:162)) | catálogo `OnboardingMood` (activos = great/good/ok/low/hard)                                                                                                                      | ok (validado contra DB)                                                                                    |

**Decisión de alcance:** `User.mood` NO entra al pipeline de elegibilidad (no es
input del OU). PR-2 lo trata aparte como **higiene**: (1) resolver la colisión de
ruta `PATCH /api/user/mood` a **un solo** handler + DTO, (2) matar el write
free-text de (b). No requiere las 8 columnas nuevas — `User.mood` es un escalar de
display, no una observación.

### B.3 — Catálogo + otras columnas de mood (contexto, fuera del OU)

| Fuente                                                                                                         | Campo                           | Nota                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/seed.ts` ([:252-263](apps/api/prisma/seed.ts:252))                                                     | catálogo `OnboardingMood`       | `upsert` de `MOOD_SEED_CATALOG` ([constants.ts:200-206](apps/api/src/onboarding/constants.ts:200)) + soft-disable legacy ([:213-221](apps/api/src/onboarding/constants.ts:213)) |
| `OnboardingService.saveStep2` ([:153-161](apps/api/src/onboarding/onboarding.service.ts:153))                  | `OnboardingState.initialMoodId` | auditoría del pick de onboarding; no es serie temporal                                                                                                                          |
| `PATCH /api/terapia/sessions/:id/prep` ([terapia.service.ts:749](apps/api/src/terapia/terapia.service.ts:749)) | `TherapySession.checkInMood`    | **4º vocabulario disjunto** `THERAPY_MOOD_IDS` (calmo/ansioso/triste/energico/cansado); nunca toca OU. Fuera de alcance.                                                        |

---

## C. Schema PR-2 revisado

### C.1 — Enums nuevos (vocabulario controlado, DB-level)

El **número** (great=1 … hard=−1) pertenece al modelo v0 (`MOOD_SCALAR` en
[ou.ts:27](apps/api/src/emotional-map/dynamics/ou.ts:27)), **no** a la DB. La DB
guarda la **categoría canónica**.

```prisma
/// Categoría canónica ordinal. El único vocabulario elegible para el OU.
enum MoodCanonical { hard low ok good great }

/// Canal de origen de la observación (ortogonal a explicitud).
enum MoodProvenance { checkin reflexion onboarding import seed unknown }

/// Por qué una observación NO es elegible para dinámicas (null si es elegible).
enum MoodExclusionReason {
  not_selected          // no se eligió ánimo (entrada nueva sin pick)
  ambiguous_default     // "ok" heredado del default del composer (diario)
  pre_normalizer_review // canónico histórico, explicitud no demostrable por versión
  legacy_vocabulary     // calma/foco/energia… (no ordinal)
  unknown_token         // string irreconocible
  stale_normalizer      // normalizado por un mapeo viejo; re-normalizar
}
```

### C.2 — Las 8 columnas, en **AMBOS** `MoodLog` y `DiaryEntry`

Prisma (Postgres) no tiene tipos compuestos → se duplican en los dos modelos. Todas
**nullable/aditivas** (backfill posterior las llena).

```prisma
// --- añadir a model MoodLog Y a model DiaryEntry ---

/// Categoría canónica derivada del `mood` crudo. Null si no se pudo resolver a un
/// valor ordinal conocido (legacy/unknown/sin-pick). NUNCA se inventa un neutral.
moodNormalized        MoodCanonical?
/// Canal de origen. checkin ⇒ explícito por naturaleza; reflexion ⇒ puede ser default.
moodProvenance        MoodProvenance?
/// ¿El usuario eligió activamente? true/false/null(desconocido en históricos).
moodExplicitlySelected Boolean?
/// Vocabulario del `mood` CRUDO de entrada: "diary-v1" | "onboarding-legacy" |
/// "wellness-v1" | "unknown". Permite re-clasificar sin releer el crudo.
moodVocabularyVersion String?
/// Versión del normalizador que produjo `moodNormalized` (p.ej. "norm-1").
/// Re-normalizamos cuando cambia el mapeo → `stale_normalizer`.
moodNormalizerVersion String?
/// Versión del cliente que escribió (app build o "server-vN"). null en históricos.
/// Es el eje de "review by version" para diarios canónicos históricos.
moodClientVersion     String?
/// ¿Puede alimentar el OU? Precomputado (single source of truth para la fetch).
moodEligibleForDynamics Boolean @default(false)
/// Razón de exclusión. Null ⇔ elegible.
moodExclusionReason   MoodExclusionReason?
```

Índice nuevo en cada modelo para la fetch del OU (reemplaza el scan por `mood` crudo):

```prisma
@@index([userId, moodEligibleForDynamics, createdAt(sort: Desc)])
```

### C.3 — `DiaryEntry.mood` pasa a **nullable**

Requisito B.4 (composers arrancan en null; guardar sin ánimo no crea observación
elegible) exige que el crudo pueda faltar:

```prisma
// antes: mood String   (requerido, sin default)
mood String?           // raw histórico; null para entradas nuevas sin pick
```

Ampliar `NOT NULL → NULL` es aditivo-seguro: las filas existentes conservan su
valor. `MoodLog.mood` **queda requerido** (un check-in siempre es un pick; B.5).

### C.4 — Regla de elegibilidad (determinista, precomputada al escribir/backfill)

```
eligible = moodExplicitlySelected === true
        && moodNormalized !== null
        && moodVocabularyVersion === "diary-v1"      // único ordinal conocido
        && moodNormalizerVersion === CURRENT_NORMALIZER  // "norm-1"
```

`moodExclusionReason` se fija cuando `!eligible` (ver enum). Eligible ⊆ explícito.
La **fetch del OU filtra `moodEligibleForDynamics = true`** en vez de leer crudo +
mapear a 0 — así el landmine `ou.ts:37` deja de existir (los excluidos no entran,
no se "neutralizan").

**Todas estas columnas las calcula el SERVIDOR.** `moodProvenance`,
`moodExplicitlySelected`, `moodNormalized`, `moodEligibleForDynamics` y
`moodExclusionReason` NUNCA se aceptan del payload del cliente: el DTO no las
declara y el pipe de whitelist (`forbidNonWhitelisted`) descarta cualquier intento
de setearlas. La **procedencia (`source`) la determina el endpoint**, no el
cliente: `POST /api/mood` ⇒ `checkin` (explícito por naturaleza);
`POST/PATCH /api/reflexiones/entries` ⇒ `reflexion` (explícito solo si hubo pick).
El cliente aporta a lo sumo el token crudo del ánimo + su `moodClientVersion`.

**Invariantes duros (constraints del contrato):**

- **INV-1 — `eligible ⇒ normalized ∧ explicit`.** Ninguna fila puede tener
  `moodEligibleForDynamics = true` sin `moodNormalized != null` **y**
  `moodExplicitlySelected = true`. Elegibilidad implica categoría canónica
  resuelta **y** elección explícita del usuario (test + CHECK a nivel app).
- **INV-2 — diario legacy/histórico sin prueba explícita ⇒ NO elegible.** Una
  fila de `DiaryEntry` cuyo canal es `reflexion` y cuya explicitud no está probada
  por versión de cliente (`moodClientVersion` anterior al rollout de
  "mood empieza en null") queda `pre_normalizer_review` / no elegible. La ausencia
  de prueba de pick explícito es exclusión, no inclusión optimista.

---

## D. Política de migración

Cuatro pasos, todos reversibles, ninguno bloquea escrituras. **OU permanece
apagado** durante y después (flag `EMOTIONAL_MAP_OU=off`).

### D.1 — Migración de schema (aditiva)

- 2 enums + 8 columnas × 2 modelos + 2 índices + `DiaryEntry.mood` → nullable.
- `moodEligibleForDynamics Boolean @default(false)` → **toda fila nace no
  elegible**; el backfill la promueve solo si califica. Fail-closed.
- Additive puro: sin `DROP`, sin `NOT NULL` nuevos. Rollback = drop de columnas.

### D.2 — Backfill (job idempotente, por lotes, re-ejecutable)

**El backfill NUNCA muta el `mood` crudo** — solo escribe las 8 columnas nuevas.
El histórico original queda intacto como auditoría; re-clasificar en el futuro
(otra `moodNormalizerVersion`) reescribe solo las derivadas, jamás el crudo.

Clasificación por fuente (implementa B.6 **exactamente**):

| Fuente de la fila                        | `moodNormalized` | `provenance` | `explicit` | `eligible` | `exclusionReason`       |
| ---------------------------------------- | ---------------- | ------------ | ---------- | ---------- | ----------------------- |
| **`MoodLog` canónico** (todo histórico)  | = mood           | `checkin`    | `true`     | **`true`** | —                       |
| **`DiaryEntry` == "ok"**                 | `ok`             | `reflexion`  | `false`    | `false`    | `ambiguous_default`     |
| **`DiaryEntry` ∈ {hard,low,good,great}** | = mood           | `reflexion`  | `null`     | `false`    | `pre_normalizer_review` |
| **`DiaryEntry` legacy** (calma/foco/…)   | `null`           | `reflexion`  | `false`    | `false`    | `legacy_vocabulary`     |
| **token desconocido** (cualquier modelo) | `null`           | `unknown`    | `false`    | `false`    | `unknown_token`         |

Notas:

- **`MoodLog` "ok" ⇒ explícito y elegible**; **`DiaryEntry` "ok" ⇒ ambiguo, no
  elegible.** Ese es el corazón del rediseño: el canal desambigua el mismo token.
- **Diario canónico histórico no-"ok" ⇒ `pre_normalizer_review`, NO elegible.**
  No podemos probar que fue un pick explícito (todos los composers defaulteaban a
  "ok", así que un valor ≠ "ok" _probablemente_ fue elegido — pero "probablemente"
  no basta para el modelo). Se promueven a elegibles **solo** las filas cuyo
  `moodClientVersion` sea ≥ la build que hace "mood empieza en null" (ahí un valor
  presente ⇒ pick real). Los históricos sin versión quedan en review — honesto.
- **Legacy/unknown ⇒ `moodNormalized = null`, jamás un neutral.** Cierra
  `ou.ts:37`.
- `moodVocabularyVersion`: `diary-v1` para el set ordinal; `onboarding-legacy`
  para calma/foco/…; `unknown` para lo demás.
- `moodNormalizerVersion = "norm-1"` en todo lo que toque el backfill.
- Idempotente: `WHERE moodNormalizerVersion IS NULL OR moodNormalizerVersion <>
"norm-1"`. Re-correr solo re-normaliza lo pendiente/viejo (`stale_normalizer`).

### D.3 — Cambios de escritura (nuevos writes) — SIN activar OU

- **Composers arrancan en `null`** (web + mobile: quitar el default `"ok"`). Si el
  usuario guarda sin elegir → `DiaryEntry.mood = null`, `explicit=false`,
  `eligible=false`, `exclusionReason=not_selected`. Guardar la reflexión **no**
  falla por falta de ánimo (se relaja el `@IsOptional` en create).
- **Reflexión con pick** → `explicit=true`, `provenance=reflexion`,
  `normalized=pick`, `vocab=diary-v1`, `normalizer=norm-1`, `eligible=true`,
  `clientVersion` estampado.
- **Check-in** (`POST /api/mood`) → siempre `explicit=true`, `provenance=checkin`,
  `eligible=true`. **No persistir MoodLog vacío** (B.5): si llega sin token válido →
  400, **no se crea fila**.
- La **fetch del OU** cambia a `where: { moodEligibleForDynamics: true }` sobre
  ambos modelos y elimina el mapeo-a-0. **Este cambio queda cableado pero dormido**
  porque el bloque de dinámicas está detrás del flag OU (off).
- Seeds (`seed-mood-history`, `seed-demo-users`) estampan las 8 columnas como
  `checkin/explicit/eligible` para que el banco end-to-end tenga datos elegibles.

### D.4 — Higiene de `User.mood` (mismo PR, aparte del pipeline)

- Colapsar `PATCH /api/user/mood` a **un** handler + DTO con enum (elegir
  `WELLNESS_MOOD_IDS` o el ordinal; recomendado: ordinal para consistencia con el
  check-in). Eliminar el write free-text de `HomeService.updateMood`.
- No añade columnas: `User.mood` sigue siendo escalar de display.

---

## E. Tests y criterios de OU=on

### E.1 — Tests (unit + DTO + backfill + banco)

**DTO / API:**

- `create` reflexión **sin** mood → 201, `DiaryEntry.mood = null`,
  `eligible=false`, `exclusionReason=not_selected`.
- `create` con pick → `explicit=true`, `eligible=true`, `normalized` correcto.
- `POST /api/mood` con token inválido/vacío → 400, **cero filas** creadas (B.5).
- `PATCH` reflexión que cambia el mood → re-estampa las 8 columnas.

**Backfill (una prueba por celda de la tabla D.2):**

- MoodLog "ok" → checkin/explicit/eligible.
- DiaryEntry "ok" → ambiguous_default/no-eligible.
- DiaryEntry "good" histórico sin versión → pre_normalizer_review/no-eligible.
- DiaryEntry "calma" → legacy_vocabulary/normalized=null/no-eligible.
- token basura → unknown_token/normalized=null/no-eligible.
- idempotencia: segunda corrida no cambia nada (mismo `normalizer=norm-1`).

**Scoring (con el filtro nuevo, aún dormido):**

- La serie del OU contiene **solo** filas `eligible=true`; legacy/unknown/`ok`-diario
  **excluidas** (no aparecen como 0). Test que hoy fallaría: inyectar una fila
  legacy y verificar que el largo de la serie NO crece (antes crecía con un 0).

**Banco de personas (B.7) — integridad de fuente:**
| Persona | Composición | Aserción |
|---|---|---|
| `checkin-explicito` | solo MoodLog ordinal | todas elegibles; serie = N |
| `diario-default` | solo DiaryEntry "ok" | 0 elegibles; serie vacía |
| `diario-explicito` | DiaryEntry con pick + clientVersion nuevo | todas elegibles |
| `legacy` | DiaryEntry calma/foco/energia | 0 elegibles; normalized todos null |
| `unknown` | tokens basura | 0 elegibles; **ninguno mapeado a 0** |
| `mixta` | mezcla de las cinco | la partición elegible/excluida es exacta |

Las personas corren por el scoring **real** (patrón de
[benchmark/personas.ts](apps/api/src/emotional-map/benchmark/personas.ts)), en
memoria, sin tocar DB.

### E.2 — Criterios para activar OU (`EMOTIONAL_MAP_OU=on`) — checklist, PR aparte

OU **no** se enciende en el merge de PR-2. Antes de flipear el flag:

1. **Backfill 100% verificado:** cero filas con `moodNormalizerVersion` viejo/null;
   cero `eligible=true` con `moodNormalized=null`; cero legacy/unknown dentro de la
   serie.
2. **Rollout de clientes:** web + mobile con "mood empieza en null" desplegados y
   estables (para que los nuevos elegibles sean picks reales). Ventana mínima de
   acumulación por usuario activo antes de mostrar dinámicas.
3. **Gates de identificabilidad del modelo** cumplidos con el conteo de
   observaciones **elegibles** (no crudas): `MIN_OBS_FOR_FIT` (~8) para
   tono/estabilidad; `RECOVERY_MIN_OBS=100` (subido en el hotfix de PR-0.2) para
   recuperación/inercia. Si la data elegible no llega, el eje muestra "Reuniendo
   datos", no un número.
4. **Banco verde** con el filtro de elegibilidad activo.
5. **Higiene de `User.mood`** resuelta (colisión de ruta + free-text muertos).
6. **Epoch:** `EMOTIONAL_MAP_OU` es un **FACTS flag**
   ([cache-identity.ts](apps/api/src/emotional-map/cache-identity.ts) `FACTS_FLAGS`).
   Encenderlo cambia los hechos → **`EMOTIONAL_MAP_FACTS_EPOCH++`** (API + worker),
   luego probe de paridad de identidad + smoke (mismo runbook que PR-0.2 §A.5).

---

## Fuera de alcance (explícito)

- Guide V1 — no se construye.
- Activación de OU — cambio operacional posterior (§E.2).
- `TherapySession.checkInMood` — 4º vocabulario disjunto, nunca toca el OU.
- Migrar `User.mood` a las 8 columnas — es display, no observación.
- Re-mapear legacy `calma/foco/energia` a ordinal — se **conservan crudos y
  excluidos**; inventar un mapeo sería exactamente el pecado que este PR corrige.
