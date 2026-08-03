# Book Experience Standard V1

```
BOOK_EXPERIENCE_STANDARD_VERSION=1.1
STATUS=APPROVED_FOR_IMPLEMENTATION
AUTHORIZED_BY_JORGE=true
LAST_UPDATED=2026-08-03
CANONICAL_PRODUCT_AUTHORITY=true
```

Esta es la autoridad sobre **cómo se presenta cualquier libro** en la
plataforma. Cuando otro documento contradiga a este en materia de presentación
multimodal, manda este.

## Por qué existe

La demostración con el autor confirmó que la plataforma funciona y, al mismo
tiempo, mostró un problema de experiencia: el modo Libro se comporta como un
libro, pero Audiolibro, Podcast y Video podían **parecer** modos funcionales
mientras mostraban principalmente texto o contenido provisional. Un lector que
elige «Escuchar» y encuentra texto no concluye «todavía no está grabado»:
concluye que el producto no hace lo que dice.

La segunda observación es sobre la Guide. La actual cubre **una** idea y **un**
pasaje. Como microguía es válida y está bien construida; como representación de
un capítulo extenso, no alcanza.

---

## 1. Principios

```
BOOK_MODE_PRIMARY_CONTENT=FULL_TEXT
AUDIOBOOK_MODE_PRIMARY_CONTENT=PLAYABLE_AUDIO
PODCAST_MODE_PRIMARY_CONTENT=PLAYABLE_EPISODE
VIDEO_MODE_PRIMARY_CONTENT=PLAYABLE_VIDEO_PLAYLIST
GUIDED_MODE_PRIMARY_CONTENT=MICRO_GUIDE_COLLECTION
```

- El **transcript acompaña** al medio; nunca lo sustituye.
- Un modo multimedia publicado **debe tener al menos un activo reproducible**.
- Una superficie sin activo **no puede parecer publicada**.
- Las actividades son complementarias: nunca una barrera para consumir el medio.
- Cada modo **se publica de forma independiente**.
- No todos los capítulos necesitan todos los modos.
- El texto del libro sigue siendo el contenido principal del modo Libro.
- **No se infieren emociones** ni estados de relación.
- La Resonance sigue siendo **explícita**.
- El Mapa Emocional **no recibe escrituras automáticas**.

---

## 2. Estados de superficie

Tres estados, y solo tres.

### `HIDDEN`

- No aparece en el selector.
- No crea ruta.
- No produce llamada de reproducción.
- Es el estado de un modo que **todavía no forma parte del plan editorial** de
  ese capítulo. La ausencia es el default, no un error.

### `COMING_SOON`

- Puede aparecer **deshabilitado**, con la etiqueta «Próximamente».
- No navega.
- **No renderiza un falso reproductor.**
- Se usa **solo** cuando editorialmente se quiere anunciar ese modo.

### `PUBLISHED`

- Aparece habilitado.
- Debe tener contenido primario reproducible, o una experiencia realmente
  ejecutable.
- Un `PUBLISHED` **sin activo reproducible falla cerrado en la UI**: se
  deshabilita con motivo `NO_PLAYABLE_ASSET`. No se degrada a «Próximamente»,
  porque eso presentaría una definición rota como si fuera una decisión
  editorial.

> **Nota de implementación honesta.** El manifest
> (`ChapterMediaSummary.availability`) colapsa dos estados del servidor en uno:
> `COMING_SOON` significa tanto «borrador anunciado» como «publicado sin
> activo». El view model web expresa los dos por separado y el adaptador del
> manifest documenta lo que puede y no puede distinguir. Para la persona el
> resultado es idéntico —no reproduce, no navega—; la diferencia importa cuando
> haya que diagnosticar por qué.
>
> Lo que **sí** distingue el servidor es si el activo existe. Un audiolibro con
> `source: CHAPTER_AUDIO` apunta a la tabla de audio del capítulo, no a un
> objeto que este catálogo posea, así que `getManifest` resuelve el capítulo y
> mira si hay al menos una fila `Audio`:
>
> ```
> CHAPTER_AUDIO_WITH_ROW=AVAILABLE
> CHAPTER_AUDIO_WITHOUT_ROW=COMING_SOON
> DRAFT_VIDEO=COMING_SOON
> MANIFEST_SIGNS_URLS=false
> ```
>
> Es una comprobación de existencia, no una firma ni una petición al proveedor:
> el manifest sigue sin llevar ninguna URL.

---

## 3. Modo Libro

El texto completo del capítulo, con:

- capítulos y navegación entre ellos;
- progreso de lectura;
- notas;
- resaltados;
- actividades insertadas cuando el capítulo las tenga;
- conceptos.

**No** se convierte el libro en una colección de cards. La columna de lectura es
la experiencia.

`BOOK.state = PUBLISHED` siempre. Es el único modo que nunca se deshabilita: si
el capítulo existe, se puede leer.

---

## 4. Modo Audiolibro

Jerarquía aprobada:

```
reproductor principal
→ segmentos/pistas
→ transcript colapsable o sincronizado
→ ideas clave
→ actividad opcional
```

Requisito para `PUBLISHED`:

```
PLAYABLE_AUDIO_ITEM_COUNT>=1
```

**El transcript solo no satisface el requisito.** Un capítulo con transcripción
y sin audio es un capítulo sin audiolibro.

---

## 5. Modo Podcast

Jerarquía:

```
episodio o lista de episodios
→ show notes
→ ideas principales
→ preguntas o actividad opcional
→ vínculo al capítulo
```

Requisito para `PUBLISHED`:

```
PLAYABLE_PODCAST_EPISODE_COUNT>=1
```

El podcast **no debe ser una copia del audiolibro**. El audiolibro narra el
capítulo; el podcast lo conversa.

> **Alcance actual.**
>
> ```
> PODCAST_STANDARD_DOCUMENTED=true
> PODCAST_FIRST_CLASS_READER_MODE=false
> PODCAST_INTERNAL_SURFACE_GATED=true
> ```
>
> El podcast **no** es una pestaña de primer nivel del lector: una pestaña que
> lleva a ninguna parte es exactamente el problema que este documento corrige.
> Donde sí vive es dentro de Escuchar, como subformato junto a Audiolibro, y
> ahí está gobernado por el mismo view model: si el episodio no existe, la
> opción aparece deshabilitada con «Próximamente», no se selecciona al
> pulsarla, no monta panel y **no pide URL firmada**. Cuando ninguno de los dos
> subformatos es reproducible, se elige el primero que sí lo sea; si no hay
> ninguno, la superficie falla cerrada.

---

## 6. Modo Video

Jerarquía:

```
playlist
→ video seleccionado
→ subtítulos
→ transcript colapsable
→ idea clave
→ actividad relacionada
```

Acepta **uno o varios** videos.

Requisito para `PUBLISHED`:

```
PLAYABLE_VIDEO_ITEM_COUNT>=1
```

**No se inventan** `videoUid`, poster, captions ni duración. Los datos del
proveedor existen cuando existe el máster, y no antes.

---

## 7. Experiencia guiada

```
MICRO_GUIDE =
  una idea
  + un pasaje
  + una práctica
  + un recall
  + feedback
  + cierre

GUIDED_CHAPTER_EXPERIENCE =
  colección ordenada de microguías
  + progreso del recorrido
  + síntesis final
```

Recomendación editorial:

```
NORMAL_CHAPTER_GUIDE_UNITS=3_TO_5
LONG_CHAPTER_GUIDE_UNITS_MAX=7
```

La Guide actual de _Emociones en construcción_ y la de _Parejas que perduran_
son **microguías V1**. Sus definiciones, su lifecycle, sus Learning Events, su
recovery y su corrección server-side **no se invalidan ni se reescriben**. Lo
que cambia es cómo se nombran en pantalla:

```
etiqueta visible = «Experiencia guiada»
BADGE = «Guía breve»
SCOPE = «1 idea del capítulo»
```

El roadmap multi-microguía está **aprobado en diseño y pendiente de
implementación**: existe como prototipo visual, no como runtime.

---

## 8. Propiedad editorial

- El autor o responsable editorial **selecciona las ideas**.
- Ingeniería **no inventa afirmaciones psicológicas**.
- Cada microguía necesita **aprobación editorial** antes de publicarse.
- Los másters audiovisuales se publican **solo con procedencia confirmada**.
- El OCR de _Parejas que perduran_ es una **edición de prueba**
  (`SOURCE_QUALITY=OCR_UNFINALIZED`).
- El reemplazo por el máster debe ser **no destructivo**.
- Los anchors **deben revalidarse** después de la edición final — ver
  [parejas-guide-v1-first-definition.md](parejas-guide-v1-first-definition.md).

---

## 9. Arquitectura temporal

```
CMS_REQUIRED_NOW=false
DATABASE_SCHEMA_CHANGE_REQUIRED=false
CODE_OWNED_CONFIGURATION=true
FUTURE_CMS_MIGRATION_POSSIBLE=true
```

La configuración editorial vive en **código revisado**: el catálogo de Chapter
Media (`apps/api/src/lector/media/chapter-media.catalog.ts`) y el catálogo de
Guides (`apps/api/src/guide/guide-catalog.ts`). Cambiarla es un diff revisado,
que es exactamente la garantía que queremos mientras el catálogo sea pequeño.

Este documento **no diseña el futuro CMS**. Solo deja constancia de que la
migración es posible porque la autoridad ya está aislada.

---

## 10. Contrato de presentación (web)

`apps/web/src/components/dashboard/lector/book-experience.ts`

```ts
type BookExperienceModeKind =
  | "BOOK"
  | "AUDIOBOOK"
  | "PODCAST"
  | "VIDEO"
  | "GUIDED";

type BookExperienceModeState = "HIDDEN" | "COMING_SOON" | "PUBLISHED";

interface BookExperienceModeView {
  kind: BookExperienceModeKind;
  state: BookExperienceModeState;
  label: string;
  itemCount?: number;
  disabledReason?: "COMING_SOON" | "NO_PLAYABLE_ASSET";
}
```

Es un **view model**, no una segunda autoridad editorial. Se deriva de los
catálogos y respuestas que ya existen; no crea catálogo, endpoint ni tabla.

Reglas para medios:

```
PUBLISHED + playable >= 1   → PUBLISHED
PUBLISHED + playable = 0    → deshabilitado · NO_PLAYABLE_ASSET
DRAFT + anunciado           → COMING_SOON
ausente                     → HIDDEN
```

Regla para la Guide:

```
discovery available + bundle exacto + anchor resuelto → PUBLISHED
en cualquier otro caso                                → HIDDEN
```

**El navegador nunca infiere una Guide desde el `bookSlug`.** Esa decisión es
del servidor (GR-4).

---

## 11. Gating del lector

- **Libro**: siempre habilitado.
- **Audiolibro / Video**: un modo sin activo reproducible no navega, no muestra
  controles que parezcan reproducir y no monta la superficie de medios — así
  que **no hay llamada de reproducción**. Aparece deshabilitado con
  «Próximamente» solo cuando el catálogo lo anuncia; si no, se oculta.
- El lector distingue lo que la persona **pidió** de lo que la superficie
  **puede darle**. Se renderiza siempre lo segundo, así que no existe ni un
  frame —tampoco durante la petición del manifest— con un modo vacío en
  pantalla:

  ```
  MEDIA_SURFACE_MOUNTS_ONLY_WHEN_PLAYABLE=true
  DISABLED_MODE_NEVER_MOUNTS_MEDIA=true
  STORED_PREFERENCE_RESET_WHEN_MODE_GONE=true
  MANIFEST_IS_SCOPED_TO_ITS_CHAPTER=true
  ```

- Un modo deshabilitado que estuviera **guardado como preferencia** vuelve a
  Libro, y la preferencia guardada se limpia — pero solo una vez que el
  manifest respondió: una petición en vuelo no es motivo para descartar la
  elección de alguien.
- El manifest se guarda **junto a la pregunta que responde**, así que la
  respuesta de un capítulo nunca decide las pestañas del siguiente.
- **Experiencia guiada**: conserva íntegro su runtime
  (`GUIDE_LIFECYCLE_CHANGED=false`). La pestaña se muestra **solo** cuando el
  estándar declara el modo visible, que para una guía significa PUBLISHED:
  discovery respondida, pin válido, bundle y anchor resueltos. Mientras eso
  esté pendiente —y en cada capítulo que sencillamente no tiene guía— no hay
  pestaña, porque una pestaña es una oferta. Si el contexto deja de ofrecerla
  con el panel abierto, el panel se cierra: no inicia ni cancela ninguna
  sesión.

---

## 12. Change Log

| Fecha      | Versión | Cambio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-03 | 1.1     | Gating real y evidencia visual. El manifest deja de declarar `AVAILABLE` un audiolibro `CHAPTER_AUDIO` sin fila `Audio`. El lector separa modo pedido de modo efectivo, no monta medios mientras el manifest está en vuelo y limpia la preferencia guardada cuando el modo no existe. Los subformatos de Escuchar (Audiolibro · Podcast) quedan gateados por el mismo view model. La pestaña de experiencia guiada solo aparece cuando la guía está lista. La portada de cada guía declara su alcance («1 idea del capítulo»). Tres capturas del prototipo con manifiesto y sumas. |
| 2026-08-03 | 1.0     | Estándar inicial aprobado por Jorge tras la demostración con David Jaramillo. Define los cinco modos y su contenido primario, los tres estados de superficie, el gating real por activo reproducible, la clasificación de la Guide actual como microguía y el roadmap de una experiencia guiada con varias microguías. Sin CMS, sin migración, sin schema, sin endpoints. El prototipo visual vive en `/prototipos/book-experience` y no es accesible en producción.                                                                                                               |

### Evidencia visual

`docs/product/assets/book-experience-standard-v1/` — tres capturas del
prototipo interno, tomadas de un solo commit, con `MANIFEST.json` y
`SHA256SUMS`. Cada una es una URL: el prototipo acepta `?mode=<modo>` para que
la captura sea reproducible sin instrucciones de clic.

Toda modificación futura debe actualizar `BOOK_EXPERIENCE_STANDARD_VERSION`,
`LAST_UPDATED` y este Change Log.
