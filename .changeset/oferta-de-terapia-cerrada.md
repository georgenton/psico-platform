---
"@psico/types": minor
"@psico/api-client": patch
---

La oferta de terapia se publica en el contrato, y hoy está cerrada.

- **`TherapyOfferAvailability`** y **`TherapyHistoryPresence`** — el hub, la lista
  de sesiones y el detalle de una sesión publican `offer: { open }`, y el hub
  además qué historial tiene la persona. Los clientes leen `offer?.open ?? false`.
- **`isDemo`** en `TherapistSummary` y `TherapistListItem`: una ficha de
  demostración no tiene un profesional detrás, con la oferta abierta o cerrada.
- **`avgRating`**, **`reviewsCount`** y **`licenseNumber`** admiten `null`. Una
  ficha de demostración no enseña puntuación, reseñas ni licencia, y antes el
  tipo obligaba a inventar un número.
- **`THERAPY_OFFER_CLOSED_*`** y **`THERAPY_DEMO_*`** — los dos códigos de rechazo
  y el copy que comparten el servidor, la web y el móvil.

El cliente generado declara el 503 de las rutas de oferta y el 409 sobre una
sesión de demostración.
