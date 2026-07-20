# ADR 0019 — Guide V1: fuente server-side de pasos y máquina de estados de GuideSession

**Estado:** Propuesto — pendiente de aprobación de Jorge en el PR.
Resuelve el bloqueo de CC-7.4
(`CC7_4_STATUS=BLOCKED_SERVER_STEP_SOURCE_REQUIRED`). El merge de este ADR
constituye **aprobación de diseño** — no autoriza automáticamente los PRs de
implementación posteriores (cada uno requiere su propia instrucción).

Relacionados: ADR 0016 (Content Core) · ADR 0017 (Learning Events + firewall)
· ADR 0018 (política ARC) · `docs/architecture/learning-events.md`.

---

## Contexto — la auditoría que bloqueó CC-7.4

La ejecución CC-7.4 intentó implementar `GuideSession` (modelo + start +
complete + eventos) y activó su hard stop: **no existe hoy una fuente
server-side canónica y verificable de pasos reales del Guide**. Hallazgos,
verificados contra el repo en `origin/develop` = `53c5098`:

- **No existe `GuideSession`** — ni modelo, ni módulo, ni rutas `/api/guide/*`
  (OpenAPI mergeado: cero paths guide). Lo único existente del Guide son los
  contratos de CC-7.1 (`parseCreateGuideSessionCommand` /
  `parseCompleteGuideSessionCommand` en
  `apps/api/src/learning/learning-command-parser.ts:302,338`) y los registros
  tipados que CC-7.2 puede persistir — consumidores de un productor que nunca
  se construyó.
- **Ninguna transición real avanza pasos.** ADR 0017 §2 y
  `learning-events.md` §D dicen que `stepsCompleted` «lo cuenta el servidor
  desde el estado de la sesión (los pasos avanzan por comandos previos)» —
  pero esos comandos de avance no existen: los 5 comandos de CC-7.3
  (open/complete unit, explore concept, recall, practice) no referencian
  ninguna sesión ni actualizan estado de sesión alguno.
- **Todo candidato existente cae en una fuente prohibida:** contar
  `LearningEvent` (prohibido: log ≠ fuente), mensajes de Eco (prohibido:
  mensajes ≠ pasos), `ReadingSession` (dwell), `tourStepsCompleted`
  (client-declared, y es el tour de onboarding, no el Guide),
  `CHAPTER_EXERCISES`/`BreathingExercise` (100 % cliente — el propio ADR 0017
  reconoce que «una respiración completada no es verificable server-side»),
  «Modo Guía» del lector (modo de lectura con audio, sin pasos ni endpoints).
- **Causa raíz:** el PR 4 del plan de ADR 0017 asumió «conteo server-side de
  pasos», pero la maquinaria que PRODUCE esos pasos nunca se especificó. Este
  ADR es esa especificación.

---

## 1. Qué producto es «Guide» — definición canónica

Auditoría de las seis superficies candidatas:

| Superficie                                    | ¿Es el Guide? | Por qué                                                                                                                                                                                                   |
| --------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Modo Guía del lector**                      | No            | Es un modo de PRESENTACIÓN del capítulo (audio + bloques). No tiene sesiones, ni objetivo finito, ni pasos: es lectura. Comparte la palabra «guía», no la semántica.                                      |
| **Eco conversacional**                        | No            | Es un espacio conversacional abierto, E2E-cifrado, sin secuencia definida ni final. Convertir una conversación en «pasos» exigiría contar mensajes (prohibido) o leer contenido (prohibido por ADR 0007). |
| **Ejercicios de capítulo**                    | No            | Son actividades sueltas del catálogo (`CHAPTER_EXERCISES`), sin sesión que las agrupe. Su registro educativo ya existe: `practice_completed` (CC-7.3).                                                    |
| **Respiración**                               | No            | Una fase client-side de un ejercicio. Cero registro server-side por diseño.                                                                                                                               |
| **Onboarding tour**                           | No            | Secuencial, pero es setup de cuenta una sola vez; su contador es client-declared (`tourStepsCompleted`) y así debe seguir — no es evidencia.                                                              |
| **Intervención guiada estructurada (futura)** | **Sí**        | Es exactamente lo que ADR 0017 §H describe como Guide V1: consumidor de read models educativos con continuidad de sesión.                                                                                 |

**Decisión — ninguna superficie actual ES el Guide.** No se reutiliza otra
superficie por conveniencia. Guide V1 es un **producto futuro explícito**:

> `GUIDE_PRODUCT_DEFINITION` = Guide V1 es un acompañante educativo
> estructurado que ejecuta **intervenciones guiadas curadas**: secuencias
> cortas y finitas de pasos definidos server-side sobre el catálogo educativo
> (`guideKey@guideVersion`), iniciadas explícitamente por el usuario y
> completadas mediante transiciones de dominio aceptadas por el servidor.

Aclaraciones exigidas por la definición:

- **Quién inicia:** el usuario, con un comando explícito
  (`POST /api/guide/sessions`). El servidor jamás inicia sesiones solo.
- **Objetivo:** completar la intervención definida por `guideKey@guideVersion`
  (p. ej. «ruta guiada del capítulo 1»: explora el concepto → haz la práctica
  de respiración → responde el recall). Finita, corta, con criterio de
  completion verificable (§6).
- **Qué constituye un paso:** una transición de dominio aceptada por el
  servidor contra un catálogo cerrado y versionado (§2). Nunca actividad
  inferida.
- **Superficie que ejecuta los pasos:** web y mobile (CC-7.5/7.6) renderizan
  la definición del catálogo y disparan los comandos; el SERVIDOR ejecuta y
  acepta cada transición.
- **Información para verificar cada transición:** estado de la sesión (máquina
  §6) + definición del step en el catálogo fijado + evidencia según su
  `completionPolicy` (§2) + `idempotencyKey` del actor.
- **Relación con contenido editorial:** opcional y all-or-nothing — una sesión
  puede anclarse a `editionKey + unitKey` (resueltos vía
  `LearningCatalogResolver`, entitlement vía
  `ContentAccessService.assertCanReadUnit`, persistiendo solo
  `editionId`/`unitId`) o no anclarse. Los steps pueden referenciar entidades
  del catálogo educativo (conceptos, ítems de recall, prácticas) con la misma
  disciplina de resolución de CC-7.3.
- **Relación con Eco:** **ninguna en V1.** El Guide no es Eco, no lee ni
  escribe mensajes de Eco, y ningún texto de Eco entra jamás al estado del
  Guide. El prompt del Guide (cuando exista superficie conversacional) no
  recibe Mapa/Diario/Eco (ADR 0017 §H, invariante preexistente).

---

## 2. La unidad semántica «Guide Step»

Un paso **no puede ser**: tiempo transcurrido, apertura de pantalla, scroll,
heartbeat, mensaje enviado, un `LearningEvent`, un incremento enviado por el
cliente, ni actividad inferida.

**Un Guide Step es una transición de dominio aceptada por el servidor contra
un catálogo cerrado y versionado.** Contrato conceptual (los nombres finales
siguen las convenciones del repo en CC-7.4B):

```ts
interface GuideStepDefinition {
  guideKey: string; // identifica la intervención curada
  guideVersion: number; // la sesión FIJA la versión al iniciar (§6)
  stepKey: string; // único dentro de guideKey@guideVersion
  order: number; // posición en la secuencia
  kind: GuideStepKind;
  required: boolean; // los opcionales no gobiernan la completion (§6)
  completionPolicy: GuideStepCompletionPolicy;
}
```

### Vocabulario cerrado `GuideStepKind`

| Kind                    | Qué es                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `CONCEPT_EXPLORATION`   | El paso presenta un concepto del catálogo educativo.                                                     |
| `ACTIVE_RECALL`         | El paso plantea un ítem de recall del catálogo (`Exercise` type `QUIZ` con contrato declarado — CC-7.3). |
| `CATALOG_PRACTICE`      | El paso propone una práctica exacta del catálogo (p. ej. respiración).                                   |
| `EXPLICIT_CONFIRMATION` | El paso pide al usuario confirmar explícitamente una acción realizada fuera del sistema.                 |
| `SERVER_ACTION`         | El paso es una operación ejecutada íntegramente por el backend.                                          |

### Vocabulario cerrado `GuideStepCompletionPolicy`

Cada policy declara **qué evidencia server-side permite aceptar el paso**:

| Policy                          | Evidencia que acepta el servidor                                                                                                                                       | Cómo se presenta (claims clasificados, ADR 0017)            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `explicit_confirmation`         | Un comando explícito del usuario sobre el step exacto que la sesión espera. El servidor registra el **autoinforme como tal** — jamás lo presenta como prueba objetiva. | «Marcaste este paso como hecho», nunca «hiciste este paso». |
| `objective_recall`              | El servidor **califica** `selectedOptionKey` contra la respuesta canónica del catálogo (misma maquinaria de CC-7.3). El resultado es un hecho server-graded.           | «Respondiste correcto/incorrecto» — verificado.             |
| `catalog_practice_confirmation` | Un comando explícito sobre una práctica EXACTA del catálogo, resuelta y con entitlement. Transición aceptada, no verdad física.                                        | «Marcaste la práctica como completada».                     |
| `server_action`                 | La operación la ejecuta el backend por completo; el paso se acepta al confirmar la operación en la misma transacción.                                                  | Hecho del servidor.                                         |

### Policies prohibidas (jamás entrarán al vocabulario)

```
message_count · dwell · scroll · engagement · learning_event_count ·
implicit_completion · client_counter
```

Cualquier PR que intente añadir una de estas es un cambio de ESTE ADR, no una
extensión del catálogo.

**Almacenamiento del catálogo (recomendación para CC-7.4B):** definición
canónica server-side versionada en código (constants module en
`apps/api/src/guide/`, patrón `CHAPTER_CONCEPTS`/`CHAPTER_EXERCISES`), con los
tipos compartidos en `@psico/types`. Sin editor, sin DB, hasta que Author B2B
lo requiera. Cambiar el catálogo publica un `guideVersion` NUEVO — nunca muta
una versión existente (§6).

---

## 3. Fuente de verdad — alternativas y decisión

### A — Ledger explícito de transiciones (`GuideSessionStep`)

Cada paso aceptado crea una fila ligada a la sesión, única por
`(sessionId, stepKey)`. El contador se DERIVA del número de filas aceptadas.

- **Concurrencia:** el unique `(sessionId, stepKey)` hace imposible aceptar el
  mismo paso dos veces incluso bajo carrera — la DB es el árbitro, no el
  código (mismo patrón que `createMany + skipDuplicates` de CC-7.2).
- **Auditabilidad:** cada aceptación es una fila con timestamp — el historial
  completo es reconstruible por query, sin parsear JSON.
- **Idempotencia:** natural por fila; el replay compara contra la fila
  existente.
- **Migraciones:** tabla aditiva nueva; evolucionar el shape es añadir
  columnas, no reescribir blobs.
- **Reconstrucción:** trivial — `COUNT(*)` de filas aceptadas por sesión.

### B — Estado embebido en `GuideSession`

La sesión guarda el paso actual o una lista estructurada de completados
(JSON o array).

- Concurrencia débil: dos requests concurrentes mutan el MISMO blob — exige
  lock pesimista siempre y la unicidad por paso vive en código, no en la DB.
- Auditabilidad pobre: sin timestamps por paso salvo inflar el blob; historia
  no consultable por SQL.
- Migraciones frágiles: cambiar el shape del blob es una migración de datos,
  no de schema.
- Reconstrucción: depende de parsear JSON persistido — exactamente el tipo de
  payload libre que CC-7 viene eliminando.

### C — Avance implícito por comandos learning existentes

Que `open/complete/explore/recall/practice` (CC-7.3) avancen la sesión.

**Rechazada para V1.** Solo sería válida si se demostrara TODO esto a la vez:
vinculación explícita de cada comando a la GuideSession; catálogo Guide que
declare ese comando como el paso esperado; transición atómica de sesión;
`LearningEvent` solo como consecuencia; e **imposibilidad de que actividad
educativa ajena al Guide avance la sesión**. La última condición es la letal:
los comandos CC-7.3 son ambientales (el lector los disparará best-effort en
CC-7 PR 5/6) — un usuario leyendo normalmente con una sesión Guide abierta
avanzaría pasos sin saberlo. Eso es exactamente «actividad incidental
contada», la clase de deshonestidad que el hard stop de CC-7.4 existe para
impedir. Además `explore` y `practice` tienen dedup 1/día: un paso Guide
chocaría con actividad previa del día. El acoplamiento necesario para
arreglarlo (sessionId en comandos learning + branching) contamina CC-7.3 ya
cerrado.

### Decisión

```
RECOMMENDED_GUIDE_STEP_SOURCE=EXPLICIT_STEP_LEDGER
```

El ledger gana en cada criterio priorizado: semántica honesta (una fila = una
transición aceptada), verificación server-side (la fila solo nace del comando
dedicado §4), idempotencia y concurrencia (unique DB-level), privacidad (solo
claves de catálogo + timestamps — §9), auditabilidad (historial por SQL),
reversibilidad (tabla aditiva), implementación incremental (CC-7.4B la
introduce sin tocar nada existente) e **imposibilidad de contar actividad
incidental** (ningún otro código escribe el ledger — se protege con un ratchet
`no-direct-guide-step-write`, espejo del de LearningEvent).

`stepsCompleted` de una sesión = número de filas aceptadas (únicas por
`stepKey`) de su ledger. Ninguna otra fuente, jamás.

---

## 4. El comando productor (diseño — NO implementado en este PR)

### Comando genérico de avance

```
POST /api/guide/sessions/:sessionId/steps/:stepKey/complete
Body: { "idempotencyKey": "uuid" }        // cerrado; nada más
```

Sirve a las policies que no requieren datos adicionales:
`explicit_confirmation`, `catalog_practice_confirmation`, `server_action`.

**Nunca acepta:** `stepsCompleted`, `order`, `status`, `result`, `score`,
`emotion`, `text`, `transcript`, `messages`, `duration`, `metadata`, `userId`.
El parser CC-7.1-style (autoridad runtime, body `unknown`) rechaza cualquier
campo extra con 400.

El servidor, en orden y dentro de una transacción (§7):

1. autentica al actor (JWT — única fuente de identidad);
2. carga la sesión por `sessionId + userId` (ajena ⇒ 404
   `GUIDE_SESSION_NOT_FOUND`, sin distinguir);
3. carga el catálogo `guideKey@guideVersion` FIJADO en la sesión;
4. verifica que `stepKey` existe en esa versión;
5. verifica que es el paso permitido por la máquina de estados (§6);
6. verifica la `completionPolicy` del step;
7. aplica la transición atómicamente;
8. registra el paso UNA sola vez (fila del ledger, unique
   `(sessionId, stepKey)`);
9. devuelve el estado actualizado de la sesión.

### Comando dedicado para `objective_recall`

La policy `objective_recall` necesita un dato adicional
(`selectedOptionKey`). **No se añade un payload genérico** — se define un
comando de dominio específico y cerrado:

```
POST /api/guide/sessions/:sessionId/steps/:stepKey/recall
Body: { "idempotencyKey": "uuid", "selectedOptionKey": "..." }   // cerrado
```

Reusa la MISMA maquinaria de CC-7.3: `parseRecallCatalogContent` (contrato
estricto declarado), `LearningCatalogResolver` (ítem → unidad → edición →
libro), calificación server-side contra `correctOptionKey`. El resultado
(`correct`/`incorrect`) es un hecho server-graded que queda en la fila del
ledger. El cliente jamás declara `result` ni `evaluationSource`.

Cada policy futura que requiera datos propios sigue este patrón: comando
dedicado, body cerrado, parser autoridad.

---

## 5. Relación con los comandos CC-7.3

Decisión explícita por comando:

| Comando CC-7.3                                   | Decisión                           | Razón                                                                                                                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /learning/units/:unitKey/open`             | `NEVER_GUIDE_STEP`                 | Actividad ambiental (el lector la disparará best-effort). Contarla como paso = actividad incidental.                                                                                                                                          |
| `POST /learning/units/:unitKey/complete`         | `NEVER_GUIDE_STEP`                 | Es un claim educativo global sobre la unidad, no un paso de una intervención.                                                                                                                                                                 |
| `POST /learning/concepts/:conceptKey/explore`    | `NEVER_GUIDE_STEP`                 | Ambiental + dedup 1/día (chocaría con actividad previa). Un paso `CONCEPT_EXPLORATION` del Guide se acepta con el comando genérico §4 (`explicit_confirmation`).                                                                              |
| `POST /learning/recall-attempts`                 | `DEDICATED_GUIDE_COMMAND_REQUIRED` | La calificación objetiva DENTRO de una sesión viaja por el comando dedicado §4 (`…/steps/:stepKey/recall`), que reusa resolver + grading de CC-7.3 pero ejecuta la transición Guide atómicamente. El endpoint standalone jamás toca sesiones. |
| `POST /learning/practices/:exerciseKey/complete` | `NEVER_GUIDE_STEP`                 | Un paso `CATALOG_PRACTICE` del Guide se acepta con el comando genérico §4 (`catalog_practice_confirmation`); el comando standalone (con su dedup 1/día) queda para actividad fuera de sesión.                                                 |

Consecuencias duras de esta matriz:

- **Una llamada normal a cualquier comando CC-7.3 jamás cambia ninguna
  GuideSession** — no reciben `sessionId` y no lo resolverán.
- **`LearningEvent` no se consulta jamás para calcular avance** — el ledger es
  la única fuente (§3).
- Si CC-7.4C decide que el comando dedicado de recall además emita
  `active_recall_attempted` (para mantener unificada la historia de recall que
  gobierna el espaciado), el evento es CONSECUENCIA de la transición en la
  misma transacción — nunca fuente. Decisión puntual diferida a CC-7.4C con
  ese default.

---

## 6. Máquina de estados de GuideSession

```
ACTIVE ──(todos los required aceptados + comando complete)──► COMPLETED
ACTIVE ──(el usuario inicia otra sesión │ cancela)──────────► CANCELLED
```

**`CANCELLED` pertenece a V1.** No es opcional: la semántica ya comprometida
en `learning-events.md` §G («1 activa/usuario; la previa se autocierra sin
evento `completed`») necesita un estado terminal distinto de COMPLETED para el
autocierre. Sin `CANCELLED`, el autocierre tendría que falsificar una
completion o borrar la sesión — ambas deshonestas.

### Invariantes

- Una sesión **fija `guideKey + guideVersion` al comenzar**; la definición no
  cambia debajo de una sesión activa (publicar cambios = nuevo
  `guideVersion`; las sesiones viejas terminan contra su versión fijada).
- Un paso no puede completarse dos veces (unique `(sessionId, stepKey)`).
- Pasos fuera de orden son rechazados (409), salvo que el catálogo declare
  paralelismo explícito (V1: secuencial estricto por `order`; el paralelismo
  declarado queda como extensión del catálogo, no del modelo).
- Una sesión `COMPLETED` o `CANCELLED` no acepta pasos (409 / 404 según §8 de
  la instrucción CC-7.4 original).
- `complete` de sesión solo ocurre cuando **todos los pasos `required` están
  aceptados**; si faltan ⇒ 409.
- Los pasos opcionales aceptados cuentan en `stepsCompleted` pero **no
  gobiernan ni falsean** el criterio de completion.
- `stepsCompleted` se deriva EXCLUSIVAMENTE de las transiciones server-side
  del ledger; el cliente nunca puede sobrescribir el contador.
- `editionId`/`unitId` del ancla: ambos `NULL` o ambos no `NULL`.
- Una sesión ACTIVE tiene `completedAt = null` y contador no congelado; al
  pasar a COMPLETED se congela `stepsCompleted` (denormalizado desde el
  ledger en la MISMA transacción) y `completedAt` = reloj del servidor.

### Semántica exacta de los campos expuestos

| Campo                    | Significado                                                                                         | ¿Se expone?                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `stepsCompleted`         | Filas aceptadas del ledger (required + opcionales, únicas por `stepKey`).                           | Sí — lo requiere el contrato del evento `guide_session_completed`.                |
| `requiredStepsCompleted` | Filas aceptadas con `required=true`.                                                                | Sí — es lo que la UI necesita para el progreso honesto («2 de 3 pasos»).          |
| `totalRequiredSteps`     | Steps `required` del catálogo fijado.                                                               | Sí — denominador del progreso.                                                    |
| `totalSteps`             | Todos los steps del catálogo fijado.                                                                | Sí — permite renderizar la ruta completa (incl. opcionales).                      |
| `currentStepKey`         | El siguiente step `required` no aceptado según `order`; `null` si todos aceptados o sesión cerrada. | Sí — es la continuidad de sesión que ADR 0017 §H promete («retomar donde quedó»). |

Ningún otro campo derivado se expone: cada uno de estos cinco tiene una
semántica necesaria declarada arriba; lo que no la tenga no entra al contrato.

---

## 7. Idempotencia y concurrencia

### Claves únicas (DB-level)

- **Una sesión ACTIVE por usuario:** unique parcial
  `(userId) WHERE status = 'ACTIVE'` — el autocierre (§6) se ejecuta en la
  misma transacción del start para que el unique nunca bloquee un start
  legítimo.
- **Un paso por sesión:** unique `(sessionId, stepKey)` en el ledger.
- **Idempotencia por actor:** los eventos emitidos viajan por
  `LearningEventRepository.appendValidated` y heredan
  `@@unique([userId, idempotencyKey])` (CC-7.2). Las transiciones de step usan
  la misma canonicalización de key (UUID → lowercase, fail-closed) y guardan
  la key en la fila del ledger para el replay exacto.

### Advisory transaction locks (patrón CC-7.3)

```
guide:start:<userId>:<canonicalIdempotencyKey>
guide:step:<userId>:<sessionId>
guide:complete:<userId>:<sessionId>
```

`pg_advisory_xact_lock(hashtextextended(lockKey, 42))` dentro de
`$transaction` — mismo patrón ya probado en la completion de unidad (CC-7.3).
El lock de step serializa TODOS los pasos de una sesión (simplicidad de V1:
las sesiones son cortas; el paralelismo declarado del catálogo, si llega,
relajaría esto en un ADR posterior).

### Escenarios obligatorios (matriz para los pg-specs de CC-7.4B/C)

| Escenario                                                           | Resultado                                                                                                                                                                                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replay exacto (misma key, mismo step, misma sesión)                 | 200, misma fila, cero transición nueva.                                                                                                                                                                               |
| Misma key, semántica distinta (otro step / otra sesión / otro tipo) | 409 `LEARNING_EVENT_IDEMPOTENCY_CONFLICT`, cero filas.                                                                                                                                                                |
| Dos completions concurrentes del MISMO paso (keys distintas)        | Una acepta; la otra 409 (paso ya aceptado). Una sola fila.                                                                                                                                                            |
| Dos pasos concurrentes incompatibles (fuera de orden entre sí)      | El lock de step los serializa; el segundo se evalúa contra el estado ya avanzado — acepta solo si sigue siendo el permitido.                                                                                          |
| Completion de sesión concurrente con el último paso                 | El lock de complete + re-check de `required` dentro de la tx: o el paso entra primero y la completion ve todo aceptado, o la completion falla 409 y se reintenta. Jamás una sesión COMPLETED con required pendientes. |

### Transacción canónica de aceptación de paso

```
lock guide:step
→ persist step transition          (fila del ledger)
→ update GuideSession derived state (currentStep / contadores congelables)
→ optional domain operation         (p. ej. grading del recall)
→ emit corresponding event          (si CC-7.4C lo decide — vía repositorio único)
→ commit conjunto
```

**Un fallo de la operación asociada o del evento revierte TODA la
transición** — la fila del ledger no sobrevive a un evento fallido, y
viceversa. Mismo principio ya implementado en la completion de unidad de
CC-7.3 (append falla ⇒ update revertido).

---

## 8. Eventos — fuente de verdad vs. consecuencia

| Rol                          | Qué                                                                   |
| ---------------------------- | --------------------------------------------------------------------- |
| **Fuente de verdad**         | `GuideSession` + `GuideSessionStep` (ledger).                         |
| **Consecuencia append-only** | `LearningEvent` (`guide_session_started`, `guide_session_completed`). |

Los eventos **no impulsan ni reconstruyen en runtime el contador**: leer
`stepsCompleted` es leer el ledger/el campo congelado, jamás contar eventos.
(Los eventos siguen sirviendo a read models educativos y auditoría — su rol de
CC-7.2.)

### ¿Necesita V1 un evento `guide_step_completed`?

**No.** Justificación:

- **Negocio:** ningún consumidor V1 lo necesita. La continuidad («retomar
  donde quedó») la da `currentStepKey` de la sesión; el progreso lo dan los
  campos §6; el read model del Guide lee su propio ledger.
- **Privacidad:** un evento por paso duplicaría en el log append-only una
  traza fina de comportamiento que ya vive en el ledger con su ciclo de vida
  propio — más superficie de retención sin utilidad.
- **Retención:** el ledger muere con la cuenta (cascade, §9); duplicarlo en
  eventos crea dos copias del mismo hecho que habría que gobernar por
  separado.

V1 emite únicamente `guide_session_started` (payload `{guideSessionId}`) y
`guide_session_completed` (payload `{guideSessionId, stepsCompleted}`), con
`editionId`/`unitId` como referencias resueltas cuando la sesión está anclada
— exactamente los contratos ya cerrados en CC-7.1/7.2. Si un consumidor futuro
demuestra necesidad del evento por paso, se añade de forma aditiva con su
propio ADR corto; su payload sería `{guideSessionId, stepKey}` y nada más (sin
texto, sin respuestas, sin emociones, sin duración, sin transcript, sin
metadata libre — por las mismas reglas de CC-7.1).

**Este PR no modifica enums, tipos ni schema** — esta sección es diseño.

---

## 9. Privacidad

### Clasificación de lo que Guide almacenará

| Clase                       | Ejemplos                                                                         | Sensibilidad                                                            |
| --------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Identificadores de catálogo | `guideKey`, `guideVersion`, `stepKey`, `editionId`, `unitId`                     | Contenido público licenciado — no sensible por sí mismo.                |
| Estado                      | `ACTIVE`/`COMPLETED`/`CANCELLED`, contadores                                     | Metadata de actividad — se trata con la disciplina de LearningEvent.    |
| Timestamps                  | `startedAt`, `completedAt`, aceptación de cada paso                              | Ídem.                                                                   |
| Autoinformes explícitos     | La aceptación de un paso `explicit_confirmation`/`catalog_practice_confirmation` | Se registra COMO autoinforme (claims clasificados) — jamás como prueba. |
| Resultados objetivos        | `correct`/`incorrect` de un paso `objective_recall`                              | Hecho educativo server-graded; enum, jamás la respuesta como texto.     |

### Prohibido en `GuideSession` y `GuideSessionStep` (columnas que NO existirán)

```
transcript · texto de mensajes de Eco · texto del Diario · texto libre ·
inferencia emocional · engagement oculto · perfil publicitario
```

Sin `payload Json`, sin `metadata`, sin `updatedAt` salvo necesidad real
demostrada en CC-7.4B.

### Ciclo de vida

- **Exportación:** el data export del usuario incluye sus sesiones y pasos
  (claves de catálogo + estados + timestamps) — mismo pipeline de
  `DataExportRequest`.
- **Cierre de cuenta:** `onDelete: Cascade` desde `User` — las sesiones y su
  ledger mueren con la cuenta (patrón LearningEvent).
- **Retención:** ciclo de vida de la cuenta; sin TTL propio en V1 (las
  sesiones `CANCELLED` se conservan como historial honesto — una
  reorganización editorial tampoco borra historial: las referencias
  `editionId`/`unitId` usan `onDelete: SetNull`/restrict según convenga en
  CC-7.4B, nunca cascade desde contenido).
- **Revocación/cancelación:** el usuario puede cancelar su sesión ACTIVE (o
  iniciarla de nuevo, que autocancela); cancelar no emite
  `guide_session_completed` ni falsifica pasos.
- **Logs sanitizados:** errores code-only (disciplina CC-7.3 —
  `LearningEventStorageError` para fallas de infraestructura, cero valores,
  cero causas); ningún log imprime claves de sesión ajenas ni contenido.
- **No se conservará:** duración por paso, dwell, orden de interacción fina,
  intentos fallidos de parseo — nada que no esté en la clasificación de
  arriba.

---

## 10. Plan de implementación y criterios de desbloqueo

| PR                 | Contenido                                                                                                                                                                                                                                     | Gate                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **CC-7.4A** (este) | ADR 0019 + actualizaciones docs. **Docs-only.**                                                                                                                                                                                               | Aprobación de Jorge en el PR. |
| **CC-7.4B**        | Catálogo Guide V1 (código, cerrado, versionado) + migración aditiva `GuideSession` + `GuideSessionStep` (uniques + constraints de estado §6-§7) + ratchet `no-direct-guide-step-write` + pg-spec de migración en dos fases.                   | ADR aprobado.                 |
| **CC-7.4C**        | Lifecycle completo: `POST /api/guide/sessions` (start + autocierre), comando genérico de paso, comando dedicado de recall, `PATCH …/complete`, emisión de `guide_session_started`/`completed` vía repositorio único, matriz pg completa (§7). | 7.4B mergeado.                |
| **CC-7.4D**        | OpenAPI cerrado + ratchet + API client (`createGuideSession`, `completeGuideSessionStep`, `submitGuideStepRecall`, `completeGuideSession`) + firewall full-stack (los eventos guide en el batch zero-delta).                                  | 7.4C mergeado.                |
| **CC-7.5**         | Integración web.                                                                                                                                                                                                                              | 7.4D mergeado.                |
| **CC-7.6**         | Integración mobile.                                                                                                                                                                                                                           | 7.5 mergeado.                 |

El productor de pasos (7.4B/C) queda deliberadamente separado de las
integraciones de cliente (7.5/6) — el backend es verificable por pg-specs
antes de que exista UI.

### Criterio de desbloqueo de CC-7.4

`CC7_4_STATUS` pasa de `BLOCKED_SERVER_STEP_SOURCE_REQUIRED` a
`READY_TO_IMPLEMENT` **con el merge aprobado de ESTE ADR**, porque este ADR
contiene las dos decisiones que el gate exige — no solo un modelo redactado:

1. **El comando productor está decidido** (§4): el ledger solo se escribe
   desde `POST …/steps/:stepKey/complete` y `POST …/steps/:stepKey/recall`.
2. **Las `completionPolicy` están decididas** (§2): vocabulario cerrado de 4
   policies con su evidencia, y la lista de policies prohibidas.

El merge constituye aprobación de DISEÑO. Cada PR de implementación
(7.4B → 7.6) requiere su propia instrucción ejecutiva; este ADR no las
autoriza en bloque.
