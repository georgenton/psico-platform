# Sprint Sentry — Observability en los 4 surfaces

**Fecha:** 2026-06-17
**Rama:** `feature/sprint-sentry`
**Tests:** 667/668 API (+7 nuevos · 1 skipped sentinel) + 34 crypto + 135 web + 29 mobile
**Roadmap:** [docs/ROADMAP.md §3-4 — Sprint 2 Sentry wire](../ROADMAP.md)

---

## Lo que se construyó

Cierra el Sprint 2 del roadmap: cuando un user reporte un bug en prod ahora hay traza accesible en Sentry sin tener que recrear el ambiente. Cubre los 4 surfaces:

1. **API NestJS** — `@sentry/node@^8`, init en `main.ts` antes de cualquier otro import, hook al `HttpExceptionFilter` para 5xx, env `SENTRY_DSN` + `SENTRY_RELEASE` opcionales.
2. **Worker** — mismo SDK, init en `worker.ts`. BullMQ failures pasan por la misma instancia.
3. **Web Next.js** — `@sentry/nextjs@^8` con la tríada `instrumentation.ts` + `sentry.server.config.ts` + `sentry.client.config.ts` + `sentry.edge.config.ts`. DSN cliente vs server separado (`NEXT_PUBLIC_SENTRY_DSN` vs `SENTRY_DSN`).
4. **Mobile Expo** — `@sentry/react-native@^6`, init en `app/_layout.tsx` antes de que el primer screen renderee.

### API + worker

**`apps/api/src/observability/sentry.ts`** — helper compartido. Pattern:

- `initSentry()` lee `SENTRY_DSN`. Sin DSN, no-op silente (dev/test).
- `initialised` flag para idempotencia (main.ts + worker.ts ambos llaman).
- `sentryEnabled` flag separado para que `captureException` early-return cuando NO hay DSN — aunque `initSentry()` haya corrido.
- `beforeSend` scrubea `authorization` / `cookie` / `x-api-key` / `stripe-signature` antes de enviar.
- `tracesSampleRate: 0.1` en prod (10 % de requests), 1.0 en dev.
- `sendDefaultPii: false` — combinado con E2E cripto (ADR-0007), nunca llega body del Diario/Eco a Sentry.

**`apps/api/src/main.ts`** + **`apps/api/src/worker.ts`** — import + invocación del `initSentry()` **antes** de cualquier otro require para que el auto-instrument de SDK pueda patchear http/pg/undici al cargar.

**`apps/api/src/shared/filters/http-exception.filter.ts`** — branch 5xx ya logueaba con stack; ahora también llama `captureException(exception, { method, path, statusCode, code })`. 4xx siguen sin enviarse (user input → noise para Sentry).

### Web

**`apps/web/instrumentation.ts`** — el hook canónico de Next.js 14+. Detecta `process.env.NEXT_RUNTIME` y delega al config apropiado:

- `nodejs` → `sentry.server.config.ts`
- `edge` → `sentry.edge.config.ts`

**`sentry.server.config.ts`** y **`sentry.edge.config.ts`** — init con `SENTRY_DSN` server-side. Edge usa `tracesSampleRate: 0.05` (middleware corre por cada request → sample más bajo).

**`sentry.client.config.ts`** — init con `NEXT_PUBLIC_SENTRY_DSN`. **Session Replay OFF** explícitamente porque grabaría la DOM mutations del composer del Diario abierto = leak de texto plano.

### Mobile

**`apps/mobile/src/observability/sentry.ts`** — wrapper paralelo al de la API. Init con `EXPO_PUBLIC_SENTRY_DSN`. Defensive privacy:

- `attachScreenshot: false`
- `attachViewHierarchy: false`
- `sendDefaultPii: false`

Por la misma razón del web: una pantalla del Diario abierta tiene plaintext renderizado.

**`apps/mobile/app/_layout.tsx`** — `initSentry()` al top-level del archivo (module load), antes que ningún screen renderee.

---

## Decisiones

1. **`@sentry/node@^8` para API + worker** — la versión 8 reescribió el instrumentation framework a OpenTelemetry. Mejor performance + el patrón es estable.
2. **`sentryEnabled` flag separado de `initialised`** — distingue "init corrió como no-op" de "init wired al SDK real". Sin esto, `captureException` reenviaría a un SDK fake en dev y los tests no podrían assert no-op.
3. **`beforeSend` scrubea 4 headers conocidos** — Sentry tiene scrub default para `authorization`/`cookie` pero NO para `stripe-signature` ni `x-api-key`. Los añadimos defensivamente.
4. **Session Replay y screenshots HARD-OFF en cliente** (web + mobile) — la composer del Diario tiene plaintext en pantalla. Session replay grabaría las mutations del textarea = leak. Mismo razonamiento para attachScreenshot mobile. Wired off explícitamente, no por default.
5. **`tracesSampleRate` 0.1 prod / 1.0 dev** — 10 % es Sentry default para SaaS de este tamaño. Edge baja a 0.05 porque middleware corre en cada request.
6. **DSN distinto cliente vs server en web** — `NEXT_PUBLIC_SENTRY_DSN` se incrusta en el bundle del cliente (público); `SENTRY_DSN` queda server-side. Sentry recomienda usar proyectos separados pero el mismo DSN también funciona; lo dejamos abierto al usuario para decidir en Railway/Vercel.
7. **No metí el wizard `npx @sentry/wizard@latest -i nextjs`** — el wizard inyecta `next.config.js` mods + source map upload + un `global-error.tsx` boilerplate. Para v1 prefiero el wire mínimo controlable; cuando se quiera source maps + tunneling para ad-block bypass, correr el wizard sobre lo existente.
8. **No expongo `Sentry.captureMessage` desde el wrapper** — solo `captureException`. Mensajes informativos van al Nest logger, no a Sentry, para mantener la señal alta.

---

## Smoke verification

```
@psico/api tests       667/668 (+7 nuevos del Sentry helper)
@psico/api typecheck   OK
@psico/api lint        OK (4 warnings preexistentes)
@psico/web tests       135/135 (sin cambios — el wire no toca componentes)
@psico/web typecheck   OK
@psico/web lint        OK
@psico/mobile tests    29/29 (sin cambios)
@psico/mobile typecheck OK
@psico/mobile lint     OK
```

---

## Qué queda para activar Sentry en prod (ops)

Estas tareas son del usuario (en Sentry + Railway + Vercel):

1. **Crear el proyecto Sentry** (https://sentry.io → Create Project → Node + Next.js + React Native).
2. **Copiar 3 DSNs** (uno por surface o uno único — decisión del usuario):
   - API + worker → `SENTRY_DSN` en Railway (ambos services).
   - Web server → `SENTRY_DSN` en Vercel (production env).
   - Web cliente → `NEXT_PUBLIC_SENTRY_DSN` en Vercel.
   - Mobile → `EXPO_PUBLIC_SENTRY_DSN` en EAS Build secrets (o `app.config.ts`).
3. **Opcional pero recomendado:** `SENTRY_RELEASE` por surface — useful para el dashboard "Issues by Release". Auto-poblable desde Vercel git SHA: `SENTRY_RELEASE=$VERCEL_GIT_COMMIT_SHA`.
4. **Validar:** después del deploy, throw un 500 controlado (`throw new Error("sentry-smoke")` en un endpoint admin-only) y confirmar que aparece en el dashboard.

---

## Deuda técnica abierta

- **Source maps web no se suben automáticamente** — el wizard de `@sentry/nextjs` configura un `withSentryConfig` wrapper en `next.config.js` que sube source maps al build. Sin él, los stack traces salen minificados. Para v1 con poco volumen es aceptable; cuando importe, correr `pnpm dlx @sentry/wizard@latest -i nextjs` sobre el proyecto.
- **Mobile config plugin no añadido a `app.json`** — `@sentry/react-native` tiene un Expo config plugin que setea el dSYM upload para iOS y el ProGuard mapping para Android. Sin él, los crashes nativos quedan medio-minificados. Activar antes de submit a App Store.
- **Sin tests UI dedicados** del wire web/mobile — el SDK se mockéa pero el test de "init runs at module load" requiere harness adicional.
- **BullMQ failure event no wireado a Sentry** explícitamente — los processors ya throwean y eso lo captura el Nest exception handler via console.error. Si en el futuro queremos métricas finer, agregar `worker.on("failed", (job, err) => captureException(err, {...}))`.
- **`Sentry.captureMessage` no expuesto** — si en el futuro quieres un breadcrumb para cierto evento (e.g. "Stripe webhook procesado"), agregar un `captureMessage` al wrapper.

---

## Próximo paso

Sprint 3 del roadmap: **E2E re-encrypt test + LectorShell UI tests**. Cierra dos deudas técnicas: el full-circle del Diario re-encrypt y el container del Lector sin coverage.
