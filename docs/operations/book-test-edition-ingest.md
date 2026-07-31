# Ingesta de un libro nuevo — ediciones de prueba (Content Core)

```
DOCUMENT_SCOPE=NEW_BOOK_BOOTSTRAP_AND_TEST_EDITIONS
CLI=apps/api/src/content-core/bootstrap-cli.ts
LIBRARY=apps/api/src/content-core/bootstrap-book.ts

DEFAULT_MODE=dry-run
APPLY_REQUIRES_EXPLICIT_FLAG=true
PRODUCTION_APPLY_REQUIRES_ALLOW_FLAG=true
ALLOW_FLAG=ALLOW_CONTENT_CORE_BOOK_INGEST=on

EXISTING_SLUG_BEHAVIOR=FAIL_CLOSED
DELETE_EXISTING_BOOK=false
OVERWRITE_EXISTING_BOOK=false
BOOTSTRAP_ATOMIC=true
PARTIAL_BOOK_STATE_ALLOWED=false
SCHEMA_CHANGE_REQUIRED=false
MIGRATION_REQUIRED=false

LEGACY_DESTRUCTIVE_INGEST_PRODUCTION=PERMANENTLY_FORBIDDEN
FINAL_EDITION_UPDATE_PATH=INGEST_V2_PER_UNIT
```

## Por qué existe

Content Core tenía dos caminos de escritura y ninguno servía para un libro que
todavía no existe:

- **`ingestUnitV2`** actualiza una unidad dentro de una edición que **ya tiene**
  una revisión publicada. Se niega explícitamente a acuñar la primera
  (`INGEST_REQUIRES_BASE_REVISION`).
- **`backfillContentCore`** promueve a Content Core libros que ya existen como
  filas legacy.
- **`ingest-chapter-md.mjs`** (legacy) sí crea capítulos, pero **los reemplaza**:
  borra en cascada los resaltados y notas ancladas a esos bloques. Por eso está
  **permanentemente prohibido en producción** — sin override, ni siquiera con
  `--dry-run`.

Un libro nuevo, entonces, no tenía ruta. Este runbook cubre esa ruta.

## Qué escribe

Una sola transacción crea el estado completo, en este orden:

1. `Book` + `Chapter` + `ChapterBlock` — las filas legacy que las rutas actuales
   del lector siguen leyendo.
2. `Work` + `Edition` (`<slug>-1e`, la misma forma que usa el backfill).
3. `ContentUnit` + `ContentUnitVersion` + `ContentBlock` + `BlockVersion`, con la
   identidad derivada de las filas legacy por los helpers CC-1
   (`unitKeyFromLegacyChapterId`, `blockKeyFromLegacyId`) — **nunca inventada
   aquí**. Un libro creado así es indistinguible de uno backfilleado.
4. `Revision` #1 con **todos** los capítulos + `RevisionUnit` por cada uno.
5. Publicación al final: `Revision.status = PUBLISHED` y
   `Edition.publishedRevisionId`.

O existe el libro entero o no existe nada. Un libro a medias aparecería en la
biblioteca como un cascarón ilegible, y una revisión incompleta serviría un
capítulo invisible — el lector leería ese hueco como «este capítulo no existe».

## El manifest

```json
{
  "slug": "parejas-que-perduran",
  "title": "Parejas que perduran",
  "author": "David Jaramillo",
  "editionLabel": "Edición de prueba OCR",
  "sourceQuality": "OCR_UNFINALIZED",
  "chapters": [{ "order": 1, "title": "Título del capítulo", "file": "01.md" }]
}
```

Las rutas de `file` se resuelven **relativas al manifest**, así que un manifest
viaja con sus fuentes. El manifest y los capítulos viven fuera del repositorio.

`sourceQuality` **no tiene columna en el schema** y no debe tenerla: el estado de
prueba es transitorio y añadir una columna para él sería ruido permanente por un
estado pasajero. Se documenta donde ya hay lugar: `Book.subtitle` y
`Edition.label` reciben el `editionLabel`, y `Book.description` combina ambos.

## Dry-run (por defecto)

```bash
pnpm --filter @psico/api content:book:bootstrap -- --manifest /ruta/book-manifest.json
```

Imprime métricas y **nada más** — nunca texto del libro:

```
mode=dry-run
slug=parejas-que-perduran
slug_available=true
edition_key=parejas-que-perduran-1e
edition_key_available=true
chapter_count=9
nonempty_chapter_count=9
total_block_count=1150
block_kind_counts=HEADING:270,PARAGRAPH:878,QUOTE:2
bootstrap_safe=true
writes=0
```

`bootstrap_safe=false` cuando el slug está ocupado o algún capítulo quedó vacío.
Un apply con `bootstrap_safe=false` se rechaza antes de abrir la transacción.

## Apply

```bash
ALLOW_CONTENT_CORE_BOOK_INGEST=on \
pnpm --filter @psico/api content:book:bootstrap -- \
  --manifest /ruta/book-manifest.json --apply
```

En producción el `node dist/…` es equivalente y es la forma que usa el runbook de
Content Core:

```bash
ALLOW_CONTENT_CORE_BOOK_INGEST=on node dist/content-core/bootstrap-cli.js --manifest=/ruta/book-manifest.json --apply
```

El slug existente **falla cerrado** (`BOOK_SLUG_ALREADY_EXISTS`) dentro de la
transacción, no solo en la inspección previa: el plan puede quedar obsoleto entre
la inspección y el apply, y los índices únicos son la autoridad real. No hay
camino de borrado ni de sobrescritura, así que un re-run equivocado no puede
destruir las marcas de nadie.

Los errores salen solo como código de máquina, nunca como mensaje crudo — un
mensaje de Prisma puede arrastrar texto del manuscrito.

## Rollback

El bootstrap es **aditivo**: no toca ningún otro libro, así que revertirlo no
tiene efectos colaterales.

- **Falla a mitad** → la transacción revierte todo. No hay nada que limpiar.
- **El libro se creó y no se quería** → el rollback es despublicarlo
  (`Book.isPublished = false`), no borrarlo. Si ya hay lectores con resaltados o
  notas en él, borrarlo se los lleva por delante.
- **Nunca** improvises `DELETE` sobre filas de Content Core: `ContentBlock` es
  `onDelete: Restrict` precisamente porque puede cargar anclas de usuario.

## Ediciones de prueba OCR

Una edición de prueba existe para ejercitar el producto — navegación entre
capítulos, resaltados, notas, actividades, progreso, Content Core — no para ser
la edición comercial.

Reglas al preparar las fuentes:

- **Ningún texto se descarta en silencio.** Si un tramo del OCR queda fuera, se
  documenta con su conteo. El parser prefiere emitir un `PARAGRAPH` antes que
  perder una línea.
- **Los límites de capítulo pueden ser inciertos**, y está bien, siempre que la
  incertidumbre quede escrita. Prioridad: encabezados detectados → índice →
  marcadores de página → agrupaciones razonables.
- **Sin título legible, no se inventa uno.** Se usa `Sección OCR de prueba N` —
  un marcador honesto que nadie confundirá con una decisión editorial.
- El OCR clasifica de más: líneas cortas sin puntuación final se leen como
  `HEADING`. Es ruido esperado de una edición de prueba y desaparece con el
  máster.

### Ejemplo — `parejas-que-perduran`

Fuente: transcripción OCR de 3 210 líneas. Ocho encabezados de capítulo legibles
en el cuerpo, confirmados por el índice del final. El capítulo 1 llega con el
sello dañado (`CAPÍTULO! ,`), pero su título es legible en la línea siguiente.

- 9 secciones: prefacio + introducción como orden 1, los 8 capítulos como 2–9.
- 26 332 palabras conservadas + 95 en los sellos «CAPÍTULO X» reemplazados por el
  título canónico + 361 del índice de contraportada, excluido por ser navegación
  y no contenido = 26 427, el total exacto de la fuente.
- 1 150 bloques.

## Reemplazar una edición de prueba por el máster

**No se re-corre el bootstrap.** El slug falla cerrado, y con razón.

El máster entra por `ingestUnitV2`, unidad por unidad. Acuña una revisión nueva,
copia el manifiesto hacia adelante y reescribe solo la unidad que cambió. Los
bloques que no cambiaron **conservan su `blockKey`**, así que los resaltados y
las notas que los lectores dejaron en la edición de prueba sobreviven al cambio.
Ningún `ContentBlock` se borra jamás; los bloques retirados se marcan como
tombstone.

Eso está probado de punta a punta en
`apps/api/src/content-core/content-core-bootstrap.pg-spec.ts` (caso 10): un libro
creado por el bootstrap recibe después una edición por `ingestUnitV2` y la
identidad de los bloques intactos se preserva.

## Emociones en construcción

```
EMOCIONES_REBOOTSTRAP_REQUIRED=false
EMOCIONES_FINAL_EDITION_UPDATE_PATH=INGEST_V2_PER_UNIT
```

Ya existe en producción con su identidad estable, y por eso mismo **no se vuelve
a crear ni se sobrescribe**. Su edición final reemplazará los capítulos por
revisiones nuevas, igual que cualquier otro libro, sin borrar resaltados, notas,
sesiones ni Learning Events.

## Ver también

- [`docs/architecture/content-core.md`](../architecture/content-core.md) — el
  modelo Work/Edition/Revision y el ingest no destructivo.
- [`docs/adr/0016-content-core-work-edition-revision.md`](../adr/0016-content-core-work-edition-revision.md)
  — por qué la identidad se ancla al id legacy.
- [`docs/operations/cc7-production-runbook.md`](cc7-production-runbook.md) — el
  runbook de despliegue donde encaja este paso.
