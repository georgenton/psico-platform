# Guide V1 — lifecycle interno de sesión (CC-7.4C)

```
LIFECYCLE_IMPLEMENTATION_STATUS=IN_REVIEW
LIFECYCLE_SURFACE=INTERNAL_ONLY
HTTP_SURFACE_EXPOSED=false
GUIDE_COUNTER_SOURCE=GUIDE_SESSION_STEP
GUIDE_CONTEXT_POLICY=SERVER_DERIVED_FROM_TARGETS
CLIENT_EDITORIAL_CONTEXT_ALLOWED=false
GUIDE_DEFINITION_MERGE_SHA=364a8b274aba7d4396320c27c9cf6484a76bb721
GUIDE_COMMANDS=5
GUIDE_EVENT_EMITTING_COMMANDS=3
GUIDE_LOCK_NAMESPACES=2
```

Este documento describe **qué garantiza** el lifecycle de Guide V1 y **qué no**.
Es la contraparte de la definición aprobada en
[guide-v1-first-definition.md](guide-v1-first-definition.md) y de
[ADR 0019](../adr/0019-guide-session-step-source.md).

> **No hay superficie HTTP.** `GuideLifecycleService` es `@Injectable` pero no
> está registrado en `AppModule` y ningún controller lo expone. Nada de lo
> descrito aquí es alcanzable desde un cliente todavía; eso es CC-7.4D.

---

## 1. Los cinco comandos

| Comando            | Qué hace                                                                      | Evento educativo                                                       |
| ------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `START`            | Abre una sesión de un `guideKey@guideVersion` **exacto**                      | `guide_session_started`                                                |
| `STEP_COMPLETE`    | Acepta el paso actual de tipo concepto / práctica / confirmación              | práctica → `practice_completed`; concepto y confirmación → **ninguno** |
| `STEP_RECALL`      | Acepta el paso actual de tipo recall objetivo, **calificado por el servidor** | `active_recall_attempted`                                              |
| `CANCEL`           | Cierra la sesión como `CANCELLED`                                             | **ninguno**                                                            |
| `SESSION_COMPLETE` | Cierra la sesión como `COMPLETED` con ledger completo                         | `guide_session_completed`                                              |

La matriz es **cerrada**: como máximo un evento por comando, y **no existe**
`guide_step_completed` (decisión del ADR 0019 — completar un paso interno no es
un hecho educativo por sí mismo).

---

## 2. Qué NO acepta el cliente

Un comando lleva únicamente: la clave de idempotencia, el `guideKey@version`
exacto (solo en START), el `sessionId`, el `stepKey` y — en recall — la
`selectedOptionKey`.

El servidor **deriva** todo lo demás desde la definición fijada y el catálogo:

- `kind` y `completionPolicy` del paso;
- la clave objetivo (`conceptKey` / `exerciseKey` / `itemKey` / `confirmationKey`);
- el `order`;
- `result` y `evaluationSource` del recall;
- el contexto editorial (`editionId`, `unitId`).

Un comando **nunca** transporta un `userId`: el actor es siempre el usuario
autenticado del JWT.

---

## 3. Contexto editorial derivado (`SERVER_DERIVED_FROM_TARGETS`)

La `GuideDefinition` no contiene contexto editorial ni identificadores de base
de datos. En START, `GuideTargetContextService` resuelve **cada** objetivo de la
definición contra el catálogo real y exige que **todos** aterricen en el mismo
`bookId` / `editionId` / `revisionId` / `unitId`.

- objetivo irresoluble, no publicado o de modalidad equivocada (por ejemplo un
  ítem de recall autoevaluado donde el paso declara recall objetivo) →
  `GUIDE_CONTEXT_UNRESOLVED`;
- objetivos que divergen entre sí → `GUIDE_CONTEXT_MISMATCH`.

Ambos fallan **antes de cualquier escritura**. En cada paso posterior se
revalida que el objetivo siga aterrizando en el ancla de la sesión: si el
catálogo se movió por debajo, el paso se rechaza en vez de escribir una fila
contra otra unidad.

La **entitlement** usa el mismo `ContentAccessService.assertCanReadUnit` que
todas las superficies de contenido, ejecutado **dentro de la transacción** de
START. El lifecycle no reimplementa la regla FREE/PRO.

---

## 4. El progreso viene del ledger, no de los eventos

`GUIDE_COUNTER_SOURCE=GUIDE_SESSION_STEP`. La proyección
(`stepsCompleted`, `totalSteps`, `currentStepKey`) la calcula la máquina pura
desde las filas aceptadas del ledger:

- una fila cuenta solo después de que su semántica completa (kind + policy +
  objetivo exacto) coincidió con el catálogo fijado;
- `totalSteps` sale de la versión fijada, no de la más reciente;
- **nunca** se leen `LearningEvent` para calcular progreso;
- un contador enviado por un cliente no tiene ninguna ruta hacia la tabla: el
  repositorio solo acepta una proyección derivada.

---

## 5. Idempotencia: recibo antes que efectos

Todo comando inspecciona su `GuideCommandReceipt` **antes** de aplicar cualquier
efecto:

- **replay** → devuelve el estado almacenado y aplica **cero** efectos. En START
  eso ocurre **antes** del autocancel, así que un reintento no cancela una
  segunda sesión;
- un replay **no** puede ser rechazado por el estado alcanzado desde entonces
  (se responde antes de evaluar la transición);
- misma clave con semántica distinta → conflicto → transición inválida.

Los eventos educativos usan una clave derivada de forma determinista desde la
clave del comando (hash con versión 8, variante canónica). Así el append es
idempotente en reintentos y no colisiona con las claves que un cliente elija
para los comandos educativos autónomos.

---

## 6. Concurrencia — dos espacios de lock, un solo orden

| Namespace                            | Cuándo                                                  |
| ------------------------------------ | ------------------------------------------------------- |
| `guide:start:<userId>`               | START                                                   |
| `guide:session:<userId>:<sessionId>` | STEP_COMPLETE · STEP_RECALL · CANCEL · SESSION_COMPLETE |

El orden es siempre START_LOCK → SESSION_MUTATION_LOCK. **Ningún comando toma
los dos**, así que el orden no puede invertirse y no hay deadlock posible por
esta vía. El único SQL crudo del lifecycle es
`pg_advisory_xact_lock(...)`, que no escribe ninguna fila (los ratchets de
escritor único siguen intactos).

El autocancel de START es una transición de mantenimiento del servidor: **no
crea recibo y no emite evento**. Conserva el conteo que su ledger justifica y
deja el cursor en `null`.

`guide-lifecycle.pg-spec.ts` prueba la matriz obligatoria sobre conexiones
concurrentes reales: dos START con la misma clave, dos START con claves
distintas, dos pasos con la misma clave, dos pasos con claves distintas, CANCEL
contra SESSION_COMPLETE, y dos intentos de recall con opciones distintas.

---

## 7. Atomicidad

Recibo, fila del ledger, proyección de la sesión y evento educativo **commitean
o revierten juntos**. La prueba de rollback envenena el append del evento
después de que la fila del ledger y la actualización de la sesión ya están
preparadas en la transacción, y verifica que no queda nada: ni fila, ni recibo,
y el cursor sigue apuntando al mismo paso.

---

## 8. Superficie de error (cerrada, sin valores)

`GUIDE_SESSION_NOT_FOUND` · `GUIDE_SESSION_INVALID_TRANSITION` ·
`GUIDE_STEP_NOT_CURRENT` · `GUIDE_STEP_COMMAND_MISMATCH` ·
`GUIDE_CONTEXT_UNRESOLVED` · `GUIDE_CONTEXT_MISMATCH` · `GUIDE_FORBIDDEN` ·
`GUIDE_STORAGE_FAILURE`.

El `message` **es** el código. Ningún error transporta un id, una clave de
catálogo, la opción elegida, SQL ni el texto de un driver; `cause` nunca se
asigna, porque un `cause` serializado filtraría texto del driver.

Una sesión **ajena** y una **inexistente** producen exactamente el mismo error:
toda búsqueda y toda actualización va por `(id, userId)`.

---

## 9. Qué NO garantiza

- **No** garantiza que la persona leyó, entendió o interiorizó nada. Una fila
  del ledger dice que **la transición fue aceptada**, nada más.
- La respuesta correcta del ítem de recall **nunca** se persiste en el ledger,
  ni viaja en el evento, ni se devuelve al cliente. Solo se usa para calcular
  `result` en el servidor.
- El lifecycle **no** escribe nada en el Mapa Emocional, ni crea resonancias, ni
  toca ninguna señal emocional.

---

## 10. Estado

- `LIFECYCLE_IMPLEMENTATION_STATUS=IN_REVIEW` — implementado y probado contra
  PostgreSQL real, pendiente de merge.
- `HTTP_SURFACE_EXPOSED=false` — sin controller, sin OpenAPI, sin clientes, sin
  registro en `AppModule`.
- Ninguna ejecución tocó la base de producción.
- Lo siguiente (CC-7.4D) es la superficie HTTP, que deberá mapear los ocho
  códigos cerrados a estados HTTP sin ampliarlos.
