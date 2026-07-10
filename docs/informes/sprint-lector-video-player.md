# Sprint — Reproductor de video en el lector (backlog #3)

**Rama:** `feature/lector-video-player`
**Fecha:** 2026-07-10
**Tests:** API 783/784 · Web 294 (+8) · Mobile 63 · Crypto 34 · typecheck ×3 + lints + OpenAPI verdes.

---

## 1. Qué cierra

Tercer ítem del backlog. Los capítulos ya ingestados tienen una card mock «🎬 Video del capítulo — próximamente». Este sprint la convierte en un **reproductor real**: cuando ops sube el archivo, el video se reproduce inline; hasta entonces, un placeholder con forma de reproductor («En producción») — mismo patrón que el «Audio en producción» de Modo Guía.

**Decisión clave: el video es inline por bloque, no por capítulo.** A diferencia del audio (una pista por capítulo, Modo Guía), el video es una **cápsula corta dentro del flujo de lectura** — encaja como un `ChapterBlock`. La URL vive en `meta.videoUrl` del bloque.

---

## 2. Diseño

### Schema

- Nuevo valor `VIDEO` en el enum `ChapterBlockKind` (junto a AUDIO/IMAGE). Migración aditiva `20260710120000_chapter_block_video_kind` (`ALTER TYPE … ADD VALUE 'VIDEO'`).
- El bloque de video: `content` = caption; `meta` = `VideoBlockMeta { videoUrl?, posterUrl?, durationSec? }`. Sin `meta.videoUrl` → placeholder.

### Helper compartido (`@psico/types`)

`videoBlockInfo(block)` — **única fuente de verdad** para web + mobile:

- Detecta bloques de video: kind `VIDEO` **o** — backward-compat — un `EXERCISE` cuyo contenido empieza con `🎬` (capítulos ingestados antes de que existiera el kind `VIDEO`).
- Devuelve `{ url, poster, caption, durationSec }` (con el `🎬` legacy stripeado del caption).
- **Esto permite que la data ya sembrada suba al reproductor real sin re-ingestar** (que borraría highlights/annotations por cascade).

### Ingest script

`VIDEO_MOCK` ahora produce un bloque kind `VIDEO` (caption limpio, sin `🎬` ni prosa de "próximamente" — el componente renderiza su propio estado). Aditivo.

### Clientes

- **Web `VideoBlock`** — `<video controls poster preload="metadata">` en un frame 16:9 cuando hay URL; placeholder con ▶ + «En producción» cuando no. Wireado en `BlockRenderer` antes de las demás ramas.
- **Mobile `VideoBlock`** — `expo-av` `Video` con `useNativeControls` cuando hay URL; placeholder paridad cuando no. Wireado en `BlockView`.

### Privacidad (ADR 0007 intacto)

Los videos de los libros son **contenido público licenciado** — `videoUrl` es una URL pública directa de R2/CDN (sin firmar, sin cripto, como el audio). Nada del Diario/Eco/reflexión toca la reproducción de video.

---

## 3. Ops: publicar un video

Documentado en `apps/api/src/lector/README.md §video`:

1. Encode MP4 (H.264 + AAC) con `+faststart`.
2. (Opcional) poster con `ffmpeg -ss 3 -vframes 1`.
3. Subir ambos al bucket público R2/CDN.
4. `UPDATE "ChapterBlock" SET meta = '{"videoUrl":…}'::jsonb WHERE id = '…'`. **No re-ingesta** — actualizar `meta` es no-destructivo y preserva highlights.

---

## 4. Tests

- **Web `VideoBlock.test.tsx`** (+8): `videoBlockInfo` (null para no-video, detecta VIDEO kind, detecta 🎬 EXERCISE legacy + strip, parsea meta, trata url vacía como ausente) + `VideoBlock` (placeholder sin url, `<video>` real con source + poster, omite caption vacío).
- El helper vive en `@psico/types` (sin runner propio); su cobertura vive en el test web que lo importa.

---

## 5. Verificación

- API 783/784 · Web 294 (+8) · Mobile 63.
- Prisma `validate` OK, client regenerado. Ingest script `node --check` OK.
- typecheck + lint verdes en 3 workspaces. OpenAPI `generate:check` in sync.

---

## 6. Deuda / ops

- **Subir los videos reales a R2** + setear `meta.videoUrl` en los bloques (tarea ops, como los m4a del audio). Hasta entonces el placeholder «En producción».
- Sin tests UI dedicados del `VideoBlock` mobile (expo-av `Video` requiere mock del módulo nativo; cubierto por el helper + web).
- Migración `20260710120000_chapter_block_video_kind` sin aplicar en Railway (acumulada — aplicar en el próximo deploy).

## 7. Backlog restante (aprobado)

- **Refinar Eco con contenido** — _(siguiente, pedido explícito del usuario)_.
- **Sugerencias adaptativas de Eco** según interacción + Mapa Emocional.
- Character-level highlights en mobile.
