# Sprint S45 — Notifications UI + WeeklySummary wire en digest

**Rama sugerida:** `feature/sprint-45-notifications-ui`
**Tests:** 384 API + 34 crypto (383 → 384, +1 nuevo · 1 skipped sentinel).

---

## 1. Scope

Cierra la **UX gap** que S43+S44 abrieron: el sistema de notifications funciona pero el user no podía controlar nada desde la app. Sprint trae 3 entregables:

1. **`usersApi` cliente** — `getMe` + `updateNotifications` para que mobile pueda invocar PATCH (web ya usa `serverFetch`).
2. **Web `/dashboard/notifications`** — Server Component pre-fetcha settings + Client form con toggles + reminderTime picker + optimistic save.
3. **Mobile `/(tabs)/notifications`** — paridad RN con `Switch` nativos.
4. **Wire `WeeklySummary` (S38)** dentro del digest semanal — cierra deuda S44.

---

## 2. Decisiones

1. **Optimistic UI sin botón Save** — cada toggle = save inmediato + revertir en error. Es el patrón estándar de settings modernos y elimina ambigüedad.
2. **Flash "Guardado" 2.5–3s** — confirmation barata sin modal noise.
3. **Errores inline globales** (no per-row) — simplifica el state y para "fallé el último cambio" el banner global es suficiente.
4. **`reminderTime` con `<input type="time">`** (web) y `<TextInput>` simple con keyboard `numbers-and-punctuation` (mobile) — zero deps. Si UX feedback pide un picker mobile mejor, agregar `@react-native-community/datetimepicker` después.
5. **Wire WeeklySummary en lookup, no generación** — el digest NO dispara la generación del summary (eso es trabajo de PatronesService.regenerateWeeklySummary). Solo lee la row si existe. Esto preserva la independencia de los dos systems.
6. **Narrative ABOVE stats** en el email — el editorial cálido viene primero, los counts después para los que quieran cifras.
7. **Nav nueva entry en sidebar** (web) y shortcut card en profile screen (mobile) — descubribilidad explícita.
8. **No tocar el backend** — `PATCH /api/user/notifications` ya existía desde S9.

---

## 3. Cambios

### Cliente (`@psico/api-client`)

- Nuevo `src/users.ts` con `usersApi.getMe()` + `usersApi.updateNotifications()`.
- Export en `src/index.ts`.

### Backend

- `apps/api/src/notifications/templates/weekly-digest.template.ts`:
  - `WeeklyDigestProps` extendido con `narrative?: { headline, body }`.
  - Bloque visual lavender que renderiza headline + body con whitespace-pre-line.
  - Plain text version actualizada.
- `apps/api/src/jobs/processors/weekly-digest.processor.ts`:
  - `findUnique` sobre `weeklySummary({ userId, weekStart })` por user.
  - Pasa `narrative` al template si existe.
- `apps/api/src/jobs/processors/weekly-digest.processor.spec.ts`:
  - +1 test: "includes the WeeklySummary LLM narrative when one exists for the week". Verifica que el findUnique se llama con el shape correcto y que headline+body aparecen en HTML y text.
  - `buildPrisma` extendido con `weeklySummary.findUnique` default null.

### Web

- `apps/web/src/actions/notifications.ts` — server action `updateNotificationsAction(body)` que PATCH y revalidatePath.
- `apps/web/src/components/dashboard/notifications/NotificationsForm.tsx` — Client Component con optimistic UI + flash + inline error + `reminderTime` time input.
- `apps/web/src/app/dashboard/notifications/page.tsx` — Server Component que pre-fetcha `/user/me`.
- `apps/web/src/app/dashboard/_DashboardShell.tsx` — sidebar item "🔔 Notificaciones" entre Mi plan y Seguridad.

### Mobile

- `apps/mobile/app/(tabs)/notifications.tsx` — pantalla con Switch nativos + TextInput para reminderTime + optimistic save.
- `apps/mobile/app/(tabs)/_layout.tsx` — registra screen `notifications` con `href: null` (deep-link only).
- `apps/mobile/app/(tabs)/profile.tsx` — shortcut card "Notificaciones" antes de Seguridad.

### Sin cambios

- Schema, endpoints backend, OpenAPI surface.
- Types compartidos (`UserNotificationSettings` + `UpdateNotificationsRequest` ya existían).

---

## 4. Verificación

- API tests: **384/384** + 1 skipped sentinel (+1 nuevo).
- @psico/crypto: 34/34 (sin cambios).
- API typecheck + lint OK.
- Web typecheck + lint OK.
- Mobile typecheck + lint OK.
- OpenAPI `generate:check` in sync.

---

## 5. Deuda técnica abierta

- **Sin tests para NotificationsForm (web) ni NotificationsScreen (mobile)** — los componentes son simples (optimistic toggle + revert) pero deberían cubrirse en un futuro Sprint UI tests batch.
- **`reminderTime` no aplica timezone** — el server guarda HH:MM "local del user" pero no sabe la TZ del user (excepto `Profile.timezone` que puede ser null). Cuando S44 deuda de timezone-aware schedules aterrice, esto se conecta automáticamente.
- **Sin "Enviar email de prueba"** — útil para confirmar al user que el digest llegará. Diferido (premature).
- **Sin desactivar push directamente** — el flag `dailyReminder` gates push, pero un user podría querer email-only sin push y eso requiere `dailyReminder=true + revoke device tokens manualmente`. UX confuso; cuando UX feedback lo pida, separar en `pushEnabled` field independiente.
- **Mobile time input acepta cualquier texto** — submit on Enter (`onSubmitEditing`) sin validar formato HH:MM. Server tiene validation pero el feedback al user es lento. Cuando agreguemos un picker, esto se resuelve.
- **WeeklySummary no se genera automáticamente para Pro users** — el digest la usa SI existe; user tiene que hacer regenerate manualmente desde `/dashboard/patrones`. Cuando entremos a S46+ podemos auto-generar el viernes para que esté listo el lunes.

---

## 6. Resumen para Notion

**Qué cerramos en Sprint S45:**

- Web `/dashboard/notifications` con 5 toggles + reminder time, optimistic save, flash confirmation.
- Mobile `/(tabs)/notifications` paridad con Switch + TextInput.
- `usersApi` cliente para mobile.
- WeeklySummary (S38) wired en el digest email — el narrative del LLM aparece arriba del email.
- 1 test nuevo para el wire del WeeklySummary.

**Qué viene:**

- Timezone-aware scheduling (S44 deuda).
- Auto-regenerate WeeklySummary el viernes para que el digest del lunes lo encuentre.
- Tests UI dedicados (componentes settings).
- Bugfix #2 Stripe price IDs (tarea tuya).
- Pulso v2 Overview (KPIs + sparklines).
