---
"@psico/types": minor
"@psico/api-client": minor
---

Plan v2 foundation + Fase 1 core (Sprints 0.A through S4)

## `@psico/types` — 0.7.0 → 0.8.0

Added types for new feature surfaces:

- **Users** (Sesión 9): `UserMeResponse`, `UserStats`, `AchievementProgress`, `UserPreferences`, `UserReaderPreferences`, `UserNotificationSettings`, `UserPrivacySettings`, `UpdateProfileRequest`, `PasswordChangeRequest`, `DeleteAccountRequest`, `EmailChangeRequestPayload`, `AvatarUploadResponse`, and 14 more.
- **Onboarding** (Sprint S4): `OnboardingIntro`, `OnboardingMotivo`, `OnboardingMood`, `OnboardingTourStep`, `OnboardingVoicePreference`, `OnboardingStep1Request`, `OnboardingStep2Request`, `OnboardingStep3Request`, `OnboardingBookRecommendation`, `OnboardingRecommendationResponse`, `OnboardingCompleteRequest`, `OnboardingCompleteResponse`, `OnboardingTourCompleteRequest`, `OnboardingStepResponse`.

All additions — no breaking changes to existing exports.

## `@psico/api-client` — 0.0.6 → 0.1.0

Pipeline change: `generated.ts` is now auto-emitted from `apps/api/openapi.json` via `openapi-typescript`.

- New file: `src/generated.ts` (auto-generated, 44.9 KB at the time of this release).
- New script: `pnpm generate` writes the file; `pnpm generate:check` is used by CI to block PRs with back↔client drift.
- New CI workflow `.github/workflows/openapi-diff.yml` enforces the contract.
- Re-exports `paths`, `components`, `operations` from `generated.ts` at the package root.
- All existing exports (`apiClient`, `authApi`, `contentApi`, `subscriptionApi`, `ApiError`) preserved with identical signatures.

Why this is a `minor` and not `major` despite the pipeline change: the public API of `@psico/api-client` (the functions consumers call) didn't change. The new exports are additive. Existing consumers continue to work.

ADRs introduced in this release:

- [0006 — Global API prefix + URI versioning](../docs/adr/0006-global-prefix-uri-versioning.md)
- [0007 — E2E encryption Diario/Eco](../docs/adr/0007-e2e-encryption-diario-eco.md) (anticipated, applies in S6/S9)
- [0008 — Rate limiting + Idempotency + OpenAPI codegen](../docs/adr/0008-rate-limiting-idempotency-openapi-codegen.md)
- [0009 — OAuth via Google ID token verification](../docs/adr/0009-oauth-with-google-id-token.md)
- [0010 — BullMQ worker: same codebase, separate Railway service](../docs/adr/0010-bullmq-worker-same-codebase-separate-service.md)
