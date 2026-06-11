# Sprint Bookmark Sort — Ordenar favoritos/guardados por recency

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-bookmark-sort`
**Tests:** 607/608 API (+3 net) · 111/111 web · 20/20 mobile · 34/34 crypto

---

## Lo que se construyó

Cierra deuda S5/Bookmarks-UI. Cuando el user filtra biblioteca por `view=favoritos` o `view=guardados`, los libros ahora se ordenan por **cuando el user los marcó** (más recientes primero), no por `publishedAt`. UX correcto para "qué guardé hace poco" en lugar de "qué libro nuevo guardé alguna vez".

### Backend — `apps/api/src/books/books.service.ts`

`BooksService.list` ahora detecta view=favoritos/guardados con userId presente y delega a `listFromUserPivot`:

1. **Step 1 — pivot ordered + paged:** `bookFavorite.findMany`/`bookBookmark.findMany` con `orderBy: createdAt desc`, skip/take, `select: bookId`.
2. **Step 2 — books filtered:** `book.findMany` con `where: { id: { in: orderedBookIds } }` + filtros del user (q, categoryId, authorId).
3. **Step 3 — re-order in memory:** `Map<bookId, book>` + traverse `orderedBookIds` para preservar el orden del pivot.

Total cuenta filas del pivot (no de books filtrados — trade-off documentado: para v1 los favoritos/guardados son tens, no thousands, y la UX prioriza "qué marqué hace poco" sobre conteo preciso).

### Tests (+3 net)

- 2 tests viejos del where-clause (`favorites.some.userId`) reemplazados por 5 nuevos que cubren:
  - View=favoritos paginates desde el pivot ordenado por createdAt desc.
  - View=guardados igual.
  - Books regresan en orden pivot, no catalog order — verifica el re-sort en memoria.
  - Filters (q + categoryId) aplican on top of the pivot.
  - Skip/take del pivot reflejan (page-1)\*perPage.

### Sin cambios

- Schema Prisma (BookFavorite y BookBookmark ya tenían `createdAt @default(now())` desde S5).
- Sin migración.
- `@psico/types` sin cambios — el cliente sigue pidiendo `view=favoritos|guardados` exactamente igual.
- OpenAPI sin cambios.
- Frontend web/mobile sin cambios — usan el endpoint default.

---

## Decisiones

1. **Two-step query** en lugar de tratar de orderBy via Prisma relation — Prisma no soporta orderBy por agregación-de-relación-many. El two-step es el patrón canónico.
2. **Total = pivot count, no filtered book count** — acepta over-count cuando un libro favorito está despublicado o filtrado por q. Para v1 favoritos/guardados son <100, no afecta UX. v2 podría hacer un count separado.
3. **`isPublished: true` en el secondary query** — un libro despublicado no se muestra aunque esté en el pivot del user. Coherente con el resto de listings.
4. **Filters opcionales aplican sobre el pivot set** — user puede filtrar "favoritos de categoría X" o "guardados que contienen 'duelo'" sin romper el ordering.
5. **Filtered-out books simply absent, no padding** — si user marcó 24 libros pero 5 están despublicados/filtrados, la página muestra 19. No traemos más del pivot para compensar. Más simple + suficiente para v1.
6. **Sin nuevo sort enum** — el sort dropdown actual (`recent/alpha/marina`) se ignora silentemente cuando view=favoritos/guardados. El sort por "marked recently" es implícito de la view. Alternativa rechazada: añadir `"marked-recent"` al enum SORTS — innecesario porque la semántica está clara.
7. **No exposición de `markedAt`/`favoritedAt` en `BookListItem`** — sería nice-to-have para mostrar "Guardado hace 3 días" pero añade API surface. Diferido a sprint específico si la UX lo pide.

---

## Privacy

- Sin cambios de privacy. `BookFavorite.createdAt` y `BookBookmark.createdAt` son metadata ya expuesta vía pivot existence — el sort solo cambia el orden, no expone nada nuevo.
- ADR 0007 intacto.

---

## Smoke verification

- API tests **607/608** (+3 net nuevos, 0 regressions).
- @psico/crypto **34/34**.
- Web tests **111/111** (sin cambios).
- Mobile tests **20/20** (sin cambios).
- Typecheck + lint OK en API + web + mobile (4 warnings preexistentes).
- OpenAPI generate:check OK (sin cambios al wire).

---

## Deuda técnica abierta

- **Total over-count cuando hay despublicados/filtros** — aceptable v1, considerar separate count si el volumen crece.
- **No exposure de `markedAt`/`favoritedAt`** — si UX pide "Guardado hace 3 días" en cada card, añadir al `BookListItem` shape.
- **N+1 risk en books query** cuando `bookCardInclude` se ejecuta sobre el set del pivot — para Marina y libros de B2B grandes podría haber overhead. Profile cuando volumen real.
- **No tests UI para verificar el orden visual** — backend tests cubren el order; sería bueno agregar un test E2E web que abra view=guardados y assert que la card más reciente está primero. Diferido.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — backend ya estaba aceptando los queries, este es un cambio de implementación interna.
3. Próximo sprint candidato: **Exponer `markedAt`/`favoritedAt`** + UI "hace 3 días" en cards, **Observability (Sentry)**, **MOODS const refactor**.
