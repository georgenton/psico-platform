# Book Experience V2 — brief de diseño visual

```
CLAUDE_DESIGN_ENTRYPOINT=true
BOOK_EXPERIENCE_V2_DESIGN_BRIEF_VERSION=1.0
STATUS=READY_FOR_VISUAL_PROTOTYPING
TARGET=CLAUDE_DESIGN
SCOPE=VISUAL_PROTOTYPE_ONLY
REPOSITORY_CHANGES=none
LAST_UPDATED=2026-08-03
RUNTIME_AUTHORITY=false
IMPLEMENTATION_AUTHORIZED=false
PRODUCTION_STATUS=NOT_IMPLEMENTED
V2_PRODUCT_DIRECTION=APPROVED
V2_VISUAL_PROTOTYPE=PENDING_REVIEW
V2_IMPLEMENTATION=NOT_AUTHORIZED
```

Brief para diseñar los prototipos visuales de Book Experience V2.

**Claude Design no modifica el repositorio.** Genera prototipos visuales. Este
documento dice qué diseñar, con qué principios y —sobre todo— qué **no**
diseñar.

---

## 0. Autoridad, precedencia y vocabulario

**Esta sección es canónica.** Los otros documentos V2 apuntan aquí en vez de
repetirla.

### 0.1 Orden de lectura

```
1. docs/design/book-experience-v2-design-brief.md      ← estás aquí
2. docs/product/book-experience-v2-user-journeys.md
3. docs/product/book-experience-v2-product-spec.md
4. docs/product/book-experience-v2-design.md
```

Y **solo para entender la implementación actual**, no para diseñar sobre ella:

```
5. docs/product/book-experience-standard-v1.md
6. docs/product/guided-reading-v1.md
```

### 0.2 Qué manda sobre qué

```
CURRENT_PRODUCTION_RUNTIME_AUTHORITY =
  docs/product/book-experience-standard-v1.md
  docs/product/guided-reading-v1.md

BOOK_EXPERIENCE_V2_VISUAL_DESIGN_AUTHORITY =
  docs/product/book-experience-v2-design.md
  docs/product/book-experience-v2-product-spec.md
  docs/product/book-experience-v2-user-journeys.md
  docs/design/book-experience-v2-design-brief.md
```

**Regla de precedencia:**

```
Para describir la producción actual   → V1
Para diseñar el objetivo futuro       → V2
```

V2 **no ha reemplazado** a la Guide V1. La Guide V1 está en producción, con su
lifecycle intacto. V2 es el diseño de a dónde va.

### 0.3 Estado de aprobación

```
V2_PRODUCT_DIRECTION=APPROVED          ← la dirección está acordada
V2_VISUAL_PROTOTYPE=PENDING_REVIEW     ← es lo que Claude Design produce ahora
V2_IMPLEMENTATION=NOT_AUTHORIZED       ← nadie escribe código todavía
```

No es una propuesta sin discutir, y tampoco una implementación aprobada.

### 0.4 Escenas V1 frente a pasos V2 — reconciliación

Es la confusión más peligrosa de este proyecto, y una decisión de diseño
depende de ella.

```
V1_CHECKPOINT
  el progreso server-owned que existe HOY.
  La Guide V1 tiene tres, y son lo que se persiste.

V1_SCENE
  presentación local dentro de un checkpoint.
  Ocho hoy. NO es un paso persistido.

V2_EXPERIENCE_STEP
  unidad de dominio FUTURA.
  Todavía no está implementada ni persistida.
```

```
EXPERIENCE_STEP_IS_NOT_V1_SCENE=true
VISUAL_SCREEN_IS_NOT_AUTOMATICALLY_A_PERSISTED_STEP=true
V1_LIFECYCLE_UNCHANGED=true
```

**Para el diseño:** se pueden dibujar tantas pantallas como la experiencia
necesite. **Ninguna pantalla implica automáticamente una escritura ni un
checkpoint.** Cuántas de ellas terminan siendo pasos persistidos es una decisión
de implementación posterior, no un efecto del wireframe.

### 0.5 Vocabulario

| Término                       | Qué es                                                   | Dónde se usa                  |
| ----------------------------- | -------------------------------------------------------- | ----------------------------- |
| **Guía breve / microguía V1** | La implementación actual de una idea guiada (tres pasos) | Documentos V1, producción hoy |
| **Experiencia guiada**        | Nombre visible V2 de una unidad recorrible               | **Etiqueta de interfaz**      |
| **Experiencias del capítulo** | Colección dinámica de 0..N experiencias guiadas          | Índice, Chapter Home          |
| `GuideDefinition`             | Término técnico actual del catálogo del servidor         | Solo código y docs V1         |

**Preferencia visual en las maquetas: «Experiencia guiada».** No usar
«microexperiencia» como etiqueta de interfaz — el término se retiró de estos
documentos.

### 0.6 Cuántas experiencias tiene un capítulo

```
VALID_GUIDED_EXPERIENCE_COUNT=0_TO_N
DEFAULT_EDITORIAL_RECOMMENDATION=3_TO_5
LONG_CHAPTER_RECOMMENDED_MAX=7
EDITORIAL_EXCEPTION_ALLOWED=true
```

3–5 es una **recomendación editorial**, no un contrato ni una validación
técnica. Dos experiencias para _Parejas que perduran_ son válidas: la densidad
se elige por materia, no por longitud del texto.

**Para el diseño:** ningún layout puede asumir una cantidad fija. Ni tres cards,
ni dos episodios, ni tres videos.

### 0.7 Estado de los medios — lenguaje preciso

Tres cosas distintas que se confunden todo el tiempo:

```
MEDIA_CATALOG_DEFINITION  ≠  MEDIA_ASSET_EXISTENCE  ≠  RUNTIME_PLAYABILITY
```

Que el catálogo declare un audiolibro `PUBLISHED` **no prueba** que el máster
exista, y que exista **no prueba** que se reproduzca hoy en producción.

Respecto del PR #616:

```
CHAPTER_AUDIO_ROW_CHECK_CODE=IN_PR_616
CHAPTER_AUDIO_ROW_CHECK_PRODUCTION_STATUS=NOT_DEPLOYED
AUDIO_MASTER_EXISTENCE=UNVERIFIED_UNLESS_SEPARATELY_PROVEN
```

**Para el diseño:** los wireframes de audio, podcast y video son diseños del
estado `AVAILABLE`. **No prueban que los activos de _Emociones_ o _Parejas_
existan hoy.** No marcar ningún activo como producido en las maquetas.

---

**Sistema visual:** [`README.md`](README.md) de esta carpeta. Tokens de record:
`apps/web/src/app/globals.css` (Tailwind v4 `@theme`) y `apps/mobile/src/theme.ts`.
Los prototipos HTML existentes (`Lector.html`, `Inicio.html`, etc.) son la
referencia de lenguaje visual — **no** se copian, se continúan.

---

## 1. Objetivo visual

Hoy un capítulo se ve como **un texto con pestañas encima**. Las pestañas
prometen «el mismo contenido, otra caja».

El diseño de V2 tiene que hacer visible otra idea:

> Un capítulo es un **recorrido**. Se puede entrar leyendo, escuchando, viendo o
> acompañado, y hay tramos donde el libro propone **hacer** algo.

Tres cosas que el diseño debe lograr sin una sola línea de explicación:

1. **Que se vea qué hay** antes de elegir. El estado de cada rama —disponible,
   próximamente, ausente, ya recorrida— debe leerse de un vistazo.
2. **Que leer siga siendo lo primero.** El recorrido se ve; no se atraviesa.
   «Seguir leyendo» es la acción más grande de la pantalla.
3. **Que una experiencia guiada se sienta como un tramo, no como una tarea.**
   Entrar, recorrer y salir sin costo. Nunca un examen, nunca una deuda.

**Tono:** cálido, sobrio, sin ansiedad. La paleta warm/sage/lavender ya
existente. Nada de rojo salvo error real. Nada de badges de logro.

---

## 2. Pantallas a diseñar

Nueve. Los wireframes textuales, con contenido y acciones, están en
[`../product/book-experience-v2-user-journeys.md` §3](../product/book-experience-v2-user-journeys.md).
El diseño visual los interpreta; no tiene que seguirlos al píxel.

| #   | Pantalla                    | Qué resuelve visualmente                                       | Prioridad |
| --- | --------------------------- | -------------------------------------------------------------- | --------- |
| 1   | **Chapter Home**            | El recorrido de un vistazo, sin estorbar la lectura            | Alta      |
| 2   | **Reader**                  | El texto como protagonista + invitaciones que no interrumpen   | Alta      |
| 3   | **Audiobook**               | Reproductor honesto, con metadata real                         | Media     |
| 4   | **Podcast**                 | Subformato dentro de Escuchar, no pestaña propia               | Baja      |
| 5   | **Video**                   | Playlist + reproductor 16:9                                    | Media     |
| 6   | **Guided Experiences list** | De 1 a 10 experiencias guiadas sin que se lean como pendientes | Alta      |
| 7   | **Experience Player**       | Un paso a la vez, 12 tipos distintos, misma anatomía           | Alta      |
| 8   | **Completion Summary**      | Cierre que reconoce sin evaluar                                | Alta      |
| 9   | **Emotional Map evolution** | Añadir «desde una experiencia guiada» a las resonancias        | Media     |

### 2.1 Cada pantalla necesita seis estados

No tres. Los que se olvidan son los que aparecen en producción:

| Estado           | Qué debe verse                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| **Con datos**    | El caso feliz                                                                                   |
| **Vacío**        | Cuando legítimamente no hay nada. **No siempre es un mensaje** — a veces es ausencia total (§4) |
| **Cargando**     | Lo que no se sabe, **no se ofrece**. Sin esqueletos que insinúen contenido que quizá no existe  |
| **Próximamente** | Deshabilitado y dicho, solo cuando editorialmente se anuncia                                    |
| **Completado**   | Marca discreta. **Nunca bloquea** volver a entrar                                               |
| **Error**        | Honesto y corto. Sin culpar a la persona                                                        |

### 2.2 Dos plataformas

Web (1365×900 de referencia) y mobile (390×844). El lector ya tiene una versión
móvil funcionando; el panel compañero es drawer en web y bottom sheet en mobile.
Mantener esa distinción idiomática.

### 2.3 La pantalla más difícil: Experience Player

Doce tipos de paso, cuatro familias, **una sola anatomía**. El reto de diseño es
que un paso de video y un paso de reflexión se sientan parte de lo mismo sin
forzar a que se vean iguales.

| Familia     | Pasos                                       | Qué ocupa la pantalla             |
| ----------- | ------------------------------------------- | --------------------------------- |
| CONTENT     | `INTRO` `PASSAGE` `CONCEPT` `EXAMPLE`       | Texto                             |
| MEDIA       | `AUDIO` `VIDEO`                             | Reproductor                       |
| INTERACTION | `PRACTICE` `REFLECTION` `QUESTION` `RECALL` | Instrucción / composer / pregunta |
| CLOSURE     | `SUMMARY` `RESONANCE`                       | Recuento u oferta                 |

El indicador de posición (`● ● ○`) dice **dónde va**, no cuánto vale. Si se ve
como una barra de progreso de examen, está mal.

---

## 3. Principios UX

Cuatro. No son preferencias: si una decisión visual choca con uno, gana el
principio.

### `NO_AUTOMATIC_EMOTION_INFERENCE=true`

El único estado emocional que la plataforma conoce es el que la persona
registró.

**Para el diseño:** ninguna pantalla dice «pareces…», «notamos que…» ni «tu
nivel de…». Un eje sin señal dice «Reuniendo datos», **nunca un cero**. Sin
datos ≠ cero, y visualmente tampoco: un eje vacío se dibuja punteado, no en el
origen.

### `CONTENT_IS_PRIMARY=true`

El libro es el producto.

**Para el diseño:** «Seguir leyendo» es la acción primaria. El modo Libro no se
convierte en tarjetas. Las invitaciones a experiencias van **en el flujo del
texto** —una tarjeta en el margen del párrafo que las motiva— nunca modales,
nunca banners fijos, nunca interstitials.

### `EXPERIENCE_IS_OPTIONAL=true`

Cero experiencias es un estado válido y frecuente.

**Para el diseño:** sin experiencias, **la pestaña no existe**. No hay «aún no
hay experiencias disponibles». El índice muestra recorrido, no deuda: «2 de 4
recorridas», no «faltan 2». «Salir» siempre visible, sin confirmación.

### `USER_CONTROL_IS_REQUIRED=true`

Todo lo que la persona declara, lo puede ver, entender y borrar.

**Para el diseño:** cada resonancia muestra origen y fecha, y su «Quitar» está a
un toque —no escondido en un menú. La oferta de resonancia siempre tiene dos
salidas igual de válidas: «Sí, me resonó» y «Ahora no». La segunda no es
secundaria visualmente.

---

## 4. Restricciones

### 4.1 De honestidad — heredadas y no negociables

| Restricción                               | Cómo se ve                                                 |
| ----------------------------------------- | ---------------------------------------------------------- |
| Una pestaña es una oferta                 | Si no hay activo reproducible, **no se dibuja la pestaña** |
| Un reproductor que no reproduce no existe | Sin máster: marco reservado sin botón de play, o nada      |
| Nada se completa solo                     | ✓ solo cuando hay una señal real detrás                    |
| Completar no bloquea                      | ✓ y la acción sigue disponible                             |
| Sin datos ≠ cero                          | Punteado + «Reuniendo datos», jamás un 0 %                 |

### 4.2 De lenguaje

Términos **prohibidos** en cualquier superficie pública (hay un test que rompe
el build si aparecen):

```
«medido»  ·  «confianza N %»  ·  «comprensión emocional N %»
«nivel de …»  ·  «tu puntaje»  ·  «pareces …»
```

Términos **correctos** para lo mismo:

```
«Confirmado por ti»  ·  «Reuniendo datos»  ·  «Autoinformado»
«Base limitada / moderada»  ·  «Lo que recorriste»
```

### 4.3 De alcance

- **Podcast no es pestaña de primer nivel.** Vive dentro de Escuchar.
- **Video del capítulo ≠ video inline.** Son dos superficies distintas y se
  nombran distinto.
- **Máximo una tarjeta de experiencia por sección** del texto. Nunca dos
  seguidas.
- Duración: se muestra si existe el dato; si no, «—». **Nunca estimar en la UI.**

### 4.4 De contenido en las maquetas

- **Nada de texto de los manuscritos.** Los párrafos de ejemplo se escriben para
  la maqueta. (Los libros son de David Jaramillo y Marina Quintana; su texto no
  se reproduce en material de diseño.)
- **Nada de medios falsos identificados como reales.** Un reproductor de maqueta
  se ve como maqueta.
- **Ningún dato de una persona real.** Las maquetas no usan cuentas reales.

---

## 5. Qué NO diseñar

### 5.1 Fuera de alcance de este brief

| No diseñar                             | Por qué                                          |
| -------------------------------------- | ------------------------------------------------ |
| Pantallas de administración (Pulso)    | Otro producto, otro usuario                      |
| Onboarding, Mi Plan, Perfil, Seguridad | Ya diseñadas y estables                          |
| Eco como pantalla completa             | Solo aparece como pestaña del panel compañero    |
| CMS o editor de autor                  | No existe y no es parte de V2                    |
| Cualquier pantalla de backend          | Este brief es de experiencia, no de arquitectura |

### 5.2 Elementos que no deben aparecer en ninguna maqueta

| Elemento                                    | Por qué                                             |
| ------------------------------------------- | --------------------------------------------------- |
| Puntajes, niveles, porcentaje de aciertos   | Un recorrido no es un score                         |
| Insignias, medallas, trofeos                | Gamificación prohibida                              |
| Rachas de experiencias                      | Convierte acompañamiento en obligación              |
| Comparación con otras personas              | No hay ranking en este producto                     |
| «Te falta N para completar»                 | Deuda, no recorrido                                 |
| Barras de progreso globales del capítulo    | Cada rama es una obra; la unión no es un porcentaje |
| Gráficos de tiempo de lectura o atención    | Vigilancia disfrazada de insight                    |
| Cualquier frase que interprete a la persona | Inferencia emocional. Prohibida sin excepción       |
| Un mapa emocional con % global              | Se retiró deliberadamente. No vuelve                |

### 5.3 Patrones de interacción a evitar

- **Modales para invitar.** Interrumpen la lectura.
- **Confirmación al salir** de una experiencia. Salir es gratis.
- **Autoavance** entre pasos. La persona decide cuándo sigue.
- **Bloqueo secuencial** entre experiencias guiadas. Solo la síntesis puede
  depender de las anteriores.
- **Esqueletos de carga que insinúan contenido inexistente.** Lo que no se sabe
  no se muestra.

---

## 6. Contenido opcional y dinámico

Ninguna pantalla puede asumir una cantidad. El diseño tiene que verse bien —y
honesto— en todas estas combinaciones:

| Capítulo               | Modos                                | Experiencias |
| ---------------------- | ------------------------------------ | ------------ |
| Solo lectura           | Leer                                 | 0            |
| Lectura + audio        | Leer · Escuchar                      | 0            |
| Video sin podcast      | Leer · Ver                           | 1            |
| Podcast sin audiolibro | Leer · Escuchar (solo podcast)       | 3            |
| Completo               | Leer · Escuchar · Ver · Experiencias | 10           |

Reglas de layout que se siguen de esto:

- **Nunca tres cards fijas** en el índice de experiencias.
- **Nunca dos episodios fijos** en Podcast.
- **Nunca tres videos fijos** en la playlist.
- Una sola experiencia no debe verse como una lista rota; diez no deben verse
  como una bandeja de tareas.
- Un capítulo con un solo modo **no muestra selector de modos**.

---

## 7. Signal Model visible

Qué señales se ven en pantalla, y cómo se distinguen. El detalle está en
[`../product/book-experience-v2-user-journeys.md` §5](../product/book-experience-v2-user-journeys.md).

| Nivel                  | Ejemplos                                            | Cómo se ve                                                |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| **Explícitas**         | Ánimo · check-in · resonancia confirmada · tema ⭐  | Con **procedencia y fecha**, y siempre con «Quitar»       |
| **Interacción**        | Highlight · nota · práctica hecha · video terminado | Como estado del recorrido (✓), **nunca como número**      |
| **Comportamiento**     | Tiempo · repetición · navegación                    | **No se muestran.** Ni como número ni como interpretación |
| **Contexto editorial** | Capítulo · concepto · parte del libro               | Como etiqueta neutra de origen                            |

```
BEHAVIOR_IS_NOT_EMOTION=true
```

**Para el diseño:** las tres primeras familias necesitan tratamientos visuales
distinguibles. Una resonancia confirmada y un highlight **no pueden verse
igual**: una es una declaración de la persona, el otro es una marca en el texto.

---

## 8. Comportamiento responsive

Tres anchos, y la pregunta que cada uno resuelve:

| Ancho       | Referencia | Qué cambia                                                               |
| ----------- | ---------- | ------------------------------------------------------------------------ |
| **Desktop** | 1365×900   | Panel compañero como drawer lateral; el texto reserva su ancho           |
| **Tablet**  | 1024×768   | Drawer se estrecha o pasa a overlay; el selector de modos sigue en línea |
| **Mobile**  | 390×844    | Panel compañero como bottom sheet; el selector puede envolver            |

Restricciones que ya son ley en producción y no se relajan:

- **Cero desbordamiento horizontal** a 390 px. Ni una palabra cortada.
- El selector de modos **envuelve**, no hace scroll horizontal oculto.
- El texto del capítulo **sigue visible** detrás del bottom sheet en mobile.
- Con el panel guiado abierto en mobile, el selector de modos **se oculta**.
- Áreas táctiles ≥ 44×44 px.

---

## 9. Referencias visuales dentro del repo

| Qué mirar                           | Dónde                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| Lenguaje visual del lector          | [`Lector.html`](Lector.html) · [`Lector RISE.html`](<Lector RISE.html>)                            |
| Tarjetas y estados vacíos           | [`Inicio.html`](Inicio.html) · [`Mi Biblioteca.html`](<Mi Biblioteca.html>)                        |
| Mapa emocional actual               | [`Patrones.html`](Patrones.html)                                                                   |
| Prototipo del estándar V1 (5 modos) | `/prototipos/book-experience` en la app web (solo local)                                           |
| Capturas del estándar V1            | [`../product/assets/book-experience-standard-v1/`](../product/assets/book-experience-standard-v1/) |
| Capturas del modo guiado actual     | [`../product/assets/gr3-runtime/`](../product/assets/gr3-runtime/)                                 |

---

## 10. Entregables exportables

Un prototipo visual navegable y exportable, con:

| #   | Entregable                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Las **nueve pantallas** (§2)                                                                                     |
| 2   | Variantes de _Emociones en Construcción_ c1 y _Parejas que perduran_ c1                                          |
| 3   | **Sistema de componentes** — cards, chips de estado, reproductores, indicador de posición, tarjeta de resonancia |
| 4   | **Tres anchos**: desktop · tablet · mobile (§8)                                                                  |
| 5   | **Estados**: loading · hidden · coming soon · available · in progress · completed · error recuperable            |
| 6   | **Anotaciones breves de interacción** — qué pasa al pulsar, qué no pasa                                          |

**No se espera:** código de producción, componentes del repositorio, cambios en
el repositorio, ni decisiones de arquitectura.

**Sí se espera:** que las maquetas puedan enseñarse a Jorge y al autor sin
necesidad de explicar qué es real y qué no — porque lo que no es real se ve como
lo que no es real.

**Destino de los archivos exportados** (los coloca Jorge, no Claude Design):

```
docs/design/assets/book-experience-v2/
```

---

## 11. Change Log

| Fecha      | Versión | Cambio                                                                                                                                                                                                                                              |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-03 | 1.0     | Brief inicial. Objetivo visual, nueve pantallas con seis estados, cuatro principios UX con su implicación visual, restricciones de honestidad/lenguaje/alcance/contenido, y lo que no debe diseñarse. Sin arquitectura, sin modelos, sin endpoints. |
