# Psico Platform · Handoff técnico

Documentación de implementación para todas las pantallas del producto. Un archivo por pantalla / área.

## Convenciones globales

**Stack asumido:** Next.js 14 (App Router) + NestJS + Prisma + Postgres + Redis + Posthog.

**Autenticación:** todas las rutas marcadas `Auth: Sí` requieren `Authorization: Bearer <jwt>`. JWT se obtiene de `POST /api/auth/login` o de la cookie de sesión. Las rutas `Auth: No` son públicas (paywall, landing, recuperación de contraseña).

**Tier / acceso Pro:** muchas rutas devuelven `tier: "free" | "pro"` en la response del usuario. El frontend bloquea contenido según ese campo y muestra paywall (ver `09-plan.md`).

**Errores estándar:**

- `401` → token inválido o expirado → redirige a `/login`
- `403` → tier insuficiente → muestra paywall inline
- `404` → recurso no existe → mensaje contextual
- `429` → rate-limit (sobre todo en endpoints de Eco, voz, terapia/booking) → mensaje "intenta de nuevo en X segundos"
- `500` → genérico → toast "Algo salió mal" + retry

**Period querystring:** en endpoints analíticos (`pulso`, `patrones`) usa `?period=7d|30d|90d|ytd`. Default `30d`.

**Locale:** todo el producto es `es-419` (LATAM). Las fechas se devuelven en ISO 8601 UTC; el frontend formatea.

**Privacidad — diario y conversaciones de Eco:** el contenido textual del diario y los hilos de Eco son E2E-encrypted desde el cliente con la clave derivada del usuario. El backend almacena ciphertext. Los endpoints que devuelven entries / threads devuelven payload cifrado; el cliente desencripta. **No** envíes contenido plano al backend.

---

## Índice de pantallas

**Estado actualizado 2026-06-13 tras audit completo.** Backend / Web / Mobile reflejan la implementación real verificada contra módulos NestJS, rutas y schema Prisma.

| #   | Pantalla / Área                         | Archivo                                        | Backend            | Web | Mobile                           |
| --- | --------------------------------------- | ---------------------------------------------- | ------------------ | --- | -------------------------------- |
| 01  | Onboarding (4 pasos + tour)             | [01-onboarding.md](./01-onboarding.md)         | ✅                 | ✅  | ✅                               |
| 02  | Inicio (home dashboard)                 | [02-inicio.md](./02-inicio.md)                 | ✅                 | ✅  | ✅                               |
| 03  | Mi Biblioteca (catálogo + Mis libros)   | [03-biblioteca.md](./03-biblioteca.md)         | ✅                 | ✅  | ✅                               |
| 04  | Detalle de libro                        | [04-detalle.md](./04-detalle.md)               | ✅                 | ✅  | ✅                               |
| 05  | Lector (Modo Libro + Modo Guía + RISE)  | [05-lector.md](./05-lector.md)                 | ✅                 | ✅  | ⚠️ view-only (text-selection v2) |
| 06  | Diario (lista, nueva entrada, entrada)  | [06-diario.md](./06-diario.md)                 | ✅ E2E             | ✅  | ✅                               |
| 07  | Voz · dictado                           | [07-voz.md](./07-voz.md)                       | ✅                 | ✅  | ✅                               |
| 08  | Eco (compañero IA)                      | [08-eco.md](./08-eco.md)                       | ✅ E2E + SSE       | ✅  | ✅                               |
| 09  | Mi Plan (planes, suscripción, facturas) | [09-plan.md](./09-plan.md)                     | ✅                 | ✅  | ✅                               |
| 10  | Perfil                                  | [10-perfil.md](./10-perfil.md)                 | ✅                 | ✅  | ✅                               |
| 11  | Terapia (18 sub-pantallas)              | [11-terapia.md](./11-terapia.md)               | ✅ gated           | ✅  | ✅                               |
| 12  | Patrones (insights del diario)          | [12-patrones.md](./12-patrones.md)             | ✅ LLM             | ✅  | ✅                               |
| 13  | Rutas (bundles de libros)               | [13-rutas.md](./13-rutas.md)                   | ❌                 | ❌  | ❌                               |
| 14  | Dynamic Island (live activities iOS)    | [14-dynamic-island.md](./14-dynamic-island.md) | ⚠️ stub (ADR-0012) | —   | ❌ iOS surface                   |
| 15  | Wallpapers (fondos descargables)        | [15-wallpapers.md](./15-wallpapers.md)         | ❌                 | ❌  | ❌                               |
| 16  | Editor de autor (B2B)                   | [16-author.md](./16-author.md)                 | ✅                 | ✅  | — web-only                       |
| 17  | Pulso (back-office)                     | [../pulso/HANDOFF.md](../pulso/HANDOFF.md)     | ✅                 | ✅  | — web-only                       |

**Resumen:** 14/17 áreas completas. 1 backend-stub (Dynamic Island). 2 no priorizadas v1 (Rutas, Wallpapers).

---

## Resumen ejecutivo de endpoints

Ver tabla consolidada al final de cada archivo. Para una vista única de todos los endpoints únicos del producto, ver `99-endpoints.md` (generado al final).
