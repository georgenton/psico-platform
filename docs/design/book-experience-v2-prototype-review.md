# Book Experience V2 — revisión del prototipo de Claude Design

```
BOOK_EXPERIENCE_V2_PROTOTYPE_REVIEW_VERSION=1.0
STATUS=IN_REVIEW
SOURCE=CLAUDE_DESIGN_EXPORT
IMPLEMENTATION_AUTHORIZED=false
PRODUCTION_CHANGED=false
```

Este documento audita el prototipo visual que Jorge trajo de Claude Design contra
la documentación oficial de Book Experience V2. **No autoriza implementación.** El
HTML es una referencia de diseño; no es código de producción y no debe copiarse a
`apps/web`.

Autoridad documental (orden de lectura, definido en el brief §0.2):

```
1. docs/design/book-experience-v2-design-brief.md
2. docs/product/book-experience-v2-user-journeys.md
3. docs/product/book-experience-v2-product-spec.md
4. docs/product/book-experience-v2-design.md
```

Runtime vigente, solo como referencia de lo que hoy existe:

```
5. docs/product/book-experience-standard-v1.md
6. docs/product/guided-reading-v1.md

V1=RUNTIME_ACTUAL
V2=OBJETIVO_VISUAL
```

El HTML **no** es una autoridad superior a estos documentos. Donde el prototipo y
la documentación no coinciden, manda la documentación y el prototipo se corrige.

---

## 1. Qué llegó y dónde vive

El paquete quedó en `docs/design/assets/book-experience-v2/`:

| Archivo                   | Rol                                  | Bytes  |
| ------------------------- | ------------------------------------ | ------ |
| `Book Experience V2.html` | Punto de entrada — 11 pantallas      | 94 583 |
| `book-v2/style.css`       | Hoja de estilo del prototipo         | 35 201 |
| `colors_and_type.css`     | Tokens de Psico Platform (importada) | 11 118 |

Hashes en `SHA256SUMS` y `PROTOTYPE_MANIFEST.json`. El SHA-256 del HTML es
`7805b000e44af0bc2cf3be418208ebfdf98f2e10d3e055f4af6ecdacebefd797`, idéntico al
del archivo que Jorge descargó: **el original no se tocó**.

### 1.1 Dos correcciones de procedencia, dichas explícitamente

**El paquete llegó incompleto.** La descarga manual trajo solo el HTML. Ese HTML
hace `<link rel="stylesheet" href="book-v2/style.css">`, y esa hoja a su vez hace
`@import url("../colors_and_type.css")`. Sin las dos, el prototipo carga pero se
renderiza **sin ningún estilo** y la auditoría visual no significaría nada. Ambas
se leyeron del mismo proyecto de Claude Design (_Psico Platform Design System_,
`019e08a5-fedf-77ed-8bcc-e4bcf7210128`) y se colocaron en las rutas que el propio
HTML declara. No se editó ni se reformateó nada de lo descargado.

**La carpeta llegó con un nombre corrupto.** Estaba en
`docs/design/assets/assets:book-experience-v2:/` — artefacto de Finder cuando se
teclea una ruta con `/` como nombre de carpeta. Se movió a la ruta canónica que el
brief §10 declara (`docs/design/assets/book-experience-v2/`) sin tocar el archivo.

También existe en el proyecto de diseño un `bundles/Book Experience V2 (standalone).html`
que no se importó. Si en algún momento se quiere un artefacto de un solo archivo,
sale de ahí — pero el entry file de esta revisión es el que Jorge trajo.

---

## 2. Seguridad y portabilidad

```
EXTERNAL_NETWORK_DEPENDENCIES=1
TRACKING_CODE_PRESENT=false
HARDCODED_SECRET_PRESENT=false
PII_PRESENT=false
PRODUCTION_API_CALLS_PRESENT=false
PROTOTYPE_REVIEW_STATUS=CLEARED
```

Barrido estático sobre el HTML: cero `fetch`, cero `XMLHttpRequest`, cero
`WebSocket`, cero `localStorage`/`sessionStorage`/`document.cookie`, cero `<form>`,
cero `<iframe>`, cero analytics. Un solo `<script>` inline (~70 líneas) que hace
únicamente conmutación de pestañas, estados y escala del marco. Los 21 `href` del
documento son anclas `#ic-*` a los `<symbol>` SVG del propio archivo.

La única dependencia externa entra por `colors_and_type.css`, que importa la
familia Geist desde `fonts.googleapis.com`. Es la misma decisión que ya vive en el
resto de prototipos del design system, no toca datos y degrada limpio: la pila de
fallback (`-apple-system`, `system-ui`) hace que el prototipo se vea correcto sin
red. **No conviene convertirla en dependencia productiva**: `apps/web` ya carga
Geist por el paquete npm `geist`, sin CDN.

Nada se ejecutó contra producción, no se envió ningún formulario y no se usó
ninguna credencial.

---

## 3. Se sirvió y se abrió de verdad

```
PROTOTYPE_LOADS_LOCALLY=true
CONSOLE_FATAL_ERRORS=0
CONSOLE_WARNINGS=0
PAGE_5XX=0
```

Servido con `python3 -m http.server` sobre la carpeta del prototipo, sin añadir
ninguna dependencia al repositorio y sin tocar `package.json`. Los tres archivos
devuelven 200. El servidor se apagó al terminar.

---

## 4. Inventario visual real

Once pantallas navegables. Las nueve del brief §2 están todas, y hay dos de más
que no estaban pedidas y que resultan ser lo más útil del paquete.

```
SCREEN_CHAPTER_HOME=present
SCREEN_READER=present
SCREEN_AUDIOBOOK=present
SCREEN_PODCAST=present
SCREEN_VIDEO=present
SCREEN_GUIDED_LIST=present
SCREEN_EXPERIENCE_PLAYER=present
SCREEN_COMPLETION_SUMMARY=present
SCREEN_EMOTIONAL_MAP=present
```

| #   | Pantalla del brief      | En el prototipo     | Estados dibujados                                                                                               |
| --- | ----------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | Chapter Home            | `Chapter Home`      | Con datos · Vacío · Cargando · Completado                                                                       |
| 2   | Reader                  | `Reader`            | Con datos · Completado                                                                                          |
| 3   | Audiobook               | `Escuchar`          | En curso · Próximamente · Cargando · Error                                                                      |
| 4   | Podcast                 | `Podcast`           | Con datos · Vacío                                                                                               |
| 5   | Video                   | `Ver`               | Con datos · Cargando · Oculto                                                                                   |
| 6   | Guided Experiences list | `Experiencias`      | 4 · 1 · 10 · 0 experiencias                                                                                     |
| 7   | Experience Player       | `Experience Player` | 6 tipos de paso · Cargando media · Otro dispositivo                                                             |
| 8   | Completion Summary      | `Cierre`            | Con oferta · Sin oferta · Resonancia confirmada                                                                 |
| 9   | Emotional Map evolution | `Tu mapa`           | Con datos · Sin señal · Cargando                                                                                |
| —   | _(extra)_               | `Casos`             | Emociones (4 experiencias) vs Parejas (2) lado a lado                                                           |
| —   | _(extra)_               | `Sistema`           | Chips, indicador de posición, tres tratamientos de señal, medios, lenguaje prohibido, comportamiento responsive |

Las dos pantallas extra merecen mención aparte. `Casos` demuestra el punto que más
cuesta transmitir —que ningún layout asume una cantidad— poniendo dos capítulos
reales en paralelo: 20 min con 4 experiencias contra 43 min con 2. `Sistema` es un
contrato de lenguaje dibujado: lista los términos prohibidos junto a su reemplazo
correcto. Ninguna de las dos estaba pedida y las dos deberían sobrevivir.

---

## 5. Matriz de cumplimiento UX

### 5.1 Separación real de modalidades — **cumple**

| Criterio                                                | Veredicto |
| ------------------------------------------------------- | --------- |
| Reader no repite el reproductor completo                | ✅        |
| Audiobook no repite el libro completo                   | ✅        |
| Podcast no repite el libro completo                     | ✅        |
| Video no repite el libro completo                       | ✅        |
| Experience Player no deja el libro de fondo obligatorio | ✅        |

Cada modalidad es una superficie propia. El Player ocupa la pantalla entera con
`background: var(--gradient-hero)` y un solo paso visible; el libro no está detrás.

Y lo más importante: **Podcast es subformato dentro de Escuchar, no pestaña de
primer nivel**. El prototipo lo dice literalmente en la pantalla y lo dibuja: el
selector `Audiolibro | Podcast` vive dentro de la rama Escuchar. Eso coincide
exactamente con `audioFamilyMode` tal como quedó en PR #616.

### 5.2 Contenido dinámico — **cumple**

```
AUDIO_ITEMS=0_TO_N        ✅ dibujado 0 y N
PODCAST_EPISODES=0_TO_N   ✅ dibujado 0 y 2
VIDEO_ITEMS=0_TO_N        ✅ playlist «1..N — nunca tres fijos»
GUIDED_EXPERIENCES=0_TO_N ✅ dibujado 0, 1, 4 y 10
EXPERIENCE_STEPS=1_TO_N   ✅ dibujado 1, 2, 3, 4 y 5 pasos
```

El caso de 1 experiencia se resolvió bien: la card ocupa el ancho completo y no se
acompaña de huecos ni de «próximamente» inventados. El de 10 no se lee como deuda
(«3 de 10 recorridas — recorrido, no deuda. Sin "te faltan 7"»).

### 5.3 Estados — **parcial**

```
UNKNOWN_IS_NOT_COMING_SOON=true   ✅ enunciado y dibujado en Sistema
UNKNOWN_CONTENT_IS_HIDDEN=true    ✅ «Cero experiencias ⇒ la pestaña no existe»
```

Lo conceptual está resuelto y bien. Lo que falta es cobertura:

| Estado       | Pantallas que lo dibujan   |
| ------------ | -------------------------- |
| Con datos    | 9 de 9                     |
| Vacío        | 5 de 9                     |
| Cargando     | 5 de 9                     |
| Próximamente | 2 de 9                     |
| Completado   | 3 de 9                     |
| **Error**    | **1 de 9** (solo Escuchar) |

El brief §2.1 es explícito: «No tres. Los que se olvidan son los que aparecen en
producción». El error de Escuchar está muy bien escrito («No pudimos preparar el
audio. Puede ser la conexión. El texto del capítulo sigue disponible mientras
tanto»), y precisamente por eso se nota que las otras ocho pantallas no lo tienen.

### 5.4 Experiencia guiada — **cumple con una reserva**

| Criterio                                             | Veredicto                   |
| ---------------------------------------------------- | --------------------------- |
| Colección dinámica                                   | ✅                          |
| Player de pasos dinámicos                            | ✅                          |
| Salida y reanudación                                 | ✅                          |
| Progreso discreto                                    | ✅ puntos, nunca porcentaje |
| No asume la secuencia fija V1                        | ✅                          |
| No presenta cada pantalla como checkpoint persistido | ✅                          |
| Completion Summary sin evaluación personal           | ✅                          |

`Salir` está en todos los pasos con la misma frase («Tu avance queda guardado») y
no compite visualmente con `Continuar`. El estado `Otro dispositivo` dice la verdad
incómoda antes de que cueste: «Por ahora el avance no viaja entre dispositivos, así
que empezarías desde el primer paso. Son 3 pasos, ~5 min» — y lo dice **antes** de
invertir los diez minutos, que es exactamente `CROSS_DEVICE_RESUME_V1=false` bien
comunicado.

El paso `RECALL` no puntúa: «Sin puntaje, sin "acertaste 2 de 3". El feedback es
inmediato, ocurre en el paso, y ahí se acaba». El `RESONANCE` da a las dos salidas
el mismo peso visual y lo declara.

La reserva: la lista numera `1..N` y el Cierre ofrece «Siguiente experiencia». El
prototipo aclara que el candado de la síntesis es la única dependencia admitida,
pero la numeración más ese CTA se pueden leer como secuencia obligatoria (§6, P2).

### 5.5 Medios — **cumple**

| Criterio                                          | Veredicto                                                |
| ------------------------------------------------- | -------------------------------------------------------- |
| Audio como contenido principal                    | ✅                                                       |
| Transcript secundario                             | ✅ «Acompaña, no sustituye»                              |
| Podcast diferenciado del audiolibro               | ✅ «la conversación sobre el capítulo — no su narración» |
| Ningún medio marcado como existente sin evidencia | ✅ marca `MAQUETA`                                       |
| Estados «próximamente» honestos                   | ✅                                                       |

Lo mejor del paquete en esta dimensión: **todo medio falso lleva encima la marca
`MAQUETA`**, y la regla «sin máster reproducible no hay botón de reproducción» está
dibujada como marco reservado sin play. Eso cierra de raíz el defecto que PR #616
tuvo que arreglar en código: un `PUBLISHED` sin nada reproducible que se veía como
disponible.

También acierta al separar el **video del capítulo** (superficie Ver) del **video
inline** (bloque dentro del texto): «son dos cosas y no comparten estado».

### 5.6 Signal Model y Mapa Emocional — **cumple en el modelo, falla en el radar**

```
BEHAVIOR_IS_NOT_EMOTION=true       ✅ enunciado literal en Sistema
NO_AUTOMATIC_EMOTION_INFERENCE=true ✅
NO_DIAGNOSIS=true                   ✅
NO_EMOTIONAL_SCORE=true             ⚠️ ver P0
```

Nota de precisión sobre el pedido de auditoría: se pidió verificar cinco
categorías de señal (`EXPLICIT / INTERACTION / BEHAVIOR / CONTEXT / EDITORIAL`).
El product-spec §4 define **tres**, no cinco: Explicit, Interaction, Behavior. El
prototipo dibuja exactamente esas tres y las nombra igual —«Explícita · la persona
lo declaró», «Interacción · estado del recorrido», «Comportamiento · no se
muestra»—, así que **cumple con la especificación real**. El contexto editorial sí
aparece, aunque no como categoría de señal sino como lo que es: la nota «Edición
provisional» en Casos y la marca `MAQUETA` en los medios.

Las tres propiedades obligatorias de toda señal explícita (spec §4.1) están
dibujadas: momento señalable, procedencia visible y revocable. La tarjeta de
resonancia muestra «Confirmado por ti · Emociones en Construcción, Cap. 1 · 3 ago»
con `Quitar` a un toque, no escondido en un menú.

Y la separación aprendizaje/mapa está dicha en la propia pantalla: «Tu recorrido
por los libros vive en Mi Evolución. Aquí no hay porcentaje global, ni ejes
alimentados por actividad».

**Lo que falla es el radar.** Ver P0 en §6.

Barrido de lenguaje prohibido contra los quince términos que vigila
`apps/api/src/emotional-map/copy-contract.spec.ts`: **cero apariciones como copy de
producto**. Los dos aciertos («comprensión emocional», «puntaje») están dentro de
frases que niegan el término, y la pantalla `Sistema` lista el resto a propósito
como catálogo de antipatrones. Eso es correcto en un prototipo y es una trampa al
implementar (§6, P2).

### 5.7 Continuidad visual — **cumple**

El prototipo importa `colors_and_type.css`, o sea que no re-inventa la paleta: usa
los mismos tokens que `apps/web/src/app/globals.css`. Lavender para navegación y
progreso, sage para acción y para lo recorrido, warm para superficie y texto.
Tipografía Geist con `--font-mono` reservado para metadata, que es la convención ya
establecida en el dashboard V2.

No copia V1 al pie de la letra: la barra de modos como píldoras, el marco reservado
punteado y el chip de procedencia son lenguaje nuevo, pero construido con los mismos
tokens. Es continuidad, no clonación.

---

## 6. Hallazgos clasificados

```
P0_FINDINGS=1
P1_FINDINGS=3
P2_FINDINGS=5
P3_FINDINGS=4
```

### BLOCKERS_BEFORE_IMPLEMENTATION

**P0-1 — El radar inventa dos ejes y elimina dos que sí se miden.**

El hexágono de `Tu mapa` tiene estos vértices:

```
Claridad · Calma · Propósito · Conexión · Energía · Descanso
```

Los seis ejes del modelo en producción (`apps/web/src/components/dashboard/mapa/MapRadar.tsx:28-33`)
son:

```
calma · claridad · conexion · proposito · compasion · consciencia
```

**Energía** y **Descanso** no existen. Ningún modelo del registry los produce:
`CHK-S1` mide claridad, compasión y consciencia; `OU-GT` produce calma; `ARC-C1` y
`ARC-P1` producen conexión y propósito. Y el prototipo no deja el número en blanco:
escribe **«Energía 61 · Tu check-in de ayer»**, atribuyendo un valor a un check-in
que no existe para ese eje. Al mismo tiempo desaparecen **Compasión** y
**Consciencia**, que sí se miden.

En la misma pantalla, «Conexión 50 · Tus resonancias» tampoco cuadra: bajo `ARC-C1`
la conexión es conceptos confirmados distintos sobre 4, y la pantalla muestra tres
resonancias — 75 %, no 50 %.

Por qué es bloqueante y no cosmético: implementar el radar como está dibujado
obliga a una de dos cosas, y las dos son la clase de defecto que el programa V2
completo (Fases A–H) existe para cerrar. O se fabrican dos ejes sin modelo detrás
—un número emocional inventado, `NO_EMOTIONAL_SCORE`—, o se re-etiquetan Compasión
y Consciencia como Energía y Descanso, con lo cual la línea de procedencia que
aparece debajo del número es falsa. `emotional-map.v2-contract.spec.ts` y
`copy-contract.spec.ts` están puestos justamente ahí.

**Qué pedirle al diseño:** los seis ejes con sus nombres reales, y que el número de
cada uno salga del modelo que la línea de procedencia declara. Los estados
punteados ya están bien resueltos («Los ejes punteados no valen cero: todavía no
tienen señal») — solo hay que aplicarlos a los ejes correctos.

### IMPORTANT_DESIGN_REVISIONS

**P1-1 — El estado de error está dibujado en 1 de 9 pantallas.**
Escuchar tiene un error excelente. Reader, Podcast, Ver, Experiencias, Experience
Player, Cierre, Chapter Home y Tu mapa no tienen ninguno. El brief §2.1 pide seis
estados por pantalla precisamente porque «los que se olvidan son los que aparecen
en producción». `Cargando` también falta en 4 de 9. Sin esos estados, quien
implemente los va a improvisar, y el patrón de improvisación es el spinner
genérico o el esqueleto que insinúa contenido que quizá no existe — lo que el
propio prototipo prohíbe.

**P1-2 — No hay ninguna superficie de crisis.**
El panel Eco del lector está dibujado con una conversación de ejemplo, pero no
existe ninguna maqueta de qué pasa cuando la persona escribe algo que dispara la
detección de crisis. Ese flujo existe en producción (`EcoService`, dos capas de
detección, `CrisisModal` con `tel:`) y es la superficie con más consecuencia de
todo el producto. El brief no lo pidió explícitamente, pero un rediseño del panel
Eco que no lo contemple deja al implementador decidiendo solo cómo se ve lo más
delicado.

**P1-3 — El panel compañero no está dibujado en mobile.**
`Sistema` especifica el comportamiento con precisión: «Mobile · 390 — panel como
bottom sheet; el texto sigue visible detrás. Con el panel abierto, el selector de
modos se oculta». Es la conducta responsive mejor especificada del documento y no
tiene ninguna maqueta: las tres pantallas mobile son Chapter Home, Experience
Player y Tu mapa. Ninguna muestra el sheet, ni abierto ni cerrado. La diferencia
drawer/sheet es justamente lo que el brief §2.2 pide mantener como distinción
idiomática.

### OPTIONAL_REFINEMENTS

**P2-1 — Accesibilidad semántica ausente.** 172 controles en el artefacto; 26 sin
nombre accesible (los de solo ícono: volver, ajustes, transporte del reproductor,
ⓘ de cada eje). El documento entero tiene 2 `role` y 2 `aria-label`. Los selectores
de modo y de subformato se ven como pestañas pero no lo son semánticamente. No hay
ni una regla `:focus` en la hoja de estilo — el foco queda en el default del
navegador (nada pone `outline:none`, así que no está roto, pero tampoco está
diseñado). El código que ya existe es más accesible que el prototipo:
`ChapterMediaListen` usa `role="tab"`, `aria-selected`, `aria-disabled`. **Al
implementar, la semántica del código manda sobre la del prototipo.**

**P2-2 — Las frases-negación citan literalmente términos prohibidos.** «Aquí no hay
porcentaje global, ni "comprensión emocional"…» y «Sin puntaje, sin "acertaste 2 de
3"». En el prototipo son correctas y didácticas. Copiadas literales a un componente
real rompen `copy-contract.spec.ts`, que hace búsqueda de subcadena sin entender la
negación. No es un problema de diseño; es una trampa de copiar y pegar.

**P2-3 — La numeración `1..N` más «Siguiente experiencia» pueden leerse como
secuencia obligatoria.** El prototipo declara que el candado de la síntesis es la
única dependencia admitida, pero el ordinal en cada card y el CTA de avance
sugieren un curso. Vale la pena resolverlo visualmente, no solo con una nota.

**P2-4 — Tablet no tiene ninguna pantalla propia.** El brief §8 especifica su
comportamiento y la hoja de estilo tiene overrides `[data-bp="tablet"]`, pero
ninguna de las once pantallas se diseñó para 1024. Es desktop encogido. Funciona
—cero desbordamiento medido— pero no es una decisión, es una consecuencia.

**P2-5 — «48 %» de lectura convive con «nunca una barra con porcentaje».** Son dos
cosas distintas: la posición en el capítulo y el avance en una experiencia. El
prototipo prohíbe el porcentaje para lo segundo y lo usa para lo primero sin decir
que son cosas separadas. Conviene decirlo en `Sistema`.

**P3-1 — Dos de los doce tipos de paso no se dibujan.** `EXAMPLE` (familia CONTENT)
y `VIDEO` (familia MEDIA) no aparecen en ningún estado del Player. Los otros diez
sí. La anatomía es la misma, así que el riesgo es bajo.

**P3-2 — Dos controles bajo 44 px en mobile.** El breadcrumb de vuelta (34 px) y el
`icon-btn` de la appbar (38 px), mientras `Sistema` promete «áreas táctiles ≥ 44 px».

**P3-3 — Google Fonts es la única dependencia externa.** Documentada en §2. No
convertirla en dependencia productiva.

**P3-4 — Existe un `standalone` sin importar.** `bundles/Book Experience V2
(standalone).html` vive en el proyecto de diseño. No se trajo porque el entry file
de esta revisión es el que Jorge descargó.

---

## 7. Responsive y accesibilidad — medición

Medido en Chrome headless sobre el marco del dispositivo, no sobre la ventana del
navegador, en las once pantallas × tres anchos (33 mediciones):

```
DESKTOP_HORIZONTAL_OVERFLOW=0   (1365x900, 11 de 11)
TABLET_HORIZONTAL_OVERFLOW=0    (1024x768, 11 de 11)
MOBILE_HORIZONTAL_OVERFLOW=0    (390x844,  11 de 11)
```

Criterio: `scroller.scrollWidth <= scroller.clientWidth + 1` dentro del marco, y
`document.documentElement.scrollWidth === window.innerWidth` para el documento.
Ambos limpios en los tres anchos.

| Comprobación                            | Resultado                                                |
| --------------------------------------- | -------------------------------------------------------- |
| Texto sin cortar                        | ✅ `text-wrap: pretty` en titulares y párrafos           |
| Controles dentro del viewport           | ✅ en los tres anchos                                    |
| Navegación sin hover                    | ✅ ningún contenido depende solo de `:hover`             |
| Foco visible                            | ⚠️ default del navegador; 0 reglas `:focus` (P2-1)       |
| Un solo elemento seleccionado por grupo | ✅ modos, subformatos y estados                          |
| Paneles no cubren el contenido          | ✅ drawer reserva ancho; el texto no se mueve al abrirlo |
| Botones con nombre accesible            | ⚠️ 26 de 172 sin nombre (P2-1)                           |
| Áreas táctiles ≥ 44 px                  | ⚠️ 2 controles por debajo (P3-2)                         |
| Contraste                               | ✅ hereda los tokens ya usados en producción             |

Adaptaciones por ancho que sí están resueltas: el drawer pasa de 340 a 290 px en
tablet y desaparece en mobile; `map-grid` y `case-cols` colapsan a una columna; el
reproductor pasa de horizontal a apilado con la portada a ancho completo; la
columna de procedencia de cada eje se oculta en mobile.

---

## 8. Evidencia visual

```
SCREENSHOTS_CREATED=12
ALL_EVIDENCE_HASHED=true
```

En `docs/design/assets/book-experience-v2/evidence/`, con `MANIFEST.json` y
`SHA256SUMS`. Las doce salieron de una sola carga del mismo SHA del prototipo,
recortadas al marco del dispositivo: sin chrome del navegador, sin DevTools, sin
overlays de error, sin PII.

| Archivo                              | Pantalla          | Estado           | Viewport |
| ------------------------------------ | ----------------- | ---------------- | -------- |
| `01-chapter-home-desktop.webp`       | Chapter Home      | Con datos        | 1365×900 |
| `02-reader-desktop.webp`             | Reader            | Con datos        | 1365×900 |
| `03-audiobook-desktop.webp`          | Escuchar          | En curso         | 1365×900 |
| `04-podcast-desktop.webp`            | Podcast           | Con datos        | 1365×900 |
| `05-video-desktop.webp`              | Ver               | Con datos        | 1365×900 |
| `06-guided-list-desktop.webp`        | Experiencias      | 4 experiencias   | 1365×900 |
| `07-experience-player-desktop.webp`  | Experience Player | CONTENT · pasaje | 1365×900 |
| `08-completion-summary-desktop.webp` | Cierre            | Con oferta       | 1365×900 |
| `09-emotional-map-desktop.webp`      | Tu mapa           | Con datos        | 1365×900 |
| `10-chapter-home-mobile.webp`        | Chapter Home      | Con datos        | 390×844  |
| `11-experience-player-mobile.webp`   | Experience Player | CONTENT · pasaje | 390×844  |
| `12-emotional-map-mobile.webp`       | Tu mapa           | Con datos        | 390×844  |

Nota de honestidad sobre dos estados: `Escuchar` no tiene un estado llamado «Con
datos» (su caso feliz se llama «En curso») y `Ver` no tiene uno llamado
«Próximamente» (la ausencia de video se llama «Oculto» y está en otra pantalla del
mismo grupo). El manifiesto registra el estado realmente capturado, no el que se
pidió.

---

## 9. Recomendación de implementación

**El HTML de Claude Design no se copia a Next.js.** Es un explorador de pantallas
con su propio chrome, escalado por `transform`, con estados conmutados por
`display` y clases de un solo uso. Nada de eso sobrevive a un componente React.

### VISUAL_PATTERNS_TO_KEEP

- **La marca `MAQUETA` sobre todo medio falso.** Es el patrón más valioso del
  paquete y se puede llevar tal cual a los sembrados de demo.
- **El marco reservado punteado sin botón de play.** Resuelve visualmente
  `NO_PLAYABLE_ASSET` mejor que el «Audio en producción» que hoy tenemos.
- **Los chips de estado de rama** (Leído / Disponible / En curso / Próximamente /
  Se abre después / Error recuperable / Sin empezar / Maqueta), con la regla de que
  «ausente» no tiene chip: es la falta de la fila entera.
- **El indicador de posición por puntos** del Player. Mismo componente para 2 y
  para 8 pasos, nunca un porcentaje.
- **El chip de procedencia de la resonancia** con `Quitar` visible al lado.
- **La cabecera «Cómo recorrerlo»** del Chapter Home: cuatro filas máximo, las que
  no existen no se listan.

### INTERACTION_PATTERNS_TO_KEEP

- **`Salir` con «Tu avance queda guardado» en todos los pasos**, mismo lugar,
  mismo peso.
- **Un paso `MEDIA` termina cuando termina el medio**, sin `Continuar` que lo
  salte por accidente — pero `Salir` sigue disponible.
- **Las dos salidas del `RESONANCE` con el mismo peso visual.** «Ahora no» no es
  el botón secundario de un embudo.
- **El aviso de `Otro dispositivo` antes de empezar**, no después de perder diez
  minutos.
- **La URL firmada se pide al elegir el formato**, no al abrir la pestaña.

### GENERATED_CODE_TO_DISCARD

Todo. Concretamente: el `<script>` del explorador, el chrome del prototipo
(`.chrome`, `.stage`, `.frame`, `.bp-tag`, `.notes`), el escalado por `transform`,
la conmutación de estados por `data-state`, y las clases de un solo uso
(`.rg-*`, `.gal-*`, `.spec`, `.case-cols`). El sprite de `<symbol>` SVG tampoco:
`apps/web` ya tiene sus íconos.

Lo único con valor de código son los **tokens**, y ya los teníamos: el prototipo
importa `colors_and_type.css`, que a su vez es un espejo de
`apps/web/src/app/globals.css`. No hay nada nuevo que extraer.

### MISSING_PRODUCT_DECISIONS

1. **Los seis ejes del radar** (P0-1). Decisión de producto, no de diseño: o se
   dibujan los seis que existen, o hay que declarar de dónde saldrían Energía y
   Descanso.
2. **Qué se ve cuando Eco detecta crisis** dentro del panel del lector (P1-2).
3. **Estado de error por pantalla** (P1-1): ocho pantallas sin definir.
4. **El bottom sheet en mobile** (P1-3), abierto y cerrado.
5. **Si `EXAMPLE` y `VIDEO` entran en V2** o se quedan fuera del catálogo (P3-1).

### Verticales propuestas — no ejecutar

Cuatro, en este orden, cada una completa antes de empezar la siguiente:

```
Vertical 1: Chapter Home + Reader
Vertical 2: Audiobook + Podcast + Video
Vertical 3: Guided Experiences list + Experience Player
Vertical 4: Completion Summary + integración con el Mapa Emocional
```

La 1 es la que más cambia lo que la persona ve y la que menos backend nuevo pide:
Chapter Home ya se puede armar con el manifest que PR #616 dejó correcto. La 2 se
apoya en `chapter-media` y en el `audioFamilyMode` ya cerrado. La 3 es la más
grande y la que depende de que el catálogo de doce tipos de paso se decida. La 4 es
la que toca el Mapa, y **no debería empezar hasta que P0-1 esté resuelto**.

---

## 10. Change Log

| Fecha      | Versión | Cambio                                                                                                                                                                                                                                                                                            |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-03 | 1.0     | Revisión inicial del export de Claude Design: procedencia y hashes, barrido de seguridad, inventario de 11 pantallas, matriz 5.1–5.7, medición responsive y de accesibilidad, 12 capturas hasheadas, 13 hallazgos (1 P0 · 3 P1 · 5 P2 · 4 P3) y recomendación por verticales. Sin implementación. |
