# Paquete multimedia — capítulo 1 de _Emociones en Construcción_

```
MEDIA_PACKAGE_STATUS=PENDING_EDITORIAL_ASSETS

VIDEO_MASTER_STATUS=PENDING
PODCAST_MASTER_STATUS=PENDING
AUDIOBOOK_STATUS=EXISTING_OR_PENDING_VERIFICATION
GUIDE_CLIP_STATUS=PENDING
CAPTIONS_STATUS=PENDING
TRANSCRIPT_STATUS=PENDING
POSTER_STATUS=PENDING
```

Autoridad de producto: [`guided-reading-v1.md`](guided-reading-v1.md) §4
(estrategia multimedia), §7 (estructura del video), §8 (podcast) y §9 (datos y
privacidad).

Este documento **registra lo que falta producir**. No inventa identificadores de
proveedor, no contiene URLs, no contiene tokens y no contiene secretos. GR-2
implementó la fontanería —catálogo, acceso firmado, evento de finalización— con
los dos formatos nuevos en `DRAFT`, precisamente porque los assets no existen.

---

## 1. Estado por asset

| Asset                  | Estado                             | Quién lo produce | Bloquea                                    |
| ---------------------- | ---------------------------------- | ---------------- | ------------------------------------------ |
| Videoexplicación       | `PENDING`                          | Jorge            | `eec-c1-video-v1` sigue `DRAFT`            |
| Podcast                | `PENDING`                          | Jorge            | `eec-c1-podcast-v1` sigue `DRAFT`          |
| Audiolibro             | `EXISTING_OR_PENDING_VERIFICATION` | Jorge / ops      | nada: el capítulo ya sirve audio si existe |
| Clip de Guided Reading | `PENDING`                          | Jorge            | GR-3, no GR-2                              |
| Subtítulos             | `PENDING`                          | Jorge            | `hasCaptions` del video                    |
| Transcripción          | `PENDING`                          | Jorge            | `hasTranscript` de cualquiera de los tres  |
| Poster                 | `PENDING`                          | Jorge            | portada del video                          |

El audiolibro es el único formato que puede estar ya servible: reutiliza la fila
`Audio` y el firmado R2 que existen desde el sprint del lector. «Pending
verification» significa que nadie confirmó todavía que el objeto del capítulo 1
esté subido y reproducible.

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
