# IMPLEMENTATION_PLAN.md

> ⚠️ **OBSOLETO — superseded por [IMPLEMENTATION_PLAN_v2.md](IMPLEMENTATION_PLAN_v2.md).**
>
> Este plan fue producido el 2026-05-25 a partir de una lista corta de endpoints
> v1 priorizados por el usuario, sin leer `docs/design/handoff/`. Cubre ~30 % de
> la superficie real del diseño (5 endpoints de Users en lugar de 12, sin
> Onboarding, Voz, Terapia, Patrones, Autor, Pulso, Push, Wallpapers, sin E2E
> encryption, sin OAuth, sin rate limiting, sin idempotency). Se mantiene como
> referencia histórica únicamente.
>
> **Para implementar el back a partir de Sesión 10, usar IMPLEMENTATION_PLAN_v2.md.**

---

Plan de sprints de 1 semana para llevar el back al contrato v1 prioritario.
Generado: 2026-05-25

---

## Principios

1. **Orden de dependencias estricto.** Cada sprint solo agrega cosas que dependen de lo ya terminado.
2. **No romper producción.** El back ya está vivo en Railway con web + mobile consumiéndolo. Las rutas existentes se mantienen alias durante un sprint antes de retirarlas.
3. **Schema first.** Cada sprint que necesita modelos nuevos abre con una migración Prisma idempotente.
4. **Un módulo Nest por dominio del v1.** `UsersModule`, `DiarioModule`, `LectorModule`, `EcoModule` se crean nuevos; `BillingModule` reemplaza progresivamente a `SubscriptionModule`.
5. **Tests por sprint.** Cada endpoint nuevo cierra con al menos un happy path + un edge case en Vitest. Línea base actual: 87/87.

---

## Sprint 0 — Normalización de contrato (rompedor de hielo)

**Objetivo:** unificar el prefijo `/api` en todo el back y normalizar `GET /plan` antes de tocar nada más, para que los sprints siguientes ya hablen el mismo idioma que la lista v1.

**Endpoints:**
- Re-exponer **todos** los actuales bajo `/api/...` agregando `app.setGlobalPrefix("api")` en [main.ts](apps/api/src/main.ts).
- `GET /api/plan` — wrapper que envuelve `SubscriptionService.getMySubscription` y devuelve `{ plan: "FREE", status: null, … }` para usuarios sin registro, en lugar de 404.
- Mantener temporalmente las rutas **sin prefijo** activas vía un segundo controller alias o `excludeGlobalPrefix` por handler — borrar al cerrar el Sprint 3.

**Archivos a crear/modificar:**
- modificar `apps/api/src/main.ts` (setGlobalPrefix + lista de excludes para Stripe webhook actual)
- modificar `apps/web/src/lib/api.ts` y `apps/web/src/lib/api.server.ts` (anteponer `/api`)
- modificar `packages/api-client/src/client.ts` y los `*.ts` (anteponer `/api`)
- modificar `apps/api/src/subscription/subscription.service.ts` y `subscription.controller.ts` (handler `GET /plan` envolvente)
- nuevos tests: `apps/api/src/subscription/plan.spec.ts`

**Depende de:** —

---

## Sprint 1 — UsersModule (perfil, preferencias, notificaciones, privacidad)

**Objetivo:** que el frontend pueda leer y editar la identidad del usuario sin depender del JWT en cookie ni del payload del login.

**Endpoints:**
- `GET /api/user/me`
- `PATCH /api/user/profile` (name, avatarUrl, bio, country, timezone, preferredLanguage)
- `PATCH /api/user/preferences` (tema, idioma de UI, unidades, opt-in marketing)
- `PATCH /api/user/notifications` (push, email transaccional, recordatorios diario)
- `PATCH /api/user/privacy` (perfil público, share progreso, analytics opt-out)

**Archivos a crear/modificar:**
- Prisma: migración `add_user_settings` con modelos `UserPreferences`, `NotificationSettings`, `PrivacySettings` (relación 1-1 con User; valores default en código, no en columna)
- `apps/api/src/users/users.module.ts`
- `apps/api/src/users/users.controller.ts`
- `apps/api/src/users/users.service.ts`
- `apps/api/src/users/dto/{update-profile,update-preferences,update-notifications,update-privacy}.dto.ts`
- registrar `UsersModule` en `app.module.ts`
- extender `packages/types/src/index.ts` con `UserPreferences`, `NotificationSettings`, `PrivacySettings`
- changeset minor en `@psico/types`
- tests: `users.service.spec.ts`, `users.controller.spec.ts`

**Depende de:** Sprint 0.

---

## Sprint 2 — Email transaccional + flujo password reset + verify email

**Objetivo:** cerrar los huecos de Auth para soportar recuperación de contraseña y verificación de email — bloqueantes legales/UX para promoción de FREE → PRO.

**Endpoints:**
- `POST /api/auth/forgot-password` (no leaks: 200 siempre que el formato sea válido)
- `POST /api/auth/reset-password`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification` (extra implícito, sin él la UX queda rota)

**Archivos a crear/modificar:**
- Prisma: migración `add_auth_tokens` con `PasswordResetToken`, `EmailVerificationToken` (hash SHA-256 del token, expiresAt, usedAt, índice por hash)
- `apps/api/src/auth/auth.controller.ts` (4 handlers nuevos)
- `apps/api/src/auth/auth.service.ts` (lógica de generación + verificación de tokens; rate limit por email/IP)
- `apps/api/src/auth/dto/{forgot-password,reset-password,verify-email}.dto.ts`
- nuevo módulo `apps/api/src/notifications/notifications.module.ts` con `ResendService` (provider para `RESEND_API_KEY`)
- `apps/api/src/notifications/templates/{password-reset,verify-email}.tsx` o equivalente HTML
- env schema (`apps/api/src/config/`): agregar `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`
- tests: `auth.password-reset.spec.ts`, `auth.verify-email.spec.ts`, mock de `ResendService`

**Depende de:** Sprint 0.

---

## Sprint 3 — Rebrand `subscriptions` → `billing` y endpoint de facturas

**Objetivo:** alinear los paths con v1, agregar facturas Stripe, retirar las rutas legacy `/subscriptions/*`.

**Endpoints:**
- `POST /api/billing/checkout-session` (alias del checkout actual)
- `POST /api/billing/customer-portal` (alias del portal actual)
- `POST /api/billing/webhook` (mover el de Stripe — coordinar Dashboard de Stripe)
- `GET  /api/billing/invoices` (lista de invoices del customer vía Stripe API)

**Archivos a crear/modificar:**
- renombrar `apps/api/src/subscription/` → `apps/api/src/billing/` (preservar git history con `git mv`)
- `billing.controller.ts` con las 4 rutas nuevas + alias temporal de las antiguas
- `billing.service.ts` ya tiene 90% — agregar `listInvoices(userId)` usando `stripe.invoices.list({ customer })`
- mover ADR 0005 si referencia paths viejos
- actualizar Stripe Dashboard (test + prod) para apuntar al nuevo webhook **y** mantener el viejo activo durante 7 días
- actualizar consumidores: web (`actions/subscription.ts`, `app/dashboard/plan/page.tsx`), mobile (`packages/api-client/src/subscription.ts`)
- tests: `billing.invoices.spec.ts`; tests viejos siguen pasando vía alias
- **al cerrar el sprint:** borrar handlers sin prefijo y `subscription/*` alias

**Depende de:** Sprint 0.

---

## Sprint 4 — Books reorganizado + favoritos + start

**Objetivo:** mover la API de libros del namespace `content/` al `books/` plano que pide v1, agregar favoritos y marcar "empezar libro".

**Endpoints:**
- `GET  /api/books` (alias del actual `/content/books`)
- `GET  /api/books/:id` (acepta **slug o id** — resolver internamente)
- `POST /api/books/:id/start`
- `POST /api/books/:id/favorite` (toggle: si ya está, lo quita)

**Archivos a crear/modificar:**
- Prisma: migración `add_book_engagement` con modelos `Favorite` (userId, bookId, createdAt, unique) y `BookStart` (userId, bookId, startedAt, unique). Alternativa: agregar `startedAt` a un nuevo modelo unificado `UserBookState` — decidir al inicio del sprint.
- `apps/api/src/books/books.module.ts` (nuevo, importa del actual ContentModule)
- `apps/api/src/books/books.controller.ts` (rutas planas)
- mover `books.service.ts` y `books.controller.ts` actuales o exponer ambos paths
- extender `packages/types` con `BookSummary` que incluya `isFavorite`, `startedAt`, `progressPercent`
- actualizar web ([dashboard/page.tsx:124](apps/web/src/app/dashboard/page.tsx:124)) y mobile (`packages/api-client/src/content.ts`)
- tests: `books.favorite.spec.ts`, `books.start.spec.ts`

**Depende de:** Sprint 0. Idealmente posterior a Sprint 1 (necesita `getCurrentUser` reusable y `User.preferences` para idioma de descripción del libro si aplica).

---

## Sprint 5 — HomeModule (agregador del dashboard)

**Objetivo:** colapsar las múltiples llamadas del dashboard en una sola — payload de bootstrap.

**Endpoints:**
- `GET /api/home`

**Forma de respuesta:**
```ts
{
  user: { id, name, avatarUrl, plan },
  books: BookSummary[],            // ya con isFavorite, startedAt, progressPercent
  currentReading: { bookId, chapterOrder, lastReadAt } | null,
  plan: PlanInfo,
  promptOfTheDay: JournalPrompt,
  lastJournalEntry: JournalEntry | null,
  recentEcoThread: { id, title, lastMessageAt } | null
}
```

**Archivos a crear/modificar:**
- `apps/api/src/home/home.module.ts`
- `apps/api/src/home/home.controller.ts`
- `apps/api/src/home/home.service.ts` (compone llamadas a BooksService, BillingService, DiarioService, EcoService, LectorService)
- adaptar `apps/web/src/app/dashboard/page.tsx` para consumir `/api/home` en lugar de 2 fetches
- adaptar `apps/mobile/app/(tabs)/index.tsx` (todavía sin home real — diseñar)
- tests: `home.service.spec.ts` con mocks de cada servicio downstream

**Depende de:** Sprint 1 (User), Sprint 3 (Billing → plan), Sprint 4 (Books con favoritos/start), Sprint 6 (Lector → currentReading), Sprint 7 (Diario → prompt of the day + last entry), Sprint 8 (Eco → recent thread).

> ⚠️ Este sprint en realidad es el **último** del bloque v1 porque depende de todo. Lo dejamos numerado #5 conceptualmente pero se ejecuta tras 6/7/8 — ver la sección "Calendario" abajo.

---

## Sprint 6 — LectorModule (sesiones, highlights, annotations)

**Objetivo:** soportar lectura real con persistencia de posición, anotaciones y resaltados — núcleo de la experiencia FREE.

**Endpoints:**
- `GET   /api/lector/:bookId/:chapterN` (alias de `/content/books/:slug/chapters/:order` aceptando bookId o slug)
- `PATCH /api/lector/session` (heartbeat de lectura: position, scrollPercent, durationDelta)
- `POST  /api/lector/:bookId/:chapterN/complete` (alias enriquecido de `/content/progress/:chapterId`)
- `POST  /api/highlights`
- `POST  /api/annotations`
- *(extra)* `GET /api/highlights?chapterId=…` y `GET /api/annotations?chapterId=…` — sin esto, los anteriores son escritura ciega

**Archivos a crear/modificar:**
- Prisma: migración `add_lector_persistence` con `ReadingSession`, `Highlight`, `Annotation` (FK a Chapter; ownership por userId)
- `apps/api/src/lector/lector.module.ts`
- `apps/api/src/lector/lector.controller.ts`
- `apps/api/src/lector/session.service.ts`
- `apps/api/src/lector/highlights.service.ts`
- `apps/api/src/lector/annotations.service.ts`
- DTOs: `update-session.dto.ts`, `create-highlight.dto.ts`, `create-annotation.dto.ts`
- extender `packages/types`
- adaptar `apps/web` y `apps/mobile` con UI nueva (puede ir en sprints posteriores — el back queda listo)
- tests: 3 specs, uno por service

**Depende de:** Sprint 0. Compatibilidad con `ContentModule.progress` — Sprint 0 alias bajo `/api`.

---

## Sprint 7 — DiarioModule

**Objetivo:** módulo más simple en lógica pero más alto en valor de retención — diario personal con prompts.

**Endpoints:**
- `GET    /api/diario/entries` (paginado, filtro por fecha)
- `POST   /api/diario/entries`
- `GET    /api/diario/entries/:id` (404 si no es del user)
- `PATCH  /api/diario/entries/:id`
- `DELETE /api/diario/entries/:id`
- `GET    /api/diario/prompt-of-the-day`

**Archivos a crear/modificar:**
- Prisma: migración `add_journal` con `JournalEntry` (userId, content, mood?, promptId?, createdAt) y `JournalPrompt` (text, category, isActive)
- `apps/api/src/diario/diario.module.ts`
- `apps/api/src/diario/entries.controller.ts`
- `apps/api/src/diario/entries.service.ts`
- `apps/api/src/diario/prompts.service.ts` (selección determinística por `userId + UTC date hash`)
- seed: poblar 30+ prompts iniciales en `prisma/seed.ts`
- extender `packages/types`
- tests: `entries.service.spec.ts`, `prompts.service.spec.ts` (verificar idempotencia diaria)

**Depende de:** Sprint 0.

---

## Sprint 8 — EcoModule (rebrand `AIModule` + endpoints estilo `threads`)

**Objetivo:** exponer la IA companion bajo el namespace de marca `eco/threads` que pide v1, agregar creación explícita de thread, listado con metadata, y dejar el módulo viejo como alias.

**Endpoints:**
- `GET  /api/eco/threads`
- `POST /api/eco/threads` (crea thread vacío con título auto-generado)
- `GET  /api/eco/threads/:id` (metadata + mensajes)
- `POST /api/eco/messages` (alias enriquecido de `/ai/chat`)

**Archivos a crear/modificar:**
- `apps/api/src/eco/eco.module.ts` (importa `AIService`, `IngestService`)
- `apps/api/src/eco/eco.controller.ts` (rutas nuevas que delegan al service existente)
- `apps/api/src/ai/ai.service.ts`: agregar método `createConversation(userId, title?)`
- `apps/api/src/ai/ai.service.ts`: agregar método `getConversationWithMessages(userId, id)` con ownership check
- mantener `/ai/*` activo como alias durante 1 sprint
- extender `packages/types` con `EcoThread`, `EcoMessage`
- actualizar UI de chat en web (pendiente) y mobile (pendiente) usando el nuevo namespace
- tests: `eco.controller.spec.ts`

**Depende de:** Sprint 0.

---

## Sprint 9 — Sprint 5 recolocado: HomeModule + cleanup final

**Objetivo:** ejecutar Sprint 5 ahora que todas las dependencias existen, y borrar todos los aliases legacy.

**Endpoints:**
- `GET /api/home` (real, no stubs)

**Archivos a crear/modificar:**
- ver Sprint 5
- borrar handlers/aliases sin prefijo `/api` declarados en Sprint 0
- borrar `/subscriptions/*` (alias retirados desde Sprint 3 + buffer)
- borrar `/ai/*` (alias retirado desde Sprint 8 + buffer)
- borrar `/content/books/*`, `/content/progress/*` si se confirma que toda la UI migró
- actualizar `CLAUDE.md` (sección Modules) y crear ADR 0006 con la nueva topología
- pruebas end-to-end final: smoke test de cada path v1

**Depende de:** Sprints 1, 3, 4, 6, 7, 8.

---

## Calendario sugerido (orden de ejecución real)

| Semana | Sprint                     | Por qué en ese orden                                                                  |
|--------|----------------------------|----------------------------------------------------------------------------------------|
| 1      | Sprint 0                   | Sin esto, todo el resto del trabajo nace con paths inconsistentes.                     |
| 2      | Sprint 1 (Users)           | Habilita `currentUser` rico para Home y todos los módulos siguientes.                  |
| 3      | Sprint 2 (Auth/Email) **\|\|** Sprint 3 (Billing) | Independientes entre sí — pueden ir en paralelo si hay 2 personas.   |
| 4      | Sprint 4 (Books)           | Requiere User (para favoritos).                                                        |
| 5      | Sprint 6 (Lector)          | Requiere Books (FK chapter → book).                                                    |
| 6      | Sprint 7 (Diario)          | Independiente — podría adelantarse, pero su valor en Home necesita estar listo antes de Sprint 9. |
| 7      | Sprint 8 (Eco)             | Independiente. Se deja aquí para no saturar las primeras semanas.                      |
| 8      | Sprint 9 (Home + cleanup)  | Cierra el contrato v1 y elimina toda la deuda transitoria.                             |

---

## Riesgos y mitigaciones

| Riesgo                                                            | Mitigación                                                                                                |
|-------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| Mover el webhook de Stripe rompe pagos en producción              | Sprint 3 deja **ambos** paths activos 7 días. Cambio de dashboard se hace en ventana de bajo tráfico.     |
| `/subscriptions/me` devolviendo 404 está cableado en el front     | Sprint 0 introduce `GET /api/plan` envolvente **antes** de tocar el comportamiento del legacy.            |
| Tabla `Conversation` ya en uso por `AIModule`                     | Sprint 8 **no migra datos**; solo expone rutas alias. El rebrand a Eco es de fachada.                     |
| Modelos nuevos en producción mientras el back está vivo           | Cada migración es additive only (no DROP). Se aplican con `prisma migrate deploy` en CI.                  |
| Cambio de namespace `content/books` → `books` rompe mobile activo | Sprint 4 mantiene ambos paths hasta cleanup en Sprint 9. Coordinar release de mobile.                     |
| Sprint 9 elimina rutas legacy cuando aún hay clientes viejos      | Auditar logs de Railway por hits a paths sin prefijo durante 1 semana antes de borrar.                    |

---

## Definition of Done por sprint

- Migración Prisma aplicada en CI y en Railway staging.
- 100% de los endpoints nuevos con DTO validado por `class-validator` + test happy path + test edge.
- `packages/types` con los tipos publicados vía changeset.
- Sin regresiones: `pnpm --filter @psico/api test` verde y ≥ baseline 87.
- Línea anotada en `CLAUDE.md` (Session log) describiendo qué se cerró.
- ADR creado si el sprint introdujo un patrón nuevo (Resend, BookEngagement, Lector persistence).
