# Paquete multimedia — capítulo 1 de _Emociones en Construcción_

```
MEDIA_PACKAGE_STATUS=PENDING_EDITORIAL_ASSETS

VIDEO_MASTER_STATUS=PENDING
PODCAST_MASTER_STATUS=PENDING
AUDIOBOOK_STATUS=CATALOG_PUBLISHED_ASSET_MISSING
GUIDE_CLIP_STATUS=PENDING
CAPTIONS_STATUS=PENDING
TRANSCRIPT_STATUS=PENDING
POSTER_STATUS=PENDING
```

Verificado contra producción el 2026-07-31 (`042afa52`):

```
GR2_AUDIO_ASSET_STATUS=PENDING
GR2_VIDEO_ASSET_STATUS=PENDING
GR2_AUDIO_SOURCE_FOUND=false
GR2_VIDEO_SOURCE_FOUND=false

GUIDE_CLIP_ASSET_STATUS=PENDING
GUIDE_CLIP_TRANSCRIPT_FALLBACK=WORKING

CLOUDFLARE_STREAM_CONFIG_STATE=absent
R2_CONFIG_STATE=complete
```

Esto **no es un defecto de GR-3**. La lectura guiada se completa de principio a
fin con el transcript, y así se verificó. Pero la primera escena del recorrido es
`rgp-clip-pending`: lo primero que ve un piloto es la versión degradada. Subir el
audio del capítulo es el ítem de mayor valor pendiente.

Autoridad de producto: [`guided-reading-v1.md`](guided-reading-v1.md) §4
(estrategia multimedia), §7 (estructura del video), §8 (podcast) y §9 (datos y
privacidad).

Este documento **registra lo que falta producir**. No inventa identificadores de
proveedor, no contiene URLs, no contiene tokens y no contiene secretos. GR-2
implementó la fontanería —catálogo, acceso firmado, evento de finalización— con
los dos formatos nuevos en `DRAFT`, precisamente porque los assets no existen.

---

## 1. Estado por asset

| Asset                  | Estado                            | Quién lo produce | Bloquea                                   |
| ---------------------- | --------------------------------- | ---------------- | ----------------------------------------- |
| Videoexplicación       | `PENDING`                         | Jorge            | `eec-c1-video-v1` sigue `DRAFT`           |
| Podcast                | `PENDING`                         | Jorge            | `eec-c1-podcast-v1` sigue `DRAFT`         |
| Audiolibro             | `CATALOG_PUBLISHED_ASSET_MISSING` | Jorge / ops      | la primera escena de la Guide (clip)      |
| Clip de Guided Reading | `PENDING`                         | Jorge            | GR-3, no GR-2                             |
| Subtítulos             | `PENDING`                         | Jorge            | `hasCaptions` del video                   |
| Transcripción          | `PENDING`                         | Jorge            | `hasTranscript` de cualquiera de los tres |
| Poster                 | `PENDING`                         | Jorge            | portada del video                         |

El audiolibro es el único formato que **podría** estar ya servible: reutiliza la
fila `Audio` y el firmado R2 que existen desde el sprint del lector, y su
definición está `PUBLISHED`. La verificación ya se hizo: el 2026-07-31 el
recorrido en producción abrió en `rgp-clip-pending`, lo que prueba que el objeto
del capítulo 1 **no** está subido. Catálogo publicado, asset ausente.

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
tiene `source`.

| Campo                        | `eec-c1-audiobook-v1`     | `eec-c1-podcast-v1` | `eec-c1-video-v1`                           |
| ---------------------------- | ------------------------- | ------------------- | ------------------------------------------- |
| KIND                         | AUDIOBOOK                 | PODCAST             | VIDEO                                       |
| CATALOG_VERSION              | 1                         | 1                   | 1                                           |
| CURRENT_AVAILABILITY         | PUBLISHED                 | DRAFT               | DRAFT                                       |
| SOURCE_FILE_FOUND            | false                     | false               | false                                       |
| SOURCE_FORMAT                | —                         | —                   | —                                           |
| SOURCE_SIZE_BYTES            | —                         | —                   | —                                           |
| SOURCE_SHA256                | —                         | —                   | —                                           |
| EXPECTED_PROVIDER            | R2 (vía `CHAPTER_AUDIO`)  | R2                  | CLOUDFLARE_STREAM                           |
| EXPECTED_PROVIDER_OBJECT_KEY | fila `Audio` del capítulo | sin asignar         | sin asignar                                 |
| TRANSCRIPT_PRESENT           | false                     | false               | false                                       |
| CAPTIONS_PRESENT             | false                     | false               | false                                       |
| POSTER_PRESENT               | false                     | false               | false                                       |
| ENVIRONMENT_READY            | true (R2 completo)        | true (R2 completo)  | false (Stream ausente)                      |
| UPLOAD_READY                 | false                     | false               | false                                       |
| BLOCKER                      | máster no producido       | máster no producido | máster no producido + Stream sin configurar |

Búsqueda de archivos fuente: repositorio, `~/.psico-ops`, Escritorio, Descargas,
Películas y Música. Cero candidatos. **Los dos formatos nuevos no están
"pendientes de subir": están pendientes de producir.** Esa distinción decide la
siguiente acción — no hay nada que cargar todavía.

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
13. Rollback: quitar el puntero de la fila `Audio`; el catálogo y las filas de
    aprendizaje quedan intactos.

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
