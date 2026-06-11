# Sprint Bookcard Indicators — Bookmark/favorito en grid card mobile

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-bookcard-indicators`
**Tests:** 604/605 API · 111/111 web · 20/20 mobile · 34/34 crypto (sin cambios — sprint UI puro)

---

## Lo que se construyó

Cierra el loop visual del sprint Bookmarks UI. El web ya tenía heart + bookmark en cada `BookCard` (línea 99-113 y 197-212 de `BookCard.tsx`). Mobile `BookGridCard` no mostraba nada: el user tenía que abrir cada detail para saber si lo había marcado. Hoy:

- **Mobile**: `BookGridCard` muestra heart + bookmark como overlay sobre la cover (top-right + bottom-right), 28x28 con background semi-transparente, hitSlop=8 para tap target generoso. Optimistic UI con rollback + sincronización con respuesta server.

### Mobile (`apps/mobile/app/(tabs)/books/index.tsx`)

- Local state `favorite`, `bookmark`, `pending` per card.
- `useEffect` sync sobre `book.id + book.isFavorite + book.isBookmarked` por si la card se reusa con otro libro al re-fetch.
- Dos `Pressable` icons absolute-positioned sobre la cover (no compiten con el `onPress` parent porque RN propaga al inner first).
- `Ionicons` `heart`/`heart-outline` + `bookmark`/`bookmark-outline` (consistencia con resto de app).
- Estilos: `coverIconBtn` base + `coverIconFav` top-right + `coverIconBm` bottom-right + bg `rgba(0,0,0,0.35)` para legibilidad sobre cualquier cover.

---

## Decisiones

1. **Overlay sobre cover (no inline en body)** — visual scan-friendly: user ve de inmediato qué libros están marcados sin tener que leer el card body.
2. **Background semi-transparente negro** — funciona sobre cualquier color de cover (lavender, sage, warm tokens, color hashes).
3. **Heart top-right, bookmark bottom-right** — refleja el patrón web (heart al lado del título, bookmark al lado del CTA). Mobile no tiene esos slots, pero el orden conceptual es el mismo.
4. **hitSlop=8** — los iconos son 28x28; con hitSlop se llega a tap target ~44x44 sin agrandar visualmente.
5. **No tap propagation hack** — RN `Pressable` inner ya consume el press antes del parent. No hace falta `e.stopPropagation`.
6. **No tests UI nuevos** — el patrón de fetch + optimistic + rollback ya está cubierto por los tests de `BookActionsBar` del sprint anterior; mobile usa la misma `booksApi.toggleFavorite/toggleBookmark` call con identical state machine. Los tests requerirían mock del icon library + Pressable que añade noise sin valor de regresión.
7. **Sin cambios web** — web `BookCard` ya tenía ambos controles desde S5-front.

---

## Privacy

- Sin cambios de schema, sin cambios de privacy. ADR 0007 intacto.

---

## Smoke verification

- API tests **604/605** (sin cambios).
- @psico/crypto **34/34**.
- Web tests **111/111** (sin cambios).
- Mobile tests **20/20** (sin cambios).
- Typecheck + lint OK en web + mobile.

---

## Deuda técnica abierta

- **No test UI dedicado** del `BookGridCard` con icons (justificado arriba — solapado con `BookActionsBar` test).
- **No overlay corner indicator en web cover** — el web ya tiene controles en el body; el overlay en cover sería redundante. Si validamos que el visual scan es lento en producción, vale la pena.
- **Iconos no animados** — un small spring animation al togglear haría el feedback más rico. No prioridad v1.
- **No multi-select bulk** — si user quiere desbookmark 10 libros, son 10 taps. Diferido hasta volumen.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante (mobile rebuild necesario para apps reales, pero sólo UI).
3. Próximo sprint candidato: **Sort por "última vez bookmarked"** (backend + UI), **Observability (Sentry)**, **MOODS const refactor**.
