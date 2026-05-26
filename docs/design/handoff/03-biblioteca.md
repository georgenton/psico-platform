# 03 · Mi Biblioteca

`Mi Biblioteca.html` — catálogo + sección "Mis libros". Web (grilla + filtros laterales) y móvil (lista vertical con tabs).

---

## Pantalla: Mi Biblioteca

**Ruta sugerida:** `/biblioteca?view=catalogo&sort=recent`

### Datos que muestra

- `user.tier`: enum ("free" | "pro")
- `categories[]`: array
  - `id`: string ("ansiedad" | "vinculos" | "duelo" | …)
  - `label`: string
  - `count`: number — libros en esa categoría
- `authors[]`: array
  - `id`: string
  - `name`: string
  - `initials`: string
  - `cover`: enum
  - `bookCount`: number
- `books[]`: array (paginado)
  - `id`: string (requerido)
  - `title`: string (requerido)
  - `subtitle`: string (opcional)
  - `authorId`: string
  - `authorName`: string
  - `cover`: enum
  - `categoryId`: string
  - `chapters`: number
  - `pages`: number
  - `durationMinutes`: number
  - `publishedOn`: Date
  - `rating`: number (0-5)
  - `reviewCount`: number
  - `tierRequired`: enum ("free" | "pro")
  - `userProgress`: objeto | null
    - `startedAt`: Date
    - `lastChapterRead`: number
    - `progressPct`: number
    - `completedAt`: Date | null
  - `isFavorite`: boolean
  - `isBookmarked`: boolean
- `myBooks[]`: subset de `books[]` con `userProgress !== null`
- `recos[]`: array (max 4) — sugeridos personalizados
- `pagination`: `{ page: number, perPage: number, total: number }`

### Acciones del usuario

- **Cambiar tab** (Catálogo / Mis libros / Sugerencias): cambia `view` en URL.
- **Filtrar por categoría**: agrega `categoryId` a querystring.
- **Filtrar por autor**: agrega `authorId`.
- **Ordenar**: `sort=recent|alpha|marina` — re-fetch.
- **Toggle vista grid/list**: estado local; persiste en `localStorage`.
- **Click libro**: navega a `/libros/:id`.
- **Favorito**: POST/DELETE a `/api/books/:id/favorite`.
- **Bookmark**: idem para `/bookmark`.
- **Buscar**: input → debounced GET con `q=`.

### Llamadas HTTP necesarias

- **Método:** GET — `/api/books` — Auth: Sí
  - **Query:** `view=catalogo|mis|recos`, `categoryId?`, `authorId?`, `sort?`, `q?`, `page=1`, `perPage=24`
  - **Response:** `{ books, pagination, categories, authors }`
- **Método:** GET — `/api/books/recos` — Auth: Sí
  - **Response:** `{ recos: Book[] }`
- **Método:** POST — `/api/books/:id/favorite` — Auth: Sí — toggle
- **Método:** POST — `/api/books/:id/bookmark` — Auth: Sí — toggle
- **Método:** GET — `/api/books/categories` — Auth: No (catálogo público)
- **Método:** GET — `/api/books/authors` — Auth: No

### Estados de la pantalla

- **Loading:** skeleton de 8-12 covers en gris (depende del tamaño de viewport).
- **Error:** 500 → "No pudimos cargar la biblioteca" + retry.
- **Empty:**
  - `view=mis` y `myBooks.length === 0` → "Aún no has empezado ningún libro" + CTA a catálogo.
  - Búsqueda sin resultados → "No encontramos libros con ese término".

### Notas

- Libros con `tierRequired === "pro"` se muestran a free con candado sutil pero accesibles para tap (lleva al paywall en `/libros/:id`).
- La grilla cambia entre 2/3/4/5 columnas según breakpoint.

---

## Endpoints de esta área

| Método | Endpoint                  | Auth | Descripción                   |
| ------ | ------------------------- | ---- | ----------------------------- |
| GET    | `/api/books`              | Sí   | Listado de libros con filtros |
| GET    | `/api/books/recos`        | Sí   | Recos personalizadas          |
| GET    | `/api/books/categories`   | No   | Catálogo de categorías        |
| GET    | `/api/books/authors`      | No   | Catálogo de autores           |
| POST   | `/api/books/:id/favorite` | Sí   | Toggle favorito               |
| POST   | `/api/books/:id/bookmark` | Sí   | Toggle bookmark               |
