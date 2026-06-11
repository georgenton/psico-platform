# Sprint S71-front — Workspace web del Editor de autor

**Fecha:** 2026-06-10
**Rama:** `feature/sprint-s71-front-author-workspace`
**Tests:** 56/56 web (sin cambios) · 557/558 API · 34/34 crypto
**Backend de referencia:** [S71](sprint-s71-author-module.md) + [S71.B](sprint-s71b-author-promotion.md)
**Design handoff:** [docs/design/handoff/16-author.md](../design/handoff/16-author.md)

---

## Lo que se construyó

Cierra el loop visual del módulo Author B2B. Hasta aquí los endpoints estaban vivos pero el autor solo podía usarlos vía curl. Ahora hay un workspace web completo bajo `/autor/*`, separado del `/dashboard/*` del consumer (decisión del diseño: producto distinto, auth+lifecycle propios).

### Rutas nuevas

```
/autor                              → layout (gate AUTHOR-only)
/autor/dashboard                    → lista de libros + Nuevo libro
/autor/libros/[id]                  → meta editor + sidebar capítulos + checklist publicación
/autor/libros/[id]/capitulos/[n]    → chapter editor por bloques
/autor/libros/[id]/estructura       → reordenar/renombrar/ocultar/Pro/eliminar
```

### Componentes nuevos

**Dashboard:**
- `NewBookButton.tsx` — Client Component con state `closed → input → submitting`. Crea el libro y redirige a `/autor/libros/:id`.

**Libro (meta + checklist):**
- `BookMetaForm.tsx` — title · subtitle · summary · cover token. Banner "frozen" cuando status ∈ {IN_REVIEW, ARCHIVED}.
- `PublicationCard.tsx` — sidebar con checklist (`✓` para los blockers cumplidos), botón "Enviar a revisión" (disabled si !allDone), branch para PUBLISHED ("Despublicar") y feedback editorial visible cuando reviewState === REJECTED.
- `ArchiveButton.tsx` — confirmación in-place + delete (soft-archive).

**Capítulo (editor de bloques simple):**
- `ChapterEditor.tsx` — title + subtitle + array de bloques `{kind, content}`. 5 kinds soportados (paragraph/heading/quote/pause/exercise). Move ↑↓ + eliminar + añadir. Concurrencia optimista via `expectedVersion`: si el server tiene una versión más nueva, muestra banner para recargar.

**Estructura:**
- `StructureEditor.tsx` — drag-reorder simulado con `↑↓` (sin DnD library en v1). Add + remove + rename + toggle hidden + toggle Pro. POST atómico con `{chapters: [{n, title, subtitle, isLocked, isHidden}]}`.

### Server actions

7 acciones en `apps/web/src/app/autor/`:
- `createBookAction(title)` — dashboard.
- `updateBookAction(bookId, body)` — meta del libro.
- `archiveBookAction(bookId)` — soft delete + redirect.
- `updateChapterAction(bookId, n, body)` — incluye `expectedVersion`.
- `updateStructureAction(bookId, body)` — reorder/add/remove en una sola op.
- `submitForReviewAction(bookId)` → POST `/publicar`.
- `unpublishAction(bookId)` → POST `/despublicar`.

Todas hacen `revalidatePath` después del backend OK.

### Cliente API

- `packages/api-client/src/author.ts` — nuevo `authorApi` con 10 métodos.
- Export en `packages/api-client/src/index.ts`.

### Tipos compartidos

`@psico/types` +14 tipos:
- `AuthorBookStatus`, `AuthorDashboardBook`, `AuthorDashboardResponse`.
- `CreateAuthorBookRequest`, `CreateAuthorBookResponse`.
- `AuthorBookChapterSummary`, `AuthorBookDetail`, `UpdateAuthorBookRequest`.
- `AuthorChapterBlockDto`, `AuthorBookChapter`, `UpdateAuthorChapterRequest`.
- `UpdateAuthorStructureItem`, `UpdateAuthorStructureRequest`.
- `AuthorPublicationStep`, `AuthorPublicationState`.

También extendido `UserRole` con `"AUTHOR"` (faltaba — el backend ya lo tenía en el enum Prisma desde S71, pero el front no lo había sincronizado).

---

## Decisiones

1. **Workspace separado `/autor/*`** (no nested dentro de `/dashboard`) — el handoff dice "producto distinto, lifecycle propio". Layout diferente (header simple + link "Ir al consumer" para crossover).
2. **Editor de bloques simple, no slash menu Notion-like** — el handoff describe el ideal; v1 entrega lo achievable. Cada bloque es `<select kind> + <textarea>` con move↑↓ + remove. Slash menu queda como S71-front-B.
3. **Sin autosave cada 10s** — botón "Guardar capítulo" explícito. El autosave automático + indicador "Guardando…" persistente requiere debounce + race-condition handling. Diferido.
4. **Sin drag-drop real** — `↑↓` simulan reorder. DnD library (dnd-kit / Pragmatic) tiene fricción mobile y peso. Diferido.
5. **Concurrencia optimista con `expectedVersion`** — si conflict, mostramos banner para recargar en lugar de hacer merge automático.
6. **Banner "frozen"** cuando el libro está en IN_REVIEW o ARCHIVED — todos los formularios disabled.
7. **`UserRole` enum sincronizado** — agregué "AUTHOR" al type del front para evitar otro round-trip de typing.
8. **Sin frontend "Mi cuenta" del autor** — los autores comparten cuenta con el consumer; `/autor` solo necesita gate por role, no auth propio. UI de cobros/perfil B2B diferida.

---

## Smoke verification (local)

- Web typecheck OK.
- Web lint clean.
- Web tests 56/56 (sin cambios).
- API tests 557/558.
- @psico/types build OK (53.7 KB).
- @psico/api-client build OK (128 KB).

---

## Deuda técnica abierta

- **Autosave cada 10s** + indicador "Guardando…" persistente — sprint propio.
- **Slash menu Notion-like** para insertar bloques tipo `/heading`, `/quote`, etc.
- **Drag-drop real** con dnd-kit para reorder de bloques + de capítulos.
- **AI helpers** (`/api/autor/libros/:id/ai-help`) — backend no existe aún (S71.C). UI lo aterrizará después.
- **Audio upload + cover image upload** — backend pendiente (S71.C).
- **Page de cobros** (`/autor/cobros`) — backend pendiente.
- **Mobile companion** — Editor de autor es desktop-first (decisión del handoff §editor); si LATAM lo pide, sprint propio.
- **Tests UI dedicados** para `ChapterEditor` y `StructureEditor` — diferidos, cubiertos por integration manual.
- **`/autor` redirect cuando no-AUTHOR** — actualmente redirige a `/dashboard`. Podría mostrar mensaje educativo "Te falta el rol de autor" en lugar de silencio.
- **Pestaña en `/dashboard` con link a `/autor`** para usuarios que tienen ambos roles (un USER que también es AUTHOR).

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Deploy a Vercel.
3. Promover un usuario a AUTHOR vía SQL en Railway + login.
4. Smoke walk: `/autor/dashboard` → Nuevo libro → editar 3 capítulos → enviar a revisión → como ADMIN aprobar via `/dashboard/admin/author-requests` → verificar que el libro aparece en `/dashboard/biblioteca`.

Después: S71.C (cobros + AI helpers + uploads multipart) o un sprint nuevo.
