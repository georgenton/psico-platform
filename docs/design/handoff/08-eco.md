# 08 · Eco

`Eco.html` — compañero conversacional con IA. Tiene un comportamiento moderado, no terapéutico. Pro tiene conversaciones largas; Free tiene 10 mensajes/día.

**Privacidad:** hilos de Eco se almacenan cifrados (igual que diario). El servidor envía `messageCiphertext` al modelo de IA solo durante la inferencia (en memoria, no persistido en logs del LLM).

---

## Pantalla: Eco · Conversación

**Ruta sugerida:** `/eco?threadId=:id?`

### Datos que muestra

- `user.tier`: enum
- `eco.persona`:
  - `name`: string ("Eco")
  - `voice`: string — tono editorial
  - `caps`: array de strings — qué puede hacer ("escucharte sin juzgar", "ayudarte a nombrar lo que sientes", …)
- `thread`: objeto | null
  - `id`: string
  - `createdAt`: Date
  - `lastMessageAt`: Date
  - `summary`: string (opcional, cifrado — resumen generado por IA cada 20 mensajes)
- `messages[]`: array (paginado, scroll up para cargar más)
  - `id`: string
  - `role`: enum ("user" | "eco" | "system")
  - `textCiphertext`: string
  - `textNonce`: string
  - `createdAt`: Date
  - `suggestions[]`: array (solo en mensajes de Eco) — prompts sugeridos para responder
- `prompts[]`: array — prompts iniciales si thread vacío ("¿Cómo te sentiste hoy?", "Cuéntame algo bueno")
- `quotaRemaining`:
  - `messagesTodayLeft`: number (free: 10, pro: 200)
  - `resetsAt`: Date
- `rail[]`: array — hilos anteriores en sidebar
  - `id`, `title`, `lastMessageAt`, `messageCount`

### Acciones del usuario

- **Enviar mensaje**: encripta → POST a `/eco/messages`. La response llega streaming.
- **Nuevo hilo**: POST a `/eco/threads`.
- **Cambiar a hilo anterior**: navega con `threadId`.
- **Eliminar hilo**: DELETE.
- **Reportar respuesta**: POST con razón (alucinación, fuera de tono, contenido sensible).
- **Pedir a Eco que sugiera un libro / ejercicio**: el cliente envía un mensaje con flag `intent: "suggest"` → Eco responde con `kind: "suggestion"` y un `bookId` o `exerciseId`.

### Llamadas HTTP necesarias

- **Método:** GET — `/api/eco/threads` — Auth: Sí
  - **Response:** `{ rail, currentThreadId }`
- **Método:** POST — `/api/eco/threads` — Auth: Sí
  - **Response:** `{ id, createdAt }`
- **Método:** GET — `/api/eco/threads/:id?cursor=` — Auth: Sí
  - **Response:** `{ thread, messages, hasMore }`
- **Método:** POST — `/api/eco/messages` — Auth: Sí
  - **Request:** `{ threadId, textCiphertext, textNonce, intent?: "free" | "suggest" }`
  - **Response:** Server-Sent Events (SSE) o streaming chunked
    - Eventos: `delta` (token-by-token), `suggestion` (libro o ejercicio referenciado), `done` (con id del mensaje completo y `quotaRemaining`)
  - **Errors:** 402 (cuota agotada free), 429 (rate-limit), 451 (contenido bloqueado por safety)
- **Método:** DELETE — `/api/eco/threads/:id` — Auth: Sí
- **Método:** POST — `/api/eco/messages/:id/report` — Auth: Sí
  - **Request:** `{ reason: enum, comment?: string }`
- **Método:** GET — `/api/eco/caps` — Auth: Sí
  - **Response:** `{ caps, voice, name }`

### Estados de la pantalla

- **Loading (carga inicial):** skeleton de bubbles.
- **Streaming (mientras Eco responde):** typing indicator que se reemplaza por texto progresivo.
- **Error de envío:** mensaje queda en estado "no enviado" con botón "Reintentar".
- **Quota agotada (free):** banner "Hoy ya escribiste tus 10 mensajes con Eco. Vuelve mañana o hazte Pro."
- **Empty (sin hilo / thread nuevo):** muestra prompts iniciales + cap de Eco.
- **Crisis trigger:** si el modelo detecta señales de riesgo, devuelve `kind: "crisis"` con texto fijo + link a `/terapia/crisis`. Esto es **no-negociable**.

### Notas críticas

- Eco **no** es un terapeuta. Cada hilo nuevo abre con un disclaimer suave que lo reafirma.
- Si el usuario está en estado de crisis (palabras-clave: suicidio, autolesión), Eco corta el flujo normal y deriva.
- Persistencia: los mensajes cifrados nunca se descifran en el servidor. La inferencia con el LLM ocurre con un canal específico que descifra en memoria del worker y descarta tras la respuesta.

---

## Endpoints de esta área

| Método | Endpoint                       | Auth | Descripción                         |
| ------ | ------------------------------ | ---- | ----------------------------------- |
| GET    | `/api/eco/threads`             | Sí   | Rail de hilos del usuario           |
| POST   | `/api/eco/threads`             | Sí   | Crear hilo nuevo                    |
| GET    | `/api/eco/threads/:id`         | Sí   | Mensajes de un hilo                 |
| DELETE | `/api/eco/threads/:id`         | Sí   | Eliminar hilo                       |
| POST   | `/api/eco/messages`            | Sí   | Enviar mensaje (response streaming) |
| POST   | `/api/eco/messages/:id/report` | Sí   | Reportar respuesta                  |
| GET    | `/api/eco/caps`                | Sí   | Persona/caps configurada de Eco     |
