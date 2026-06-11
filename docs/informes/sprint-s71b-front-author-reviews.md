# Sprint S71.B-front — Web admin UI para revisar libros de autor

**Fecha:** 2026-06-10
**Rama:** `feature/sprint-s71b-front-author-reviews`
**Tests:** 56/56 web (+6) · 557/558 API (sin cambios) · 34/34 crypto
**Backend de referencia:** [Sprint S71.B](sprint-s71b-author-promotion.md)

---

## Lo que se construyó

Cierra el loop visual del S71.B: el admin ya tiene una pantalla web para listar libros pendientes de revisión, aprobar (copy-on-publish) o rechazar con feedback. Reemplaza el flujo curl-only.

### Web — `/dashboard/admin/author-requests`

- **Server Component** (`page.tsx`) con doble gate ADMIN (frontend redirect + backend RolesGuard).
- Pre-fetch del listado con `serverFetch('/pulso/author-requests?status=PENDING&limit=100')`.
- 2 tabs zero-JS: **Pendientes** (default) · **Todos**, vía querystring `?status=PENDING|ALL`.
- Lista de cards con metadata editorial: título · subtitle · resumen · autor · email · capítulos · idioma · feedback previo (si rechazado).
- Botones de acción solo visibles cuando `reviewState === "PENDING"`.

### Componentes nuevos

- `AuthorStatusTabs.tsx` — tab strip lavender con `<Link>` (zero-JS, mismo patrón que `StatusTabs` de S49).
- `AuthorRequestsList.tsx` — Server Component que mapea rows + badges colored por estado (sage/rose/lavender).
- `AuthorRequestActions.tsx` — Client Component con state machine `idle → rejecting → done`. Aprobar es one-click; Rechazar abre composer con textarea de feedback (max 2000 chars) y botones Cancelar/Confirmar.

### Server actions

- `approveAuthorRequestAction(id)` → POST + `revalidatePath`.
- `rejectAuthorRequestAction(id, feedback)` → POST + `revalidatePath`. Feedback trimmed; envía `undefined` al backend si queda vacío para que el DTO opt-in lo respete.

### Cliente API

- `pulsoApi.listAuthorRequests({ status?, limit? })` — wrap del endpoint nuevo.
- `pulsoApi.approveAuthorRequest(id)` y `rejectAuthorRequest(id, body)`.
- 6 tipos compartidos nuevos en `@psico/types`: `AuthorRequestStatus`, `AuthorRequestReviewState`, `PulsoAuthorRequestBook`, `PulsoAuthorRequestRow`, `PulsoAuthorRequestListResponse`, `PulsoApproveAuthorRequestResponse`, `PulsoRejectAuthorRequestBody`.

### Sidebar nav

- Item nuevo "📚 Pulso · Autores" en el grupo `ADMIN_NAV_ITEMS`, después de Cohorts. Solo visible para `user.role === "ADMIN"` (igual que los otros admin items).

### Tests UI (+6)

- empty state PENDING — "Pulso al día"
- empty state ALL — "Aún no hay pedidos"
- render row + actions cuando PENDING
- esconde acciones cuando APPROVED/REJECTED
- surface feedback cuando rejected
- fallback "Sin resumen" cuando summary null

---

## Decisiones

1. **Mismo patrón que `/admin/reports` (S42 + S49)** — Server Component pre-fetch + Client Component para mutaciones. Reduce surprise para el admin que ya conoce el dashboard.
2. **Aprobar es one-click sin modal** — el feedback editorial solo tiene sentido cuando se rechaza. Los blockers (min chapters + summary length) ya los validó el autor en el submit.
3. **Rechazar con composer inline** (no modal) — admin triaging muchos rows en serie; modal interrumpe el flow.
4. **Tabs `PENDING`/`ALL` (no `APPROVED`/`REJECTED` separados)** — admin landa en pendientes para actuar; ALL para retrospect/auditoría. El estado individual viene en el badge de cada row.
5. **Feedback en row visible cuando REJECTED** — sirve como audit trail rápido para ver qué se le dijo al autor.
6. **`useTransition` para optimistic UI** — botones se deshabilitan en pending, error inline, no toast global (consistente con S49).
7. **Sin mobile companion** — Pulso es desktop-only en v1 (decisión confirmada en S42/S48/S51).

---

## Privacy

- ADMIN-only doble gate (backend + frontend).
- Response contiene `author.email` para que ops pueda contactar — necesario para feedback fuera del checklist UI. Si GDPR/data residency lo exige más adelante, se mueve a un masking helper en sprint propio.
- No hay ciphertext del Diario ni de Eco en este flow (los AuthorBooks son contenido público licenciado, no E2E).

---

## Smoke verification (local)

- Web typecheck OK.
- Web lint clean (0 errors, 1 warning preexistente de Next ESLint plugin).
- Web tests 56/56 (+6).
- @psico/types build OK, +50 KB declaración.
- @psico/api-client build OK.
- API tests 557/558 (sin cambios).
- @psico/crypto 34/34.

---

## Deuda técnica abierta

- **Sin paginación cliente** del listado — `limit=100` es plenty para v1. Cuando volumen crezca, añadir `?cursor=…`.
- **Sin búsqueda** por título o autor — añadir si el listado crece.
- **Sin "Ver detalle"** del libro completo (capítulo por capítulo). Hoy el admin decide solo en base al resumen + cuenta de capítulos. Si Pulso v2 lo requiere, sprint propio.
- **Sin notificación al autor** post approve/reject (deuda heredada de S71.B backend).
- **Sin export CSV** del audit trail.
- **Mobile companion** sigue diferido (Pulso desktop-only).
- **Sin tests dedicados** para `AuthorRequestActions` (Client Component con server action mock). Cubierto por unit tests del backend + integración del listado.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Deploy automático en Vercel (web).
3. Promover un USER a ADMIN vía SQL en Railway + login: navegar a `/dashboard/admin/author-requests`.
4. Flujo manual completo:
   - SQL: promover otro user a AUTHOR.
   - Como AUTHOR: `POST /api/autor/libros` → 3 capítulos → `submit/publicar`.
   - Como ADMIN: ir a `/dashboard/admin/author-requests` → Aprobar.
   - Como user FREE: `GET /api/books` debe listar el libro nuevo.

Después: S71.C (AI helpers + audio/cover upload + cobros) o S71-front (Editor de autor UI completo).
