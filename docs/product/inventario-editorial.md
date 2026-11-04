# Inventario editorial de las tres obras — corte del 2026-11-04

Preparado para la fase **EDITORIAL_FINAL** del roadmap, que llega después de
F3. No la adelanta: deja el inventario hecho para que esa revisión empiece con
hechos en vez de con una auditoría.

Todo lo de abajo está **leído de la base que sirve staging**, no recordado. Los
seis ejes son los que pide el encargo: fuente y versión, autoría acreditada,
estructura, presentación, recursos asociados, y disponibilidad.

---

## Resumen en una pantalla

| | *Emociones en Construcción* | *Familias ensambladas* | *Parejas que perduran* |
|---|---|---|---|
| Fila en el catálogo | sí | sí | **no existe** |
| Publicada | **sí** | no (retirada el 24-10) | — |
| Autoría acreditada | Jorge Quizamanchuro | Jorge Quizamanchuro | — |
| Plan | FREE | PRO | — |
| Capítulos | **10**, en 3 partes | 3, sin partes | — |
| Bloques de texto | 3 385 | 18 | — |
| Énfasis reparado | **732** bloques | 0 (no lo necesitaba) | — |
| Video | 10 bloques, **0 con archivo** | 0 | — |
| Audio narrado | **0 filas** | 0 | — |
| Ejercicios | 11 bloques | 1 | — |
| Pausas de respiración | 10 | 2 | — |
| Sinopsis pública | ⚠️ **un marcador** | texto real | — |

---

## 1 · *Emociones en Construcción* — la única publicada

### Estructura real, que es su mejor carta de presentación

| Parte | | Capítulos |
|---|---|---|
| **I** | Deconstruyendo lo que sabíamos | 1 ¿Realmente sabemos qué es una emoción? · 2 ¿Existen realmente las emociones universales? · 3 Tu cerebro inventa emociones |
| **II** | Construyendo tus emociones | 4 Tu cuerpo tiene la primera palabra · 5 Las historias que te cuentas también influyen en lo que sientes · 6 Sentir también se aprende con otros · 7 Cuando las emociones necesitan traducción |
| **III** | Vivir emocionalmente despierto | 8 Escuchar no es obedecer · 9 Repensar lo que sientes · 10 Lo que enseñamos cuando alguien siente |

Los diez capítulos tienen texto real y agrupación por parte. El énfasis quedó
reparado el 26-10 y sigue convergente: 732 bloques con el formato al lado del
texto, 2 con asterisco —los dos bloqueos editoriales—.

### El hallazgo: la obra publicada muestra un marcador por sinopsis

Bajo «Sobre este libro», el primer párrafo que lee una persona es:

> Sinopsis en revisión editorial.

**Y se sirve en público.** El detalle devuelve ese `summary` sin sesión, y la
pantalla lo pinta primero; debajo aparece la descripción real («Una guía
práctica para entender, nombrar y gestionar tus emociones desde adentro»). El
listado del catálogo **no** expone el campo, así que el marcador sólo asoma al
abrir la obra.

No es un defecto: es exactamente lo que la reparación de autoría del 24-10
decidió dejar. Su sinopsis anterior nombraba a la identidad de fixture, y la
herramienta sustituyó por un **marcador declarado** en vez de reescribir prosa
editorial o vaciar el campo. Su documentación dice que el literal anterior
sobrevive en la preimagen «para quien escriba el reemplazo». **Nadie lo
escribió**, y entre tanto la única obra publicada se presenta con un marcador.

### Por qué NO conviene reponer la sinopsis anterior cambiando el nombre

El literal retirado, recuperado de la preimagen, era:

> «Marina Quintana acompaña al lector en un recorrido por las **seis emociones
> básicas**, con ejercicios cortos al final de cada capítulo.»

Tiene **dos** problemas, no uno. El nombre es el evidente. El otro es peor:
**describe el libro contrario al que existe.** Los capítulos 2 y 3 se titulan
«¿Existen realmente las emociones universales?» y «Tu cerebro inventa
emociones», y la Parte I entera se llama «Deconstruyendo lo que sabíamos». Un
libro cuya primera parte cuestiona que las emociones básicas existan no es «un
recorrido por las seis emociones básicas».

Cambiarle el nombre y reponerla habría publicado una descripción falsa de la
tesis de la obra. Esa es la razón por la que la reparación se negó a reescribir:
no tenía manera de saberlo, y acertó al no intentarlo.

### Propuesta de reemplazo, para tu visto bueno

Derivada **de los títulos de sus propias partes y capítulos**, sin añadir
ninguna afirmación que el libro no haga:

> Un recorrido en tres movimientos: primero desarma lo que creíamos saber sobre
> las emociones —que son universales, que vienen de fábrica—, después muestra
> cómo se construyen entre el cuerpo, las historias que te cuentas y la gente
> con la que creciste, y termina en lo práctico: escuchar lo que sientes sin
> obedecerlo, repensarlo, y acompañar a quien siente. Diez capítulos con
> ejercicios y pausas de respiración.

Lo último es comprobable: 11 bloques de ejercicio y 10 de pausa. Es una
propuesta; la decisión es tuya, y aprobarla es una edición de un campo.

### Lo que falta de esta obra, concretamente

| Qué | Estado |
|---|---|
| Sinopsis pública | ⚠️ marcador · propuesta arriba |
| Audio narrado | ❌ **0 filas**. El reproductor existe y dice «Audio en producción» |
| Video | ❌ 10 bloques preparados, **0 con archivo** |
| Actividades interactivas | ⚠️ 11 bloques de ejercicio son prosa con tarjeta |
| Microguías de C01 | ✅ las **cinco** existen en el catálogo · ❌ sin publicar (ADR 0028) y con el rollout en `off` |
| Los dos bloques excluidos del énfasis | ⏸️ una cita con acento invertido y un ejercicio |

---

## 2 · *Familias ensambladas* — retirada a propósito

Existe, con autoría de Jorge Quizamanchuro y **sin publicar** desde la
reparación del 24-10. Siete puertas que la servían responden 404, y sus tres
capítulos y sus 18 bloques quedan **intactos**: retirada de la oferta, no
borrada. Su sinopsis sí es texto real.

Tiene tres capítulos y **ninguna parte** asignada, frente a los diez en tres
partes del ancla. Si vuelve a la oferta, eso se nota: la lista de capítulos
cae a plano. No es un defecto —el agrupamiento es opcional por diseño— pero sí
una diferencia de acabado que conviene decidir antes de publicar.

**Decisión pendiente:** si vuelve a la oferta, con qué alcance, y si sus tres
capítulos son la obra completa o una primera parte.

---

## 3 · *Parejas que perduran* — ausente

**No tiene fila en el catálogo.** Se dejó ausente a propósito en la reparación
del 24-10: crearla sería inventar catálogo. La landing la nombra como «Aún no
disponible» y no la enlaza, lo que es coherente.

Su autoría declarada el 13-10 es de David Jaramillo, y su edición impresa
puede constituir directamente la autoridad `TEXT_LOCKED` por la excepción de
obra externa ya publicada. Nada de eso está en la base.

**Decisión pendiente:** si entra en el alcance de la salida, y con qué fuente.

---

## Lo que esta revisión no decide

La reparación de autoría y la de formato **no** equivalen a aprobar la
publicación de una obra. Lo de arriba deja los hechos y las propuestas; lo que
se publica, con qué sinopsis y en qué plan, es criterio editorial.

Y una nota de método que vale para la próxima: cada cifra de este documento
viene de una consulta de sólo lectura contra la base que sirve. La primera
versión de una de esas consultas contaba capítulos sin `DISTINCT` sobre un
`JOIN` con bloques y devolvió **3 385 capítulos** para el ancla. Son 10. Una
cifra absurda se detecta; una verosímil y falsa, no — por eso conviene que los
recuentos de este inventario se puedan repetir.
