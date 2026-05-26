# 04 · Detalle de libro

`Detalle de libro.html` — pantalla de detalle/landing del libro. Web y móvil con 2 variantes (Estándar y Inmersivo).

---

## Pantalla: Detalle de libro

**Ruta sugerida:** `/libros/:id`

### Datos que muestra

- `book`:
  - `id`: string (requerido)
  - `title`: string (requerido)
  - `subtitle`: string (opcional)
  - `cover`: enum
  - `coverArtUrl`: string (opcional) — imagen real si existe
  - `summary`: string — descripción larga (markdown)
  - `chapters`: number
  - `pages`: number
  - `durationMinutes`: number
  - `categoryLabel`: string
  - `tierRequired`: enum ("free" | "pro")
  - `publishedOn`: Date
  - `language`: string ("es")
  - `audioAvailable`: boolean
  - `exercisesAvailable`: boolean
- `author`:
  - `id`: string
  - `name`: string
  - `title`: string — título profesional ("Dra. en Psicología Clínica")
  - `bio`: string
  - `avatarUrl`: string (opcional)
  - `licenseNumber`: string (opcional, visible solo si verificado)
  - `bookCount`: number
- `chaptersList[]`: array
  - `n`: number
  - `title`: string
  - `durationMinutes`: number
  - `lockedByTier`: boolean
  - `userProgress`:
    - `status`: enum ("not-started" | "started" | "completed")
    - `progressPct`: number
- `rating`:
  - `avg`: number
  - `count`: number
  - `breakdown`: `{ 5: number, 4: number, 3: number, 2: number, 1: number }`
- `reviews[]`: array (paginado, primeras 5)
  - `id`: string
  - `userInitials`: string
  - `userCity`: string (opcional)
  - `rating`: number
  - `text`: string
  - `createdAt`: Date
- `userProgress`: objeto | null (si usuario lo empezó)
  - `startedAt`: Date
  - `lastChapterRead`: number
  - `lastReadAt`: Date
  - `progressPct`: number
  - `completedAt`: Date | null

### Acciones del usuario

- **Empezar a leer** / **Continuar**: navega a `/lector/:id?chapter=:n`. Si tier insuficiente → muestra paywall.
- **Escuchar (audio)**: navega a `/lector/:id?mode=guia`.
- **Marcar favorito / bookmark**: idem biblioteca.
- **Compartir**: invoca Web Share API o muestra modal con link.
- **Ver más reseñas**: navega a `/libros/:id/reviews`.
- **Escribir reseña**: abre modal — solo disponible si `userProgress.completedAt !== null`.
- **Reportar**: opciones sutiles en menú "•••".

### Llamadas HTTP necesarias

- **Método:** GET — `/api/books/:id` — Auth: Sí
  - **Response:** `{ book, author, chaptersList, rating, reviews, userProgress }`
- **Método:** GET — `/api/books/:id/reviews?page=1&perPage=10` — Auth: Sí
  - **Response:** `{ reviews, pagination }`
- **Método:** POST — `/api/books/:id/reviews` — Auth: Sí (solo completados)
  - **Request:** `{ rating: 1-5, text: string }`
  - **Response:** `{ ok: true, review: Review }`
- **Método:** POST — `/api/books/:id/start` — Auth: Sí — crea entrada de progreso
  - **Response:** `{ ok: true, userProgress }`

### Estados de la pantalla

- **Loading:** skeleton de hero + meta + lista de capítulos en gris.
- **Error:** 404 → "Libro no encontrado" con CTA a biblioteca. 500 → retry.
- **Empty:** N/A (siempre hay un libro).
- **Locked (libro Pro, usuario free):** muestra todo el detalle, pero CTA principal es "Hazte Pro para leer" → navega a `/plan`.

### Notas

- Variante "Inmersivo" usa cover full-bleed; variante "Estándar" usa cover lateral. El backend devuelve los mismos datos; la elección es de cliente.
- `licenseNumber` solo se muestra para autores con cuenta verificada (banco de psicólogos colegiados).

---

## Endpoints de esta área

| Método | Endpoint                 | Auth | Descripción                       |
| ------ | ------------------------ | ---- | --------------------------------- |
| GET    | `/api/books/:id`         | Sí   | Detalle completo del libro        |
| GET    | `/api/books/:id/reviews` | Sí   | Reseñas paginadas                 |
| POST   | `/api/books/:id/reviews` | Sí   | Crear reseña (solo si completado) |
| POST   | `/api/books/:id/start`   | Sí   | Marcar libro como empezado        |
