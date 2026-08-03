# Book Experience V2 — especificación de producto

```
BOOK_EXPERIENCE_V2_SPEC_VERSION=1.0
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

Esta es la especificación de producto de Book Experience V2. Consolida el
discovery de [`book-experience-v2-design.md`](book-experience-v2-design.md) en
definiciones cerradas: modelo, catálogo de pasos, modelo de señales, frontera con
el Mapa Emocional, pantallas y ejemplos reales.

**No implementa nada.** No define tablas, no define endpoints, no cambia
producción. Donde una definición contradiga al
[Book Experience Standard V1](book-experience-standard-v1.md) (v1.1), manda V1
hasta que esta especificación se apruebe.

**Relación entre los tres documentos:**

| Documento                        | Qué es                                      | Vigencia                |
| -------------------------------- | ------------------------------------------- | ----------------------- |
| `book-experience-standard-v1.md` | Autoridad de presentación **hoy**           | Vigente, implementado   |
| `book-experience-v2-design.md`   | Discovery: qué existe, qué supuestos romper | Insumo, no autoridad    |
| **este documento**               | Especificación de producto V2               | Pendiente de aprobación |

> **Autoridad, precedencia y vocabulario:** la sección canónica vive en
> [`../design/book-experience-v2-design-brief.md` §0](../design/book-experience-v2-design-brief.md).
> Resumen: V1 describe la producción actual
> ([`book-experience-standard-v1.md`](book-experience-standard-v1.md) y
> [`guided-reading-v1.md`](guided-reading-v1.md)); V2 describe el diseño
> objetivo. **V2 no ha reemplazado a la Guide V1**, cuyo lifecycle sigue intacto
> en producción. Un `ExperienceStep` de V2 **no es** una escena de V1, y una
> pantalla no implica un paso persistido.

---

## 1. Modelo mental del producto

### Antes

```
Chapter
 ├── Reader
 ├── Audio
 ├── Video
 └── Single Guide
```

El capítulo es el objeto. Los formatos son vistas suyas. La guía es un apéndice
de tamaño fijo. Cada pestaña promete «el mismo contenido, otra caja».

### Después

```
Chapter Experience
 ├── Reader Experience
 ├── Audio Experience
 ├── Video Experience
 ├── Podcast Experience
 ├── Activities
 └── Guided Experiences        (0..N)
```

El capítulo pasa a ser un **recorrido**. Cada rama es una obra con su propia
producción editorial, su propio estado y su propio criterio de «terminado». La
rama guiada deja de ser una guía y pasa a ser una colección de longitud libre.

### Las tres afirmaciones que definen V2

1. **Cada rama es una obra, no una vista.** El audiolibro narra, el podcast
   conversa, el video muestra. No son traducciones del texto.
2. **La unidad guiada es la experiencia guiada, no el capítulo.** Un capítulo
   puede tener cero, una o diez. Cada una es autónoma: se empieza, se recorre y
   se termina sola.
3. **El recorrido es visible antes de elegir.** El estado de cada rama se ve sin
   entrar en ninguna. El manifest ya lo permite desde V1.

### Lo que no cambia

El texto del libro es el contenido principal. Ninguna rama es obligatoria,
ninguna experiencia guiada bloquea la lectura, y ninguna pantalla evalúa a la
persona.

---

## 2. Modelo dinámico de experiencias guiadas

Tres entidades conceptuales. **Ninguna es una tabla**; son el vocabulario con el
que se decide, y su forma persistida se define cuando se apruebe implementar.

### 2.1 `ChapterExperience`

El recorrido completo de un capítulo.

```
ChapterExperience
  bookSlug          identidad editorial
  chapterOrder      orden de PLATAFORMA (ojo: puede no ser el del libro)
  modes             qué ramas ofrece y en qué estado
  experiences       Experience[]            (0..N, ordenadas)
  synthesis         Experience | null       (cierre opcional del recorrido)
```

`experiences` es una **lista ordenada de longitud libre**. Cero es un valor
válido y frecuente: la mayoría de los capítulos hoy no tienen ninguna.

### 2.2 `Experience`

Una experiencia guiada: **una idea, trabajada hasta el final**.

```
Experience
  experienceKey     identificador estable, inmutable una vez publicado
  version           entero; el par (key, version) es el pin
  title             lo que la persona lee en el índice
  conceptKey        el concepto que trabaja (opcional)
  steps             ExperienceStep[]        (1..M, ordenados)
  prerequisites     experienceKey[]         (vacío por defecto)
```

`steps` ya es exactamente la forma que tiene hoy `GuideDefinition.steps`: un
array ordenado sin longitud fija. **El dominio no necesita cambiar para soportar
diez pasos.**

`prerequisites` existe para un solo caso legítimo: la síntesis, que solo tiene
sentido después del recorrido. Se usa con moderación — encadenar
experiencias guiadas convierte un acompañamiento en un curso.

### 2.3 `ExperienceStep`

Un paso.

```
ExperienceStep
  stepKey           único dentro de la Experience
  order             entero ≥ 1
  required          true | false            (V2 admite pasos opcionales; V1 no)
  kind              uno de los 12 tipos (§3)
  completionPolicy  cómo se da por terminado
  payload           depende del kind (conceptKey, itemKey, mediaKey, prompt…)
```

### 2.4 Las cuatro cardinalidades exigidas

| Caso                | Cómo se representa                                | ¿Necesita código nuevo?                       |
| ------------------- | ------------------------------------------------- | --------------------------------------------- |
| **0 experiencias**  | `experiences: []` → la rama guiada queda `HIDDEN` | No. El estándar V1 ya oculta lo que no existe |
| **1 experiencia**   | Una `Experience` con sus pasos                    | No en el dominio; sí en el renderer (§8)      |
| **3 experiencias**  | Tres `Experience` + índice                        | Índice de experiencias (pantalla nueva)       |
| **10 experiencias** | Diez `Experience` + índice + síntesis             | Lo mismo, más la decisión de reanudación      |

**Ninguna de las cuatro requiere cambiar `steps[]`.** Lo que hay que cambiar es
la presentación: hoy `guide-scene.ts` tiene ocho escenas nombradas y fijas.

### 2.5 Reglas de integridad

- `experienceKey` es **inmutable** una vez publicada. Cambiarla huérfana las
  sesiones y las resonancias que la referencian. Se añaden claves; no se
  renombran. (Misma disciplina que `conceptKey` en `Resonance` hoy.)
- El pin `(experienceKey, version)` identifica **una definición exacta**.
  Publicar una versión nueva no reinterpreta las sesiones de la anterior.
- Los pasos con `required: false` no cuentan para completar la experiencia.
- Una `Experience` sin pasos es inválida. Un `ChapterExperience` sin
  experiencias es válido y común.

---

## 3. Catálogo de tipos de pasos

Doce tipos en cuatro familias. La columna **«¿Existe hoy?»** distingue lo que ya
está implementado de lo que es propuesta de esta especificación.

Cada tipo declara cuatro cosas, y la tercera es la que impide mentir:

- **Objetivo** — para qué está el paso.
- **UI esperada** — qué ve la persona.
- **Cómo termina** — su `completionPolicy`.
- **¿Verificable?** — si el servidor puede _saber_ que se cumplió, o solo
  registrar que alguien lo declaró.
- **¿Genera señal?** — qué evento produce, y a dónde va.

> **Regla de honestidad.** Si un paso no es verificable, su política dice
> autoinforme y su señal se registra como autoinforme. Nunca se presenta un
> autoinforme como una medición. Es la misma disciplina que ya sostiene
> `explicit_confirmation` frente a `objective_recall` en el catálogo actual.

### 3.1 Familia CONTENT

#### `INTRO`

|                    |                                                                           |
| ------------------ | ------------------------------------------------------------------------- |
| **Objetivo**       | Encuadrar: qué vamos a mirar y por qué                                    |
| **UI esperada**    | Texto corto, un botón «Empezar». Sin interacción                          |
| **Cómo termina**   | `acknowledged` — la persona avanza                                        |
| **¿Verificable?**  | No aplica: no afirma nada sobre nadie                                     |
| **¿Genera señal?** | No                                                                        |
| **¿Existe hoy?**   | ⬜ Nuevo (la escena `cover` cumple algo parecido, atada a la guía entera) |

#### `PASSAGE`

|                    |                                                                 |
| ------------------ | --------------------------------------------------------------- |
| **Objetivo**       | Llevar al pasaje del capítulo que sostiene la idea              |
| **UI esperada**    | Cita + botón «Ir al pasaje» (scroll + resaltado temporal)       |
| **Cómo termina**   | `acknowledged` — la persona vuelve y avanza                     |
| **¿Verificable?**  | No. El anchor se resuelve en cliente                            |
| **¿Genera señal?** | No                                                              |
| **¿Existe hoy?**   | ⬜ Nuevo como paso; el mecanismo de anchor **ya existe** (GR-4) |

> El anchor por pin ya está implementado y probado (`guideAnchorRegistry`,
> resolución exacta o `null`, nunca fallback). V2 lo reusa tal cual.

#### `CONCEPT`

|                    |                                                                |
| ------------------ | -------------------------------------------------------------- |
| **Objetivo**       | Presentar la idea y pedir una confirmación explícita           |
| **UI esperada**    | Enunciado + «Lo tengo»                                         |
| **Cómo termina**   | `explicit_confirmation`                                        |
| **¿Verificable?**  | **No.** Es autoinforme de haber leído, no de haber comprendido |
| **¿Genera señal?** | `concept_explored` → **LearningDashboard**. Nunca al Mapa      |
| **¿Existe hoy?**   | ✅ `CONCEPT_EXPLORATION`                                       |

#### `EXAMPLE`

|                    |                                                            |
| ------------------ | ---------------------------------------------------------- |
| **Objetivo**       | Mostrar la idea aplicada a una situación concreta          |
| **UI esperada**    | Viñeta breve, opcionalmente con dos variantes contrastadas |
| **Cómo termina**   | `acknowledged`                                             |
| **¿Verificable?**  | No aplica                                                  |
| **¿Genera señal?** | No                                                         |
| **¿Existe hoy?**   | ⬜ Nuevo                                                   |

> **Restricción editorial.** El ejemplo lo escribe el autor. Un ejemplo generado
> es una afirmación psicológica inventada, que es exactamente lo que §8 prohíbe.

### 3.2 Familia MEDIA

#### `AUDIO`

|                    |                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------- |
| **Objetivo**       | Un audio breve dentro de la experiencia guiada (guía de respiración, lectura del pasaje) |
| **UI esperada**    | Reproductor mínimo: play/pausa, duración. Sin velocidad ni temporizador                  |
| **Cómo termina**   | `media_ended` — el reproductor llegó al final                                            |
| **¿Verificable?**  | **Sí**, a nivel de finalización                                                          |
| **¿Genera señal?** | `chapter_media_completed` → **LearningDashboard**                                        |
| **¿Existe hoy?**   | ⬜ Nuevo como paso; el catálogo y la firma **ya existen** (Chapter Media)                |

#### `VIDEO`

|                    |                                                                     |
| ------------------ | ------------------------------------------------------------------- |
| **Objetivo**       | Un video breve dentro de la experiencia guiada                      |
| **UI esperada**    | Reproductor embebido, subtítulos si existen, transcripción plegable |
| **Cómo termina**   | `media_ended`                                                       |
| **¿Verificable?**  | **Sí**, a nivel de finalización                                     |
| **¿Genera señal?** | `chapter_media_completed` → **LearningDashboard**                   |
| **¿Existe hoy?**   | ⬜ Nuevo como paso; el reproductor **ya existe**                    |

> **Regla heredada de V1, sin excepción:** un paso `AUDIO` o `VIDEO` sin activo
> reproducible **no se muestra**. No hay «próximamente» dentro de una
> experiencia guiada: eso rompería el recorrido a media secuencia.

### 3.3 Familia INTERACTION

#### `PRACTICE`

|                    |                                                                        |
| ------------------ | ---------------------------------------------------------------------- |
| **Objetivo**       | Proponer hacer algo fuera de la pantalla                               |
| **UI esperada**    | Instrucción + temporizador opcional (local) + «Ya lo hice»             |
| **Cómo termina**   | `catalog_practice_confirmation`                                        |
| **¿Verificable?**  | **No.** El servidor no puede saber si alguien respiró diez minutos     |
| **¿Genera señal?** | `practice_completed` → **LearningDashboard**, marcada como autoinforme |
| **¿Existe hoy?**   | ✅ `CATALOG_PRACTICE`                                                  |

#### `REFLECTION`

|                    |                                                                            |
| ------------------ | -------------------------------------------------------------------------- |
| **Objetivo**       | Escribir sobre lo propio                                                   |
| **UI esperada**    | Composer sembrado con la consigna; entrada **cifrada E2E**                 |
| **Cómo termina**   | `self_reported` — «Ya la escribí»                                          |
| **¿Verificable?**  | **No, y no debe serlo.** El texto está cifrado; el servidor no lo ve       |
| **¿Genera señal?** | **Ninguna nueva.** El `DiaryEntry` ya es el registro                       |
| **¿Existe hoy?**   | ⬜ Nuevo como paso; el composer **ya existe** (pestaña Reflexión del dock) |

> **Decisión cerrada (era D5).** `REFLECTION` se completa por **autoinforme**.
> La alternativa —que el cliente reporte «se guardó una entrada»— introduce una
> señal derivada del Diario que hoy no existe, por un beneficio pequeño. Se
> descarta. El paso queda al mismo nivel de honestidad que `PRACTICE`.

#### `QUESTION`

|                    |                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------- |
| **Objetivo**       | Una pregunta abierta, sin respuesta correcta                                             |
| **UI esperada**    | Pregunta + campo de texto **local, no persistido**, o simplemente un espacio para pensar |
| **Cómo termina**   | `acknowledged`                                                                           |
| **¿Verificable?**  | No                                                                                       |
| **¿Genera señal?** | No                                                                                       |
| **¿Existe hoy?**   | ⬜ Nuevo                                                                                 |

> Si la persona quiere guardar lo que pensó, el camino es `REFLECTION` — cifrado
> y bajo su control. `QUESTION` no persiste texto en ninguna parte.

#### `RECALL`

|                    |                                                                            |
| ------------------ | -------------------------------------------------------------------------- |
| **Objetivo**       | Recuperación activa: recordar algo del capítulo                            |
| **UI esperada**    | Pregunta + opciones + feedback tras responder                              |
| **Cómo termina**   | `objective_recall` — **corregido en el servidor**                          |
| **¿Verificable?**  | **Sí.** La respuesta correcta vive solo en el catálogo del servidor        |
| **¿Genera señal?** | `active_recall_attempted` → **LearningDashboard**                          |
| **¿Existe hoy?**   | ✅ `ACTIVE_RECALL` (catálogo `Exercise.type = QUIZ` con contrato estricto) |

> **Restricción de producto:** el resultado del recall **no produce puntaje ni
> nivel**. Se registra el intento; la persona ve si acertó. No hay acumulado, no
> hay racha, no hay porcentaje de aciertos en ninguna pantalla.

### 3.4 Familia CLOSURE

#### `SUMMARY`

|                    |                                                                                  |
| ------------------ | -------------------------------------------------------------------------------- |
| **Objetivo**       | Cerrar: qué recorriste                                                           |
| **UI esperada**    | Lista de lo hecho en la experiencia guiada (o en el capítulo, si es la síntesis) |
| **Cómo termina**   | `acknowledged`                                                                   |
| **¿Verificable?**  | No aplica                                                                        |
| **¿Genera señal?** | No (la completitud ya la da `guide_session_completed`)                           |
| **¿Existe hoy?**   | ⬜ Nuevo (la escena `finish` cumple algo parecido)                               |

> **Prohibido en `SUMMARY`:** evaluación, puntaje, comparación con otras
> personas, comparación con uno mismo en el tiempo, interpretación de lo
> escrito. Es un recuento de actos, no un juicio.

#### `RESONANCE`

|                    |                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------- |
| **Objetivo**       | Ofrecer confirmar que un concepto resonó                                               |
| **UI esperada**    | «¿Te resonó _«El cuerpo sabe antes que la mente»_?» → **Sí, me resonó** / **Ahora no** |
| **Cómo termina**   | `acknowledged` — **con o sin confirmación**                                            |
| **¿Verificable?**  | **Sí**: la confirmación es el dato                                                     |
| **¿Genera señal?** | Solo si confirma: `Resonance` con `source: GUIDE` → **Mapa Emocional** (ARC-C1)        |
| **¿Existe hoy?**   | ⬜ Nuevo como paso; el ciclo ARC y `source: GUIDE` **ya existen**                      |

> **La regla del ciclo ARC, sin cambios:** la oferta no es el dato; la
> confirmación sí. «Ahora no» completa el paso y **no persiste nada**. Es el
> único paso de los doce que puede llegar al Mapa Emocional, y llega porque la
> persona lo dijo.

### 3.5 Resumen del catálogo

| Familia     | Paso         | Verificable | Señal                     | Destino     | Existe |
| ----------- | ------------ | ----------- | ------------------------- | ----------- | ------ |
| CONTENT     | `INTRO`      | n/a         | —                         | —           | ⬜     |
| CONTENT     | `PASSAGE`    | No          | —                         | —           | ⬜     |
| CONTENT     | `CONCEPT`    | No          | `concept_explored`        | Aprendizaje | ✅     |
| CONTENT     | `EXAMPLE`    | n/a         | —                         | —           | ⬜     |
| MEDIA       | `AUDIO`      | Sí          | `chapter_media_completed` | Aprendizaje | ⬜     |
| MEDIA       | `VIDEO`      | Sí          | `chapter_media_completed` | Aprendizaje | ⬜     |
| INTERACTION | `PRACTICE`   | No          | `practice_completed`      | Aprendizaje | ✅     |
| INTERACTION | `REFLECTION` | No          | —                         | —           | ⬜     |
| INTERACTION | `QUESTION`   | No          | —                         | —           | ⬜     |
| INTERACTION | `RECALL`     | **Sí**      | `active_recall_attempted` | Aprendizaje | ✅     |
| CLOSURE     | `SUMMARY`    | n/a         | —                         | —           | ⬜     |
| CLOSURE     | `RESONANCE`  | Sí          | `Resonance` (si confirma) | **Mapa**    | ⬜     |

**Doce tipos. Once nunca tocan el Mapa Emocional.**

El vocabulario de ocho eventos de aprendizaje **alcanza para los doce**. No hace
falta un tipo de evento nuevo.

---

## 4. Signal Model V1

Tres niveles. La regla que los separa:

```
BEHAVIOR_IS_NOT_EMOTION=true
```

### 4.1 Explicit Signals

**Definición:** actos en los que la persona **declara algo sobre sí misma**,
sabiendo que lo declara, en un momento que puede señalar.

| Señal                        | Acto                       | Modelo                         | Existe |
| ---------------------------- | -------------------------- | ------------------------------ | ------ |
| Registro de ánimo            | Elige una cara en el chip  | —                              | ✅     |
| Micro-checkin                | Responde un ítem 0–4       | `CHK-S1`                       | ✅     |
| Resonancia confirmada        | «Sí, me resonó»            | `ARC-C1`                       | ✅     |
| Tema marcado como importante | Marca ⭐ una resonancia    | `ARC-P1`                       | ✅     |
| Reflexión escrita            | Guarda una entrada cifrada | `TXT-L1` (opt-in, descriptivo) | ✅     |

**Tres propiedades obligatorias** de toda señal explícita:

1. **Momento señalable** — la persona puede decir «lo dije ahí».
2. **Procedencia visible** — la UI muestra de dónde vino y cuándo.
3. **Revocable** — se puede borrar, y borrarla la quita del Mapa.

V2 **no añade una clase nueva** de señal explícita. Añade **ocasiones**: el paso
`RESONANCE` es un momento más para el mismo acto.

### 4.2 Interaction Signals

**Definición:** actos que describen el **recorrido por el material**. Dicen qué
hizo la persona con el contenido, no cómo está.

| Señal                      | Evento                           | Verificable      |
| -------------------------- | -------------------------------- | ---------------- |
| Crear un highlight         | (tabla propia)                   | Sí               |
| Escribir una nota          | (tabla propia)                   | Sí               |
| Confirmar un concepto      | `concept_explored`               | No — autoinforme |
| Completar una práctica     | `practice_completed`             | No — autoinforme |
| Responder un recall        | `active_recall_attempted`        | **Sí**           |
| Terminar audio/video       | `chapter_media_completed`        | Sí               |
| Abrir / completar capítulo | `unit_opened` / `unit_completed` | Sí               |

**Destino: LearningDashboard (Mi Evolución). Nunca el Mapa Emocional.**

El caso tentador es `concept_explored`: parece una declaración («esto me
habla»). No lo es — significa «leí esto y sigo». Por eso el ciclo ARC existe: si
algo resonó de verdad, hay un acto **distinto y explícito** para decirlo.

### 4.3 Behavioral Signals

**Definición:** subproductos de usar la aplicación. Miden uso, no persona.

Tiempo de lectura · tiempo de escucha · porcentaje de video · racha · número de
highlights · mensajes a Eco · reintentos · orden de navegación · abandono ·
frecuencia de sesión.

**Destino: producto agregado y anónimo (Pulso), o ninguno.** Nunca al perfil de
nadie, nunca al Mapa Emocional.

### 4.4 Las señales que V2 decide NO crear

| No se crea                                       | Por qué                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Porcentaje de audio/video visto                  | Granularidad de finalización basta; un mapa de atención es vigilancia |
| Tiempo por paso                                  | Solo sirve para diagnóstico de producto; en el perfil, para juzgar    |
| Reintentos de recall                             | Contar equivocaciones produce un dato cuyo uso natural es juzgar      |
| Abandono de experiencia guiada                   | Salir de algo no es un dato sobre quien sale                          |
| Cualquier derivado del texto del Diario o de Eco | El texto es suyo. El firewall no se toca                              |

### 4.5 La regla, escrita para que se pueda verificar

> Una señal entra al Mapa Emocional **solo si** la persona puede señalar el
> momento exacto en que la declaró, ver de dónde vino, y borrarla.
>
> Todo lo demás es aprendizaje o es uso.

---

## 5. Emotional Map Integration

### 5.1 Qué alimenta el Mapa Emocional

| Fuente                             | Eje                                | Modelo            |
| ---------------------------------- | ---------------------------------- | ----------------- |
| Registro de ánimo (serie temporal) | calma (dinámica)                   | `OU-GT` / `OU-G0` |
| Micro-checkin                      | claridad · compasión · consciencia | `CHK-S1`          |
| Resonancia confirmada              | conexión                           | `ARC-C1`          |
| Tema marcado como importante       | propósito                          | `ARC-P1`          |
| Análisis local del texto (opt-in)  | descriptivo, **no puntúa ejes**    | `TXT-L1`          |

Los seis ejes son `calma · claridad · conexión · propósito · compasión ·
consciencia`.

**Aportación de V2:** el paso `RESONANCE` es una ocasión más para `ARC-C1` y
`ARC-P1`. Ninguna fuente nueva, ningún eje nuevo, ningún modelo nuevo.

### 5.2 Qué NO alimenta el Mapa Emocional

Todo lo demás. Explícitamente:

- Completar una experiencia guiada, un capítulo, un audio o un video.
- Confirmar un concepto, completar una práctica, acertar un recall.
- Crear highlights o notas.
- Escribir una reflexión (el **texto** nunca; el análisis local solo con opt-in y
  solo como descripción de lenguaje).
- Conversar con Eco.
- Cualquier medida de tiempo, frecuencia o navegación.

### 5.3 Los dos ejemplos que fijan la frontera

**Permitido:**

```
La persona termina el paso RESONANCE y pulsa «Sí, me resonó».
→ Se persiste Resonance { conceptKey, source: GUIDE, confirmedAt }
→ El eje «conexión» sube, con procedencia visible:
  «Confirmado por ti · Cap. 1 · 3 ago»
→ La persona puede borrarlo, y el eje baja.
```

Es admisible porque **la persona lo dijo**, sabe que lo dijo, ve que lo dijo y
puede deshacerlo.

**No permitido:**

```
La persona ve 20 minutos de video.
→ ❌ «Nivel de compromiso alto»
→ ❌ «Interés en el tema X»
→ ❌ cualquier ajuste de cualquier eje
```

Es inadmisible porque **nadie declaró nada**. Ver un video es un hecho sobre un
video. Convertirlo en un hecho sobre una persona es inventar.

### 5.4 Cómo se sostiene la frontera

No con disciplina, sino con pruebas que fallan:

| Defensa                             | Qué garantiza                                             |
| ----------------------------------- | --------------------------------------------------------- |
| `emotional-map.v2-contract.spec.ts` | Con V2 activo, +actividad ⇒ el mapa no cambia             |
| `copy-contract.spec.ts`             | Términos prohibidos en superficie pública rompen el build |
| `learning-firewall` (pg-spec)       | Los eventos de aprendizaje no escriben en el mapa         |
| Model Registry                      | Cada modelo declara entradas, límites y copy permitido    |

**Obligación de V2:** cada tipo de paso nuevo entra con su caso en el ratchet.
Doce tipos son doce oportunidades de que algo se cuele «porque parece
emocional».

---

## 6. UX Screens

Wireframes textuales. Cada pantalla define objetivo, contenido, acciones y los
tres estados que V1 dejó definidos más el cuarto que V2 añade.

### 6.1 Chapter Home

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

- **Acciones:** entrar a una rama · continuar donde quedó.
- **Vacío:** un capítulo sin medios ni experiencias muestra solo «📖 Leer» y
  entra directo. La cabecera no aparece: no hay recorrido que mostrar.
- **Coming soon:** fila deshabilitada con «Próximamente». No navega.
- **Completed:** ✓ discreto. **No bloquea**: se puede volver a entrar.

### 6.2 Leer

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
│   …continúa el texto                             │
│                                                  │
│ [ ✓ Marcar capítulo como leído ]                 │
└──────────────────────────────────────────────────┘
```

- **Contenido:** bloques tipados (`PARAGRAPH · HEADING · QUOTE · EXERCISE ·
AUDIO · IMAGE · PAUSE · VIDEO`).
- **Acciones:** subrayar · anotar · abrir el panel compañero (Eco · Notas ·
  Reflexión) · entrar a una experiencia desde su punto del texto.
- **Vacío:** un capítulo sin bloques es un fallo de contenido, no un estado —
  falla cerrado y lo dice.
- **Completed:** la barra queda al 100 % y el botón cambia a «Leído ✓», sin
  bloquear la relectura.

> **No cambia respecto de V1:** el texto es una columna de lectura, no una
> colección de tarjetas.

### 6.3 Escuchar

**Objetivo:** escuchar la obra en audio. Dos subformatos, gateados por el mismo
view model.

```
┌──────────────────────────────────────────────────┐
│ 📖 Leer  🎧 Escuchar  🎬 Ver  🌱 Experiencias    │
├──────────────────────────────────────────────────┤
│        [ Audiolibro ]  [ Podcast · Próximamente ]│
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ ▶  ━━━━━━━━━●─────────────  08:42 / 18:03    │ │
│ │    Cap. 1 · El cuerpo sabe antes que la mente│ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ Segmentos                                        │
│  1. Apertura     2. Desarrollo    3. Cierre      │
│                                                  │
│ ▸ Mostrar transcripción                          │
└──────────────────────────────────────────────────┘
```

- **Acciones:** reproducir · cambiar subformato (solo si es reproducible) ·
  abrir transcripción.
- **Vacío:** si ningún subformato es reproducible, la pestaña ni siquiera está
  habilitada (regla de familia de audio, ya implementada).
- **Coming soon:** subformato deshabilitado con «Próximamente». No se
  selecciona, no monta panel, **no pide URL firmada**.
- **Completed:** ✓ junto al subformato terminado.

### 6.4 Podcast

**Objetivo:** la conversación sobre el capítulo — **no** la narración.

```
┌──────────────────────────────────────────────────┐
│        [ Audiolibro ]  [ Podcast ]               │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ ▶  ━━━━●───────────────────  03:12 / 24:50   │ │
│ │    «Cuando el cuerpo habla primero»          │ │
│ │    Con David Jaramillo                       │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ Notas del episodio                               │
│ Ideas principales                                │
│ ▸ Vínculo al capítulo                            │
└──────────────────────────────────────────────────┘
```

- **Alcance actual:** subformato dentro de Escuchar, **no** pestaña de primer
  nivel (`PODCAST_FIRST_CLASS_READER_MODE=false`). Promoverlo requiere episodios
  producidos; una pestaña sin destino es el problema que V1 corrige.
- **Vacío / coming soon / completed:** igual que Escuchar.

### 6.5 Video

**Objetivo:** ver el video del capítulo. Distinto del video **inline**, que vive
dentro del texto como una cápsula.

```
┌──────────────────────────────────────────────────┐
│ 📖 Leer  🎧 Escuchar  🎬 Ver  🌱 Experiencias    │
├──────────────────────────────────────────────────┤
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

- **Vacío:** sin video producido, la pestaña se oculta.
- **Coming soon:** deshabilitada, solo si editorialmente se anuncia.
- **Completed:** ✓ por elemento de la playlist y en la pestaña cuando todos
  terminaron.

### 6.6 Experiencias guiadas

Dos pantallas: el índice y el reproductor.

#### 6.6.1 Índice de experiencias

**Objetivo:** mostrar el recorrido guiado del capítulo y dónde quedó la persona.

```
┌──────────────────────────────────────────────────┐
│ 🌱 Experiencias · Cap. 1                         │
│ Guía breve · 4 experiencias · ~18 min            │
├──────────────────────────────────────────────────┤
│ 1 · El cuerpo sabe antes que la mente  ✓         │
│     4 pasos                                      │
│                                                  │
│ 2 · Escucharte por dentro              ▸ paso 2/3│
│     3 pasos                        [ Continuar ] │
│                                                  │
│ 3 · Respirar antes de seguir           ○         │
│     2 pasos                        [ Empezar ]   │
│                                                  │
│ 4 · Síntesis                           🔒        │
│     Al completar 1–3                             │
└──────────────────────────────────────────────────┘
```

- **Acciones:** empezar · continuar · rehacer una completada.
- **Vacío (0 experiencias):** la pestaña **no existe**. Ausencia, no mensaje.
- **Coming soon:** no aplica — una experiencia anunciada y no producida
  simplemente no se publica.
- **Completed:** ✓ por experiencia; con todas las requeridas listas, la pestaña
  muestra ✓ en Chapter Home.

#### 6.6.2 Reproductor de experiencia guiada

**Objetivo:** recorrer los pasos de **una** experiencia guiada.

```
┌──────────────────────────────────────────────────┐
│ ← Escucharte por dentro          ● ● ○           │
├──────────────────────────────────────────────────┤
│                                                  │
│  PRACTICE                                        │
│                                                  │
│  Durante los próximos minutos, cierra los ojos   │
│  y recorre tu cuerpo de arriba abajo…            │
│                                                  │
│  ⏱ 2:00                                          │
│                                                  │
│                        [ Ya lo hice ]            │
│                                                  │
├──────────────────────────────────────────────────┤
│ Salir · tu avance queda guardado                 │
└──────────────────────────────────────────────────┘
```

- **Contenido:** un paso a la vez. El indicador `● ● ○` es la posición, no un
  puntaje.
- **Acciones:** completar el paso · salir (sin perder avance) · volver al paso
  anterior si el tipo lo permite.
- **Vacío:** una experiencia sin pasos es inválida y no se publica.
- **Completed:** al terminar, `SUMMARY` o vuelta al índice con ✓.

> **Cambio estructural respecto de hoy:** este reproductor renderiza **por tipo
> de paso**. Las ocho escenas fijas de `guide-scene.ts` desaparecen.

### 6.7 Mapa emocional evolucionado

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
│ │  Calma 72 ±8      · Tu ánimo                 │ │
│ │  Claridad 88      · Tu check-in              │ │
│ │  Conexión 50      · Tus resonancias          │ │
│ │  Propósito        · Reuniendo datos          │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ ┌ Mis resonancias ─────────────────────────────┐ │
│ │ ⭐ El cuerpo sabe antes que la mente          │ │
│ │    Confirmado por ti · Cap. 1 · 3 ago  [Quitar]│
│ │    Desde: una experiencia guiada             │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ Tu recorrido por los libros vive en Mi Evolución │
└──────────────────────────────────────────────────┘
```

- **Contenido:** momento (ánimo literal) · radar de autoinforme · resonancias
  con procedencia · narrativa opcional.
- **Cambio de V2:** las resonancias que vienen de una experiencia guiada muestran
  ese origen (`source: GUIDE`), igual que hoy muestran highlight / Eco /
  ejercicio.
- **Vacío:** ejes sin señal dicen «Reuniendo datos». **Nunca un número
  inventado.**
- **Prohibido:** porcentaje global, «comprensión emocional N %», cualquier eje
  alimentado por actividad.

---

## 7. Ejemplos reales

### 7.1 _Emociones en Construcción_ · capítulo 1

**Hoy:** una guía de tres pasos (`concepto → práctica → recall`).

**Especificado:** cuatro experiencias guiadas.

```
ChapterExperience
  bookSlug     emociones-en-construccion
  chapterOrder 1
  modes        Leer ✓ · Escuchar (audiolibro) · Ver ✗ · Experiencias
  experiences  [1, 2, 3]
  synthesis    4
```

| #   | Experiencia                       | Pasos                                      | Señales generadas                                                                           |
| --- | --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 1   | El cuerpo sabe antes que la mente | `INTRO` → `PASSAGE` → `CONCEPT` → `RECALL` | `guide_session_started/completed`, `concept_explored`, `active_recall_attempted`            |
| 2   | Escucharte por dentro             | `PRACTICE` → `REFLECTION` → `RESONANCE`    | `guide_session_*`, `practice_completed`, y **solo si confirma**: `Resonance{source: GUIDE}` |
| 3   | Respirar antes de seguir          | `AUDIO` → `QUESTION`                       | `guide_session_*`, `chapter_media_completed`                                                |
| 4   | Síntesis                          | `SUMMARY`                                  | `guide_session_*`                                                                           |

**Al Mapa Emocional:** únicamente la resonancia de la experiencia 2, **si** la
persona pulsa «Sí, me resonó». Las otras once señales van a Mi Evolución.

**Se reusa tal cual:** el anchor del pasaje (GR-4), el concepto
`eec-cuerpo-antes-que-mente`, la práctica del catálogo, el ítem de recall, el
ejercicio de respiración de `CHAPTER_EXERCISES`, el ciclo ARC.

**Falta producir:** tres conceptos más (hoy hay uno por capítulo), el audio de la
experiencia 3, y los textos de `INTRO` / `EXAMPLE` / `QUESTION` / `SUMMARY`.

### 7.2 _Parejas que perduran_ · capítulo 1

**Hoy:** una guía de tres pasos.

**Especificado:** dos experiencias guiadas, deliberadamente cortas.

```
ChapterExperience
  bookSlug     parejas-que-perduran
  chapterOrder 2          ← el capítulo 1 del LIBRO es el orden 2 de PLATAFORMA
  modes        Leer ✓ · Escuchar ✗ · Ver ✗ · Experiencias
  experiences  [1, 2]
  synthesis    null
```

| #   | Experiencia                       | Pasos                                   | Señales generadas                                                                           |
| --- | --------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | El contacto sostenido en silencio | `PASSAGE` → `CONCEPT` → `RECALL`        | `guide_session_*`, `concept_explored`, `active_recall_attempted`                            |
| 2   | Diez minutos de contacto          | `PRACTICE` → `REFLECTION` → `RESONANCE` | `guide_session_*`, `practice_completed`, y **solo si confirma**: `Resonance{source: GUIDE}` |

**Dos restricciones editoriales que no se pueden perder:**

1. **`chapterOrder = 2`.** El manifest de ingesta le dio el orden 1 al prefacio.
   Un catálogo que use 1 ancla las experiencias al prefacio.
2. **`SOURCE_QUALITY=OCR_UNFINALIZED`.** La edición es OCR sin finalizar; los
   anchors **se revalidan** cuando llegue el máster. Más anchors, más
   revalidación — es un costo real, no un detalle.

### 7.3 Lo que estos dos ejemplos demuestran

| Requisito                | Demostrado por                                     |
| ------------------------ | -------------------------------------------------- |
| 0 experiencias           | Cualquier capítulo sin catálogo (la mayoría hoy)   |
| 1 experiencia            | Un capítulo con solo la #1 de Parejas              |
| 3 experiencias           | EEC sin síntesis                                   |
| 10 experiencias          | Misma estructura; solo cambia el largo de la lista |
| Pasos heterogéneos       | EEC #1 (sin media) vs #3 (con audio)               |
| Longitud variable        | EEC #3 tiene 2 pasos; EEC #1 tiene 4               |
| Señal explícita opcional | `RESONANCE` con «Ahora no» no persiste nada        |

---

## 8. Decisiones técnicas

### 8.1 YA EXISTE — se reusa sin cambios

| Pieza               | Qué aporta a V2                                                                         |
| ------------------- | --------------------------------------------------------------------------------------- |
| **GuideDefinition** | `steps[]` ya es array ordenado de longitud libre. **Soporta 10 pasos hoy**              |
| **Learning Events** | Los 8 tipos V1 cubren los 12 tipos de paso. Idempotencia server-derived, escritor único |
| **Resonance**       | Ciclo ARC completo, `source: GUIDE` ya contemplado, `important` para propósito          |
| **Emotional Map**   | 10 modelos, 6 ejes, procedencia por eje, ratchets del firewall                          |
| **Content Core**    | `Edition · ContentUnit · ContentBlock · Concept · ConceptLink` — el grafo de contenido  |
| **Chapter Media**   | Catálogo, gating por reproducibilidad, firma bajo demanda, evento de finalización       |
| **Guide anchors**   | Resolución exacta por pin, `null` sin fallback (GR-4)                                   |
| **Companion dock**  | Eco · Notas · Reflexión, con la separación plaintext / E2E ya resuelta                  |

**Conclusión:** el dominio de V2 **ya está construido en un 80 %**. El trabajo
no es de arquitectura de datos.

### 8.2 CAMBIAR

#### Renderer de escenas — el cambio central

```
HOY:   guide-scene.ts → 8 escenas nombradas y fijas
       cover · clip · anchor · practice · recall · feedback · finish · completed

V2:    un componente por tipo de paso (12)
       la secuencia es dato, no código
       posición local = { experienceKey, stepKey }, no un enum
```

Es un cambio grande de cliente y **cero cambio del contrato de dominio**.

#### Modelo visual

- Cabecera de recorrido en Chapter Home.
- Índice de experiencias (pantalla nueva).
- Cuarto estado `COMPLETED` en el view model de modos.
- Reproductor de experiencia guiada sustituyendo al de guía.

#### Consecuencias que hay que aceptar

| Cambio                          | Consecuencia                                                  |
| ------------------------------- | ------------------------------------------------------------- |
| `guideKey` → experiencia guiada | Una sesión por experiencia guiada, no por capítulo            |
| Varios conceptos por capítulo   | `CHAPTER_CONCEPTS` pasa de objeto a lista (claves inmutables) |
| Pasos opcionales                | `required` deja de ser literal `true` en el validador         |
| Recorridos largos               | La reanudación entre dispositivos deja de ser opcional        |

### 8.3 CREAR — futuro

#### Experience manifest

Un documento por capítulo que declara el recorrido completo:

```
ExperienceManifest
  bookSlug · chapterOrder
  experiences[]  → { experienceKey, version, title, conceptKey, steps[] }
  synthesis?
```

**Tres decisiones abiertas sobre el manifest** (no se resuelven aquí):

1. **¿Dónde vive?** Catálogo en código (como Chapter Media y Guides hoy) o tabla
   (como pediría Author B2B). El criterio de V1 sigue vigente: catálogo en
   código mientras sea pequeño; el diff revisado es la garantía.
2. **¿Quién lo publica?** Hoy es un PR con aprobación editorial. Con diez
   capítulos × cuatro experiencias, eso deja de escalar.
3. **¿Cómo versiona?** El pin `(experienceKey, version)` es inmutable; publicar
   v2 no debe reinterpretar sesiones de v1.

#### Lo que NO se crea

- **No** un segundo catálogo de medios. Los pasos `AUDIO` / `VIDEO` reusan
  Chapter Media. (Regla explícita de V1.)
- **No** tipos de Learning Event nuevos. Los ocho alcanzan.
- **No** un eje nuevo del Mapa Emocional.
- **No** una tabla de actividades. `CHAPTER_EXERCISES` sigue siendo cliente
  hasta que algo lo exija.

### 8.4 Orden sugerido de implementación

Cada fase entrega valor sola y es reversible.

| Fase | Qué                                                                          | Riesgo                      |
| ---- | ---------------------------------------------------------------------------- | --------------------------- |
| 1    | Estado `COMPLETED` en el view model (solo lectura de señales que ya existen) | Bajo                        |
| 2    | Renderer por tipo de paso, manteniendo las guías de 3 pasos                  | Medio                       |
| 3    | Índice de experiencias + varias `Experience` por capítulo                    | Medio                       |
| 4    | Tipos de paso nuevos, de a uno, cada uno con su ratchet                      | Medio                       |
| 5    | Reanudación entre dispositivos                                               | Alto (endpoint nuevo)       |
| 6    | Experience manifest formal                                                   | Alto (decisión de gobierno) |

**La fase 1 no requiere aprobar esta especificación.** Es honestidad sobre datos
que ya existen.

---

## 9. Restricciones de producto — no negociables

Heredadas y ampliadas. No son preferencias.

### No inferir emociones

Ni del texto, ni del ritmo, ni de la elección de modo, ni del abandono. El único
ánimo que la plataforma conoce es el que la persona registró.

### No diagnosticar

Sin etiquetas clínicas, sin escalas de severidad, sin «tu nivel de X». Los
instrumentos que inspiran los micro-checkins están **adaptados**, no
administrados. Los EWS siguen fuera del wire público.

### No convertir la plataforma en terapia automática

Una experiencia guiada no es una intervención y no promete resultado clínico. Eco
acompaña la conversación presente. El flujo de crisis permanece **separado** de
toda señal de recorrido.

### No gamificar

Sin puntos, sin insignias, sin rachas de experiencias, sin porcentaje de
aciertos. Un recorrido no es un score.

### No inventar contenido

Ni conceptos, ni ejemplos, ni preguntas de recall, ni prácticas. El autor
selecciona; ingeniería no redacta afirmaciones psicológicas. **Diez
experiencias guiadas son diez aprobaciones editoriales, no diez plantillas.**

### No bloquear la lectura

Ninguna experiencia guiada es requisito para leer nada.

---

## 10. Riesgos

**El cuello de botella es editorial, no técnico.** Pasar de 2 guías × 3 pasos a
10 capítulos × 4 experiencias guiadas multiplica por ~26 el trabajo del autor: idea
aprobada, pasaje anclado, práctica redactada, pregunta con respuesta correcta.
Ninguna fase de ingeniería resuelve eso.

**Anchors sobre OCR sin finalizar.** Parejas se revalida entera al llegar el
máster; más anchors, más revalidación.

**Estado local con recorridos largos.** Diez pasos sin reanudación entre
dispositivos es frágil. Deja de ser opcional en la fase 3.

**Deriva del firewall.** Doce tipos de paso son doce oportunidades de que algo
entre al Mapa «porque parece emocional». Cada tipo nuevo entra con su ratchet o
no entra.

---

## 11. Change Log

| Fecha      | Versión | Cambio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-03 | 1.0     | Especificación inicial. Modelo mental Chapter Experience, tres entidades (`ChapterExperience` · `Experience` · `ExperienceStep`) con cardinalidad 0/1/3/10, catálogo de 12 tipos de paso en 4 familias con verificabilidad y señal declaradas, Signal Model V1 de tres niveles, integración con el Mapa Emocional (permitido / no permitido), 7 pantallas con cuatro estados, dos ejemplos reales modelados, y separación técnica existe / cambiar / crear. Sin código, sin tablas, sin endpoints. |
