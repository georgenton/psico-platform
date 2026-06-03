# Sprint B — Pulir Phase 1 (Eco reports + pagination)

**Rama sugerida:** `feature/sprint-b-polish`
**Tests:** 356/356 API + 34/34 crypto (sin cambios — sprint UI/UX puro).
**Backend used:** endpoints `POST /eco/messages/:id/report` y `GET /eco/threads/:id?cursor=` ya existentes desde S10.

---

## 1. Scope

Tres pulidos accionables tras el cierre de Phase 1 UI:

1. **Reports UI Eco (web)** — botón "Reportar" bajo cada assistant bubble + modal con 5 razones + comentario opcional.
2. **Paginación Eco (web)** — botón "↑ Mensajes anteriores" al tope del scroll cuando `hasMore`; preserva scroll position al prependear.
3. **Reports UI Eco (mobile)** — long-press 400ms en assistant bubble → Modal RN con misma lista de razones + flash toast de éxito.

Diferidos a sprint propio: tour overlay onboarding, UI tests Vitest+RTL, animations.

---

## 2. Decisiones

1. **Botón visible vs gesture** (web) — clic-to-open en lugar de context-menu. La UX `right-click` no es descubrible en mobile-web ni en touch laptops. Botón pequeño "Reportar" bajo cada assistant bubble. Color `warm-400` (muted) para no competir con el contenido.
2. **Long-press en mobile** — gesture idiomático en iOS/Android para "más opciones". 400ms de delay (default RN feels lento; 400 da feedback rápido sin disparar accidentes).
3. **Modal con select-radio** (web) y Modal RN con misma estructura (mobile) — sobre `Alert.alert`. Alert no escala a 5 opciones + comentario opcional.
4. **Flash toast 4s** post-submit — no bloqueante, no requiere dismiss. Mensaje: "Gracias — recibimos tu reporte."
5. **No paginación en mobile (v1)** — los mobile users típicamente trabajan con 1-2 threads activos; cargar 50 mensajes por thread es suficiente. Si los datos muestran threads largos, lo añadimos. Mantiene el sprint enfocado.
6. **Optimistic/local messages no son reportables** — el filter `!msg.id.startsWith("local-")` evita que el modal intente POST a un ID que el servidor no conoce todavía. Cuando el `done` event llega con el `messageId` real, queda reportable.

---

## 3. Cambios

### Web

- `apps/web/src/components/dashboard/eco/ReportMessageModal.tsx` — **nuevo**.
  - Lista de 5 razones: HALLUCINATION · OFF_TONE · SENSITIVE_CONTENT · CRISIS_MISHANDLED · OTHER (label + hint para cada uno).
  - Comentario opcional 500 chars con counter.
  - Cancel = clic afuera del modal o botón "Cancelar".
  - POST `ecoApi.reportMessage(id, { reason, comment? })`.

- `apps/web/src/components/dashboard/eco/ChatArea.tsx` — **extendido**.
  - State: `reportingId`, `reportFlash`, `hasMore`, `loadingMore`.
  - `loadOlder()` callback: snapshot `scrollHeight + scrollTop`, fetch con `?cursor=<oldestMessageId>`, prepend, restore scroll via `requestAnimationFrame`.
  - Botón "↑ Mensajes anteriores" pill al tope, mostrado solo si `hasMore && messages.length > 0`.
  - `MessageBubble` extendido con `onReport?: () => void`. Cuando se pasa, renderiza un mini-link "Reportar" debajo de la burbuja.
  - El render de la lista pasa `onReport` SOLO cuando `msg.kind === "assistant" && !msg.id.startsWith("local-")`.
  - Flash banner sage al tope del chat.
  - Scroll-to-bottom skip cuando `loadingMore` (sino el prepend re-anclaba al final).

### Mobile

- `apps/mobile/app/(tabs)/eco/index.tsx` — **extendido**.
  - State: `reportingId`, `reportFlash`.
  - `Bubble` extendido con `onLongPress?` opcional. Cuando se pasa, wrap con `Pressable delayLongPress={400}` y `opacity 0.7` en pressed.
  - `ReportModal` component nuevo dentro del file (5 razones + comment 500 chars + scroll si overflow + Submit/Cancel actions).
  - Flash toast (absoluto, top 60) que se auto-dismissa a los 4s.
  - Filter idéntico al web: assistant + non-local IDs.
  - Mismo flush flow de error: `setErr("No pudimos enviar el reporte. Reintenta.")`.

### Sin cambios

- `@psico/types` — `EcoMessageReportReason` + `EcoReportMessageRequest` ya existían desde S10.
- `@psico/api-client` — `ecoApi.reportMessage()` y `cursor` param en `ecoApi.getThread()` ya existían.
- Backend — no se tocó.

---

## 4. Verificación

- API tests: **356/356** (sin cambios).
- @psico/crypto: 34/34.
- Web `typecheck` + `lint`: clean.
- Mobile `typecheck` + `lint`: clean.
- OpenAPI `generate:check`: OK.

---

## 5. Deuda técnica abierta

- **Mobile pagination** sigue pendiente. Quedó documentado arriba — añadir si data muestra que hace falta.
- **Edit-then-report** flow — actualmente no hay forma de editar un reporte después de enviarlo. v2 si los datos muestran que la gente reporta y luego se arrepiente.
- **UI tests con Vitest + RTL** — siguen pendientes (sprint propio).
- **Tour overlay onboarding** — diferido.
- **Animations** — el flash toast usa visible/invisible binario sin transición. RN tiene `Animated` + Reanimated; lo añadimos cuando el resto del UI motion library esté definido.
- **Reports dashboard de admin** — los datos están en `EcoMessageReport` pero no hay forma de inspeccionarlos. Cuando lleguemos a Pulso (admin) en v2, ese es uno de los primeros surfaces.

---

## 6. Resumen para Notion

**Qué cerramos en Sprint B:**

- Botón "Reportar" + modal de 5 razones en cada assistant bubble (web).
- Botón "↑ Mensajes anteriores" con scroll preservation (web).
- Long-press → Modal RN de reportes + flash toast (mobile).
- 0 cambios al backend — todos los endpoints estaban listos desde S10.
- Tests intactos: 356/356 + 34/34.

**Qué viene:**

- UI tests con Vitest + RTL (sprint propio).
- Tour overlay onboarding.
- Mobile pagination si la data lo justifica.
- Sprint S11 PatternsModule (Pro feature) o Bugfix #2 (Stripe price IDs reales).
