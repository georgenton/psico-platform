---
"@psico/api-client": minor
"@psico/types": minor
"@psico/web": minor
"@psico/mobile": minor
---

Sprint S4-front — Onboarding UI (web + mobile) consuming the 11 endpoints
from Sesión 16 backend.

**Backend (minimal change)**

- `UserMeResponse` exposes new `onboardingState: { completedAt, skippedAt,
tourCompletedAt } | null` so the front can gate without an extra fetch.
  No DB migration — `OnboardingState` model already existed.

**Client**

- `onboardingApi` in `@psico/api-client`: all 11 methods (getIntro/skip/
  motivos/step1/moods/step2/step3/recommendation/complete/tour/tourComplete).

**Web (`apps/web`)**

- New route group `/onboarding` with 5 pages (welcome, motivos, mood,
  perfil, recomendación). Server Components prefetch catalogs; Client
  Components own form state and submit via Server Actions in
  `actions/onboarding.ts`.
- `dashboard/layout.tsx` redirects to `/onboarding` when neither
  `completedAt` nor `skippedAt` are set.
- `onboarding/layout.tsx` does the reverse: redirect to `/dashboard` if
  the user already finished onboarding.
- `OnboardingShell` shows progress dots + Skip button + brand mark.

**Mobile (`apps/mobile`)**

- `app/onboarding.tsx` — single screen with a `step: 0|1|2|3|4` state
  machine (justified trade-off vs. 5-screen stack; details in bitácora).
- `(tabs)/_layout.tsx` fetches `/user/me` on mount and `<Redirect>`s to
  `/onboarding` if pending. Loading spinner during the fetch so the
  tabbar never flashes before the decision is made.

**Deferred to a future sprint**

- Tour overlay (backend ready; UI requires tooltip lib decision).
- Transition animations between steps.

Decisions documented in `docs/informes/sprint-s4-front-onboarding.md`.
