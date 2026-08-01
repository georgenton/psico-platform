# Activar el aprendizaje de un libro ya existente

```
COMMAND=content:book:activate-learning
DEFAULT_MODE=dry-run
APPLY_REQUIRES=--apply
DEPLOYED_APPLY_REQUIRES=ALLOW_BOOK_LEARNING_ACTIVATION=on
ACTIVATION_ATOMIC=true
ACTIVATION_IDEMPOTENT=true
ACTIVATION_DELETE_COUNT=0
```

## Qué resuelve

`bootstrapBook` (ver [book-test-edition-ingest.md](book-test-edition-ingest.md))
crea la **superficie de lectura** completa —`Book`, `Chapter`, `ChapterBlock`,
`Work`, `Edition`, `Revision`, `ContentUnit`, `ContentBlock`— y se detiene ahí a
propósito: publicar un libro y enseñar desde él son dos actos editoriales
distintos.

Una Guide, en cambio, resuelve sus tres objetivos contra **filas de base de
datos**: un `Concept`, su `ConceptLink` y dos `Exercise`. Un libro que entró por
el bootstrap no las tiene, así que su Guide no puede existir por más código que
escribamos. Este comando las materializa.

## Precondiciones

El activador **no crea contenido**. Antes de correrlo, el libro debe estar
completo:

| Requisito                                                    | Si falta                                           |
| ------------------------------------------------------------ | -------------------------------------------------- |
| `Book` con ese slug                                          | `ACTIVATION_BOOK_NOT_FOUND`                        |
| `Edition` con el mismo slug                                  | `ACTIVATION_EDITION_NOT_FOUND`                     |
| revisión publicada en esa edición                            | `ACTIVATION_REVISION_NOT_PUBLISHED`                |
| `ContentUnit` de **cada** capítulo                           | `ACTIVATION_UNIT_NOT_FOUND`                        |
| cada unidad dentro de la revisión publicada                  | `ACTIVATION_UNIT_NOT_IN_REVISION`                  |
| el encabezado fuente de la práctica, **exactamente una vez** | `EXERCISE_INGEST_SOURCE_MISSING` / `..._AMBIGUOUS` |

Y el catálogo editorial —`CHAPTER_CONCEPTS` en `@psico/types` y
`EXERCISE_INGESTION_CATALOG` en la API— debe nombrar al libro. Si no lo nombra,
el activador es un no-op: cero filas, sin error.

## El orden del capítulo es el de la plataforma, no el del libro

El catálogo se indexa por `Chapter.order` **de la plataforma**. No siempre
coincide con la numeración del libro impreso: en _Parejas que perduran_, el
manifest de ingesta le dio el orden 1 al prefacio, así que el **capítulo 1 del
libro vive en el orden 2**.

```
BOOK_CHAPTER_NUMBER=1
PLATFORM_CHAPTER_ORDER=2
```

Una entrada indexada por 1 buscaría el encabezado de la práctica dentro del
prefacio y fallaría cerrada — o, peor, resolvería contra el capítulo
equivocado. Verifica el orden real antes de escribir una entrada nueva:

```bash
railway ssh --service api "node -e 'require(\"/app/apps/api/dist/main\")'"
```

o, más simple, mira `chapter_order` y `source_heading_match_count` en el
dry-run.

## Dry-run

Escribe cero, siempre. No es un ensayo con rollback —eso tomaría locks de
escritura para un comando cuyo propósito es no escribir— sino lecturas puras.

```bash
pnpm --filter @psico/api content:book:activate-learning -- \
  --book-slug=parejas-que-perduran
```

Salida esperada sobre una base recién bootstrapped:

```
mode=dry-run
book_exists=true
edition_exists=true
published_revision_exists=true
catalog_valid=true
catalog_concept_count=1
catalog_exercise_count=2
catalog_chapter_orders=2
chapter_missing_count=0
unit_missing_count=0
unit_not_in_revision_count=0
source_pair_count=1
source_exact_match_pair_count=1
source_missing_pair_count=0
source_ambiguous_pair_count=0
source_heading_match_count=1
concept_create_count=1
concept_verify_count=0
concept_conflict_count=0
concept_link_create_count=1
concept_link_verify_count=0
concept_link_conflict_count=0
practice_create_count=1
practice_verify_count=0
practice_conflict_count=0
recall_create_count=1
recall_verify_count=0
recall_conflict_count=0
activation_safe=true
writes=0
```

Cualquier `*_conflict_count` distinto de cero significa que ya existe una fila
con esa identidad y **otra semántica**. **No lo fuerces**: el apply se niega
igual. Averigua qué cambió antes de tocar nada.

Los conteos son por objetivo, no una acción única: un libro con varios conceptos
o varios pares tendría un conflicto tapado por el último valor que se escribiera
encima.

`source_heading_match_count` es informativo. La autoridad son los conteos **por
par**: un par con 0 coincidencias y otro con 2 suman igual que dos pares
correctos, y esa suma leería como segura.

## Apply

```bash
ALLOW_BOOK_LEARNING_ACTIVATION=on \
pnpm --filter @psico/api content:book:activate-learning -- \
  --book-slug=parejas-que-perduran \
  --apply
```

La bandera **no se persiste** como variable del servicio: se pasa para esa sola
invocación. En local no hace falta; en producción o staging el apply sin ella
falla con `ACTIVATION_FORBIDDEN`.

La postura de entorno sale del **resolver canónico**, no de una copia local. Una
caja de Railway que no declara `PSICO_ENV`, o que declara `development` o
`test`, se rechaza en vez de tratarse como local — precisamente la falla que ese
resolver existe para prevenir. Y el guard corre **antes** de leer
`DATABASE_URL` y antes de abrir cualquier conexión: a un apply no autorizado lo
frena el proceso, no la base.

Salida:

```
mode=apply
stats_conceptsCreated=1
stats_conceptLinksCreated=1
stats_exercisesCreated=2
stats_conceptsVerified=0
stats_conceptLinksVerified=0
stats_exercisesVerified=0
```

Una segunda corrida es segura y devuelve lo inverso: `0` creados, todo
verificado. La identidad sale de las claves del catálogo, nunca de un CUID.

## El plan y el apply ven lo mismo

El planner **lee** por los mismos helpers por los que la ingesta **escribe**:
misma comparación de JSON, misma resolución del bloque fuente, mismo constructor
de contenido. Eso hace que `PLAN_VERIFY ⇔ APPLY_WOULD_VERIFY` y
`PLAN_CONFLICT ⇔ APPLY_WOULD_THROW_DRIFT`. Un plan que dice «seguro» mientras el
apply revienta es peor que no tener plan.

La comparación cubre la semántica completa, no solo la identidad: para la
práctica, `practiceKind` y el `sourceBlockKey` anclado; para el recall,
`recallMode`, `conceptKey`, cada opción y la respuesta correcta.

Aun así, **el plan es informativo**. El apply vuelve a resolver todo su contexto
—edición, revisión publicada, capítulos, unidades— _dentro_ de la transacción.
Actuar sobre un mapa construido antes de abrirla es exactamente cómo una
activación «segura» termina escribiendo contra contenido que ya se movió.

## Alcance: solo los capítulos catalogados

El activador resuelve únicamente los `chapterOrder` que nombran los dos
catálogos. Un capítulo legacy que nadie catalogó no es asunto suyo: no puede
ayudar ni estorbar. Planner y apply usan **el mismo conjunto** — un alcance
distinto entre ambos es justo cómo un plan dice seguro y el apply falla.

Un capítulo **catalogado** fuera de la revisión publicada sí bloquea.

## Garantías

- **Atómico** — una transacción. Cualquier fallo deja cero filas.
- **Idempotente** — la repetición no escribe; los bytes quedan estables.
- **Aditivo** — cero DELETE. No puede alcanzar `Book`, `Chapter`,
  `ChapterBlock`, `Work`, `Edition`, `Revision`, `ContentUnit`,
  `ContentUnitVersion`, `ContentBlock`, `BlockVersion` ni `RevisionUnit`, ni
  nada que sea del lector (subrayados, notas, sesiones, eventos).
- **Verificado por dentro** — las filas esperadas se releen dentro de la
  transacción. Un éxito que no se puede sustentar hace rollback en lugar de
  reportarse.
- **Falla cerrada** — deriva de etiqueta, enlace apuntando a otra unidad,
  ejercicio con otra semántica, fuente ausente o ambigua: todo aborta.

## Deriva: por qué no se sobrescribe

Si un `Concept` existe con la misma clave y **otra etiqueta**, la ingesta lanza
`CONCEPT_INGEST_DRIFT_DETECTED` en vez de actualizar.

La razón no es purismo: `conceptKey` se persiste en las filas `Resonance`, que
son confirmaciones explícitas del usuario. Reescribir la etiqueta bajo una clave
viva reetiquetaría retroactivamente algo que la persona ya confirmó. Cambiar lo
que un concepto _significa_ es un acto editorial: pide clave nueva.

## Un capítulo del catálogo sin unidad

Depende de quién pregunta, y es deliberado:

- **El activador** exige el catálogo completo. Le nombraste un libro y esperas
  que después existan todos los objetivos aprobados; un hueco es una
  inconsistencia → `CONCEPT_INGEST_UNIT_MISSING`.
- **El backfill** recorre _todos_ los libros para construir la superficie de
  lectura y no puede saber si un libro está ingerido por completo. Ahí, un
  capítulo catalogado sin unidad es un catálogo que se adelanta, no una base
  rota; bloquear la lectura por una fila de enseñanza sería el intercambio
  equivocado. Lo salta y **devuelve la cuenta** en
  `BackfillStats.conceptsSkippedMissingUnit` — nunca en silencio.

Si ves ese contador distinto de cero después de un backfill, el catálogo nombra
capítulos que el libro todavía no tiene. Es informativo, no un error.

## Privacidad

La salida del CLI son **solo métricas**. Nunca una pregunta, una opción, la
respuesta correcta, el título de un capítulo ni un fragmento del manuscrito. Los
errores salen exclusivamente como códigos de máquina: un mensaje crudo de Prisma
puede citar la fila con la que se atragantó, es decir, texto del libro.

## Qué NO hace

- No crea el libro. Eso es `content:book:bootstrap`.
- No reemplaza una edición. Eso es `ingestUnitV2`, por unidad.
- No crea la `GuideDefinition` ni el anchor. Eso es código, no filas.
- No sube assets ni toca multimedia.
