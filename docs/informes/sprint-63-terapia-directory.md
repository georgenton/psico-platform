# Sprint S63 — Terapia · Directorio + Perfil terapeuta + seed

**Fecha:** 2026-06-09
**Rama:** `feature/sprint-s63-terapia-directory`
**Tests:** 483/484 API + 34/34 crypto (471 → 483, +12 nuevos · 1 skipped sentinel)

---

## Lo que se construyó

Aterrizan las **pantallas 2 y 3** del diseño de Terapia (`docs/design/handoff/11-terapia.md`): Directorio paginado con filtros + Perfil de terapeuta con detalle + Reseñas + Toggle de favorito. Más seed de **6 terapeutas demo** verificados con availability semanal recurrente.

### Endpoints (5 nuevos bajo `/api/terapia/therapists/*`)

| Método | Path | Notas |
|---|---|---|
| GET | `/therapists/filters` | Catálogo de filtros con conteos calculados sobre activos |
| GET | `/therapists?motivo=&modalidad=&genero=&language=&priceMin=&priceMax=&sort=&page=&pageSize=` | Listado paginado, sort por rating/precio/popularidad, marca `isFavorite` por user |
| GET | `/therapists/:id` | Detalle con bioLong, approach, policies, availability semanal, isFavorite |
| GET | `/therapists/:id/reviews?page=&pageSize=` | Reviews paginado con `userInitials` anonimizado |
| POST | `/therapists/:id/favorite` | Toggle idempotente |

### `@psico/types` extendido

7 shapes nuevos: `TherapyFilters`, `TherapistListItem`, `TherapistListResponse`, `TherapistDetail`, `TherapistReviewItem`, `TherapistReviewsResponse`, `TherapistFavoriteToggleResponse`. Tipos van a 44.96 KB.

### Seed: 6 terapeutas demo

`Marina Quintana` (anclas + voz Eco) · `Andrea Ortiz` (pareja/familia) · `Diego Velasco` (adultos jóvenes) · `Lucía Pérez` (trauma) · `Eduardo Salinas` (adicciones) · `Camila Torres` (adolescentes). Todos verified, con `bioShort` + `bioLong` + `approach` + policies + 8 slots semanales (lunes/miércoles/viernes mañana + tarde, martes/jueves tarde, América/Guayaquil).

Idempotente (upsert + wipe-and-reinsert para availability).

### Tests (+12)

`terapia.service.spec.ts` extendido:
- listTherapists: pagination + favorites marking, filter por motivo (specialties.has), filter por price range, default sort por rating, sort price-asc.
- getFilters: aggregation across active therapists, empty price fallback to 0.
- getTherapist: 404 not found, 404 inactive, detail with availability + favorite flag.
- toggleFavorite: create when none, delete when exists, 404 therapist missing.
- listReviews: pagination + computeInitials, 404 therapist missing.

---

## Decisiones

1. **`nextSlotIso` null por ahora** — se llenará en S64 con proyección de `TherapistAvailability` sobre los próximos 14 días. Permite shipear el directorio listo para usarse sin esperar la lógica de booking.
2. **`computeFilters` en aplicación** — Postgres no agrega arrays de strings sin `unnest`. Para ~50 terapeutas activos da ~1 ms; cuando crezca a >500 evalua materializar en `BillingUsageDay`-style.
3. **`isFavorite` con una sola query Set lookup** — evita N+1 que daría usar `_count` de Prisma.
4. **Route order `/therapists/filters` ANTES de `/therapists/:id`** — el path matcher de NestJS es first-match. Sin esto, `/filters` caía en `:id` y devolvía 404 "filters not found".
5. **404 al inactive en `getTherapist`** — coincide con `listTherapists` que solo trae activos. Un terapeuta dado de baja desaparece del producto.
6. **Sort default `rating` descendente** — sesgo a "los mejor reseñados" hasta que tengamos data para A/B testear cambio de orden.
7. **Seed con 6 perfiles diversos** — cubrimos las 3 modalidades (INDIVIDUAL/COUPLE/FAMILY), 2 géneros, 4 rangos de precio ($35–$60), 8 specialties distintas para que filtros tengan opciones reales.

---

## Smoke verification

- API tests **483/484** (+12 nuevos · 1 skipped sentinel).
- Crypto tests 34/34.
- API typecheck OK.

---

## Deuda técnica abierta

- **OpenAPI regen** sigue pendiente (requiere boot de API con DB local).
- **Migración S62** + seed no aplicados en Railway (deuda acumulada).
- **`nextSlotIso` real** — S64 lo proyectará desde `TherapistAvailability`.
- **Frontend del directorio web + mobile** — sprint S67/S68 (UI).
- **TherapistReview seed** — cuando S64 introduce la primera reserva real, el primer review puede aparecer. Por ahora todos los terapeutas tienen `reviewsCount=N` hardcoded en el seed.
- **Aggregation de `avgRating` en write** — `denormalized field`, hoy no se recomputa cuando se crea una review nueva. S66 lo cierra con trigger en `createReview`.

---

## Próximo sprint

**S64 — Reserva + Pre-sesión:**
- GET `/api/terapia/therapists/:id/availability?days=14` (proyección sobre próximos 14d)
- POST `/api/terapia/bookings` con Stripe checkout
- GET `/api/terapia/sessions/:id/prep`
- PATCH `/api/terapia/sessions/:id/prep` (con intentionCiphertext E2E)
- TherapyBooking schema + migración
- Stripe wire-up (payment_intent + capture al confirmar la reserva)
