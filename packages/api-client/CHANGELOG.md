# @psico/api-client

## 0.1.0

### Minor Changes

- 642d6e1: Plan v2 foundation + Fase 1 core (Sprints 0.A through S4)

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

- 0f5774a: Sprint S10 — AIModule conversacional (Eco).

  Six new endpoints close the conversational AI surface per
  docs/design/handoff/08-eco.md. Hybrid E2E encryption, SSE streaming,
  two-layer crisis detection, plan-aware quota enforcement.

  **Backend (`@psico/api`):**
  - `GET /api/eco/caps` — Eco persona (name, voice, capabilities).
  - `GET /api/eco/threads` — sidebar rail (last 50 threads).
  - `POST /api/eco/threads` — create a new thread.
  - `GET /api/eco/threads/:id?cursor=` — paginated thread view.
  - `DELETE /api/eco/threads/:id` — delete thread + cascaded messages.
  - `POST /api/eco/messages` — SSE-streamed reply. 30 req/min/user throttle.
  - `POST /api/eco/messages/:id/report` — flag a bad answer.

  Schema: `EcoThread`, `EcoMessage` (with `kind` enum: USER/ASSISTANT/CRISIS/
  SUGGESTION), `EcoMessageReport`. Backward-compat: legacy `Conversation` and
  `/ai/chat` endpoint untouched.

  **Crisis detection (two layers):**
  - Layer 1 (regex, pre-LLM): `isCrisisText()` matches unambiguous signals
    (`suicid`, `quitarme la vida`, `no quiero vivir`, English fallbacks).
    Accent-insensitive.
  - Layer 2 (LLM sentinel): system prompt instructs the model to respond
    only with `[CRISIS]` if it detects risk signals the regex missed.

  Both paths persist a `kind=CRISIS` message + emit a `crisis` SSE event
  with the Línea 1800-4-SALUD hotline.

  **Quotas (`PLAN_QUOTAS.eco`):**
  - FREE: 10 user messages per UTC day.
  - PRO/ANNUAL: 200 messages per billing period.
  - B2B: unlimited.

  Wires the last counter of `/api/subscriptions/usage` — every counter
  now reports real data. `DailyUsageProcessor` populates
  `BillingUsageDay.ecoMessages` nightly.

  **`@psico/types`:**
  - `EcoMessageKind`, `EcoMessageReportReason`, `EcoPersona`,
    `EcoThreadRailItem`, `EcoThreadListResponse`, `EcoThreadCreatedResponse`,
    `EcoMessage`, `EcoThreadResponse`, `EcoSendMessageRequest`,
    `EcoSseEvent` (union), `EcoReportMessageRequest`.

  **`@psico/api-client`:**
  - `ecoApi` with `getCaps`, `listThreads`, `createThread`, `getThread`,
    `deleteThread`, `sendMessage` (SSE consumer via fetch + reader),
    `reportMessage`.
  - `generated.ts` regenerated (67.0 KB → 72.2 KB).

- Sprint S10 (Sesión 35) — PatronesModule (Pro-gated diary analytics).

  **`@psico/types`** — 14 new shapes:
  - `PatronesPeriod` — union `"30d" | "90d" | "1y"`.
  - `PatronesPeriodDescriptor` — `{ from, to, label }`.
  - `PatronesMoodMapDay` — heatmap cell with `date`, `moodId`, `swatch`.
  - `PatronesHourMoodBucket` — `{ hour, moodCounts: Record<string, number> }`.
  - `PatronesWeeklySummary` — `{ weekStart, headline, narrative, entriesUsed, generatedAt }`.
  - `PatronesResponse` — soft-lock for FREE (`tier: "free"`, `locked: true`) or full Pro view.
  - `PatronesShareWithTherapistResponse` — `{ ok, status }` (stub until v2).

  **`@psico/api-client`** — new `patronesApi`:
  - `getPatrones(period)` — agreggated analytics.
  - `regenerateWeeklySummary()` — POST, returns the new summary or 422 NOT_ENOUGH_ENTRIES.
  - `shareWithTherapist()` — stub.

  Generated client regenerated.

  Privacy invariant: server reads only `DiaryEntry.mood` + `createdAt` + `tags` (plaintext metadata). Body cipher is never decrypted.

- e3f735b: Sprint S11 — BillingModule + GET /api/plan + GET /api/billing/return.

  Renames the subscription surface to `/api/billing/*` per design 09-plan.md.
  The legacy `/api/subscriptions/*` keeps serving the same handlers with
  `Deprecation: true` + `Sunset: 2026-08-31` headers for the 90-day window
  declared in ADR 0006.

  **New endpoints**
  - `GET /api/plan` — envolvente that returns subscription + usage + invoices
    - plans catalog + tier in a single request. Replaces the 4 parallel
      fetches the Mi Plan screen used to issue.
  - `GET /api/billing/return?session_id=` — Stripe Checkout success callback.
    Reads the session directly so the success page can render without polling
    `/api/billing/me` and racing the webhook.
  - `PATCH /api/billing/subscription` — consolidated cancel/reactivate
    (switch-plan reserved, returns 501 until a follow-up sprint wires Stripe
    proration).

  **Client**
  - `billingApi` in `@psico/api-client` is the new canonical client. Includes
    `getPlan()`, `getReturn(sessionId)`, `patchSubscription({action})` plus
    all the Sprint S7 methods under the new path prefix.
  - `subscriptionApi` becomes a `@deprecated` re-export.

  **Frontend**
  - Web `/dashboard/plan` and mobile `(tabs)/plan` migrate to
    `billingApi.getPlan()` (1 fetch instead of 4).

  Decisions documented in `docs/informes/sprint-s11-billing-cleanup.md`.

- 98f461b: Sprint S4-front — Onboarding UI (web + mobile) consuming the 11 endpoints
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

- Sprint S42 (Sesión 42) — Pulso v2 admin reports inbox.

  **`@psico/types`** — 4 new shapes for the admin back-office:
  - `PulsoReportReason` — union of the 5 report categories
    (`HALLUCINATION`, `OFF_TONE`, `SENSITIVE_CONTENT`, `CRISIS_MISHANDLED`,
    `OTHER`).
  - `PulsoReportRow` — shape used by the admin reports table. Includes
    `userId`, `messageId`, `threadId`, `messageKind`, and the trimmed
    `assistantTextSnippet`.
  - `PulsoReportListResponse` — paginated `{ items, nextCursor, hasMore }`.
  - `PulsoReportSummary` — `{ total, byReason }` for chip counters.

  **`@psico/api-client`** — new `pulsoApi`:
  - `getEcoSummary()` — counts grouped by reason.
  - `listEcoReports({ reason?, limit?, cursor? })` — paginated list.

  ADMIN-only at the server. The frontend gates the route additionally
  via `getSessionUser().role === "ADMIN"`.

  Privacy invariant FUERTE: the response NEVER contains the USER message
  ciphertext or nonce — only the assistant text (LLM plaintext) is
  exposed, trimmed to 240 chars.

- Sprint S43 (Sesión 43) — Push notifications infrastructure (device tokens + Expo).

  **`@psico/types`** — 3 new shapes:
  - `DevicePlatform` — union `"EXPO" | "WEB"`. WEB is reserved at this point;
    S47 will activate it.
  - `DeviceTokenRegistration` — `{ platform, token, deviceLabel? }` body
    for the POST.
  - `RegisteredDeviceResponse` — `{ id }`.

  **`@psico/api-client`** — new `notificationsApi`:
  - `registerDevice(body)` — idempotent on `token`.
  - `unregisterDevice(id)` — revocation.

  Schema additions (in DB, not in `@psico/types`): `DeviceToken { id, userId,
platform, token @unique, deviceLabel?, createdAt, lastSeenAt }`, plus
  `User.lastNudgedAt`.

  Privacy: `lastSeenAt` is bumped on every register so the server can prune
  stale tokens. The token itself is opaque (Expo's `ExponentPushToken[...]`).

- Sprint S45 (Sesión 45) — Notifications UI + WeeklySummary wire en digest.

  **`@psico/api-client`** — new `usersApi`:
  - `getMe()` — fetch `/user/me`. Mirrors the endpoint that already lived
    on the server since S9.
  - `updateNotifications(body)` — PATCH `/user/notifications` for the
    five toggles + reminder time.

  Web (`apps/web/src/dashboard/notifications`) and mobile
  (`apps/mobile/(tabs)/notifications`) ship the settings UI on top of
  this.

  Backend (no public shape change): `WeeklyDigestProcessor` now looks up
  `WeeklySummary` by `(userId, weekStart)` and inlines the LLM narrative
  into the digest email when one exists.

- Sprints S48–S51 (Sesiones 48–51) — Pulso v2 admin analytics (Overview +
  Resolution + Time series + Cohorts).

  This changeset bundles the four Pulso v2 sprints that mutated the shared
  types and client surface in series.

  **S48 — Overview KPIs** (`GET /api/pulso/overview`, cached 5min):
  - `PulsoOverviewPeriod` — `{ from, to }` UTC ISO dates.
  - `PulsoOverviewUsersBlock` — `{ total, newToday, newThisWeek, newThisMonth }`.
  - `PulsoOverviewEngagementBlock` — `{ dau, wau, mau }` (rolling windows).
  - `PulsoOverviewContentBlock` — `{ diaryEntriesThisWeek, ecoMessagesThisWeek,
ecoCrisisThisWeek, voiceMinutesThisWeek, readingSessionsThisWeek }`.
  - `PulsoOverviewBusinessBlock` — `{ paidUsers, reportsBacklog }`.
  - `PulsoOverviewResponse` — top-level aggregator.

  **S49 — Reports resolution flow** (`POST /:id/resolve` + `/unresolve`,
  `?status=open|resolved|all` filter):
  - `PulsoReportRow` extended with `resolvedAt`, `resolvedBy`, `resolutionNote`.
  - `PulsoReportStatus = "open" | "resolved" | "all"`.
  - `PulsoMarkResolvedRequest { note?: string }`.

  **S50 — Time series + sparklines** (extends `getOverview` response):
  - `PulsoOverviewSeries` — 7 metrics × `number[]` (windowDays = 30).
  - `PulsoOverviewDeltas` — 5 metrics × `number | null` (last-7 vs prev-7 %).
  - `PulsoOverviewResponse` extended with `series` + `deltas`.

  **S51 — Cohort retention triangle** (`GET /api/pulso/cohorts`):
  - `PulsoCohortCell { weekOffset, activeUsers, pct }`.
  - `PulsoCohortRow { cohortWeek, cohortSize, cells }`.
  - `PulsoCohortRetentionResponse { generatedAt, rows, maxWeekOffset }`.

  **`@psico/api-client`** — new methods on `pulsoApi`:
  - `getOverview()` (S48).
  - `getEcoSummary(status?)` updated to take optional status filter (S49).
  - `listEcoReports({ ..., status })` updated (S49).
  - `markResolved(id, body)` / `markUnresolved(id)` (S49).
  - `getCohorts()` (S51).

  Privacy invariant FUERTE preserved: all four Pulso v2 responses contain
  ONLY aggregate integer counts and percentages. No `userId`/`email`/`IP`/
  content snippet appears in any response. The cohort retention processor
  handles `Set<userId>` in RAM during compute; IDs never reach Postgres
  columns.

  Generated client regenerated to 96.1 KB.

- d1aa116: Sprint S5-front-mobile — RN companion.

  `@psico/api-client`:
  - New `homeApi` with `get`, `updateMood`, and `dismissPrompt` methods.
    Mirrors the three HomeModule endpoints (Sprint S5). Used by mobile because
    it consumes the API through the `apiClient` + `TokenStore` pattern; the
    web uses Next.js `serverFetch` with cookies inside Server Components and
    therefore does not need a wrapper.

- 2556539: Sprint S5 — BooksModule expandido + HomeModule.

  `@psico/types`:
  - Books catalog: `BookCategory`, `BookAuthorSummary`, `BookAuthorDetail`,
    `BookListItem`, `BookListResponse`, `Pagination`, `BookRecosResponse`,
    `BookCategoriesResponse`, `BookAuthorsResponse`, `BookToggleResponse`.
  - Book detail: `BookDetail`, `BookDetailResponse`, `ChapterListItem`,
    `BookRating`, `BookRatingBreakdown`, `BookReviewSummary`,
    `BookReviewsResponse`, `CreateBookReviewRequest`,
    `CreateBookReviewResponse`, `StartBookResponse`,
    `BookUserProgressSummary`.
  - Home dashboard: `HomeResponse`, `HomeUser`, `HomeGreeting`,
    `HomeContinueBook`, `HomeEcoMoment`, `HomeReco`, `HomeStats`,
    `HomeReflectionPrompt`, `HomeShortcut`, `UpdateUserMoodRequest`,
    `UpdateUserMoodResponse`, `DismissReflectionPromptResponse`.
  - Enums: `CoverToken`, `BookListSort`, `BookListView`, `RecoKind`,
    `ShortcutId`.

  `@psico/api-client`:
  - New `booksApi` with 10 methods covering list, recos, categories,
    authors, detail, reviews list/create, favorite/bookmark toggles, and
    start-book.
  - Legacy `contentApi` kept as deprecated thin shim — now returns
    `BookListResponse`/`BookDetailResponse` shape against the new `/books`
    routes.
  - `generated.ts` regenerated from the new OpenAPI surface (30.8 KB → 53.0 KB).

- 4b5771c: Sprint S6-crypto — End-to-end encryption en producción.

  `@psico/types`:
  - `AuthUser.cryptoSalt: string | null` added — base64url Argon2id salt
    returned at register / login / refresh / oauth.
  - `UserMeResponse.cryptoSalt: string | null` added — same value, returned
    from GET /api/user/me so web Server Components can hydrate without an
    extra round-trip.

  `@psico/api-client`:
  - `generated.ts` regenerated to include the new `cryptoSalt` field in 4
    endpoints. No new methods; the client surface is unchanged.

  New package: `@psico/crypto` v0.1.0 (private):
  - Pure JS Argon2id + HKDF-SHA256 + XChaCha20-Poly1305 (via @noble/hashes
    and @noble/ciphers).
  - Powers the Diary E2E encryption client-side in web + mobile.
  - See docs/informes/sprint-s6-crypto.md and ADR 0007 for the contract.

- 1dd2405: Sprint S6 — DiarioModule with E2E encryption.

  `@psico/types`:
  - Diary wire format: `DiaryEntryKind`, `DiaryEntrySummary`, `DiaryEntryDetail`,
    `DiaryListResponse`, `DiaryDetailResponse`, `DiaryMoodMap`, `DiaryTagCount`,
    `CreateDiaryEntryRequest`, `UpdateDiaryEntryRequest`,
    `CreateDiaryEntryResponse`, `DeleteDiaryEntryResponse`,
    `DiaryPromptOfTheDay`, `ShareDiaryEntryRequest`, `ShareDiaryEntryResponse`.

  `@psico/api-client`:
  - New `diarioApi` with 7 methods (list, getDetail, create, update, remove,
    getPromptOfTheDay, share). Ciphertext and nonce pass through unchanged.
  - `apiClient.delete<T>()` added — symmetric with get/post/patch.
  - `generated.ts` regenerated from the new OpenAPI surface (53 KB → 58 KB).

- 8a9fbfa: Sprint S6 — LectorModule (reader backend complete).

  **New endpoints (9):**
  - `GET /api/lector/:bookId/:chapterOrder` — envolvente returning
    book + chapter + blocks + lessons + highlights + annotations +
    session + reader preferences in a single request.
  - `GET /api/lector/:bookId/:chapterOrder/audio` — Pro-gated signed URL +
    transcript.
  - `PATCH /api/lector/session` — heartbeat (cada 5 s) que actualiza
    `progressPct`, `timeSpentSec`, `lastBlockId`. Capa delta a 60 s y
    jamás decrementa progress.
  - `POST /api/lector/:bookId/:chapterOrder/complete` — marca el capítulo
    completo en transacción atómica (ReadingSession + UserProgress).
  - `POST /api/highlights` · `DELETE /api/highlights/:id` — subrayados con
    YELLOW/BLUE/PINK + nota opcional.
  - `POST /api/annotations` · `PATCH /api/annotations/:id` ·
    `DELETE /api/annotations/:id` — notas plaintext ancladas a block.

  **Schema (4 modelos):** `ChapterBlock`, `Highlight`, `Annotation`,
  `ReadingSession`. Migración additive — no toca tablas existentes.

  **Client:** `lectorApi`, `highlightsApi`, `annotationsApi` exported.

  **Seed:** 30 ChapterBlocks reales (5 capítulos × 6 blocks) para los
  2 libros ancla — el reader del front va a tener data desde día uno.

  Decisions documented in `docs/informes/sprint-s6-lector.md`.

- 70a7911: Sprint S7 — SubscriptionModule completo.

  Four new endpoints close the billing surface per docs/design/handoff/09-plan.md.

  **Backend (`@psico/api`):**
  - `GET /api/subscriptions/usage` — single aggregator: books completed, eco
    messages, voice minutes, diary entries, plus per-plan quotas. Cached in
    Redis for 5 minutes.
  - `GET /api/subscriptions/invoices?limit=N` — passthrough to `stripe.invoices.list`.
  - `POST /api/subscriptions/cancel` — Stripe `cancel_at_period_end=true` +
    local mirror + busts the usage cache.
  - `POST /api/subscriptions/reactivate` — idempotent, reverts the cancel.
  - Schema: new `BillingUsageDay` rollup table, populated nightly at 02:00
    UTC by the new BullMQ `daily-usage` queue. Read by Pulso admin (v2), not
    by the live `/usage` endpoint.
  - `IPaymentProvider` interface gains three required methods (`listInvoices`,
    `cancelAtPeriodEnd`, `reactivate`); StripeProvider implements them,
    PayphoneProvider stubs them.

  **`@psico/types`:**
  - `UsageResponse` + sub-shapes (`UsagePeriod`, `UsageBooks`, `UsageEco`,
    `UsageVoice`, `UsageDiary`).
  - `InvoiceSummary`, `InvoiceListResponse`, `InvoiceStatus`.
  - `CancelSubscriptionRequest`, `CancelSubscriptionResponse`,
    `ReactivateSubscriptionResponse`.

  **`@psico/api-client`:**
  - `subscriptionApi.createPortalSession`, `.getUsage`, `.listInvoices`,
    `.cancel`, `.reactivate`.
  - `generated.ts` regenerated from the updated OpenAPI spec (62.1 KB → 65.5 KB).

  **Quotas (default):**

  | Plan       | Eco msgs  | Voice mins | Diary entries |
  | ---------- | --------- | ---------- | ------------- |
  | FREE       | 20        | 0          | unlimited     |
  | PRO/ANNUAL | 200       | 120        | unlimited     |
  | B2B        | unlimited | unlimited  | unlimited     |

  `null` means unlimited. Enforcement lives in the feature modules; this
  sprint only exposes the caps.

  Eco/Voice counters return 0 until AIModule conversational (S10) and
  VoiceModule (S8) land — the response shape is stable from day 1.

- f7f285c: Sprint S8 — VoiceModule.

  Two new endpoints close the voice transcription surface per
  docs/design/handoff/07-voz.md. Pro-tier only. Audio is NEVER stored.

  **Backend (`@psico/api`):**
  - `POST /api/voz/transcribe` — multipart audio → transcript. Pre-flight
    quota gate (403 VOICE_REQUIRES_PRO for FREE, 402 VOICE_QUOTA_EXCEEDED
    when over the 120 min/period cap). 10 req/min/user throttle.
  - `POST /api/voz/usage` — optional client/server reconciliation.

  Schema: new `VoiceTranscription` audit table (userId, durationSec,
  language, provider, createdAt). No audio buffer, no waveform, no IP.

  Provider strategy (analog to PaymentPool):
  - `IVoiceProvider` interface.
  - `WhisperProvider` (OpenAI, default) — POST multipart, normalises language.
  - `DeepgramProvider` — POST binary to `/v1/listen?model=nova-3`.
  - `VOICE_PROVIDER` env selects (`whisper` | `deepgram`).
  - Env superRefine requires the active provider's API key at boot.

  Wire-up with S7:
  - `UsageService.voice.minutesThisPeriod` now reports `SUM(durationSec)/60`
    rounded to 0.1 min (was hardcoded 0).
  - `DailyUsageProcessor` (nightly BullMQ) populates
    `BillingUsageDay.voiceMinutes`.

  **`@psico/types`:**
  - `VoiceProvider` ("whisper" | "deepgram").
  - `VoiceTranscribeResponse`, `VoiceUsageReportRequest`,
    `VoiceUsageReportResponse`.

  **`@psico/api-client`:**
  - `voiceApi.transcribe(blob, { language })` + `voiceApi.reportUsage()`.
  - New `apiClient.postFormData<T>(path, FormData)` — skips JSON-stringify
    and lets the browser set the multipart boundary.
  - `generated.ts` regenerated (65.5 KB → 67.0 KB).

- 298ed0c: Sprint seed-and-password-rekey — Backup UI + atomic password rotation.

  Closes the two flows deferred from S6-crypto-polish: showing the BIP39 seed
  phrase as a one-time backup, recovering access from that phrase, and
  rotating the user's password while re-encrypting every diary entry without
  plaintext ever leaving the device.

  **Backend (`@psico/api`):**
  - `POST /api/user/crypto-seed-acknowledged` — idempotent, marks
    `User.cryptoSeedShownAt`.
  - `POST /api/user/password-change-with-rekey` — atomic transaction:
    bcrypt(newPassword), update `passwordHash` + `cryptoSalt`, UPDATE every
    `DiaryEntry` with the client-supplied re-encrypted cipher/nonce, revoke
    every active refresh token.
  - `GET /api/diario/entries/raw-ciphers` — lean fetch (no related-search,
    no tags) used exclusively by the rekey flow to avoid N detail calls.
  - Schema: `User.cryptoSeedShownAt: DateTime?` + migration.
  - DTOs cap `ArrayMaxSize(500)` per rekey, base64url validation for
    cipher/nonce, `NEW_PASSWORD_MIN=10`.

  **`@psico/types`:**
  - `UserMeResponse.cryptoSeedShownAt` (Date | null).
  - New: `CryptoSeedAcknowledgedResponse`, `RekeyedDiaryEntry`,
    `PasswordChangeWithRekeyRequest`, `PasswordChangeWithRekeyResponse`,
    `DiaryRawCipherEntry`, `DiaryRawCiphersResponse`.

  **`@psico/api-client`:**
  - `diarioApi.listRawCiphers()`.
  - `generated.ts` regenerated from updated OpenAPI spec (58 KB → 62.1 KB).

  **`@psico/crypto`:**
  - Re-exports `randomBytes` from `@noble/ciphers/webcrypto` so app code can
    generate fresh salts without a direct dependency on `@noble/ciphers`.

  **Web (`@psico/web`):**
  - `SeedPhraseModal` post-unlock first-time, with 3-of-24 confirm step.
  - `UnlockGate` gains a "seed phrase recovery" mode that bypasses Argon2id.
  - New `/dashboard/security` route with `ChangePasswordCard` running the
    full rekey phase machine client-side.
  - `DiaryKeyProvider` hoisted to `/dashboard/layout.tsx` so unlock state
    survives navigation between Diario and Security; the context now exposes
    `masterKey` + `adoptMasterKey` alongside the subkey.

  **Mobile (`@psico/mobile`):**
  - `SeedPhraseModal` (RN `Modal`), `UnlockGate` seed-mode, and
    `(tabs)/security.tsx` mirror the web flow.
  - `DiaryKeyProvider` hoisted to `(tabs)/_layout.tsx`. masterKey is
    RAM-only on mobile (only the subkey is persisted in SecureStore).

### Patch Changes

- ce8fbf8: Sprint front-eco — Chat UI (web + mobile) consuming the S10 EcoModule.

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

- 036604a: Sprint front-fase1 (Mi Plan) — web + mobile UI for the SubscriptionModule
  endpoints landed in S7.

  **`@psico/api-client`:** new `subscriptionApi.getMySubscription()` method.
  The endpoint existed since S4 but had no client wrapper.

  **Web (`@psico/web`):**
  - New components under `src/components/dashboard/plan/`:
    - `UsageCards` — Server Component, 4 mini-cards with progress bars.
    - `InvoicesList` — Server Component, table with PDF links.
    - `SubscriptionActions` — Client Component, cancel modal + reactivate.
  - Server actions `cancelSubscriptionAction` + `reactivateSubscriptionAction`
    with `revalidatePath("/dashboard/plan")`.
  - `/dashboard/plan` page paralelises 4 fetches (`/me`, `/plans`, `/usage`,
    `/invoices`).

  **Mobile (`@psico/mobile`):**
  - New components under `src/components/dashboard/plan/` — RN paridad of
    the web set.
  - `(tabs)/plan.tsx` adds `loadAll()` orchestrator + `RefreshControl`
    pull-to-refresh + integrated `SubscriptionActions` card.

  Decisions: usage visible to FREE as preview, cancel reason capture as
  free-text (no taxonomy), `Linking.openURL` for invoice PDFs.

- Updated dependencies [642d6e1]
- Updated dependencies [0f5774a]
- Updated dependencies
- Updated dependencies [e3f735b]
- Updated dependencies [98f461b]
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies [2556539]
- Updated dependencies [4b5771c]
- Updated dependencies [1dd2405]
- Updated dependencies [8a9fbfa]
- Updated dependencies [70a7911]
- Updated dependencies [f7f285c]
- Updated dependencies [298ed0c]
  - @psico/types@0.9.0

## 0.0.7

### Patch Changes

- Updated dependencies [125d222]
- Updated dependencies [125d222]
  - @psico/types@0.8.0

## 0.0.6

### Patch Changes

- Updated dependencies [e391519]
- Updated dependencies [e391519]
  - @psico/types@0.7.0

## 0.0.5

### Patch Changes

- Updated dependencies [11eac29]
  - @psico/types@0.6.0

## 0.0.4

### Patch Changes

- Updated dependencies [75c3ec4]
  - @psico/types@0.5.0

## 0.0.3

### Patch Changes

- Updated dependencies [bc91378]
  - @psico/types@0.4.0

## 0.0.2

### Patch Changes

- Updated dependencies
  - @psico/types@0.2.0

## 0.0.1

### Patch Changes

- Updated dependencies
  - @psico/types@0.1.0
