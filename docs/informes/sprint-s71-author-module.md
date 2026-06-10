# Sprint S71 — Editor de autor (B2B) — backend core

**Fecha:** 2026-06-10
**Rama:** `feature/sprint-s71-author-module`
**Tests:** 540/541 API (+16 nuevos · 1 skipped sentinel)
**Design handoff:** [docs/design/handoff/16-author.md](../design/handoff/16-author.md)

---

## Lo que se construyó

Primera entrega de la pieza B2B del producto: el Editor de autor. Es un *producto distinto* — un autor crea su libro en una workspace separada, lo somete a revisión y, una vez aprobado, el contenido se promueve al catálogo público.

### Schema

3 modelos + 1 enum nuevos:

- **`AuthorBook`** — workspace book, distinto del `Book` público. Status `DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED`. `publishedBookId` opcional (FK al `Book` real cuando se publica). `submittedAt` para Pulso.
- **`AuthorBookChapter`** — capítulo en edición con `blocks: Json` (mismo shape que `ChapterBlock` del lector). `version Int` incremental para optimistic concurrency.
- **`AuthorPublicationRequest`** — audit trail de cada submit, con `reviewState` (PENDING / APPROVED / REJECTED) + `feedback` editorial.
- **`AuthorBookStatus` enum** + agregado `AUTHOR` al enum `Role`.

Migración aditiva: `20260610220000_s71_author_module/migration.sql`.

### Module + Controller

`AuthorController` bajo `/api/autor/*`. Todos los endpoints requieren `JwtAuthGuard + RolesGuard + @RequiredRole("AUTHOR")`. Ownership check explícito en service (un autor no puede tocar libros de otro).

12 endpoints implementados:

```
GET    /api/autor/dashboard
POST   /api/autor/libros
GET    /api/autor/libros/:id
PATCH  /api/autor/libros/:id
DELETE /api/autor/libros/:id                (archive)
GET    /api/autor/libros/:id/capitulos/:n
PATCH  /api/autor/libros/:id/capitulos/:n   (con expectedVersion)
PATCH  /api/autor/libros/:id/estructura     (drag-reorder + add + delete atómico)
GET    /api/autor/libros/:id/publicacion    (checklist)
POST   /api/autor/libros/:id/publicar       (submit to review)
POST   /api/autor/libros/:id/despublicar
```

### Service highlights

1. **`createBook`** crea un capítulo placeholder al instante para que el editor del cliente tenga algo que abrir (UX más limpia que un dashboard con "0 capítulos").
2. **`updateChapter` con optimistic concurrency**: el cliente envía `expectedVersion`. Si el server tiene una versión distinta, 409 con `{code: "CHAPTER_VERSION_CONFLICT", currentVersion, sentVersion}`. El cliente muestra el modal "Hay otra sesión abierta. Última actualización por …" del handoff §editor.
3. **`updateStructure` two-phase** dentro de una transaction: primero mueve todos los capítulos existentes a `n` negativos, luego asigna los `n` finales. Esto evita colisiones de la `@@unique([bookId, n])`. Drag-reorder + rename + delete + add en una sola operación atómica.
4. **`submitForReview` con validaciones**: rechaza si <3 capítulos visibles o si `summary < 50` chars. Crea `AuthorPublicationRequest` row + cambia `status` en una `$transaction` atómica.
5. **`getDashboard`** retorna `author + books + aiHelpers + publicationSteps` por una sola llamada (siguiendo patrón de `/api/home` y `/api/terapia/hub`).
6. **`getPublicationState`** calcula los 4 blockers reales: portada, mínimo de capítulos, resumen, términos (este último es client-side por ahora).

### Tests (+16)

- `getDashboard` happy path + USER_NOT_FOUND.
- `createBook` con placeholder chapter.
- Ownership guard (404 en libro de otro autor, 404 en inexistente, 200 cuando coincide).
- `updateChapter`: increment, 409 conflict, sin `expectedVersion` (no chequeo), 404 capítulo inexistente.
- `updateStructure`: 400 numbering inválido, deleteMany cuando se quita un capítulo.
- `submitForReview`: 400 sin mínimo de capítulos, 400 summary corto, 409 cuando no está DRAFT, transaction OK.
- `archiveBook`: no-op si ya está archivado, set ARCHIVED + archivedAt.

---

## Decisiones

1. **AuthorBook separado de Book** — el catálogo público es read-only para los lectores; un AuthorBook en `DRAFT` no debe aparecer ahí. La promoción `AuthorBook → Book` se hará explícita cuando se apruebe la review (lógica del admin / Pulso v2).
2. **Optimistic concurrency con `version` en chapter, no en book** — la mayoría de los conflictos serán a nivel capítulo (dos pestañas editando el mismo capítulo). Book meta cambia poco y no justifica el overhead.
3. **`expectedVersion` opcional** — autosave puede saltarse el check; el editor manual lo usa siempre.
4. **`updateStructure` atómico** — drag-reorder del UI del editor genera muchos micro-cambios; mejor un solo POST con el árbol completo.
5. **DELETE = archive (soft delete)** — no hard delete: el autor podría querer un libro de vuelta. v2 podría agregar un endpoint `DELETE /libros/:id?hard=true` con un confirmation gate.
6. **`publicar` no copia a Book automáticamente** — un autor "publica" pero el contenido necesita aprobación del admin. La promoción al catálogo es responsabilidad del admin (S71.B / Pulso v2).
7. **No AI helpers, no audio upload, no cover image upload, no /cobros** — son scopes propios (SSE streaming + multipart + revenue share lógica). Diferidos.

---

## Smoke verification (local)

- API typecheck OK.
- API lint clean (4 warnings preexistentes, sin errores nuevos).
- API tests 540/541 (1 skipped sentinel).
- Migración syntax OK (`prisma generate` corre limpio).

---

## Deuda técnica abierta

- **Promoción AuthorBook → Book** al publicar (copy-on-publish): hoy `submitForReview` deja la fila en IN_REVIEW. Un admin tiene que hacerlo manualmente vía SQL. S71.B aterriza el endpoint admin `POST /api/pulso/author-requests/:id/approve` que ejecuta el copy.
- **AI helpers** con SSE (`POST /libros/:id/ai-help`): integrarlos con `AIService.generateWeeklyNarrative` reuse. S71.B.
- **Audio upload + cover image upload** (multipart a R2). Requiere reusar `StorageModule`. S71.B.
- **Version snapshots automáticos cada 5 min** — actualmente cada PATCH bumps `version`, pero no guardamos snapshots completos. v2 con BullMQ scheduler.
- **`/api/autor/cobros`** (revenue share) — finanzas, deferred.
- **Front del Editor de autor** (web). Sprint propio S71-front.
- **Seed de un AUTHOR de prueba** para QA — `prisma db seed` no crea AUTHOR; hay que crear manualmente vía SQL o el endpoint admin de promover roles (no existe aún).
- **Tests E2E con supertest** — los unit tests cubren la lógica; nada todavía valida la combinación con guards.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Deploy a Railway (la migración aditiva pasa sin problema).
3. Verificar smoke: `GET /api/autor/dashboard` con un usuario USER → 403 FORBIDDEN. Con un usuario promovido a AUTHOR → 200.

Después de eso, **S71.B** (AI helpers + audio/cover upload + admin promotion endpoint) o S72.
