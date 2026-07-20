# ADR 0019 — Guide V1: fuente server-side de pasos y máquina de estados de GuideSession

**Estado:** Propuesto — pendiente de aprobación de Jorge en el PR.
Resuelve el bloqueo de CC-7.4
(`CC7_4_STATUS=BLOCKED_SERVER_STEP_SOURCE_REQUIRED`). El merge de este ADR
constituye **aprobación de diseño** — no autoriza automáticamente los PRs de
implementación posteriores (cada uno requiere su propia instrucción).

Dirección aprobada conceptualmente y NO reabierta por esta revisión:
`RECOMMENDED_GUIDE_STEP_SOURCE=EXPLICIT_STEP_LEDGER` · separación Guide/Eco ·
prohibición de mensajes/dwell/engagement/LearningEvents como fuente · sin
`guide_step_completed` en V1.

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
  variante (§2) + `idempotencyKey` del actor (receipt §7).
- **Relación con contenido editorial:** opcional y all-or-nothing — una sesión
  puede anclarse a `editionKey + unitKey` (resueltos vía
  `LearningCatalogResolver`, entitlement vía
  `ContentAccessService.assertCanReadUnit`, persistiendo solo
  `editionId`/`unitId`) o no anclarse. Los targets de los steps (§2) se
  resuelven con la misma disciplina de CC-7.3.
- **Relación con Eco:** **ninguna en V1.** El Guide no es Eco, no lee ni
  escribe mensajes de Eco, y ningún texto de Eco entra jamás al estado del
  Guide. El prompt del Guide (cuando exista superficie conversacional) no
  recibe Mapa/Diario/Eco (ADR 0017 §H, invariante preexistente).

---

## 2. La unidad semántica «Guide Step» — unión discriminada

Un paso **no puede ser**: tiempo transcurrido, apertura de pantalla, scroll,
heartbeat, mensaje enviado, un `LearningEvent`, un incremento enviado por el
cliente, ni actividad inferida.

**Un Guide Step es una transición de dominio aceptada por el servidor contra
un catálogo cerrado y versionado.** El catálogo se define como una **unión
discriminada cerrada** — cada variante declara exactamente su `kind`, su
`completionPolicy`, su **target**, la evidencia aceptable y el comando
autorizado. No existen `kind` y `completionPolicy` combinables libremente:
la unión hace las combinaciones inválidas **inexpresables por construcción**.

Contrato conceptual (nombres finales según convenciones del repo en CC-7.4B):

```ts
interface GuideDefinition {
  guideKey: string; // identifica la intervención curada
  guideVersion: number; // la sesión FIJA la versión al iniciar (§6)
  steps: GuideStepDefinition[]; // orden total por `order`
}

interface GuideStepBase {
  stepKey: string; // único dentro de guideKey@guideVersion
  order: number; // posición en la secuencia (secuencial estricto, §6)
  required: true; // V1: TODOS los pasos son obligatorios (ver abajo)
}

type GuideStepDefinition =
  | GuideConceptStep
  | GuideRecallStep
  | GuidePracticeStep
  | GuideConfirmationStep;
```

### Variantes V1

**Concept exploration**

```ts
interface GuideConceptStep extends GuideStepBase {
  kind: "CONCEPT_EXPLORATION";
  completionPolicy: "explicit_confirmation";
  conceptKey: string; // target: catálogo Concept
}
```

- **Evidencia:** el comando genérico de paso (§4) sobre el step exacto que la
  sesión espera. El servidor resuelve `conceptKey` mediante
  `LearningCatalogResolver` y, cuando la sesión está anchored, exige que el
  concepto pertenezca al contexto editorial de la sesión (misma disciplina de
  pertenencia que el recall de CC-7.3).
- **Semántica:** autoinforme — «Marcaste que exploraste este concepto». No
  afirma comprensión ni interés verificado.
- **Comando autorizado:** solo `POST …/steps/:stepKey/complete`.

**Objective recall**

```ts
interface GuideRecallStep extends GuideStepBase {
  kind: "ACTIVE_RECALL";
  completionPolicy: "objective_recall";
  itemKey: string; // target: Exercise type=QUIZ con contrato declarado (CC-7.3)
}
```

- **Evidencia:** SOLO el comando dedicado de recall (§4). El servidor resuelve
  `itemKey`, valida `selectedOptionKey` contra las opciones del catálogo,
  resuelve el contexto editorial completo y **califica** el resultado
  (`correct`/`incorrect`) — el cliente jamás lo declara.
- **Comando autorizado:** solo `POST …/steps/:stepKey/recall`.

**Catalog practice**

```ts
interface GuidePracticeStep extends GuideStepBase {
  kind: "CATALOG_PRACTICE";
  completionPolicy: "catalog_practice_confirmation";
  exerciseKey: string; // target: Exercise no-QUIZ del catálogo
}
```

- **Evidencia:** el comando genérico de paso sobre la práctica EXACTA. El
  servidor resuelve la práctica (exercise → unidad publicada → edición →
  libro) y aplica entitlement. La aceptación sigue siendo un **autoinforme
  explícito**, no prueba física (ADR 0017: «una respiración completada no es
  verificable server-side»).
- **Comando autorizado:** solo `POST …/steps/:stepKey/complete`.

**Explicit confirmation**

```ts
interface GuideConfirmationStep extends GuideStepBase {
  kind: "EXPLICIT_CONFIRMATION";
  completionPolicy: "explicit_confirmation";
  confirmationKey: string; // target: catálogo cerrado de confirmaciones
}
```

- **Evidencia:** el comando genérico de paso. `confirmationKey` pertenece a un
  **catálogo cerrado** definido junto al Guide (p. ej.
  `pausa-respiracion-hecha`) — **no es texto libre**, ni persistido ni enviado
  por el cliente; el cliente solo invoca el `stepKey`.
- **Semántica:** autoinforme registrado como tal.
- **Comando autorizado:** solo `POST …/steps/:stepKey/complete`.

### `SERVER_ACTION` — decisión única: DIFERIDO fuera de V1 (opción B)

No existe hoy ninguna operación backend concreta que un Guide necesite
ejecutar como paso. Incluir la variante con un registry allowlisted VACÍO
sería exactamente la clase de maquinaria sin transición real que el hard stop
de CC-7.4 prohíbe. **`SERVER_ACTION` queda fuera del vocabulario V1**; cuando
exista una operación concreta, un ADR corto la añade con la forma ya acordada
(`actionKey: GuideServerActionKey` resuelto por un registry allowlisted de
handlers — jamás nombres de funciones, URLs, scripts ni metadata arbitraria en
el catálogo).

### Matriz kind × policy — combinaciones inválidas inexpresables

| kind \ policy           | `explicit_confirmation` | `objective_recall` | `catalog_practice_confirmation` |
| ----------------------- | ----------------------- | ------------------ | ------------------------------- |
| `CONCEPT_EXPLORATION`   | ✔ (única)               | ✗ inexpresable     | ✗ inexpresable                  |
| `ACTIVE_RECALL`         | ✗ inexpresable          | ✔ (única)          | ✗ inexpresable                  |
| `CATALOG_PRACTICE`      | ✗ inexpresable          | ✗ inexpresable     | ✔ (única)                       |
| `EXPLICIT_CONFIRMATION` | ✔ (única)               | ✗ inexpresable     | ✗ inexpresable                  |

Cada variante de la unión fija su `completionPolicy` como literal: un
`GuideRecallStep` con `explicit_confirmation` no compila y no puede existir en
el catálogo. No hay validación runtime que mantener sincronizada — el sistema
de tipos ES la matriz.

### Optional steps — fuera de V1

```
GUIDE_V1_OPTIONAL_STEPS_SUPPORTED=false
```

**Todos los `GuideStepDefinition` V1 tienen `required: true`** (tipo literal —
no configurable). Se retiran del contrato V1: el boolean configurable, los
campos `requiredStepsCompleted`/`totalRequiredSteps` y cualquier regla sobre
pasos opcionales. Soportar opcionales exigiría un ADR posterior con semántica
EXPLÍCITA de skip (¿un paso saltado cuenta?, ¿puede aceptarse después?, ¿qué
muestra el cursor?) — este ADR **no insinúa soporte parcial**.

### Policies prohibidas (jamás entrarán al vocabulario)

```
message_count · dwell · scroll · engagement · learning_event_count ·
implicit_completion · client_counter
```

Cualquier PR que intente añadir una de estas es un cambio de ESTE ADR, no una
extensión del catálogo.

**Almacenamiento del catálogo (para CC-7.4B):** definición canónica
server-side versionada en código (constants module en `apps/api/src/guide/`,
patrón `CHAPTER_CONCEPTS`/`CHAPTER_EXERCISES`), con los tipos compartidos en
`@psico/types`. Sin editor, sin DB, hasta que Author B2B lo requiera. Cambiar
el catálogo publica un `guideVersion` NUEVO — nunca muta una versión
existente (§6).

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
- **Idempotencia:** natural por fila, gobernada por el receipt transversal
  (§7).
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
impedir. El acoplamiento necesario para arreglarlo (sessionId en comandos
learning + branching) contamina CC-7.3 ya cerrado.

### Decisión

```
RECOMMENDED_GUIDE_STEP_SOURCE=EXPLICIT_STEP_LEDGER
```

El ledger gana en cada criterio priorizado: semántica honesta (una fila = una
transición aceptada), verificación server-side (la fila solo nace de los
comandos autorizados por variante §2), idempotencia y concurrencia (unique
DB-level + receipt §7), privacidad (solo claves de catálogo + timestamps —
§9), auditabilidad (historial por SQL), reversibilidad (tabla aditiva),
implementación incremental (CC-7.4B la introduce sin tocar nada existente) e
**imposibilidad de contar actividad incidental** (ningún otro código escribe
el ledger — se protege con un ratchet `no-direct-guide-step-write`, espejo del
de LearningEvent).

`stepsCompleted` de una sesión = número de filas aceptadas (únicas por
`stepKey`) de su ledger. Ninguna otra fuente, jamás.

---

## 4. Los comandos productores (diseño — NO implementados en este PR)

### Comando genérico de avance

```
POST /api/guide/sessions/:sessionId/steps/:stepKey/complete
Body: { "idempotencyKey": "uuid" }        // cerrado; nada más
```

Sirve a las variantes `CONCEPT_EXPLORATION`, `CATALOG_PRACTICE` y
`EXPLICIT_CONFIRMATION`.

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
6. verifica la variante/policy del step (incl. resolución del target y
   entitlement cuando aplica);
7. aplica la transición atómicamente;
8. registra el paso UNA sola vez (fila del ledger, unique
   `(sessionId, stepKey)`);
9. devuelve el estado actualizado de la sesión.

### Comando dedicado para `ACTIVE_RECALL`

La variante `objective_recall` necesita un dato adicional
(`selectedOptionKey`). **No se añade un payload genérico** — comando de
dominio específico y cerrado:

```
POST /api/guide/sessions/:sessionId/steps/:stepKey/recall
Body: { "idempotencyKey": "uuid", "selectedOptionKey": "..." }   // cerrado
```

Reusa la MISMA maquinaria de CC-7.3: `parseRecallCatalogContent` (contrato
estricto declarado), `LearningCatalogResolver` (ítem → unidad → edición →
libro + pertenencia del concepto), calificación server-side contra
`correctOptionKey`. El cliente jamás declara `result` ni `evaluationSource`.

### Comando de cancelación

```
POST /api/guide/sessions/:sessionId/cancel
Body: { "idempotencyKey": "uuid" }        // cerrado
```

Cancela la sesión ACTIVE propia (§6). No emite `guide_session_completed` ni
falsifica pasos.

Cada policy futura que requiera datos propios sigue este patrón: comando
dedicado, body cerrado, parser autoridad.

---

## 5. Relación con los comandos CC-7.3 y consecuencias educativas

### Los comandos standalone jamás tocan sesiones

| Comando CC-7.3                                   | Decisión                           | Razón                                                                                                                                                                                                                |
| ------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /learning/units/:unitKey/open`             | `NEVER_GUIDE_STEP`                 | Actividad ambiental (el lector la disparará best-effort). Contarla como paso = actividad incidental.                                                                                                                 |
| `POST /learning/units/:unitKey/complete`         | `NEVER_GUIDE_STEP`                 | Es un claim educativo global sobre la unidad, no un paso de una intervención.                                                                                                                                        |
| `POST /learning/concepts/:conceptKey/explore`    | `NEVER_GUIDE_STEP`                 | Ambiental. Un paso `CONCEPT_EXPLORATION` del Guide se acepta con el comando genérico §4.                                                                                                                             |
| `POST /learning/recall-attempts`                 | `DEDICATED_GUIDE_COMMAND_REQUIRED` | La calificación objetiva DENTRO de una sesión viaja por `…/steps/:stepKey/recall`, que reusa resolver + grading de CC-7.3 pero ejecuta la transición Guide atómicamente. El endpoint standalone jamás toca sesiones. |
| `POST /learning/practices/:exerciseKey/complete` | `NEVER_GUIDE_STEP`                 | Un paso `CATALOG_PRACTICE` del Guide se acepta con el comando genérico §4; el comando standalone queda para actividad fuera de sesión.                                                                               |

Consecuencias duras: una llamada normal a cualquier comando CC-7.3 jamás
cambia ninguna GuideSession (no reciben `sessionId` y no lo resolverán);
`LearningEvent` no se consulta jamás para calcular avance.

### Matriz definitiva de consecuencias educativas por step kind

Principio rector: **un evento educativo solo se emite desde el Guide cuando la
transición del paso ES la misma transición educativa que el evento ya
representa** — jamás para traducir un autoinforme de intervención en una señal
de otra naturaleza.

| Step kind               | → `GuideSessionStep` | → LearningEvent educativo adicional                                                                                                                                                                                                                                                                                                          | Motivo                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ACTIVE_RECALL`         | Sí (fila del ledger) | **Sí — `active_recall_attempted`**, atómico en la misma tx, con `selectedOptionKey`, `result` server-graded, `evaluationSource="server"` y referencias resueltas (unidad/edición/concepto del ítem).                                                                                                                                         | Es la MISMA transición educativa que el recall standalone. Emitirlo conserva UNA sola historia de recall para precisión y espaciamiento — un intento dentro del Guide cuenta igual que uno fuera.                                                                                                                                            |
| `CATALOG_PRACTICE`      | Sí                   | **Sí — `practice_completed`**, atómico en la misma tx, con las mismas reglas de transición del comando standalone (un solo camino de código compartido en CC-7.4C — si la regla de estado del standalone considera la práctica ya registrada, el paso se acepta igual y no se duplica el evento; un fallo real de storage revierte todo §7). | Misma transición educativa (`catalog_practice_confirmation` es la policy de ambos). No emitirlo dejaría la historia de prácticas incompleta según dónde se hizo.                                                                                                                                                                             |
| `CONCEPT_EXPLORATION`   | Sí                   | **No.**                                                                                                                                                                                                                                                                                                                                      | El paso es un autoinforme de intervención («marcaste que exploraste»); `concept_explored` standalone registra interés ambiental (el usuario BUSCÓ el concepto). Son claims de naturaleza distinta — emitirlo lavaría un autoinforme como señal de interés y podría duplicar el conteo del mismo día. El registro del paso vive en el ledger. |
| `EXPLICIT_CONFIRMATION` | Sí                   | **No.**                                                                                                                                                                                                                                                                                                                                      | No existe evento educativo standalone equivalente; crear uno sería telemetría nueva sin consumidor. El ledger es el registro.                                                                                                                                                                                                                |
| `SERVER_ACTION`         | —                    | —                                                                                                                                                                                                                                                                                                                                            | Diferido fuera de V1 (§2).                                                                                                                                                                                                                                                                                                                   |

**No se crea `guide_step_completed`** (decisión no reabierta — §8).

### Idempotencia de cada evento emitido (sin reutilizar keys de forma incompatible)

Regla: **un comando de cliente lleva exactamente UNA `idempotencyKey` y emite
a lo sumo UN LearningEvent**. La misma key aparece en el receipt (§7, unique
`(userId, idempotencyKey)` en SU tabla) y en el evento emitido (unique
`(userId, idempotencyKey)` en LearningEvent) — tablas distintas, dominios de
unicidad distintos, mismo valor: correcto y deseable (un comando = una key en
todas partes). Nunca dos eventos comparten una key porque ningún comando emite
dos eventos:

| Comando                              | Receipt            | Evento emitido (con la MISMA key) |
| ------------------------------------ | ------------------ | --------------------------------- |
| start                                | `START`            | `guide_session_started`           |
| step complete (concept/confirmation) | `STEP_COMPLETE`    | —                                 |
| step complete (practice)             | `STEP_COMPLETE`    | `practice_completed`              |
| step recall                          | `STEP_RECALL`      | `active_recall_attempted`         |
| cancel                               | `CANCEL`           | —                                 |
| session complete                     | `SESSION_COMPLETE` | `guide_session_completed`         |

---

## 6. Máquina de estados final

```
ACTIVE ──(stepsCompleted === totalSteps + comando complete)──► COMPLETED
ACTIVE ──(comando cancel │ autocancel al iniciar otra sesión)─► CANCELLED
```

### Invariantes por estado

```
ACTIVE:
  completedAt = null
  cancelledAt = null
  stepsCompleted derivado del ledger (no congelado)
  currentStepKey = siguiente step no aceptado por `order`

COMPLETED:
  completedAt != null   (reloj del servidor)
  cancelledAt = null
  stepsCompleted = totalSteps   (congelado desde el ledger en la misma tx)
  currentStepKey = null
  no acepta transiciones

CANCELLED:
  completedAt = null
  cancelledAt != null   (reloj del servidor)
  currentStepKey = null
  no acepta transiciones
```

**`cancelledAt` SÍ entra al modelo.** `CANCELLED` no se representa solo por
status: el historial debe poder explicar CUÁNDO se canceló (autocancel vs
cancel explícito se distinguen por la correlación temporal con el start de la
sesión siguiente — sin columnas extra).

### Invariantes generales

- Una sesión **fija `guideKey + guideVersion` al comenzar**; la definición no
  cambia debajo de una sesión activa (publicar cambios = nuevo
  `guideVersion`; las sesiones viejas terminan contra su versión fijada).
- Un paso no puede completarse dos veces (unique `(sessionId, stepKey)`).
- Pasos fuera de orden son rechazados (409) — V1 es secuencial estricto por
  `order`; paralelismo declarado requeriría un ADR posterior.
- `complete` de sesión exige `stepsCompleted === totalSteps`; si falta alguno
  ⇒ 409.
- `stepsCompleted` se deriva EXCLUSIVAMENTE del ledger; el cliente nunca puede
  sobrescribir el contador.
- `editionId`/`unitId` del ancla: ambos `NULL` o ambos no `NULL`.
- Una (1) sesión ACTIVE por usuario: unique parcial
  `(userId) WHERE status = 'ACTIVE'`.

### Semántica exacta de los campos V1 (sin opcionales)

| Campo            | Significado                                                                       |
| ---------------- | --------------------------------------------------------------------------------- |
| `stepsCompleted` | Filas ACCEPTED únicas (por `stepKey`) del ledger de la sesión.                    |
| `totalSteps`     | Steps del catálogo `guideKey@guideVersion` fijado.                                |
| `currentStepKey` | El siguiente step no aceptado según `order`; **`null` en COMPLETED y CANCELLED**. |

`requiredStepsCompleted` y `totalRequiredSteps` **no existen en V1** (§2 —
todos los pasos son required; serían siempre idénticos a los de arriba).
Ningún otro campo derivado se expone.

### Autocancel al iniciar otra sesión

Dentro de UNA transacción, en este orden:

```
START_LOCK por user (§7)
→ revisar receipt (replay/conflicto §7)
→ cancelar la ACTIVE previa (cancelledAt = now)   [solo si NO es replay]
→ crear la nueva sesión
→ receipt START + guide_session_started (misma tx, misma key)
→ commit
```

**Un replay exacto del start original NO cancela la sesión actual ni crea
otra sesión**: el receipt se revisa ANTES del autocancel, bajo el
`START_LOCK` — replay ⇒ devolver la sesión original y salir, cero efectos.

---

## 7. Idempotencia transversal y concurrencia

### `GuideCommandReceipt` — registro único de idempotencia de TODOS los comandos Guide

Contrato conceptual:

```ts
type GuideCommandType =
  | "START"
  | "STEP_COMPLETE"
  | "STEP_RECALL"
  | "CANCEL"
  | "SESSION_COMPLETE";

interface GuideCommandReceipt {
  id: string;
  userId: string;
  idempotencyKey: string; // canonicalizada (UUID → lowercase, fail-closed, CC-7.2)
  commandType: GuideCommandType;
  sessionId: string;
  stepKey: string | null; // solo STEP_*
  semanticFingerprint: string; // fórmula DEFINIDA abajo — jamás un hash opaco
  createdAt: string;
}
```

**Uniqueness obligatoria:** `unique(userId, idempotencyKey)`.

**`semanticFingerprint` — fórmula explícita, no hash opaco.** Columnas
semánticas cerradas primero (`commandType`, `sessionId`, `stepKey`); el
fingerprint es la serialización canónica determinista, por tipo de comando, de
los componentes que definen la semántica — todos ids server-resolved, claves
de catálogo o enums; jamás texto libre, jamás JSON:

```
START            → "START|" + (editionId ?? "") + "|" + (unitId ?? "")
STEP_COMPLETE    → "STEP_COMPLETE|" + sessionId + "|" + stepKey
STEP_RECALL      → "STEP_RECALL|" + sessionId + "|" + stepKey + "|" + selectedOptionKey
CANCEL           → "CANCEL|" + sessionId
SESSION_COMPLETE → "SESSION_COMPLETE|" + sessionId
```

(START usa el CONTEXTO resuelto y no `sessionId` porque el id lo genera el
servidor — el conflicto de un start es «misma key, contexto distinto».
STEP_RECALL incluye la opción: misma key + opción distinta = conflicto aunque
el resultado derivado coincida — regla heredada de CC-7.3.)

**Comportamiento:**

```
misma userId + key + mismo fingerprint  → replay (respuesta original, cero efectos)
misma userId + key + fingerprint ≠      → 409 LEARNING_EVENT_IDEMPOTENCY_CONFLICT
```

Los receipts se escriben SOLO para comandos aceptados (o su replay); un
comando rechazado (400/403/404/409/422) no persiste receipt ni ningún otro
efecto.

**Aclaraciones obligatorias:**

- `LearningEvent` **no** es el registro de idempotencia de los steps — dos de
  los cinco comandos no emiten evento alguno (tabla §5) y necesitan replay
  igual.
- El receipt **no** es fuente de `stepsCompleted` — `GuideSessionStep` sigue
  siendo la única fuente del contador (§3).
- El natural unique `(sessionId, stepKey)` sigue existiendo y resuelve la
  unicidad del PASO; no sustituye al receipt (que resuelve la idempotencia del
  COMANDO).
- Receipt, fila del ledger, estado de la sesión y eventos se escriben en **una
  sola transacción**; cualquier fallo revierte todo.

**Relación receipts ↔ `guide_session_started`/`completed` (sin duplicar
replay):** el receipt es la ÚNICA autoridad de replay/conflicto de los
comandos Guide y se consulta PRIMERO, bajo el lock correspondiente. El evento
se appenda vía `LearningEventRepository.appendValidated` con la MISMA key en
la misma transacción — como el replay corta antes de llegar al append, el
`@@unique([userId, idempotencyKey])` de LearningEvent nunca actúa como segundo
punto de decisión: queda como defensa en profundidad (invariante de CC-7.2
intacto), no como semántica duplicada.

### Locks — exactamente dos namespaces

```
START_LOCK          = guide:start:<userId>
SESSION_MUTATION_LOCK = guide:session:<userId>:<sessionId>
```

- **`START_LOCK` serializa TODOS los starts del mismo actor**, aunque usen
  idempotencyKeys distintas (es lo que hace seguro el autocancel §6 y el
  unique parcial de una-ACTIVE-por-usuario).
- **`SESSION_MUTATION_LOCK` es compartido** por: step complete genérico, guide
  recall, cancel y session complete. **No** hay namespaces separados para step
  y complete — toda mutación de una sesión se serializa contra las demás.
- **Orden cuando una operación necesita ambos:** `START_LOCK` →
  `SESSION_MUTATION_LOCK`. **Nunca al revés** (previene deadlock del
  autocancel, que toma el start lock y luego muta la sesión previa).

`pg_advisory_xact_lock(hashtextextended(lockKey, 42))` dentro de
`$transaction` — patrón ya probado en CC-7.3.

### Matriz de concurrencia (para los pg-specs de CC-7.4B/C)

| #   | Escenario                                    | Resultado                                                                                                                                                                                                                                              |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Dos starts del mismo user con keys distintas | `START_LOCK` los serializa: el primero crea la sesión A; el segundo (fingerprint distinto, no replay) autocancela A y crea B. Resultado: una sola ACTIVE (B), A CANCELLED con `cancelledAt`.                                                           |
| 2   | Dos accepts del MISMO step (keys distintas)  | `SESSION_MUTATION_LOCK` serializa: el primero acepta (fila); el segundo encuentra el step ya ACCEPTED ⇒ 409, cero receipt, cero filas. Una sola fila en el ledger.                                                                                     |
| 3   | Dos steps fuera de orden entre sí            | El lock serializa; cada uno se evalúa contra el estado YA avanzado: acepta solo el que sea el `currentStepKey` en su turno; el otro ⇒ 409 out-of-order.                                                                                                |
| 4   | Último step vs session complete              | Mismo lock: si el step entra primero, complete ve `stepsCompleted === totalSteps` y acepta; si complete entra primero ⇒ 409 (falta un paso, sin receipt), el step acepta después y el retry del complete (misma key, ahora sin receipt previo) acepta. |
| 5   | Cancel vs step                               | Mismo lock: cancel primero ⇒ sesión CANCELLED, el step ⇒ 409 (no acepta transiciones); step primero ⇒ acepta, cancel después cancela con el paso ya en el historial (honesto).                                                                         |
| 6   | Complete vs complete                         | Keys distintas: el primero completa, el segundo ⇒ 409 already completed. Misma key: replay exacto vía receipt (una sola transición, un solo evento).                                                                                                   |

### Transacción canónica de aceptación de paso

```
SESSION_MUTATION_LOCK
→ revisar receipt (replay/conflicto)
→ validar máquina de estados + variante + target + entitlement
→ persist step transition           (fila del ledger)
→ update GuideSession derived state (currentStepKey)
→ optional domain operation         (p. ej. grading del recall)
→ emit LearningEvent según matriz §5 (misma key, escritor único)
→ persist receipt
→ commit conjunto
```

**Un fallo de la operación asociada, del evento o del receipt revierte TODA la
transición** — la fila del ledger no sobrevive a un evento fallido, y
viceversa.

---

## 8. Eventos — fuente de verdad vs. consecuencia

| Rol                          | Qué                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Fuente de verdad**         | `GuideSession` + `GuideSessionStep` (ledger) + `GuideCommandReceipt` (idempotencia).                    |
| **Consecuencia append-only** | `LearningEvent` (`guide_session_started`, `guide_session_completed`, y los educativos de la matriz §5). |

Los eventos **no impulsan ni reconstruyen en runtime el contador**: leer
`stepsCompleted` es leer el ledger/el campo congelado, jamás contar eventos.
(Los eventos siguen sirviendo a read models educativos y auditoría — su rol de
CC-7.2.)

### ¿Necesita V1 un evento `guide_step_completed`?

**No** (decisión no reabierta):

- **Negocio:** ningún consumidor V1 lo necesita. La continuidad la da
  `currentStepKey`; el progreso lo dan los campos §6; el read model del Guide
  lee su propio ledger; la historia educativa la dan los eventos de la matriz
  §5.
- **Privacidad:** un evento por paso duplicaría en el log append-only una
  traza fina de comportamiento que ya vive en el ledger con su ciclo de vida
  propio.
- **Retención:** el ledger muere con la cuenta (§9); duplicarlo en eventos
  crea dos copias del mismo hecho a gobernar por separado.

V1 emite `guide_session_started` (payload `{guideSessionId}`) y
`guide_session_completed` (payload `{guideSessionId, stepsCompleted}`) — los
contratos ya cerrados en CC-7.1/7.2 — más los eventos educativos de la matriz
§5 como consecuencia atómica de sus steps. Si un consumidor futuro demuestra
necesidad del evento por paso, se añade de forma aditiva con su propio ADR
corto; su payload sería `{guideSessionId, stepKey}` y nada más.

**Este PR no modifica enums, tipos ni schema** — esta sección es diseño.

---

## 9. Privacidad

### Clasificación de lo que Guide almacenará

| Clase                       | Ejemplos                                                                                                             | Sensibilidad                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Identificadores de catálogo | `guideKey`, `guideVersion`, `stepKey`, `conceptKey`/`itemKey`/`exerciseKey`/`confirmationKey`, `editionId`, `unitId` | Contenido público licenciado — no sensible por sí mismo.                |
| Estado                      | `ACTIVE`/`COMPLETED`/`CANCELLED`, contador congelado                                                                 | Metadata de actividad — disciplina de LearningEvent.                    |
| Timestamps                  | `startedAt`, `completedAt`, `cancelledAt`, aceptación de cada paso, `createdAt` del receipt                          | Ídem.                                                                   |
| Idempotencia                | `idempotencyKey` canonicalizada + `semanticFingerprint` (fórmula §7 — solo ids/enums/claves)                         | Ídem.                                                                   |
| Autoinformes explícitos     | Aceptación de un paso `explicit_confirmation`/`catalog_practice_confirmation`                                        | Se registra COMO autoinforme (claims clasificados) — jamás como prueba. |
| Resultados objetivos        | `correct`/`incorrect` de un paso `ACTIVE_RECALL`                                                                     | Hecho educativo server-graded; enum, jamás la respuesta como texto.     |

### Prohibido en `GuideSession`, `GuideSessionStep` y `GuideCommandReceipt` (columnas que NO existirán)

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
- **Cierre de cuenta:** `onDelete: Cascade` desde `User` — sesiones, ledger y
  receipts mueren con la cuenta (patrón LearningEvent).
- **Retención:** ciclo de vida de la cuenta; sin TTL propio en V1 (las
  sesiones `CANCELLED` se conservan como historial honesto — una
  reorganización editorial tampoco borra historial: las referencias
  `editionId`/`unitId` usan `onDelete: SetNull`/restrict según convenga en
  CC-7.4B, nunca cascade desde contenido).
- **Revocación/cancelación:** el usuario puede cancelar su sesión ACTIVE con
  el comando §4 (o iniciar otra, que autocancela); cancelar no emite
  `guide_session_completed` ni falsifica pasos.
- **Logs sanitizados:** errores code-only (disciplina CC-7.3 —
  `LearningEventStorageError` para fallas de infraestructura, cero valores,
  cero causas); ningún log imprime claves de sesión ajenas ni contenido.
- **No se conservará:** duración por paso, dwell, orden de interacción fina,
  intentos fallidos (rechazados no persisten receipt ni fila) — nada fuera de
  la clasificación de arriba.

---

## 10. Plan de implementación y criterios de desbloqueo

| PR                 | Contenido                                                                                                                                                                                                                                             | Gate                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **CC-7.4A** (este) | ADR 0019 + actualizaciones docs. **Docs-only.**                                                                                                                                                                                                       | Aprobación de Jorge en el PR. |
| **CC-7.4B**        | Catálogo Guide V1 (código, unión discriminada §2) + migración aditiva `GuideSession` + `GuideSessionStep` + `GuideCommandReceipt` (uniques + constraints de estado §6-§7) + ratchet `no-direct-guide-step-write` + pg-spec de migración en dos fases. | ADR aprobado.                 |
| **CC-7.4C**        | Lifecycle completo: start (+ autocancel), step complete, step recall, cancel, session complete; receipt transversal; emisión de eventos según matriz §5 vía repositorio único; matriz de concurrencia §7 en PG real.                                  | 7.4B mergeado.                |
| **CC-7.4D**        | OpenAPI cerrado + ratchet + API client (`createGuideSession`, `completeGuideSessionStep`, `submitGuideStepRecall`, `cancelGuideSession`, `completeGuideSession`) + firewall full-stack (los eventos guide en el batch zero-delta).                    | 7.4C mergeado.                |
| **CC-7.5**         | Integración web.                                                                                                                                                                                                                                      | 7.4D mergeado.                |
| **CC-7.6**         | Integración mobile.                                                                                                                                                                                                                                   | 7.5 mergeado.                 |

El productor de pasos (7.4B/C) queda deliberadamente separado de las
integraciones de cliente (7.5/6) — el backend es verificable por pg-specs
antes de que exista UI.

### Criterio de desbloqueo de CC-7.4

`CC7_4_STATUS` pasa de `BLOCKED_SERVER_STEP_SOURCE_REQUIRED` a
`READY_TO_IMPLEMENT` **únicamente con el merge aprobado de este ADR**, y solo
porque el ADR aprobado ya define TODO lo siguiente (nombrar el ledger y las
rutas no basta):

1. **Fuente de pasos** — ledger explícito `GuideSessionStep` (§3).
2. **Unión discriminada del catálogo y targets** — 4 variantes V1 con target,
   evidencia y comando autorizado; combinaciones inválidas inexpresables;
   `SERVER_ACTION` diferido (§2).
3. **Completion policies** — vocabulario cerrado con evidencia por variante y
   policies prohibidas (§2).
4. **Receipt de idempotencia transversal** — `GuideCommandReceipt` con
   `unique(userId, idempotencyKey)`, fingerprint de fórmula explícita y
   relación definida con los eventos (§7).
5. **Locks correctos** — `START_LOCK` user-wide + `SESSION_MUTATION_LOCK`
   compartido + orden fijo (§7).
6. **Semántica V1 sin opcionales** — `required: true` literal, tres campos,
   cursor inequívoco (§2, §6).
7. **Matriz de consecuencias LearningEvent** — decisión por kind con
   estrategia de keys (§5).

El merge constituye aprobación de DISEÑO. Cada PR de implementación
(7.4B → 7.6) requiere su propia instrucción ejecutiva; este ADR no las
autoriza en bloque.
