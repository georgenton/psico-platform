# 09 · Mi Plan

`Mi Plan.html` — pantalla unificada de planes, estado de suscripción, facturas. Estados: Free, Pro Mensual, Pro Anual, Pro Cancelando.

---

## Pantalla: Mi Plan · Free (paywall + comparativa)

**Ruta sugerida:** `/plan`

### Datos que muestra

- `user.tier`: "free"
- `plans[]`: array
  - `id`: enum ("free" | "pro-monthly" | "pro-yearly")
  - `label`: string ("Gratuito" | "Pro mensual" | "Anual")
  - `priceUsd`: number (0, 7, 60)
  - `priceLabel`: string ("Gratis" | "$7 / mes" | "$60 / año")
  - `savings`: string (opcional, "Ahorra 30%")
  - `features[]`: string[]
  - `recommended`: boolean
- `compare[]`: array — tabla comparativa
  - `feature`: string
  - `free`: enum ("yes" | "no" | "limited") | string (cantidad)
  - `pro`: enum
- `faq[]`: array
  - `q`: string
  - `a`: string
- `testimonials[]`: array (opcional)
- `trust[]`: array — sellos de confianza (privacidad, cancelar cuando quieras)

### Acciones del usuario

- **Empezar 7 días gratis** (Pro): inicia checkout Stripe.
- **Toggle mensual/anual**: estado local.
- **Expandir FAQ**: estado local.
- **Continuar con free**: cierra pantalla / vuelve a inicio.

### Llamadas HTTP

- **Método:** GET — `/api/plan` — Auth: Sí — devuelve estado actual + planes disponibles
- **Método:** POST — `/api/billing/checkout-session` — Auth: Sí
  - **Request:** `{ planId: "pro-monthly" | "pro-yearly", trialDays?: number }`
  - **Response:** `{ checkoutUrl: string }` — redirige a Stripe Checkout
- **Método:** GET — `/api/billing/return?session_id=` — Auth: Sí — callback de Stripe
  - **Response:** `{ ok: true, tier: "pro", subscription }`

### Estados

- **Loading:** skeleton de cards de planes.
- **Error en checkout:** muestra error de Stripe + retry.
- **Empty:** N/A.

---

## Pantalla: Mi Plan · Pro (estado activo)

**Ruta sugerida:** `/plan` (cuando `tier="pro"`)

### Datos que muestra

- `user.tier`: "pro"
- `subscription`:
  - `id`: string
  - `planId`: enum
  - `status`: enum ("active" | "trialing" | "past_due" | "cancelling")
  - `startedAt`: Date
  - `currentPeriodEnd`: Date
  - `cancelAtPeriodEnd`: boolean
  - `paymentMethod`:
    - `brand`: enum ("visa" | "mastercard" | "amex" | "other")
    - `last4`: string
    - `expMonth`: number
    - `expYear`: number
- `invoices[]`: array (últimas 12)
  - `id`: string
  - `date`: Date
  - `amountUsd`: number
  - `status`: enum ("paid" | "open" | "void" | "uncollectible")
  - `pdfUrl`: string (signed)
- `usage`:
  - `booksCompletedThisMonth`: number
  - `ecoMessagesThisMonth`: number
  - `voiceMinutesThisMonth`: number — de 120 totales

### Acciones del usuario

- **Cambiar plan** (mensual ↔ anual): POST con nuevo planId.
- **Cancelar suscripción**: modal de confirmación + razón → PATCH.
- **Reactivar (si cancelando)**: PATCH para quitar el cancel.
- **Actualizar método de pago**: redirige a Stripe Customer Portal.
- **Descargar factura**: descarga PDF desde signed URL.

### Llamadas HTTP

- **Método:** PATCH — `/api/billing/subscription` — Auth: Sí
  - **Request:** `{ action: "switch-plan" | "cancel" | "reactivate", newPlanId?, cancelReason? }`
  - **Response:** `{ ok: true, subscription }`
- **Método:** POST — `/api/billing/customer-portal` — Auth: Sí
  - **Response:** `{ portalUrl: string }` — redirige a Stripe
- **Método:** GET — `/api/billing/invoices?limit=12` — Auth: Sí
- **Método:** GET — `/api/billing/usage` — Auth: Sí

### Estados

- **Loading:** skeleton de info + invoices.
- **Error:** 500 → retry.
- **`past_due`:** banner rojo "Tu pago no se procesó" + CTA actualizar método.
- **`cancelling`:** banner suave "Tu Pro termina el DD/MM. Reactiva en un clic." + botón.
- **Empty (sin facturas):** "Aún no hay facturas" (usuarios en trial).

---

## Endpoints de esta área

| Método | Endpoint                        | Auth | Descripción                          |
| ------ | ------------------------------- | ---- | ------------------------------------ |
| GET    | `/api/plan`                     | Sí   | Estado del plan + comparativa + FAQs |
| POST   | `/api/billing/checkout-session` | Sí   | Iniciar checkout (Stripe Hosted)     |
| GET    | `/api/billing/return`           | Sí   | Callback post-checkout               |
| PATCH  | `/api/billing/subscription`     | Sí   | Cambiar plan / cancelar / reactivar  |
| POST   | `/api/billing/customer-portal`  | Sí   | Redirigir a portal de Stripe         |
| GET    | `/api/billing/invoices`         | Sí   | Historial de facturas                |
| GET    | `/api/billing/usage`            | Sí   | Uso del mes (libros, eco, voz)       |
| POST   | `/api/billing/webhook`          | No   | Webhook de Stripe (verificar firma)  |
