# 99 · Endpoints consolidados

Tabla única de todos los endpoints del producto, sin repetir. Útil para definir las rutas de Nest, generar el cliente HTTP, y dimensionar el trabajo de backend.

## Convenciones

- Todos los endpoints viven bajo `/api/*` y siguen REST estándar.
- Auth: JWT en header `Authorization: Bearer <token>` o cookie httpOnly.
- Roles: `user` (default), `author` (rol elevado B2B), `therapist` (vista terapeuta), `admin` (Pulso).
- Errores estándar: 401, 403, 404, 409 (conflicto), 422 (validación), 429 (rate-limit), 500.
- Responses son JSON salvo donde se indique (SSE para streaming, signed URL para descargas).

---

## Auth & cuenta

| Método | Endpoint                    | Auth         | Descripción                                         |
| ------ | --------------------------- | ------------ | --------------------------------------------------- |
| POST   | `/api/auth/register`        | No           | Crear cuenta (email + password)                     |
| POST   | `/api/auth/login`           | No           | Login con email + password                          |
| POST   | `/api/auth/logout`          | Sí           | Logout (revoca refresh token)                       |
| POST   | `/api/auth/refresh`         | Sí (refresh) | Refrescar access token                              |
| POST   | `/api/auth/forgot-password` | No           | Solicitar email de recuperación                     |
| POST   | `/api/auth/reset-password`  | No           | Reset con token de email                            |
| POST   | `/api/auth/verify-email`    | No           | Verificación por link                               |
| POST   | `/api/auth/oauth/:provider` | No           | OAuth (Google/Apple) — `provider`: `google`/`apple` |

## Usuario

| Método | Endpoint                         | Auth | Descripción                                             |
| ------ | -------------------------------- | ---- | ------------------------------------------------------- |
| GET    | `/api/user/me`                   | Sí   | Perfil completo (perfil, stats, prefs, notifs, privacy) |
| PATCH  | `/api/user/profile`              | Sí   | Nombre, ciudad, avatar                                  |
| POST   | `/api/user/avatar`               | Sí   | Upload avatar (multipart)                               |
| PATCH  | `/api/user/preferences`          | Sí   | Voz, tema, fuente, idioma, horario                      |
| PATCH  | `/api/user/notifications`        | Sí   | Toggles de notificación                                 |
| PATCH  | `/api/user/privacy`              | Sí   | Toggles de privacidad                                   |
| PATCH  | `/api/user/mood`                 | Sí   | Mood actual                                             |
| PATCH  | `/api/user/reader-preferences`   | Sí   | Tema/fuente/tamaño del lector                           |
| POST   | `/api/user/email-change-request` | Sí   | Cambio de email (con verificación)                      |
| POST   | `/api/user/password-change`      | Sí   | Cambio de password                                      |
| POST   | `/api/user/data-export`          | Sí   | Pedir export de datos (rate-limit 1/mes)                |
| POST   | `/api/user/delete-request`       | Sí   | Eliminar cuenta (cooldown 30d)                          |

## Onboarding

| Método | Endpoint                         | Auth | Descripción            |
| ------ | -------------------------------- | ---- | ---------------------- |
| GET    | `/api/onboarding/intro`          | Sí   | Intro de Marina        |
| POST   | `/api/onboarding/skip`           | Sí   | Saltar onboarding      |
| GET    | `/api/onboarding/motivos`        | Sí   | Catálogo de motivos    |
| POST   | `/api/onboarding/step1`          | Sí   | Guardar motivos        |
| GET    | `/api/onboarding/moods`          | Sí   | Catálogo de moods      |
| POST   | `/api/onboarding/step2`          | Sí   | Guardar mood inicial   |
| POST   | `/api/onboarding/step3`          | Sí   | Nombre + voz preferida |
| GET    | `/api/onboarding/recommendation` | Sí   | Primera recomendación  |
| POST   | `/api/onboarding/complete`       | Sí   | Completar onboarding   |
| GET    | `/api/onboarding/tour`           | Sí   | Pasos del tour de UI   |
| POST   | `/api/onboarding/tour/complete`  | Sí   | Tour completado        |

## Home

| Método | Endpoint                              | Auth | Descripción          |
| ------ | ------------------------------------- | ---- | -------------------- |
| GET    | `/api/home`                           | Sí   | Bundle del dashboard |
| POST   | `/api/reflection-prompts/:id/dismiss` | Sí   | Descartar prompt     |

## Libros / Biblioteca / Lector

| Método | Endpoint                                 | Auth | Descripción                     |
| ------ | ---------------------------------------- | ---- | ------------------------------- |
| GET    | `/api/books`                             | Sí   | Listado paginado                |
| GET    | `/api/books/recos`                       | Sí   | Recos personalizadas            |
| GET    | `/api/books/categories`                  | No   | Catálogo de categorías          |
| GET    | `/api/books/authors`                     | No   | Catálogo de autores             |
| GET    | `/api/books/:id`                         | Sí   | Detalle de libro                |
| POST   | `/api/books/:id/start`                   | Sí   | Marcar como empezado            |
| POST   | `/api/books/:id/favorite`                | Sí   | Toggle favorito                 |
| POST   | `/api/books/:id/bookmark`                | Sí   | Toggle bookmark                 |
| GET    | `/api/books/:id/reviews`                 | Sí   | Reseñas paginadas               |
| POST   | `/api/books/:id/reviews`                 | Sí   | Crear reseña (solo completados) |
| GET    | `/api/lector/:bookId/:chapterN`          | Sí   | Capítulo                        |
| GET    | `/api/lector/:bookId/:chapterN/audio`    | Sí   | Audio + transcripción           |
| PATCH  | `/api/lector/session`                    | Sí   | Heartbeat de progreso           |
| POST   | `/api/lector/:bookId/:chapterN/complete` | Sí   | Marcar capítulo completo        |
| POST   | `/api/highlights`                        | Sí   | Crear subrayado                 |
| DELETE | `/api/highlights/:id`                    | Sí   | Eliminar subrayado              |
| POST   | `/api/annotations`                       | Sí   | Crear nota                      |
| PATCH  | `/api/annotations/:id`                   | Sí   | Editar nota                     |
| DELETE | `/api/annotations/:id`                   | Sí   | Eliminar nota                   |

## Diario

| Método | Endpoint                        | Auth | Descripción                          |
| ------ | ------------------------------- | ---- | ------------------------------------ |
| GET    | `/api/diario/entries`           | Sí   | Listado paginado                     |
| GET    | `/api/diario/entries/:id`       | Sí   | Detalle (cifrado)                    |
| POST   | `/api/diario/entries`           | Sí   | Crear (cifrado)                      |
| PATCH  | `/api/diario/entries/:id`       | Sí   | Editar                               |
| DELETE | `/api/diario/entries/:id`       | Sí   | Eliminar                             |
| GET    | `/api/diario/prompt-of-the-day` | Sí   | Prompt sugerido                      |
| POST   | `/api/diario/entries/:id/share` | Sí   | Compartir con terapeuta (re-encrypt) |

## Voz

| Método | Endpoint              | Auth     | Descripción                       |
| ------ | --------------------- | -------- | --------------------------------- |
| POST   | `/api/voz/transcribe` | Sí (Pro) | Audio → texto (no almacena audio) |
| POST   | `/api/voz/usage`      | Sí (Pro) | Reportar segundos usados          |

## Eco

| Método | Endpoint                       | Auth | Descripción                   |
| ------ | ------------------------------ | ---- | ----------------------------- |
| GET    | `/api/eco/threads`             | Sí   | Rail de hilos                 |
| POST   | `/api/eco/threads`             | Sí   | Crear hilo                    |
| GET    | `/api/eco/threads/:id`         | Sí   | Mensajes de hilo              |
| DELETE | `/api/eco/threads/:id`         | Sí   | Eliminar hilo                 |
| POST   | `/api/eco/messages`            | Sí   | Enviar mensaje (SSE response) |
| POST   | `/api/eco/messages/:id/report` | Sí   | Reportar respuesta            |
| GET    | `/api/eco/caps`                | Sí   | Persona configurada           |

## Plan & Billing

| Método | Endpoint                        | Auth | Descripción                          |
| ------ | ------------------------------- | ---- | ------------------------------------ |
| GET    | `/api/plan`                     | Sí   | Estado del plan + planes disponibles |
| POST   | `/api/billing/checkout-session` | Sí   | Iniciar checkout (Stripe)            |
| GET    | `/api/billing/return`           | Sí   | Callback post-checkout               |
| PATCH  | `/api/billing/subscription`     | Sí   | Cambiar plan / cancelar / reactivar  |
| POST   | `/api/billing/customer-portal`  | Sí   | Redirigir a portal Stripe            |
| GET    | `/api/billing/invoices`         | Sí   | Historial de facturas                |
| GET    | `/api/billing/usage`            | Sí   | Uso mensual                          |
| POST   | `/api/billing/webhook`          | No   | Webhook Stripe (verificar firma)     |

## Terapia (v1 boundary)

| Método | Endpoint                                   | Auth | Descripción                |
| ------ | ------------------------------------------ | ---- | -------------------------- |
| GET    | `/api/terapia/hub`                         | Sí   | Hub                        |
| GET    | `/api/terapia/therapists`                  | Sí   | Directorio                 |
| GET    | `/api/terapia/therapists/filters`          | Sí   | Filtros disponibles        |
| GET    | `/api/terapia/therapists/:id`              | Sí   | Perfil terapeuta           |
| GET    | `/api/terapia/therapists/:id/reviews`      | Sí   | Reseñas                    |
| POST   | `/api/terapia/therapists/:id/favorite`     | Sí   | Toggle favorito            |
| GET    | `/api/terapia/therapists/:id/availability` | Sí   | Slots disponibles          |
| POST   | `/api/terapia/bookings`                    | Sí   | Reservar                   |
| GET    | `/api/terapia/sessions`                    | Sí   | Mis sesiones               |
| GET    | `/api/terapia/sessions/:id/prep`           | Sí   | Pre-sesión                 |
| PATCH  | `/api/terapia/sessions/:id/prep`           | Sí   | Editar pre-sesión          |
| POST   | `/api/terapia/sessions/:id/join`           | Sí   | Token de videollamada      |
| POST   | `/api/terapia/sessions/:id/feedback`       | Sí   | Post-sesión                |
| PATCH  | `/api/terapia/sessions/:id/reschedule`     | Sí   | Reagendar                  |
| POST   | `/api/terapia/sessions/:id/cancel`         | Sí   | Cancelar                   |
| GET    | `/api/terapia/crisis`                      | No   | Líneas de crisis (público) |
| POST   | `/api/terapia/crisis/log`                  | Sí   | Auditoría sin contenido    |
| GET    | `/api/terapia/prescriptions`               | Sí   | Recetas                    |
| PATCH  | `/api/terapia/prescriptions/:id`           | Sí   | Marcar como hecho          |
| GET    | `/api/terapia/notifications`               | Sí   | Notifs                     |
| PATCH  | `/api/terapia/notifications/:id/read`      | Sí   | Marcar leída               |
| POST   | `/api/terapia/notifications/read-all`      | Sí   | Marcar todas               |
| GET    | `/api/terapia/intake`                      | Sí   | Intake del usuario         |
| PATCH  | `/api/terapia/intake`                      | Sí   | Editar intake              |
| POST   | `/api/terapia/intake/complete`             | Sí   | Completar intake           |

## Terapia (v2 backlog)

| Método | Endpoint                       | Auth               | Descripción                       |
| ------ | ------------------------------ | ------------------ | --------------------------------- |
| POST   | `/api/terapia/match`           | Sí                 | Matching asistido                 |
| GET    | `/api/terapia/progreso`        | Sí                 | Progreso longitudinal             |
| GET    | `/api/terapia/b2b/entitlement` | Sí                 | Beneficio empresa                 |
| GET    | `/api/terapeuta/*`             | Sí (rol therapist) | Vista terapeuta (cuenta separada) |
| GET    | `/api/empleador/*`             | Sí (rol b2b-admin) | Vista HR                          |

## Patrones

| Método | Endpoint                                  | Auth     | Descripción          |
| ------ | ----------------------------------------- | -------- | -------------------- |
| GET    | `/api/patrones`                           | Sí (Pro) | Insights del período |
| POST   | `/api/patrones/weekly-summary/regenerate` | Sí (Pro) | Re-generar           |
| POST   | `/api/patrones/share-with-therapist`      | Sí (Pro) | Compartir snapshot   |

## Rutas (bundles)

| Método | Endpoint           | Auth | Descripción       |
| ------ | ------------------ | ---- | ----------------- |
| GET    | `/api/rutas`       | Sí   | Catálogo de rutas |
| GET    | `/api/rutas/:slug` | Sí   | Detalle           |

## Push / Live Activities

| Método | Endpoint                      | Auth | Descripción                        |
| ------ | ----------------------------- | ---- | ---------------------------------- |
| POST   | `/api/push/token`             | Sí   | Registrar device token (APNs/FCM)  |
| POST   | `/api/push/live-activity`     | Sí   | Iniciar / actualizar Live Activity |
| DELETE | `/api/push/live-activity/:id` | Sí   | Cerrar Live Activity               |

## Wallpapers

| Método | Endpoint                       | Auth | Descripción |
| ------ | ------------------------------ | ---- | ----------- |
| GET    | `/api/wallpapers`              | Sí   | Catálogo    |
| GET    | `/api/wallpapers/:id/download` | Sí   | Signed URL  |

## Editor de autor (B2B)

| Método | Endpoint                                       | Auth        | Descripción        |
| ------ | ---------------------------------------------- | ----------- | ------------------ |
| GET    | `/api/autor/dashboard`                         | Sí (author) | Dashboard          |
| POST   | `/api/autor/libros`                            | Sí          | Crear libro        |
| GET    | `/api/autor/libros/:id`                        | Sí          | Meta libro         |
| PATCH  | `/api/autor/libros/:id`                        | Sí          | Editar meta        |
| DELETE | `/api/autor/libros/:id`                        | Sí          | Archivar           |
| GET    | `/api/autor/libros/:id/capitulos/:n`           | Sí          | Capítulo           |
| PATCH  | `/api/autor/libros/:id/capitulos/:n`           | Sí          | Editar capítulo    |
| POST   | `/api/autor/libros/:id/capitulos/:n/audio`     | Sí          | Subir audio        |
| POST   | `/api/autor/libros/:id/ai-help`                | Sí          | IA helper (SSE)    |
| GET    | `/api/autor/libros/:id/versiones`              | Sí          | Versiones          |
| POST   | `/api/autor/libros/:id/versiones/:vid/restore` | Sí          | Restaurar          |
| PATCH  | `/api/autor/libros/:id/diseno`                 | Sí          | Portada            |
| POST   | `/api/autor/libros/:id/cover-image`            | Sí          | Upload portada     |
| PATCH  | `/api/autor/libros/:id/estructura`             | Sí          | Reordenar          |
| GET    | `/api/autor/libros/:id/publicacion`            | Sí          | Estado publicación |
| POST   | `/api/autor/libros/:id/publicar`               | Sí          | Enviar a revisión  |
| POST   | `/api/autor/libros/:id/despublicar`            | Sí          | Quitar             |
| GET    | `/api/autor/cobros`                            | Sí          | Revenue share      |

## Pulso (back-office, admin)

| Método | Endpoint                                  | Auth  | Descripción                  |
| ------ | ----------------------------------------- | ----- | ---------------------------- |
| GET    | `/api/pulso/overview`                     | admin | Overview consolidado         |
| GET    | `/api/pulso/books`                        | admin | Lista libros                 |
| GET    | `/api/pulso/books/:id`                    | admin | Detalle libro (por capítulo) |
| GET    | `/api/pulso/funnel`                       | admin | Funnel + cohortes            |
| GET    | `/api/pulso/terapia/gates`                | admin | Gates pre-launch             |
| POST   | `/api/pulso/terapia/override`             | admin | Forzar override              |
| PATCH  | `/api/pulso/terapia/status`               | admin | Encender Terapia             |
| GET    | `/api/pulso/podcast`                      | admin | Estado podcast               |
| POST   | `/api/pulso/podcast/episodes`             | admin | Crear episodio               |
| PATCH  | `/api/pulso/podcast/episodes/:n`          | admin | Editar episodio              |
| GET    | `/api/pulso/podcast/episodes/:n/metrics`  | admin | Métricas episodio            |
| GET    | `/api/pulso/resources`                    | admin | Estado recursos              |
| POST   | `/api/pulso/resources/pieces`             | admin | Crear pieza                  |
| PATCH  | `/api/pulso/resources/pieces/:id`         | admin | Editar pieza                 |
| GET    | `/api/pulso/resources/pieces/:id/metrics` | admin | Métricas pieza               |

---

## Notas de arquitectura

1. **Versioning:** todos los endpoints viven en `/api/*` sin prefijo de versión. Si se necesita v2, mover a `/api/v2/*`.
2. **Idempotency keys:** POSTs críticos (bookings, payments, reservations) aceptan header `Idempotency-Key` para reintentos seguros.
3. **Rate limits sugeridos:**
   - `/api/eco/messages` → 30/min por usuario (free: 10/día)
   - `/api/voz/transcribe` → 5/min por usuario
   - `/api/auth/login` → 5/15 min por IP
   - `/api/pulso/*` → no aplicable (admin, bajo volumen)
4. **Cifrado E2E:** los endpoints de `/api/diario/*`, `/api/eco/messages` (contenido), y `/api/terapia/sessions/:id/prep` (intención + diario compartido) reciben y devuelven ciphertext. La clave del usuario se deriva del password con Argon2id + scrypt y se guarda solo en cliente. **No** existe path de recuperación criptográfica si el usuario pierde la clave — perdió esos datos. Esto debe ser explícito en la UI.
5. **Webhooks externos:** Stripe, Daily.co/Whereby (si se usa para terapia), proveedor de SMS de crisis (si aplica).
6. **Observabilidad:** todos los endpoints emiten eventos a Posthog con `user_id` + `event_name`. Endpoints que retornan datos sensibles (diario, eco) NO loggean payload.

## Total

- **~140 endpoints únicos** identificados.
- **v1 reducido:** ~60 endpoints (sin Terapia v2, sin Pulso completo, sin Author, sin Push, sin Wallpapers).
- **Sugerencia de orden de implementación:** Auth → User → Home → Books/Lector → Diario → Plan/Billing → Patrones → Eco → Terapia (cuando gates cierren) → Pulso → Author → Push → Wallpapers.
