# Parejas que perduran — propuesta de limpieza del capítulo editorial 1

```
SOURCE=OCR
STATUS=PROVISIONAL_DEMO
FINAL_EDITION=false
AUTHOR_APPROVAL_REQUIRED=true

CURRENT_REVISION=1
CANDIDATE_REVISION=2
CANDIDATE_PUBLISHED=false
PRODUCTION_CHANGED=false
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
SOURCE_NONEMPTY_BLOCKS=88
```

Los dos hashes coinciden con los declarados en el plan, así que este documento
describe exactamente los mismos bytes.

Las 88 líneas no vacías se reparten así: la primera es el `# título` que la
ingesta consume como título del capítulo, y las 87 restantes son los bloques
publicados. La revisión productiva se leyó **solo lectura** por la API
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
CANDIDATE_REVISION=2
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

Se retiran 23 bloques y ninguno se lleva contenido con él: 14 son residuo de
escaneo o nuestra propia nota, y los 9 restantes son duplicados cuyo original
permanece. Cada retirada tiene su motivo escrito en el mapa.

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
(líneas 330–331). Cada bloque recibe un `id` nuevo, y con la FK
`onDelete: SetNull` de `Highlight.blockId` cada resaltado del capítulo queda sin
ancla — cuando el `CHECK` de al menos un ancla no aborte el borrado antes.

Por eso el candidato declara `APPLY_STRATEGY=IN_PLACE_UPDATE_PRESERVING_BLOCK_IDS`:
`UPDATE` de `content` sobre los 62 `id` que sobreviven, `DELETE` explícito de los
23 que se van, y para los 2 absorbidos una decisión editorial sobre qué hacer
con sus marcas antes de borrarlos.

Queda una cosa sin demostrar, y es la que bloquea publicar:

```
MARKS_VISIBILITY_VERIFIED=false
```

Un `UPDATE` in situ conserva el `id`, pero `Highlight.startOffset`/`endOffset`
son posiciones de caracteres dentro del texto del bloque: corregir «la
responsablede | las» → «la responsable de las» desplaza cada offset posterior de
ese bloque. Ninguno de los cinco bloques corregidos ha sido comprobado con un
resaltado real antes y después. **Eso hay que hacerlo con un resaltado de verdad
sobre un bloque de verdad, no razonarlo.**

## 5. Qué falta para poder aplicar

1. Aprobación de David sobre las 5 correcciones y las 23 retiradas.
2. Revisión editorial de los 13 bloques `UNRESOLVED` contra el original.
3. Prueba de visibilidad de marcas: crear un resaltado sobre uno de los bloques
   corregidos, aplicar, y verificar que sigue donde debe.
4. Decisión sobre las marcas de los 2 bloques absorbidos.
5. Si la revisión editorial toca L33, actualizar `PAREJAS_READER_ANCHOR` en el
   mismo cambio.

Hasta que 1–3 estén hechos, esto no se publica.
