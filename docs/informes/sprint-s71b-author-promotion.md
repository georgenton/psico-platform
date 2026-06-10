# Sprint S71.B — Author book promotion (copy-on-publish)

**Fecha:** 2026-06-10
**Rama:** `feature/sprint-s71b-author-promotion`
**Tests:** 557/558 API (540 → 557 · +17 · 1 skipped sentinel)
**Design handoff:** [docs/design/handoff/16-author.md](../design/handoff/16-author.md)

---

## Lo que se construyó

Cierre del loop crítico que abrió S71: el autor podía enviar a revisión, pero no había forma de aprobar el libro y publicarlo al catálogo público. S71.B agrega el lado de **operaciones** dentro de Pulso (rol ADMIN) y ejecuta el **copy-on-publish** dentro de una transacción atómica.

### Backend

**Nuevo servicio:** `AuthorReviewService` dentro de `PulsoModule`. Vive ahí porque comparte la audiencia ADMIN con los reports de Eco y el overview, y reusa toda la infraestructura de RolesGuard.

**3 endpoints nuevos bajo `/api/pulso/author-requests/*`:**

```
GET    /api/pulso/author-requests?status=PENDING|ALL&limit=N
POST   /api/pulso/author-requests/:id/approve
POST   /api/pulso/author-requests/:id/reject   { feedback?: string }
```

Todos requieren `RolesGuard + @RequiredRole("ADMIN")` heredado del controller.

### Copy-on-publish dentro de `approve()`

Dentro de una sola `prisma.$transaction`:

1. **Book**: si el AuthorBook ya tiene `publishedBookId` → `book.update` (republish flow). Si no → `book.create` con slug único derivado del título (kebab-case + `-2`, `-3` en caso de colisión).
2. **BookAuthor**: `upsert` por slug del nombre del autor. Si ya existe el BookAuthor para ese autor (republish), reusa.
3. **Chapter wipe + recreate**: `chapter.deleteMany({ bookId })` para evitar conflictos de orden, luego crea uno por cada `AuthorBookChapter` visible (`isHidden=false`).
4. **ChapterBlock**: para cada chapter, mapea los blocks del JSON al schema del lector (`ChapterBlockKind` enum). Kinds soportados: `PARAGRAPH`, `HEADING`, `QUOTE`, `PAUSE`, `EXERCISE`.
5. **AuthorBook**: `status="PUBLISHED"`, `publishedBookId=book.id`, `publishedAt=now`.
6. **AuthorPublicationRequest**: `reviewState="APPROVED"`, `reviewedBy=adminUserId`, `reviewedAt=now`.

Si CUALQUIER paso falla, toda la transacción rollback.

### `reject()` con feedback opcional

Pasa el AuthorBook de `IN_REVIEW → DRAFT` y marca el request como `REJECTED` con `feedback` editorial visible para el autor en `/api/autor/libros/:id/publicacion`. El autor puede corregir y re-enviar.

### Validaciones del approve

- `REQUEST_NOT_FOUND` (404)
- `REQUEST_ALREADY_DECIDED` (409) — el request no está PENDING
- `BOOK_NOT_IN_REVIEW` (409) — el AuthorBook pasó a otro estado entre el submit y el approve
- `MIN_CHAPTERS_NOT_MET` (400) — menos de 3 capítulos visibles (segunda barrera; la primera está en `AuthorService.submitForReview`)
- `AUTHOR_NOT_FOUND` (404) — defensive guard

### Tests (+17)

- `listRequests` — PENDING default, ALL filter, shape mapping.
- `approve` error paths — 404 not found, 409 already decided, 409 wrong status, 400 min chapters.
- `approve` happy path — Book created, 3 Chapters created, 2 ChapterBlocks created (correspondiendo al chapter con blocks), AuthorBook + request actualizados con `reviewedBy`.
- `approve` republish — cuando `publishedBookId` set, llama `book.update` en lugar de `book.create`.
- `reject` — 404, 409, transición IN_REVIEW → DRAFT.
- `kebabize` helper — diacritics, punctuation, leading/trailing dashes, garbage, cap a 60 chars.

---

## Decisiones

1. **AuthorReviewService dentro de PulsoModule** (en lugar de un PulsoAuthorModule separado) — mismo target de audiencia ADMIN + ya tiene RolesGuard configurado.
2. **Transacción única en `approve`** — el copy-on-publish no debe poder dejar estado inconsistente. Si crea Book + Chapter pero falla al crear ChapterBlock, rollback.
3. **Chapter wipe + recreate (no upsert)** — el autor puede agregar/quitar capítulos entre revisiones; mantener consistencia exacta es más simple que un diff.
4. **Slug colisión con `-2`, `-3`...** — patrón común; max 100 intentos, fallback a sufijo random. Esto cubre el caso del autor que sube dos libros con el mismo título.
5. **`reject` regresa a DRAFT (no a "REJECTED" sticky)** — el autor puede corregir y re-enviar sin crear un AuthorBook nuevo. El audit trail vive en `AuthorPublicationRequest` rows.
6. **`MIN_CHAPTERS_NOT_MET` como segundo gate** — la primera barrera está en `submitForReview` (S71), pero entre el submit y el approve el autor podría cambiar visibilidad de capítulos. Re-validar es barato.
7. **`feedback` opcional en `reject`** — algunos rechazos son por contenido sensible (no hay nada que el autor pueda hacer). Forzar feedback empujaría a ops a escribir basura.
8. **Sin notificación email al autor** post approve/reject — sprint propio (BullMQ job que respeta `weeklyReport`/`dailyReminder` settings).

---

## Privacy

- ADMIN-only doble gate (backend `RolesGuard + @RequiredRole`).
- El response del list expone `book.author.email` — necesario para que ops contacte al autor. Si UE GDPR o LATAM data residency se vuelven blocker, se mueve el response a un masking helper en sprint propio.
- ChapterBlock content del AuthorBook se copia tal cual al `Book` público — el autor consintió al subirlo, no hay cripto E2E (libros son contenido público licenciado).

---

## Smoke verification (local)

- API typecheck OK.
- API lint clean (4 warnings preexistentes, sin errores nuevos).
- API tests 557/558 (+17, 1 skipped sentinel).
- 3 nuevos endpoints `/api/pulso/author-requests/*` mapeables en runtime.

---

## Deuda técnica abierta

- **Notificación al autor** post approve/reject (BullMQ job).
- **`/api/autor/cobros`** — revenue share (S71.C).
- **AI helpers** con SSE (`POST /libros/:id/ai-help`) — S71.C.
- **Audio + cover image multipart upload** — S71.C.
- **`Chapter.durationMinutes`** queda en null al copy-on-publish (el AuthorBookChapter no lo tiene). Cuando audio upload aterrice, se llena.
- **Web admin UI** para listar + approve/reject — sprint S71.B-front.
- **Promotion del rol USER → AUTHOR** vía endpoint admin (hoy solo se hace por SQL directo).
- **`Book.plan` default `FREE`** post-promotion — admin puede shift via endpoint propio (no existe aún). Cuando se haga, agregar al checklist UI.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Deploy a Railway (migración no aplica, sin cambios al schema en S71.B).
3. Crear un AUTHOR de prueba via SQL (railway login + UPDATE), correr el flow completo: create book → fill 3 chapters → submit → approve via admin → verificar que aparece en `GET /api/books`.

Después: S71-front (Editor UI completo) o S71.C (cobros + AI helpers + uploads).
