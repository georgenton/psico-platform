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
