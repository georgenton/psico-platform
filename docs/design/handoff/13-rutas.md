# 13 · Rutas (bundles)

`Rutas.html` — bundles temáticos de libros vendidos en conjunto. Modelo de pricing alternativo (por libro / por bundle) vs Pro subscription. **Decisión de producto pendiente** — el boundary v1 sugiere quedarse con Pro subscription.

---

## Pantalla: Rutas · Catálogo

**Ruta sugerida:** `/rutas`

### Datos que muestra

- `pricingModel`: enum ("catalogo" | "por-libro")
- `bundles[]`: array
  - `id`: string
  - `slug`: string
  - `title`: string ("Ruta de la ansiedad")
  - `subtitle`: string
  - `cover`: enum o image URL
  - `bookIds[]`: string[]
  - `bookCount`: number
  - `totalChapters`: number
  - `totalMinutes`: number
  - `priceUsd`: number
  - `priceBundled`: number — precio del bundle
  - `discountPct`: number
  - `description`: string
  - `outcomeTags[]`: string[] ("dormir mejor", "calmar la ansiedad", …)
  - `recommendedFor[]`: string[]
  - `byline`: string — quién la creó
  - `popularity`: number (orden)

### Acciones del usuario

- **Click ruta**: navega a `/rutas/:slug`.
- **Filtrar por outcome tag**: querystring.
- **Comprar ruta**: si pricingModel="por-libro" → iniciar checkout (Stripe).

### Llamadas HTTP necesarias

- **Método:** GET — `/api/rutas` — Auth: Sí
  - **Response:** `{ pricingModel, bundles, tags }`
- **Método:** GET — `/api/rutas/:slug` — Auth: Sí
  - **Response:** `{ bundle, books, reviews }`
- **Método:** POST — `/api/billing/checkout-session` (compartido con plan)
  - **Request:** `{ kind: "bundle", bundleId }`

### Estados de la pantalla

- **Loading:** skeleton.
- **Error:** 500.
- **Empty:** "Aún no hay rutas publicadas" (si pricingModel cambia y no hay catálogo).

### Notas

- Si el modelo de negocio se queda en Pro subscription, esta pantalla puede no implementarse en v1. Las rutas se pueden representar dentro de `Mi Biblioteca` como "colecciones curadas".

---

## Endpoints de esta área

| Método | Endpoint           | Auth | Descripción                |
| ------ | ------------------ | ---- | -------------------------- |
| GET    | `/api/rutas`       | Sí   | Listado de rutas / bundles |
| GET    | `/api/rutas/:slug` | Sí   | Detalle de una ruta        |
