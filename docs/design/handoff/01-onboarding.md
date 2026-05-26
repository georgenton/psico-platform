# 01 · Onboarding

`Onboarding.html` — 4 pasos secuenciales + tour de la app. Móvil-first; web replica el flujo.

---

## Pantalla: Paso 0 · Bienvenida (intro de Marina)

**Ruta sugerida:** `/onboarding`

### Datos que muestra

- `marinaIntro.title`: string (requerido)
- `marinaIntro.subtitle`: string (requerido)
- `marinaIntro.body`: string (requerido) — bloque editorial
- `marinaIntro.signature`: string (requerido)
- `marinaIntro.avatarUrl`: string (opcional)

### Acciones del usuario

- **Empezar**: avanza a paso 1. Sin envío de datos.
- **Saltar onboarding**: marca usuario como `onboardingSkipped=true` y va a `/inicio`.

### Llamadas HTTP necesarias

- **Método:** GET — `/api/onboarding/intro` — Auth: Sí
  - **Response:** `{ title, subtitle, body, signature, avatarUrl }`
- **Método:** POST — `/api/onboarding/skip` — Auth: Sí
  - **Request:** `{}`
  - **Response:** `{ ok: true }`

### Estados de la pantalla

- **Loading:** skeleton de header + 3 líneas de prosa.
- **Error:** 500 → muestra contenido estático fallback.
- **Empty:** N/A.

---

## Pantalla: Paso 1 · Por qué viniste

**Ruta sugerida:** `/onboarding/1`

### Datos que muestra

- `step.title`: string ("¿Qué te trae aquí?")
- `step.helperText`: string
- `motivos[]`: array
  - `id`: string ("ansiedad" | "tristeza" | "relaciones" | "trabajo" | "explorar" | …)
  - `label`: string
  - `icon`: string (token)

### Acciones del usuario

- **Seleccionar motivo(s)**: multi-select. Envía al avanzar.
- **Siguiente**: POST con los motivos seleccionados.

### Llamadas HTTP necesarias

- **Método:** GET — `/api/onboarding/motivos` — Auth: Sí
  - **Response:** `{ motivos: [{ id, label, icon }] }`
- **Método:** POST — `/api/onboarding/step1` — Auth: Sí
  - **Request:** `{ motivosIds: string[] }`
  - **Response:** `{ ok: true, next: "step2" }`

### Estados de la pantalla

- **Loading:** placeholder de 8 chips en gris.
- **Error:** 500 → reintentar.
- **Empty:** N/A (catálogo de motivos es constante).

---

## Pantalla: Paso 2 · Cómo te sientes hoy

**Ruta sugerida:** `/onboarding/2`

### Datos que muestra

- `step.title`: string
- `moods[]`: array de moods (calma, foco, energía, reflexión, ansiedad, tristeza…)
  - `id`: string
  - `label`: string
  - `swatch`: string (hex o token)

### Acciones del usuario

- **Seleccionar mood**: single-select.
- **Siguiente**: POST.

### Llamadas HTTP necesarias

- **Método:** GET — `/api/onboarding/moods` — Auth: Sí
- **Método:** POST — `/api/onboarding/step2` — Auth: Sí
  - **Request:** `{ moodId: string }`
  - **Response:** `{ ok: true, next: "step3" }`

### Estados de la pantalla

- **Loading:** skeleton.
- **Error:** 500.
- **Empty:** N/A.

---

## Pantalla: Paso 3 · Tu nombre y voz

**Ruta sugerida:** `/onboarding/3`

### Datos que muestra

- `step.title`: string
- `voicePreviewUrl`: string (opcional) — sample audio de Marina

### Acciones del usuario

- **Input nombre**: text field. Validación: 2-40 chars, sin emoji.
- **Toggle voz**: opcional, escucha sample.
- **Siguiente**: POST con nombre + flag de voz preferida.

### Llamadas HTTP necesarias

- **Método:** POST — `/api/onboarding/step3` — Auth: Sí
  - **Request:** `{ firstName: string, voicePreference: "marina" | "tomas" | "none" }`
  - **Response:** `{ ok: true, next: "step4" }`

### Estados de la pantalla

- **Loading:** N/A (formulario local hasta submit).
- **Error:** validación inline (nombre muy corto, contiene emoji).
- **Empty:** N/A.

---

## Pantalla: Paso 4 · Tu primera recomendación

**Ruta sugerida:** `/onboarding/4`

### Datos que muestra

- `recommendation`: objeto (requerido)
  - `bookId`: string
  - `title`: string
  - `author`: string
  - `cover`: enum ("cool" | "warm" | "mixed")
  - `chapter1Preview`: string (1-2 párrafos)
  - `why`: string — explicación de por qué se recomienda
- `alternatives[]`: array (max 2) — otras opciones

### Acciones del usuario

- **Empezar a leer**: navega a `/lector/:bookId` y marca onboarding como completado.
- **Ver otras opciones**: cambia recommendation localmente.
- **Terminar**: marca onboarding completado, va a `/inicio`.

### Llamadas HTTP necesarias

- **Método:** GET — `/api/onboarding/recommendation` — Auth: Sí
  - **Response:** `{ recommendation, alternatives }` — calculado del paso 1+2
- **Método:** POST — `/api/onboarding/complete` — Auth: Sí
  - **Request:** `{ chosenBookId: string | null }`
  - **Response:** `{ ok: true, redirectTo: string }`

### Estados de la pantalla

- **Loading:** skeleton de la tarjeta del libro.
- **Error:** 500 → fallback a recomendación genérica del libro de Marina.
- **Empty:** N/A.

---

## Pantalla: Tour de la app (overlay después de paso 4)

**Ruta sugerida:** `/onboarding/tour` (overlay sobre `/inicio`)

### Datos que muestra

- `tourSteps[]`: array de tooltips secuenciales
  - `target`: string (CSS selector o nombre semántico: "diario", "biblioteca", "eco")
  - `title`: string
  - `body`: string
  - `order`: number

### Acciones del usuario

- **Siguiente / Anterior**: navega entre steps localmente.
- **Saltar tour**: marca `tourCompleted=true`.
- **Terminar**: idem.

### Llamadas HTTP necesarias

- **Método:** GET — `/api/onboarding/tour` — Auth: Sí
- **Método:** POST — `/api/onboarding/tour/complete` — Auth: Sí
  - **Request:** `{ stepsCompleted: number }`
  - **Response:** `{ ok: true }`

### Estados de la pantalla

- **Loading:** N/A (datos in-memory tras GET).
- **Error:** ignorable (tour es opcional).
- **Empty:** si tour ya completado, no se muestra.

---

## Endpoints de esta área

| Método | Endpoint                         | Auth | Descripción                     |
| ------ | -------------------------------- | ---- | ------------------------------- |
| GET    | `/api/onboarding/intro`          | Sí   | Intro de Marina                 |
| POST   | `/api/onboarding/skip`           | Sí   | Saltar onboarding completo      |
| GET    | `/api/onboarding/motivos`        | Sí   | Catálogo de motivos de consulta |
| POST   | `/api/onboarding/step1`          | Sí   | Guardar motivos seleccionados   |
| GET    | `/api/onboarding/moods`          | Sí   | Catálogo de moods               |
| POST   | `/api/onboarding/step2`          | Sí   | Guardar mood inicial            |
| POST   | `/api/onboarding/step3`          | Sí   | Guardar nombre + voz preferida  |
| GET    | `/api/onboarding/recommendation` | Sí   | Primera recomendación calculada |
| POST   | `/api/onboarding/complete`       | Sí   | Marcar onboarding completado    |
| GET    | `/api/onboarding/tour`           | Sí   | Pasos del tour de UI            |
| POST   | `/api/onboarding/tour/complete`  | Sí   | Marcar tour completado          |
