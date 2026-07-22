# Guide V1 — superficie HTTP (CC-7.4D)

```
GUIDE_HTTP_STATUS=IMPLEMENTED_PENDING_MERGE
GUIDE_HTTP_ROUTE_COUNT=5
GUIDE_API_CLIENT_METHOD_COUNT=5
GUIDE_OPENAPI_PATH_COUNT=5

GUIDE_CONTEXT_POLICY=SERVER_DERIVED_FROM_TARGETS
CLIENT_EDITORIAL_CONTEXT_ALLOWED=false
GUIDE_EVENT_KEY_POLICY=SAME_AS_COMMAND

GUIDE_FULL_STACK_FIREWALL_PASS=true
EMOTIONAL_DELTA=0

GUIDE_LIFECYCLE_MERGE_SHA=7aec34606da5958db7932e8f57e82947abf9dbab
```

Esta es la contraparte pública de
[guide-v1-lifecycle.md](guide-v1-lifecycle.md). El lifecycle no cambió: el
controller traduce comandos y estados, no toma decisiones.

---

## 1. Rutas

| Método | Ruta                                                     | operationId                |
| ------ | -------------------------------------------------------- | -------------------------- |
| POST   | `/api/guide/sessions`                                    | `createGuideSession`       |
| POST   | `/api/guide/sessions/:sessionId/steps/:stepKey/complete` | `completeGuideSessionStep` |
| POST   | `/api/guide/sessions/:sessionId/steps/:stepKey/recall`   | `submitGuideStepRecall`    |
| POST   | `/api/guide/sessions/:sessionId/cancel`                  | `cancelGuideSession`       |
| POST   | `/api/guide/sessions/:sessionId/complete`                | `completeGuideSession`     |

**No existe** un endpoint genérico de eventos, ni de progreso, ni de catálogo o
discovery, ni ningún `PATCH`/`PUT`. El cliente invoca un comando con nombre; la
fila del ledger, la proyección y el `LearningEvent` son efectos internos.

## 2. Bodies (cerrados)

```
START            → { idempotencyKey, guideKey, guideVersion }
STEP_COMPLETE    → { idempotencyKey }
STEP_RECALL      → { idempotencyKey, selectedOptionKey }
CANCEL           → { idempotencyKey }
SESSION_COMPLETE → { idempotencyKey }
```

`sessionId` y `stepKey` viajan **solo** como parámetros de ruta. Todo lo demás
lo deriva el servidor: kind, política, claves objetivo, orden, calificación,
contadores y contexto editorial. **El actor es siempre el JWT** — ninguna ruta
lee un `userId` de body, params, query o headers.

Los parsers puros son la autoridad en runtime: exigen objeto plano (prototipo
`Object` o `null`), cero símbolos, claves propias exactas, UUID canónico,
gramática cerrada de catálogo para `guideKey`/`stepKey`/`selectedOptionKey`, y
`guideVersion` entero ≥ 1 sin coerción. Un campo de más es 400 y **cero**
llamadas al lifecycle.

## 3. Respuesta

```json
{
  "created": true,
  "replayed": false,
  "session": {
    "sessionId": "…",
    "guideKey": "…",
    "guideVersion": 1,
    "status": "ACTIVE",
    "stepsCompleted": 0,
    "totalSteps": 3,
    "currentStepKey": "…"
  }
}
```

No se expone `editionId`, `unitId`, `bookId`, `revisionId`, timestamps, el
ledger, los recibos, los eventos, las claves objetivo de otros pasos, la opción
elegida, el resultado del recall ni la respuesta correcta del catálogo.

## 4. Estados

`created` → **201** · `replayed` → **200**. El status sale del veredicto del
lifecycle, no del tipo de ruta.

| Código                             | HTTP | Qué significa                       |
| ---------------------------------- | ---- | ----------------------------------- |
| `GUIDE_INVALID_PAYLOAD`            | 400  | El body no describe el comando      |
| `GUIDE_IDEMPOTENCY_KEY_REQUIRED`   | 400  | Falta la clave                      |
| `GUIDE_FORBIDDEN`                  | 403  | La entitlement dijo que no          |
| `GUIDE_SESSION_NOT_FOUND`          | 404  | Sesión ajena **o** inexistente      |
| `GUIDE_SESSION_INVALID_TRANSITION` | 409  | El estado actual no la acepta       |
| `GUIDE_STEP_NOT_CURRENT`           | 409  | No es el paso del cursor            |
| `GUIDE_CONTEXT_MISMATCH`           | 409  | El catálogo se movió bajo la sesión |
| `GUIDE_STEP_COMMAND_MISMATCH`      | 422  | El comando no describe ese paso     |
| `GUIDE_CONTEXT_UNRESOLVED`         | 422  | El catálogo no puede responder      |
| `GUIDE_STORAGE_FAILURE`            | 500  | Infraestructura                     |

El mensaje público **es** el código. Nunca viaja un mensaje de Prisma, pg, Nest
o del resolver. Una sesión **ajena** y una **inexistente** devuelven el mismo
404, con el mismo código y el mismo envelope — verificado byte a byte en el E2E.

## 5. OpenAPI y cliente

Los cinco paths publican bodies con `additionalProperties: false` y `required`
exacto, y una respuesta cerrada con los siete campos de sesión. El ratchet
`guide-openapi.spec.ts` falla si aparece `correctOptionKey`, `editionId`,
`unitId`, `userId`, `metadata`, `payload`, `result`, `evaluationSource`,
`itemKey` o `context` como campo de contrato, y exige que
`selectedOptionKey` viva **solo** en el body de recall.

`guideApi` expone los cinco métodos con los mismos paths (ids URL-encoded) y
bodies exactos. Sus tests fijan método, path y body, y que nunca viaje un
`userId` ni contexto editorial.

## 6. Firewall emocional (full-stack)

`guide-firewall.e2e-spec.ts` recorre la guía completa por HTTP —
START → concepto → práctica → recall → complete — y comprueba:

```
guide_session_started=1
practice_completed=1
active_recall_attempted=1
guide_session_completed=1
guide_step_completed=0
concept_explored=0
```

y **delta cero** en todos los read models emocionales (snapshots del Mapa,
resonancias, check-ins, mood logs, features de texto, entradas de diario),
contando filas antes y después. Además prueba que borrar los `LearningEvent`
no cambia `stepsCompleted`: el progreso sale del ledger, los eventos son
consecuencias.

## 7. Privacidad

- La respuesta correcta del catálogo no se acepta, no se persiste en el ledger,
  no viaja en el evento y no se devuelve.
- El contexto editorial no entra por el cliente ni sale al cliente.
- Ningún payload de Guide alimenta el Mapa Emocional, ni crea resonancias, ni
  infiere emoción, engagement o perfil.

## 8. Qué NO incluye este PR

Sin UI web ni mobile, sin GET de sesión/catálogo/historial, sin WebSocket, sin
worker, sin cron, sin cambios de schema ni migraciones, y **sin deploy**.
Ninguna ejecución tocó la base de producción.
