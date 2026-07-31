# Paquete multimedia — capítulo 1 de _Emociones en Construcción_

```
MEDIA_PACKAGE_STATUS=PENDING_EDITORIAL_ASSETS

VIDEO_MASTER_STATUS=UNCONFIRMED
PODCAST_MASTER_STATUS=UNCONFIRMED
AUDIO_MASTER_STATUS=UNCONFIRMED

AUDIOBOOK_CATALOG_STATUS=PUBLISHED
AUDIOBOOK_RUNTIME_AVAILABILITY=UNVERIFIED
AUDIOBOOK_SOURCE_KIND=CHAPTER_AUDIO
AUDIOBOOK_SOURCE_FILE_LOCATED=false
AUDIOBOOK_AUDIO_ROW_STATUS=UNKNOWN
AUDIOBOOK_R2_OBJECT_STATUS=UNKNOWN

CAPTIONS_STATUS=PENDING
TRANSCRIPT_STATUS=PENDING
POSTER_STATUS=PENDING
```

`PUBLISHED` significa que el catálogo code-owned tiene una definición de fuente
reproducible. **No prueba** que exista la fila `Audio` de producción ni el objeto
R2 que la respalda. Esa verificación no se hizo y se registra como `UNKNOWN`.

### El clip de la Guide no es un asset de Chapter Media

```
GUIDE_CLIP_STATUS=PENDING_EDITORIAL_CLIP
GUIDE_CLIP_RUNTIME_SOURCE=CODE_OWNED_TRANSCRIPT
GUIDE_CLIP_TRANSCRIPT_FALLBACK=WORKING
GUIDE_CLIP_DEPENDS_ON_AUDIOBOOK=false
```

`ReaderGuidePanel.ClipScene` es una escena autónoma de la Guide: renderiza su
propio transcript code-owned y **no** llama a `ChapterMediaService`, a
`LectorService.getAudio`, a R2 ni al catálogo de chapter media. El directorio de
la Guide no tiene ninguna referencia a esas rutas.

De ahí se sigue algo que este documento afirmó antes por error: ver
`rgp-clip-pending` en el recorrido **no** demuestra nada sobre el objeto de audio
del capítulo, y subir el audiolibro **no** hará que esa escena cambie. Son dos
pendientes editoriales distintos que se resuelven por separado.

### Búsqueda de archivos fuente

```
SOURCE_FILE_LOCATED_IN_SEARCHED_PATHS=false
CLOUDFLARE_STREAM_CONFIG_STATE=absent
R2_CONFIG_STATE=complete
```

Rutas inspeccionadas: repositorio, `~/.psico-ops`, Escritorio, Descargas,
Películas y Música. Cero candidatos. Eso dice dónde **no** están los archivos, no
que no existan: el estado de producción de cada máster debe confirmarlo el
propietario editorial.

Autoridad de producto: [`guided-reading-v1.md`](guided-reading-v1.md) §4
(estrategia multimedia), §7 (estructura del video), §8 (podcast) y §9 (datos y
privacidad).

Este documento **registra lo que falta confirmar y producir**. No inventa
identificadores de proveedor, no contiene URLs, no contiene tokens y no contiene
secretos. GR-2 implementó la fontanería —catálogo, acceso firmado, evento de
finalización— y dejó los dos formatos nuevos en `DRAFT`, que es lo que
corresponde mientras no haya una fuente confirmada que referenciar.

---

## 1. Estado por asset

| Asset                  | Estado                                      | Quién lo produce | Bloquea                                   |
| ---------------------- | ------------------------------------------- | ---------------- | ----------------------------------------- |
| Videoexplicación       | `UNCONFIRMED`                               | Jorge            | `eec-c1-video-v1` sigue `DRAFT`           |
| Podcast                | `UNCONFIRMED`                               | Jorge            | `eec-c1-podcast-v1` sigue `DRAFT`         |
| Audiolibro             | catálogo `PUBLISHED`, runtime sin verificar | Jorge / ops      | nada demostrado todavía                   |
| Clip de Guided Reading | `PENDING_EDITORIAL_CLIP`                    | Jorge            | GR-3, no GR-2 · independiente del audio   |
| Subtítulos             | `PENDING`                                   | Jorge            | `hasCaptions` del video                   |
| Transcripción          | `PENDING`                                   | Jorge            | `hasTranscript` de cualquiera de los tres |
| Poster                 | `PENDING`                                   | Jorge            | portada del video                         |

El audiolibro es el único formato que **podría** estar ya servible: reutiliza la
fila `Audio` y el firmado R2 que existen desde el sprint del lector, y su
definición está `PUBLISHED`. Nadie ha comprobado todavía si la fila y el objeto
existen en producción, así que su disponibilidad en runtime sigue sin verificar.
Comprobarlo es una lectura acotada a producción, pendiente de autorizar.

---

## 2. Archivos objetivo

Nombres canónicos para la carpeta de trabajo editorial (fuera de Git):

```
01-video-master.mp4
02-podcast-master.mp3
03-audiobook-chapter.mp3
04-guide-clip.mp4
05-captions-es.vtt
06-transcript-es.md
07-poster.webp
08-media-metadata.yml
```

```
HEAVY_MEDIA_IN_GIT=false
PROVIDER_IDS_IN_GIT=false
SECRETS_IN_GIT=false
```

Ningún archivo de esta lista se commitea. `08-media-metadata.yml` es la hoja de
paso: duraciones reales, capítulos editoriales y notas del episodio, que una
persona traslada a mano al catálogo code-owned.

---

## 3. Dónde vive cada cosa cuando exista

| Asset                  | Destino             | Cómo lo sirve la API                                     |
| ---------------------- | ------------------- | -------------------------------------------------------- |
| Videoexplicación       | Cloudflare Stream   | token firmado corto → iframe del player administrado     |
| Podcast                | Cloudflare R2       | `StorageService.getSignedUrl()`, TTL 1 h                 |
| Audiolibro             | Cloudflare R2       | ya implementado; `LectorService.getAudio()` firma la URL |
| Subtítulos             | Cloudflare Stream   | pista de texto del propio video                          |
| Transcripción          | Cloudflare R2       | `StorageService.getSignedUrl()`, TTL 1 h                 |
| Poster                 | Cloudflare R2       | `StorageService.getSignedUrl()`, TTL 1 h                 |
| Clip de Guided Reading | por decidir en GR-3 | fuera del alcance de GR-2                                |

Las URLs firmadas son portadores temporales. No se loguean, no se persisten, no
se escriben en documentos y **no aparecen en el manifest** — solo en la respuesta
de acceso, pedida después de que la persona elige el medio.

---

## 4. Catálogo actual

`apps/api/src/lector/media/chapter-media.catalog.ts` es la autoridad. Tres
definiciones para el capítulo 1:

| `mediaKey`            | Tipo        | Estado      | Fuente                         |
| --------------------- | ----------- | ----------- | ------------------------------ |
| `eec-c1-audiobook-v1` | `AUDIOBOOK` | `PUBLISHED` | `CHAPTER_AUDIO` (R2 existente) |
| `eec-c1-podcast-v1`   | `PODCAST`   | `DRAFT`     | ninguna                        |
| `eec-c1-video-v1`     | `VIDEO`     | `DRAFT`     | ninguna                        |

Un item `DRAFT` aparece en el manifest con `availability: "COMING_SOON"` y la
interfaz dice «En producción» / «Videoexplicación en producción». No hay audio
falso ni un player que no reproduce nada.

---

## 5. Proceso para activar un formato

Este es el orden y no admite atajos: subir un archivo antes de que exista la
revisión editorial es cómo se publica un master equivocado.

1. **Producir.** Grabar según §7 (video) o §8 (podcast) de la especificación.
2. **Revisar editorialmente.** Jorge aprueba el corte final.
3. **Subir manualmente.** Video → Cloudflare Stream. Audio, transcripción y
   poster → R2. GR-2 no sube nada y no crea recursos en Cloudflare.
4. **Confirmar `ready`.** Para Stream, esperar a que el video termine de
   procesar. Para R2, confirmar que el objeto responde.
5. **Activar el acceso firmado.** Configurar `CLOUDFLARE_STREAM_ACCOUNT_ID`,
   `CLOUDFLARE_STREAM_API_TOKEN` y `CLOUDFLARE_STREAM_CUSTOMER_CODE` — las tres
   juntas o ninguna. Solo hacen falta cuando exista una definición Stream
   `PUBLISHED`.
6. **Añadir las referencias reales al catálogo.** `videoUid` para Stream,
   `objectKey` para R2, más `durationSec`, capítulos editoriales,
   `posterObjectKey` y `transcriptObjectKey`.
7. **Cambiar `DRAFT` → `PUBLISHED`** y fijar el `accessPolicy`.
8. **Ejecutar smoke.** Manifest, acceso y una finalización real; verificar que
   Mi Evolución la refleja y que el Mapa Emocional no se movió.
9. **Solo entonces desplegar.**

Cambiar el contenido de un asset ya publicado no se hace en sitio: se incrementa
`mediaVersion`. La idempotencia de la finalización se deriva de
`mediaKey + mediaVersion`, así que una versión nueva es una actividad nueva y una
re-subida silenciosa no lo sería.

---

## 6. Lo que este paquete NO decide

```
CMS=false
PER_SECOND_ANALYTICS=false
SEPARATE_MEDIA_PROGRESS_TABLE=false
SECOND_BOOK=false
DRM=false
```

La actividad multimedia registra una sola cosa —que el reproductor llegó al
final— y va a Mi Evolución. No va al Mapa Emocional: terminar un video no dice
nada sobre cómo se siente la persona (`EXPERIENCE_CAUSAL_INFERENCE=false`).

---

## 7. Matriz de readiness (preflight 2026-07-31)

Derivada del catálogo real (`chapter-media.catalog.ts`), no de supuestos. Los
tres formatos no comparten proveedor: el audiolibro se sirve por la fila `Audio`
del capítulo (R2), el video sólo puede ser Stream-backed, y el podcast todavía no
tiene `source` — así que **su proveedor no está decidido**.

```
AUDIOBOOK:
  CURRENT_AVAILABILITY=PUBLISHED_IN_CATALOG
  RUNTIME_ACCESS=UNVERIFIED
  MASTER_STATUS=UNCONFIRMED
  SOURCE_FILE_LOCATED_IN_SEARCHED_PATHS=false
  EXPECTED_PROVIDER=R2 (vía CHAPTER_AUDIO)
  BLOCKER=production Audio row and backing object not verified

PODCAST:
  CURRENT_AVAILABILITY=DRAFT
  MASTER_STATUS=UNCONFIRMED
  SOURCE_FILE_LOCATED_IN_SEARCHED_PATHS=false
  EXPECTED_PROVIDER=UNDECIDED_OR_R2_CAPABLE
  BLOCKER=master and source definition not confirmed

VIDEO:
  CURRENT_AVAILABILITY=DRAFT
  MASTER_STATUS=UNCONFIRMED
  SOURCE_FILE_LOCATED_IN_SEARCHED_PATHS=false
  EXPECTED_PROVIDER=CLOUDFLARE_STREAM
  BLOCKER=master not located and Stream configuration absent
```

Ninguno de los tres tiene transcript, captions ni poster presentes.

`CLOUDFLARE_STREAM_CONFIG_STATE=absent` no bloquea nada hoy, porque el video es
`DRAFT`. Es todo-o-nada: cuando exista el máster, las tres variables se
configuran juntas. Un estado `partial` sí sería bloqueo.

## 8. Runbooks de subida (redactados, no ejecutados)

Ninguno de los dos se puede ejecutar todavía: falta el máster. Se dejan escritos
para que el día que exista, el camino no se improvise. Sin secretos en los
comandos; los valores viven en el entorno del servicio.

### AUDIO_UPLOAD_RUNBOOK

1. Respaldar el máster y registrar su `sha256`.
2. Subir a R2 bajo el prefijo del libro; no publicar URL directa.
3. Esperar a que el objeto esté disponible (R2 no transcodifica: es inmediato).
4. Verificar duración y mime reales del objeto subido.
5. Apuntar la fila `Audio` del capítulo al objeto (el catálogo usa
   `source: { kind: "CHAPTER_AUDIO" }`, así que no se toca el catálogo).
6. `GET` del manifest de media del capítulo.
7. Pedir acceso firmado y comprobar que expira.
8. Reproducir en escritorio.
9. Reproducir en móvil.
10. Comprobar transcript/captions si se produjeron.
11. Completar y verificar el evento `chapter_media_completed`.
12. Verificar que aparece en Mi Evolución como aprendizaje, no como emoción.
13. Rollback — la fila `Audio` es **compartida con el lector legacy**, así que
    nunca se limpia ni se borra a ciegas:
    1. Antes de cualquier cambio, tomar un snapshot de la fila `Audio` existente
       y de su referencia al objeto.
    2. Si se actualizó una fila existente, restaurar su estado previo exacto.
    3. Si no existía ninguna fila, usar un procedimiento de creación/rollback
       revisado por separado.
    4. Nunca vaciar ni eliminar la fila `Audio` compartida.

### VIDEO_UPLOAD_RUNBOOK

1. Respaldar el máster y registrar su `sha256`.
2. Configurar **las tres** variables de Cloudflare Stream a la vez.
3. Subir a Stream y esperar a que termine el procesamiento.
4. Verificar duración y mime del asset procesado.
5. Registrar el `videoUid` en la definición del catálogo y pasarla a
   `PUBLISHED` (cambio de código, revisado).
6. `GET` del manifest.
7. Acceso firmado.
8. Reproducir en escritorio.
9. Reproducir en móvil.
10. Verificar captions y poster.
11. Completar y verificar `chapter_media_completed`.
12. Verificar Mi Evolución.
13. Rollback: devolver la definición a `DRAFT` con `source: null`. Las marcas
    editoriales del capítulo se conservan: son decisión de guion, no del
    proveedor.
