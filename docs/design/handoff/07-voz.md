# 07 · Voz · dictado

`Voice-to-text.html` — pantalla modal para dictado por voz. Usada principalmente desde Diario para crear entradas habladas. Solo Pro.

---

## Pantalla: Voz · dictando

**Ruta sugerida:** `/voz?return=:returnPath`

### Datos que muestra

- `user.tier`: enum ("free" | "pro") — bloquea si free
- `state`: enum ("idle" | "recording" | "transcribing" | "ready")
- `recordingDurationSec`: number (live counter)
- `waveformLevels[]`: number[] — niveles RMS en tiempo real (cliente)
- `transcript`: string (live, una vez transcribiendo)
- `language`: enum ("es-419" | "es-ES") — detectado o preferencia del usuario

### Acciones del usuario

- **Empezar a grabar**: pide permiso de micrófono → empieza captura.
- **Pausar / reanudar**: estado local.
- **Detener**: cierra grabación → sube audio a backend → recibe transcript.
- **Cancelar**: descarta sin guardar.
- **Editar transcript**: textarea editable.
- **Usar este texto**: navega a `returnPath` con el texto como query/state.

### Llamadas HTTP necesarias

- **Método:** POST — `/api/voz/transcribe` — Auth: Sí
  - **Request:** `multipart/form-data` con `audio` (webm/ogg, máx. 60 MB), `language?: string`
  - **Response:** `{ ok: true, transcript: string, durationSec: number, language: string }`
  - **Latencia esperada:** 2-8s (Whisper o equivalente)
  - **Errors:** 413 (audio muy grande), 415 (formato no soportado), 429 (rate-limit), 402 (free tier)
- **Método:** POST — `/api/voz/usage` — Auth: Sí
  - **Request:** `{ secondsUsed: number }`
  - **Response:** `{ ok: true, remainingMinutesThisMonth: number }`
  - Llamado al final para tracking de cuota (Pro tiene 120 min/mes).

### Estados de la pantalla

- **idle:** botón grande "Toca para hablar".
- **recording:** waveform animado + timer + botón "Detener".
- **transcribing:** spinner + "Transcribiendo…".
- **ready:** transcript editable + dos CTAs ("Usar texto" / "Volver a grabar").
- **Error de permisos:** "Necesitamos acceso al micrófono" + link a configuración del navegador.
- **Error de cuota:** "Has usado los 120 min de este mes. Vuelve el 1 de junio" o "Hazte Pro".
- **Locked (free):** pantalla con paywall y demo de qué hace la función.

### Notas

- El audio NO se almacena. Solo se procesa para extraer el transcript y se descarta. Esta política tiene que ser explícita en la UI.
- En móvil web, fallback a `webkitSpeechRecognition` si está disponible (sin envío al backend).

---

## Endpoints de esta área

| Método | Endpoint              | Auth | Descripción                                   |
| ------ | --------------------- | ---- | --------------------------------------------- |
| POST   | `/api/voz/transcribe` | Sí   | Transcribir audio → texto (no almacena audio) |
| POST   | `/api/voz/usage`      | Sí   | Reportar segundos usados (cuota mensual)      |
