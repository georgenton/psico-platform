# 14 · Dynamic Island (iOS Live Activities)

`Dynamic Island.html` — Live Activities y ActivityKit para iOS. **No es una pantalla** sino un sistema de actualizaciones efímeras del sistema operativo. Aplica solo en app nativa iOS, no en web.

---

## Activity: Sesión de terapia (countdown + en curso)

### Estados

1. **Pre-sesión** (5-60 min antes): countdown a la sesión.
2. **En vivo** (durante): timer + nombre del terapeuta.
3. **Post-sesión** (5 min): "Cómo te fue" con quick rating.

### Datos enviados a la Activity

- `sessionId`: string
- `therapistName`: string
- `scheduledAt`: Date
- `state`: enum ("pre" | "live" | "post")
- `joinUrl`: string (deep link a la app)

### Endpoint

- POST `/api/push/live-activity` — Auth: Sí (server-initiated push)
  - **Request:** `{ sessionId, kind: "terapia-session", contentState, dismissAt }`
  - Servidor manda APNs token push para actualizar la Activity sin abrir la app.

---

## Activity: Lectura activa (Pro)

### Estados

1. **Reading** (mientras lee un capítulo): título, % progreso, tiempo restante estimado.
2. **Paused**: estado pausado.

### Datos

- `bookId`, `chapterN`, `chapterTitle`, `progressPct`, `etaMinutes`

### Endpoint

- POST `/api/push/live-activity` — Auth: Sí (server-initiated cuando el usuario empieza a leer en iOS y la app se va a background)

---

## Activity: Sesión de Eco activa

Mismo esquema. Estados: "thinking" → "responding".

---

## Endpoints de esta área

| Método | Endpoint                      | Auth | Descripción                        |
| ------ | ----------------------------- | ---- | ---------------------------------- |
| POST   | `/api/push/live-activity`     | Sí   | Iniciar / actualizar Live Activity |
| DELETE | `/api/push/live-activity/:id` | Sí   | Cerrar Live Activity               |
| POST   | `/api/push/token`             | Sí   | Registrar APNs token del device    |

### Notas

- Live Activities solo funcionan en iOS 16.1+.
- Requiere `NSExtensionPrincipalClass` en la app nativa.
- No es prioridad v1 — implementar después de validar producto core en móvil.
