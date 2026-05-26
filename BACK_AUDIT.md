# BACK_AUDIT.md

Auditoría del estado de los endpoints v1 prioritarios contra `apps/api/src/`.
Generado: 2026-05-25

---

## 0. Inventario completo de endpoints existentes en el back

> ⚠️ **Hallazgo crítico transversal:** `apps/api/src/main.ts` **NO declara `app.setGlobalPrefix("api")`**. El back expone hoy las rutas en la raíz (`/auth/…`, `/content/…`, etc.), no bajo `/api/…`. Toda la lista v1 que pides asume el prefijo `/api`, por lo que técnicamente **ningún endpoint v1 está accesible en el path exacto solicitado**. Se trata por aparte en la tabla de cada módulo y aparece como item #0 del plan.

| # | Método | Ruta actual                                            | Controller                                                                 | Notas                                            |
|---|--------|--------------------------------------------------------|----------------------------------------------------------------------------|--------------------------------------------------|
| 1 | POST   | `/auth/register`                                       | [auth.controller.ts:31](apps/api/src/auth/auth.controller.ts:31)           | Devuelve `AuthResponse` (tokens + user)          |
| 2 | POST   | `/auth/login`                                          | [auth.controller.ts:37](apps/api/src/auth/auth.controller.ts:37)           | 200 OK                                           |
| 3 | POST   | `/auth/refresh`                                        | [auth.controller.ts:43](apps/api/src/auth/auth.controller.ts:43)           | Rota refresh token; registra UA/IP               |
| 4 | POST   | `/auth/logout`                                         | [auth.controller.ts:54](apps/api/src/auth/auth.controller.ts:54)           | JWT + body con refreshToken; 204                 |
| 5 | GET    | `/content/books`                                       | [books.controller.ts:25](apps/api/src/content/books/books.controller.ts:25)| Público                                          |
| 6 | GET    | `/content/books/:slug`                                 | [books.controller.ts:30](apps/api/src/content/books/books.controller.ts:30)| Usa **slug**, no id                              |
| 7 | POST   | `/content/books`                                       | [books.controller.ts:38](apps/api/src/content/books/books.controller.ts:38)| Solo ADMIN                                       |
| 8 | PATCH  | `/content/books/:slug`                                 | [books.controller.ts:45](apps/api/src/content/books/books.controller.ts:45)| Solo ADMIN                                       |
| 9 | GET    | `/content/books/:slug/chapters/:order`                 | [chapters.controller.ts:30](apps/api/src/content/chapters/chapters.controller.ts:30)| JWT + PlanGuard (check dinámico)         |
| 10| POST   | `/content/books/:slug/chapters`                        | [chapters.controller.ts:41](apps/api/src/content/chapters/chapters.controller.ts:41)| Solo ADMIN                               |
| 11| POST   | `/content/books/:slug/chapters/:order/audio`           | [chapters.controller.ts:49](apps/api/src/content/chapters/chapters.controller.ts:49)| Solo ADMIN; multipart                    |
| 12| POST   | `/content/progress/:chapterId`                         | [progress.controller.ts:24](apps/api/src/content/progress/progress.controller.ts:24)| JWT; idempotente (upsert por unique)     |
| 13| GET    | `/content/progress`                                    | [progress.controller.ts:34](apps/api/src/content/progress/progress.controller.ts:34)| JWT; agregado por usuario                |
| 14| GET    | `/subscriptions/plans`                                 | [subscription.controller.ts:27](apps/api/src/subscription/subscription.controller.ts:27)| Público                              |
| 15| GET    | `/subscriptions/me`                                    | [subscription.controller.ts:33](apps/api/src/subscription/subscription.controller.ts:33)| JWT; **404** si el usuario es FREE   |
| 16| POST   | `/subscriptions/checkout`                              | [subscription.controller.ts:39](apps/api/src/subscription/subscription.controller.ts:39)| JWT; Stripe Checkout                 |
| 17| POST   | `/subscriptions/portal`                                | [subscription.controller.ts:53](apps/api/src/subscription/subscription.controller.ts:53)| JWT; Stripe Billing Portal           |
| 18| POST   | `/subscriptions/webhook`                               | [subscription.controller.ts:63](apps/api/src/subscription/subscription.controller.ts:63)| Sin JWT; rawBody + signature         |
| 19| POST   | `/ai/chat`                                             | [ai.controller.ts:25](apps/api/src/ai/ai.controller.ts:25)                 | JWT + Plan PRO; crea conversación si falta       |
| 20| GET    | `/ai/conversations`                                    | [ai.controller.ts:46](apps/api/src/ai/ai.controller.ts:46)                 | JWT + Plan PRO                                   |
| 21| GET    | `/ai/conversations/:id/messages`                       | [ai.controller.ts:52](apps/api/src/ai/ai.controller.ts:52)                 | JWT + Plan PRO                                   |
| 22| POST   | `/ai/ingest/:bookId`                                   | [ai.controller.ts:61](apps/api/src/ai/ai.controller.ts:61)                 | Solo ADMIN                                       |
| 23| GET    | `/health`                                              | [health.controller.ts:5](apps/api/src/health/health.controller.ts:5)       | Liveness                                         |

**Módulos NestJS registrados** ([app.module.ts:18](apps/api/src/app.module.ts:18)): `PrismaModule · StorageModule · AuthModule · ContentModule · SubscriptionModule · HealthModule · AIModule`. Los TODO del propio archivo (`UsersModule · NotificationsModule · AnalyticsModule · ProgressModule`) **siguen pendientes** — el módulo `Progress` solo existe como sub-feature de `ContentModule`.

---

## 1. AUTH — `/api/auth/*`

| Endpoint v1                      | Estado | Ruta real (sin `/api`)         | Notas / Discrepancias                                                                                                  |
|----------------------------------|--------|--------------------------------|------------------------------------------------------------------------------------------------------------------------|
| POST `/api/auth/register`        | ⚠️     | `POST /auth/register`          | Funcional. Falta solo el prefijo global `/api`.                                                                        |
| POST `/api/auth/login`           | ⚠️     | `POST /auth/login`             | Funcional. Falta solo el prefijo.                                                                                      |
| POST `/api/auth/logout`          | ⚠️     | `POST /auth/logout`            | Funcional. Falta prefijo. Hoy exige JWT + refreshToken en body — el front ya cumple ambos.                             |
| POST `/api/auth/refresh`         | ⚠️     | `POST /auth/refresh`           | Funcional. Falta prefijo. **Discrepancia menor**: web espera `{ accessToken, refreshToken }`; mobile espera además `user` — el back ya retorna ambos.|
| POST `/api/auth/forgot-password` | ❌     | —                              | No existe. No hay modelo `PasswordResetToken` en Prisma ni integración Resend.                                          |
| POST `/api/auth/reset-password`  | ❌     | —                              | No existe. Depende de `forgot-password`.                                                                                |
| POST `/api/auth/verify-email`    | ❌     | —                              | No existe. El campo `User.emailVerified` ya está en el schema pero nadie lo escribe. No hay `EmailVerificationToken`.    |

---

## 2. USER — `/api/user/*`

> **Estado del módulo:** `UsersModule` **NO existe**. Está marcado como TODO en [app.module.ts:26](apps/api/src/app.module.ts:26). Sí existe el modelo `Profile` en Prisma con campos `bio · country · timezone · preferredLanguage`, pero ningún controller lo expone.

| Endpoint v1                      | Estado | Notas                                                                                                                  |
|----------------------------------|--------|------------------------------------------------------------------------------------------------------------------------|
| GET `/api/user/me`               | ❌     | No existe endpoint para devolver el `User` autenticado. El front lee la identidad del JWT en cookie (web) o del response de login (mobile). No hay forma de re-hidratar tras un cambio de `name/avatarUrl/plan`. |
| PATCH `/api/user/profile`        | ❌     | No existe. Modelo `Profile` listo pero sin endpoint.                                                                    |
| PATCH `/api/user/preferences`    | ❌     | No existe. **No hay modelo** `UserPreferences` (tema, idioma, etc.) — hay que diseñarlo (puede vivir en `Profile.preferredLanguage` parcialmente). |
| PATCH `/api/user/notifications`  | ❌     | No existe. **No hay modelo** `NotificationSettings` (push/email/marketing opt-in).                                      |
| PATCH `/api/user/privacy`        | ❌     | No existe. **No hay modelo** `PrivacySettings` (perfil público, share progreso, analytics opt-out).                     |

---

## 3. HOME — `/api/home`

| Endpoint v1            | Estado | Notas                                                                                                                  |
|------------------------|--------|------------------------------------------------------------------------------------------------------------------------|
| GET `/api/home`        | ❌     | No existe endpoint agregado. Hoy [dashboard/page.tsx:124](apps/web/src/app/dashboard/page.tsx:124) hace **2 fetches en paralelo** (`/content/books` + `/subscriptions/me`) y compone el dashboard a mano. Mobile aún no tiene home — solo `(tabs)/index.tsx`. v1 quiere un agregador que devuelva: libros + plan + progreso reciente + entrada del diario sugerida + última conversación Eco. |

---

## 4. BOOKS — `/api/books/*`

| Endpoint v1                       | Estado | Ruta real                          | Notas / Discrepancias                                                                                                  |
|-----------------------------------|--------|------------------------------------|------------------------------------------------------------------------------------------------------------------------|
| GET `/api/books`                  | ⚠️     | `GET /content/books`               | Funcional. Diferencias: (a) prefijo `/api` ausente; (b) namespace `content/` en lugar de plano `/books`.                |
| GET `/api/books/:id`              | ⚠️     | `GET /content/books/:slug`         | Funcional pero el back usa **slug**, no **id**. Decisión ADR 0003: slugs en URLs. Hay que confirmar si `:id` v1 acepta slug o necesitamos endpoint adicional por id. |
| POST `/api/books/:id/start`       | ❌     | —                                  | No existe. No hay modelo `BookStart` ni columna `startedAt` en `UserProgress`. Hoy `UserProgress` solo registra **capítulos completados**, no el momento de "empezar libro". |
| POST `/api/books/:id/favorite`    | ❌     | —                                  | No existe. **No hay modelo** `Favorite` ni relación many-to-many `User ↔ Book` para favoritos.                          |

---

## 5. LECTOR — `/api/lector/*`

> **Estado del módulo:** No existe namespace `lector` en el back. La funcionalidad equivalente vive en `ContentModule` bajo `/content/books/:slug/chapters/…`.

| Endpoint v1                                | Estado | Ruta real / Notas                                                                                                       |
|--------------------------------------------|--------|-------------------------------------------------------------------------------------------------------------------------|
| GET `/api/lector/:bookId/:chapterN`        | ⚠️     | Equivalente en `GET /content/books/:slug/chapters/:order` ([chapters.controller.ts:30](apps/api/src/content/chapters/chapters.controller.ts:30)). Diferencias: (a) usa slug+order, no id+N; (b) namespace distinto; (c) Plan check dinámico aplicado. |
| PATCH `/api/lector/session`                | ❌     | No existe. **No hay modelo** `ReadingSession` (posición de lectura, scroll, último acceso, tiempo leído).               |
| POST `/api/lector/:bookId/:chapterN/complete` | ⚠️  | Existe `POST /content/progress/:chapterId` pero requiere **chapterId** (cuid), no `bookId+chapterN`. Hay que: (a) cambiar la firma del endpoint a `:bookSlug/:order`, o (b) que el back resuelva chapterId internamente. |
| POST `/api/highlights`                     | ❌     | No existe. **No hay modelo** `Highlight`. Requiere: `userId`, `chapterId`, `selectionStart`, `selectionEnd`, `text`, `color`, `note?`. |
| POST `/api/annotations`                    | ❌     | No existe. **No hay modelo** `Annotation`. Distinción con Highlight: la annotation es una nota libre asociada a un punto del capítulo (no a una selección de texto). |

---

## 6. DIARIO — `/api/diario/*`

> **Estado del módulo:** Inexistente. No hay `DiarioModule` ni modelos relacionados. Es el módulo **más verde** del v1.

| Endpoint v1                                | Estado | Notas                                                                                                                  |
|--------------------------------------------|--------|------------------------------------------------------------------------------------------------------------------------|
| GET `/api/diario/entries`                  | ❌     | No existe. Paginación y filtros (por fecha, mood, prompt) por definir.                                                  |
| POST `/api/diario/entries`                 | ❌     | No existe. Campos mínimos sugeridos: `content`, `mood?`, `promptId?`, `tags?`, `isPrivate`.                              |
| GET `/api/diario/entries/:id`              | ❌     | No existe. Ownership check por `userId` requerido.                                                                      |
| PATCH `/api/diario/entries/:id`            | ❌     | No existe.                                                                                                              |
| DELETE `/api/diario/entries/:id`           | ❌     | No existe. Decidir hard delete vs soft delete (`deletedAt`).                                                            |
| GET `/api/diario/prompt-of-the-day`        | ❌     | No existe. **No hay modelo** `JournalPrompt` ni mecanismo de selección diaria (rotativo determinístico por fecha+user).  |

**Modelos nuevos requeridos:** `JournalEntry`, `JournalPrompt`, opcionalmente `JournalTag`.

---

## 7. PLAN / BILLING — `/api/plan` + `/api/billing/*`

| Endpoint v1                              | Estado | Ruta real                          | Notas / Discrepancias                                                                                                  |
|------------------------------------------|--------|------------------------------------|------------------------------------------------------------------------------------------------------------------------|
| GET `/api/plan`                          | ⚠️     | `GET /subscriptions/me`            | Existe pero **devuelve 404 si el usuario es FREE** (ver [FRONT_API_AUDIT.md:322](FRONT_API_AUDIT.md:322)). v1 espera siempre JSON: `{ plan: "FREE" \| "PRO" \| ..., status, renewsAt?, cancelAtPeriodEnd? }`. Habría que envolver o agregar un endpoint nuevo que retorne FREE como caso normal. |
| POST `/api/billing/checkout-session`     | ⚠️     | `POST /subscriptions/checkout`     | Funcional. Solo rename de ruta + prefix.                                                                                |
| POST `/api/billing/customer-portal`      | ⚠️     | `POST /subscriptions/portal`       | Funcional. Solo rename de ruta + prefix.                                                                                |
| POST `/api/billing/webhook`              | ⚠️     | `POST /subscriptions/webhook`      | Funcional. Solo rename de ruta + prefix. ⚠️ **Cuidado:** mover esta ruta exige actualizar el endpoint registrado en el dashboard de Stripe (producción y test). |
| GET `/api/billing/invoices`              | ❌     | —                                  | No existe. Stripe expone facturas vía API (`stripe.invoices.list({ customer })`). Hay que envolverlo.                   |

---

## 8. ECO (IA companion) — `/api/eco/*`

> **Estado:** Existe funcionalidad equivalente en `AIModule` con un naming distinto (`conversations` en lugar de `threads`, `chat` en lugar de `messages`). El esqueleto funcional ya está.

| Endpoint v1                          | Estado | Ruta real                                      | Notas / Discrepancias                                                                                                  |
|--------------------------------------|--------|------------------------------------------------|------------------------------------------------------------------------------------------------------------------------|
| GET `/api/eco/threads`               | ⚠️     | `GET /ai/conversations`                        | Funcional. Diferencias: nombre `threads` vs `conversations`; prefijo. Misma forma de respuesta.                         |
| POST `/api/eco/threads`              | ⚠️     | (creación implícita en `POST /ai/chat`)        | Hoy **no hay endpoint explícito** para crear un thread vacío — el `conversationId` se devuelve cuando envías el primer mensaje sin `conversationId`. v1 querría crear thread + título primero, mensaje después. Implica agregar `POST /ai/conversations`. |
| GET `/api/eco/threads/:id`           | ⚠️     | `GET /ai/conversations/:id/messages`           | El back **solo retorna mensajes**, no la metadata del thread (`title`, `createdAt`). Hay que enriquecer la respuesta o exponer un `GET /ai/conversations/:id` con metadata + mensajes. |
| POST `/api/eco/messages`             | ⚠️     | `POST /ai/chat`                                | Funcional. Diferencias: nombre y forma de respuesta (`{ reply, conversationId, usage }`). PRO-only — coincide con v1 esperado. |

**Decisión arquitectónica clave:** o renombramos `AIModule` → `EcoModule` (rebrand) o mantenemos `AIModule` por dentro y exponemos las rutas `/api/eco/*` como controllers nuevos que delegan al mismo service. Recomendado lo segundo (menos churn).

---

## 9. Resumen ejecutivo

| Categoría                                              | Cantidad | Endpoints                                                                                          |
|--------------------------------------------------------|----------|----------------------------------------------------------------------------------------------------|
| ✅ Implementado exacto (path + shape)                  | **0**    | Ninguno coincide al 100% — todos sufren al menos por la falta del prefijo `/api`.                  |
| ⚠️ Parcial (existe equivalente, requiere rename/ajuste)| **14**   | Auth (4), Books (2), Lector (2), Plan/Billing (4), Eco (4). Solo necesitan **prefijo + alias/rename**. |
| ❌ No existe                                           | **18**   | `forgot-password`, `reset-password`, `verify-email`, User completo (5), Home (1), Books `start`+`favorite` (2), Lector `session` + `highlights` + `annotations` (3), Diario completo (6), `billing/invoices` (1). |

**Modelos Prisma faltantes:** `PasswordResetToken`, `EmailVerificationToken`, `UserPreferences`, `NotificationSettings`, `PrivacySettings`, `BookStart` (o `startedAt` en `UserProgress`), `Favorite`, `ReadingSession`, `Highlight`, `Annotation`, `JournalEntry`, `JournalPrompt`.

**Integraciones nuevas:** Resend para email transaccional (forgot/verify), Stripe Invoices API.

**Riesgo más alto:** mover el webhook de Stripe (`/subscriptions/webhook` → `/api/billing/webhook`) requiere actualizar el dashboard de Stripe en producción **sin caída** — manejar con doble exposición temporal.
