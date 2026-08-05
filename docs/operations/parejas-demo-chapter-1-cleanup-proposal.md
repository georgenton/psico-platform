# Parejas que perduran — propuesta de limpieza del capítulo editorial 1

```
SOURCE=OCR
STATUS=PROVISIONAL_DEMO
FINAL_EDITION=false
AUTHOR_APPROVAL_REQUIRED=true

CURRENT_STORAGE_MODEL=LEGACY_CHAPTER_BLOCK
PUBLISHED_SOURCE_BLOCKS=87
CANDIDATE_ID=parejas-ch1-ocr-cleanup-draft-1
CONTENT_CORE_REVISION_CREATED=false
CANDIDATE_PUBLISHED=false
PRODUCTION_CHANGED=false

PARTIAL_CLEANUP=true
UNRESOLVED_BLOCKS=13
FINAL_READER_QUALITY_APPROVED=false
```

Esto es una **propuesta**. No aplica nada, no publica nada y no toca producción.
Continúa el diagnóstico de
[`parejas-demo-chapter-1-cleanup-plan.md`](./parejas-demo-chapter-1-cleanup-plan.md)
y añade lo que aquel no tenía: los identificadores reales de los bloques, una
clasificación bloque por bloque, y dos hallazgos que cambian cómo hay que
aplicarla.

## 0. Procedencia

```
SOURCE_FILE=02-cuando-amar-tambien-sana.md
SOURCE_SHA256=7b87d8328c7efd61bd57b988b9c087c35caa2bdffe0e775329348189374e0167
MANIFEST_SHA256=d60a56b2e500cd985f4a439a6ab10cbbd84963e4df3a6b4bfde071d246923cb1
SOURCE_SHA256_MATCH=true
MANIFEST_SHA256_MATCH=true
SOURCE_NONEMPTY_LINES=88
SOURCE_TITLE_LINES=1
PUBLISHED_SOURCE_BLOCKS=87
```

Los dos hashes coinciden con los declarados en el plan, así que este documento
describe exactamente los mismos bytes.

Las 88 líneas no vacías se reparten así: la primera es el `# título` que la
ingesta consume como título del capítulo, y las 87 restantes son los bloques
publicados. El capítulo se sirve desde `ChapterBlock` **legado**: ahí no hay
numeración de revisiones, así que este documento ya no habla de «revisión 1 → 2»
—eso sería inventar una semántica que el almacenamiento no tiene— sino de un
candidato con nombre, `parejas-ch1-ocr-cleanup-draft-1`. La revisión productiva se leyó **solo lectura** por la API
autenticada (`GET /api/lector/parejas-que-perduran/2`) y alinea **87 de 87** con
la fuente, contenido idéntico. Por eso los `blockId` de este documento son los
reales, no supuestos.

## 1. Los dos hallazgos que el plan no tenía

### 1.1 No es un encabezado duplicado: es una página duplicada

El plan cuenta `DUPLICATE_HEADINGS=1` (L125 repite L105). Al alinear la fuente
completa aparece que ese encabezado es solo el centro de una **franja de diez
bloques duplicados**: L117–L135 repiten L97–L115 casi palabra por palabra. Es un
salto de página del escaneo, no una sección repetida por el autor.

Las dos copias están dañadas en sitios distintos, y eso resulta útil: **la copia
sirve de evidencia para corregir el original**. El prefijo `EME ` de L97 no está
en L117; la cola ` “E` de L113 no está en L131. Corregir esos dos puntos no es
inventar texto, es leer la otra impresión de la misma frase.

Se conserva la primera copia (L97–L115) porque es la más completa en su tramo
final: L115 llega hasta «la hormona que reduc», mientras su duplicado (L133–L135)
se corta mucho antes.

**La clasificación pedida no tenía término para esto** — solo
`REMOVE_DUPLICATE_HEADING`. Se añadió `REMOVE_DUPLICATE_BLOCK` para los nueve
párrafos duplicados y se declara aquí en vez de forzar una etiqueta que
describiría mal el hallazgo.

### 1.2 El ancla del Guide vive en un bloque roto

`PAREJAS_READER_ANCHOR` (`packages/types/src/guide-anchor.ts`) usa como
`sourceHeading` exactamente esto:

> «Suran no solo las o pende xn — …»

Es L33, uno de los bloques ilegibles. El propio archivo lo dice: «cuando el
máster reemplace esta edición el capítulo se re-ingesta, y este localizador
DEBE re-validarse».

Consecuencia práctica: **borrar o corregir L33 rompe el Guide de Parejas**. Esta
propuesta lo deja intacto (`UNRESOLVED_SOURCE_AMBIGUITY`, sin cambio automático)
y el candidato conserva tanto el `sourceHeading` como el `passageLastSentence`.
Cuando la revisión editorial toque ese bloque, el ancla tiene que cambiar en el
mismo PR — y eso es código, no contenido.

## 2. Inventario

87 bloques, cada uno con una categoría:

| Clasificación                 | Bloques | Qué implica                                         |
| ----------------------------- | ------: | --------------------------------------------------- |
| `KEEP`                        |  **44** | Sin defecto detectado                               |
| `UNRESOLVED_SOURCE_AMBIGUITY` |  **13** | Dañado; requiere el original. Sin cambio automático |
| `LIKELY_IMAGE_ONLY_PAGE`      |  **10** | Residuo de escaneo sin contenido editorial          |
| `REMOVE_DUPLICATE_BLOCK`      |   **9** | Párrafo duplicado (franja L117–L135)                |
| `CORRECT_OCR_SOURCE_VERIFIED` |   **4** | Corrección verificable dentro del paquete           |
| `REMOVE_DUPLICATE_HEADING`    |   **3** | Título del capítulo repetido ×2 + encabezado ×1     |
| `JOIN_ORPHAN_LINES`           |   **3** | Una frase partida en tres, con ruido en medio       |
| `REMOVE_INGEST_NOTE`          |   **1** | Nuestra nota sobre el escaneo, publicada            |

El detalle por bloque —`blockId`, línea de origen, evidencia y acción— está en
[`parejas-demo-chapter-1-block-mapping.json`](./parejas-demo-chapter-1-block-mapping.json),
con una entrada por cada uno de los 87.

### Las cinco correcciones propuestas

Solo entran aquí los defectos cuya evidencia está **dentro del paquete
autorizado**. Nada se completa con conocimiento general ni con paráfrasis.

| Línea | Antes (≤15 palabras)                                  | Después                 | Evidencia                         |
| ----- | ----------------------------------------------------- | ----------------------- | --------------------------------- |
| L45   | «la responsablede \| las»                             | «la responsable de las» | Palabra pegada + barra de columna |
| L79   | «terrores noctumos»                                   | «terrores nocturnos»    | L107 lo escribe bien (rn→m)       |
| L113  | «…voz temblorosa. “E»                                 | «…voz temblorosa.»      | L131 termina la frase sin la cola |
| L151  | «con tres \| reglas:»                                 | «con tres reglas:»      | Barra de columna                  |
| L93+  | «…durante conflictos» ⟂ «Mrs» ⟂ «EME tienen niveles…» | Una sola frase          | L117 confirma la continuación     |

Los 13 bloques `UNRESOLVED` incluyen el arranque del capítulo, el experimento de
1978 y tres ejercicios. Todos son legibles a medias y **ninguno se toca**: sin la
página original, completarlos sería escribir prosa nuestra dentro del libro de
David.

## 3. El candidato

[`parejas-demo-chapter-1-candidate.json`](./parejas-demo-chapter-1-candidate.json)

```
CANDIDATE_ID=parejas-ch1-ocr-cleanup-draft-1
CONTENT_CORE_REVISION_CREATED=false
STATUS=DRAFT_NOT_PUBLISHED
APPLY_STRATEGY=IN_PLACE_UPDATE_PRESERVING_BLOCK_IDS

BLOCKS_BEFORE=87
BLOCKS_AFTER=62
BLOCK_IDS_PRESERVED=62
BLOCK_IDS_MERGED=2
BLOCK_IDS_REMOVED=23
BLOCKS_CORRECTED=5

INGEST_NOTE_VISIBLE_AFTER=false
DUPLICATE_HEADING_VISIBLE_AFTER=false
UNEXPLAINED_CONTENT_LOSS=0
NEW_UNSUPPORTED_PROSE=0
```

```
NO_UNIQUE_EDITORIAL_CONTENT_IDENTIFIED_IN_REMOVALS=true
```

Esa afirmación es más débil que «ninguna retirada se lleva contenido», y lo es a
propósito. Lo que se puede sostener, retirada por retirada:

- **nueve** bloques tienen un duplicado superviviente — ahí la pérdida es cero y
  se puede comprobar comparando las dos copias;
- **uno** es una nota técnica nuestra, no del libro;
- los **trece** restantes se clasifican como residuo de escaneo en el que **no se
  identificó contenido editorial único**. Eso no es lo mismo que demostrar que no
  lo había: `MES A` o `r FE "CA` no dejan nada que leer, pero la confirmación
  definitiva sigue dependiendo de la página original.

Y el capítulo no queda limpio: `PARTIAL_CLEANUP=true`, con 13 bloques dañados
intactos. `FINAL_READER_QUALITY_APPROVED=false`.

## 4. Marcas de lectura — cómo hay que aplicar esto

El plan decía que la visibilidad de las marcas «no está demostrada». Leyendo el
esquema ya se puede decir algo más concreto:

```
MARKS_REFERENCE_BLOCK_ID=true
MARKS_REFERENCE_CONTENT_VERSION=true   (Highlight.blockVersionId, nullable)
MARKS_REQUIRE_MAPPING=true
```

`Highlight` y `Annotation` anclan en `blockId` (fila de `ChapterBlock`) y/o
`contentBlockId`; `ReadingSession.lastBlockId` apunta a la misma fila. Es decir:
**las marcas cuelgan del identificador de la fila, no del texto.**

De ahí sale el segundo hallazgo operativo. El camino que el plan §5 describía
—corregir el archivo fuente y re-ingestar— **no se puede usar**:
`apps/api/scripts/ingest-chapter-md.mjs` hace `deleteMany` y luego `createMany`
(líneas 330–331). Cada bloque recibe un `id` nuevo.

Qué pasa entonces con las marcas depende de la regla de borrado, y esa regla
cambió a mitad de camino. Conviene dejarla escrita, porque la creencia antigua
sigue circulando:

```
Highlight.blockId    → ChapterBlock.id · ON DELETE SET NULL   (+ CHECK de ancla)
Annotation.blockId   → ChapterBlock.id · ON DELETE SET NULL   (+ CHECK de ancla)
ReadingSession.lastBlockId → String nullable · SIN clave foránea
```

La migración de S6 (`20260602100000`) las creó como `ON DELETE CASCADE`. La de
CC-6C (`20260717000000_cc6c_stable_mark_storage`) las **soltó y las recreó como
`ON DELETE SET NULL`**, y añadió el `CHECK` de «al menos un ancla». Su propio
comentario lo explica: una marca solo-legado (`contentBlockId` nulo) no puede
desanclarse sin violar el `CHECK`, así que lo que se bloquea es el borrado del
bloque. Verificado además contra la base de producción, solo lectura:
`Highlight_blockId_fkey` y `Annotation_blockId_fkey` son ambas `SET NULL`, los
dos `CHECK` de ancla existen, y `ReadingSession.lastBlockId` no tiene FK.

Es decir: re-ingestar no borra silenciosamente los resaltados legados — falla, o
los desancla si tienen ancla de Content Core. Ninguna de las dos cosas es
aceptable para una limpieza de contenido.

Por eso el candidato declara `APPLY_STRATEGY=IN_PLACE_UPDATE_PRESERVING_BLOCK_IDS`:
`UPDATE` de `content` sobre los 62 `id` que sobreviven, `DELETE` explícito de los
23 que se van, y para los 2 absorbidos una decisión editorial sobre qué hacer
con sus marcas antes de borrarlos.

### Qué referencia hoy a estos bloques

Inventario **de solo lectura** contra producción. Solo conteos: ningún
identificador, ningún texto de marca, ninguna identidad.

```
HIGHLIGHTS_ON_CORRECTED_BLOCKS=0
HIGHLIGHTS_ON_MERGED_BLOCKS=0
HIGHLIGHTS_ON_REMOVED_BLOCKS=0

ANNOTATIONS_ON_CORRECTED_BLOCKS=0
ANNOTATIONS_ON_MERGED_BLOCKS=0
ANNOTATIONS_ON_REMOVED_BLOCKS=0

READING_SESSIONS_ON_MERGED_BLOCKS=0
READING_SESSIONS_ON_REMOVED_BLOCKS=1

OTHER_BLOCK_REFERENCES_FOUND=ninguna
OTHER_REFERENCES_ON_AFFECTED_BLOCKS=0

CURRENT_HIGHLIGHT_DELETION_RISK=none_present
CURRENT_ANNOTATION_DELETION_RISK=none_present
CURRENT_DANGLING_READING_SESSION_RISK=1
READING_SESSION_LAST_BLOCK_REMAP_REQUIRED=true
```

El barrido del esquema encontró exactamente tres referencias a un bloque:
`Highlight.blockId`, `Annotation.blockId` y `ReadingSession.lastBlockId`.
`BookBookmark` ancla en el libro, no en un bloque, así que no entra.

Nadie ha resaltado ni anotado nada en este capítulo. Pero **una sesión de
lectura apunta a un bloque que la limpieza borraría**, y `lastBlockId` es un
`String` suelto, sin clave foránea: borrar ese bloque no lo pone a `null`, lo
deja apuntando a una fila que ya no existe. Alguien perdería su «seguir donde lo
dejaste» sin que nada falle ruidosamente.

### Regla de aplicación

| Situación                            | Qué se puede hacer                                       |
| ------------------------------------ | -------------------------------------------------------- |
| Bloque corregido **con** highlights  | No se actualiza hasta resolver los offsets               |
| Bloque absorbido **con** referencias | No se elimina hasta migrarlas todas a su `newBlockId`    |
| Bloque retirado **con** referencias  | No se elimina hasta decidir destino o retirada explícita |
| Bloque **sin** referencias           | Puede seguir en la propuesta de aplicación               |

Con los conteos de arriba: las 5 correcciones y 22 de las 23 retiradas caen en
la última fila. **Una retirada no**, la que sostiene esa sesión de lectura.

Y una condición adicional, concreta para esa sesión:

```
READING_SESSION_LAST_BLOCK_REMAP_REQUIRED=true
```

Antes de eliminar ese bloque, su `lastBlockId` tiene que apuntar a un bloque
superviviente adecuado o quedar explícitamente reiniciado. **Cuál** de las dos
cosas no se decide aquí: es una decisión de producto sobre dónde debería
retomar esa persona, no un detalle de implementación. Esta propuesta no toca
esa fila.

Esto no implementa migración de marcas ni un framework para ello: describe la
condición que hay que cumplir antes de tocar cada bloque.

### Lo que bloquea publicar

```
MARKS_VISIBILITY_VERIFIED=false
```

Un `UPDATE` in situ conserva el `id`, pero `Highlight.startOffset`/`endOffset`
son posiciones de caracteres dentro del texto del bloque: corregir «la
responsablede | las» → «la responsable de las» desplaza cada offset posterior de
ese bloque. Hoy no hay resaltados ahí, así que el riesgo es futuro, no actual —
pero la regla tiene que existir antes de que alguien resalte.

Cómo se comprueba, sin fabricar datos en producción:

1. **Inventario de solo lectura** de las marcas existentes (hecho, arriba).
2. **Fixture local** que reproduzca el desplazamiento de offsets sobre los cinco
   bloques corregidos.
3. **Smoke posterior**, únicamente cuando se autorice la aplicación.

```
PRODUCTION_TEST_MARK_CREATED=false
```

No se creó ninguna marca de prueba en producción, y no se propone crearla: sería
escribir datos de un usuario real para validar una herramienta nuestra.

### Qué demuestran los tests de este PR

```
PROPOSAL_INTERNAL_CONSISTENCY_VERIFIED=true
EDITORIAL_CORRECTNESS_VERIFIED=false
MARKS_VISIBILITY_VERIFIED=false
GUIDE_ANCHORS_VERIFIED=true
```

Los tests comprueban que la propuesta es coherente consigo misma —cada bloque
contabilizado, cada retirada con motivo, nada inventado, el ancla del Guide
intacta—. **No** comprueban que las correcciones sean editorialmente correctas,
y **no** comprueban que una marca sobreviva a la aplicación.

## 5. Qué falta para poder aplicar

1. Aprobación de David sobre las 5 correcciones y las 23 retiradas.
2. Revisión editorial de los 13 bloques `UNRESOLVED` contra el original.
3. Decidir qué pasa con la sesión de lectura anclada en un bloque a retirar.
4. Fixture de offsets para los 5 bloques corregidos.
5. Si la revisión editorial toca L33, actualizar `PAREJAS_READER_ANCHOR` en el
   mismo cambio.

Hasta que 1–4 estén hechos, esto no se publica.
