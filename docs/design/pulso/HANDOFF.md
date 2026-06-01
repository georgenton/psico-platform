# Pulso · Handoff técnico

Reporte estructurado para implementar las pantallas de **Pulso** (dashboard de actividad).
Audiencia: Tú + 1–2 personas del equipo. Stack actual del repo: Next.js 14 (App Router) + NestJS + Prisma + Postgres + Redis + Posthog. Endpoints sugeridos viven en `apps/api/src/pulso/*` y exponen `/api/pulso/*` (todos detrás de un middleware `requireRole('admin')`).

Todas las pantallas comparten un `?period=` querystring que controla la ventana de tiempo (`7d` / `30d` / `90d` / `ytd`). Default: `30d`. Las pantallas leen `period` desde la URL para que sea linkable.

---

## Pantalla: Pulso · Overview

**Ruta sugerida:** `/pulso?period=30d`

### Datos que muestra

- `period.label`: string (requerido) — ej. "30 días · 21 abr → 20 may 2026"
- `period.from`: Date (requerido)
- `period.to`: Date (requerido)
- `generatedAt`: Date (requerido) — hora de la última agregación
- `kpis[]`: array de 4 KPIs (requerido)
  - `id`: string ("wau" | "signups" | "conv" | "lectura")
  - `label`: string
  - `value`: number
  - `unit`: string ("personas" | "registros" | "%" | "min")
  - `deltaPct`: number | null
  - `deltaLabel`: string
  - `deltaDir`: enum ("up-good" | "down-good" | "down-bad" | "up-bad" | "new" | "flat")
  - `spark`: number[] (requerido) — últimos 14 puntos
  - `sub`: string
  - `note`: string (opcional) — interpretación humana
- `highlights[]`: array (requerido) — observaciones narrativas
  - `kind`: enum ("good" | "bad" | "watch" | "ok")
  - `headline`: string
  - `body`: string
  - `link.label`: string
  - `link.view`: string (id de vista interna)
- `growth.series[]`: array de 30 días
  - `d`: string ("21 abr")
  - `su`: number (signups)
  - `act`: number (activations)
  - `ev`: string | null (evento anotado, ej. "Post Instagram")
- `growth.cohorts[]`: array por semana de registro
  - `cohort`: string ("Sem 4 mar")
  - `size`: number
  - `w1`, `w2`, `w3`, `w4`: number | null (activos en esa semana)
- `channels[]`: array (requerido) — 5 canales
  - `id`: string ("organic" | "instagram" | "referral" | "podcast" | "direct")
  - `label`: string
  - `signups`: number
  - `pct`: number (mix del total)
  - `conv`: number (% conv Pro)
  - `cacUsd`: number
  - `note`: string
- `funnel[]`: array de 8 pasos (requerido)
  - `step`: string
  - `count`: number
  - `pct`: number (vs visita)
  - `passPct`: number (vs paso anterior)
  - `delta`: number (vs período anterior)
  - `alert`: enum ("break" | null)
  - `break`: string | null (texto explicativo si alert)
- `features[]`: array (requerido) — 7 funcionalidades
  - `id`, `label`, `icon` (string emoji o token), `users`, `minutes`, `sessionsAvg`, `retentionD7`, `trend`, `trendPct`
- `deviceSplit[]`: array (requerido) — 8 eventos clave
  - `event`: string ("Registro", "Lectura · libro", "Diario", etc.)
  - `mobile`: number (%)
  - `web`: number (%)
  - `note`: string
- `terapia.summary`: subset de los gates de Terapia para mostrar en overview (ver pantalla Terapia para detalle)
  - `status`: enum ("off" | "piloto" | "live")
  - `gates`: solo los primeros 3 con `{ id, label, current, target, unit, status, note }`
  - `greens`, `yellows`, `reds`: number
- `revenue.series[]`: 6 meses
  - `m`: string, `mrr`: number, `paying`: number, `churn`: number, `current`: boolean
- `revenue.runwayMonths`: number
- `revenue.note`: string
- `risk.flagged`, `risk.resolved`, `risk.pending`: number
- `risk.note`: string

### Acciones del usuario

- **Cambiar período**: dropdown → re-fetch con nuevo `period`. Envía `period`: string.
- **Click en highlight link**: navega a `/pulso/${link.view}`. No envía datos.
- **Click "Ver detalle →" en funnel / terapia**: navega a la pantalla correspondiente.
- **Toggle granularidad de growth chart**: DIARIO ↔ SEMANAL. Envía `granularity`: string.

### Llamadas HTTP necesarias

- **Método:** GET
  - **Endpoint:** `/api/pulso/overview?period=30d`
  - **Request:** querystring `period` (enum: `7d|30d|90d|ytd`), opcional `granularity=daily|weekly`
  - **Response:** todos los datos listados arriba (un solo payload, ~12kB)
  - **Auth:** Sí

### Estados de la pantalla

- **Loading:** skeleton de 4 KPI cards + placeholder de growth chart + skeleton de tabla. Mantén la sidebar visible para que no sienta "flash".
- **Error:**
  - 403 → "No tienes permisos para ver Pulso"
  - 500 / network → "No pudimos cargar los datos. Reintentar en 10s." con botón de retry manual
  - Período sin datos → muestra los KPIs en `—` con nota "No hay datos para este período"
- **Empty:** período muy temprano (sin actividad). Muestra mensaje suave y deshabilita gráficos: "Aún no hay actividad este período."

---

## Pantalla: Pulso · Contenido (Libros)

**Ruta sugerida:** `/pulso/libros?id=emociones&period=30d`

### Datos que muestra

- `books[]`: lista de todos los libros disponibles para selector
  - `id`: string
  - `title`: string
  - `author`: string
  - `cover`: enum ("cool" | "warm" | "mixed")
  - `chapters`: number
  - `startedBy`: number
- `book`: objeto del libro seleccionado (requerido)
  - `id`, `title`, `author`, `cover`, `chapters`, `pages`: number, `publishedOn`: Date
  - `startedBy`, `completedBy`, `completionPct`: number
  - `avgMinPerChapter`: number, `totalMinutes`: number
  - `favorites`: number, `nps`: number (0–10)
  - `sharedToTx`: number (compartidos con terapeuta — 0 si Terapia off)
  - `pickup7d`: number (cuánta gente lo empezó los últimos 7 d)
  - `chap[]`: array de capítulos
    - `n`: number
    - `title`: string
    - `startedBy`: number
    - `completedBy`: number
    - `avgMin`: number
    - `drop`: number (% drop-off vs capítulo anterior)
    - `favPct`: number (% favoritos sobre completados)
    - `star`: boolean (campeón)

### Acciones del usuario

- **Cambiar libro**: selector horizontal → cambia `id` en URL y re-fetch.
- **Click "← Overview"**: navega a overview.
- **Click fila de capítulo (futuro)**: navega a `/pulso/libros/:id/cap/:n` con drill-down. _No implementado v1._

### Llamadas HTTP necesarias

- **Método:** GET
  - **Endpoint:** `/api/pulso/books?period=30d`
  - **Response:** `{ books: [{ id, title, author, cover, chapters, startedBy }] }`
  - **Auth:** Sí
- **Método:** GET
  - **Endpoint:** `/api/pulso/books/:id?period=30d`
  - **Response:** payload completo del libro listado arriba
  - **Auth:** Sí

### Estados de la pantalla

- **Loading:** skeleton del row de KPIs + barras del drop-off chart en gris.
- **Error:** libro no encontrado (404) → mostrar selector con mensaje "Libro no existe o no tienes acceso".
- **Empty:** libro sin lectores aún (`startedBy === 0`) → KPIs en `0` con nota: "Aún nadie ha abierto este libro."

---

## Pantalla: Pulso · Funnel

**Ruta sugerida:** `/pulso/funnel?period=30d`

### Datos que muestra

- `funnel[]`: 8 pasos (mismo schema que overview)
- `breakpoint.detail`: subset del paso con `alert === "break"` (cap. 1 → cap. 2 en el mock)
  - `terminanCap1`: number (de "Termina cap. 1")
  - `pasanCap2`: number (de "Empieza cap. 2")
  - `medianaWaitDays`: number — días entre cap. 1 cierra y cap. 2 empieza
  - `hipotesis[]`: string[] (lista de hipótesis a probar)
- `channels[]`: mismo schema que overview
- `cohorts[]`: mismo schema que overview
- `period`: object (label, from, to)

### Acciones del usuario

- **Cambiar período**: dropdown → re-fetch
- **Click "← Overview"**: navega a overview
- **(Futuro) Click paso del funnel**: abrir drill-down con lista de usuarios que cayeron ahí. _No implementado v1._

### Llamadas HTTP necesarias

- **Método:** GET
  - **Endpoint:** `/api/pulso/funnel?period=30d`
  - **Response:** `{ funnel, breakpoint, channels, cohorts, period }`
  - **Auth:** Sí

### Estados de la pantalla

- **Loading:** skeleton de filas del funnel.
- **Error:** standard 500 con retry.
- **Empty:** sin actividad → muestra funnel con `count: 0` en todos los pasos y nota arriba.

---

## Pantalla: Pulso · Terapia · Pre-launch

**Ruta sugerida:** `/pulso/terapia`

### Datos que muestra

- `status`: enum ("off" | "piloto" | "live") (requerido)
- `decidedAt`: Date (requerido) — cuándo se tomó la decisión actual
- `hypothesis`: string (requerido) — texto del rationale
- `pilotPlan`:
  - `therapists`: number
  - `users`: number
  - `durationDays`: number
  - `country`: string
- `gates[]`: array de 6 gates (requerido)
  - `id`: string ("users" | "retention" | "pro" | "nps" | "mrr" | "ops")
  - `label`: string
  - `target`: number
  - `current`: number
  - `unit`: enum ("personas" | "%" | "USD" | "/10" | "list")
  - `status`: enum ("green" | "yellow" | "red")
  - `note`: string
- `ifLaunched`:
  - `expectedFirstMonth`: number
  - `expectedRebook`: number (%)
  - `expectedAddCogs`: number (USD/mes)
  - `note`: string
- `willTrack[]`: string[] — métricas que el dashboard medirá cuando se encienda

### Acciones del usuario

- **Click "← Overview"**: navega a overview.
- **Solicitar override** (botón rojo): abre modal de confirmación con campo `reason: string` requerido. Cuando se confirma, POST al endpoint de override.
- **(Cuando status === "live")** Re-utiliza la vista de Terapeutas anterior (no incluida en v1).

### Llamadas HTTP necesarias

- **Método:** GET
  - **Endpoint:** `/api/pulso/terapia/gates`
  - **Response:** payload completo arriba
  - **Auth:** Sí
- **Método:** POST
  - **Endpoint:** `/api/pulso/terapia/override`
  - **Request body:** `{ reason: string, requestedBy: string }`
  - **Response:** `{ ok: true, ticketId: string }` — crea un registro auditable
  - **Auth:** Sí (admin)
- **Método:** PATCH (futuro — para encender Terapia cuando los gates cierren)
  - **Endpoint:** `/api/pulso/terapia/status`
  - **Request body:** `{ status: "piloto" | "live" }`
  - **Response:** `{ ok: true, status, activatedAt }`
  - **Auth:** Sí (admin)

### Estados de la pantalla

- **Loading:** skeleton de 4 KPIs + 6 filas de gates en gris.
- **Error:** standard 500.
- **Empty:** N/A — siempre hay gates (constante de configuración).
- **Status === "piloto" o "live":** la pantalla cambia de tono: oculta gates, muestra métricas en vivo (sesiones, rebook). _Diseño futuro._

---

## Pantalla: Pulso · Podcast · Pre-publicación

**Ruta sugerida:** `/pulso/podcast`

### Datos que muestra

- `status`: enum ("planned" | "live") (requerido)
- `plannedLaunch`: string ("Jul 2026")
- `hostingCost`: number (USD/mes)
- `cadenceTarget`: string
- `rationale`: string — hipótesis editorial
- `episodes[]`: array
  - `n`: number
  - `title`: string
  - `author`: string
  - `bookLink`: string (id del libro relacionado) — opcional
  - `durationMin`: number
  - `plannedReleaseAt`: string ("1 jul") o Date
  - `status`: enum ("idea" | "outline" | "draft" | "ready" | "published")
  - `sub`: string (descripción)
  - `mock` o `metrics`: { listens, completionPct, signups, proConvPct } — 0s mientras `status === "planned"`
- `willTrack[]`: string[]

### Acciones del usuario

- **Click "← Overview"**: navega a overview.
- **Click fila de episodio (futuro)**: editar borrador → `/pulso/podcast/:n`. _No implementado v1._
- **(Futuro) Crear episodio**: botón "Nuevo episodio" → modal con form.
- **(Futuro) Marcar como publicado**: cambia status y dispara captura de métricas reales desde Spotify/Apple.

### Llamadas HTTP necesarias

- **Método:** GET
  - **Endpoint:** `/api/pulso/podcast`
  - **Response:** payload completo
  - **Auth:** Sí
- **Método:** POST (futuro)
  - **Endpoint:** `/api/pulso/podcast/episodes`
  - **Request body:** `{ title, author, bookLink, durationMin, plannedReleaseAt, sub }`
  - **Response:** `{ ok: true, n: number }`
  - **Auth:** Sí
- **Método:** PATCH (futuro)
  - **Endpoint:** `/api/pulso/podcast/episodes/:n`
  - **Request body:** parcial de los campos editables
  - **Response:** `{ ok: true }`
  - **Auth:** Sí
- **Método:** GET (cuando esté live)
  - **Endpoint:** `/api/pulso/podcast/episodes/:n/metrics?period=30d`
  - **Response:** `{ listens, completionPct, dropOffCurve: number[], signups, proConvPct }`
  - **Auth:** Sí

### Estados de la pantalla

- **Loading:** skeleton de 4 KPIs + tabla con 4 filas en gris.
- **Error:** standard.
- **Empty:** sin episodios planificados → mostrar empty state con CTA "Crea tu primer episodio".

---

## Pantalla: Pulso · Recursos · Pre-publicación

**Ruta sugerida:** `/pulso/recursos`

### Datos que muestra

- `status`: enum ("planned" | "live") (requerido)
- `plannedLaunch`: string
- `rationale`: string
- `formats[]`: array (4 formatos)
  - `id`: string ("carta" | "audio" | "practica" | "pregunta")
  - `label`: string
  - `desc`: string
  - `targetPerMonth`: number
- `pieces[]`: array de piezas
  - `id`: string
  - `format`: string (referencia a `formats[].id`)
  - `title`: string
  - `author`: string
  - `status`: enum ("idea" | "outline" | "draft" | "ready" | "published")
  - `mins`: number (duración estimada de lectura/audio)
  - `plannedAt`: string ("5 jun") o Date
- `willTrack[]`: string[]

### Acciones del usuario

- **Click "← Overview"**: navega a overview.
- **(Futuro) Crear pieza**: botón "Nueva pieza" → modal con form que incluye `format` selector.
- **(Futuro) Click fila**: editar pieza.

### Llamadas HTTP necesarias

- **Método:** GET
  - **Endpoint:** `/api/pulso/resources`
  - **Response:** payload completo
  - **Auth:** Sí
- **Método:** POST (futuro)
  - **Endpoint:** `/api/pulso/resources/pieces`
  - **Request body:** `{ format, title, author, mins, plannedAt }`
  - **Response:** `{ ok: true, id: string }`
  - **Auth:** Sí
- **Método:** PATCH (futuro)
  - **Endpoint:** `/api/pulso/resources/pieces/:id`
  - **Request body:** parcial
  - **Response:** `{ ok: true }`
  - **Auth:** Sí
- **Método:** GET (cuando esté live)
  - **Endpoint:** `/api/pulso/resources/pieces/:id/metrics?period=30d`
  - **Response:** `{ opens, completionPct, returns, leadToBookOpen, leadToTxBooking, favorites, shares }`
  - **Auth:** Sí

### Estados de la pantalla

- **Loading:** skeleton.
- **Error:** standard.
- **Empty:** sin piezas → CTA "Crea tu primera pieza".

---

## Pantalla: Pulso · Móvil (companion)

**Ruta sugerida:** misma `/pulso?period=30d` con detección de viewport (móvil < 768px)

### Datos que muestra

Subset del overview, mismas estructuras. Cuatro tabs:

- **Overview**: KPIs (4 en grid 2×2), highlights, mini funnel, mini canales, mini device split, MRR mini, risk note.
- **Libro**: header del libro principal + drop-off por capítulo en barras compactas.
- **Funnel**: caja crítica (cap. 1 → cap. 2) + funnel completo en versión mini.
- **Pre-launch**: stack vertical de tres bloques (Terapia gates + Podcast episodios + Recursos formatos).

### Acciones del usuario

- **Cambiar tab**: estado local (no URL). Tab "Pre-launch" mapea internamente a `view: "terapia"` para mantener consistencia con desktop.
- **Pull to refresh**: re-fetch del payload de overview.

### Llamadas HTTP necesarias

Mismas que las vistas de desktop — la móvil consume los mismos endpoints pero renderiza menos. No hay endpoints específicos de móvil.

Optimización sugerida: `GET /api/pulso/overview?compact=true` que omita series largas (cohorts, growth) y devuelva ~3kB en lugar de ~12kB.

### Estados de la pantalla

- **Loading:** skeleton de tabs + 2 KPI cards en gris.
- **Error:** standard.
- **Offline:** mostrar cache local con badge "datos del MM/DD HH:MM".

---

## Resumen de endpoints únicos necesarios

| Método | Endpoint                                  | Auth | Descripción                                                                                                                           |
| ------ | ----------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/pulso/overview`                     | Sí   | Payload completo del overview (KPIs, highlights, growth, channels, funnel, features, device, terapia summary, revenue, cohorts, risk) |
| GET    | `/api/pulso/books`                        | Sí   | Lista de libros disponibles (id, título, autor, cover, chapters, startedBy)                                                           |
| GET    | `/api/pulso/books/:id`                    | Sí   | Detalle de un libro con stats por capítulo                                                                                            |
| GET    | `/api/pulso/funnel`                       | Sí   | Funnel completo + breakpoint detail + cohortes                                                                                        |
| GET    | `/api/pulso/terapia/gates`                | Sí   | Estado de Terapia + gates + plan piloto + willTrack                                                                                   |
| POST   | `/api/pulso/terapia/override`             | Sí   | Solicitar override de los gates (auditable)                                                                                           |
| PATCH  | `/api/pulso/terapia/status`               | Sí   | Encender Terapia (piloto / live) cuando los gates cierren                                                                             |
| GET    | `/api/pulso/podcast`                      | Sí   | Estado del podcast + episodios planificados + willTrack                                                                               |
| POST   | `/api/pulso/podcast/episodes`             | Sí   | Crear episodio (borrador)                                                                                                             |
| PATCH  | `/api/pulso/podcast/episodes/:n`          | Sí   | Editar episodio                                                                                                                       |
| GET    | `/api/pulso/podcast/episodes/:n/metrics`  | Sí   | Métricas de un episodio publicado                                                                                                     |
| GET    | `/api/pulso/resources`                    | Sí   | Estado de recursos + piezas + formatos + willTrack                                                                                    |
| POST   | `/api/pulso/resources/pieces`             | Sí   | Crear pieza (borrador)                                                                                                                |
| PATCH  | `/api/pulso/resources/pieces/:id`         | Sí   | Editar pieza                                                                                                                          |
| GET    | `/api/pulso/resources/pieces/:id/metrics` | Sí   | Métricas de una pieza publicada                                                                                                       |

---

## Notas para implementación

1. **Agregación nocturna.** Todo el payload de `/api/pulso/overview` se materializa en una tabla `pulso_snapshots` (un row por día y por período). El endpoint sirve desde ahí — no recalcules en cada request. Posthog es la fuente de eventos; Postgres es la fuente de verdad de usuarios y pagos.

2. **Cache HTTP.** `Cache-Control: private, max-age=300` (5 min) en GETs. El dashboard no necesita ser real-time.

3. **Permisos.** Todas las rutas detrás de `requireRole('admin')`. Si en el futuro hay roles "marketing", "contenido", "operativa" — segmenta endpoints o agrega un `?scope=` que filtre campos.

4. **Decisiones que disparan write endpoints** (POST/PATCH) son raras pero importantes — siempre guarda quién las hizo en una tabla `pulso_audit_log` con `actor`, `action`, `payload`, `timestamp`.

5. **Mock → real.** Los campos marcados como `mock` en `episodes[]` y `pieces[]` se convierten en `metrics` cuando `status === "published"`. El frontend ya tolera ambos shapes — si `status !== "published"`, muestra `0`.

6. **Datos sintéticos.** `pulso/data.js` en este repo es el contrato exacto de los responses esperados — úsalo como fixture en tests de integración.
