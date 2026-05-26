# 11 · Terapia

`Terapia.html` — vertical de psicoterapia con 18 sub-pantallas. **Pre-launch** según los gates definidos en Pulso (ver `pulso/HANDOFF.md`). En el dashboard del usuario, esta vertical está oculta hasta que el feature flag `terapia.enabled === true`.

**Boundary v1 sugerido (de la sesión de diseño):** 7 pantallas reales → Hub, Directorio, Perfil terapeuta, Reserva, Pre-sesión, Mis sesiones, Crisis. El resto (Sala de video propia, Matching asistido, Progreso longitudinal, B2B, Vista terapeuta) entra en backlog v2.

---

## Pantalla 1: Hub

**Ruta:** `/terapia`

### Datos

- `user.tier`: enum
- `hub.intro`: string — texto editorial de bienvenida
- `hub.activeTherapist`: objeto | null — si ya tiene terapeuta
- `hub.nextSession`: objeto | null — próxima sesión
- `hub.recentPrescriptions[]`: array (max 3) — "Lo que Marina sugirió"

### Acciones

- **Encontrar terapeuta**: navega a `/terapia/directorio`.
- **Ayúdame a elegir**: navega a `/terapia/match` (futuro).
- **Apoyo inmediato**: navega a `/terapia/crisis`.

### Endpoints

- GET `/api/terapia/hub` — Auth: Sí
- **Response:** `{ intro, activeTherapist, nextSession, recentPrescriptions }`

### Estados

- **Empty:** sin terapeuta — muestra solo intro + 2 CTAs (encontrar / matching).
- **Loading:** skeleton.
- **Error:** 500.

---

## Pantalla 2: Directorio

**Ruta:** `/terapia/directorio?motivo=&modalidad=&genero=&precio=&hora=`

### Datos

- `filters.available`: objeto — qué filtros existen y sus opciones
- `therapists[]`: array (paginado)
  - `id`, `name`, `initials`, `avatarUrl`, `licenseNumber`, `licenseVerified`: boolean
  - `title`, `bio` (corta), `specialties[]`, `modalities[]` ("individual" | "pareja" | "familia")
  - `languages[]`, `genderId`
  - `priceUsd`: number
  - `currency`: string
  - `avgRating`, `reviewsCount`
  - `nextSlotIso`: Date | null
  - `acceptsInsurance`: boolean
  - `coverToken`: enum
- `pagination`
- `recommendedForUser[]`: array — match score basado en motivos del onboarding

### Acciones

- **Filtrar / ordenar**: re-fetch con querystring.
- **Click terapeuta**: navega a `/terapia/terapeutas/:id`.
- **Guardar para después**: POST a favorites.

### Endpoints

- GET `/api/terapia/therapists` — Auth: Sí
- GET `/api/terapia/therapists/filters` — Auth: Sí
- POST `/api/terapia/therapists/:id/favorite` — Auth: Sí — toggle

### Estados

- **Empty:** filtros sin resultados → "No encontramos terapeutas con esos criterios."
- **Loading:** skeleton.

---

## Pantalla 3: Perfil terapeuta

**Ruta:** `/terapia/terapeutas/:id`

### Datos

- `therapist`: misma estructura que en directorio + campos extra:
  - `bioLong`: string (markdown)
  - `education[]`: `{ title, institution, year }`
  - `certifications[]`
  - `approach`: string — enfoque terapéutico
  - `firstSessionPolicy`: string
  - `cancellationPolicy`: string
  - `availability[]`: array — próximos 14 días con slots disponibles
  - `reviews[]`: array (paginado)
  - `videosPresentation`: string | null — URL de video de presentación
- `userHistory`: objeto | null — si ya tuvo sesión con este terapeuta

### Acciones

- **Reservar primera sesión**: navega a `/terapia/reservar/:id`.
- **Mensaje** (futuro): chat asíncrono pre-sesión.
- **Guardar**: toggle favorito.
- **Compartir**: link público al perfil.

### Endpoints

- GET `/api/terapia/therapists/:id` — Auth: Sí
- GET `/api/terapia/therapists/:id/reviews?page=` — Auth: Sí

### Estados

- **Loading:** skeleton.
- **Error:** 404 → "Terapeuta no disponible" + back.

---

## Pantalla 4: Reserva (3 pasos)

**Ruta:** `/terapia/reservar/:therapistId`

### Datos

- `therapist`: meta (nombre, precio, modalidades)
- `step`: 1 | 2 | 3
- `step1.modalities[]`: array
- `step1.firstReasonOptions[]`: array
- `step2.availableSlots[]`: array — slots de 14 días
  - `iso`: Date, `durationMin`: 50 | 30, `priceUsd`: number, `available`: boolean
- `step2.timezone`: string — del usuario
- `step3.paymentMethods[]`: array — métodos guardados del usuario
- `step3.priceBreakdown`: `{ session: number, taxes: number, total: number, currency }`

### Acciones (por paso)

- **Step 1**: seleccionar modalidad + razón principal → siguiente.
- **Step 2**: elegir slot → siguiente.
- **Step 3**: confirmar pago (Stripe Element o método guardado) → POST de reserva.
- **Volver atrás**: paso previo.

### Endpoints

- GET `/api/terapia/therapists/:id/availability?days=14` — Auth: Sí
- POST `/api/terapia/bookings` — Auth: Sí
  - **Request:** `{ therapistId, slotIso, modality, firstReasonId, paymentMethodId, durationMin }`
  - **Response:** `{ ok: true, booking: { id, status, joinUrl?: string }, receiptUrl }`

### Estados

- **Loading:** skeleton del paso actual.
- **Error en pago:** muestra error → permite retry sin perder selección.
- **Slot tomado entre pasos:** 409 → "Otra persona reservó ese horario. Elige otro."

---

## Pantalla 5: Pre-sesión

**Ruta:** `/terapia/sesiones/:id/preparar`

### Datos

- `session`:
  - `id`, `therapist`, `scheduledAt`, `durationMin`, `modality`, `joinUrl` (5 min antes)
- `prep`:
  - `intentionField`: string (cifrado E2E) — qué quieres tratar
  - `checkInMood`: enum | null
  - `journalShared`: array de entry IDs compartidas (re-encrypted ephemeral)
  - `tasksFromPrevious[]`: array — "lo que Marina te pidió la sesión pasada"

### Acciones

- **Escribir intención**: textarea cifrada → PATCH cada 10s.
- **Check-in mood**: tap mood.
- **Compartir entradas del diario**: modal con últimas 10 entradas + selector.
- **Cancelar / reagendar**: link a pantalla 15.

### Endpoints

- GET `/api/terapia/sessions/:id/prep` — Auth: Sí
- PATCH `/api/terapia/sessions/:id/prep` — Auth: Sí
  - **Request:** `{ intentionCiphertext?, intentionNonce?, checkInMood?, sharedEntryIds? }`

### Estados

- **Loading / Error / Empty:** estándar.

---

## Pantalla 6: Mis sesiones

**Ruta:** `/terapia/sesiones`

### Datos

- `upcoming[]`: array de sesiones futuras
- `past[]`: array (paginado) de pasadas con `status: "completed" | "no-show" | "cancelled" | "missed"` y `notes` (resumen del usuario, no del terapeuta)

### Acciones

- **Click próxima**: navega a pre-sesión.
- **Click pasada**: navega a post-sesión / detalle.
- **Reagendar / cancelar**: link.

### Endpoints

- GET `/api/terapia/sessions?status=upcoming|past` — Auth: Sí

---

## Pantalla 7: Post-sesión

**Ruta:** `/terapia/sesiones/:id/cerrar`

### Datos

- `session`: meta
- `tagsOptions[]`: tags de cómo te fue
- `previousPrescriptions[]`: lo que el terapeuta sugirió (libros, ejercicios, audios)

### Acciones

- **Rating + tags**: POST.
- **Nota libre** (cifrada): PATCH.
- **Reservar próxima**: shortcut a reserva con el mismo terapeuta.

### Endpoints

- POST `/api/terapia/sessions/:id/feedback` — Auth: Sí
  - **Request:** `{ rating: 1-5, tags: string[], noteCiphertext?, noteNonce? }`

---

## Pantalla 8: Sala de videollamada

**Ruta:** `/terapia/sesiones/:id/room`

**Decisión técnica recomendada:** integrar Daily.co o Whereby embebido, NO construir esto en casa. Ver `pulso/HANDOFF.md` (gates de Terapia).

### Datos

- `room.joinToken`: string — token Daily/Whereby (short-lived, 2h TTL)
- `room.config`: `{ audio, video, chat: false, screenshare: false, recording: false }`
- `session`: meta

### Acciones

- **Unirse**: inicializa SDK del proveedor.
- **Salir**: termina sesión local.
- **Reportar problema técnico**: POST.

### Endpoints

- POST `/api/terapia/sessions/:id/join` — Auth: Sí (solo en ventana de 5 min antes)
  - **Response:** `{ joinToken, expiresAt, roomUrl }`
- POST `/api/terapia/sessions/:id/technical-report` — Auth: Sí
  - **Request:** `{ issue: enum, description }`

---

## Pantalla 9: Onboarding terapéutico

**Ruta:** `/terapia/onboarding`

Flujo opcional de 4 pasos antes de reservar — **el boundary v1 sugiere fusionarlo dentro del paso 1 de Reserva**. Si se mantiene separado:

### Datos

- `steps[]`: array de pasos
- `userProfile`: borrador del intake

### Acciones

- **Llenar pasos**: PATCH parcial.
- **Saltar**: marca `terapiaOnboardingSkipped`.

### Endpoints

- GET `/api/terapia/intake` — Auth: Sí
- PATCH `/api/terapia/intake` — Auth: Sí
- POST `/api/terapia/intake/complete` — Auth: Sí

---

## Pantalla 10: Apoyo inmediato (crisis)

**Ruta:** `/terapia/crisis`

**No negociable para v1.** Es ético tenerlo.

### Datos

- `country`: detectado o seleccionado
- `lines[]`: array de líneas de crisis por país
  - `name`, `phone`, `whatsapp?`, `chatUrl?`, `availability`, `language[]`
- `safetyTipsShort[]`: tips inmediatos
- `nextSteps[]`: qué hacer en próximas 24h

### Acciones

- **Llamar línea**: tel: link.
- **Mensaje a WhatsApp**: whatsapp:// link.
- **Hablar con Eco** (modo crisis especial): navega a Eco con flag.
- **Reservar urgente** (si terapia activa): POST que abre slot urgente del terapeuta.

### Endpoints

- GET `/api/terapia/crisis?country=EC` — Auth: No (es público y crítico)
  - **Response:** `{ lines, safetyTipsShort, nextSteps }`
- POST `/api/terapia/crisis/log` — Auth: Sí (opcional, no bloquea ayuda)
  - **Request:** `{ trigger: enum, contactedLineId?: string }`
  - Audita uso para mejorar el flujo, **sin** contenido sensible.

---

## Pantalla 11: Matching asistido

**Ruta:** `/terapia/match`

**Backlog v2** según boundary sugerido.

### Datos

- `intake`: cuestionario corto (5-7 preguntas)
- `topMatches[]`: array (max 3) — terapeutas con score + razones

### Endpoints

- POST `/api/terapia/match` — Auth: Sí
  - **Request:** `{ answers: object }`
  - **Response:** `{ topMatches: [{ therapistId, matchScore, reasons[] }] }`

---

## Pantalla 12: Tu camino · progreso

**Ruta:** `/terapia/progreso`

**Backlog v2** — solo tiene sentido tras 3 meses de uso.

### Datos

- `sessions`: estadísticas longitudinales
- `moodTrend`: serie temporal
- `themes[]`: temas recurrentes según notas
- `prescriptionsCompletion`: %

### Endpoints

- GET `/api/terapia/progreso?period=` — Auth: Sí

---

## Pantalla 13: Notificaciones

**Ruta:** `/terapia/notificaciones` (o overlay desde topbar)

### Datos

- `notifications[]`: array (paginado)
  - `id`, `kind` (enum), `title`, `body`, `createdAt`, `readAt`, `actionUrl`

### Acciones

- **Marcar como leída**: PATCH.
- **Marcar todas**: POST.
- **Tap**: navega a `actionUrl`.

### Endpoints

- GET `/api/terapia/notifications?unread=true&limit=20` — Auth: Sí
- PATCH `/api/terapia/notifications/:id/read` — Auth: Sí
- POST `/api/terapia/notifications/read-all` — Auth: Sí

---

## Pantalla 14: Lo que Marina sugirió (recetas)

**Ruta:** `/terapia/recetas`

### Datos

- `prescriptions[]`: array
  - `id`, `prescribedBy` (therapist meta), `prescribedAt`, `kind` ("book" | "audio" | "exercise" | "carta"), `targetId`, `dosage` ("1 capítulo / día"), `note`, `dueBy`, `completedAt`

### Acciones

- **Click pieza**: navega al contenido.
- **Marcar como hecho**: PATCH.
- **Reagendar**: si se atrasó.

### Endpoints

- GET `/api/terapia/prescriptions` — Auth: Sí
- PATCH `/api/terapia/prescriptions/:id` — Auth: Sí — `{ completed: true }`

---

## Pantalla 15: Mover / cancelar sesión

**Ruta:** `/terapia/sesiones/:id/mover` o `/cancelar`

### Datos

- `session`: meta
- `policy`: política del terapeuta (ventana de cambio gratuito, fee de cancelación tardía)
- `availableSlots[]`: para reagendar

### Acciones

- **Reagendar**: PATCH con nuevo slot.
- **Cancelar**: POST con razón.

### Endpoints

- PATCH `/api/terapia/sessions/:id/reschedule` — Auth: Sí
- POST `/api/terapia/sessions/:id/cancel` — Auth: Sí
  - **Request:** `{ reason, refundRequested?: boolean }`

---

## Pantalla 16: Vista terapeuta (panel Marina)

**Ruta:** `/terapeuta` — dominio o subdominio separado

**Otro producto distinto.** Backlog v2. Tiene su propia auth (cuenta de terapeuta).

### Pantallas internas

- Hoy
- Pacientes
- Calendario
- Notas (cifradas, separadas del usuario)
- Intakes
- Cobros
- Cuenta

### Endpoints (placeholder)

- GET `/api/terapeuta/today` — Auth: Sí (rol therapist)
- GET `/api/terapeuta/patients` — Auth: Sí
- GET `/api/terapeuta/calendar` — Auth: Sí
- POST `/api/terapeuta/notes` — Auth: Sí
- … (spec completa en v2)

---

## Pantalla 17: B2B · Mi beneficio

**Ruta:** `/terapia/b2b`

**Backlog v2 según boundary** (no abrir B2B hasta tener 100 pagando $7).

### Datos

- `employer`: empresa que paga
- `entitlement`: `{ sessionsPerMonth, coveragePct, currentCycleUsed }`

---

## Pantalla 18: B2B · Dashboard empleador

**Ruta:** `/empleador`

**Backlog v2.** Vista para HR — uso agregado anonimizado.

---

## Endpoints de esta área (v1 boundary recomendado)

| Método | Endpoint                                   | Auth | Descripción                |
| ------ | ------------------------------------------ | ---- | -------------------------- |
| GET    | `/api/terapia/hub`                         | Sí   | Hub de Terapia             |
| GET    | `/api/terapia/therapists`                  | Sí   | Directorio con filtros     |
| GET    | `/api/terapia/therapists/filters`          | Sí   | Opciones de filtros        |
| GET    | `/api/terapia/therapists/:id`              | Sí   | Perfil terapeuta           |
| GET    | `/api/terapia/therapists/:id/reviews`      | Sí   | Reseñas                    |
| POST   | `/api/terapia/therapists/:id/favorite`     | Sí   | Toggle favorito            |
| GET    | `/api/terapia/therapists/:id/availability` | Sí   | Slots disponibles          |
| POST   | `/api/terapia/bookings`                    | Sí   | Reservar sesión            |
| GET    | `/api/terapia/sessions`                    | Sí   | Mis sesiones               |
| GET    | `/api/terapia/sessions/:id/prep`           | Sí   | Estado pre-sesión          |
| PATCH  | `/api/terapia/sessions/:id/prep`           | Sí   | Editar pre-sesión          |
| POST   | `/api/terapia/sessions/:id/join`           | Sí   | Token de videollamada      |
| POST   | `/api/terapia/sessions/:id/feedback`       | Sí   | Post-sesión                |
| PATCH  | `/api/terapia/sessions/:id/reschedule`     | Sí   | Reagendar                  |
| POST   | `/api/terapia/sessions/:id/cancel`         | Sí   | Cancelar                   |
| GET    | `/api/terapia/crisis`                      | No   | Líneas de crisis (público) |
| POST   | `/api/terapia/crisis/log`                  | Sí   | Auditoría sin contenido    |
| GET    | `/api/terapia/prescriptions`               | Sí   | Recetas activas            |
| PATCH  | `/api/terapia/prescriptions/:id`           | Sí   | Marcar como hecho          |
| GET    | `/api/terapia/notifications`               | Sí   | Notificaciones             |
| PATCH  | `/api/terapia/notifications/:id/read`      | Sí   | Marcar como leída          |
| POST   | `/api/terapia/notifications/read-all`      | Sí   | Marcar todas               |
| GET    | `/api/terapia/intake`                      | Sí   | Estado del intake          |
| PATCH  | `/api/terapia/intake`                      | Sí   | Editar intake              |
| POST   | `/api/terapia/intake/complete`             | Sí   | Completar intake           |

### Endpoints v2 (backlog)

- `POST /api/terapia/match` — Matching asistido
- `GET  /api/terapia/progreso` — Longitudinal
- `GET  /api/terapia/b2b/entitlement` — Beneficio empresa
- `/api/terapeuta/*` — vista terapeuta completa
- `/api/empleador/*` — vista HR
