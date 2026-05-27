# Sprint front-fase1 (Mi Plan) — Web + Mobile

**Fecha:** 2026-05-27
**Rama:** `feature/sprint-front-fase1`
**Tests:** 323/323 API + 34/34 crypto (sin cambios — sprint orientado a UI)
**Bitácora previa:** [sprint-s10-eco-chat.md](sprint-s10-eco-chat.md)

---

## §1 · Scope

Sprint UI inicial de Fase 1 consumiendo S6-S10 backend. **Scope acotado a Mi Plan en ambas plataformas** (web + mobile) — Voz y Eco UI quedan para sprints separados.

Decisión del usuario lockeada: "Mi Plan (web + mobile) primero".

**Por qué Mi Plan primero:**

- Las pantallas ya existen (no es greenfield); solo se extienden con `/usage`, `/invoices`, `/cancel`, `/reactivate`.
- Es la pantalla de mayor ROI inmediato — los usuarios Pro la visitan para gestionar su billing.
- Establece patrones (UsageCards, InvoicesList, SubscriptionActions) que Voz y Eco van a reutilizar parcialmente.

---

## §2 · Lo que se construyó

### Web (`apps/web`)

**Server Actions extendidas** (`src/actions/subscription.ts`):

- `cancelSubscriptionAction(formData)` — POST /subscriptions/cancel, captura reason opcional, `revalidatePath("/dashboard/plan")`.
- `reactivateSubscriptionAction()` — POST /subscriptions/reactivate, revalida.

**Componentes nuevos** (`src/components/dashboard/plan/`):

- `UsageCards.tsx` — Server Component (pure). 4 mini-cards (libros, eco, voz, diario) con progress bars y formato i18n. `quota=null` → "ilimitado"; `quota=0` → "no incluido"; `current >= quota` → color rojo.
- `InvoicesList.tsx` — Server Component. Tabla con date/amount/status pill/PDF link. Empty state para trialing.
- `SubscriptionActions.tsx` — Client Component. CancelButton con modal de confirm + textarea de reason. ReactivateButton conditional. Ambos con `useTransition` + `router.refresh()`.

**Página integrada** (`src/app/dashboard/plan/page.tsx`):

- Paraleliza 4 fetches: `/subscriptions/me` + `/subscriptions/plans` + `/subscriptions/usage` + `/subscriptions/invoices?limit=12`.
- `dynamic = "force-dynamic"` — usage cambia en cada visita.
- Render: UpgradeCards (FREE) o ActiveSubscription card (Pro) → UsageCards → InvoicesList.
- `ActiveSubscription` ahora incluye Stripe Portal + SubscriptionActions inline.

### Mobile (`apps/mobile`)

**Componentes nuevos** (`src/components/dashboard/plan/`):

- `UsageCards.tsx` — RN paridad de web. Grid 2x2.
- `InvoicesList.tsx` — Lista stack con `Linking.openURL` para PDF.
- `SubscriptionActions.tsx` — Card con badge de plan, fecha de renovación/cancelación, 3 botones (Gestionar/Cancelar/Reactivar). Modal RN para confirm.

**Pantalla integrada** (`app/(tabs)/plan.tsx`):

- `loadAll()` orquesta 4 fetches en paralelo (`getMySubscription`, `getPlans`, `getUsage`, `listInvoices`).
- Pull-to-refresh con `RefreshControl`.
- Active sub → `SubscriptionActions` card.
- Siempre → `UsageCards`.
- Sub presente → `InvoicesList`.

### Shared (`@psico/api-client`)

- Nuevo método: `subscriptionApi.getMySubscription()` (faltaba; cubrir gap del cliente).
- `generated.ts` ya estaba alineado con S7 — no se regenera.

---

## §3 · Decisiones de diseño

### `UsageCards` visible para FREE también

Aunque FREE no tiene quota numérica en algunos counters, mostrar los counters con su quota (ej. "0 de 200 mensajes Eco") sirve como **preview educativo**: el usuario entiende qué va a desbloquear al upgradear. Es lo que el design 09-plan.md sugiere implícitamente al unificar Mi Plan en una sola ruta.

### Server vs Client Components

- `UsageCards` y `InvoicesList` son Server Components puros — reciben data ya fetched. Las páginas SSR-renderean con SEO + Time-to-First-Byte óptimo.
- `SubscriptionActions` es Client Component porque maneja modal state + `useTransition`. Importa los server actions y los invoca.

### Reason capture cancel

El backend acepta `reason` opcional y lo guarda en metadata de Stripe. El cliente lo expone como textarea libre (480 char cap). NO marcamos "tipos de razón" estructurados todavía — esperar señal real de los primeros 50-100 cancels antes de invertir en un dropdown taxonómico.

### Mobile sin `router.refresh()` equivalent

En RN no hay `revalidatePath` ni `router.refresh()`. El `SubscriptionActions` mobile recibe `onChanged` callback; el padre `PlanScreen` pasa `loadAll`. Cuando una acción tiene éxito, re-fetchea todo (4 paralelos, ~200ms). Stale UI window: ~300ms vs ~50ms en web — aceptable.

### Pull-to-refresh solo mobile

Web tiene `revalidatePath` después de cada server action — no necesita refresh manual. Mobile tiene RefreshControl para los usuarios que regresan después de gestionar la sub en el Stripe Portal (link externo abierto en browser).

---

## §4 · UX trade-offs

### Cancel modal en lugar de confirm nativo

El web hace su propio modal (no `confirm()`) porque queremos capturar la razón. En mobile sí podríamos usar `Alert.alert` que es nativo, pero capturar texto en `Alert.alert.prompt` solo existe en iOS — no funciona en Android. Modal RN custom es la opción cross-platform.

### Sin loading spinner global

Cuando el usuario hace pull-to-refresh, solo el spinner del RefreshControl es visible — no overlayeamos la pantalla. Los datos actuales se mantienen en pantalla durante el fetch (stale-while-revalidate pattern). Menos jarring.

### Color rojo cuando `current >= quota`

Una sutil señal visual sin gritar al usuario. Si el progress bar está en rojo y el contador rojo, sabes que estás capped sin tener que leer.

### PDF link via `Linking.openURL` (mobile)

Stripe genera URLs hosted con tokens de corta vida. Abrir en el browser nativo (a) muestra el PDF en el viewer del OS, (b) permite "Guardar en Files" / "Compartir". Más útil que renderear in-app.

---

## §5 · Bugs corregidos durante el sprint

1. **`Colors.sage[700]` no existe** — el theme mobile solo expone `50, 100, 400, 500, 600`. Fix: usar `Colors.sage[600]` en `InvoicesList` y `SubscriptionActions`.
2. **`subscriptionApi.getMySubscription` faltaba en `@psico/api-client`.** El backend lo expone desde S4, pero el cliente nunca lo había wrapped. Añadido — sin breaking changes.
3. **TypeScript strict null check en `inv.pdfUrl`** — el `<a href={inv.pdfUrl}>` y `Linking.openURL(inv.pdfUrl)` requieren narrow. Web usa ternario, mobile usa `!` después del null-check del componente padre (el guard `{inv.pdfUrl ? ...}` ya garantiza).

---

## §6 · Deuda técnica abierta

- **Sin tests de los componentes UI.** Vitest + React Testing Library para web, Vitest + Testing Library + RN para mobile. Esperamos hasta tener más componentes para amortizar el costo de setup.
- **Empty state de "ya estás en B2B"** mobile dice "estás en el mejor plan disponible" pero no aclara que no hay nada que upgradear — copy aceptable para v1, mejorar cuando aparezcan los primeros B2B.
- **`Linking.openURL` no maneja deep-link return** desde Stripe Portal mobile — el user vuelve a la app manualmente. Lo correcto es scheme deep link (`psico://account`) pero requiere setup de Universal Links / App Links. v2.
- **Web `<table>` no es responsive en mobile narrow.** Aceptable porque el web es desktop-first; mobile usa la app nativa. Si el web mobile breakpoint se vuelve crítico, swap por cards.
- **Sin error toast global.** Cuando el server action falla en web, el error aparece dentro del modal. Mobile usa `Alert.alert`. Un toast pattern unificado sería mejor pero no bloquea ship.

---

## §7 · Verificación

```bash
# back (sin cambios)
pnpm --filter @psico/api test          # 323/323 ✓
pnpm --filter @psico/api typecheck     # ✓
pnpm --filter @psico/api lint          # ✓

# web
pnpm --filter @psico/web typecheck     # ✓
pnpm --filter @psico/web lint          # ✓
pnpm --filter @psico/web build         # ✓ (Next.js compiled successfully)

# mobile
pnpm --filter @psico/mobile typecheck  # ✓
pnpm --filter @psico/mobile lint       # ✓

# shared
pnpm --filter @psico/api-client build  # ✓ (81.65 KB d.ts)
pnpm --filter @psico/api-client generate:check   # ✓ in sync
```

---

## §8 · Resumen para Notion

**¿Qué se construyó?** Pantalla Mi Plan extendida en web y mobile, consumiendo los endpoints de S7. 4 mini-cards de usage en vivo (libros/eco/voz/diario con progress bars), lista de facturas Stripe con PDF link, botones de cancelar (con modal de razón) y reactivar. Server actions con `revalidatePath` en web; pull-to-refresh + callback prop en mobile. Sin tests UI todavía.

**¿Qué viene?** Próximos sprints UI:

- **Sprint front-voz** (web + mobile): MediaRecorder + `/voz/transcribe` con integración al composer del Diario.
- **Sprint front-eco** (web + mobile): chat con SSE streaming, sidebar de threads, crisis modal, report menu.

**Bloqueante de deploy** (acumulado desde S5): 10 migraciones Prisma + 5 envs (ANTHROPIC/OPENAI/DEEPGRAM/RESEND/REDIS) sin configurar en Railway. La UI funciona en local; producción requiere esa ventana de mantenimiento.
