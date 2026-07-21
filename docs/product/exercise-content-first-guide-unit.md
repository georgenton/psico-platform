# Contenido editorial — primera unidad de Guide V1

> **Alcance de este documento.** Es un **registro editorial docs-only**. Aprueba
> un (1) ítem de recall objetivo para el capítulo 1 de _Emociones en
> Construcción_, con su fuente, justificación y firma de aprobación humana. **No
> crea ninguna fila `Exercise`**, no ejecuta ingesta ni backfill, no toca el
> catálogo productivo, la `GuideDefinition`, el registry Guide, el schema, las
> migraciones ni el texto original del capítulo. El estado del ítem es
> `APPROVED_FOR_INGESTION`: listo para que una ejecución posterior de ingesta lo
> publique como `Exercise`.

## 1. Libro, capítulo y concepto

| Campo                  | Valor                                                       |
| ---------------------- | ----------------------------------------------------------- |
| `BOOK_SLUG`            | `emociones-en-construccion`                                 |
| Capítulo               | 1 — _¿Realmente sabemos qué es una emoción?_                |
| Tema/concepto evaluado | El cuerpo sabe antes que la mente                           |
| `CONCEPT_KEY`          | `eec-cuerpo-antes-que-mente`                                |
| Fuente del capítulo    | `apps/api/content/emociones-en-construccion/capitulo-01.md` |

El concepto es real y publicado: `backfill.ts` crea el `Concept` (upsert por
`conceptKey`) y su `ConceptLink` (rol `PRIMARY`, una sola unidad) desde
`CHAPTER_CONCEPTS["emociones-en-construccion"][1]`. `EDITION_KEY` / `UNIT_KEY`
son derivados por Content Core en la ingesta (no se fijan aquí).

## 2. Práctica editorial existente

El capítulo 1 ya contiene una **práctica reflexiva de autoría editorial**:

- Sección: **«🌿 Una exploración emocional guiada: escucharte por dentro»**
  (`capitulo-01.md`, sección de exploración/actividad).

Es la fuente editorial para el step `CATALOG_PRACTICE` (`catalog_practice_confirmation`)
de la futura `GuideDefinition`. No se transcribe aquí (contenido licenciado).

## 3. Ítem de recall aprobado

```yaml
itemKey: eec-c1-recall-cuerpo-antes-que-mente
conceptKey: eec-cuerpo-antes-que-mente
recallMode: objective

question: >
  Según el capítulo 1, ¿cómo describe el libro la relación temporal entre
  la reacción del cuerpo y la comprensión consciente de una emoción?

options:
  - optionKey: opcion-cuerpo-primero
    text: >
      El cuerpo puede reaccionar antes de que la mente alcance a identificar
      o nombrar lo que está sintiendo.

  - optionKey: opcion-mente-primero
    text: >
      La mente identifica primero la emoción y solamente después el cuerpo
      comienza a reaccionar.

  - optionKey: opcion-simultanea
    text: >
      El cuerpo y la mente siempre reaccionan de manera simultánea,
      consciente y perfectamente coordinada.

correctOptionKey: opcion-cuerpo-primero
```

Claves (`itemKey`, `optionKey`, `conceptKey`) en minúsculas y estables,
compatibles con la gramática cerrada del catálogo (`^[a-z0-9][a-z0-9._:-]{0,199}$`).
`correctOptionKey` referencia una opción existente.

## 4. Fuente y justificación editorial

```yaml
editorialSource:
  file: apps/api/content/emociones-en-construccion/capitulo-01.md
  conceptKey: eec-cuerpo-antes-que-mente
  chapter: 1
  supportingSections:
    - introducción: el cuerpo sabe antes que la mente
    - el cuerpo y la emoción
    - explicación de la reacción previa al pensamiento consciente

editorialRationale: >
  La opción opcion-cuerpo-primero reformula la tesis explícita del capítulo:
  el cuerpo puede reaccionar antes de que la mente alcance a identificar,
  interpretar o nombrar conscientemente la emoción.

  La opción opcion-mente-primero invierte la secuencia explicada por el texto.

  La opción opcion-simultanea introduce una simultaneidad consciente y
  perfectamente coordinada que el capítulo no sostiene.

  El ítem evalúa comprensión conceptual del contenido. No diagnostica,
  no evalúa psicológicamente al lector, no infiere su estado emocional y no
  presenta el modelo como una verdad clínica universal.
```

> Los pasajes del capítulo **no se copian** en este documento técnico: se
> referencian por sección. El texto original del capítulo permanece intacto.

## 5. Registro de aprobación

```
EDITORIAL_AUTHOR=Jorge
EDITORIAL_REVIEWER=Jorge (self-review)
EDITORIAL_APPROVED=true
EDITORIAL_APPROVAL_DATE=2026-07-21
CORRECT_OPTION_KEY=opcion-cuerpo-primero
EDITORIAL_STATUS=APPROVED_FOR_INGESTION
```

La mención `self-review` se conserva deliberadamente: la aprobación fue una
autorrevisión del responsable del contenido, **no** una revisión independiente.
El borrador fue asistido por IA; esta aprobación lo convierte en una decisión
editorial humana revisada y autorizada por el responsable del contenido. La
`correctOptionKey` fue aprobada explícitamente en esta revisión.

## 6. Claims permitidos y prohibidos

**Permitido** (lo que el ítem afirma y evalúa):

- Comprensión conceptual de una afirmación **explícita del propio capítulo**: el
  cuerpo puede reaccionar antes de que la mente alcance a nombrar/comprender la
  emoción.
- Distractores que el capítulo contradice de forma inequívoca.

**Prohibido** (líneas que el ítem no cruza):

- Presentar el modelo como verdad clínica universal o hecho médico.
- Diagnosticar, evaluar psicológicamente o inferir el estado emocional del
  lector.
- Lenguaje emocional inferido sobre el lector.
- Datos personales, o detalles memorísticos/irrelevantes del capítulo.
- Afirmaciones engañosas o dañinas en cualquier opción.

## 7. Privacidad

- El ítem y su `correctOptionKey` son **contenido editorial del catálogo del
  producto**; no es dato del usuario.
- `correctOptionKey` es **interno**: la calificación ocurre en el servidor y la
  clave correcta **nunca se serializa** al cliente (contrato CC-7.3).
- No toca cifrado E2E, Diario, Eco, Mapa Emocional, scoring, model-registry,
  epochs ni flags (ADR 0007 intacto).

## 8. Estado y bloqueos

- `EDITORIAL_STATUS=APPROVED_FOR_INGESTION` — el ítem está listo para que una
  ejecución posterior de ingesta lo publique.
- **Todavía NO está publicado como `Exercise`.** No existe fila productiva
  `Exercise` (tipo `QUIZ`) para `eec-c1-recall-cuerpo-antes-que-mente`; los
  resolvers `resolveRecallItem` / `resolveExercise` aún no lo encuentran.
- **Guide V1 y CC-7.4C continúan bloqueados** hasta que:
  1. la ingesta productiva cree las filas `Exercise` de práctica y de recall
     objetivo dentro de esta unidad, y
  2. se publique la primera `GuideDefinition` (registry aún vacío).

  Estado actual: `GUIDE_DEFINITION_STATUS=BLOCKED_PENDING_EXERCISE_INGESTION`,
  `CC7_4C_STATUS=BLOCKED_GUIDE_DEFINITION_REQUIRED`.

## 9. Implementación de la ingesta (CC-7.4B.2)

```
INGESTION_IMPLEMENTATION_STATUS=MERGED_TO_DEVELOP
EXERCISE_INGESTION_MERGE_SHA=c1e0ed92fd9955439db5499485dae4eaf7d1baf6
GUIDE_DEFINITION_STATUS=IN_REVIEW
```

- **Catálogo ejecutable + backfill implementados.** El catálogo cerrado
  server-side (`apps/api/src/content-core/exercise-ingestion-catalog.ts`)
  declara las dos definiciones aprobadas; el paso de ingesta
  (`apps/api/src/content-core/exercise-ingestion.ts`) las materializa como filas
  `Exercise` DENTRO de la transacción por-libro del backfill de Content Core
  (`backfill.ts`), la MISMA vía por la que pasa el contenido productivo.
- **Fail-closed (sin skip parcial para una definición productiva aprobada).**
  Un libro AUSENTE del catálogo es el único no-op permitido. Para un libro
  PRESENTE, si falta el capítulo, la unidad, o el bloque fuente —
  **cero → fail-closed porque una definición productiva aprobada perdió su
  fuente editorial** (`EXERCISE_INGEST_SOURCE_MISSING`), más de uno →
  `EXERCISE_INGEST_SOURCE_AMBIGUOUS` (nunca first-match), el texto en un kind
  distinto de `HEADING` no cuenta como fuente. Cualquiera de estos aborta la
  transacción del libro.
- **Determinista + idempotente + drift cerrado.** IDs estables (sin CUID nuevos
  por ejecución); re-ejecutar no crea filas; un drift (mismo id, semántica
  distinta) aborta la transacción del libro sin sobrescribir. Errores value-free
  (código estable, sin slug/título/pregunta/respuesta/clave). Coherencia del
  pair (libro/capítulo/tipo/opciones) validada antes de tocar la DB.
- **Filas probadas en PostgreSQL aislado.** `exercise-ingestion.pg-spec.ts`
  ejerce primera ejecución (1 práctica + 1 recall), segunda ejecución (cero
  filas nuevas, contenido estable), drift atómico (throw + sin sobrescribir +
  sin fila extra) y fail-closed cuando el bloque editorial está ausente
  (SOURCE_MISSING + rollback completo, cero Exercise y cero estado parcial);
  más la resolución vía `LearningCatalogResolver` real (práctica resuelve, QUIZ
  rechazado como práctica, recall objetivo con `correctOptionKey` interno,
  concepto en la misma unidad).
- **Sin deploy. La base de producción no fue modificada.** Ninguna ejecución de
  ingesta corrió contra producción; las filas existen solo en bases de prueba
  efímeras. `SCHEMA_CHANGED=false`, `MIGRATION_ADDED=false`.
- **La `GuideDefinition` está en revisión.** La ingesta se mergeó a develop
  (`c1e0ed9`) y la primera `GuideDefinition` productiva
  (`eec-c1-cuerpo-antes-que-mente@1`) se publica en su propio PR —
  `GUIDE_DEFINITION_STATUS=IN_REVIEW`. Ver
  [guide-v1-first-definition.md](guide-v1-first-definition.md). El lifecycle de
  sesión (CC-7.4C) sigue pendiente.
