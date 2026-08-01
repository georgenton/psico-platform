# Parejas que perduran — Guide V1, primera definición (demo)

```
BOOK_SLUG=parejas-que-perduran
BOOK_CHAPTER_NUMBER=1
PLATFORM_CHAPTER_ORDER=2
CHAPTER_ORDER=2                 # alias histórico de PLATFORM_CHAPTER_ORDER
PRACTICE_SOURCE_HEADING=Ejercicio 3: El Mapa de las Miradas
PRACTICE_SOURCE_MATCH_COUNT=1
GUIDE_PURPOSE=DEMO
SOURCE_QUALITY=OCR_UNFINALIZED
EDITORIAL_AUTHORIZATION=JORGE_DEMO_REQUEST
AUTHOR=David Jaramillo

CONCEPT_KEY=pqp-c1-contacto-sostenido
PRACTICE_KEY=pqp-c1-practice-diez-minutos-de-contacto
RECALL_KEY=pqp-c1-recall-contacto-sostenido
GUIDE_KEY=pqp-c1-contacto-sostenido
GUIDE_VERSION=1

PAREJAS_LEARNING_CATALOG_CODE_COMPLETE=true
PAREJAS_LEARNING_ACTIVATION_CLI_AVAILABLE=true
PAREJAS_LEARNING_ACTIVATION_TESTED=true

PAREJAS_PRODUCTION_TARGET_ROWS_CREATED=true
PAREJAS_GUIDE_TARGETS_MATERIALIZED_IN_PRODUCTION=true

PAREJAS_CONCEPT_ROWS=1
PAREJAS_CONCEPT_LINK_ROWS=1
PAREJAS_EXERCISE_ROWS=2

PAREJAS_GUIDE_CODE_COMPLETE=true
PAREJAS_GUIDE_AVAILABLE_IN_PRODUCTION=false
DEPLOY_REQUIRED=true

PQP_ANCHOR_HEADING_MATCH_COUNT=1
PQP_ANCHOR_PASSAGE_MATCH_COUNT=1
PQP_ANCHOR_STATUS=RESOLVED
```

## Por qué este concepto

El capítulo 1 abre con un experimento concreto y verificable en el propio texto:
a parejas en conflicto se les pidió sentarse frente a frente, tomarse de las
manos y mirarse a los ojos durante diez minutos — **sin disculpas y sin buscar
soluciones**. El capítulo continúa con un caso de consultorio que aplica ese
mismo ejercicio.

Es el mejor candidato del capítulo para una Guide de tres pasos porque:

- **Es explícito en el texto**, no una inferencia nuestra. No hace falta añadir
  ninguna afirmación psicológica que el libro no contenga.
- **Tiene una práctica que el lector puede hacer** tal cual está descrita.
- **Admite una pregunta de recall objetiva** con una única respuesta correcta
  derivable de la lectura, no de opinión.
- **Sobrevive al OCR**: el párrafo que lo describe llegó limpio, a diferencia de
  otros tramos del capítulo que están degradados.

Rechazados por no cumplir alguna de esas condiciones: la metáfora del palo santo
que abre el capítulo (el OCR la dejó ilegible a tramos) y el pasaje sobre
dopamina (afirmaciones neurocientíficas que el OCR no permite citar con
precisión, y que no queremos reformular por nuestra cuenta).

## Los tres targets

| Paso | Tipo                  | Clave                                      |
| ---- | --------------------- | ------------------------------------------ |
| 1    | `CONCEPT_EXPLORATION` | `pqp-c1-contacto-sostenido`                |
| 2    | `CATALOG_PRACTICE`    | `pqp-c1-practice-diez-minutos-de-contacto` |
| 3    | `ACTIVE_RECALL`       | `pqp-c1-recall-contacto-sostenido`         |

**Concepto** — «El contacto sostenido en silencio»: el contacto físico y la
mirada mantenidos, sin palabras y sin resolver nada, cambian el estado de una
pareja en conflicto.

**Práctica** (`REFLECTION`, autoinforme) — reproducir el ejercicio del capítulo:
diez minutos frente a frente, tomados de las manos, en silencio. No es
verificable por el servidor; se completa por confirmación explícita del lector,
igual que la práctica de _Emociones en Construcción_.

**Recall** (`QUIZ`, corregido en el servidor) — pregunta objetiva sobre qué se
pidió exactamente a las parejas del experimento, con tres opciones cerradas y una
sola respuesta canónica. La respuesta correcta vive **únicamente** en el catálogo
server-side; nunca viaja al cliente antes de responder.

Los enunciados y opciones concretos viven en `EXERCISE_INGESTION_CATALOG`
(`apps/api/src/content-core/exercise-ingestion-catalog.ts`), no aquí: este
documento registra la decisión editorial, no el contenido ejecutable.

## El capítulo 1 del libro es `chapterOrder=2` en la plataforma

El manifest de ingesta puso el prefacio e introducción como orden 1, así que el
capítulo 1 del libro —«Cuando amar también sana»— quedó como **orden 2**. Lo
confirmó el smoke en producción: orden 1 tiene 41 bloques (prefacio) y orden 2
tiene 87.

Todo el catálogo debe usar `chapterOrder: 2`. Usar 1 apuntaría al prefacio: la
activación fallaría cerrada al no encontrar el encabezado de la práctica, o —peor—
resolvería contra el capítulo equivocado.

## Anchor

La práctica ancla al encabezado `Ejercicio 3: El Mapa de las Miradas`, que
aparece **exactamente una vez** entre los 27 encabezados del capítulo (verificado
replicando la regla del parser sobre el archivo con hash validado). Es el
ejercicio de la mirada sostenida, el mismo concepto elegido.

El anchor de la Guide apunta al párrafo que describe el experimento. Debe resolver a
**exactamente un bloque** del capítulo 1 por identidad Content Core
(`blockKey`), nunca por posición visual ni por primera coincidencia. Si el OCR
produjera más de una coincidencia, se amplía el contexto hasta que sea única, o
la activación falla cerrada.

### El anchor elegido (GR-4)

Vive en `packages/types/src/guide-anchor.ts` como `PAREJAS_READER_ANCHOR`, y el
lector lo busca por pin exacto a través de `guideAnchorRegistry.getExact(pin)`.

- **Pasaje**: el párrafo del experimento — parejas en conflicto, diez minutos de
  contacto en silencio, sin disculpas y sin soluciones. Su última oración es la
  huella única.
- **`sourceHeading`**: el encabezado que acota ese pasaje en la edición
  ingerida. **No** es `Ejercicio 3: El Mapa de las Miradas`: ese es el
  encabezado fuente de la _práctica_, y su sección contiene los pasos numerados,
  no el concepto. Anclar ahí llevaría al lector a «1. Siéntense frente a
  frente…» mientras el panel habla de por qué el contacto sostenido cambia el
  estado de una pareja.

**Advertencia honesta sobre la edición OCR.** El capítulo tiene exactamente tres
encabezados que un editor reconocería como tales: dos títulos de «Ejercicio N» y
un título de testimonio que el OCR imprimió **dos veces**. Ninguno acota el
pasaje conceptual, así que el que sí lo acota es una línea mal reconocida por el
OCR — única, verbatim y verificable contra el paquete con hash validado, pero
irreconocible en el libro impreso. Se documenta en vez de disimularse: la
alternativa (anclar a un paso de la práctica, o ensanchar el resolver hasta que
adivine) es peor.

Cuando llegue la edición maestra y se re-ingeste el capítulo, **este locator
debe revalidarse**. La sonda contra PostgreSQL real es lo que lo dirá en voz
alta, en lugar de que la guía apunte en silencio al párrafo equivocado.

Medido contra una ingesta real del paquete autorizado:

```
PQP_ANCHOR_HEADING_MATCH_COUNT=1
PQP_ANCHOR_PASSAGE_MATCH_COUNT=1
PQP_ANCHOR_STATUS=RESOLVED
```

## Estado real

Los tres targets resuelven contra **filas de base de datos** (`Concept`,
`ConceptLink`, `Exercise`). En **producción esas filas ya existen**: el
learning activation apply se ejecutó y se verificó allí.

```
PAREJAS_CONCEPT_ROWS=1
PAREJAS_CONCEPT_LINK_ROWS=1
PAREJAS_EXERCISE_ROWS=2
```

> El learning activation apply ya fue ejecutado y verificado en producción.
> No debe repetirse como parte de este despliegue.
> La disponibilidad requiere únicamente desplegar el código de #614 y completar
> el smoke con la cuenta piloto.

Lo que falta en producción es **código**, no datos: la `GuideDefinition`, el
anchor y el discovery del lector viven en `develop` y todavía no están
desplegados (`DEPLOY_REQUIRED=true`). Hasta que ese deploy ocurra, la Guide de
Parejas **no está disponible en producción** y el lector no la ve — que es el
comportamiento correcto: la superficie falla cerrada en lugar de ofrecer una
guía rota.

Orden restante para producción:

```
deploy del código de #614
→ verificar disponibilidad de la Guide
→ smoke con la cuenta piloto
```

### Otros entornos

Un entorno distinto de producción (local, preview, una base efímera) **sí**
necesita materializar sus propios targets antes de que la Guide aparezca:
`content:book:activate-learning --book-slug=parejas-que-perduran`, documentado
en [book-learning-activation.md](../operations/book-learning-activation.md).
Eso es una tarea de ese entorno, no de este despliegue.

## Autorización

Contenido de _Parejas que perduran_, de David Jaramillo, socio de Jorge, usado
para pruebas por autorización expresa del autor. La edición vigente es OCR de
prueba y será reemplazada por el máster editorial mediante revisiones no
destructivas; cuando eso ocurra habrá que revalidar que el anchor sigue
resolviendo a un único bloque.
