# 16 · Editor de autor (B2B)

`Editor de autor.html` — herramienta separada para autores/terapeutas que escriben libros en la plataforma. **Producto distinto** — auth, dashboard, lifecycle propios. Es la pieza B2B para crear contenido.

Pantallas principales: Dashboard, Editor (variantes Substack-like y Notion-like), Diseño/portada, Estructura del libro, Publicación.

---

## Pantalla: Dashboard del autor

**Ruta sugerida:** `/autor/dashboard`

### Datos que muestra

- `author`:
  - `id`, `name`, `title`, `licenseNumber`, `verified`: boolean
  - `tier`: enum ("free" | "pro-autor") — modelo de revenue share
- `books[]`: array
  - `id`, `title`, `status` ("draft" | "in-review" | "published" | "archived")
  - `chapters`, `wordsCount`, `progressPct`
  - `lastEditedAt`, `publishedAt`
  - `readers`: number (si publicado)
  - `nps`: number (si publicado)
  - `revenueShareUsd`: number (mes)
- `templates[]`: array — plantillas para empezar un libro
- `aiHelpers[]`: array — asistentes IA disponibles (revisor, sugerencias, tono)
- `versionHistory[]`: array — snapshots automáticos del libro activo
- `publicationSteps[]`: array — checklist de publicación

### Acciones del usuario

- **Nuevo libro**: POST → navega al editor.
- **Click libro**: navega a `/autor/libros/:id/editor`.
- **Ver pagos**: navega a `/autor/cobros`.

### Llamadas HTTP necesarias

- **Método:** GET — `/api/autor/dashboard` — Auth: Sí (rol author)
- **Método:** POST — `/api/autor/libros` — Auth: Sí
  - **Request:** `{ title, templateId? }`
  - **Response:** `{ ok: true, bookId }`

---

## Pantalla: Editor (Substack-like)

**Ruta sugerida:** `/autor/libros/:id/editor`

### Datos que muestra

- `book`: meta del libro
- `structure[]`: capítulos del libro (índice editable)
- `currentChapter`:
  - `n`, `title`, `subtitle`, `blocks[]` (mismo schema que el lector pero editable)
- `versionHistory[]`: snapshots automáticos cada 5 min
- `aiHelpers`: estado de helpers (revisar tono, sugerir ejemplo, simplificar)

### Acciones del usuario

- **Editar texto**: autosave cada 10s.
- **Insertar bloque**: menú "/" tipo Notion (paragraph, heading, quote, exercise, audio, image).
- **Subir audio del capítulo**: multipart upload.
- **Pedir ayuda a IA**: POST con `intent` ("revisar" | "ejemplo" | "tono" | "simplificar") y selección de texto.
- **Restaurar versión**: lista de snapshots → POST restore.
- **Publicar**: navega a flujo de publicación.

### Llamadas HTTP necesarias

- **Método:** GET — `/api/autor/libros/:id` — Auth: Sí
- **Método:** PATCH — `/api/autor/libros/:id` — Auth: Sí
  - **Request:** parcial de `{ title, subtitle, cover, categoryId, structure }`
- **Método:** GET — `/api/autor/libros/:id/capitulos/:n` — Auth: Sí
- **Método:** PATCH — `/api/autor/libros/:id/capitulos/:n` — Auth: Sí
  - **Request:** `{ title?, blocks?: Block[] }`
  - **Response:** `{ ok: true, version: number }`
- **Método:** POST — `/api/autor/libros/:id/capitulos/:n/audio` — Auth: Sí — multipart
- **Método:** POST — `/api/autor/libros/:id/ai-help` — Auth: Sí
  - **Request:** `{ intent, selection: { blockId, text }, context? }`
  - **Response:** streaming SSE con suggestion
- **Método:** GET — `/api/autor/libros/:id/versiones` — Auth: Sí
- **Método:** POST — `/api/autor/libros/:id/versiones/:vid/restore` — Auth: Sí

### Estados

- **Loading:** skeleton del editor.
- **Saving:** indicador "Guardando…" en topbar.
- **Conflict (otra sesión edita):** modal "Hay otra sesión abierta. Última actualización por …".
- **Empty:** capítulo nuevo vacío con placeholder.

---

## Pantalla: Diseño / portada

**Ruta sugerida:** `/autor/libros/:id/diseno`

### Datos

- `cover`:
  - `kind`: enum ("gradient-token" | "image")
  - `gradientToken`: enum ("cool" | "warm" | "mixed" | custom)
  - `imageUrl`: string | null
  - `titlePlacement`: enum
  - `font`: enum

### Acciones

- **Cambiar gradient**: selector de tokens.
- **Subir imagen**: multipart.
- **Preview en device frame**: estado local.

### Endpoints

- PATCH `/api/autor/libros/:id/diseno` — Auth: Sí
- POST `/api/autor/libros/:id/cover-image` — Auth: Sí (multipart)

---

## Pantalla: Estructura del libro

**Ruta sugerida:** `/autor/libros/:id/estructura`

### Datos

- `chapters[]`: array editable (drag-reorder)
  - `n`, `title`, `subtitle`, `wordsCount`, `status`, `locked` (enable/disable Pro)

### Acciones

- **Reordenar**: drag-drop → PATCH.
- **Renombrar / eliminar**: idem.

### Endpoints

- PATCH `/api/autor/libros/:id/estructura` — Auth: Sí
  - **Request:** `{ chapters: [{ n, title, subtitle, locked }] }`

---

## Pantalla: Publicación

**Ruta sugerida:** `/autor/libros/:id/publicar`

### Datos

- `publicationSteps[]`: checklist
  - `id`, `label`, `description`, `done`: boolean, `blocker`: boolean
  - Ej. "Portada subida", "Mínimo 3 capítulos", "Bio del autor completa", "Revisión legal", "Aceptación de términos"
- `pricingPolicy`: revenue share configurado para el autor
- `reviewState`: enum ("not-submitted" | "submitted" | "approved" | "rejected")

### Acciones

- **Enviar a revisión**: POST cuando todos los blockers estén verdes.
- **Republicar**: si rechazo previo.

### Endpoints

- GET `/api/autor/libros/:id/publicacion` — Auth: Sí
- POST `/api/autor/libros/:id/publicar` — Auth: Sí
- POST `/api/autor/libros/:id/despublicar` — Auth: Sí

### Estados

- **Loading / Error / Empty:** estándar.
- **Submitted:** banner "Tu libro está en revisión. Tiempo estimado: 5 días hábiles."
- **Rejected:** mensaje editorial con razones específicas + opción de re-enviar.

---

## Endpoints de esta área

| Método | Endpoint                                       | Auth            | Descripción                                |
| ------ | ---------------------------------------------- | --------------- | ------------------------------------------ |
| GET    | `/api/autor/dashboard`                         | Sí (rol author) | Dashboard del autor                        |
| POST   | `/api/autor/libros`                            | Sí              | Crear libro borrador                       |
| GET    | `/api/autor/libros/:id`                        | Sí              | Meta del libro                             |
| PATCH  | `/api/autor/libros/:id`                        | Sí              | Editar meta                                |
| DELETE | `/api/autor/libros/:id`                        | Sí              | Archivar libro                             |
| GET    | `/api/autor/libros/:id/capitulos/:n`           | Sí              | Capítulo en edición                        |
| PATCH  | `/api/autor/libros/:id/capitulos/:n`           | Sí              | Editar capítulo                            |
| POST   | `/api/autor/libros/:id/capitulos/:n/audio`     | Sí              | Subir audio del capítulo                   |
| POST   | `/api/autor/libros/:id/ai-help`                | Sí              | IA: revisar / ejemplo / tono / simplificar |
| GET    | `/api/autor/libros/:id/versiones`              | Sí              | Historial de versiones                     |
| POST   | `/api/autor/libros/:id/versiones/:vid/restore` | Sí              | Restaurar versión                          |
| PATCH  | `/api/autor/libros/:id/diseno`                 | Sí              | Editar portada                             |
| POST   | `/api/autor/libros/:id/cover-image`            | Sí              | Subir imagen de portada                    |
| PATCH  | `/api/autor/libros/:id/estructura`             | Sí              | Reordenar capítulos                        |
| GET    | `/api/autor/libros/:id/publicacion`            | Sí              | Estado de publicación                      |
| POST   | `/api/autor/libros/:id/publicar`               | Sí              | Enviar a revisión                          |
| POST   | `/api/autor/libros/:id/despublicar`            | Sí              | Quitar de catálogo                         |
| GET    | `/api/autor/cobros`                            | Sí              | Estado de revenue share                    |
