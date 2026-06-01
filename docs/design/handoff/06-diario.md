# 06 · Diario

`Diario.html` — diario emocional del usuario. Lista de entradas + composer + detalle. Móvil-first.

**Privacidad crítica:** todo el `text` del diario viaja cifrado. El cliente lo encripta con clave derivada del usuario; el backend almacena el ciphertext. Endpoints reciben/devuelven `textCiphertext` y `textNonce`, nunca `text` plano.

---

## Pantalla: Diario · Lista

**Ruta sugerida:** `/diario`

### Datos que muestra

- `user.tier`: enum ("free" | "pro")
- `streakDays`: number
- `entries[]`: array (paginado por mes)
  - `id`: string
  - `createdAt`: Date
  - `mood`: enum ("calma" | "foco" | "energia" | "reflexion" | "ansiedad" | "tristeza" | "alegria" | …)
  - `moodSwatch`: string (token de color)
  - `kind`: enum ("free" | "prompted" | "voz")
  - `promptId`: string (opcional, si kind="prompted")
  - `promptText`: string (opcional)
  - `excerpt`: string (primeros ~80 chars, también cifrado — el cliente desencripta)
  - `textCiphertext`: string
  - `textNonce`: string
  - `tags[]`: string[]
  - `wordCount`: number — derivado en el cliente
  - `audioUrl`: string (opcional, solo si kind="voz")
  - `audioDurationSec`: number (opcional)
- `moodMap`: objeto — mood por día último mes
  - `byDay`: `{ [iso_date]: moodId }`
- `tags[]`: array — todas las tags usadas, con conteo
- `promptOfTheDay`:
  - `id`: string
  - `text`: string

### Acciones del usuario

- **Nueva entrada**: navega a `/diario/nueva`.
- **Click entrada**: navega a `/diario/:id`.
- **Filtrar por mood**: querystring `mood=`.
- **Filtrar por tag**: querystring `tag=`.
- **Buscar**: input → cliente filtra entries ya desencriptadas (no manda query al servidor para preservar privacidad).

### Llamadas HTTP necesarias

- **Método:** GET — `/api/diario/entries?from=2026-04-01&to=2026-05-25&mood=&tag=&page=1` — Auth: Sí
  - **Response:** `{ entries, moodMap, tags, pagination }`
- **Método:** GET — `/api/diario/prompt-of-the-day` — Auth: Sí
  - **Response:** `{ id, text }`

### Estados de la pantalla

- **Loading:** skeleton de 3 cards.
- **Error:** 500 → retry.
- **Empty (sin entradas):** ilustración suave + texto "Tu primera entrada empieza aquí" + CTA "Anotar cómo me siento".

---

## Pantalla: Diario · Nueva entrada

**Ruta sugerida:** `/diario/nueva?prompt=:id?`

### Datos que muestra

- `prompt`: objeto | null (si se llegó con `?prompt=`)
- `moodOptions[]`: array de moods
- `tagsSuggested[]`: array — tags usadas recientemente
- `voiceAvailable`: boolean — si tier permite dictado por voz (Pro)

### Acciones del usuario

- **Seleccionar mood**: required antes de guardar.
- **Escribir texto**: textarea con autosave local cada 10s.
- **Agregar tags**: chip input.
- **Dictar (Pro)**: navega a `/voz` con callback → vuelve con texto pegado.
- **Guardar**: encripta localmente y POST.
- **Descartar**: confirma antes de perder.

### Llamadas HTTP necesarias

- **Método:** POST — `/api/diario/entries` — Auth: Sí
  - **Request:** `{ mood, promptId?, textCiphertext, textNonce, tags[], audioUrl?, audioDurationSec? }`
  - **Response:** `{ ok: true, id, createdAt, excerpt: ciphertext }`

### Estados de la pantalla

- **Loading:** mientras guarda — botón "Guardar" muestra spinner.
- **Error:** 500 → retiene texto local y reintenta.
- **Empty:** N/A.

---

## Pantalla: Diario · Detalle de entrada

**Ruta sugerida:** `/diario/:id`

### Datos que muestra

- `entry`: misma estructura que en la lista, pero con `textCiphertext` completo (no excerpt).
- `relatedEntries[]`: array (max 3) — entradas con tags similares (los IDs solo; el cliente las correlaciona)

### Acciones del usuario

- **Editar**: navega a `/diario/:id/editar`.
- **Eliminar**: confirm modal → DELETE.
- **Compartir con terapeuta** (solo si tiene terapia activa): POST a `/api/diario/entries/:id/share`.

### Llamadas HTTP necesarias

- **Método:** GET — `/api/diario/entries/:id` — Auth: Sí
- **Método:** PATCH — `/api/diario/entries/:id` — Auth: Sí
  - **Request:** `{ mood?, textCiphertext?, textNonce?, tags? }`
- **Método:** DELETE — `/api/diario/entries/:id` — Auth: Sí
- **Método:** POST — `/api/diario/entries/:id/share` — Auth: Sí (solo si terapia activa)
  - **Request:** `{ therapistId, ephemeralKey }`
  - **Response:** `{ ok: true, shareUntil: Date }`

### Estados de la pantalla

- **Loading:** skeleton del card.
- **Error:** 404 → "Esta entrada ya no existe" → vuelve a lista.
- **Empty:** N/A.

---

## Endpoints de esta área

| Método | Endpoint                        | Auth | Descripción                                   |
| ------ | ------------------------------- | ---- | --------------------------------------------- |
| GET    | `/api/diario/entries`           | Sí   | Listado paginado de entradas + moodMap + tags |
| GET    | `/api/diario/entries/:id`       | Sí   | Detalle de una entrada                        |
| POST   | `/api/diario/entries`           | Sí   | Crear entrada                                 |
| PATCH  | `/api/diario/entries/:id`       | Sí   | Editar entrada                                |
| DELETE | `/api/diario/entries/:id`       | Sí   | Eliminar entrada                              |
| GET    | `/api/diario/prompt-of-the-day` | Sí   | Prompt sugerido del día                       |
| POST   | `/api/diario/entries/:id/share` | Sí   | Compartir entrada con terapeuta (re-encrypt)  |
