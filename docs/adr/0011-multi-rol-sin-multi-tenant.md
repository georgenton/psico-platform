# ADR 0011 — Multi-rol sin multi-tenant

**Status:** Accepted (retroactivo)
**Fecha:** 2026-06-08 (formalizado en S52 audit cleanup; en código desde S1)
**Sprints involucrados:** S1 (Auth) · S15 (Sprint S3, Users) · S42 (Pulso ADMIN) · S49 (Pulso resolution)

---

## Contexto

La plataforma Psico necesita exponer cuatro vistas conceptualmente distintas:

1. **Usuario regular** (`USER`) — consume Diario, Eco, Voz, Lector, Patrones, Mi Plan, Perfil.
2. **Autor B2B** (`AUTHOR`) — Editor de autor (`docs/design/handoff/16-author.md`), v2.
3. **Terapeuta** (`THERAPIST`) — vista de sesiones + dashboard del cliente (`docs/design/handoff/11-terapia.md`), v2.
4. **Admin operacional** (`ADMIN`) — back-office Pulso (`docs/design/handoff/17-pulso.md`).

Cada rol consume endpoints distintos y necesita guards distintos. La pregunta arquitectural es: ¿cómo modelamos la separación?

Las opciones canónicas en SaaS multi-perfil son:

- **A — Multi-tenant clásico:** una `Organization` raíz, con `User.organizationId` y aislamiento de datos por tenant. Útil cuando los datos del USUARIO B viven en un silo separado del USUARIO A (clásico SaaS B2B: ACME Corp vs Globex Inc).
- **B — Multi-rol sobre tenant único:** un solo conjunto de tablas, con `User.role` (enum) controlando qué endpoints puede llamar. Los datos cruzan roles cuando hace sentido (un ADMIN puede leer reports que pertenecen a USERs).
- **C — Servicios separados por rol:** distintos backends para `psico.app/user` vs `psico.app/admin` vs `psico.app/author`. Complejidad operacional alta.

---

## Decisión

**Adoptamos B — Multi-rol sobre tenant único.** Justificación:

1. **Las tres mil cuentas que esperamos en v1 viven en la misma "tenancy"** — Psico es B2C primario con un canal B2B (Empleadores) que añade _suscripciones_, no organizaciones que necesiten aislamiento de datos.
2. **El admin necesita cruzar la frontera del usuario** para hacer su trabajo (revisar `EcoMessageReport` del usuario X, ver Pulso analytics agregado de todos). Multi-tenant haría esto contranatural — el admin pertenecería a "su" tenant separado y necesitaríamos hacks (`crossTenant: true` en cada query).
3. **El autor B2B (v2) firma contenido** que es leído por todos los USERs — un libro de Autor A se vende a Usuarios de cualquier organización. Multi-tenant impondría una "tenancy de contenido" además de "tenancy de usuarios" — overhead que no necesitamos.
4. **El terapeuta (v2) tiene sesiones** que conectan un therapist↔user — pero la relación es `Therapy { therapistId, userId }` no `User.tenant`. Lo modelamos como relación 1-a-N en S13.
5. **Simplicidad operacional:** queries `WHERE userId = X` en lugar de `WHERE userId = X AND tenantId = Y` para todas las tablas.

### Modelo concreto

```prisma
enum UserRole {
  USER          // default
  AUTHOR        // B2B autor (v2)
  PSYCHOLOGIST  // therapist (v2)
  ADMIN         // Pulso operations
}

model User {
  // ...
  role  UserRole  @default(USER)
}
```

`User.role` es una **única dimensión** que clasifica qué endpoints puede llamar el usuario. NO existe `tenantId` ni `organizationId` en el schema v1.

### Guard stack

Cada controller compone los guards en este orden:

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiredRole("ADMIN")  // | "AUTHOR" | "PSYCHOLOGIST"
```

`RolesGuard` lee `@RequiredRole(...)` metadata vía Reflector y compara contra `request.user.role`. Si no match → `ForbiddenException`. Si no hay `@RequiredRole`, el guard es pass-through (cualquier rol logueado entra).

**Granularidad mixta:** algunos endpoints son ADMIN-only a nivel de **controller** (Pulso entero), otros a nivel de **método** (`/users/me/admin-only-thing`). El decorator funciona en ambos sitios.

---

## Consecuencias

### Positivas

- **Single schema, single query plan, single Prisma client** — sin overhead de tenant scoping.
- **El admin puede hacer su trabajo sin gimnasia** — `findMany({ where: { resolvedAt: null } })` directamente.
- **El cripto E2E del Diario sigue funcionando** sin cambios — la frontera de privacidad es `userId`, no `tenantId`.
- **El frontend pasa el `role` al guard nav** (sidebar muestra `Pulso · Reports` solo si `user.role === "ADMIN"`).

### Negativas / aceptadas

- **No podemos vender el back como white-label tenanted multi-org** sin una migración significativa. Si en futuro queremos vender Psico embebido en otras plataformas, tocará agregar `Organization` y backfill `User.organizationId`. **Aceptamos**: ese mercado es lejano y la migración es factible.
- **Si en algún momento dos admins de distintos "departamentos" necesitan ver datos disjuntos**, no tenemos forma de aislarlos arquitectónicamente. Aceptamos: el admin pool es chico (1-3 personas) y todos confían entre sí.
- **El audit log** (S1, `AuthEvent`) captura `userId` del actor pero no tiene noción de "qué tenant impactó" — para nosotros es OK porque todo es un solo tenant.

### Cuándo revisitar este ADR

- Si firmamos contrato B2B grande que exige aislamiento legal (HIPAA Business Associate Agreement multi-org, GDPR data residency per-EU-country).
- Si vendemos Psico como SDK embebido en apps de terceros.
- Si el equipo admin crece y necesitamos sub-departamentos con visibilidad disjunta (improbable v1+v2).

---

## Alternativas consideradas

### Multi-tenant clásico

Descartado por:

- Overhead de query scoping en cada tabla (`+ tenantId` en cada `findMany`).
- Migración del existing data sería costosa retroactiva.
- El admin cruza tenants por design — multi-tenant no nos ayuda, nos estorba.

### Servicios separados (microservicios por rol)

Descartado por:

- Complejidad operacional alta para un equipo de 1 dev.
- Compartición de tipos / OpenAPI tendría que ser via gateway.
- El back actual cabe cómodo en un solo Railway service.

---

## Referencias

- `apps/api/src/auth/auth.service.ts` — register asigna `role: USER` default.
- `apps/api/src/shared/roles.guard.ts` — implementation.
- `apps/api/src/shared/required-role.decorator.ts` — `@RequiredRole(...)` metadata.
- Sprint **S1** (Auth) — primer rol introducido.
- Sprint **S15** (UsersModule) — role exposed en `UserMeResponse`.
- Sprint **S42** (Pulso reports) — primer uso de `@RequiredRole("ADMIN")`.
- Sprint **S49** (Pulso resolution) — `resolvedBy` guarda `User.id` del admin actuante.
