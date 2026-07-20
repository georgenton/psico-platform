# Learning Events V1 — contrato, firewall emocional y plan (CC-7, diseño)

**Estado:** DISEÑO — nada de este documento está implementado. CC-7 se entrega
como PRs pequeños (ver §9). Este documento es la fuente de verdad del contrato.

**Contexto:** Content Core está desplegado (CC-6E cerrado,
`CONTENT_CORE_ROLLOUT=COMPLETE`, _Familias Ensambladas_ servido desde
Work/Edition/Revision). El siguiente sistema es el registro educativo:
**LearningEvent** — append-only, server-owned — y su consumidor **Guide V1**.
El principio rector viene del programa V2 del Mapa Emocional (Fase C,
"aprendizaje ≠ mapa") y del ADR 0016 §5: **la actividad educativa jamás toca
los ejes emocionales**.

---

## A. Estado existente (auditado 2026-07-19 contra `develop`)

El modelo ya existe **inerte** en `apps/api/prisma/schema.prisma` (introducido
con Content Core; la tabla está migrada en producción y vacía):

```prisma
enum LearningEventKind {
  UNIT_OPENED
  UNIT_COMPLETED
  BLOCK_DWELL
  GUIDE_SESSION_STARTED
  GUIDE_SESSION_COMPLETED
  HIGHLIGHT_CREATED
  ANNOTATION_CREATED
  RESONANCE_CONFIRMED
}

model LearningEvent {
  id        String            @id @default(cuid())
  userId    String
  kind      LearningEventKind
  editionId String?
  unitId    String?
  blockKey  String?
  payload   Json?
  createdAt DateTime          @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, kind])
}
```

Verificado además:

- **Cero escrituras** en `apps/api/src` (ninguna referencia `learningEvent.`
  fuera de specs). Cero controllers `learning/*`. **No existe** `GuideSession`.
- ADR 0016 ya fija tres decisiones que este contrato hereda: (§5) payload
  discriminado **server-owned**; (invariante) firewall con el Mapa; (rechazo
  explícito) `meta` client-authored = "a hole through the firewall".

**El modelo actual NO es el contrato final.** Divergencias a resolver en la
implementación (siempre aditivas, ver §9 PR 2):

| Tema                                                                | Estado actual                 | Contrato V1                                                                                                                                                                 |
| ------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `concept_explored`, `active_recall_attempted`, `practice_completed` | no existen en el enum         | se AÑADEN (enum aditivo)                                                                                                                                                    |
| `BLOCK_DWELL`                                                       | en el enum                    | **fuera de V1** (telemetría de dwell diferida; si llega, con buckets, jamás timestamps por bloque)                                                                          |
| `HIGHLIGHT_CREATED`, `ANNOTATION_CREATED`, `RESONANCE_CONFIRMED`    | en el enum                    | **fuera de V1** — las marcas y resonancias ya tienen sus tablas como fuente de verdad; duplicarlas como eventos se decidirá (o no) con datos. Ningún endpoint V1 los acepta |
| `payload Json?`                                                     | JSON libre a nivel de storage | el **API jamás acepta JSON libre** y el **único escritor** es `LearningEventRepository.appendValidated` (§E-bis). La columna es encoding, no contrato                       |

---

## B. Contrato V1 — comandos de dominio, no un log de afirmaciones

### El principio de ownership, tomado en serio

Un log no es "server-owned" porque el servidor lo escriba: es server-owned
cuando **el servidor es quien establece el hecho**. Un evento que se limita a
copiar la afirmación del cliente ("terminé", "acerté") es un log de claims con
sello del servidor — no lo presentamos como otra cosa. Por eso V1 se modela
como **comandos de dominio**: el cliente pide una acción sobre una entidad; el
servidor valida, ejecuta una **transición de estado propia** y, solo si la
transición procede, **emite** el evento. La matriz declara honestamente qué
garantiza el servidor en cada tipo.

### Principios

1. **Append-only ≠ retención infinita.** No existe UPDATE ni DELETE mediante
   el API de producto; los eventos son **inmutables durante su vida útil** y
   las correcciones son eventos nuevos. Las únicas eliminaciones autorizadas
   son: (1) cierre de cuenta (cascade); (2) la política de retención una vez
   **aprobada** y ejecutada por el worker (§F — el sweep NO se implementa como
   definitivo hasta esa aprobación); (3) un procedimiento excepcional de
   privacidad/compliance auditado.
2. **Comandos, no eventos, en el wire.** El cliente jamás postea "un evento":
   invoca un comando de dominio (§G). El evento es un efecto interno de la
   transición.
3. **Unión discriminada cerrada.** Cada tipo tiene un payload específico con
   campos enumerados, reconstruido por el servidor. No existe
   `Record<string, unknown>`, no existe `meta`, no existe passthrough.
4. **Solo claves de catálogo y enums.** Un comando solo referencia entidades
   que el servidor puede verificar y **resolver hasta contenido publicado**
   (§C-bis): `editionKey`/`unitKey`, `conceptKey`, `exerciseKey`, `itemKey`,
   `guideSessionId` propio, `selectedOptionKey` de catálogo. Todo lo demás →
   rechazo.
5. **`idempotencyKey` OBLIGATORIO** en todo comando originado en cliente
   (400 `LEARNING_EVENT_IDEMPOTENCY_KEY_REQUIRED` si falta). Replay exacto →
   200 con el resultado original; misma key con payload distinto → 409
   `LEARNING_EVENT_IDEMPOTENCY_CONFLICT`. La dedup semántica por tipo aplica
   además, siempre.

### Prohibido aceptar (validación server-side, siempre 400)

- metadata arbitraria / JSON libre / campos no declarados (whitelist estricta);
- texto del diario, mensajes de Eco, transcripciones de voz, prompts libres o
  **cualquier string escrito por el usuario** (V1 no tiene ni un solo campo de
  texto libre — todos los strings son claves validadas contra catálogo);
- inferencias emocionales, scores emocionales, etiquetas clínicas;
- cualquier dato del Mapa Emocional (ejes, confianza, momento, EWS, checkins).

### Matriz de ownership V1 (corregida)

| `type`                    | Comando que lo emite                                           | Qué GARANTIZA el servidor                                                                                                                                                                                         | Qué sigue siendo self-reported                                                                                                                     | Dedup semántica                               |
| ------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `unit_opened`             | `POST /api/learning/units/:unitKey/open`                       | edición/unidad publicadas + entitlement + fecha                                                                                                                                                                   | que el usuario realmente leyó                                                                                                                      | 1/`(user, unit)` por día UTC                  |
| `unit_completed`          | `POST /api/learning/units/:unitKey/complete`                   | unidad y revisión válidas + entitlement + **estado previo registrado** + **transición de progreso aceptada** (sin ella → 409 `LEARNING_EVENT_INVALID_TRANSITION`, nada persiste) + reloj e identidad server-owned | que el usuario realmente terminó de leer/consumir la unidad; su atención; su comprensión                                                           | 1/`(user, unit, revisionNumber)`              |
| `concept_explored`        | `POST /api/learning/concepts/:conceptKey/explore`              | resolución completa concept → unit → edition → book + entitlement                                                                                                                                                 | el interés real                                                                                                                                    | 1/`(user, concept)` por día UTC               |
| `active_recall_attempted` | `POST /api/learning/recall-attempts`                           | para ítems **objetivos**: el servidor CALCULA `result` comparando `selectedOptionKey` contra el catálogo — el cliente no puede afirmar `correct`. Para ítems autoevaluados: `evaluationSource="self_assessed"`    | solo en self_assessed, la autoevaluación (marcada como tal)                                                                                        | sin dedup (cada intento cuenta); rate-limited |
| `practice_completed`      | `POST /api/learning/practices/:exerciseKey/complete`           | transición de práctica de catálogo: exercise resuelto a su unidad/libro + entitlement + regla de estado (1/día)                                                                                                   | que la práctica experiencial ocurrió (una respiración no es verificable server-side — se registra como transición aceptada, no como verdad física) | 1/`(user, exercise, unit)` por día UTC        |
| `guide_session_started`   | transición interna de `POST /api/guide/sessions`               | todo: la sesión ES estado del servidor                                                                                                                                                                            | —                                                                                                                                                  | 1/`(guideSessionId)`                          |
| `guide_session_completed` | transición interna de `PATCH /api/guide/sessions/:id/complete` | todo: `stepsCompleted` lo cuenta el **servidor** desde el estado de la sesión (los pasos avanzan por comandos previos), no lo declara el cliente                                                                  | —                                                                                                                                                  | 1/`(guideSessionId)`                          |

Notas:

- **`unit_opened` no es prueba de consumo real.** La transición de
  `unit_completed` verifica que existe estado previo registrado, no que la
  unidad fue efectivamente leída: consumo, atención y comprensión permanecen
  self-reported hasta que exista una evidencia server-verifiable más fuerte.

- `guide_session_*` **no existen como requests**: solo cambios de estado de
  `GuideSession` los emiten. Un intento de forjarlos por API → 400
  `LEARNING_EVENT_SERVER_OWNED_TYPE` (defensa en profundidad: ninguna ruta los
  acepta siquiera sintácticamente).
- Recall: la respuesta del usuario jamás viaja como texto — en ítems objetivos
  viaja `selectedOptionKey` (clave de catálogo) y el servidor califica; en
  autoevaluados viaja el enum `self_result` y queda marcado `self_assessed`.
- Los intentos `self_assessed` **no se incluyen en la precisión**, **no
  gobiernan automáticamente el espaciado** de repasos y permanecen como hechos
  educativos cualitativos (el Guide puede mencionarlos como hechos, nunca como
  medida).

---

## C. Firewall absoluto con el Mapa Emocional (invariante)

> **INVARIANTE CC-7.** `LearningEvent`, `ReadingSession`, `GuideSession`, el
> progreso educativo, quizzes/active recall, `Highlight`, `Annotation` y
> cualquier otra actividad educativa **NO leen ni modifican** los ejes del
> Mapa Emocional: ni `value`, ni `confidence`, ni `status`, ni `evidence`, ni
> presencia de señal, ni procedencia.

Semántica que el producto asume como axioma (y el copy-contract ya protege):

- **Leer no implica estado emocional.**
- **Completar una actividad no implica regulación emocional.**
- **Recordar un concepto no implica bienestar.**
- **Engagement no es una emoción** (cerrado por la Fase C del programa V2).
- **Rendimiento no es una señal clínica.**

### Resonance (corregido)

Para CC-7, `Resonance` se define así y solo así:

- es **cualitativa**;
- existe únicamente por **confirmación explícita** del usuario (ciclo ARC);
- **no modifica automáticamente** `value`/`confidence`/`status`/`evidence`/
  presencia de señal de ningún eje;
- **LearningEvent jamás crea una Resonance** (ningún evento educativo se
  transforma en resonancia);
- `concept_explored` **no es** una Resonance — es navegación educativa sin
  peso en el mapa.

**Excepción preexistente, pendiente e independiente:** hoy en producción los
modelos ARC-C1 (Conexión) y ARC-P1 (Propósito) del programa V2 sí derivan
valores de eje desde resonancias confirmadas. Esa conversión **no forma parte
del firewall CC-7** y queda registrada como **decisión de producto pendiente**
(`resonance_axis_conversion=PENDING_DECISION` para el sistema preexistente;
**FORBIDDEN** para todo lo nuevo de CC-7). Resolverla —retirarla, gatearla o
ratificarla como excepción explícita y acotada— es prerrequisito del test §D
(ver nota de conflicto ahí). Nada en CC-7 amplía, consume ni depende de esa
conversión.

### Mecanismos de enforcement (tres capas)

1. **Frontera de módulos + ratchets estáticos.** `EmotionalMapModule` no
   importa módulos learning y sus queries no tocan `LearningEvent`/
   `GuideSession`: ratchet `no-learning-in-map` (grep sobre los archivos del
   mapa, espejo del `no-emotional-map.spec.ts` existente). Y el ratchet
   `no-direct-learning-event-write` (§E-bis) cierra el bypass interno.
2. **Tipos.** El input de `scoreEmotionalMap()` no gana campos learning; el
   registry de modelos no admite modelos cuyo insumo sea actividad educativa.
3. **Test de inversión semántica** (§D) — la prueba dinámica.

---

## D. Test de inversión semántica (diseño)

Primera versión **DB-level en PR 2** (`learning/learning-map-firewall.pg-spec.ts`,
familia `test:locks`); ampliación full-stack en PR 8. **Los endpoints (PR 3)
no pueden aterrizar antes de que exista este firewall dinámico ejecutable.**

```
1. Seed: usuario con historia emocional real (moods ordinales + checkins) para
   que el mapa tenga ejes con señal (un mapa vacío pasaría trivialmente).
2. A := mapProjection(user)   // cache bypass, cómputo fresco
3. Crear, para ese usuario, por las vías reales (repositorio/comandos):
   - los 7 tipos V1 de LearningEvent;
   - ReadingSession (heartbeat + complete) y progreso;
   - GuideSession start→complete;
   - recall objetivo (correct+incorrect calculados por el servidor) y
     self_assessed; practice_completed;
   - Highlight + Annotation (Core, blockKey+blockVersionId);
   - una Resonance CUALITATIVA confirmada.
4. B := mapProjection(user)   // mismo bypass
5. expect(B).toStrictEqual(A) — igualdad semántica exacta.
6. CONTROL NEGATIVO: crear un checkin → C := mapProjection(user) →
   expect(C).not.toStrictEqual(A) (sin esto el test podría pasar vacío).
```

`mapProjection` es una **proyección canónica** del resultado del mapa que
**ignora** timestamps, ids de snapshot, TTLs y metadata incidental (narrative
LLM excluido por no-determinista) y **compara**: lista de ejes y su orden;
`value`; `confidence`; presencia de señal (`measured`, `sources`); `status`;
`evidence` completa (`modelId`, `n`) y procedencia; `momento`; parámetros de
dinámica afectiva; `coverage`.

**Nota de conflicto (explícita y honesta):** el paso 3 incluye una Resonance y
el paso 5 exige identidad. Bajo el comportamiento preexistente ARC-C1/ARC-P1,
crear una resonancia HOY sí mueve Conexión/Propósito — es decir, este test,
tal como está especificado, **no puede aterrizar en verde sin resolver antes
la decisión pendiente de §C**. Eso es deliberado: el test fuerza la decisión
en lugar de esconderla. Gate explícito:
**CC-7.1 (contratos y validación pura) puede comenzar ya; CC-7.2
(persistencia + firewall dinámico) NO puede mergearse hasta resolver la
decisión ARC** (`ARC_DECISION_REQUIRED_BEFORE_CC7_2=true`). Queda **prohibido
implementar una excepción silenciosa** en el test de inversión: cualquier
enmienda debe ser explícita, documentada aquí y aprobada — las salidas
posibles son retirar/gatear la conversión ARC o ratificarla como excepción
acotada y visible.

**Criterio de fallo:** cualquier delta en cualquier campo comparado tras el
paso 3 = actividad educativa (o resonancia cualitativa) alterando una
proyección emocional = build rojo. Ratchet permanente: nunca se relaja.

---

## E. Contratos TypeScript propuestos (V1)

Destino en implementación: `packages/types/src/learning-events.ts` (compartido
API/web/mobile) + validadores puros en `apps/api/src/learning/`.

```ts
// ─── Claves y enums ──────────────────────────────────────────────────────────
export type LearningEventTypeV1 =
  | "unit_opened"
  | "unit_completed"
  | "concept_explored"
  | "guide_session_started"
  | "guide_session_completed"
  | "active_recall_attempted"
  | "practice_completed";

export type RecallResult = "correct" | "incorrect" | "skipped";
/** Quién estableció el resultado del recall. */
export type RecallEvaluationSource = "server" | "self_assessed";

// ─── Comandos (lo ÚNICO que el cliente puede enviar) ────────────────────────
// Todos exigen idempotencyKey (UUID). El cliente NUNCA envía un "evento".
export interface OpenUnitCommand {
  idempotencyKey: string; // OBLIGATORIO en todo comando de cliente
}
export interface CompleteUnitCommand {
  idempotencyKey: string;
}
export interface ExploreConceptCommand {
  idempotencyKey: string;
}
export interface SubmitRecallAttemptCommand {
  idempotencyKey: string;
  itemKey: string; // catálogo de ítems de recall
  /** Ítem objetivo: clave de opción del catálogo — el SERVIDOR califica. */
  selectedOptionKey?: string;
  /** Ítem autoevaluado: el enum del usuario — queda self_assessed. */
  selfResult?: RecallResult;
  // Exactamente uno de los dos, según el tipo del ítem en catálogo.
}
export interface CompletePracticeCommand {
  idempotencyKey: string;
}
export interface CompleteGuideSessionCommand {
  idempotencyKey: string; // stepsCompleted NO viaja: lo cuenta el servidor
}

// ─── Payloads persistidos (reconstruidos por el SERVIDOR, jamás del wire) ───
export interface UnitOpenedPayload {
  editionKey: string;
  unitKey: string;
}
export interface UnitCompletedPayload {
  editionKey: string;
  unitKey: string;
  revisionNumber: number;
}
export interface ConceptExploredPayload {
  conceptKey: string;
  unitKey: string; // resuelto por el servidor desde el catálogo, no opcional
}
export interface GuideSessionStartedPayload {
  guideSessionId: string;
}
export interface GuideSessionCompletedPayload {
  guideSessionId: string;
  stepsCompleted: number; // contado por el servidor desde el estado de la sesión
}
export interface ActiveRecallAttemptedPayload {
  unitKey: string; // resuelto desde itemKey por el servidor
  itemKey: string;
  result: RecallResult; // calculado server-side en ítems objetivos
  evaluationSource: RecallEvaluationSource;
  conceptKey: string | null; // del catálogo del ítem, no del cliente
}
export interface PracticeCompletedPayload {
  exerciseKey: string;
  unitKey: string; // resuelto desde exerciseKey por el servidor
}

// ─── Registro persistido (lo que devuelve el API) ───────────────────────────
export interface LearningEventRecord {
  id: string;
  type: LearningEventTypeV1;
  payload:
    | UnitOpenedPayload
    | UnitCompletedPayload
    | ConceptExploredPayload
    | GuideSessionStartedPayload
    | GuideSessionCompletedPayload
    | ActiveRecallAttemptedPayload
    | PracticeCompletedPayload;
  schemaVersion: 1;
  /** Reloj del SERVIDOR. El cliente no puede fechar eventos. */
  occurredAt: string; // ISO-8601
  /** Referencias resueltas por el servidor. */
  editionId: string | null;
  unitId: string | null;
  conceptId: string | null;
  guideSessionId: string | null;
  // userId NUNCA viaja en el wire público; el actor es el JWT. Ownership:
  // toda lectura filtra por userId del token; toda referencia (guideSession)
  // se verifica propia.
}

// ─── Códigos de error (envelope estándar del API) ───────────────────────────
export type LearningEventErrorCode =
  | "LEARNING_EVENT_INVALID_PAYLOAD" // 400 — campo faltante/extra/mal tipado
  | "LEARNING_EVENT_IDEMPOTENCY_KEY_REQUIRED" // 400 — comando sin idempotencyKey
  | "LEARNING_EVENT_IDEMPOTENCY_CONFLICT" // 409 — misma key, payload distinto
  | "LEARNING_EVENT_SERVER_OWNED_TYPE" // 400 — intento de forjar guide_session_*
  | "LEARNING_EVENT_INVALID_TRANSITION" // 409 — completed sin estado previo válido
  | "LEARNING_EVENT_UNKNOWN_UNIT" // 404 — editionKey/unitKey no publicados
  | "LEARNING_EVENT_UNKNOWN_CONCEPT" // 404 — conceptKey fuera de catálogo
  | "LEARNING_EVENT_UNKNOWN_ITEM" // 404 — itemKey/exerciseKey/optionKey fuera de catálogo
  | "LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT" // 422 — clave sin relación editorial inequívoca; nada persiste
  | "LEARNING_EVENT_FORBIDDEN" // 403 — entitlement (mismo gate FREE/PRO del lector)
  | "GUIDE_SESSION_NOT_FOUND" // 404 — sesión inexistente o ajena (sin distinguir)
  | "GUIDE_SESSION_ALREADY_COMPLETED"; // 409 — transición repetida (PATCH idempotente → 200)
```

### C-bis. Entitlement completo — resolución hasta contenido publicado

Toda clave de catálogo se resuelve **server-side hasta su contenido publicado**
antes de validar acceso:

```
catalog key (conceptKey | exerciseKey | itemKey)
  → concept / exercise / item        (catálogo)
  → unit                             (relación editorial del catálogo)
  → edition → book                   (Content Core)
  → ContentAccessService             (mismo gate FREE/PRO del lector)
```

- **No existen contextos opcionales que eviten el gate**: el cliente no puede
  omitir ni suplantar la unidad — la relación editorial la aporta el catálogo.
  (Por eso `ConceptExploredPayload.unitKey` es requerido y server-resolved.)
- Si una clave **no tiene relación editorial inequívoca** (concepto huérfano,
  ejercicio sin unidad), el comando responde 422
  `LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT` y **no se persiste nada**.
- `GET /api/learning/progress` no resuelve ni expone metadata (títulos,
  resúmenes) de contenido al que el usuario ya no tiene acceso (p. ej.
  downgrade PRO→FREE): devuelve conteos y claves neutras; los títulos solo de
  contenido actualmente accesible.

### E-bis. Escritor único + ratchet `no-direct-learning-event-write`

El **único** punto del codebase autorizado a escribir en la tabla es:

```
LearningEventRepository.appendValidated(validatedEvent)
```

El repositorio: recibe **solamente** la unión discriminada ya validada (jamás
`Json`/payload arbitrario — su firma no tiene ningún parámetro de tipo `Json`);
reconstruye el payload campo a campo; añade actor (del JWT), reloj del
servidor, `schemaVersion` e IDs resueltos; y ejecuta el único
`prisma.learningEvent.create` permitido.

**Ratchet obligatorio (PR 2):** spec `no-direct-learning-event-write` que
grepea todo `apps/api/src` y falla si aparece, fuera del archivo del
repositorio aprobado, cualquiera de:

```
prisma.learningEvent.create
prisma.learningEvent.update
prisma.learningEvent.delete
prisma.learningEvent.upsert
```

(más las variantes `createMany`/`updateMany`/`deleteMany`, incluidas en el
grep). El modelo append-only **no puede depender** de que no exista un
endpoint HTTP: el bypass interno queda cerrado por build.

---

## F. Retención y privacidad (threat model)

| Dimensión                 | Política V1                                                                                                                                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Retención**             | `retention_proposal=24_months` (rolling, sweep mensual del worker) — `retention_status=PENDING_PRIVACY_PRODUCT_APPROVAL`. El valor final vive en **configuración validada** (env schema), no como número disperso en código.                                          |
| **Cierre de cuenta**      | Borrado total inmediato vía el cascade existente (`onDelete: Cascade`) — cubierto por el flujo de account-deletion (S3).                                                                                                                                              |
| **Exportación**           | Incluidos en el data export del usuario (JSON) con `exportSchemaVersion` bump — el usuario ve exactamente lo que guardamos (claves + enums + fechas).                                                                                                                 |
| **Minimización**          | Sin texto personal por construcción: ningún campo del contrato puede portar texto libre. Sin IP, sin user-agent, sin device id.                                                                                                                                       |
| **Índices**               | Los 2 existentes + `@@unique([userId, idempotencyKey])` + `@@index([guideSessionId])` cuando GuideSession aterrice.                                                                                                                                                   |
| **Publicidad**            | Prohibido: los eventos no alimentan ads, remarketing ni terceros.                                                                                                                                                                                                     |
| **Perfil emocional**      | Prohibido: no existe camino técnico (firewall §C) ni de producto.                                                                                                                                                                                                     |
| **Auditoría de creación** | Append-only + `occurredAt` server-owned + escritor único (§E-bis) + sin endpoints de mutación ⇒ el log es su propia auditoría. Sentry captura fallos de validación (código de error, jamás payloads).                                                                 |
| **Analítica agregada**    | Solo counts agregados (Pulso), sin drill-down por usuario. `analytics_k_proposal=10` — `analytics_threshold_status=PENDING_PRIVACY_PRODUCT_APPROVAL`; el umbral final en configuración validada. **k-anonimato es una barrera mínima, no una garantía de anonimato.** |

**Amenazas consideradas:**

1. Payload como canal de exfiltración de texto → cerrado por whitelist sin
   campos de texto.
2. Cliente fechando/inflando/falsificando historia → comandos con transición
   server-side, reloj server-owned, dedup semántica, idempotencyKey
   obligatorio, rate limit.
3. Log educativo usado como proxy psicológico → firewall §C + ratchets +
   prohibición de producto.
4. **Inferencia por combinación de celdas agregadas** → los agregados de Pulso
   se publican por celdas independientes predefinidas; prohibido cruzar
   dimensiones ad-hoc que estrechen cohortes.
5. **Ataques de composición/diferencias entre periodos** (restar el agregado
   de ayer al de hoy para aislar a un usuario) → los agregados usan ventanas
   fijas no solapadas y el umbral k se aplica también a los deltas entre
   periodos publicados.
6. **Cohortes pequeñas** → celda bajo el umbral ⇒ se suprime, no se redondea.
7. **Reidentificación por `unitKey`/`conceptKey` raros** (contenido con un
   solo lector) → las celdas de contenido con cohortes < k se agrupan en
   "otros" antes de publicarse.
8. **Acceso interno indebido** → los eventos crudos no tienen superficie
   admin; Pulso solo ve agregados; cualquier acceso operativo a filas crudas
   pasa por el mismo procedimiento de ops auditado (SSH efímero) que el resto
   de la DB.
9. Replay/duplicación → idempotencyKey único + dedup por tipo.
10. Comando contra contenido sin entitlement → resolución completa §C-bis +
    `ContentAccessService` (FREE en unidad PRO ⇒ 403 también para comandos).

---

## G. API propuesta — comandos de dominio (NO implementada)

No existe un POST genérico capaz de solicitar todos los tipos. Cada ruta
ejecuta validación + transición de dominio y después llama internamente a
`LearningEventRepository.appendValidated`:

| Ruta                                                 | Auth | Entitlement                                                                     | Request                                      | Transición server-side                                                                             | Respuesta                  | Errores principales | Rate limit  | Evento emitido            |
| ---------------------------------------------------- | ---- | ------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------- | ------------------- | ----------- | ------------------------- |
| `POST /api/learning/units/:unitKey/open`             | JWT  | `ContentAccessService.assertCanReadUnit` (ch1 preview FREE igual que el lector) | `OpenUnitCommand`                            | valida unidad publicada; dedup 1/día                                                               | 201 `{event}` · 200 replay | 400/403/404/409     | 60/min/user | `unit_opened`             |
| `POST /api/learning/units/:unitKey/complete`         | JWT  | ídem                                                                            | `CompleteUnitCommand`                        | exige estado previo propio (apertura registrada); sin él → 409 `LEARNING_EVENT_INVALID_TRANSITION` | 201 · 200 replay           | 400/403/404/409     | 60/min/user | `unit_completed`          |
| `POST /api/learning/concepts/:conceptKey/explore`    | JWT  | resolución §C-bis hasta el libro                                                | `ExploreConceptCommand`                      | resuelve concept→unit→edition; dedup 1/día                                                         | 201 · 200 replay           | 400/403/404/422     | 60/min/user | `concept_explored`        |
| `POST /api/learning/recall-attempts`                 | JWT  | resolución §C-bis desde `itemKey`                                               | `SubmitRecallAttemptCommand`                 | ítems objetivos: el servidor CALIFICA contra catálogo; autoevaluados: marca `self_assessed`        | 201 `{event}`              | 400/403/404/422     | 30/min/user | `active_recall_attempted` |
| `POST /api/learning/practices/:exerciseKey/complete` | JWT  | resolución §C-bis desde `exerciseKey`                                           | `CompletePracticeCommand`                    | transición de práctica (1/día por unidad)                                                          | 201 · 200 replay           | 400/403/404/409/422 | 30/min/user | `practice_completed`      |
| `POST /api/guide/sessions`                           | JWT  | plan del libro si ancla unidad PRO                                              | `{editionKey?, unitKey?}` + `idempotencyKey` | crea la sesión (1 activa/usuario; la previa se autocierra sin evento `completed`)                  | 201 `{session}`            | 400/403/404         | 10/min/user | `guide_session_started`   |
| `PATCH /api/guide/sessions/:id/complete`             | JWT  | ownership (404 si ajena, sin distinguir)                                        | `CompleteGuideSessionCommand`                | cierra la sesión; `stepsCompleted` contado por el servidor; repetido → 200 sin evento nuevo        | 200 `{session}`            | 404/409             | 10/min/user | `guide_session_completed` |
| `GET /api/learning/progress`                         | JWT  | solo datos propios; sin metadata de contenido inaccesible (§C-bis)              | `?bookSlug=` opcional                        | — (lectura)                                                                                        | agregado por libro         | 400                 | 60/min      | ninguno                   |

Común a todo: envelope de error estándar (`HttpExceptionFilter`), throttler
global vigente, Swagger con `ErrorEnvelopeDto`, y **ninguna** ruta de UPDATE o
DELETE de eventos. Los eventos `guide_session_*` no son expresables como
request en ninguna ruta.

---

## H. Relación con Guide V1

Guide V1 es **consumidor** de los read models de LearningEvent:

- **Continuidad de sesión:** `GuideSession` activa + último
  `guide_session_completed` → retomar donde quedó.
- **Recordar qué unidad se abrió:** último `unit_opened`/`unit_completed` por
  libro → "la última unidad que marcaste fue el capítulo N".
- **Práctica completada:** `practice_completed` por `exerciseKey` → no volver
  a proponer lo ya hecho hoy.
- **Active recall:** historial categórico server-graded → espaciar repasos
  (los ítems fallados reaparecen antes). Los `self_assessed` no gobiernan el
  espaciado ni la precisión — son hechos cualitativos.
- **Progreso educativo:** el agregado de `GET /api/learning/progress`.

**El Guide NO puede:** diagnosticar ni usar lenguaje clínico; inferir
emociones desde eventos educativos (su prompt no recibe Mapa/Diario/Eco);
alterar el Mapa (frontera §C); usar LearningEvent como señal psicológica
("abandonaste la sesión → estás desanimado" está prohibido); convertir
engagement en un score personal — y el progreso se presenta como **claims
clasificados**, no como consumo verificado: "marcaste 2 de 3 capítulos como
completados", nunca "completaste 2 de 3 capítulos", salvo que exista en el
futuro una evidencia server-verifiable más fuerte.

---

## I. Plan de implementación (PRs pequeños, cada uno reversible y deployable)

| PR                                      | Contenido                                                                                                                                                                                                                                                                                                                              | Reversibilidad                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **1. Contratos + validación pura**      | `packages/types/learning-events.ts` (comandos + payloads + errores) + parsers puros + tests unit (rechazo de campos extra, texto libre, tipos server-owned, idempotencyKey ausente)                                                                                                                                                    | sin schema, sin endpoints           |
| **2. Persistencia + firewall dinámico** | Enum aditivo (+3 kinds V1), `@@unique([userId, idempotencyKey])`, `LearningEventRepository.appendValidated` (escritor único); **ratchet `no-learning-in-map` + ratchet `no-direct-learning-event-write` + inversión semántica DB-level con control negativo** (bloqueado por la decisión ARC pendiente de §C/§D, que se resuelve aquí) | migración aditiva; tabla ya existe  |
| **3. Comandos de dominio (endpoints)**  | Las 5 rutas learning + `GET progress` + entitlement §C-bis + rate limit + OpenAPI. **No aterriza sin el firewall dinámico de PR 2 en verde**                                                                                                                                                                                           | deploy normal; sin consumidores aún |
| **4. GuideSession**                     | modelo + migración aditiva + `POST /api/guide/sessions` + `PATCH …/complete` + eventos emitidos por transición + conteo server-side de pasos                                                                                                                                                                                           | aditivo e independiente             |
| **5. Integración web**                  | lector invoca `open`/`complete`; prácticas/recall invocan sus comandos; best-effort (fallo de comando jamás rompe UX)                                                                                                                                                                                                                  | solo cliente                        |
| **6. Integración mobile**               | paridad con web                                                                                                                                                                                                                                                                                                                        | solo cliente                        |
| **7. Analítica agregada**               | counts con umbral k (config validada) en Pulso + sweep de retención (config validada) en worker — ambos tras aprobación de privacidad (§F)                                                                                                                                                                                             | aditivo                             |
| **8. Firewall full-stack**              | ampliación de la inversión semántica a través de los endpoints reales (HTTP → comando → evento → mapProjection idéntica)                                                                                                                                                                                                               | test-only                           |

Orden estricto 1→8; cada PR con CI verde y sync `develop→main` normal. Ninguno
toca Mapa/epochs/OU/scoring/flags ni el libro publicado.

## J. Plan de pruebas (resumen)

- **Unit (PR 1):** parsers — cada comando acepta su shape exacto; campo extra
  ⇒ 400; **idempotencyKey ausente ⇒ 400**; `selectedOptionKey` y `selfResult`
  simultáneos o ambos ausentes ⇒ 400; bounds.
- **PG (PR 2):**
  - **cliente intenta falsificar `correct`** en ítem objetivo (manda
    `selfResult`) ⇒ rechazado; en ítem autoevaluado ⇒ persiste marcado
    `self_assessed` y excluido de precisión;
  - **`complete` sin transición válida** (sin apertura previa) ⇒ 409
    `LEARNING_EVENT_INVALID_TRANSITION`, nada persiste;
  - **clave sin entitlement** ⇒ 403 (FREE + unidad PRO, espejo del lector);
  - **clave sin relación editorial resoluble** ⇒ 422
    `LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT`, nada persiste;
  - **replay misma key + payload distinto** ⇒ 409
    `LEARNING_EVENT_IDEMPOTENCY_CONFLICT`; replay exacto ⇒ 200 con el original;
  - append-only: no existe camino de UPDATE/DELETE.
- **Ratchets (PR 2):** `no-learning-in-map`;
  **`no-direct-learning-event-write`** — una escritura Prisma directa fuera
  del repositorio ⇒ build rojo (el spec se auto-verifica plantando un fixture
  con la string prohibida);
  **inversión semántica DB-level** — incluye que una **Resonance cualitativa
  no altera `mapProjection`** (ver conflicto ARC §D) + control negativo.
- **PG (PR 4):** transiciones GuideSession (start→complete idempotente,
  ownership 404, `ALREADY_COMPLETED`, `stepsCompleted` contado por servidor).
- **Retención y mutabilidad (PR 2/7):**
  - el API de producto no expone NINGUNA mutación de eventos (no hay ruta
    UPDATE/DELETE y el ratchet cierra el bypass interno);
  - el retention worker borra **solo** eventos vencidos según la ventana
    (fixture con eventos dentro/fuera del plazo);
  - la ventana viene de **configuración validada** (env schema), no de un
    número en código — test de arranque con config inválida ⇒ boot rojo;
  - el cierre de cuenta elimina eventos **y** agregados derivados del usuario;
  - toda eliminación de retención emite métricas/audit log con **conteos,
    jamás payloads**.
- **Privacidad:** spec que serializa un `LearningEventRecord` de cada tipo y
  verifica la ausencia estructural de campos capaces de portar texto libre.
