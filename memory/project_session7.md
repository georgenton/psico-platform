---
name: Session 7 — Mobile app Expo Router
description: Mobile app completed in Session 7 — auth flow, tabs, books with lock, plans with Stripe checkout
type: project
---

Session 7 (2026-05-06) completed mobile app (`apps/mobile`).

**Why:** M4-6 roadmap milestone — mobile app + AI.

**What was built:**

- `expo-secure-store` ~14.0.1 installed; `@expo/vector-icons` ~14.0.4
- `@psico/api-client` fully implemented: `ApiError`, `PsicoApiClient` singleton with auto-refresh, `authApi`, `contentApi`, `subscriptionApi`
- `apps/mobile/src/theme.ts` — exact color tokens from web globals.css (lavender/sage/warm)
- `apps/mobile/src/store/secure-store.ts` — SecureStore helpers (saveTokens/loadTokens/clearTokens)
- `apps/mobile/src/context/auth.tsx` — AuthContext with user, isLoading, isAuthenticated, login, register, logout; cold-start session restore via direct fetch (bypasses retry loop)
- `apps/mobile/.env` — `EXPO_PUBLIC_API_URL=https://psico-platform-production.up.railway.app`
- Expo Router structure: `(auth)/login`, `(auth)/register`, `(tabs)/index` (home), `(tabs)/books/index` (grid + lock overlay), `(tabs)/books/[slug]` (detail + upgrade CTA), `(tabs)/plan` (Stripe checkout via Linking.openURL), `(tabs)/profile` (avatar + logout)

**Typecheck: 10/10 ✅**

**How to apply:** When working on the mobile app, use `pnpm --filter @psico/mobile start` to launch. After modifying `@psico/api-client`, run `pnpm --filter @psico/api-client build` before starting Metro.

**Next:** EAS Build config, push notifications, audio player, AI companion screen (Session 8).
