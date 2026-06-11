# Sprint S72 — Admin user search + role promotion (sin `railway login`)

**Fecha:** 2026-06-10
**Rama:** `feature/sprint-s72-admin-users`
**Tests:** 571/572 API (+12 nuevos · 1 skipped sentinel) · 56/56 web · 34/34 crypto
**Design:** spec propio del sprint (docs/design no cubre back-office en este sprint)

---

## Lo que se construyó

Cierra el bloqueador crítico ops: hasta hoy, promover un usuario a AUTHOR o ADMIN requería `railway login + SQL`. Eso significa que sin acceso al Railway CLI, la plataforma no era self-serve. Ahora hay un panel admin web que busca, filtra y cambia el rol con audit log.

### Schema

- `RoleChangeLog` — un row por cada cambio de rol. Columns: `targetUserId`, `oldRole`, `newRole`, `changedBy` (admin id), `reason String?`, `changedAt`. Índices compuestos `(targetUserId, changedAt)` y `(changedBy, changedAt)`.
- Migración `20260610230000_s72_role_change_log/migration.sql` aditiva.

### Backend

**Nuevo servicio `AdminUsersService` dentro de PulsoModule** (mismo audiencia ADMIN, reusa RolesGuard).

3 endpoints nuevos bajo `/api/pulso/users/*`:

```
GET  /api/pulso/users?q=&role=&limit=
GET  /api/pulso/users/:id/role-changes
POST /api/pulso/users/:id/role   { role, reason? }
```

Reglas:
- `q` busca substring en email o name, case-insensitive, vía Prisma `mode: "insensitive"`.
- `role` filter exacto (USER/AUTHOR/PSYCHOLOGIST/ADMIN).
- `limit` cap a 200, default 50.
- `changeRole` valida `Role` enum + lanza:
  - `USER_NOT_FOUND` (404) si target no existe.
  - `CANNOT_DEMOTE_SELF` (409) si admin intenta degradarse a sí mismo (anti lock-out).
  - **Idempotente** — si target ya tenía el role, retorna `changed: false` sin log.
  - Si cambia: `prisma.$transaction` actualiza User + crea RoleChangeLog en atomic.

### `@psico/types` +5 nuevos

- `UserRole` (ya extendido con `AUTHOR` en S71-front).
- `PulsoAdminUserRow`, `PulsoAdminUserListResponse`.
- `PulsoChangeRoleRequest`, `PulsoChangeRoleResponse`.
- `PulsoRoleChangeLogRow`.

### Cliente API

`pulsoApi` extendido con `listUsers`, `getUserRoleChanges`, `changeUserRole`.

### Web — `/dashboard/admin/users`

Server Component con doble gate ADMIN. 3 piezas:

- **`UsersFilters.tsx`** — form GET con search input + chips de role (zero-JS, querystring-driven).
- **`UsersTable.tsx`** — Server Component que lista users con badges colored por role (sage/lavender/rose/warm) + flags "Inactivo" y "Sin verificar".
- **`RoleSelector.tsx`** — Client Component con state machine `idle → editing → done`. Composer: `<select>` con options disabled cuando `isSelf && r !== "ADMIN"` + textarea de razón. Submit via server action.

Sidebar nav: nuevo item "👤 Pulso · Usuarios" al final del grupo admin.

### Tests (+12)

- `listUsers` — default 50, cap 200, q substring, role filter, shape.
- `getRecentRoleChanges` — top 20 ordered desc.
- `changeRole`:
  - 404 user not found.
  - 409 CANNOT_DEMOTE_SELF.
  - Idempotent cuando el role ya coincide (no log).
  - USER → AUTHOR happy path.
  - ADMIN re-set a ADMIN (idempotente).
  - ADMIN demotes OTHER admin (allowed, log creado).

---

## Decisiones

1. **Reusa PulsoModule** (no creo `AdminModule` dedicado) — mismo guard ADMIN, mismas convenciones.
2. **Self-demotion bloqueado** — single admin lock-out es un fallo común; mejor forzar el "pedirle a otro admin". Si solo hay un admin y necesita autodemotarse, queda como excepción que se hace por SQL (con consciousness).
3. **Idempotente** — si admin click "Confirmar" pero el target ya estaba en ese role, retornamos `changed: false` sin log. No-noise audit.
4. **`reason` opcional** — algunos cambios son obvios (onboarding B2B). Forzar feedback empuja a ops a escribir basura.
5. **Audit en tabla separada** (`RoleChangeLog` vs reusar `AuthEvent`) — semantically distinto, índices distintos, queries distintas.
6. **Sin paginación cliente** — limit 100 es suficiente para v1. Cuando volumen crezca, agregar `?cursor=…`.
7. **Sin endpoint para promover plan** — ese es un escenario distinto (billing). Si hace falta, sprint propio.

---

## Privacy

- ADMIN-only doble gate (backend + frontend).
- Response expone `email` necesariamente — ops debe contactar al user. Si GDPR/data residency lo exige, mover a un masking helper.
- `RoleChangeLog` no contiene PII más allá de IDs (admin id + target id) + reason text editorial.

---

## Smoke verification (local)

- API typecheck OK.
- API lint clean (4 warnings preexistentes, sin errores nuevos).
- API tests 571/572 (+12 nuevos, 1 skipped sentinel).
- Web typecheck + lint clean.
- Web tests 56/56.
- `@psico/types` y `@psico/api-client` builds OK.

---

## Deuda técnica abierta

- **OpenAPI client regen** — los nuevos endpoints están en el OpenAPI servido en `/api/docs-json` pero el `generated.ts` del cliente no se ha auto-regenerado. Confiamos en los tipos compartidos por ahora; cuando un consumer pida el `paths` types tipados, regenerar.
- **Sin panel de audit dedicado** — `/api/pulso/users/:id/role-changes` está vivo pero no hay UI que lo consuma. Cuando un admin quiera "quién promovió a Alice a ADMIN", se hace via curl. Sprint propio si volumen lo justifica.
- **Sin notif al usuario** cuando le cambian el role — el promovido no sabe. Si hace falta para autores B2B, agregar email en sprint propio.
- **Sin bulk role change** — un fan-out de 10 usuarios requiere 10 clicks. Cuando volumen lo justifique, batch endpoint + UI.
- **Sin export CSV** del listado completo.
- **Sin tests UI dedicados** para `RoleSelector` y `UsersFilters`. Cubierto por integration.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Deploy a Railway (migración aditiva pasa sin downtime).
3. Smoke walk con el usuario:
   - Como ADMIN: ir a `/dashboard/admin/users`.
   - Buscar `georgenton` → encontrar tu user → "Cambiar rol" → AUTHOR + razón "self test".
   - Verificar en `/api/pulso/users/<id>/role-changes` que el row existe.
   - Volver a poner USER (también queda en log).

Cierra deuda principal de los sprints anteriores S71-S71.B-front: ya no necesitas `railway login` para crear autores de prueba.
