# Parejas que perduran — Guide V1, primera definición (demo)

```
BOOK_SLUG=parejas-que-perduran
CHAPTER_ORDER=2
BOOK_CHAPTER_LABEL=Capítulo 1 del libro
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

PAREJAS_GUIDE_CODE_COMPLETE=false
PAREJAS_GUIDE_TARGETS_MATERIALIZED_IN_PRODUCTION=false
PAREJAS_GUIDE_AVAILABLE_IN_PRODUCTION=false
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

## Estado real

El código del catálogo y de la Guide puede existir sin que la Guide funcione: los
tres targets resuelven contra **filas de base de datos** (`Concept`,
`ConceptLink`, `Exercise`), y `parejas-que-perduran` entró a producción por el
bootstrap de Content Core, que deliberadamente no crea ninguna de ellas.

Orden para activarla:

```
deploy code
→ dry-run del activador editorial
→ apply del activador
→ verificar disponibilidad de la Guide
→ smoke con la cuenta piloto
```

Hasta que el apply del activador se ejecute, la Guide de Parejas **no está
disponible en producción** y el lector no la ve — que es el comportamiento
correcto: la superficie falla cerrada en lugar de ofrecer una guía rota.

## Autorización

Contenido de _Parejas que perduran_, de David Jaramillo, socio de Jorge, usado
para pruebas por autorización expresa del autor. La edición vigente es OCR de
prueba y será reemplazada por el máster editorial mediante revisiones no
destructivas; cuando eso ocurra habrá que revalidar que el anchor sigue
resolviendo a un único bloque.
