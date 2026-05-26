# 15 · Wallpapers

`Wallpapers.html` — fondos descargables para móvil. Pieza de marca / hábito.

---

## Pantalla: Wallpapers

**Ruta sugerida:** `/wallpapers`

### Datos que muestra

- `wallpapers[]`: array
  - `id`: string
  - `title`: string
  - `byline`: string (autor del wallpaper, si aplica)
  - `previewUrl`: string — URL de preview pequeña
  - `formats[]`: array
    - `device`: enum ("iphone-15-pro" | "iphone-15" | "android-portrait" | "android-square" | "desktop-1440" | …)
    - `url`: string (signed, 24h TTL)
    - `width`, `height`: number
    - `bytes`: number
  - `theme`: enum ("calma" | "foco" | "noche" | …)
  - `seasonal`: boolean
  - `tierRequired`: enum ("free" | "pro")
- `categories[]`: array de themes con conteo

### Acciones del usuario

- **Click wallpaper**: abre modal con preview grande + selector de device.
- **Descargar**: descarga el formato correcto.
- **Compartir**: Web Share API.

### Llamadas HTTP necesarias

- **Método:** GET — `/api/wallpapers` — Auth: Sí
  - **Query:** `theme?`, `seasonal?`, `device?`
- **Método:** GET — `/api/wallpapers/:id/download?device=` — Auth: Sí
  - **Response:** redirige a signed URL o devuelve `{ url, expiresAt }`
  - Tier locked devuelve 402.

### Estados de la pantalla

- **Loading:** skeleton grid.
- **Error:** 500.
- **Empty:** no aplica.

### Notas

- Es contenido secundario. No es prioridad v1.

---

## Endpoints de esta área

| Método | Endpoint                       | Auth | Descripción             |
| ------ | ------------------------------ | ---- | ----------------------- |
| GET    | `/api/wallpapers`              | Sí   | Catálogo de wallpapers  |
| GET    | `/api/wallpapers/:id/download` | Sí   | URL firmada de descarga |
