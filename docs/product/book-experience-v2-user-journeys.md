# Book Experience V2 — journeys de usuario y diseño UX

```
BOOK_EXPERIENCE_V2_UX_VERSION=1.0
STATUS=APPROVED_FOR_VISUAL_PROTOTYPING
LAST_UPDATED=2026-08-03
IMPLEMENTATION_IN_THIS_DOCUMENT=none
CODE_FILES_CHANGED=0
RUNTIME_AUTHORITY=false
IMPLEMENTATION_AUTHORIZED=false
PRODUCTION_STATUS=NOT_IMPLEMENTED
V2_PRODUCT_DIRECTION=APPROVED
V2_VISUAL_PROTOTYPE=PENDING_REVIEW
V2_IMPLEMENTATION=NOT_AUTHORIZED
```

Definición UX de Book Experience V2: **quién** usa esto, **qué recorrido** hace y
**qué ve en cada pantalla**, incluidos los estados que normalmente se olvidan
—vacío, cargando, completado— hasta que aparecen en producción.

**No implementa nada.** Sin código, sin migraciones, sin endpoints, sin
producción.

**Documentos fuente:**

| Documento                                                                  | Aporta                                      |
| -------------------------------------------------------------------------- | ------------------------------------------- |
| [`book-experience-v2-design.md`](book-experience-v2-design.md)             | Discovery: qué existe, qué supuestos romper |
| [`book-experience-v2-product-spec.md`](book-experience-v2-product-spec.md) | Modelo, 12 tipos de paso, Signal Model V1   |
| [`book-experience-standard-v1.md`](book-experience-standard-v1.md)         | Autoridad de presentación vigente (v1.1)    |

> **Autoridad, precedencia y vocabulario:** la sección canónica vive en
> [`../design/book-experience-v2-design-brief.md` §0](../design/book-experience-v2-design-brief.md).
> Resumen: V1 describe la producción actual
> ([`book-experience-standard-v1.md`](book-experience-standard-v1.md) y
> [`guided-reading-v1.md`](guided-reading-v1.md)); V2 describe el diseño
> objetivo. **V2 no ha reemplazado a la Guide V1**, cuyo lifecycle sigue intacto
> en producción. Un `ExperienceStep` de V2 **no es** una escena de V1, y una
> pantalla no implica un paso persistido.

---

## 1. Usuario y objetivos

Cinco perfiles. No son segmentos de marketing: son **modos de uso** que una
misma persona alterna según el día. El diseño tiene que servir a los cinco sin
obligar a ninguno a comportarse como otro.

### 1.1 Lector casual

> «Tengo veinte minutos y quiero leer algo que me sirva.»

|                      |                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------- |
| **Objetivo**         | Leer sin fricción. Terminar el capítulo o dejarlo donde iba                                 |
| **Qué NO quiere**    | Elegir entre cuatro cosas antes de leer. Que le pidan «completar» nada                      |
| **Éxito**            | Entró, leyó, salió. Volver mañana y estar donde quedó                                       |
| **Riesgo de diseño** | La cabecera de recorrido lo obliga a decidir antes de leer                                  |
| **Mitigación**       | «Seguir leyendo» es la acción primaria y la más grande. El recorrido se ve, no se atraviesa |

### 1.2 Lector profundo

> «Este capítulo me está tocando algo. Quiero quedarme.»

|                      |                                                                              |
| -------------------- | ---------------------------------------------------------------------------- |
| **Objetivo**         | Subrayar, anotar, volver, escribir sobre lo leído                            |
| **Qué NO quiere**    | Que sus marcas se conviertan en métricas. Que le interpreten lo que escribió |
| **Éxito**            | Sus marcas y notas están donde las dejó; su reflexión es suya y está cifrada |
| **Riesgo de diseño** | Que subrayar dispare cosas «útiles» que no pidió                             |
| **Mitigación**       | El ciclo ARC: subrayar **ofrece**, no registra. «Ahora no» no persiste nada  |

### 1.3 Usuario de audiolibro

> «Escucho mientras manejo. No puedo mirar la pantalla.»

|                      |                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------- |
| **Objetivo**         | Dar play y que suene. Volver donde iba                                             |
| **Qué NO quiere**    | Descubrir a los diez minutos que era una transcripción                             |
| **Éxito**            | La pestaña dice la verdad antes de entrar. El audio suena y sigue en segundo plano |
| **Riesgo de diseño** | Ofrecer «Escuchar» sin audio producido                                             |
| **Mitigación**       | Ya resuelto en V1: gating por reproducibilidad real; sin activo, no hay oferta     |

### 1.4 Usuario de video

> «Prefiero que me lo cuenten.»

|                      |                                                               |
| -------------------- | ------------------------------------------------------------- |
| **Objetivo**         | Ver la idea del capítulo en pocos minutos                     |
| **Qué NO quiere**    | Un reproductor que no reproduce; subtítulos que no existen    |
| **Éxito**            | Ve el video, entiende la idea, decide si lee el capítulo      |
| **Riesgo de diseño** | Confundir el video del capítulo con el video inline del texto |
| **Mitigación**       | Son dos superficies con nombres distintos (spec §6.5)         |

### 1.5 Usuario de experiencias guiadas

> «Leer no me alcanza. Quiero hacer algo con esto.»

|                      |                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------- |
| **Objetivo**         | Recorrer una idea hasta el final: entenderla, practicarla, recordarla                         |
| **Qué NO quiere**    | Un curso. Un examen. Un puntaje. Que le digan cómo está                                       |
| **Éxito**            | Terminó una experiencia guiada y siente que hizo algo, no que aprobó algo                     |
| **Riesgo de diseño** | Que diez experiencias guiadas se lean como diez tareas pendientes                             |
| **Mitigación**       | Cada una es autónoma y opcional. El índice no muestra «2 de 4» como deuda sino como recorrido |

### 1.6 Lo que los cinco comparten

| Necesidad          | Cómo se cumple                                              |
| ------------------ | ----------------------------------------------------------- |
| **Honestidad**     | Ninguna pantalla ofrece lo que no puede dar                 |
| **Control**        | Todo lo que la persona declara, lo puede ver y borrar       |
| **Sin evaluación** | Ninguna pantalla puntúa, compara ni interpreta a la persona |
| **Continuidad**    | Volver es fácil; salir no cuesta nada                       |

---

## 2. Journey del capítulo

Seis momentos. Para cada uno: qué pasa, qué decide la persona, qué puede salir
mal.

### 2.1 Entrada al capítulo

**Desde:** biblioteca · «seguir leyendo» de Inicio · una sugerencia de Eco · un
enlace directo.

```
La persona llega. En ≤ 2 segundos debe poder responder:
  ¿de qué es este capítulo?
  ¿por dónde puedo entrar?
  ¿dónde había quedado?
```

**Decisión:** entrar directo a leer, o mirar el recorrido primero.

**Qué puede salir mal:**

| Riesgo                                      | Diseño que lo evita                                           |
| ------------------------------------------- | ------------------------------------------------------------- |
| Obligar a elegir modo antes de leer         | «Seguir leyendo» es la acción primaria, siempre visible       |
| Mostrar modos que aún no se sabe si existen | Mientras el manifest no responde, **no se ofrece** (ya en V1) |
| Perder el punto de lectura                  | El progreso viene con el capítulo, no se calcula al vuelo     |

### 2.2 Exploración de modos

**Qué pasa:** la persona mira el recorrido. Cada rama dice su estado con
honestidad: disponible, próximamente, o simplemente no está.

```
📖 Leer           22 min        ✓ leído
🎧 Escuchar       18 min        ▸ disponible
🎬 Ver            —             próximamente
🌱 Experiencias   2 de 4        ▸ en curso
```

**Decisión:** por dónde entra.

**Regla heredada de V1, sin excepción:** una pestaña es una oferta. Si no
podemos cumplirla, no se hace.

### 2.3 Inicio de experiencia

**Dos puertas legítimas**, y ninguna interrumpe:

1. **Desde el índice de experiencias** — la persona fue a buscarlas.
2. **Desde el texto** — una tarjeta en el punto del capítulo donde esa idea
   aparece. Es una invitación en el margen, no un modal.

```
   …el cuerpo siente antes de que la mente entienda.

   ┌ 🌱 Experiencia ────────────────────────────┐
   │ El cuerpo sabe antes que la mente          │
   │ 4 pasos · ~6 min          [ Empezar ]      │
   └────────────────────────────────────────────┘

   Nuestra cultura nos enseñó a…
```

**Antes de empezar la persona debe saber tres cosas:** cuántos pasos, cuánto
dura, y que puede salir cuando quiera.

**Qué puede salir mal:** que la invitación interrumpa la lectura. Por eso es una
tarjeta en el flujo, nunca un modal ni un banner fijo.

### 2.4 Progreso

**Dentro de una experiencia guiada:** un paso a la vez, con la posición visible.

```
← Escucharte por dentro          ● ● ○
```

Tres reglas:

1. **La posición no es un puntaje.** `● ● ○` dice dónde va, no cuánto vale.
2. **Salir no pierde nada.** El avance queda guardado y el índice lo muestra.
3. **Volver atrás es posible** en los pasos que no registran nada. Un `RECALL`
   ya respondido no se rehace dentro de la misma sesión.

**Entre experiencias guiadas:** el índice muestra el recorrido, no una lista de
pendientes. La diferencia está en el lenguaje: «2 de 4 recorridas», no «faltan
2».

### 2.5 Finalización

**De una experiencia guiada:** paso `SUMMARY` (si lo tiene) o vuelta al índice con
✓.

**Del capítulo:** el estado `COMPLETED` aparece por rama, y solo con la señal
que lo respalda (spec §5.1). Ninguna rama completa a otra: terminar el audiolibro
no marca el texto como leído.

**Prohibido en toda pantalla de finalización:**

- Puntaje, nivel, porcentaje de aciertos.
- Comparación con otras personas.
- Comparación consigo misma en el tiempo.
- Interpretación de lo que escribió.

**Permitido:** recuento de actos («recorriste 4 pasos»), una invitación suave a
lo siguiente, y —solo si es un paso `RESONANCE`— la oferta de confirmar.

### 2.6 Retorno

**Al día siguiente, la persona vuelve.** Tres caminos:

| Vuelve por       | Qué encuentra                                          |
| ---------------- | ------------------------------------------------------ |
| Inicio           | «Seguir leyendo» con el capítulo y el punto exactos    |
| Biblioteca       | El libro con su progreso; el capítulo con su recorrido |
| Una notificación | El destino directo, sin pasar por tres pantallas       |

**El punto frágil, ya identificado:** hoy la reanudación de una experiencia
**no cruza dispositivos** (`CROSS_DEVICE_RESUME_V1=false`). Con tres pasos cuesta
un toque; con diez, cuesta la sesión. Es la decisión D2 del discovery y bloquea
los recorridos largos.

**Mientras no se resuelva, el diseño lo dice:** si la experiencia guiada se abre en
otro dispositivo, la pantalla explica que empieza de nuevo —**antes** de que la
persona invierta diez minutos.

---

## 3. Screens UX

Nueve pantallas. Cada una define objetivo, contenido, acciones y los tres
estados que se olvidan: **vacío**, **cargando** y **completado**.

> **Sobre el estado «cargando».** El principio ya implementado en V1 es más
> fuerte que un spinner: **lo que no se sabe, no se ofrece**. Una pestaña cuyo
> manifest no respondió no aparece deshabilitada — no aparece. Un esqueleto que
> insinúa contenido que quizá no existe es una promesa a medias.

### 3.1 Chapter Home

**Objetivo:** responder «¿qué tiene este capítulo y por dónde entro?» sin abrir
ninguna rama.

```
┌──────────────────────────────────────────────────┐
│ ← Emociones en Construcción                      │
│                                                  │
│ Cap. 1 · El cuerpo sabe antes que la mente       │
│ Parte I · Deconstruyendo lo que sabíamos         │
│                                                  │
│ ┌ Cómo recorrerlo ─────────────────────────────┐ │
│ │ 📖 Leer           22 min        ✓ leído      │ │
│ │ 🎧 Escuchar       18 min        ▸ disponible │ │
│ │ 🎬 Ver            —             próximamente │ │
│ │ 🌱 Experiencias   2 de 4        ▸ en curso   │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ [ Seguir leyendo ]                               │
└──────────────────────────────────────────────────┘
```

|                |                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Contenido**  | Título canónico · parte · estado por rama · punto de lectura                                                                            |
| **Acciones**   | Seguir leyendo (primaria) · entrar a una rama · volver al libro                                                                         |
| **Vacío**      | Capítulo sin medios ni experiencias: **la cabecera no se muestra**. Se entra directo a leer. No hay recorrido que anunciar              |
| **Cargando**   | Solo se listan las ramas cuya disponibilidad ya se conoce. El texto («Leer») está siempre; el resto aparece cuando el manifest responde |
| **Completado** | ✓ por rama. Todas completas: ✓ en el encabezado. **Nunca bloquea** volver a entrar                                                      |

> Las duraciones salen de `Chapter.durationMinutes` y `durationSec` del catálogo
> de medios. **Si no hay dato, se muestra «—», no una estimación.**

### 3.2 Reader

**Objetivo:** leer. Todo lo demás es secundario.

```
┌──────────────────────────────────────────────────┐
│ 📖 Leer  🎧 Escuchar  🎬 Ver  🌱 Experiencias    │
├──────────────────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░  48 %                         │
│                                                  │
│   El cuerpo se adelanta                          │
│                                                  │
│   Nuestro cuerpo siente antes de que la mente    │
│   entienda…                                      │
│                                                  │
│   ┌ 🌱 Experiencia ────────────────────────────┐ │
│   │ El cuerpo sabe antes que la mente          │ │
│   │ 4 pasos · ~6 min          [ Empezar ]      │ │
│   └────────────────────────────────────────────┘ │
│                                                  │
│ [ ✓ Marcar capítulo como leído ]                 │
└──────────────────────────────────────────────────┘
```

|                |                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Contenido**  | Bloques tipados (`PARAGRAPH · HEADING · QUOTE · EXERCISE · AUDIO · IMAGE · PAUSE · VIDEO`) · tarjetas de experiencia en su punto          |
| **Acciones**   | Subrayar · anotar · abrir el panel compañero (Eco · Notas · Reflexión) · empezar una experiencia · marcar como leído                      |
| **Vacío**      | Un capítulo sin bloques es un **fallo de contenido**, no un estado. Falla cerrado y lo dice, sin inventar una pantalla vacía amable       |
| **Cargando**   | El texto llega con la página (server-rendered). Las pestañas de medios y la de experiencias aparecen cuando su respuesta llega — no antes |
| **Completado** | Barra al 100 %, botón a «Leído ✓». La relectura no lo revierte                                                                            |

### 3.3 Audiobook

**Objetivo:** escuchar la narración del capítulo.

```
┌──────────────────────────────────────────────────┐
│        [ Audiolibro ]  [ Podcast · Próximamente ]│
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ ▶  ━━━━━━━━━●─────────────  08:42 / 18:03    │ │
│ │    Cap. 1 · El cuerpo sabe antes que la mente│ │
│ │    Emociones en Construcción · Marina Quintana│ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ Segmentos                                        │
│  1. Apertura   2. Desarrollo   3. Cierre         │
│                                                  │
│ ▸ Mostrar transcripción                          │
└──────────────────────────────────────────────────┘
```

|                |                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contenido**  | Reproductor con metadata (título · libro · autor · carátula) · segmentos · transcripción plegable                                                   |
| **Acciones**   | Reproducir · cambiar subformato (solo si es reproducible) · abrir transcripción · velocidad · temporizador                                          |
| **Vacío**      | Sin audiolibro ni podcast reproducibles, **la pestaña Escuchar no se habilita**. Dentro, un subformato sin activo se deshabilita con «Próximamente» |
| **Cargando**   | La URL firmada se pide **al elegir el formato**, no al abrir la pestaña. Mientras llega: «Preparando…», sin controles falsos                        |
| **Completado** | ✓ junto al subformato terminado. La reproducción sigue disponible                                                                                   |

> **Regla de honestidad:** la transcripción **acompaña**, nunca sustituye. Un
> capítulo con transcripción y sin audio no tiene audiolibro.

> **Este wireframe dibuja el estado `AVAILABLE`.** No afirma que el audiolibro
> de _Emociones en Construcción_ exista hoy:
> `MEDIA_CATALOG_DEFINITION ≠ MEDIA_ASSET_EXISTENCE ≠ RUNTIME_PLAYABILITY`.
> El estado real de los másters vive en
> [`chapter-01-media-package.md`](chapter-01-media-package.md), y la
> comprobación de la fila `Audio` es código de PR #616 **todavía sin desplegar**.

### 3.4 Podcast

**Objetivo:** la conversación sobre el capítulo — no la narración.

```
┌──────────────────────────────────────────────────┐
│        [ Audiolibro ]  [ Podcast ]               │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ ▶  ━━━━●───────────────────  03:12 / 24:50   │ │
│ │    «Cuando el cuerpo habla primero»          │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ Notas del episodio                               │
│ Ideas principales                                │
│ ▸ Vínculo al capítulo                            │
└──────────────────────────────────────────────────┘
```

|                 |                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| **Contenido**   | Episodio · show notes · ideas principales · vínculo al capítulo                                         |
| **Acciones**    | Reproducir · abrir notas · ir al capítulo                                                               |
| **Vacío**       | Sin episodio, el subformato se oculta o se anuncia; **nunca se abre**                                   |
| **Cargando**    | Igual que audiolibro: firma bajo demanda                                                                |
| **Completado**  | ✓ en el subformato                                                                                      |
| **Alcance hoy** | Subformato dentro de Escuchar, **no** pestaña de primer nivel (`PODCAST_FIRST_CLASS_READER_MODE=false`) |

### 3.5 Video

**Objetivo:** ver el video del capítulo. Distinto del video **inline**, que vive
dentro del texto.

```
┌──────────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────────┐ │
│ │                  ▶                           │ │
│ │            (reproductor 16:9)                │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ Playlist                                         │
│  1. La idea central          ✓                   │
│  2. Un ejemplo cotidiano     ▸                   │
│                                                  │
│ ▸ Subtítulos y transcripción                     │
└──────────────────────────────────────────────────┘
```

|                |                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| **Contenido**  | Reproductor · playlist · subtítulos · transcripción                                                        |
| **Acciones**   | Reproducir · cambiar de video · abrir transcripción                                                        |
| **Vacío**      | Sin video producido, la pestaña se oculta                                                                  |
| **Cargando**   | El embed se pide al elegir el video. Mientras: marco con proporción reservada, **sin botón de play falso** |
| **Completado** | ✓ por elemento y en la pestaña cuando todos terminaron                                                     |

> **No se inventan** `videoUid`, poster, subtítulos ni duración. Existen cuando
> existe el máster.

### 3.6 Guided Experiences list

**Objetivo:** mostrar el recorrido guiado del capítulo y dónde quedó la persona.

```
┌──────────────────────────────────────────────────┐
│ 🌱 Experiencias · Cap. 1                         │
│ 4 experiencias · ~18 min en total                │
├──────────────────────────────────────────────────┤
│ 1 · El cuerpo sabe antes que la mente  ✓         │
│     4 pasos · ~6 min             [ Repetir ]     │
│                                                  │
│ 2 · Escucharte por dentro          ▸ paso 2 de 3 │
│     3 pasos · ~5 min             [ Continuar ]   │
│                                                  │
│ 3 · Respirar antes de seguir       ○             │
│     2 pasos · ~4 min             [ Empezar ]     │
│                                                  │
│ 4 · Síntesis                       🔒            │
│     Disponible al completar 1–3                  │
└──────────────────────────────────────────────────┘
```

|                |                                                                                       |
| -------------- | ------------------------------------------------------------------------------------- |
| **Contenido**  | Lista ordenada · pasos y duración por experiencia · estado                            |
| **Acciones**   | Empezar · continuar · repetir · volver al capítulo                                    |
| **Vacío**      | **0 experiencias ⇒ la pestaña no existe.** Ausencia, no un mensaje de «aún no hay»    |
| **Cargando**   | La pestaña aparece cuando la disponibilidad está confirmada. Nunca una lista fantasma |
| **Completado** | ✓ por experiencia; con todas las requeridas listas, ✓ en Chapter Home                 |

> **El candado de la síntesis** es la única dependencia admitida. Encadenar
> experiencias guiadas entre sí convierte un acompañamiento en un curso.

### 3.7 Experience Player

**Objetivo:** recorrer los pasos de **una** experiencia guiada, uno a la vez.

```
┌──────────────────────────────────────────────────┐
│ ← Escucharte por dentro          ● ● ○           │
├──────────────────────────────────────────────────┤
│                                                  │
│  Durante los próximos minutos, cierra los ojos   │
│  y recorre tu cuerpo de arriba abajo.            │
│                                                  │
│  Nota dónde hay tensión. No la cambies.          │
│  Solo nótala.                                    │
│                                                  │
│  ⏱ 2:00                                          │
│                                                  │
│                        [ Ya lo hice ]            │
│                                                  │
├──────────────────────────────────────────────────┤
│ Salir · tu avance queda guardado                 │
└──────────────────────────────────────────────────┘
```

|                |                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Contenido**  | Un paso. El renderer depende del tipo (§3 de la spec)                                                             |
| **Acciones**   | Completar el paso · salir · volver atrás (en pasos que no registran)                                              |
| **Vacío**      | Una experiencia sin pasos es inválida y no se publica                                                             |
| **Cargando**   | El primer paso llega con la pantalla. Un paso `AUDIO`/`VIDEO` muestra el marco reservado mientras se firma la URL |
| **Completado** | `SUMMARY` si lo tiene; si no, vuelta al índice con ✓                                                              |

**Anatomía por familia de paso:**

| Familia     | Qué ocupa la pantalla             | Acción principal                          |
| ----------- | --------------------------------- | ----------------------------------------- |
| CONTENT     | Texto                             | «Continuar»                               |
| MEDIA       | Reproductor                       | Termina solo al acabar                    |
| INTERACTION | Instrucción / composer / pregunta | «Ya lo hice» · «Responder»                |
| CLOSURE     | Recuento u oferta                 | «Terminar» · «Sí, me resonó» / «Ahora no» |

**Regla de salida:** «Salir» está siempre visible y nunca pide confirmación. La
frase «tu avance queda guardado» es un compromiso, no un consuelo.

### 3.8 Completion Summary

**Objetivo:** cerrar bien. Recuento de actos, **nunca** evaluación.

```
┌──────────────────────────────────────────────────┐
│ Terminaste: Escucharte por dentro                │
├──────────────────────────────────────────────────┤
│                                                  │
│ Lo que recorriste                                │
│  · Una práctica de escucha corporal              │
│  · Una reflexión escrita (solo tuya)             │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ ¿Te resonó «El cuerpo sabe antes que la      │ │
│ │ mente»?                                      │ │
│ │                                              │ │
│ │ [ Sí, me resonó ]        [ Ahora no ]        │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ [ Volver al capítulo ]   [ Siguiente experiencia]│
└──────────────────────────────────────────────────┘
```

|                |                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------- |
| **Contenido**  | Qué hizo (lista de actos) · oferta de resonancia si el paso existe · siguiente paso opcional |
| **Acciones**   | Confirmar resonancia · descartar · volver · continuar                                        |
| **Vacío**      | Sin paso `RESONANCE`, la tarjeta de oferta no aparece. La pantalla sigue siendo válida       |
| **Cargando**   | La confirmación es optimista con reversión si falla; nunca deja la pantalla en suspenso      |
| **Completado** | Confirmada la resonancia, la tarjeta pasa a «Confirmado por ti» con opción de quitar         |

**Prohibido en esta pantalla:**

| No va                               | Por qué                                       |
| ----------------------------------- | --------------------------------------------- |
| «Acertaste 2 de 3»                  | Convierte un acompañamiento en un examen      |
| «Llevas 5 experiencias esta semana» | Racha disfrazada                              |
| «Pareces más consciente»            | Inferencia emocional. Prohibida sin excepción |
| «Te falta 1 para completar»         | Deuda, no recorrido                           |

**La única señal que puede salir de aquí al Mapa Emocional** es la resonancia
confirmada — y sale porque la persona pulsó.

### 3.9 Emotional Map evolution

**Objetivo:** que la persona vea lo que ella misma declaró, con procedencia — y
nada más.

```
┌──────────────────────────────────────────────────┐
│ Tu mapa                                    ⓘ     │
├──────────────────────────────────────────────────┤
│ Hoy te registraste como: bien                    │
│                                                  │
│ ┌ Cómo me describí ────────────────────────────┐ │
│ │        (hexágono; solo ejes con señal)       │ │
│ │  Calma      72 ±8   · Tu ánimo               │ │
│ │  Claridad   88      · Tu check-in            │ │
│ │  Conexión   50      · Tus resonancias        │ │
│ │  Propósito  —       · Reuniendo datos        │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ ┌ Mis resonancias ─────────────────────────────┐ │
│ │ ⭐ El cuerpo sabe antes que la mente          │ │
│ │    Confirmado por ti · Cap. 1 · 3 ago        │ │
│ │    Desde: una experiencia guiada    [ Quitar ]│ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ Tu recorrido por los libros vive en Mi Evolución │
└──────────────────────────────────────────────────┘
```

|                |                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| **Contenido**  | Momento (ánimo literal) · radar de autoinforme · resonancias con procedencia · narrativa opcional              |
| **Acciones**   | Ver el detalle de un eje (ⓘ) · marcar ⭐ importante · quitar una resonancia                                    |
| **Vacío**      | Ejes sin señal: «Reuniendo datos». **Nunca un número inventado.** Mapa entero sin datos: explica cómo se llena |
| **Cargando**   | El mapa se cachea; mientras llega, no se muestra un radar a cero. Sin datos ≠ cero                             |
| **Completado** | No aplica: un mapa no se completa. Su cobertura crece                                                          |

**Lo que V2 añade:** las resonancias que vienen de una experiencia guiada
muestran ese origen, igual que hoy muestran highlight / Eco / ejercicio.

**Lo que sigue prohibido:** porcentaje global, «comprensión emocional N %», y
cualquier eje alimentado por actividad.

---

## 4. Dynamic experiences

Dos capítulos reales, modelados. Las duraciones de capítulo salen de
`Chapter.durationMinutes`; las de experiencia son **estimaciones editoriales**,
marcadas como tales.

### 4.1 _Emociones en Construcción_ · capítulo 1

```
Capítulo         20 min de lectura (dato real, seed)
Experiencias     4
Duración total   ~18 min (estimado)
```

| #   | Experiencia                       | Pasos | Tipos                                      | Duración (est.) |
| --- | --------------------------------- | ----- | ------------------------------------------ | --------------- |
| 1   | El cuerpo sabe antes que la mente | 4     | `INTRO` → `PASSAGE` → `CONCEPT` → `RECALL` | ~6 min          |
| 2   | Escucharte por dentro             | 3     | `PRACTICE` → `REFLECTION` → `RESONANCE`    | ~5 min          |
| 3   | Respirar antes de seguir          | 2     | `AUDIO` → `QUESTION`                       | ~4 min          |
| 4   | Síntesis                          | 1     | `SUMMARY`                                  | ~2 min          |

**Distribución por familia:** CONTENT 4 · MEDIA 1 · INTERACTION 4 · CLOSURE 2.

**Por qué esta forma:** la #1 entiende, la #2 practica y escribe, la #3 baja el
cuerpo, la #4 cierra. Ninguna dura más de seis minutos: una experiencia guiada que
se siente larga deja de ser micro.

### 4.2 _Parejas que perduran_ · capítulo 1 (orden de plataforma 2)

```
Capítulo         43 min de lectura (dato real, seed)
Experiencias     2
Duración total   ~11 min (estimado)
```

| #   | Experiencia                       | Pasos | Tipos                                   | Duración (est.) |
| --- | --------------------------------- | ----- | --------------------------------------- | --------------- |
| 1   | El contacto sostenido en silencio | 3     | `PASSAGE` → `CONCEPT` → `RECALL`        | ~5 min          |
| 2   | Diez minutos de contacto          | 3     | `PRACTICE` → `REFLECTION` → `RESONANCE` | ~6 min          |

**Distribución por familia:** CONTENT 3 · MEDIA 0 · INTERACTION 4 · CLOSURE 1.

**Por qué esta forma:** un capítulo de 43 minutos con solo dos experiencias
guiadas. La densidad se elige por materia, no por longitud del texto — la
práctica de este capítulo se hace **de a dos personas** y ocupa tiempo real
fuera de la pantalla.

> **Excepción editorial declarada.** El estándar V1 recomienda 3–5 unidades por
> capítulo (`DEFAULT_EDITORIAL_RECOMMENDATION=3_TO_5`). Dos es válido:
> `VALID_GUIDED_EXPERIENCE_COUNT=0_TO_N` y
> `EDITORIAL_EXCEPTION_ALLOWED=true`. La recomendación no es un contrato ni una
> validación técnica.

**Dos restricciones que no se pueden perder:**

1. **`chapterOrder = 2`.** El capítulo 1 del libro es el orden 2 de plataforma
   (el prefacio se llevó el 1). Usar 1 ancla las experiencias al prefacio.
2. **`SOURCE_QUALITY=OCR_UNFINALIZED`.** Los anchors se revalidan al llegar el
   máster.

### 4.3 Lo que este par demuestra

| Requisito                | Demostrado por                               |
| ------------------------ | -------------------------------------------- |
| Número variable          | 4 vs 2 en dos capítulos comparables          |
| Longitud variable        | Experiencias de 1, 2, 3 y 4 pasos            |
| Pasos heterogéneos       | EEC #3 tiene media; PQP no tiene ninguna     |
| Densidad ≠ longitud      | 43 min de texto → 2 experiencias; 20 min → 4 |
| Señal explícita opcional | `RESONANCE` con «Ahora no» no persiste nada  |
| 0 experiencias           | Todo capítulo sin catálogo (la mayoría hoy)  |
| 10 experiencias          | Misma estructura, lista más larga            |

---

## 5. Signal visibility

Tres niveles de visibilidad. **Ortogonales** al Signal Model V1 (spec §4): aquel
dice a dónde va cada señal; este dice **quién puede verla**.

### 5.1 Privadas — la persona sí, el sistema no

Contenido que la plataforma **no puede leer**, por construcción.

| Dato                       | Quién lo ve     | Garantía técnica                                     |
| -------------------------- | --------------- | ---------------------------------------------------- |
| Texto de una reflexión     | Solo la persona | Cifrado E2E; el servidor guarda `ciphertext + nonce` |
| Mensajes que escribe a Eco | Solo la persona | Cifrados; el plaintext va in-flight y no se persiste |
| Texto de `QUESTION`        | Solo la persona | **No se persiste en ninguna parte**                  |
| Análisis local del texto   | Solo la persona | Opt-in; suben números, nunca palabras                |

**Consecuencia de diseño:** ninguna pantalla puede resumir, citar ni interpretar
este contenido. Si un wireframe lo hace, el wireframe está mal.

### 5.2 Visibles al usuario — la persona las ve y las controla

Señales que la persona declaró y que la UI le devuelve con procedencia.

| Señal                    | Dónde la ve                          | Puede                |
| ------------------------ | ------------------------------------ | -------------------- |
| Registro de ánimo        | Chip superior · momento del mapa     | Cambiarlo            |
| Micro-checkin            | Radar «Cómo me describí» + ⓘ         | Responder de nuevo   |
| Resonancia confirmada    | «Mis resonancias» con origen y fecha | **Quitarla**         |
| Tema importante (⭐)     | «Mis resonancias»                    | Desmarcarlo          |
| Highlights y notas       | En el texto y en el panel            | Editarlas, borrarlas |
| Progreso de capítulo     | Chapter Home · barra del lector      | Rehacer              |
| Experiencias completadas | Índice de experiencias               | Repetirlas           |

**Tres propiedades obligatorias**, heredadas del ciclo ARC:

1. **Momento señalable** — «lo dije ahí».
2. **Procedencia visible** — de dónde vino y cuándo.
3. **Revocable** — borrarla la quita también del Mapa.

### 5.3 Visibles solo para el sistema — nadie las ve como perfil

Señales operativas. No aparecen en ninguna pantalla de la persona **ni como
número ni como interpretación**.

| Señal                            | Para qué existe                   | Dónde aparece                 |
| -------------------------------- | --------------------------------- | ----------------------------- |
| `unit_opened` / `unit_completed` | Continuidad y Mi Evolución        | Agregado en Mi Evolución      |
| `chapter_media_completed`        | Estado `COMPLETED` de una rama    | Como ✓, no como número        |
| `concept_explored`               | Progreso de la experiencia guiada | Como posición, no puntaje     |
| `active_recall_attempted`        | Feedback inmediato del paso       | En el paso, y se acabó        |
| `practice_completed`             | Progreso de la experiencia guiada | Como ✓                        |
| Métricas de plataforma           | Salud del producto                | **Pulso**, agregado y anónimo |

**La distinción que importa:** una señal de sistema puede producir un ✓ en
pantalla. Lo que no puede producir es **un número sobre la persona** ni una
frase sobre cómo está.

### 5.4 La tabla de decisión

Ante cualquier señal nueva, tres preguntas en orden:

```
1. ¿Puede el sistema leer el contenido?
   No  → PRIVADA. Ninguna pantalla la resume ni la interpreta.
   Sí  → sigue.

2. ¿La persona declaró algo sobre sí misma, sabiendo que lo declaraba?
   Sí  → VISIBLE AL USUARIO, con procedencia y con borrado.
   No  → sigue.

3. ¿Sirve para operar el producto?
   Sí  → SOLO SISTEMA. Como estado (✓), nunca como perfil.
   No  → no se recoge.
```

**El paso 3 tiene un final por defecto:** si una señal no sirve para operar y
no la declaró nadie, **no se recoge**. La ausencia es el default.

---

## 6. UX principles

Cuatro principios. Cada uno con lo que implica y con la prueba que lo sostiene.

### `NO_AUTOMATIC_EMOTION_INFERENCE=true`

**Qué significa:** el único estado emocional que la plataforma conoce es el que
la persona registró explícitamente.

**Implicaciones de diseño:**

- Ninguna pantalla dice «pareces…», «notamos que…» ni «tu nivel de…».
- Ni el ritmo de lectura, ni el modo elegido, ni el abandono, ni el texto escrito
  producen una afirmación sobre nadie.
- Los ejes sin señal dicen «Reuniendo datos». **Sin datos ≠ cero.**

**Cómo se sostiene:** `emotional-map.v2-contract.spec.ts` (más actividad ⇒ el
mapa no cambia) y `copy-contract.spec.ts` (términos prohibidos rompen el build).

### `CONTENT_IS_PRIMARY=true`

**Qué significa:** el libro es el producto. Todo lo demás acompaña.

**Implicaciones de diseño:**

- «Seguir leyendo» es la acción primaria de Chapter Home.
- El modo Libro no se convierte en una colección de tarjetas.
- Las invitaciones a experiencias van **en el flujo del texto**, nunca en modales
  ni banners fijos.
- Ninguna experiencia bloquea la lectura de nada.

**Cómo se sostiene:** `BOOK.state = PUBLISHED` siempre; es el único modo que
nunca se deshabilita. Si el capítulo existe, se puede leer.

### `EXPERIENCE_IS_OPTIONAL=true`

**Qué significa:** cero experiencias es un estado válido y frecuente, no una
carencia.

**Implicaciones de diseño:**

- Sin experiencias, **la pestaña no existe** — no hay «aún no hay experiencias».
- El índice muestra recorrido, no deuda: «2 de 4 recorridas», no «faltan 2».
- Salir de una experiencia no cuesta nada y no pide confirmación.
- Sin puntos, sin insignias, sin rachas.

**Cómo se sostiene:** la regla de V1 —una pestaña es una oferta— aplicada a la
rama guiada: se muestra solo cuando hay algo que ofrecer.

### `USER_CONTROL_IS_REQUIRED=true`

**Qué significa:** todo lo que la persona declara, lo puede ver, entender y
borrar.

**Implicaciones de diseño:**

- Cada resonancia muestra origen y fecha, y tiene «Quitar».
- El análisis local del texto es **opt-in**, y desactivarlo **borra** lo
  derivado.
- El modal ⓘ explica cada eje: qué lo alimenta y con cuántos registros.
- Ninguna señal entra al Mapa sin un toque explícito.

**Cómo se sostiene:** el ciclo ARC (ancla → relaciona → **confirma**), el
borrado en cascada del opt-in, y la procedencia por eje.

### 6.5 Los cuatro juntos

> El producto acompaña una lectura. No la evalúa, no la interpreta y no la
> convierte en un expediente. Cuando una decisión de diseño choque con esto,
> gana esto.

---

## 7. Riesgos UX

| Riesgo                                             | Señal de alarma                  | Mitigación                                                     |
| -------------------------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| La cabecera de recorrido añade fricción            | Menos gente empieza a leer       | «Seguir leyendo» primario; el recorrido se ve, no se atraviesa |
| Diez experiencias guiadas se leen como diez tareas | Se empieza la 1 y no se vuelve   | Lenguaje de recorrido, no de pendientes; ninguna encadenada    |
| Perder una sesión larga al cambiar de dispositivo  | Abandono en pasos avanzados      | Decir la limitación **antes** de empezar; resolver D2          |
| Las tarjetas de experiencia interrumpen la lectura | Se saltan párrafos               | En el flujo, no modales; máximo una por sección                |
| Completion Summary se lee como evaluación          | Se percibe como examen           | Recuento de actos; cuatro prohibiciones explícitas             |
| El firewall se erosiona con doce tipos de paso     | Un tipo nuevo «parece emocional» | Cada tipo entra con su ratchet o no entra                      |

---

## 8. Qué falta decidir antes del prototipo

| #   | Decisión                                                    | Recomendación                               |
| --- | ----------------------------------------------------------- | ------------------------------------------- |
| U1  | ¿Chapter Home es pantalla o panel plegable del lector?      | Panel — evita un salto antes de leer        |
| U2  | ¿Reanudación entre dispositivos antes de recorridos largos? | Sí; bloquea la fase 3 de la spec            |
| U3  | ¿Cuántas tarjetas de experiencia por capítulo en el texto?  | Una por sección; nunca dos seguidas         |
| U4  | ¿El Completion Summary es pantalla o estado del Player?     | Estado del Player — un salto menos          |
| U5  | ¿La duración estimada se muestra siempre?                   | Sí, y «—» cuando no hay dato. Nunca estimar |

---

## 9. Change Log

| Fecha      | Versión | Cambio                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-03 | 1.0     | Discovery UX inicial. Cinco perfiles con objetivo/riesgo/mitigación, journey del capítulo en seis momentos, nueve pantallas con estados vacío/cargando/completado, dos capítulos reales modelados con número de experiencias y duraciones, taxonomía de visibilidad de señales en tres niveles con tabla de decisión, y cuatro principios UX con su prueba. Sin código, sin migraciones, sin endpoints. |
