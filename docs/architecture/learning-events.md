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

| Tema                                                                | Estado actual                 | Contrato V1                                                                                                                                                                         |
| ------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `concept_explored`, `active_recall_attempted`, `practice_completed` | no existen en el enum         | se AÑADEN (enum aditivo)                                                                                                                                                            |
| `BLOCK_DWELL`                                                       | en el enum                    | **fuera de V1** (telemetría de dwell diferida; si llega, con buckets, jamás timestamps por bloque)                                                                                  |
| `HIGHLIGHT_CREATED`, `ANNOTATION_CREATED`, `RESONANCE_CONFIRMED`    | en el enum                    | **fuera de V1** — las marcas y resonancias ya tienen sus tablas como fuente de verdad; duplicarlas como eventos se decidirá (o no) con datos. Ningún endpoint V1 los acepta         |
| `payload Json?`                                                     | JSON libre a nivel de storage | el **API jamás acepta JSON libre**: el servidor construye el payload desde una unión discriminada cerrada (§2/§5) y lo serializa a esa columna. La columna es encoding, no contrato |

---

## B. Contrato V1 de LearningEvent

### Principios

1. **Append-only.** No existe UPDATE ni DELETE por API. Correcciones = evento
   nuevo. La única eliminación es el borrado de cuenta (cascade).
2. **Server-owned.** El cliente **solicita** una acción (`type` + payload
   candidato con claves de catálogo); el **servidor** valida, resuelve IDs,
   pone el reloj y construye el registro persistido. Ningún campo del cliente
   pasa a storage sin whitelist.
3. **Unión discriminada cerrada.** Cada tipo tiene un payload específico con
   campos enumerados. No existe `Record<string, unknown>`, no existe campo
   `meta`, no existe passthrough.
4. **Solo claves de catálogo y enums.** Un payload solo puede referenciar
   entidades que el servidor puede verificar: `editionKey`/`unitKey` (Content
   Core), `conceptKey` (CHAPTER_CONCEPTS/Concept), `exerciseKey`
   (CHAPTER_EXERCISES), `itemKey` (catálogo de recall), `guideSessionId`
   (fila propia). Todo lo demás → rechazo.

### Prohibido aceptar (validación server-side, siempre 400)

- metadata arbitraria / JSON libre / campos no declarados (whitelist estricta,
  `forbidNonWhitelisted`);
- texto del diario, mensajes de Eco, transcripciones de voz, prompts libres o
  **cualquier string escrito por el usuario** (V1 no tiene ni un solo campo
  de texto libre — todos los strings son claves validadas contra catálogo);
- inferencias emocionales, scores emocionales, etiquetas clínicas;
- cualquier dato del Mapa Emocional (ejes, confianza, momento, EWS, checkins).

### Los 7 tipos V1 — matriz de eventos/payloads

| `type`                    | Payload permitido (todo validado)                                                 | Emisor                                                       | Dedup semántica                                   |
| ------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| `unit_opened`             | `editionKey`, `unitKey`                                                           | cliente vía `POST /api/learning/events`                      | máx. 1/`(user, unit)` por día UTC — replays → 200 |
| `unit_completed`          | `editionKey`, `unitKey`                                                           | cliente                                                      | 1/`(user, unit, revisionNumber)` — replays → 200  |
| `concept_explored`        | `conceptKey`, `sourceUnitKey?`                                                    | cliente                                                      | 1/`(user, concept)` por día UTC                   |
| `guide_session_started`   | `guideSessionId`                                                                  | **solo servidor** (transición de `POST /api/guide/sessions`) | 1/`(guideSessionId)`                              |
| `guide_session_completed` | `guideSessionId`, `stepsCompleted`                                                | **solo servidor** (transición de `PATCH …/complete`)         | 1/`(guideSessionId)`                              |
| `active_recall_attempted` | `unitKey`, `itemKey`, `result` (`correct \| incorrect \| skipped`), `conceptKey?` | cliente                                                      | sin dedup (cada intento cuenta); rate-limited     |
| `practice_completed`      | `exerciseKey`, `unitKey?`                                                         | cliente                                                      | 1/`(user, exercise, unit)` por día UTC            |

Notas de diseño:

- `active_recall_attempted.result` es **categórico**. La respuesta del usuario
  jamás viaja ni se persiste — solo el resultado. Si el ítem de recall es de
  texto libre, la corrección ocurre en el cliente o contra el catálogo y solo
  sube el enum.
- `practice_completed` con `exerciseKey` de tipo "reflect" registra **el
  hecho** de haber completado la práctica. La reflexión en sí es un
  `DiaryEntry` cifrado E2E y este sistema nunca la ve (ADR 0007 intacto).
- Los tipos `guide_session_*` se **rechazan** en `POST /api/learning/events`
  con `LEARNING_EVENT_SERVER_OWNED_TYPE`: solo las transiciones de GuideSession
  los emiten. Así el log de sesiones no es falsificable por el cliente.

---

## C. Firewall absoluto con el Mapa Emocional (invariante)

> **INVARIANTE CC-7.** `LearningEvent`, `ReadingSession`, `GuideSession`, el
> progreso educativo, quizzes/active recall, `Highlight`, `Annotation` y
> cualquier otra actividad educativa **NO leen ni modifican** los ejes del
> Mapa Emocional, su confianza, su evidencia, su procedencia ni su estado.

Semántica que el producto asume como axioma (y el copy-contract ya protege):

- **Leer no implica estado emocional.** Abrir o terminar una unidad es un
  hecho educativo, no una señal afectiva.
- **Completar una actividad no implica regulación emocional.** Un ejercicio de
  respiración terminado es un hecho de práctica, no un delta de "Calma".
- **Recordar un concepto no implica bienestar.** El recall mide memoria, no
  salud mental.
- **Engagement no es una emoción.** Frecuencia/rachas/minutos jamás puntúan un
  eje (esto ya lo cerró la Fase C del programa V2).
- **Rendimiento no es una señal clínica.** Un `incorrect` no alimenta ningún
  modelo psicológico ni etiqueta al usuario.

**Resonance sigue siendo el único puente, y es cualitativo.** Una resonancia
existe solo por confirmación explícita del usuario (ciclo ARC) y alimenta
Conexión/Propósito bajo sus modelos registrados (ARC-C1/ARC-P1). Un
LearningEvent **jamás se transforma automáticamente** en una Resonance ni en
un valor de eje; `concept_explored` NO es una resonancia — es un hecho de
navegación educativa sin peso en el mapa.

### Mecanismos de enforcement (tres capas)

1. **Frontera de módulos + ratchet estático.** `EmotionalMapModule` (scoring,
   facts, providers) no importa módulos learning y sus queries no tocan
   `LearningEvent`/`GuideSession`. Se añade el espejo del ratchet existente:
   un spec `no-learning-in-map` que grepea los archivos del mapa por
   `LearningEvent|GuideSession|learningEvent\.` y falla el build si aparecen
   (mismo patrón que `no-emotional-map.spec.ts` protege en la dirección
   opuesta).
2. **Tipos.** El input del scoring (`scoreEmotionalMap(input)`) no gana ningún
   campo learning. El registry de modelos no admite un modelo cuyo insumo sea
   actividad educativa (los únicos insumos siguen siendo: ánimo ordinal,
   checkins, texto on-device consentido, resonancias confirmadas).
3. **Test de inversión semántica** (§D) — la prueba dinámica de que N eventos
   educativos producen **cero** delta en la proyección emocional.

---

## D. Test de inversión semántica (diseño)

Archivo propuesto: `apps/api/src/learning/learning-map-firewall.pg-spec.ts`
(suite PG real, familia `test:locks`; llega con el PR 8 y una versión reducida
repository-level con el PR 2).

```
1. Seed: usuario con historia emocional real (moods ordinales + checkins) para
   que el mapa tenga ejes con señal (no un mapa vacío que pasaría trivialmente).
2. A := mapProjection(user)   // cache bypass, cómputo fresco
3. Crear, para ese usuario:
   - los 7 tipos V1 de LearningEvent (vía el constructor server-owned real);
   - ReadingSession (heartbeat + complete);
   - GuideSession start→complete;
   - active recall correct+incorrect, practice_completed;
   - Highlight + Annotation (Core, blockKey+blockVersionId).
4. B := mapProjection(user)   // mismo bypass
5. expect(B).toStrictEqual(A) — igualdad semántica exacta.
6. CONTROL NEGATIVO: crear un checkin → C := mapProjection(user) →
   expect(C).not.toStrictEqual(A). Sin este control, el test pasaría vacío
   (p. ej. si la proyección quedara cacheada).
```

`mapProjection` es una **proyección canónica** del resultado del mapa que:

- **ignora** timestamps (`generatedAt`), ids de snapshot, TTLs de cache y
  metadata incidental (el narrative LLM se excluye por no-determinista);
- **compara**: lista de ejes y su orden; `value` por eje; `confidence` por
  eje; presencia de señal (`measured`, `sources`); `status`
  (activo/"Reuniendo datos"); `evidence` completa (`modelId`, `n`) y
  procedencia; `momento`; parámetros de dinámica afectiva (μ, tendencia,
  márgenes, gates); `coverage`.

**Criterio de fallo:** cualquier delta en cualquiera de esos campos tras el
paso 3 = evento educativo alterando una proyección emocional = build rojo.
El spec queda pineado como ratchet permanente (nunca se relaja).

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

// ─── Payloads cerrados por tipo (lo ÚNICO que el cliente puede proponer) ────
export interface UnitOpenedPayload {
  editionKey: string; // debe existir; entitlement vía ContentAccessService
  unitKey: string; // debe pertenecer a la edición publicada
}
export interface UnitCompletedPayload {
  editionKey: string;
  unitKey: string;
}
export interface ConceptExploredPayload {
  conceptKey: string; // debe existir en CHAPTER_CONCEPTS / Concept
  sourceUnitKey?: string;
}
export interface GuideSessionStartedPayload {
  guideSessionId: string; // fila propia; SOLO emitido por el servidor
}
export interface GuideSessionCompletedPayload {
  guideSessionId: string;
  stepsCompleted: number; // int 0–50 (bound server-side)
}
export interface ActiveRecallAttemptedPayload {
  unitKey: string;
  itemKey: string; // catálogo de ítems de recall (server-side)
  result: RecallResult; // NUNCA la respuesta del usuario — solo el resultado
  conceptKey?: string;
}
export interface PracticeCompletedPayload {
  exerciseKey: string; // debe existir en CHAPTER_EXERCISES
  unitKey?: string;
}

// ─── Request: el cliente SOLICITA; el servidor CONSTRUYE ────────────────────
export type LearningEventRequest =
  | { type: "unit_opened"; payload: UnitOpenedPayload }
  | { type: "unit_completed"; payload: UnitCompletedPayload }
  | { type: "concept_explored"; payload: ConceptExploredPayload }
  | { type: "active_recall_attempted"; payload: ActiveRecallAttemptedPayload }
  | { type: "practice_completed"; payload: PracticeCompletedPayload };
// guide_session_* NO son request-ables: el servidor los emite en las
// transiciones de GuideSession (LEARNING_EVENT_SERVER_OWNED_TYPE si llegan).

export interface CreateLearningEventRequest {
  event: LearningEventRequest;
  /**
   * Dedup opcional del cliente (UUID). Único por (userId, idempotencyKey).
   * Replay exacto → 200 con el evento original. Independiente de la dedup
   * SEMÁNTICA por tipo (matriz §B), que aplica siempre.
   */
  idempotencyKey?: string;
}

// ─── Registro persistido (server-owned; lo que devuelve el API) ─────────────
export interface LearningEventRecord {
  id: string;
  type: LearningEventTypeV1;
  /** Payload YA validado y reconstruido por el servidor (unión de arriba). */
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
  /** Referencias resueltas por el servidor a partir de las claves. */
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
  | "LEARNING_EVENT_UNKNOWN_TYPE" // 400 — type fuera de la unión V1
  | "LEARNING_EVENT_INVALID_PAYLOAD" // 400 — campo faltante/extra/mal tipado
  | "LEARNING_EVENT_SERVER_OWNED_TYPE" // 400 — guide_session_* por POST
  | "LEARNING_EVENT_UNKNOWN_UNIT" // 404 — editionKey/unitKey no publicados
  | "LEARNING_EVENT_UNKNOWN_CONCEPT" // 404 — conceptKey fuera de catálogo
  | "LEARNING_EVENT_UNKNOWN_ITEM" // 404 — itemKey/exerciseKey fuera de catálogo
  | "LEARNING_EVENT_FORBIDDEN" // 403 — entitlement (mismo gate FREE/PRO del lector)
  | "GUIDE_SESSION_NOT_FOUND" // 404 — sesión inexistente o ajena (sin filtrar cuál)
  | "GUIDE_SESSION_ALREADY_COMPLETED"; // 409 — transición repetida (PATCH idempotente → 200)
```

Validación server-side (pura, sin IO, testeable): un `parseLearningEvent()`
que (1) discrimina por `type`, (2) whitelist-ea exactamente los campos del
payload de ese tipo (campo extra ⇒ `LEARNING_EVENT_INVALID_PAYLOAD`),
(3) tipa/bound-ea cada valor, y después una capa con IO que resuelve claves →
IDs y aplica entitlement. Nada llega a Prisma sin pasar por ambas.

---

## F. Retención y privacidad (threat model)

| Dimensión                 | Política V1                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Retención**             | Eventos crudos: **24 meses rolling** (sweep mensual del worker). Antes de borrar, opcionalmente se consolidan en agregados mensuales por usuario (counts por tipo) que siguen la misma vida de la cuenta.    |
| **Cierre de cuenta**      | Borrado total inmediato vía el cascade existente (`onDelete: Cascade` ya está en el modelo) — cubierto por el flujo de account-deletion (S3).                                                                |
| **Exportación**           | Incluidos en el data export del usuario (JSON) con `exportSchemaVersion` bump — el usuario ve exactamente lo que guardamos (claves + enums + fechas).                                                        |
| **Minimización**          | Sin texto personal por construcción: el contrato no tiene NINGÚN campo capaz de portar texto libre (todos los strings son claves de catálogo validadas). Sin IP, sin user-agent, sin device id.              |
| **Índices**               | Los 2 existentes + `@@unique([userId, idempotencyKey])` (dedup) + `@@index([guideSessionId])` cuando GuideSession aterrice. Suficiente para las lecturas de progreso (`userId, createdAt` / `userId, kind`). |
| **Publicidad**            | Prohibido: los eventos no alimentan ads, remarketing ni terceros.                                                                                                                                            |
| **Perfil emocional**      | Prohibido: no existe camino técnico (firewall §C) ni de producto — jamás se computa un "estado emocional inferido" desde actividad educativa.                                                                |
| **Auditoría de creación** | Append-only + `occurredAt` server-owned + sin endpoints de mutación ⇒ el log es su propia auditoría. Sentry captura fallos de validación (código de error, jamás payloads).                                  |
| **Analítica agregada**    | Solo counts agregados (Pulso), sin drill-down por usuario, con umbral de k-anonimato **n ≥ 10** por celda; nada de series individuales expuestas a admin.                                                    |

**Amenazas consideradas:** (1) payload como canal de exfiltración de texto →
cerrado por whitelist sin campos de texto; (2) cliente fechando/inflando
historia → reloj server-owned + dedup semántica + rate limit; (3) log educativo
usado como proxy psicológico → firewall §C + prohibición de producto + ratchet;
(4) admin lurking → solo agregados k≥10; (5) replay/duplicación →
idempotencyKey + dedup por tipo; (6) evento contra contenido sin entitlement →
mismo `ContentAccessService` del lector (FREE en unidad PRO ⇒ 403 también para
eventos).

---

## G. API propuesta (NO implementada)

| Ruta                                     | Auth | Entitlement                                                                                       | Request                           | Respuesta                                                                              | Idempotencia                                                                              | Errores           | Rate limit    | Eventos server-side            |
| ---------------------------------------- | ---- | ------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------- | ------------- | ------------------------------ |
| `POST /api/learning/events`              | JWT  | tipos unit-bound: `ContentAccessService.assertCanReadUnit` (ch1 preview FREE igual que el lector) | `CreateLearningEventRequest` (§E) | 201 `{event}` · 200 en replay                                                          | `idempotencyKey` + dedup semántica §B                                                     | 400/403/404 (§E)  | 60/min/user   | el solicitado, tras validación |
| `GET /api/learning/progress`             | JWT  | ninguno extra (solo datos propios)                                                                | `?bookSlug=` opcional             | unidades abiertas/completadas por libro, prácticas, precisión de recall **en buckets** | n/a (lectura)                                                                             | 400 slug inválido | 60/min global | ninguno                        |
| `POST /api/guide/sessions`               | JWT  | plan del libro si la sesión ancla unidad PRO                                                      | `{editionKey?, unitKey?}`         | 201 `{session}`                                                                        | 1 sesión activa/usuario (la previa se autocierra como abandonada, sin evento `completed`) | 403/404           | 10/min/user   | `guide_session_started`        |
| `PATCH /api/guide/sessions/:id/complete` | JWT  | ownership (404 si ajena, sin distinguir)                                                          | `{stepsCompleted}`                | 200 `{session}`                                                                        | PATCH repetido → 200 sin evento nuevo                                                     | 404/409           | 10/min/user   | `guide_session_completed`      |

Común a todo: envelope de error estándar (`HttpExceptionFilter`), throttler
global vigente, Swagger con `ErrorEnvelopeDto`, y **ninguna** ruta de UPDATE o
DELETE de eventos.

---

## H. Relación con Guide V1

Guide V1 (el modo guía conversacional/estructurado) es **consumidor** de los
read models de LearningEvent:

- **Continuidad de sesión:** `GuideSession` activa + último
  `guide_session_completed` → retomar donde quedó.
- **Recordar qué unidad se abrió:** último `unit_opened`/`unit_completed` por
  libro → "seguimos en el capítulo N".
- **Práctica completada:** `practice_completed` por `exerciseKey` → no volver a
  proponer lo ya hecho hoy; sugerir la práctica pendiente de la unidad.
- **Active recall:** historial categórico (`correct/incorrect/skipped` por
  `itemKey`) → espaciar repasos (los ítems fallados reaparecen antes).
- **Progreso educativo:** el mismo agregado de `GET /api/learning/progress`
  alimenta el hilo del Guide ("llevas 2 de 3 capítulos de la Parte I").

**El Guide NO puede** (prohibiciones de producto + técnica):

- diagnosticar ni usar lenguaje clínico;
- inferir emociones desde eventos educativos (su prompt **no recibe** datos
  del Mapa, del Diario ni de Eco — solo los read models educativos de arriba);
- alterar el Mapa (frontera de módulos §C: el Guide escribe LearningEvent/
  GuideSession y nada más);
- usar LearningEvent como señal psicológica (p. ej. "abandonaste la sesión →
  estás desanimado" está prohibido);
- convertir engagement en un score personal — el progreso se presenta como
  hechos ("2 de 3"), nunca como juicio ni como métrica de la persona.

---

## I. Plan de implementación (PRs pequeños, cada uno reversible y deployable)

| PR                                     | Contenido                                                                                                                                                                      | Reversibilidad                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| **1. Contratos + validación pura**     | `packages/types/learning-events.ts` + `parseLearningEvent()` puro + tests unit (incluye rechazo de campos extra, texto libre, tipos server-owned)                              | sin schema, sin endpoints — revert trivial     |
| **2. Persistencia append-only**        | Enum aditivo (+3 kinds V1), `@@unique([userId, idempotencyKey])`, repositorio con constructor tipado único; firewall test reducido (repo-level) + ratchet `no-learning-in-map` | migración aditiva; tabla ya existe             |
| **3. Endpoints server-owned**          | `POST /api/learning/events` + `GET /api/learning/progress` + entitlement + rate limit + OpenAPI                                                                                | detrás del deploy normal; sin consumidores aún |
| **4. GuideSession**                    | modelo + migración aditiva + `POST /api/guide/sessions` + `PATCH …/complete` + eventos emitidos por transición                                                                 | aditivo e independiente                        |
| **5. Integración web**                 | lector emite `unit_opened`/`unit_completed`; prácticas/recall emiten los suyos; best-effort (fallo de evento jamás rompe UX)                                                   | solo cliente                                   |
| **6. Integración mobile**              | paridad con web                                                                                                                                                                | solo cliente                                   |
| **7. Analítica agregada**              | counts k≥10 en Pulso + sweep de retención 24m en worker                                                                                                                        | aditivo                                        |
| **8. Firewall e integración completa** | `learning-map-firewall.pg-spec.ts` (§D, inversión semántica full-stack con control negativo) pineado como ratchet                                                              | test-only                                      |

Orden estricto 1→8; cada PR con CI verde y sync `develop→main` normal. Ninguno
toca Mapa/epochs/OU/scoring/flags ni el libro publicado.

## J. Plan de pruebas (resumen)

- **Unit (PR 1):** parser — cada tipo acepta su payload exacto; campo extra ⇒
  400; string con texto libre en campo de clave ⇒ 404 de catálogo; tipos
  server-owned por POST ⇒ 400; bounds (`stepsCompleted` 0–50).
- **PG (PR 2/3):** dedup semántica por tipo; `(userId, idempotencyKey)` único;
  replay ⇒ 200 con el original; entitlement FREE/PRO espejo del lector
  (FREE + unidad PRO ⇒ 403 también en eventos); append-only (no existe camino
  de UPDATE/DELETE).
- **PG (PR 4):** transiciones GuideSession (start→complete idempotente,
  ownership 404, `ALREADY_COMPLETED`).
- **Ratchets permanentes:** `no-learning-in-map` (grep en archivos del mapa) +
  inversión semántica (§D) + control negativo.
- **Privacidad:** spec que serializa un `LearningEventRecord` de cada tipo y
  verifica que ningún campo puede contener los términos prohibidos (espejo del
  patrón `serializeDryRunReport` de CC-6F).
