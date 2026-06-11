# Sprint Bookmarks UI — Filtrar libros por favoritos + guardados

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-bookmarks-ui`
**Tests:** 604/605 API (+3) · 111/111 web (+7) · 20/20 mobile · 34/34 crypto

---

## Lo que se construyó

Cierra el gap S5: backend tenía `POST /books/:idOrSlug/{favorite,bookmark}` toggles funcionando desde el primer sprint de books, pero la UI nunca aterrizó. Hoy:

- **Backend**: views nuevos `favoritos` y `guardados` en `GET /books?view=…`.
- **Detail page** (web + mobile): chips ❤️ Favorito y 🔖 Guardado con optimistic UI + rollback en error.
- **Biblioteca tabs** (web + mobile): 2 tabs nuevos para filtrar la lista.

### Backend (`apps/api/src/books`)

- `ListBooksQueryDto.view` extendido a `"catalogo" | "mis" | "recos" | "favoritos" | "guardados"`.
- `BooksService.buildListWhere` agrega ramas:
  - `view === "favoritos" && userId` → `where.favorites = { some: { userId } }`.
  - `view === "guardados" && userId` → `where.bookmarks = { some: { userId } }`.
- Views ignoran filtro si no hay auth (unauth = catálogo público).

### `@psico/types`

- `BookListView` extendido con los 2 nuevos valores.

### `@psico/api-client`

- `generated.ts` regenerado (101 → 103.8 KB) con el query enum nuevo.

### Web

- **`BookActionsBar.tsx`** nuevo Client Component — owns favorite + bookmark state, dispara POST con optimistic + rollback + sincroniza con la respuesta del server (`{ active }`).
- **`/dashboard/biblioteca/[idOrSlug]/page.tsx`** wireado con `<BookActionsBar>` debajo del `<BookHero>`.
- **`Filters.tsx`** extendido con 2 tabs nuevos: Favoritos, Guardados.
- **`page.tsx`** biblioteca: `view` type widened + `sectionTitle` + `EmptyResults` con copy específico por view.

### Mobile

- **`(tabs)/books/[slug].tsx`** detail: chips bookmark/favorito debajo del CTA primary. Optimistic UI + rollback. Sincronización de `detail.isFavorite/isBookmarked` via useEffect.
- **`(tabs)/books/index.tsx`** biblioteca: 2 tabs nuevos en el state machine local + empty state copy para cada uno.

### Tests UI web (+7 nuevos)

`apps/web/src/components/dashboard/detalle/__tests__/BookActionsBar.test.tsx`:

1. No renderiza nada sin token.
2. Render inicial muestra chips con labels correctos.
3. `initialFavorite=true` refleja en aria-pressed.
4. POST a `/books/:slug/favorite` con headers correctos + label switch.
5. POST a `/books/:slug/bookmark`.
6. Rollback + error inline cuando el fetch falla.
7. Reply autoritativo `{ active: false }` del server desplaza el optimistic flip.

### Tests API (+3 nuevos)

`apps/api/src/books/books.service.spec.ts`:

1. `view=favoritos` aplica `where.favorites.some.userId`.
2. `view=guardados` aplica `where.bookmarks.some.userId`.
3. `view=favoritos` con userId=null NO aplica filtro (unauth fallback).

---

## Decisiones

1. **Sin componente compartido para chips mobile** — los chips bookmark/fav viven inline en `[slug].tsx`. Si reusamos en book cards, refactor (deuda).
2. **Optimistic UI con sincronización autoritativa** — flippea inmediatamente, luego usa `{ active }` del server. Si fetch falla, rollback al estado anterior + error inline.
3. **`view=favoritos` ignora silently para unauth** — más simple que 401. Catálogo público se beneficia de eso (no rompe demos).
4. **Tabs en orden Catálogo → Mis libros → Favoritos → Guardados → Sugerencias** — el orden refleja la frecuencia de uso esperada (Mis libros + Favoritos son lo que un user vuelve a abrir).
5. **EmptyState con CTA-friendly copy** — "Marca el corazón para que aparezca aquí" en lugar de mensaje genérico.
6. **`Filters.tsx` tabs ahora son 5** — se puede saturar visualmente en mobile responsive. Vale la pena testear en producción; si saturan, scrollable horizontal.
7. **No icon-only en web** — chip con label texto + emoji. Tap target generoso.

---

## Privacy

- `BookFavorite` y `BookBookmark` ya existen desde S5 — sprint solo wirea UI. Sin cambios de schema, sin cambios de privacy.
- ADR 0007 intacto.

---

## Smoke verification

- API tests **604/605** (+3 nuevos).
- @psico/crypto **34/34**.
- Web tests **111/111** (+7 nuevos).
- Mobile tests **20/20** (sin cambios).
- Typecheck + lint OK en API + web + mobile.
- OpenAPI generate:check OK (después de regen).

---

## Deuda técnica abierta

- **No bookmark/favorite icon en `BookCard`** (grid del catálogo) — un visual indicator inline ahorraría un tap (user ve si ya lo tiene marcado sin abrir el detail).
- **No sorting por "última vez bookmarked"** — los views nuevos usan el sort default (publishedAt desc); sería más útil ordenar por cuando el user lo guardó.
- **No bulk actions** — admin / user no puede limpiar todos los bookmarks de una vez. Add cuando duela.
- **Cliente OpenAPI generado regenera `generated.ts` solo cuando dev server boota** — no es automático en CI (el openapi-diff workflow ya lo enforce, así que no hay drift silencioso).
- **Mobile podría tener filter chips no view tabs** — 5 tabs en mobile pueden saturarse. Alternativa: dropdown con view options o reordenar como filter chips horizontales.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy (sin nuevos endpoints; el query param ya válido en producción desde S5 — el cliente acepta ahora solo lo ignoraba antes).
3. Próximo sprint candidato: **Observability (Sentry)**, **MOODS const refactor**, **icon de bookmark en BookCard**.
