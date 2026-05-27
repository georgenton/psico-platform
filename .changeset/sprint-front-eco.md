---
"@psico/api-client": patch
"@psico/web": minor
"@psico/mobile": minor
---

Sprint front-eco — Chat UI (web + mobile) consuming the S10 EcoModule.

**Shared:**

- `DiaryKeyContext` exposes a new `ecoKey` field (derived from `masterKey`
  via HKDF/ECO_KEY_INFO in `unlock` and `adoptMasterKey`, zeroed in `lock`).
  Mobile `diaryKeyStore` persists it to SecureStore alongside the diary key.
- `@psico/api-client`: new `apiClient.getAccessToken()` so the SSE
  `sendMessage` path can grab the token from the configured store without
  exposing the whole `TokenStore`.

**Web (`apps/web`):**

- `/dashboard/eco` route with server-rendered shell (caps + threads) and
  client `EcoShell` that owns rail + active thread state.
- `ThreadRail` sidebar component with inline title decryption.
- `ChatArea` with message history, encrypted USER bubbles, SSE consumer
  that streams `delta` events into a live assistant bubble and falls through
  to a non-dismissable `CrisisModal` on `crisis` event.
- `@psico/api-client` added as a `workspace:*` dep (was missing — web had
  only ever used its own `lib/api.ts`).
- DashboardShell nav: new "🌿 Eco" entry.

**Mobile (`apps/mobile`):**

- `(tabs)/eco` route with `KeyboardAvoidingView` + auto-scrolling
  `ScrollView`. Bottom-sheet `ThreadRailModal` instead of a permanent
  sidebar (idiomatic mobile pattern).
- Same `CrisisModal` with `tel:` deep-link via `Linking.openURL`.
- Eco registered as a visible tab with the `leaf` icon, between Diario and
  Mi plan.

Decisions documented in docs/informes/sprint-front-eco.md §4.
