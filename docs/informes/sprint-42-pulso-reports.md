# Sprint S42 — Pulso v2 · Admin reports Eco

**Rama sugerida:** `feature/sprint-42-pulso-reports`
**Tests:** 363 API + 34 crypto pasando (358 → 363, +5 nuevos · 1 skipped sentinel).
**Design ref:** [docs/design/pulso/HANDOFF.md](../design/pulso/HANDOFF.md) — sólo Reports.

---

## 1. Scope

Primera surface de **Pulso v2** — el back-office para revisar reportes de mensajes de Eco.

El design completo de Pulso lista 6 vistas + 15 endpoints. Este sprint shipea **una sola vista** (reports inbox) por dos razones:

1. La data ya se acumula desde Sprint B (Sesión 36) — `EcoMessageReport` rows con razón + comment — y no hay forma de inspeccionar sin abrir Postgres a mano.
2. Es la vista con la **privacy story más simple**: solo expone texto del assistant (plaintext del LLM), nunca el prompt del usuario (que vive cifrado).

Las otras 5 vistas (Overview, Growth, Engagement, Lectura, Operaciones) requieren agregación nocturna a `pulso_snapshots` — diferido.

---

## 2. Decisiones

1. **Solo ADMIN**, PSYCHOLOGIST NO. Pulso es back-office operativo, no acceso clínico. `RolesGuard` + `@RequiredRole("ADMIN")`.
2. **Cursor pagination en lugar de offset.** Más robusto cuando los rows se acumulan rápido. `findMany` con `take: limit + 1` para peek-ahead.
3. **Default limit 50, cap 100.** Admin tooling, no infinite scroll de usuario.
4. **No exponemos email/PII.** Solo `userId` (cuid) para correlación y `threadId` para navegación. Los identificadores se renderizan truncados (8 chars) en la UI.
5. **Privacy hard:** el row response **no contiene** ningún campo de ciphertext. Test explícito enforces que el JSON serialized del row NO contiene "textCiphertext" ni "textNonce".
6. **El assistant text es plaintext** (LLM output). Lo trimmeamos a 240 chars y lo mostramos. Si el admin quiere el thread completo, puede deep-linkear via threadId (futuro: button "Abrir thread" cuando lo necesitemos).
7. **Frontend gate redundante** del backend gate — `getSessionUser().role !== "ADMIN"` redirige a `/dashboard`. El backend sigue siendo la autoridad.
8. **Sidebar nav condicional** — el item "Pulso · Reports" solo aparece en sidebar cuando `user.role === "ADMIN"`. Sub-sección visual separada con eyebrow "Pulso · Admin".
9. **Sin chips de filter en mobile** — Pulso es desktop-only por ahora. Cuando lo necesitemos, el companion mobile lleva mismo `pulsoApi`.

---

## 3. Cambios

### Backend

- `apps/api/src/pulso/` **nuevo módulo**:
  - `PulsoService.getEcoReportSummary()` — `groupBy reason` + zero-fill por reason.
  - `PulsoService.listEcoReports({ reason?, limit?, cursor? })` — paginated, includes assistant text + threadId + messageKind. Trim a 240 chars.
  - `ListEcoReportsQueryDto` con validación `@IsIn` sobre reason + `@Min(1) @Max(100)` para limit.
  - `PulsoController` `@UseGuards(JwtAuthGuard, RolesGuard) @RequiredRole("ADMIN")` a nivel clase.
- Registrado en `app.module.ts`.
- 5 tests nuevos (`pulso.service.spec.ts`):
  - Summary returns zero-filled object.
  - Summary aggregates groupBy.
  - List shape: no ciphertext fields, assistant snippet trimmed.
  - Pagination: hasMore + nextCursor.
  - Filter por reason pasa al where clause.

### Tipos compartidos

- `@psico/types` +4 shapes: `PulsoReportReason`, `PulsoReportRow`, `PulsoReportListResponse`, `PulsoReportSummary`.
- `@psico/api-client` `pulsoApi` con `getEcoSummary` + `listEcoReports`. `generated.ts` 92.5 KB → 94.2 KB.

### Web

- `apps/web/src/app/dashboard/admin/reports/page.tsx` — Server Component.
  - Pre-fetcha summary + first page con `Promise.all`.
  - Gate `if (user.role !== "ADMIN") redirect("/dashboard")`.
  - Renderiza header + ReasonChips + ReportsList.
- `apps/web/src/components/dashboard/admin/ReasonChips.tsx` — Chips con counts, active state via querystring.
- `apps/web/src/components/dashboard/admin/ReportsList.tsx` — Lista con badges de razón + comment + assistant snippet + userId/threadId truncados.
- `apps/web/src/app/dashboard/_DashboardShell.tsx` — `ADMIN_NAV_ITEMS` separado, renderizado solo cuando `user?.role === "ADMIN"` con eyebrow visual.

### Sin cambios

- Mobile — fuera de scope.
- Esquema Prisma — `EcoMessageReport` ya existía desde S10.
- Endpoints existentes.

---

## 4. Verificación

- API tests: **363/363** + 1 skipped sentinel.
- @psico/crypto: 34/34 (sin cambios).
- API typecheck + lint: clean (4 warnings preexistentes).
- Web typecheck + lint: clean.
- OpenAPI `generate:check`: in sync.
- Privacy invariant: test explícito verifica que `assistantTextSnippet` no contiene "textCiphertext"/"textNonce".

---

## 5. Deuda técnica abierta

- **Resto de Pulso v2** — 5 vistas adicionales (Overview, Growth, Engagement, Lectura, Operaciones) requieren agregación nocturna a `pulso_snapshots`. Diferido.
- **Sin filtros por rango de fecha.** Si el admin quiere "últimos 7 días", hoy no hay forma. Sprint corto cuando se justifique.
- **Sin "marcar como revisado"** — los reports no tienen estado. Cuando crezca el volumen, añadir `status: "open" | "reviewed" | "dismissed"` + acción en UI.
- **Sin export CSV** — útil para analytics offline. Diferido.
- **Sin link "Ver thread completo"** — al hacer click en threadId no abre ningún UI. Cuando exista una vista de admin para inspect threads (con cuidado de privacy: el admin no puede ver USER messages ciphered), añadir el deep-link.
- **`/admin/reports` route public-by-naming pero gated**. Si queremos hardening adicional, mover a `/_admin/reports` para hacerlo less guessable. v1 acepta.
- **Mobile companion** — design de Pulso lista uno (`mobile.jsx`). Diferido hasta que algún admin pida usar el móvil.
- **Audit log de admin actions** — design de Pulso menciona `pulso_audit_log` para writes (override de Terapia, publicar episodio). Aplicable cuando agreguemos writes; v1 read-only, no aplica.

---

## 6. Resumen para Notion

**Qué cerramos en Sprint S42:**

- `PulsoModule` backend con 2 endpoints ADMIN-only (`/api/pulso/reports/eco/*`).
- 5 tests nuevos con privacy invariant explícito.
- Pulso types + `pulsoApi` cliente.
- Web `/dashboard/admin/reports` con chips de filter + lista paginada.
- Sidebar nav muestra "Pulso · Reports" solo a ADMIN.

**Qué viene:**

- Estado "reviewed" en reports.
- Filtro por rango de fecha.
- Resto de Pulso v2 (5 vistas con agregación nocturna).
- Bugfix #2 Stripe price IDs (tarea tuya).
