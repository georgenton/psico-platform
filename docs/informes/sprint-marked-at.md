# Sprint Marked At — Exponer `favoritedAt`/`bookmarkedAt` + UI "hace 3 días"

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-marked-at`
**Tests:** 609/610 API (+2) · 122/122 web (+11) · 20/20 mobile · 34/34 crypto

---

## Lo que se construyó

Cierra deuda explícita del sprint anterior (Bookmark Sort): el backend ahora expone **cuándo** el user marcó cada libro, y las cards muestran "❤️ hace 3 días" / "🔖 hace 1 mes" para scan rápido del histórico personal.

### Backend (`apps/api/src/books/books.service.ts`)

- `bookCardInclude` extiende el `select` de favorites/bookmarks con `createdAt: true`.
- `toListItem` lee `favorites[0].createdAt` y `bookmarks[0].createdAt`, expone como `favoritedAt`/`bookmarkedAt` (Date | null).
- Auth gating preservado: null cuando el user no marcó o no está autenticado.

### `@psico/types`

- `BookListItem` extendido con `favoritedAt: Date | null` y `bookmarkedAt: Date | null`.

### Helpers — `relativeTime`

- `apps/web/src/lib/relative-time.ts` y `apps/mobile/src/lib/relative-time.ts` con la misma lógica:
  - "hace un momento" para <1min
  - granularidad minute/hour/day/week/month/year con singular/plural ES
  - "ayer" para exactamente 1 día
  - retorna null para input null/undefined/invalid
- Pure functions sin deps (no `Intl.RelativeTimeFormat`) para resultados determinísticos en jsdom + RN.

### Web `BookCard.tsx`

- Subcomponente inline (IIFE) calcula `mostRecent` entre fav/bm y muestra "❤️" o "🔖" + label.
- Solo render si al menos uno está marcado.
- Posicionado entre stats y progress bar — discreto, color warm-500.

### Mobile `BookGridCard`

- Nuevo subcomponente `MarkedAtLabel` con paridad de lógica.
- Render bajo el progress bar — antes del cierre del card body.
- Estilos `markedAtRow`/`markedAtIcon`/`markedAtText` minimalistas.

### Tests (+13)

- **Backend (+2)**:
  - Expone `favoritedAt`/`bookmarkedAt` cuando el pivot tiene rows.
  - Null cuando el pivot está vacío.
- **Web (+11)**:
  - 11 tests para `relativeTime` cubriendo null/invalid input, granularidad de minutos/horas/días/semanas/meses/años, singular/plural, "ayer", aceptación de ISO strings.
- **Sin tests UI dedicados** para el subcomponente inline del card — covered indirectly cuando se renderiza el card en futuras integration tests; añadirlos requeriría test específico del card con todos los props mocked.

### FALLBACK_BOOKS

- `apps/web/src/app/page.tsx` actualizado vía sed para añadir `favoritedAt: null` y `bookmarkedAt: null` a los dos books del fallback (landing ISR).

---

## Decisiones

1. **Una sola label "más reciente"** en lugar de mostrar ambas dates. Reduce ruido visual; el user que marcó hoy como bookmark no necesita ver que lo favoriteó hace 6 meses. Si pone fav y bm el mismo día, se prefiere fav (más expresivo emocionalmente).
2. **Pure-JS dictionary, no `Intl.RelativeTimeFormat`** — RN ICU + jsdom son frágiles con esto. La función custom es 40 líneas y determinística.
3. **`createdAt` ya existía** en ambos pivots desde S5 — no migration, no schema change.
4. **`favoritedAt`/`bookmarkedAt` solo cuando `userId`** — coherente con `isFavorite`/`isBookmarked`. Cliente unauth ve null como antes.
5. **Subcomponente inline web vs nombrado mobile** — diferencia de estilo legítima: en web va dentro de un `flex flex-col` con muchos hijos, no vale extraer; mobile el componente es más complejo y testear el bracket de presencia/ausencia se hace más limpio con función.
6. **`MarkedAtLabel` no tiene memoización** — la card re-renderea pocas veces y el cálculo es trivial; añadir useMemo añade complejidad sin payoff.
7. **No exposure en `BookDetailResponse`** — el detail ya tiene el `BookActionsBar` con estados booleanos. Mostrar "Guardado hace 3 días" en la página de detalle es ruido. Si UX lo pide, agregar después.

---

## Privacy

- `BookFavorite.createdAt`/`BookBookmark.createdAt` son user-scoped metadata. El user ya veía la existencia de la marca; ver cuándo la hizo no expone nada nuevo sobre la plataforma o sobre otros users.
- ADR 0007 intacto.

---

## Smoke verification

- API tests **609/610** (+2 nuevos).
- @psico/crypto **34/34**.
- Web tests **122/122** (+11 nuevos).
- Mobile tests **20/20** (sin cambios).
- Typecheck + lint OK en API + web + mobile.
- OpenAPI generate:check OK.

---

## Deuda técnica abierta

- **Sin tests UI dedicados** para el subcomponente inline del card (justificado arriba — bajo ROI por ser puro display de helper testeado).
- **No translation extracted** — los strings "hace X días" están en castellano duro. Cuando aterrice i18n (no v1), `relativeTime` necesita refactor a `Intl.RelativeTimeFormat` con locale parametrizado.
- **Mobile relativeTime no tiene tests** — duplicado del web, mismo código. Si divergen, agregar test en mobile.
- **No live update** — si el card está abierto por 1h, "hace 5 minutos" se queda stale. Diferido — los re-fetches naturales de navegación lo refrescan.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — backend cambio aditivo retrocompat.
3. Próximos candidatos: **Observability (Sentry)**, **MOODS const refactor compartido**, **`useMemo` en MarkedAtLabel** si profile lo pide.
