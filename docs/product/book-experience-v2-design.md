# Book Experience V2 — diseño de UX y modelo de experiencia

```
BOOK_EXPERIENCE_V2_DESIGN_VERSION=0.1
STATUS=APPROVED_FOR_VISUAL_PROTOTYPING
LAST_UPDATED=2026-08-03
IMPLEMENTATION_IN_THIS_DOCUMENT=none
RUNTIME_AUTHORITY=false
IMPLEMENTATION_AUTHORIZED=false
PRODUCTION_STATUS=NOT_IMPLEMENTED
V2_PRODUCT_DIRECTION=APPROVED
V2_VISUAL_PROTOTYPE=PENDING_REVIEW
V2_IMPLEMENTATION=NOT_AUTHORIZED
```

Este documento **no implementa nada**. No define tablas, no define endpoints y
no cambia producción. Describe a dónde va la experiencia de lectura y qué habría
que decidir antes de escribir la primera línea de código.

**[Book Experience Standard V1](book-experience-standard-v1.md)** (v1.1)
continúa describiendo el runtime productivo actual. V2, cuya dirección de
producto está **aprobada**, gobierna el prototipo visual objetivo: no autoriza
implementación ni reemplaza el runtime actual.

> **Autoridad, precedencia y vocabulario:** la sección canónica vive en
> [`../design/book-experience-v2-design-brief.md` §0](../design/book-experience-v2-design-brief.md).
> Resumen: V1 describe la producción actual
> ([`book-experience-standard-v1.md`](book-experience-standard-v1.md) y
> [`guided-reading-v1.md`](guided-reading-v1.md)); V2 describe el diseño
> objetivo. **V2 no ha reemplazado a la Guide V1**, cuyo lifecycle sigue intacto
> en producción. Un `ExperienceStep` de V2 **no es** una escena de V1, y una
> pantalla no implica un paso persistido.

---

## 0. Qué existe hoy (verificado en el repo, no supuesto)

Vale la pena empezar por esto porque casi todo el trabajo de V2 es **quitar un
supuesto**, no construir de cero.

| Pieza                 | Dónde vive                                          | Forma real hoy                                                                                                                                                                      |
| --------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bloques del capítulo  | `ChapterBlockKind` (Prisma)                         | `PARAGRAPH · HEADING · QUOTE · EXERCISE · AUDIO · IMAGE · PAUSE · VIDEO`                                                                                                            |
| Medios del capítulo   | `chapter-media.catalog.ts` (code-owned)             | `AUDIOBOOK · PODCAST · VIDEO`; estado servidor `PUBLISHED/DRAFT` + `source`; al cliente solo `AVAILABLE / COMING_SOON`. Ojo: definición ≠ existencia del máster ≠ reproducibilidad  |
| Modos del lector      | `book-experience.ts` (view model web)               | `BOOK · AUDIOBOOK · PODCAST · VIDEO · GUIDED` × `HIDDEN · COMING_SOON · PUBLISHED`. **No existe `COMPLETED`.**                                                                      |
| Guide (dominio)       | `guide-catalog.ts` (API)                            | `GuideDefinition { guideKey, guideVersion, steps[] }` — `steps` **ya es un array ordenado de longitud libre**                                                                       |
| Guide (tipos de paso) | `guide-catalog.ts`                                  | Solo **3**: `CONCEPT_EXPLORATION` · `CATALOG_PRACTICE` · `ACTIVE_RECALL`. `required` debe ser literal `true` (no hay pasos opcionales en V1)                                        |
| Guide (presentación)  | `guide-scene.ts` (web)                              | **8 escenas fijas**: `cover · clip · anchor · practice · recall · feedback · finish · completed`                                                                                    |
| Guides en producción  | `PRODUCTION_GUIDE_DEFINITIONS`                      | 2, ambas con exactamente 3 pasos (EEC c1, PQP c1)                                                                                                                                   |
| Actividades           | `CHAPTER_EXERCISES` (`@psico/types`, 100 % cliente) | `reflect` (abre Reflexión sembrada) · `breathe` (respiración pautada). Sin backend, sin persistencia                                                                                |
| Conceptos             | `CHAPTER_CONCEPTS` (`@psico/types`)                 | **uno** por capítulo, `{key, label}`; `key` es inmutable porque se persiste en `Resonance`                                                                                          |
| Eco contextual        | `ECO_CHAPTER_PROMPTS` + `EcoScope`                  | tema por capítulo, RAG acotado al libro, citas deterministas, oferta de resonancia                                                                                                  |
| Learning Events V1    | `learning-events.ts`                                | **8**: `unit_opened · unit_completed · concept_explored · guide_session_started · guide_session_completed · active_recall_attempted · practice_completed · chapter_media_completed` |
| Resonancias           | `Resonance` (Prisma)                                | `source: HIGHLIGHT · ECO · EXERCISE · GUIDE`, `conceptKey` único por usuario, flag `important`                                                                                      |
| Marcas                | `Highlight` / `Annotation`                          | highlight con color y offsets; annotation en **texto plano**, anclada a bloque                                                                                                      |
| Reflexión             | `DiaryEntry`                                        | **cifrada E2E**; el servidor nunca ve el texto                                                                                                                                      |
| Mapa Emocional        | `model-registry.ts`                                 | 10 modelos: `H1 · OU-G0 · OU-GT · OU-O1 · EWS-R1 · TXT-L1 · CHK-S1 · ARC-C1 · ARC-P1 · NAR-L1`; ejes calma/claridad/compasión/consciencia/conexión/propósito                        |

### Los cuatro supuestos que V2 tiene que romper

1. **«Una guía tiene tres pasos.»** Falso en el dominio (el array es libre) y
   verdadero en la presentación: `guide-scene.ts` tiene ocho escenas fijas y la
   máquina las recorre en orden. **El cuello de botella es el cliente, no el
   catálogo.**
2. **«Un capítulo tiene un concepto.»** `CHAPTER_CONCEPTS[libro][capítulo]` es
   un objeto, no una lista. Diez experiencias guiadas necesitan diez conceptos.
3. **«Terminar es invisible.»** Los modos tienen tres estados y ninguno es
   «ya lo hiciste», aunque el servidor **ya sabe** la respuesta
   (`chapter_media_completed`, `guide_session_completed`,
   `ReadingSession.completedAt`).
4. **«La guía vive en este navegador.»** No hay endpoint de lectura: el estado
   se recupera reproduciendo la clave de idempotencia guardada localmente
   (`CROSS_DEVICE_RESUME_V1=false`). Con una guía de tres pasos eso cuesta un
   toque; con diez, cuesta la sesión entera.

---

## 1. Nuevo modelo mental del usuario

### Hoy

> «Estoy en un capítulo. Arriba hay pestañas. Cada pestaña es un formato del
> mismo texto.»

El capítulo es el objeto y los formatos son vistas suyas. Por eso «Escuchar»
parecía una versión del texto y no otra obra, y por eso una guía parece un
apéndice del capítulo.

### V2

> «Estoy en una **experiencia del libro**. El capítulo es el hilo. Puedo
> recorrerlo leyendo, escuchando, viendo o acompañado — y hay tramos donde el
> libro me propone hacer algo, no solo recibir algo.»

Tres desplazamientos, en orden de importancia:

**a) De «formato» a «modo de recorrido».** Audiolibro y podcast no son el texto
en audio: son obras distintas sobre el mismo material. Video tampoco ilustra el
capítulo. El selector deja de leerse como «el mismo contenido, otra caja» y pasa
a leerse como «por dónde quiero entrar».

**b) De «guía» a «experiencias».** Plural, y de longitud variable. Un capítulo
corto puede tener una experiencia guiada; uno extenso, diez. La unidad deja de ser
«la guía del capítulo» y pasa a ser **la experiencia guiada**: una idea, trabajada
hasta el final.

**c) De «progreso» a «recorrido».** Hoy el progreso es una barra de scroll y un
botón de completar. En V2 el capítulo tiene un mapa: qué modos hay, cuáles
tienen algo, cuáles ya recorrí. El usuario debería poder responder «¿qué me
falta de este capítulo?» mirando una pantalla, sin abrir cuatro pestañas.

### Lo que NO cambia

El libro sigue siendo el contenido principal. Una experiencia guiada nunca es
requisito para leer, y ningún modo se vuelve obligatorio. La plataforma
acompaña una lectura; no la convierte en un curso.

---

## 2. Arquitectura de pantallas

### 2.0 La pantalla que falta: el capítulo como recorrido

Hoy se entra a un capítulo y se cae directamente en el modo Libro con una tira
de pestañas encima. V2 propone una **cabecera de capítulo** — no una pantalla
aparte, sino la primera pantalla del capítulo — que responde tres cosas antes de
que la persona elija:

```
Cap. 3 · Cuando tu mente adelanta la emoción
Parte I · Deconstruyendo lo que sabíamos

┌ Cómo recorrerlo ──────────────────────────────┐
│ 📖 Leer          22 min          ✓ leído      │
│ 🎧 Escuchar      18 min          ▸ disponible │
│ 🎬 Ver           —               próximamente │
│ 🌱 Experiencias  3 de 5          ▸ en curso   │
└───────────────────────────────────────────────┘
```

Es una decisión abierta si esto es una pantalla previa o un panel plegable
dentro del lector (ver §9, decisión D1). El punto de diseño es que **el estado
del capítulo debe ser visible sin entrar en cada modo**, que es justamente lo
que el manifest ya permite desde el estándar V1.

### 2.1 Libro

Sin cambios estructurales respecto de V1: columna de lectura, marcas, notas,
bloques tipados. Lo que V2 añade:

- Los bloques `EXERCISE` dejan de ser prosa con una tarjeta mock y pasan a ser
  **puntos de entrada a experiencias** (ver §4).
- El bloque `PAUSE` y el `VIDEO` inline ya existen; V2 los trata como parte del
  mismo vocabulario de ritmo, no como excepciones.
- El panel compañero (Eco · Notas · Reflexión) se mantiene tal cual. Funciona.

### 2.2 Audiolibro

Jerarquía de V1, sin cambios: reproductor → segmentos → transcripción → ideas
clave → actividad opcional. Lo que V2 añade es **continuidad**: si la persona
escuchó hasta el minuto 12 y luego abre Leer, el lector debería ofrecer «vas
por aquí» en el bloque correspondiente. Requiere mapear segmentos a bloques, que
hoy no existe (ver §9, decisión D3).

### 2.3 Podcast

Sigue siendo subformato dentro de Escuchar, gateado por el mismo view model
(`PODCAST_FIRST_CLASS_READER_MODE=false`). V2 no lo promueve a pestaña de primer
nivel mientras no haya episodios producidos: la regla de V1 —una pestaña es una
oferta— no cambia por ser V2.

### 2.4 Video

Dos superficies distintas que hoy se confunden:

- **Video del capítulo** (modo Ver): playlist, subtítulos, transcripción.
- **Video inline** (bloque `VIDEO`): una cápsula dentro de la lectura.

V2 mantiene ambas y las nombra distinto en la UI. No son el mismo objeto y
tratarlos como uno solo produjo la card mock 🎬 que tuvimos que rescatar.

### 2.5 Experiencias

Aquí está el rediseño real.

**Índice de experiencias del capítulo** (nuevo). Lista ordenada de las
experiencias guiadas, cada una con su estado. Es la pantalla que hoy no existe
porque con tres pasos no hacía falta:

```
🌱 Experiencias · Cap. 3

1 · El cuerpo se adelanta          ✓ completada
2 · Nombrar lo que pasa            ▸ en curso · paso 2 de 4
3 · Cuando la mente predice        ○ disponible
4 · Practicar la pausa             ○ disponible
5 · Síntesis del capítulo          🔒 al completar 1–4
```

**Reproductor de experiencia guiada.** Una sola experiencia guiada, sus pasos en
secuencia, con progreso propio. Reemplaza a la máquina de ocho escenas fijas por
un renderer **dirigido por el tipo de paso** (§4).

**Síntesis.** Cierre opcional del recorrido, disponible cuando las
experiencias guiadas requeridas están completas. Es una experiencia guiada más, con
un tipo de paso propio (`SUMMARY`).

---

## 3. Estados visuales

Cuatro estados, y los cuatro tienen que significar algo que el servidor pueda
respaldar.

### `HIDDEN`

No aparece. No crea ruta. No produce llamada. Es el default: no todos los
capítulos tienen todos los modos, y la ausencia no es un error.

### `COMING_SOON`

Aparece deshabilitado con «Próximamente». No navega, no monta superficie, no
pide URL firmada. Se usa **solo** cuando editorialmente se quiere anunciar.

### `AVAILABLE`

Habilitado, con contenido reproducible o ejecutable de verdad. Un `PUBLISHED`
sin activo **falla cerrado** (`NO_PLAYABLE_ASSET`), no se degrada a
«Próximamente»: eso presentaría una definición rota como una decisión
editorial. Esto ya está implementado y probado en V1.

### `COMPLETED` — nuevo en V2

Aparece habilitado, con una marca discreta de «ya lo recorriste». **No bloquea
nada**: se puede volver a leer, volver a escuchar, volver a hacer una
experiencia.

Origen del estado, por modo — todo esto ya se persiste hoy:

| Modo                | Señal que lo determina                     |
| ------------------- | ------------------------------------------ |
| Libro               | `ReadingSession.completedAt`               |
| Audiolibro/Podcast  | `chapter_media_completed` (por `mediaKey`) |
| Video               | `chapter_media_completed`                  |
| Experiencia (una)   | `guide_session_completed`                  |
| Experiencias (modo) | derivado: todas las requeridas completadas |

**Reglas de honestidad del estado, heredadas de V1:**

- `COMPLETED` describe **lo que la persona hizo**, no lo que la persona
  entendió. Nunca se lee como dominio del tema.
- Un `COMPLETED` de audiolibro no completa el capítulo. Cada modo es su propia
  obra; el recorrido del capítulo es la unión, no la intersección.
- Volver a entrar no borra el estado ni lo degrada. No hay «descompletar».

---

## 4. Modelo dinámico de experiencias

### 4.1 La unidad es la experiencia guiada

```
EXPERIENCIA DEL CAPÍTULO
  = colección ordenada de EXPERIENCIA_GUIADAS (1..N)
  + progreso del recorrido
  + síntesis opcional

EXPERIENCIA_GUIADA
  = una idea
  + una secuencia ordenada de PASOS (1..M)
```

Ni N ni M están fijos. Una experiencia guiada mínima puede ser un solo paso; el
recorrido de un capítulo extenso puede tener diez experiencias guiadas.

### 4.2 Vocabulario de pasos

Once tipos. Solo tres existen hoy en el servidor (marcados ✅); el resto es
propuesta de este documento.

| Paso         | Qué hace                                    | ¿Verificable por el servidor?         | Estado hoy                               |
| ------------ | ------------------------------------------- | ------------------------------------- | ---------------------------------------- |
| `INTRO`      | Encuadre corto, sin interacción             | No aplica (no completa nada)          | ⬜ nuevo                                 |
| `PASSAGE`    | Lleva a un pasaje anclado del capítulo      | No — el anchor se resuelve en cliente | ⬜ nuevo (el anchor ya existe, GR-4)     |
| `CONCEPT`    | Presenta una idea; la persona confirma      | No — autoinforme explícito            | ✅ `CONCEPT_EXPLORATION`                 |
| `VIDEO`      | Reproduce un video de la experiencia guiada | Sí — evento de fin de reproducción    | ⬜ nuevo (reusa Chapter Media)           |
| `AUDIO`      | Reproduce un audio breve                    | Sí — evento de fin de reproducción    | ⬜ nuevo (reusa Chapter Media)           |
| `PRACTICE`   | Propone hacer algo fuera de la pantalla     | No — autoinforme                      | ✅ `CATALOG_PRACTICE`                    |
| `REFLECTION` | Escribir una reflexión (cifrada E2E)        | **No puede serlo** — ver §4.4         | ⬜ nuevo                                 |
| `QUESTION`   | Pregunta abierta, sin respuesta correcta    | No — autoinforme de haber respondido  | ⬜ nuevo                                 |
| `RECALL`     | Pregunta con respuesta correcta             | **Sí** — corrección server-side       | ✅ `ACTIVE_RECALL`                       |
| `SUMMARY`    | Cierra el recorrido                         | No aplica                             | ⬜ nuevo                                 |
| `RESONANCE`  | Ofrece confirmar que un concepto resonó     | Sí — la confirmación es el dato       | ⬜ nuevo como paso (el ciclo ARC existe) |

**La columna que importa es la tercera.** Cada paso tiene que declarar su
`completionPolicy` y esa política tiene que ser honesta sobre lo que el servidor
puede saber. V1 ya lo hace bien: `objective_recall` corrige de verdad,
`explicit_confirmation` y `catalog_practice_confirmation` admiten que son
autoinforme. V2 hereda esa disciplina o repite el problema del Mapa V1 en otra
capa.

### 4.3 Qué muere: la máquina de ocho escenas

`guide-scene.ts` tiene ocho escenas nombradas (`cover · clip · anchor · practice
· recall · feedback · finish · completed`). Eso funciona con exactamente el
recorrido que tienen las dos guías actuales y **no escala a diez
experiencias guiadas con pasos heterogéneos**.

V2 lo reemplaza por dos piezas:

- **Renderer por tipo de paso**: un componente por cada uno de los once tipos, y
  la secuencia es dato, no código.
- **Posición local**: `{ experiencia guiadaId, stepKey }` en lugar de un enum de
  escenas. Sigue siendo local y sigue sin costar progreso si se pierde.

Esto es un cambio grande en el cliente y **cero cambio en el contrato del
dominio**: `steps[]` ya es un array.

### 4.4 Los dos pasos que necesitan una decisión de privacidad

**`REFLECTION`.** La reflexión se guarda como `DiaryEntry` cifrada E2E. El
servidor no puede verificar que se escribió algo, ni cuánto, ni qué. Opciones:

- **(a)** El paso se completa con autoinforme («Ya la escribí»), igual que
  `PRACTICE`. Honesto y simple. El riesgo es que se pueda avanzar sin escribir —
  que es exactamente lo mismo que pasa hoy con `PRACTICE`, y lo aceptamos.
- **(b)** El cliente reporta un booleano «se guardó una entrada» tras el POST.
  Más fiel, pero introduce una señal derivada del Diario que hoy no existe y que
  habría que declarar en el contrato de fuentes.

**Recomendación: (a).** Es consistente con `PRACTICE` y no abre una puerta nueva
al Diario por un beneficio pequeño.

**`RESONANCE`.** El ciclo ARC ya existe y ya tiene `source: GUIDE`. Como paso
dentro de una experiencia guiada, la regla no cambia: **la oferta no es el dato,
la confirmación sí**. Descartar la oferta debe poder completar el paso sin
persistir nada.

### 4.5 Ejemplo — _Emociones en Construcción_, capítulo 1

Hoy: **una** guía de tres pasos (`concepto → práctica → recall`).

Propuesta V2 — cuatro experiencias guiadas:

```
1 · El cuerpo sabe antes que la mente
    INTRO      · «Vamos a mirar algo que ya te pasa todos los días.»
    PASSAGE    · pasaje anclado (el anchor que ya existe)
    CONCEPT    · confirmar la idea
    RECALL     · pregunta con respuesta correcta

2 · Escucharte por dentro
    PRACTICE   · el ejercicio del catálogo (ya existe)
    REFLECTION · «¿Qué notaste en el cuerpo?» → entrada cifrada
    RESONANCE  · ofrecer «eec-cuerpo-antes-que-mente»

3 · Respirar antes de seguir
    AUDIO      · audio breve de respiración pautada
    QUESTION   · «¿Cómo llegaste y cómo estás ahora?»

4 · Síntesis
    SUMMARY    · qué recorriste, sin puntaje ni evaluación
```

Lo que ya existe y se reusa tal cual: el anchor (GR-4), el concepto
(`CHAPTER_CONCEPTS`), la práctica del catálogo, el ítem de recall, el ejercicio
de respiración (`CHAPTER_EXERCISES`), el ciclo ARC.

Lo que falta: varios conceptos por capítulo, y los seis tipos de paso nuevos.

### 4.6 Ejemplo — _Parejas que perduran_, capítulo 1 (orden de plataforma 2)

Hoy: una guía de tres pasos.

Propuesta V2 — dos experiencias guiadas, deliberadamente cortas:

```
1 · El contacto sostenido en silencio
    PASSAGE    · el pasaje aprobado por el autor
    CONCEPT    · confirmar la idea
    RECALL     · pregunta con respuesta correcta

2 · Diez minutos de contacto
    PRACTICE   · el ejercicio del capítulo
    REFLECTION · «¿Qué apareció mientras lo hacían?»
    RESONANCE  · ofrecer «pqp-c1-contacto-sostenido»
```

**Dos advertencias editoriales que no se pueden perder:**

1. El capítulo 1 del libro es `chapterOrder = 2` en la plataforma (el manifest
   de ingesta le dio el 1 al prefacio). Cualquier catálogo de experiencias guiadas
   tiene que respetarlo o se ancla al prefacio.
2. La edición es OCR sin finalizar (`SOURCE_QUALITY=OCR_UNFINALIZED`). Los
   anchors **se revalidan** tras el reemplazo por el máster. Multiplicar los
   anchors por diez multiplica ese trabajo por diez — es un costo real de V2, no
   un detalle.

---

## 5. Qué ve el usuario

### Antes

1. Entra al capítulo. Cae en el texto.
2. Ve cuatro pestañas. No sabe qué hay detrás de cada una hasta pulsarla — o,
   desde V1, sabe que las vacías están deshabilitadas.
3. Si hay guía, ve una pestaña «🌱 Experiencia guiada» con badge «Guía breve» y
   alcance «1 idea del capítulo».
4. La hace: portada → clip → pasaje → práctica → recall → feedback → cierre.
5. Termina. La pestaña vuelve a verse igual que antes de empezar.
6. Si abre el capítulo en otro dispositivo, la guía empieza de cero.

### Después

1. Entra al capítulo. Ve **el recorrido**: qué modos hay, cuáles tienen algo,
   cuáles ya hizo.
2. Elige por dónde entrar. Ningún modo miente sobre lo que tiene.
3. Si abre Experiencias, ve **la lista** — no una guía, sino de una a diez
   experiencias guiadas con su estado.
4. Entra a una. Los pasos son los que esa experiencia guiada declara: puede haber
   video en una y solo texto en otra.
5. Al terminar, la experiencia guiada queda marcada y el índice avanza. El
   capítulo muestra `COMPLETED` en el modo cuando corresponde.
6. **Pendiente de decisión (§9, D2):** si la reanudación cruza dispositivos.

### Lo que sigue viéndose igual — a propósito

- El texto del libro es el centro del modo Libro. No se convierte en tarjetas.
- Nada obliga a hacer una experiencia para leer.
- Ninguna pantalla muestra un puntaje, un nivel ni una evaluación de la persona.

---

## 6. Cómo se conecta con señales

**Sin implementar.** Esta sección describe qué señal correspondería a qué acto,
y sobre todo **cuáles NO deben existir**.

### 6.1 Vocabulario de eventos hoy

Ocho tipos V1, todos con idempotencia server-derived y escritura única por
`LearningEventRepository`:

```
unit_opened · unit_completed · concept_explored
guide_session_started · guide_session_completed
active_recall_attempted · practice_completed
chapter_media_completed
```

### 6.2 Qué señal produciría cada modo

| Familia      | Acto de la persona                        | Señal candidata                            | Nota                                                   |
| ------------ | ----------------------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| `READ`       | Abrir el capítulo                         | `unit_opened` (existe)                     | —                                                      |
| `READ`       | Marcar el capítulo como leído             | `unit_completed` (existe)                  | —                                                      |
| `AUDIO`      | Terminar un audiolibro o podcast          | `chapter_media_completed` (existe)         | Granularidad de finalización, no de reproducción       |
| `VIDEO`      | Terminar un video                         | `chapter_media_completed` (existe)         | Igual                                                  |
| `GUIDED`     | Empezar / terminar una experiencia guiada | `guide_session_started/completed` (existe) | **Una sesión por experiencia guiada**, no por capítulo |
| `GUIDED`     | Confirmar un concepto                     | `concept_explored` (existe)                | —                                                      |
| `GUIDED`     | Responder un recall                       | `active_recall_attempted` (existe)         | Corregido server-side                                  |
| `ACTIVITY`   | Completar una práctica                    | `practice_completed` (existe)              | Autoinforme, declarado como tal                        |
| `ACTIVITY`   | Completar una respiración                 | — **ninguna**                              | Ver 6.4                                                |
| `REFLECTION` | Guardar una reflexión                     | — **ninguna nueva**                        | El `DiaryEntry` ya existe; el evento sería redundante  |

**Observación importante:** el vocabulario de ocho eventos **alcanza** para todo
V2 excepto por un punto — hoy una sesión de guía es «la guía del capítulo». Con
N experiencias guiadas, cada una necesita su propia sesión. Eso no requiere un tipo
de evento nuevo; requiere que el `guideKey` identifique la experiencia guiada y no
el capítulo. **Es la decisión de modelado más importante de V2** (§9, D4).

### 6.3 Dónde aterrizan las señales

Todas al **LearningDashboard** (Mi Evolución). Ninguna al Mapa Emocional. Esa
frontera ya está escrita, probada con ratchets y desplegada; V2 no la mueve.

### 6.4 Señales que este diseño decide NO crear

- **Tiempo de escucha / porcentaje de video.** Granularidad de finalización y
  nada más. Un mapa de calor de atención es vigilancia, no acompañamiento.
- **Reintentos de recall.** El intento se registra; contar cuántas veces alguien
  se equivoca antes de acertar produce un dato cuyo único uso natural es
  juzgarla.
- **Tiempo por paso.** Sirve para diagnóstico de producto y para nada bueno en
  la vida de la persona. Si algún día hace falta, va agregado y anónimo a
  Pulso, nunca al perfil.
- **Abandono de experiencia guiada.** Salir de una experiencia no es un dato sobre
  quien sale.
- **Cualquier evento derivado del contenido del Diario o de Eco.** El texto es
  suyo. El firewall no se toca.

---

## 7. Relación con el Mapa Emocional

Tres clases de señal, y solo una entra al mapa.

### 7.1 Explicit signals — **sí entran**

Actos donde la persona **declara algo sobre sí misma**, sabiendo que lo declara.

| Señal                               | Modelo   | Existe hoy                  |
| ----------------------------------- | -------- | --------------------------- |
| Registro de ánimo                   | —        | ✅                          |
| Micro-checkin (6 ítems, escala 0–4) | `CHK-S1` | ✅                          |
| Resonancia confirmada               | `ARC-C1` | ✅                          |
| Tema marcado como importante        | `ARC-P1` | ✅                          |
| Análisis local del texto (opt-in)   | `TXT-L1` | ✅ descriptivo-only bajo V2 |

**V2 no añade ninguna clase nueva de señal explícita.** Añade **ocasiones**: una
experiencia guiada con paso `RESONANCE` es un momento más donde la persona puede
confirmar algo — y sigue siendo un toque explícito, revocable y con procedencia
visible.

### 7.2 Interaction signals — **no entran al mapa**

Confirmar un concepto, completar una práctica, responder un recall, terminar un
video. Son señales de **aprendizaje**: describen el recorrido por el material,
no el estado de la persona. Van a Mi Evolución.

El caso tentador es `CONCEPT_EXPLORATION`: parece una declaración («esto me
habla»). No lo es — es «leí esto y sigo». Por eso el ciclo ARC existe: si algo
resonó de verdad, hay un acto **distinto** para decirlo.

### 7.3 Behavior signals — **no entran a ninguna parte como perfil**

Tiempo de lectura, racha, minutos escuchados, número de highlights, mensajes a
Eco. Miden uso. Nunca describen a nadie.

Ya están desactivadas como fuente del mapa bajo `EMOTIONAL_MAP_V2` (default
**on** desde Fase G) y viven en Mi Evolución. V2 no las revive.

> **Nota de mantenimiento:** [`learning-vs-emotional-map.md`](learning-vs-emotional-map.md)
> todavía dice que `EMOTIONAL_MAP_V2` está «off por default». Quedó desactualizado
> tras la Fase G (`shared/flags.ts` lo tiene en `default: true`). No lo corrijo
> aquí porque este bloque pide cero cambios de código; queda como tarea de
> housekeeping.

### 7.4 La regla que resume las tres

> **Nada entra al Mapa Emocional silenciosamente.** Si la persona no puede
> señalar el momento en que lo dijo, no es una señal del mapa.

---

## 8. Qué NO hacer

Prohibiciones de diseño. No son preferencias.

### No inferir emociones

- Ni del texto de una reflexión, ni de una conversación con Eco, ni del ritmo
  de lectura, ni de la elección de modo, ni del abandono de un paso.
- El único ánimo que la plataforma conoce es el que la persona registró.

### No diagnosticar

- Sin etiquetas clínicas, sin escalas de severidad, sin «tu nivel de X».
- Los instrumentos que inspiran los micro-checkins (TMMS-24, SCS-SF, MAAS) están
  **adaptados**, no administrados. No son un test y no se presentan como uno.
- Los EWS (`EWS-R1`) siguen fuera del wire público (`EMOTIONAL_MAP_EWS_PUBLIC`
  default off): sensibilidad 40 % no se le muestra a nadie como advertencia.

### No convertir la plataforma en terapia automática

- Una experiencia guiada no es una intervención. No promete resultado clínico.
- Eco acompaña la conversación presente; no interpreta a la persona ni le dice
  cómo está.
- El flujo de crisis existente permanece **separado** de todo esto y no se
  fusiona con ninguna señal de recorrido.

### Y tres específicas de V2

- **No gamificar.** Sin puntos, sin insignias, sin rachas de experiencias. Un
  recorrido no es un score.
- **No inventar contenido.** Ni conceptos, ni preguntas de recall, ni prácticas.
  El autor selecciona; ingeniería no redacta afirmaciones psicológicas. Diez
  experiencias guiadas son diez aprobaciones editoriales, no diez plantillas.
- **No bloquear la lectura.** Ninguna experiencia guiada es requisito para leer el
  capítulo siguiente.

---

## 9. Decisiones abiertas (requieren a Jorge)

Ninguna se puede resolver escribiendo código primero.

| #      | Decisión                                                                                                                                           | Recomendación                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **D1** | ¿El recorrido del capítulo es pantalla previa o panel dentro del lector?                                                                           | Panel plegable — evita un salto más antes de leer                        |
| **D2** | ¿La reanudación cruza dispositivos? Hoy no (`CROSS_DEVICE_RESUME_V1=false`) y con 10 pasos duele.                                                  | Sí, pero es un endpoint de lectura nuevo — fuera del alcance de este doc |
| **D3** | ¿Continuidad entre modos (minuto 12 del audio → bloque del texto)?                                                                                 | Deseable, no v1 de V2: exige mapear segmentos a bloques                  |
| **D4** | ¿`guideKey` identifica la experiencia guiada o el capítulo?                                                                                        | La experiencia guiada. Es la decisión de modelado central                |
| **D5** | ¿`REFLECTION` se completa por autoinforme o por confirmación del cliente?                                                                          | Autoinforme (§4.4)                                                       |
| **D6** | ¿Varios conceptos por capítulo en `CHAPTER_CONCEPTS`, o catálogo nuevo?                                                                            | Extender el existente; las `key` ya persistidas son inmutables           |
| ~~D7~~ | ~~¿Cuántas experiencias guiadas por capítulo?~~ **Resuelta** — `VALID_GUIDED_EXPERIENCE_COUNT=0_TO_N`; 3–5 es recomendación editorial, no contrato | Ver [brief §0.6](../design/book-experience-v2-design-brief.md)           |
| **D8** | ¿Los medios dentro de una experiencia guiada reusan Chapter Media o son otro catálogo?                                                             | Reusar. Un segundo catálogo de medios es exactamente lo que V1 prohíbe   |

---

## 10. Riesgos

**Editorial, no técnico.** El cuello de botella de V2 no es el renderer: es que
cada experiencia guiada necesita idea aprobada, pasaje anclado, práctica redactada
y pregunta de recall con respuesta correcta. Pasar de 2 guías × 3 pasos a 10
capítulos × 4 experiencias guiadas es multiplicar por ~26 el trabajo del autor.

**Anchors sobre OCR sin finalizar.** Parejas se revalida entero al llegar el
máster. Con más anchors, más revalidación.

**Estado local con recorridos largos.** Diez pasos sin reanudación entre
dispositivos es una experiencia frágil. D2 deja de ser opcional si los
recorridos crecen.

**Deriva del firewall.** Once tipos de paso son once oportunidades de que algo
se cuele al mapa «porque parece emocional». Los ratchets existentes
(`emotional-map.v2-contract.spec.ts`, `copy-contract.spec.ts`) siguen siendo la
defensa, y hay que extenderlos con cada tipo nuevo.

---

## 11. Change Log

| Fecha      | Versión | Cambio                                                                                                                                                                                                                                                                                                                              |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-03 | 0.1     | Discovery inicial. Inventario verificado contra el repo, modelo mental V2, arquitectura de cinco superficies, cuarto estado `COMPLETED`, modelo dinámico de experiencias con once tipos de paso, mapeo de señales, frontera con el Mapa Emocional, prohibiciones y ocho decisiones abiertas. Sin código, sin tablas, sin endpoints. |
