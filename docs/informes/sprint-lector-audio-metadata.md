# Sprint Lector Audio Metadata — lock-screen artwork + API contract

**Fecha:** 2026-06-13
**Rama:** `feature/sprint-lector-audio-metadata`
**Tests:** 654/655 API + 122/122 web + 20/20 mobile + 34/34 crypto (sin nuevos — sprint orientado a contrato)

---

## Lo que se construyó

Cierra la deuda más visible del sprint Background Audio (`feature/sprint-lector-audio-background`, 2026-06-13): la pantalla de bloqueo en iOS y los controles MediaSession en Android mostraban "Sin título" porque `expo-av` 15 no permite setear metadata dinámica desde JavaScript. La única forma viable a corto plazo es **embeber los tags en el archivo de audio al subir**. Este sprint introduce el contrato + render del bar para que cuando los archivos lleguen con tags correctos, todo encaje sin más cambios cliente.

Tres deltas concretos:

1. **Contrato API extendido** — `LectorAudioResponse.metadata: LectorAudioMetadata` con `title / subtitle / artist / artworkUrl`. Forward-compat: cuando migremos a `expo-audio` o `react-native-track-player` (ambos exponen `MPNowPlayingInfoCenter` y Android MediaSession desde JS), este mismo payload se pasa al setter sin cambios.
2. **Audio bar renderea artwork + título en ambos clientes** — web `<img>` + texto, mobile `<Image>` + `<Text>`. Cuando `artworkUrl` es un token de gradient (`warm`/`cool`/`mixed`) en lugar de URL real, fallback a la paleta del libro (paridad con BookGridCard).
3. **README `apps/api/src/lector/README.md` §audio** — documenta la receta `ffmpeg` para que ops embeba ID3v2 (mp3) / m4a atoms con título + álbum + artista + cover ≤ 500×500 PNG.

### Backend

`apps/api/src/lector/lector.service.ts` — `getAudio()`:

- Prisma `book` query ahora selecciona `title`, `cover`, `coverArtUrl`, `author: { select: { name: true } }` además del `id` que ya tenía.
- Return añade `metadata` con resolución de artwork en cascada: `book.coverArtUrl` (URL real PNG/JPG) → `book.cover` (token de gradient como fallback).
- `title` se compone como `Cap. N · Título`; `subtitle` es `book.title`; `artist` es `book.author?.name ?? "Psico Platform"`.

`packages/types/src/index.ts` — `LectorAudioMetadata` nuevo + `LectorAudioResponse.metadata`. JSDoc explica el porqué de duplicar la metadata API ↔ archivo.

`apps/api/src/lector/lector.service.spec.ts` — fixture `freeBook` extendido con `coverArtUrl: null`. Test "returns audio metadata" ahora asserta el shape exacto del `metadata` (incluyendo el fallback al token). +1 test nuevo: "uses coverArtUrl when present and falls back to cover token otherwise".

`apps/api/src/lector/README.md` (nuevo) — §audio documenta la receta ffmpeg para mp3 y m4a + recomendaciones de cover (≤ 500×500 cuadrada).

### Web

`apps/web/src/components/dashboard/lector/AudioBar.tsx` — fila nueva ARRIBA de los controles nativos del `<audio>`. Renderiza:

- `<img>` con `data.metadata.artworkUrl` cuando empieza por `http(s)://`.
- `<div>` con `linear-gradient` cuando el valor es el token (`warm`/`cool`/`mixed`) — usa las mismas paletas que las covers de la biblioteca.
- `<p>` con `metadata.title` truncated + `<p>` con `metadata.subtitle · metadata.artist`.

### Mobile

`apps/mobile/src/components/dashboard/lector/LectorAudioBar.tsx`:

- State nuevo `metadata: LectorAudioMetadata | null`, populado desde `data.metadata` en `loadAndOpen()`.
- Render del header con `<Image source={{uri: metadata.artworkUrl}}>` o fallback `<View style={{backgroundColor: coverColor(token)}}>`. Reusa el helper `cover-colors.ts` ya existente (S5-front-mobile).
- Helper inline `isHttpUrl(s)` para distinguir URL real vs token.
- Estilos `metaRow`, `artwork`, `metaText`, `metaTitle`, `metaSubtitle` añadidos al StyleSheet.

### Cliente

`packages/api-client/src/generated.ts` regenerado (323 KB → 327.1 KB). El response del endpoint `GET /api/lector/{bookId}/{chapterOrder}/audio` sigue siendo `{ type: "object" }` en `openapi.json` (Swagger CLI plugin no introspecta interfaces externas), pero `lectorApi.getAudio()` castea explícitamente a `LectorAudioResponse` así que la tipización fluye correctamente al consumer.

---

## Decisiones

1. **Embed file-tags + API contract en el mismo sprint** — alternativa B era migrar a `expo-audio` (deprecado expo-av en SDK 52+), alternativa C era `react-native-track-player`. Ambas son ~3-5 días de trabajo (config + lifecycle + state ownership re-write). Embedded file-tags es ~30 min de ops + el API contract da forward-compatibility cuando llegue el día de migrar. Decisión validada con el usuario al inicio.
2. **`title = "Cap. N · Título"` server-side** — alternativa era que el cliente lo compusiera, pero entonces cada cliente nuevo (terminal de podcast, smart speaker future) tendría que reimplementar la misma regla. Centralizar en el server es la decisión correcta para un contrato API.
3. **`artworkUrl` puede ser URL O token de gradient** — soporta el estado actual donde la mayoría de los libros tienen solo el token de cover; cuando `coverArtUrl` esté seteado (sprint Author B2B), el lock-screen empieza a mostrar PNG real automáticamente.
4. **Fallback de artist a "Psico Platform"** — `book.author` es `BookAuthor?` (relación nullable desde S5). Si falta, no queremos mostrar `null` en el lock-screen.
5. **Sin endpoint nuevo + sin migración Prisma** — solo se extendió el response de un endpoint existente con campos derivados de columnas que ya existían. Cero work en producción.
6. **`<img>` plain en web (no `next/image`)** — los signed R2 URLs son short-lived (1h TTL) y next/image los cachea agresivamente, lo que pelea con el TTL. Plain `<img>` es lo correcto aquí. Mismo patrón que `AvatarUploadCard` y `CoverImageUpload`.
7. **README en `apps/api/src/lector/` y no `docs/`** — el contrato y la receta ops viven juntos; el README de módulo es donde un dev nuevo busca el "cómo".

---

## Smoke verification

```
@psico/types build  OK
@psico/api-client generate + generate:check  OK (323 KB → 327 KB)
@psico/api typecheck + lint  OK (4 warnings preexistentes)
@psico/api tests 654/655 (+1 skipped sentinel, sin tests nuevos requeridos)
@psico/crypto tests 34/34
@psico/web typecheck + lint + tests 122/122  OK
@psico/mobile typecheck + lint + tests 20/20  OK
```

### Flow mental

1. User abre Lector → tap "🔊 Audio" pill.
2. Cliente fetch `GET /api/lector/:bookId/:order/audio`.
3. Backend resuelve `Book` (con `coverArtUrl`/`cover`/`author`) y `Chapter`, devuelve `{ url, durationSec, transcript, metadata }`.
4. Bar renderea: thumbnail 48×48 + "Cap. 1 · El primer paso" + "Emociones en Construcción · Marina Quintana".
5. User tap play → audio reproduce. iOS lock-screen / Android MediaSession leen los tags ID3v2/m4a embebidos al archivo (responsabilidad ops, NO de este sprint).

---

## Deuda técnica abierta

- **Migrar a `expo-audio` o `react-native-track-player`** para metadata dinámica desde JS. Cuando aterrice, el `LectorAudioMetadata` ya está en el contrato → el setter del library consume el mismo objeto sin cambios.
- **Re-ejecutar el embed ffmpeg para los archivos ya subidos** — los m4a actuales en R2 no tienen tags. Tarea ops: ~2 archivos × 2 capítulos cada uno = 4 ejecuciones; cubrir con un script `embed-audio-metadata.mjs` en `scripts/` cuando sea más sistemático.
- **Cover ≤ 500×500** no validado server-side — cuando ops suba un cover de 4K, los tags m4a quedarán pesados (~4 MB de overhead por archivo). Validación queda como deuda para cuando Author B2B (S22) cierre el upload pipeline.
- **`artworkUrl` puede contener URLs con caracteres reservados** — el cliente hace `data.metadata.artworkUrl.startsWith("http")` que es robust enough, pero no escapa para usos como atributos HTML. Renderizado pasa por React así que el escaping está cubierto, pero documentado por si alguien lo pasa raw a SSR.
- **Sin tests UI dedicados** para la fila de artwork — los tests de mobile (RN Testing Library) y web (Vitest + RTL) están instalados pero el bar entero no tiene tests todavía. Sprint propio: cubrir el path completo (Pro gate + loading + ready + speed + sleep + artwork).

---

## Próximo paso

Sprints candidatos del backlog:

- **Bugfix #2 Stripe price IDs reales** — deuda de ops desde Sesión 30 (más urgente para revenue).
- **Observability (Sentry)** — wire API + worker + web + mobile.
- **Migración expo-av → expo-audio** — el bar entero se beneficia (lock-screen dinámica + mejor lifecycle), pero es un sprint largo.
- **Tests UI del LectorAudioBar** — cubre el bar completo (web + mobile).
