# Sprint S67 — Terapia frontend web (Hub + Directorio + Perfil + Mis sesiones)

**Fecha:** 2026-06-09
**Rama:** `feature/sprint-s67-terapia-web`
**Tests:** API 509/510 + crypto 34/34 + web 50/50 (sin tests UI nuevos en este sprint)

---

## Lo que se construyó

Primer frontend de Terapia. Cubre las 4 pantallas más críticas para que un user pueda **encontrar terapeuta + revisar sus sesiones** sin necesidad de reservar/video (eso es S67.B).

### Cliente API

`packages/api-client/src/terapia.ts` con **24 métodos** que mapean 1:1 los endpoints del backend Terapia. Exportado vía `index.ts`.

### 4 Server Component pages

```
apps/web/src/app/dashboard/terapia/
├── page.tsx                                    # Hub (landing)
├── terapeutas/page.tsx                         # Directorio paginado + filtros
├── terapeutas/[id]/page.tsx                    # Perfil con bio + policies + horarios + reviews
└── sesiones/page.tsx                           # Mis sesiones (upcoming + past)
```

### Componentes

- `TherapistCard.tsx` — Card reusable para directorio + hub
- `FavoriteButton.tsx` — Client Component con optimistic toggle + useTransition

### Server actions (`actions/terapia.ts`)

- `toggleTherapistFavoriteAction` — con `revalidatePath` del directorio + detalle
- `cancelSessionAction` — preparado para S67.B

### Sidebar nav

Agregado item "💬 Terapia" entre Patrones y Mi plan.

### Cliente regenerado

`@psico/api-client` ahora pesa 126.17 KB (era 103.8 KB). Tipos generados al día.

---

## Decisiones

1. **Server Components + zero-JS por defecto** — toda la navegación (filtros, sort, paginación) usa `<Link>` con querystrings. Solo `FavoriteButton` es Client Component porque requiere optimistic update.
2. **`Promise.all` en cada page** — Hub paraleliza `/hub` solo (1 fetch); Detalle paraleliza `/therapists/:id` + `/reviews` (2 fetches en paralelo); Directorio paraleliza `/therapists` + `/filters`.
3. **`isNextThrow + serverFetch`** — patrón ya establecido para auto-redirect on 401. Errores no-auth muestran `loadError` inline.
4. **Filtros via querystring solo** — `?motivo=ansiedad&sort=rating&page=2`. Sin estado client-side. Page count rebuild en cada change.
5. **Pagination con `<Link>` simple** — anterior/siguiente. Sin saltos directos a página N para evitar overengineering.
6. **CoverToken → CSS gradient inline** — 5 tokens hardcoded en cada page que renderiza covers (Directorio + Hub + Detalle). Refactorable a un helper en S67.B si crece.
7. **`StatusBadge` con tabla de configs** — colors + labels en un object map. Fácil agregar nuevos estados.
8. **Sin tests UI nuevos** — los components son simples y mayormente Server Components. Cuando S67.B agregue forms más complejos (Reserva 3-pasos, Feedback modal) los testeamos.

---

## Estados visuales cubiertos

- Hub: empty (sin sesiones) + con nextSession + con activeTherapist + con prescriptions
- Directorio: empty (filtros sin matches) + grid + paginación
- Perfil: con bio completa + horarios + reviews + favorito on/off
- Mis sesiones: empty + con upcoming + con past + status badge + payment pending

---

## Smoke verification

- Web typecheck OK
- Web lint clean
- Web build OK (24 páginas pre-rendered, las 4 nuevas como `force-dynamic`)
- API tests 509/510 (sin cambios)
- Crypto 34/34

---

## Deuda técnica abierta

- **Reserva 3-pasos** (`/dashboard/terapia/reservar/:therapistId`) — S67.B
- **Pre-sesión** (`/dashboard/terapia/sesiones/:id/preparar`) con cripto E2E intention — S67.B
- **Sala video** (`/dashboard/terapia/sesiones/:id/sala`) con Daily.co iframe — S67.B + DAILY_API_KEY
- **Post-sesión feedback modal** — S67.B
- **Notificaciones inline** + `/dashboard/terapia/notificaciones` — S67.C
- **Prescripciones** UI con toggle completed — S67.C
- **Detalle de sesión** `/dashboard/terapia/sesiones/:id` — placeholder por ahora (sidebar nav lo mostraría)
- **Cancel/reschedule UI** en la lista de sesiones — S67.C
- **Crisis page real** `/dashboard/terapia/crisis` consumiendo `/api/terapia/crisis` — S67.C
- **Tests UI** con Vitest + RTL para los 4 pages — sprint propio cuando crezca
- **Avatar real** en `TherapistCard` (hoy renderiza initials) — hay `avatarUrl` en el shape pero ningún terapeuta seed lo tiene poblado

---

## Próximo sprint

**S67.B — Reserva + Pre-sesión + Sala + Post-sesión** (UI crítico para que el flow termine):
- 3-pasos: modality → slot → confirm (Stripe redirect)
- Pre-sesión con composer cifrado de intention
- Sala con Daily iframe wrapper (gated por window check)
- Post-sesión modal con rating + tags + note cifrado

**S67.C — Lifecycle UI:**
- Notificaciones page
- Prescripciones page
- Crisis page
- Detalle de sesión con cancel/reschedule
