# Sprint S71.C-revenue — Cobros + payout settings del autor

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-s71c-revenue`
**Tests:** 601/602 API (+7 nuevos · 1 skipped sentinel) · 56/56 web · 34/34 crypto
**Design handoff:** [docs/design/handoff/16-author.md §dashboard "Ver pagos"](../design/handoff/16-author.md)

---

## Lo que se construyó

**Último sprint del módulo Author B2B v1.** Cierra el endpoint `/api/autor/cobros` del handoff con la primera surface real para que el autor vea sus ingresos y configure su método de pago. La inserción real de earnings rows queda como deuda (S71.D) — depende de un job de agregación que requiere métricas serias de lectura attributada.

### Schema

2 modelos nuevos + 1 enum:

- **`AuthorEarning`** — una fila por (autor, libro?, mes) con `grossCents / platformFeeCents / netCents / status (PENDING|PAID) / paidAt / paymentMethod / paymentReference / notes`. Sin foreign key al book para que aggregations no-por-libro también encajen.
- **`AuthorPayoutSetting`** — una fila por autor con `method (bank_ec | paypal | payphone | manual) + details Json + taxId + legalName + legalAddress`. JSON libre por método porque cada país pide cosas distintas.
- **`EarningStatus` enum** — PENDING / PAID.

Migración aditiva `20260611100000_s71c_revenue/migration.sql`.

**Por qué cents y no decimal:** Prisma + JSON serialization + DOUBLE drift son pesadilla. Cents enteros = matemática exacta. Frontend formatea con `.toLocaleString("es-EC", { style: "currency" })`.

### Backend

**Nuevo `AuthorRevenueService`** dentro de `AuthorModule`:
- `getCobros(userId)` — agrega rows por mes (collapse cuando hay múltiples por mes), computa YTD del año fiscal en curso, último mes calendario y pendiente.
- `updatePayoutSettings(userId, dto)` — upsert idempotente.

**Aggregation rules** que valen la pena documentar:
- Si hay varias filas en el mismo mes, se suman cents y el bucket queda PENDING si **alguna** de las filas está PENDING (peor caso para el autor).
- YTD respeta `Date.UTC` para evitar drift de timezone.
- "Último mes" = mes calendario completo anterior, no rolling 30d.

**2 endpoints nuevos:**

```
GET   /api/autor/cobros
PATCH /api/autor/cobros/configuracion
```

Ambos heredan `JwtAuthGuard + RolesGuard + @RequiredRole("AUTHOR")` del controller.

### Tipos compartidos (+7)

- `AuthorPayoutMethod`, `AuthorEarningStatus`
- `AuthorRevenueSummary`, `AuthorMonthlyRevenueRow`
- `AuthorPayoutSettings`
- `AuthorRevenueResponse`
- `UpdateAuthorPayoutRequest`, `UpdateAuthorPayoutResponse`

### Cliente API

- `authorApi.getCobros()`
- `authorApi.updatePayoutSettings(body)`

### Web — UI

**`/autor/cobros` (Server Component)** con 3 piezas:

- **3 summary cards** colored (lavender / sage / warm) con YTD, último mes, pendiente.
- **`MonthlyEarningsTable.tsx`** — tabla con mes / bruto / comisión / neto / status badge. Empty state educativo.
- **`PayoutSettingsForm.tsx`** Client Component con:
  - 4 method cards (Banco EC / PayPal / Payphone / Manual) clickables.
  - Textarea JSON libre para `details` (cada método pide cosas distintas).
  - 3 campos legales (taxId, legalName, legalAddress).
  - Validación JSON client-side antes del PATCH (mensaje específico si malformed).
  - Optimistic save + flash "Guardado" 2.5s.
- Server action `updatePayoutSettingsAction` con `revalidatePath`.

**Layout extendido:** link "Cobros" en el header del workspace.

### Tests (+7)

- `getCobros` — empty state.
- `getCobros` — aggregation con sort newest-first.
- `getCobros` — collapse same-month + PENDING flip.
- `getCobros` — YTD respeta fiscal year.
- `getCobros` — settings preexistentes se exponen.
- `updatePayoutSettings` — upsert con full payload.
- `updatePayoutSettings` — defaults details a `{}`.

---

## Decisiones

1. **Cents enteros, no DECIMAL** — eliminar float drift definitivamente.
2. **`AuthorEarning.bookId` opcional** — algunos earnings son agregados (todos los libros del autor en ese mes); otros son específicos por libro. v1 acepta ambos sin forzar shape.
3. **Sin foreign key al book** — el autor puede archivar un libro pero el earning persiste. Ownership es por `authorUserId`.
4. **JSON `details` libre por método** — no quiero un schema rígido que cambie cada vez que finanzas agrega un proveedor. Si pasa a ser problema, sprint propio para tighten.
5. **Surface read-only para el autor** — la inserción la hace el back-office (Pulso) o un job futuro. El autor solo ve y configura cómo cobra.
6. **Year-to-date por calendar year**, no rolling 12 months — finanzas y tax filings usan fiscal year (Ene-Dic). Si necesitas rolling, se puede agregar después.
7. **`PENDING` propaga al mes consolidado** cuando hay rows mixed — UX honesta: el autor ve que "ese mes aún no está cerrado".
8. **Sin paginación** — `take: 36` (3 años) es suficiente para v1. Si autores B2B realmente despegan, agregar cursor.
9. **Sin notif email** al autor cuando se le paga — añadir cuando los pagos sean reales, no antes.

---

## Smoke verification (local)

- API typecheck OK.
- API lint clean (4 warnings preexistentes, sin errores nuevos).
- API tests 601/602 (+7 nuevos, 1 skipped sentinel).
- Web typecheck + lint clean.
- Web tests 56/56.
- `@psico/types` y `@psico/api-client` builds OK.

---

## Deuda técnica abierta

**S71.D — Aggregation job** (el grande):
- Métricas reales de lectura por libro por usuario (sesiones del lector, % completado, dwell time).
- Calcular fracción de revenue atribuible al autor basado en uso, NO en compras (porque el pricing v1 es subscription, no per-libro).
- Modelo de revenue share definido (e.g. 70/30, tier-based).
- Job nightly que escribe `AuthorEarning` rows + idempotency key para reruns.

**Otras:**
- Endpoint admin para que finanzas marque earnings como PAID con reference (hoy se hace por SQL).
- Notificación email al autor cuando earning pasa a PAID.
- Filtro por libro en el historial (cuando bookId esté populado).
- Export CSV.
- Mobile companion — Author es desktop-only.
- Tests UI dedicados.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Deploy a Railway (migración aditiva, sin envs nuevos).
3. Smoke walk:
   - Como AUTHOR: navegar a `/autor/cobros` → ver empty state.
   - Cambiar método a PayPal → escribir `{"email":"x@y.com"}` en details → guardar → flash OK.
   - Volver a recargar → datos persistidos.
   - (Para ver datos reales necesitas insertar `AuthorEarning` rows vía SQL hasta que S71.D aterrice.)

**🎉 Con esto el módulo Author B2B v1 queda completo end-to-end:** backend + admin promotion + web admin UI + web author workspace + email notifs + AI helpers + uploads + cobros.
