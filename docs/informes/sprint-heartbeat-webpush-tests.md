# Sprint Heartbeat + Web Push Tests

**Fecha:** 2026-06-17
**Rama:** `chore/heartbeat-webpush-tests`
**Tests:** 152/152 web (+10 nuevos) · api/mobile/crypto sin cambios

---

## Lo que se construyó

Cierre de tres items del roadmap en un sprint pequeño. Audit previo con un agente reveló:

- **Item 13 (Settings UI: explicit TZ selector)**: ya shipped en S54. `TimezoneCard.tsx` tiene stored vs browser TZ + dropdown IANA + botón "Usar la de mi dispositivo" + 6 tests. **Verdict: DONE.** Lo marcamos en el roadmap sin más trabajo.
- **Item 12 (Web Push toggle UI)**: código completo, faltaba un test del path de unsubscribe (test file ya mockeaba la función pero no la ejercitaba).
- **Deuda Sprint 3 (use-heartbeat hook test)**: el hook no tenía test propio.

Cubrimos los dos test gaps.

### use-heartbeat tests

`apps/web/src/components/dashboard/lector/use-heartbeat.test.tsx` — 9 tests con `vi.useFakeTimers()` + spy del global `fetch`:

- No hay fetch en el mount (la primera beat espera 5 s).
- PATCH cada 5 s con visibility OK.
- Payload shape: URL, method, keepalive, Authorization header, body con `bookId/chapterOrder/lastBlockId/timeSpentDeltaSec/progressPct`.
- Gating: `document.hidden = true` → no fetch.
- Gating: `read() === null` → no fetch.
- Network errors swallowed silentemente (sin throw, sin rejection bubbling).
- `onProgress` se llama con el `progressPct` del response cuando 200.
- `onProgress` NO se llama cuando server devuelve 429.
- `clearInterval` en unmount detiene el loop.

### WebPushToggle unsubscribe path

Añadido el test que faltaba al test file existente:

> "unsubscribes and flips back to 'off' when the user clicks Desactivar"

Setup de cold-start: feature supported + permission `granted` + subscription existente en el SW registration → el initial effect resuelve a phase "on" sin pasar por subscribe. Render → click "Desactivar" → assert `unsubscribeWebPush("/api", "tok", "")` + UI vuelve a estado off (CTA "Activar" visible).

---

## Decisiones

1. **Audit antes de trabajar** — la lección de Sprint 5. El item 13 estaba en el roadmap como pendiente pero el agente lo confirmó shipped en S54 con 6 tests.
2. **Tests del hook con `renderHook` + fake timers** — `renderHook` del `@testing-library/react` da `unmount()` para verificar cleanup. Más limpio que envolver en un componente test.
3. **Mock del `fetch` global con `vi.spyOn(globalThis, "fetch")`** — mismo patrón que el AudioBar test del sprint anterior. Tipo `MockInstance<typeof fetch>` no necesario porque solo lo usamos para spyOn count + capture de args.
4. **Test del unsubscribe cold-start, no post-subscribe** — testear el camino real: user cierra el browser, vuelve, ve "Desactivar", lo clickea. Más realista que "subscribe then immediately unsubscribe in the same session" (que tampoco está mal pero duplica el subscribe path test).
5. **`deviceTokenId ?? ""`** en el call expected — el componente trackea el deviceTokenId solo cuando subscribe corre EN la misma sesión. En cold-start es null → fallback a "". Documentado inline en el test.

---

## Smoke verification

```
@psico/web tests       152/152 (+10 nuevos)
@psico/web typecheck   OK
@psico/web lint        OK
```

---

## Deuda técnica abierta

- **LectorShell annotations CRUD path test** — sigue siendo deuda mencionada en Sprint 3 (los 7 tests existentes cubren render contract, no el flow completo de create/update/delete annotation).
- **Web Push cold-start con permission `default` + subscription residual** — el componente lee el SW directamente; si el SW está stale, el estado mostrado podría desfasarse. Hoy no es problema porque el SW se actualiza al cargar la página.
- **Item 12 ops** — VAPID keys en Vercel siguen pendientes para validar el push real end-to-end. Sin eso el feature ship-able pero no testeable en prod.

---

## Próximo paso

El roadmap polish queda con dos items "no-ops" pendientes:

- **#9 Testcontainers para E2E API** — el test rekey sigue con Prisma mock. Infraestructura.
- **#10 `expo-av` → `expo-audio`** — 3-5 días. Habilita metadata dinámica de lock-screen + dSYM upload.

O alternativa: **moverse a freeze + validación de v1**. Solo faltan los 3 items ops (Stripe price IDs + API keys + ffmpeg embed real en R2).
