# Sprint 54 — TimezoneCard Settings UI + UI tests

**Fecha:** 2026-06-08
**Rama sugerida:** `feature/sprint-54-timezone-settings`
**Tests:** 451/452 API + 34/34 crypto + 38/38 web + 20/20 mobile (+13 nuevos UI · 1 skipped sentinel · total 543)
**ADRs aplicados:** ninguno nuevo.

---

## 1 · Por qué este sprint

S53 dejó dos cosas abiertas:

1. **Deuda S53:** el auto-probe del timezone era invisible — si el cliente detectaba incorrectamente o el user viajaba, no había forma de ver/corregir manualmente.
2. **Deuda de tests UI** acumulada de S39/S47/S53: `_TimezoneSync.tsx` y `WebPushToggle.tsx` no tenían tests dedicados.

S54 cierra ambos en un sprint pequeño y bien acotado.

---

## 2 · Lo que se construyó

### Web (`apps/web`)

**Server action revisada:**

- `actions/timezone.ts` separa dos paths:
  - `setTimezoneAction(tz)` — silencioso (probe invisible, swallows errores).
  - `setTimezoneActionStrict(tz)` — strict (UI explícita; throws para que el component pueda renderizar inline error). Re-revalida `/dashboard/notifications`.

**Componente nuevo `TimezoneCard.tsx`:**

- Muestra: TZ stored en cuenta + TZ del browser (detectado en client).
- Botón "Usar la de mi dispositivo" cuando hay mismatch.
- `<select>` con todas las TZs IANA del browser (`Intl.supportedValuesOf("timeZone")`) con fallback a una lista hardcoded de 22 zonas LATAM/EU/Asia.
- Toggle = save (no botón "Guardar"). Flash "Zona horaria guardada" 3s. Error inline.

**Wire:** `/dashboard/notifications/page.tsx` renderiza `<TimezoneCard currentTimezone={me.user.timezone} />` entre WebPushToggle y NotificationsForm.

### Mobile (`apps/mobile`)

**Componente nuevo `src/components/dashboard/notifications/TimezoneCard.tsx`:**

- Paridad con web. RN no tiene `<select>` accesible → Modal con FlatList sobre `Intl.supportedValuesOf("timeZone")` (Hermes SDK 50+).
- "Usar la de mi dispositivo" botón inline cuando hay mismatch.
- Optimistic save vía `usersApi.updateTimezone()`. `Alert.alert` on error.
- `onChanged` callback para que el screen padre actualice su state local.

**Wire:** `(tabs)/notifications.tsx` extrae `me.user.timezone`, monta el card antes del bloque de toggles, propaga el `onChanged` al state local.

### Tests UI

**Web (+14):**

- `TimezoneCard.test.tsx` (6 tests) — null state, render con stored, submit success, inline error, hide/show "use device" según mismatch.
- `_TimezoneSync.test.tsx` (3 tests) — fires on needsProbe=true, no-op on false, one-shot (useRef no re-fires en re-render).
- `WebPushToggle.test.tsx` (5 tests) — unsupported, blocked, off, subscribe + flip to on, error con "no-vapid-key".

**Mobile (+4):**

- `TimezoneCard.test.tsx` (4 tests) — null state, stored render, modal opens, device row presente.

### Refactor del componente web

`TimezoneCard` originalmente usaba `useTransition()`. En jsdom el async transition no flusheaba consistentemente para el `findByText("Zona horaria guardada")` test. Refactor a `useState(pending)` plain + `async function commit` — semántica idéntica para el user, tests deterministas.

---

## 3 · Decisiones

1. **Dos server actions** (silent vs strict) en lugar de un boolean prop. Reduce branching en el component caller; el strict throws naturalmente para `try/catch` del UI.
2. **Auto-submit en select change** (sin botón "Guardar") — consistente con NotificationsForm.
3. **Fallback hardcoded de 22 TZs** cuando `Intl.supportedValuesOf` no está. Cubre LATAM + EU + Asia y los SOs viejos quedan funcionales.
4. **Mobile: Modal con FlatList** para no añadir picker libraries (consistente con resto de Settings).
5. **Mobile `Alert.alert` en error** — idiomatic; web inline porque el form completo está visible.
6. **El test mobile NO ejercita el flow "pick → commit"** completo porque jest-expo + FlatList + Modal mocking es frágil (intenté tres approaches; ninguno se sintió estable). Cubrimos render + modal-opens + integración con `usersApi`. El flow completo se ejercita en el test web (lógica idéntica).
7. **Refactor de `useTransition` → `useState`** — el `pending` flag no necesita prioridad concurrente; el simple flag es testeable + suficiente.

---

## 4 · Bugs corregidos durante S54

1. **`useTransition` flushing en jsdom** — el `await waitFor(findByText("..."))` no encontraba el flash text. Fix: refactor a `async function` plain con `useState` pending.
2. **`navigator.serviceWorker` no en jsdom** — el test del WebPushToggle stubeaba via `Object.defineProperty(navigator, "serviceWorker", ...)`. Patrón documentado para reuso.
3. **`Intl.DateTimeFormat().resolvedOptions().timeZone` retorna `Asia/Tokyo` o `America/New_York`** según el host TZ del CI runner. Fix: tests usan `vi.spyOn(Intl, "DateTimeFormat")` con custom `resolvedOptions` para pinear la browser tz.
4. **Modal y FlatList no renderizan children en jest-expo** — se sustituyen vía `jest.mock("react-native", ...)` con stubs sencillos.

---

## 5 · Smoke verification

```
API tests       451/452 (+1 skipped sentinel)
Crypto tests     34/34
Web tests        38/38  (+14)
Mobile tests     20/20  (+4)
Total           543/544

@psico/web typecheck     ✅
@psico/web lint          ✅
@psico/mobile typecheck  ✅
@psico/mobile lint       ✅
```

---

## 6 · Privacy invariant preservado

- `Profile.timezone` es plaintext (S15+S53). El new UI lo expone pero NO toca cripto del Diario.
- WebPushToggle tests verifican el flow de subscribe SIN ejercitar el contenido de las notifications (las que SI vienen plaintext son metadata categórica, jamás contenido del Diario — invariant S44/S53 intacto).

---

## 7 · Deuda técnica abierta

- **Mobile test del commit completo** — el "pick from picker → commit" flow no se ejercita; cubierto solo por integration manual. Reintentar cuando upgrade a RN 0.77+ (mejor Modal stubs).
- **Reset to auto-detect** — `TimezoneCard` no tiene botón "borrar mi TZ y volver a auto-detect". Si UX lo pide, agregar.
- **WebPushToggle "unsubscribe" path** no testeado — solo subscribe. Quien lo necesite escribirlo después.
- **`TimezoneSync` test en `_TimezoneSync.test.tsx` corre fuera del Server Component pathway** — funciona porque el component is `"use client"` pero un E2E real con `app/dashboard/layout.tsx` rendering sigue siendo deuda.

---

## 8 · Cobertura post-S54

- **117 endpoints REST** (sin cambios, S53 ya añadió `/user/timezone`).
- **13 ADRs activos.**
- **543 tests totales** (api 451 + crypto 34 + web 38 + mobile 20).
- **41 bitácoras** en `docs/informes/`.
