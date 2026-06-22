# Sprint G-polish — Re-trigger tour button en /dashboard/security

**Fecha:** 2026-06-21
**Rama:** `feat/sprint-g-polish-replay-tour`
**Tests:** 727/728 API (+2 polish) + 228/228 web

## Contexto

Sprint S37 dejó la deuda explícita: "No vuelve a aparecer si user lo cierra (intencional, pero podría añadirse botón 'Volver a ver el tour' en Seguridad)". Este sprint cierra ese gap.

## Lo que se construyó

### Backend

- `POST /api/onboarding/tour/reset` — nuevo endpoint. Sets `tourCompletedAt = null` + `tourStepsCompleted = 0`. Idempotente: upsert que crea fila vacía si user nunca terminó onboarding.
- `OnboardingService.resetTour(userId)` — JSDoc explica por qué se borra `stepsCompleted` (para que analytics no infle el contador en un replay).
- 2 tests nuevos en `onboarding.service.spec.ts` (null update + create branch).
- Handler count en `onboarding.controller.spec.ts` actualizado 11 → 12.

### Web

- `apps/web/src/components/dashboard/security/ReplayTourCard.tsx` — Client Component con state machine (idle → submitting → done). On success redirige a `/dashboard` y llama `router.refresh()` para que el layout re-evalúe el predicate del TourOverlay.
- `apps/web/src/app/dashboard/security/actions.ts` — Server action `replayTourAction` con discriminated result.
- `/dashboard/security/page.tsx` — wired la card al final.

### Cliente

- `packages/api-client/src/generated.ts` regenerated (336 KB).

## Decisiones

1. **Idempotente sin throw** — re-resetting un row vacío recreates con `userId` only. Seguro para ops scripts.
2. **`stepsCompleted = 0`** — analytics empieza fresh en cada replay. Single source of truth para tour completion analytics.
3. **Redirect a `/dashboard` + `router.refresh()`** — el TourOverlay vive en `dashboard/layout.tsx`, re-mount con tourCompletedAt null re-dispara.
4. **Card en Seguridad, no Notificaciones** — es una acción account-level. UI ya tiene 3 cards en Notifs.
5. **Sin telemetría** — si el equipo quiere ratio replay/complete, posthog en el clic, no en server. Pulso v2 admin lo capturará cuando lleguen events.

## Verificación

- `pnpm --filter @psico/api typecheck` ✅
- `pnpm --filter @psico/api test` → 727/728 (+2 polish · 1 skipped sentinel)
- `pnpm --filter @psico/web typecheck` ✅
- `pnpm --filter @psico/web lint` ✅
- `pnpm --filter @psico/web test` → 228/228 (sin cambios)
- `pnpm --filter @psico/api-client generate:check` ✅

## Deuda técnica abierta

- **Mobile equivalent** — la onboarding tour overlay mobile (S37) tampoco tiene replay. Sprint propio para mobile.
- **Tests UI del `ReplayTourCard`** — Client Component con `useTransition` + `useRouter`. Sigue el patrón del `TimezoneCard` test de S54. Diferido a un sprint UI tests dedicado.
- **Analytics ratio replay/complete** — no urgente, capturar con Pulso v2 cuando aterrice.

## Privacy invariant

Endpoint solo escribe a `OnboardingState` (audit table). No toca cripto, no exporta datos. ADR 0007 intacto.
