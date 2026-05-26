# 02 · Inicio

`Inicio.html` — dashboard home del usuario. Web (sidebar + grid de cards) y móvil (stack vertical con tabbar). Una sola pantalla con varios estados.

---

## Pantalla: Inicio

**Ruta sugerida:** `/inicio`

### Datos que muestra

- `user`:
  - `firstName`: string (requerido)
  - `city`: string (opcional)
  - `tier`: enum ("free" | "pro")
  - `streakDays`: number — racha actual
  - `mood`: enum ("calma" | "foco" | "energia" | "reflexion" | …) — último mood
- `greeting`:
  - `text`: string (requerido) — saludo basado en hora y mood
  - `subtitle`: string (opcional)
- `continueBook`: objeto | null
  - `bookId`: string
  - `title`: string
  - `author`: string
  - `cover`: enum ("cool" | "warm" | "mixed")
  - `chapterN`: number — capítulo actual
  - `chapterTitle`: string
  - `progressPct`: number (0-100)
  - `lastReadAt`: Date
- `ecoMoment`: objeto | null
  - `prompt`: string (requerido) — pregunta del día
  - `lastActiveAt`: Date | null
  - `pendingMessages`: number — Eco notif badge
- `recos[]`: array (max 3) — recomendaciones del día
  - `id`: string
  - `kind`: enum ("book" | "audio" | "exercise" | "carta")
  - `title`: string
  - `byline`: string
  - `cover`: enum (cool/warm/mixed)
  - `reason`: string — por qué se recomienda
  - `lockedByTier`: boolean
- `stats`: objeto
  - `minutesThisWeek`: number
  - `entriesThisWeek`: number — entradas de diario
  - `streakDays`: number
  - `weeklyGoalPct`: number (0-100)
- `reflectionPrompt`:
  - `id`: string
  - `text`: string (requerido)
- `shortcuts[]`: array
  - `id`: enum ("diario" | "eco" | "biblioteca" | "terapia")
  - `label`: string
  - `badge`: number | null

### Acciones del usuario

- **Click "Continuar leyendo"**: navega a `/lector/:bookId?chapter=N`.
- **Click "Anota cómo te sientes"**: navega a `/diario/nueva`.
- **Click Eco prompt**: navega a `/eco?prompt=:id`.
- **Click reco**: navega según `kind` (book → `/libros/:id`, audio → `/lector/:id?mode=guia`, exercise → `/lector/:bookId?lesson=:id`).
- **Click shortcut**: navega a la sección.
- **Cambiar mood**: PATCH a `/api/user/mood` con nuevo mood.
- **Refresh**: pull-to-refresh en móvil → re-fetch `/api/home`.

### Llamadas HTTP necesarias

- **Método:** GET — `/api/home` — Auth: Sí
  - **Response:** `{ user, greeting, continueBook, ecoMoment, recos, stats, reflectionPrompt, shortcuts }`
  - Materializa varias fuentes en una sola response para minimizar requests al abrir la app.
- **Método:** PATCH — `/api/user/mood` — Auth: Sí
  - **Request:** `{ moodId: string }`
  - **Response:** `{ ok: true, mood: string, swatch: string }`
- **Método:** POST — `/api/reflection-prompts/:id/dismiss` — Auth: Sí
  - **Response:** `{ ok: true }`

### Estados de la pantalla

- **Loading:** skeleton de greeting + continue card en gris + 3 reco placeholders. Mantén la shell (sidebar/tabbar) renderizada para evitar layout shift.
- **Error:** 500 → toast "No pudimos cargar tu inicio" + botón retry. La shell sigue navegable.
- **Empty (usuario nuevo sin actividad):**
  - `continueBook` null → tarjeta sugerida del libro asignado en onboarding.
  - `stats.minutesThisWeek === 0` → texto suave "Tu primera semana empieza ahora."
  - `ecoMoment` null → solo prompt genérico de Eco.

### Notas

- Greeting y prompt cambian por hora del día y mood. La selección la hace el backend.
- `recos[]` no se cachea agresivamente — se calcula on-the-fly con la última actividad del usuario.
- En móvil, `shortcuts` se renderiza como tabbar inferior; en web, como cards en la grilla.

---

## Endpoints de esta área

| Método | Endpoint                              | Auth | Descripción                 |
| ------ | ------------------------------------- | ---- | --------------------------- |
| GET    | `/api/home`                           | Sí   | Bundle del dashboard        |
| PATCH  | `/api/user/mood`                      | Sí   | Actualizar mood del usuario |
| POST   | `/api/reflection-prompts/:id/dismiss` | Sí   | Descartar prompt del día    |
