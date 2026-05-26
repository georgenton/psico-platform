# 05 · Lector

`Lector.html` (variante "Modo Libro" y "Modo Guía") + `Lector RISE.html` (variante experimental con bloques tipo Notion). Móvil-first; web replica.

---

## Pantalla: Lector · Modo Libro

**Ruta sugerida:** `/lector/:bookId?chapter=5&block=12`

### Datos que muestra

- `book`:
  - `id`, `title`, `author`, `cover`, `chapters`
- `chapter`:
  - `n`: number
  - `title`: string
  - `subtitle`: string (opcional)
  - `durationMinutes`: number
  - `audioAvailable`: boolean
- `blocks[]`: array de bloques de contenido
  - `id`: string
  - `kind`: enum ("paragraph" | "heading" | "quote" | "exercise" | "audio" | "image" | "pause")
  - `content`: string (markdown o JSON estructurado según kind)
  - `meta`: objeto (opcional, según kind)
    - `exercise`: `{ exerciseId, title, durationMinutes }`
    - `audio`: `{ url, durationSec, transcriptAvailable }`
    - `image`: `{ url, caption, alt }`
- `lessons[]`: array — ejercicios del capítulo
  - `id`, `title`, `kind` ("carta" | "audio" | "respiracion" | "preg"), `durationMinutes`, `status` ("locked" | "available" | "completed")
- `highlights[]`: array — subrayados del usuario en este capítulo
  - `id`, `blockId`, `start`: number, `end`: number, `color`: enum ("yellow"|"blue"|"pink"), `note`: string (opcional)
- `annotations[]`: array — notas del usuario
  - `id`, `blockId`, `text`: string, `createdAt`: Date
- `session`:
  - `progressPct`: number
  - `lastBlockSeen`: string (blockId)
  - `timeSpentSec`: number
- `theme`: enum ("light" | "sepia" | "dark") — del usuario
- `font`: enum ("serif" | "sans")

### Acciones del usuario

- **Scroll**: actualiza `lastBlockSeen` cada 5s.
- **Tap palabra**: selecciona → muestra menú (subrayar, copiar, definir, preguntar a Eco).
- **Subrayar**: POST a `/highlights`.
- **Anotar**: POST a `/annotations`.
- **Cambiar tema/fuente**: PATCH preferencias.
- **Abrir TOC**: muestra índice de capítulos del libro.
- **Empezar ejercicio**: navega a `/lector/:bookId?lesson=:id`.
- **Reproducir audio (si Modo Guía)**: controla player local + sync con backend.
- **Cerrar capítulo**: POST con estado final (completed si llegó al final).
- **Pedir a Eco**: abre side panel con contexto del párrafo (`fromBlockId`).

### Llamadas HTTP necesarias

- **Método:** GET — `/api/lector/:bookId/:chapterN` — Auth: Sí
  - **Response:** `{ book, chapter, blocks, lessons, highlights, annotations, session }`
- **Método:** PATCH — `/api/lector/session` — Auth: Sí (cada 5s, batched)
  - **Request:** `{ bookId, chapterN, lastBlockSeen, timeSpentDeltaSec }`
  - **Response:** `{ ok: true, progressPct }`
- **Método:** POST — `/api/highlights` — Auth: Sí
  - **Request:** `{ blockId, start, end, color, note? }`
  - **Response:** `{ ok: true, highlight }`
- **Método:** DELETE — `/api/highlights/:id` — Auth: Sí
- **Método:** POST — `/api/annotations` — Auth: Sí
  - **Request:** `{ blockId, text }`
  - **Response:** `{ ok: true, annotation }`
- **Método:** PATCH — `/api/annotations/:id` — Auth: Sí
- **Método:** DELETE — `/api/annotations/:id` — Auth: Sí
- **Método:** POST — `/api/lector/:bookId/:chapterN/complete` — Auth: Sí
  - **Response:** `{ ok: true, nextChapter: number | null }`
- **Método:** PATCH — `/api/user/reader-preferences` — Auth: Sí
  - **Request:** `{ theme?, font?, fontSize? }`

### Estados de la pantalla

- **Loading:** skeleton del bloque actual + barra de progreso.
- **Error:** 500 → muestra "Volver a intentar" sin perder posición local.
- **Offline:** detección — muestra banner "Estás leyendo offline. Tu progreso se sincronizará."
- **Locked (capítulo Pro):** muestra paywall inline al llegar al primer bloque locked.

---

## Pantalla: Lector · Modo Guía (audio)

**Ruta sugerida:** `/lector/:bookId?chapter=5&mode=guia`

### Datos que muestra (delta vs Modo Libro)

- `audio`:
  - `url`: string (signed URL, expira en 1h)
  - `durationSec`: number
  - `transcript[]`: array — bloques de transcripción
    - `start`: number (sec)
    - `end`: number
    - `text`: string
    - `blockId`: string (opcional — link al bloque del libro)

### Acciones del usuario adicionales

- **Play/pause**: estado local + tick a `/lector/session`.
- **Skip 15s / -15s**: local.
- **Cambiar velocidad** (0.8x, 1x, 1.2x, 1.5x): local.
- **Toggle transcripción**: muestra/oculta panel.
- **Tap línea de transcripción**: salta a ese tiempo.

### Llamadas HTTP adicionales

- **Método:** GET — `/api/lector/:bookId/:chapterN/audio` — Auth: Sí
  - **Response:** `{ url, durationSec, transcript }`

---

## Pantalla: Lector RISE (variante experimental)

**Ruta sugerida:** `/lector/:bookId/rise?chapter=5`

Misma estructura que Modo Libro pero con bloques editables tipo Notion. Pre-launch — no implementar todavía. La spec viva está en `prototype/`.

### Endpoint extra (futuro)

- **Método:** GET — `/api/lector/:bookId/:chapterN/rise` — Auth: Sí
- Devuelve los mismos `blocks` pero con tipo extendido (toggle, callout, AI suggestions).

---

## Endpoints de esta área

| Método | Endpoint                                 | Auth | Descripción                                              |
| ------ | ---------------------------------------- | ---- | -------------------------------------------------------- |
| GET    | `/api/lector/:bookId/:chapterN`          | Sí   | Capítulo completo (texto + lessons + highlights + notes) |
| GET    | `/api/lector/:bookId/:chapterN/audio`    | Sí   | Audio + transcripción del capítulo                       |
| PATCH  | `/api/lector/session`                    | Sí   | Heartbeat de progreso (batched)                          |
| POST   | `/api/lector/:bookId/:chapterN/complete` | Sí   | Marcar capítulo completo                                 |
| POST   | `/api/highlights`                        | Sí   | Crear subrayado                                          |
| DELETE | `/api/highlights/:id`                    | Sí   | Eliminar subrayado                                       |
| POST   | `/api/annotations`                       | Sí   | Crear nota                                               |
| PATCH  | `/api/annotations/:id`                   | Sí   | Editar nota                                              |
| DELETE | `/api/annotations/:id`                   | Sí   | Eliminar nota                                            |
| PATCH  | `/api/user/reader-preferences`           | Sí   | Tema, fuente, tamaño                                     |
