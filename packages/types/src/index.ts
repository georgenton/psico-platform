// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = "USER" | "AUTHOR" | "PSYCHOLOGIST" | "ADMIN";

export type UserPlan = "FREE" | "PRO" | "ANNUAL" | "B2B";

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  plan: UserPlan;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  id: string;
  userId: string;
  bio: string | null;
  country: string | null;
  timezone: string | null;
  preferredLanguage: string | null;
}

export interface RefreshToken {
  id: string;
  userId: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

// ─── Auth API shapes ──────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  plan: UserPlan;
  /**
   * base64url Argon2id salt for E2E diary crypto (ADR 0007 §A, Sprint S6-crypto).
   * `null` for accounts registered before the crypto layer landed; clients
   * gracefully fall back to "diario sin cifrar activado" (read-only legacy).
   */
  cryptoSalt: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

// ─── Content enums ────────────────────────────────────────────────────────────

export type ExerciseType = "REFLECTION" | "QUIZ" | "BREATHING" | "JOURNALING";

// ─── Content domain types ─────────────────────────────────────────────────────

export interface Book {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  totalChapters: number;
  isPublished: boolean;
  plan: UserPlan;
  createdAt: Date;
  updatedAt: Date;
}

export interface Chapter {
  id: string;
  bookId: string;
  order: number;
  title: string;
  description: string | null;
  durationMinutes: number | null;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Audio {
  id: string;
  chapterId: string;
  title: string;
  fileUrl: string;
  durationSeconds: number;
  transcription: string | null;
  createdAt: Date;
}

export interface Exercise {
  id: string;
  chapterId: string;
  order: number;
  title: string;
  type: ExerciseType;
  content: Record<string, unknown>;
  createdAt: Date;
}

export interface UserProgress {
  id: string;
  userId: string;
  chapterId: string;
  completedAt: Date;
  score: number | null;
}

// ─── Content API shapes ───────────────────────────────────────────────────────

export interface BookWithChapters extends Book {
  chapters: Chapter[];
}

export interface ChapterWithContent extends Chapter {
  audios: Audio[];
  exercises: Exercise[];
}

// ─── Subscription enums ───────────────────────────────────────────────────────

export type SubscriptionStatus =
  | "ACTIVE"
  | "TRIALING"
  | "PAST_DUE"
  | "CANCELED"
  | "INCOMPLETE";

export type BillingInterval = "PRO_MONTHLY" | "PRO_YEARLY" | "B2B";

// ─── Subscription domain types ────────────────────────────────────────────────

export interface Subscription {
  id: string;
  userId: string;
  plan: UserPlan;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Subscription API shapes ──────────────────────────────────────────────────

export interface PlanPrice {
  monthly?: number;
  yearly?: number;
  currency: string;
}

export interface PlanInfo {
  plan: UserPlan;
  name: string;
  prices: PlanPrice;
  description: string;
  features: string[];
}

export interface CheckoutSessionResponse {
  url: string;
}

export interface PortalSessionResponse {
  url: string;
}

// ─── Usage (Sprint S7) ────────────────────────────────────────────────────────
//
// Single aggregator returned by `GET /api/subscriptions/usage`. Mirrors the
// `usage` block of the Mi Plan design (docs/design/handoff/09-plan.md).
//
// Why one endpoint over per-feature endpoints (Plan v2 §5.7):
//   - The Mi Plan screen consumes all counters at once — minimises round-trips.
//   - Quotas live on the Subscription plan, not on the feature module — having
//     `eco/voice/diary` join their own quotas would duplicate the plan lookup.
//   - Consistent with `/api/home` which already aggregates across modules.
//
// `quota: null` means unlimited (Pro tier on diary entries, for example).
// Counters are scoped to the user's current billing period
// (`subscription.currentPeriodStart` → `currentPeriodEnd`). FREE users get
// the calendar month as a fallback period.

export interface UsagePeriod {
  start: Date;
  end: Date;
  /** "subscription" if the user has an active sub, "calendar-month" for FREE. */
  source: "subscription" | "calendar-month";
}

export interface UsageBooks {
  /** Distinct books where all chapters have `UserProgress.completedAt` in the period. */
  completedThisPeriod: number;
}

export interface UsageEco {
  /** AI companion messages this period. 0 until AIModule conversational (S10). */
  messagesThisPeriod: number;
  /** Cap per period. null = unlimited. */
  quota: number | null;
}

export interface UsageVoice {
  /** Transcribed voice minutes this period. 0 until VoiceModule (S8). */
  minutesThisPeriod: number;
  /** Cap per period. null = unlimited. */
  quota: number | null;
}

export interface UsageDiary {
  /** DiaryEntry rows created this period. */
  entriesThisPeriod: number;
  /** Cap per period. null = unlimited (Pro has no diary cap). */
  quota: number | null;
}

export interface UsageResponse {
  plan: UserPlan;
  period: UsagePeriod;
  books: UsageBooks;
  eco: UsageEco;
  voice: UsageVoice;
  diary: UsageDiary;
}

// ─── Invoices (Sprint S7) ─────────────────────────────────────────────────────

export type InvoiceStatus =
  | "paid"
  | "open"
  | "void"
  | "uncollectible"
  | "draft";

export interface InvoiceSummary {
  /** Stripe invoice id (e.g. `in_1abc...`). */
  id: string;
  /** Invoice creation date. */
  date: Date;
  /** Total in the invoice's currency, in major units (i.e. dollars, not cents). */
  amount: number;
  /** ISO-4217 currency code, lowercase as Stripe returns it. */
  currency: string;
  status: InvoiceStatus;
  /** Stripe's hosted PDF URL, signed and short-lived. May be null on drafts. */
  pdfUrl: string | null;
  /** Stripe's hosted invoice page (web-viewable). */
  hostedUrl: string | null;
}

export interface InvoiceListResponse {
  invoices: InvoiceSummary[];
}

// ─── Cancel / reactivate (Sprint S7) ──────────────────────────────────────────

export interface CancelSubscriptionRequest {
  /** Optional free-text reason captured for retention analytics. */
  reason?: string;
}

export interface CancelSubscriptionResponse {
  ok: true;
  cancelAtPeriodEnd: true;
  /** When the user loses Pro access. */
  effectiveAt: Date;
}

export interface ReactivateSubscriptionResponse {
  ok: true;
  cancelAtPeriodEnd: false;
}

// ─── Billing — Sprint S11 (rename + envolvente) ───────────────────────────────
//
// Replaces /api/subscriptions/* with /api/billing/* per design 09-plan.md.
// Both prefixes serve the same handlers for 90 days (deprecation window
// per ADR 0006). The legacy controller adds `Deprecation: true` headers.
//
// New endpoints exposed by this sprint:
//   - `GET /api/plan` — single-request aggregator for the Mi Plan screen.
//     Returns subscription state + usage counters + recent invoices +
//     plan catalog in one round-trip. Replaces 4 separate fetches that
//     the previous web/mobile screen had to do.
//   - `GET /api/billing/return?session_id=` — callback Stripe redirects to
//     after Checkout completes. Reads the Stripe session, returns the
//     resulting plan + a `status` so the front can render success / pending
//     / failed without polling.
//   - `PATCH /api/billing/subscription` — consolidates cancel + reactivate
//     into one endpoint with an `action` discriminator (per the design).
//     The legacy POSTs (/cancel + /reactivate) stay available during the
//     deprecation window.

/**
 * Envolvente del Mi Plan screen. Single GET /api/plan returns:
 *   - The user's current `subscription` (null if FREE without any sub history).
 *   - The `usage` block for the current billing period (same shape as
 *     /api/billing/usage).
 *   - The last 12 `invoices` (same shape as /api/billing/invoices).
 *   - The full `plans` catalog (same shape as /api/billing/plans).
 *   - `tier`: convenience field flattened from `user.plan`.
 *
 * Why a wrapper: the Mi Plan screen used to do 4 sequential fetches
 * (me + plans + usage + invoices) on every navigation. Wrapping them
 * server-side cuts client-perceived latency by ~3× and lets the API
 * cache the entire aggregate together. See docs/design/handoff/09-plan.md.
 */
export interface PlanResponse {
  tier: UserPlan;
  subscription: Subscription | null;
  usage: UsageResponse;
  invoices: InvoiceSummary[];
  plans: PlanInfo[];
}

/**
 * Callback hit by the user's browser after a Stripe Checkout completes.
 * The front passes back the `session_id` Stripe appended to the success
 * URL; the server reads the session, confirms payment, and returns the
 * new subscription state.
 *
 * `status`:
 *   - `"success"` — payment captured, subscription is active or trialing.
 *   - `"processing"` — bank still processing (async payment methods).
 *     Front should poll the same endpoint or fall through to /dashboard/plan.
 *   - `"failed"` — payment declined or session expired. Front shows retry.
 */
export interface BillingReturnResponse {
  status: "success" | "processing" | "failed";
  tier: UserPlan;
  subscription: Subscription | null;
  /** Human-readable line for the front to show, in es-EC. */
  message: string;
}

/**
 * Discriminated body for the consolidated PATCH /api/billing/subscription.
 * Maps to the existing cancel/reactivate methods underneath. `switch-plan`
 * is reserved for a future sprint (Stripe `subscriptions.update` with
 * `proration_behavior`); accepted in the shape but rejected with 501 today.
 */
export type PatchSubscriptionRequest =
  | { action: "cancel"; reason?: string }
  | { action: "reactivate" }
  | { action: "switch-plan"; newPlanId: BillingInterval };

// ─── Eco · conversational AI (Sprint S10) ─────────────────────────────────────
//
// Wire shapes. The on-the-wire model is hybrid:
//   - `textPlaintext` is sent ONLY in the request body (server uses it for the
//     LLM call + crisis detection, never persists it).
//   - `textCiphertext + textNonce` is sent in the same request and IS persisted.
//   - Assistant replies stream back as plaintext SSE events.
// See docs/informes/sprint-s10-eco-chat.md §3 for the decision matrix.

export type EcoMessageKind = "user" | "assistant" | "crisis" | "suggestion";

export type EcoMessageReportReason =
  | "HALLUCINATION"
  | "OFF_TONE"
  | "SENSITIVE_CONTENT"
  | "CRISIS_MISHANDLED"
  | "OTHER";

export interface EcoPersona {
  name: string;
  voice: string;
  caps: string[];
}

export interface EcoThreadRailItem {
  id: string;
  /** base64url ciphertext of the thread title; null until first reply. */
  titleCiphertext: string | null;
  titleNonce: string | null;
  lastMessageAt: Date;
  messageCount: number;
}

export interface EcoThreadListResponse {
  rail: EcoThreadRailItem[];
}

export interface EcoThreadCreatedResponse {
  id: string;
  createdAt: Date;
}

export interface EcoMessage {
  id: string;
  kind: EcoMessageKind;
  /** Present for USER messages. */
  textCiphertext: string | null;
  textNonce: string | null;
  /** Present for ASSISTANT / CRISIS / SUGGESTION. */
  assistantText: string | null;
  /** Populated when kind === "suggestion". */
  suggestedBookId: string | null;
  createdAt: Date;
}

export interface EcoThreadResponse {
  thread: {
    id: string;
    titleCiphertext: string | null;
    titleNonce: string | null;
    createdAt: Date;
    lastMessageAt: Date;
  };
  messages: EcoMessage[];
  hasMore: boolean;
}

/**
 * Fase H — structured reading context for an Eco message. When present, the
 * server (a) scopes the RAG retrieval to that book, (b) anchors the system
 * prompt in the chapter's theme, and (c) offers the chapter's concept as a
 * confirmable resonance in the `done` event (ARC: Eco PROPOSES, the user
 * confirms — Eco never writes to the map by itself).
 */
export interface EcoScope {
  bookSlug: string;
  chapterOrder: number;
}

/**
 * Fase H — deterministic source attribution: which book/chapter passages
 * were RETRIEVED as context for the reply. Built from the actual RAG hits,
 * never from LLM claims — honest label is "contexto consultado".
 */
export interface EcoSource {
  bookTitle: string;
  /** Null when the retrieved chunk is book-level (no chapter anchor). */
  chapterTitle: string | null;
}

export interface EcoSendMessageRequest {
  threadId: string;
  /**
   * Ephemeral — used for LLM inference + crisis detection. Never persisted.
   * Server-side privacy spec enforces no logging.
   */
  textPlaintext: string;
  textCiphertext: string;
  textNonce: string;
  intent?: "free" | "suggest";
  /** Fase H — optional reading context (reader dock/sheet conversations). */
  scope?: EcoScope;
}

/**
 * Server-Sent Events emitted by `POST /api/eco/messages`.
 *
 * The client renders progressively from `delta` events, then finalises on
 * `done`. `crisis` and `suggestion` short-circuit the normal flow — they
 * arrive instead of (not alongside) `delta` events.
 */
export type EcoSseEvent =
  | { event: "delta"; data: { text: string } }
  | {
      event: "crisis";
      data: {
        text: string;
        /** Localised hotline + crisis page slug for client routing. */
        hotline: string;
        crisisPath: string;
      };
    }
  | {
      event: "suggestion";
      data: {
        bookId: string;
        rationale: string;
      };
    }
  | {
      event: "done";
      data: {
        messageId: string;
        quotaRemaining: number | null;
        /**
         * Fase H — book/chapter passages retrieved as context for this
         * reply (deterministic, from the actual RAG hits). Optional so
         * pre-Fase-H consumers keep parsing.
         */
        sources?: EcoSource[];
        /**
         * Fase H — the ARC proposal: when the message carried a reading
         * scope, the server OFFERS the chapter's concept. Only an explicit
         * user tap (POST /resonances, source "eco") persists anything.
         */
        resonanceOffer?: {
          conceptKey: string;
          conceptLabel: string;
          bookSlug: string;
          chapterOrder: number;
        } | null;
      };
    }
  | {
      event: "error";
      data: { code: string; message: string };
    };

export interface EcoReportMessageRequest {
  reason: EcoMessageReportReason;
  comment?: string;
}

// ─── Voice (Sprint S8) ────────────────────────────────────────────────────────
//
// Audio in, transcript out. Per docs/design/handoff/07-voz.md the audio is
// NEVER stored — only a VoiceTranscription audit row with duration metadata.
//
// `VoiceProvider` is exposed publicly so the front can render different copy
// per backend (e.g. "Powered by Whisper" / "Powered by Deepgram") if we ever
// run a UI experiment.

export type VoiceProvider = "whisper" | "deepgram";

export interface VoiceTranscribeResponse {
  ok: true;
  transcript: string;
  durationSec: number;
  language: string;
  provider: VoiceProvider;
  /** Minutes still available in the current billing period. May be 0. */
  remainingMinutesThisPeriod: number;
}

/**
 * Sent from the client AFTER a successful transcription to reconcile any
 * client-side duration measurement with the server's. v1 is a no-op
 * (the server already counted on `/transcribe`) — kept in the contract
 * for the design spec compatibility and future client-attributed metrics.
 */
export interface VoiceUsageReportRequest {
  secondsUsed: number;
}

export interface VoiceUsageReportResponse {
  ok: true;
  remainingMinutesThisPeriod: number;
}

// ─── AI / RAG types ───────────────────────────────────────────────────────────

export type MessageRole = "USER" | "ASSISTANT";

export interface ContentChunk {
  id: string;
  bookId: string;
  chapterId: string | null;
  content: string;
  chunkHash: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  inputTokens: number;
  outputTokens: number;
  createdAt: Date;
}

// ─── AI API shapes ────────────────────────────────────────────────────────────

export interface ChatRequest {
  message: string;
  conversationId?: string;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatResponse {
  reply: string;
  conversationId: string;
  usage: ChatUsage;
}

export interface ConversationSummary extends Pick<
  Conversation,
  "id" | "title" | "createdAt" | "updatedAt"
> {
  messageCount: number;
}

export interface IngestResponse {
  chunksUpserted: number;
}

// ─── User · Perfil bundle ─────────────────────────────────────────────────────

export type VoicePreference = "marina" | "tomas" | "none";
export type BestTime = "morning" | "noon" | "evening" | "any";
export type ThemePreference = "system" | "light" | "dark";
export type ReaderFont = "serif" | "sans";
export type ReaderTheme = "system" | "light" | "sepia" | "dark";
export type Language = "es-419" | "es-ES";
export type UserTier = "free" | "pro";

export interface UserProfileSummary {
  id: string;
  firstName: string;
  email: string;
  city: string | null;
  country: string | null;
  /**
   * Sprint S53 — IANA timezone (e.g. "America/Guayaquil"). null = the
   * user hasn't been probed yet; web/mobile auto-detect on next login
   * and PATCH `/user/timezone`. Cron processors fall back to UTC when
   * null (preserves S44 behavior for legacy accounts).
   */
  timezone: string | null;
  tier: UserTier;
  joinedAt: Date;
  initials: string;
  avatarUrl: string | null;
  mood: string | null;
}

export interface UserStats {
  daysActive: number;
  booksCompleted: number;
  chaptersRead: number;
  diaryEntries: number;
  minutesTotal: number;
  currentStreakDays: number;
  longestStreakDays: number;
}

export interface AchievementProgress {
  id: string;
  label: string;
  description: string;
  icon: string;
  progressCurrent: number;
  progressTarget: number;
  unlockedAt: Date | null;
}

export interface UserPreferences {
  voicePreference: VoicePreference;
  moodPrompts: boolean;
  bestTime: BestTime;
  weeklyGoalMinutes: number;
  theme: ThemePreference;
  language: Language;
  /**
   * Sprint B1 — ambient theme picker. One of "calma" | "enfoque" | "energia"
   * | "noche". The dashboard `<AmbientThemeApplier>` reads this and sets
   * `body.amb-{ambient}` on every load so the page renders with the chosen
   * palette before the first paint.
   */
  ambient: AmbientId;
}

export interface UserReaderPreferences {
  font: ReaderFont;
  fontSize: number;
  theme: ReaderTheme;
  lineHeight: number;
}

export interface UserNotificationSettings {
  dailyReminder: boolean;
  reminderTime: string; // HH:MM
  streakReminders: boolean;
  ecoReplies: boolean;
  terapiaReminders: boolean;
  weeklyReport: boolean;
}

export interface UserPrivacySettings {
  shareDiaryWithTherapist: boolean;
  anonymizedAnalytics: boolean;
  marketingEmail: boolean;
  /**
   * Fase D (V2, decision L4) — consent for the ON-DEVICE reflection text
   * analysis (TXT-L1). Default false: without opt-in the client must not
   * upload numeric features and the server rejects/ignores them. Turning it
   * off deletes the derived rows (consent cascade).
   */
  localTextAnalysis: boolean;
  dataExportRequested: Date | null;
  accountDeleteRequested: Date | null;
}

export interface UserMeResponse {
  user: UserProfileSummary;
  stats: UserStats;
  achievements: AchievementProgress[];
  preferences: UserPreferences;
  readerPreferences: UserReaderPreferences;
  notifications: UserNotificationSettings;
  privacy: UserPrivacySettings;
  /**
   * base64url Argon2id salt for E2E diary crypto (Sprint S6-crypto).
   * Null for accounts registered before crypto landed.
   */
  cryptoSalt: string | null;
  /**
   * Timestamp the client acknowledged showing the BIP39 seed phrase modal
   * (Sprint seed-and-password-rekey). Null = the modal still needs to run
   * on next diary unlock. ISO string in JSON, parsed Date in TypeScript.
   */
  cryptoSeedShownAt: Date | null;
  /**
   * Onboarding progress (Sprint S4-front). null = no OnboardingState row
   * → user never opened onboarding → front should redirect to /onboarding.
   * Either `completedAt` or `skippedAt` being set means onboarding is
   * done; the front skips it and goes straight to the dashboard.
   * `tourCompletedAt` separately tracks the post-onboarding tour overlay.
   */
  onboardingState: {
    completedAt: Date | null;
    skippedAt: Date | null;
    tourCompletedAt: Date | null;
  } | null;
}

// ─── User · request payloads ──────────────────────────────────────────────────

export interface UpdateProfileRequest {
  firstName?: string;
  city?: string | null;
  country?: string | null;
  avatarUrl?: string | null;
}

export type UpdatePreferencesRequest = Partial<UserPreferences>;
export type UpdateReaderPreferencesRequest = Partial<UserReaderPreferences>;
export type UpdateNotificationsRequest = Partial<UserNotificationSettings>;

/**
 * Sprint S53 — Auto-detected by the client right after login when
 * `UserProfile.timezone` is null. IANA name (e.g. "America/Guayaquil").
 */
export interface UpdateTimezoneRequest {
  timezone: string;
}

export type UpdatePrivacyRequest = Partial<
  Pick<
    UserPrivacySettings,
    | "shareDiaryWithTherapist"
    | "anonymizedAnalytics"
    | "marketingEmail"
    | "localTextAnalysis"
  >
>;

export interface UpdateMoodRequest {
  mood: string;
}

export interface EmailChangeRequestPayload {
  newEmail: string;
}

export interface EmailChangeRequestResponse {
  ok: true;
  verificationSentTo: string;
}

export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

/**
 * POST /api/user/crypto-seed-acknowledged — body is empty. The server
 * stamps `cryptoSeedShownAt = now` on the calling user.
 */
export interface CryptoSeedAcknowledgedResponse {
  ok: true;
  shownAt: Date;
}

/**
 * Re-encrypted entry payload accepted by /password-change-with-rekey.
 * The client already ran encryptString(plaintext, newDiaryKey) before
 * sending; the backend stores the new cipher verbatim.
 */
export interface RekeyedDiaryEntry {
  id: string;
  textCiphertext: string;
  textNonce: string;
  /** Optional — same rule as create: cipher and nonce must be paired. */
  excerptCiphertext?: string;
  excerptNonce?: string;
}

export interface PasswordChangeWithRekeyRequest {
  currentPassword: string;
  newPassword: string;
  /** base64url 16-byte salt the client used to derive the new master key. */
  newCryptoSalt: string;
  /** Every active diary entry, re-encrypted with the new diary key. */
  reencryptedEntries: RekeyedDiaryEntry[];
}

export interface PasswordChangeWithRekeyResponse {
  ok: true;
  /** Echo of the salt persisted, in case the client wants to verify. */
  cryptoSalt: string;
  /** Number of entries successfully rekeyed in the transaction. */
  rekeyed: number;
}

export interface DataExportRequestResponse {
  ok: true;
  expectedAt: Date;
}

export interface DeleteAccountRequest {
  password: string;
  reason?: string;
}

export interface DeleteAccountResponse {
  ok: true;
  deleteAt: Date;
}

export interface AvatarUploadResponse {
  avatarUrl: string;
}

// ─── Onboarding ──────────────────────────────────────────────────────────────

export interface OnboardingIntro {
  title: string;
  subtitle: string;
  body: string;
  signature: string;
  avatarUrl: string | null;
}

export interface OnboardingMotivo {
  id: string;
  label: string;
  icon: string;
}

export interface OnboardingMood {
  id: string;
  label: string;
  swatch: string;
}

/**
 * Optional deep-dive card attached to a tour step. Rendered as a
 * "ⓘ Saber más" chip that opens a modal with a friendly analogy plus
 * a bulleted list. Copy is server-owned so we can iterate without a
 * client release.
 */
export interface OnboardingTourStepLearnMore {
  title: string;
  analogy?: string;
  points: string[];
}

export interface OnboardingTourStep {
  target: string;
  title: string;
  body: string;
  order: number;
  learnMore?: OnboardingTourStepLearnMore;
}

export type OnboardingVoicePreference = "marina" | "tomas" | "none";

export interface OnboardingStep1Request {
  motivosIds: string[];
}

export interface OnboardingStep2Request {
  moodId: string;
}

export interface OnboardingStep3Request {
  firstName: string;
  voicePreference: OnboardingVoicePreference;
}

export interface OnboardingStepResponse {
  ok: true;
  next: string;
}

/**
 * Book recommendation returned by GET /api/onboarding/recommendation.
 * Same shape used for the primary `recommendation` and each `alternative`.
 */
export interface OnboardingBookRecommendation {
  bookId: string;
  title: string;
  author: string;
  cover: "cool" | "warm" | "mixed";
  chapter1Preview: string;
  why: string;
}

export interface OnboardingRecommendationResponse {
  recommendation: OnboardingBookRecommendation;
  alternatives: OnboardingBookRecommendation[];
}

export interface OnboardingCompleteRequest {
  /** What the user picked. null = "terminar" without starting a book. */
  chosenBookId: string | null;
}

export interface OnboardingCompleteResponse {
  ok: true;
  redirectTo: string;
}

export interface OnboardingTourCompleteRequest {
  stepsCompleted: number;
}

// ─── Books catalog (Sprint S5) ───────────────────────────────────────────────

/** Visual gradient token rendered when no real cover artwork exists. */
export type CoverToken = "cool" | "warm" | "mixed";

/** Sort order accepted by GET /books?sort=. */
export type BookListSort = "recent" | "alpha" | "marina";

/** View tab accepted by GET /books?view=. */
export type BookListView =
  | "catalogo"
  | "mis"
  | "recos"
  | "favoritos"
  | "guardados";

export interface BookCategory {
  id: string;
  slug: string;
  label: string;
  count: number;
}

export interface BookAuthorSummary {
  id: string;
  slug: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
  cover: CoverToken;
  bookCount: number;
}

export interface BookAuthorDetail extends BookAuthorSummary {
  title: string | null;
  bio: string | null;
  licenseNumber: string | null;
  isVerified: boolean;
}

export interface BookUserProgressSummary {
  startedAt: Date;
  lastChapterRead: number;
  progressPct: number;
  completedAt: Date | null;
}

/** Item shape returned by GET /books list and recos. Optimized for grid cards. */
export interface BookListItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  authorId: string | null;
  authorName: string | null;
  cover: CoverToken;
  coverArtUrl: string | null;
  categoryId: string | null;
  categorySlug: string | null;
  chapters: number;
  pages: number | null;
  durationMinutes: number;
  publishedOn: Date | null;
  rating: number;
  reviewCount: number;
  tierRequired: UserTier;
  isFavorite: boolean;
  isBookmarked: boolean;
  /** When the auth user favorited this book. Null if not favorited or unauth. */
  favoritedAt: Date | null;
  /** When the auth user bookmarked this book. Null if not bookmarked or unauth. */
  bookmarkedAt: Date | null;
  userProgress: BookUserProgressSummary | null;
}

export interface Pagination {
  page: number;
  perPage: number;
  total: number;
}

export interface BookListResponse {
  books: BookListItem[];
  pagination: Pagination;
  categories: BookCategory[];
  authors: BookAuthorSummary[];
}

export interface BookRecosResponse {
  recos: BookListItem[];
}

export interface BookCategoriesResponse {
  categories: BookCategory[];
}

export interface BookAuthorsResponse {
  authors: BookAuthorSummary[];
}

export interface BookToggleResponse {
  /** Final state after the toggle (true = now favorited/bookmarked). */
  active: boolean;
}

// ─── Book detail (Sprint S5) ─────────────────────────────────────────────────

export interface BookDetail {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  cover: CoverToken;
  coverArtUrl: string | null;
  summary: string | null;
  description: string | null;
  chapters: number;
  pages: number | null;
  durationMinutes: number;
  categoryId: string | null;
  categoryLabel: string | null;
  tierRequired: UserTier;
  publishedOn: Date | null;
  language: string;
  audioAvailable: boolean;
  exercisesAvailable: boolean;
}

export interface ChapterListItem {
  n: number;
  title: string;
  durationMinutes: number | null;
  lockedByTier: boolean;
  /** Book part number this chapter belongs to (null for single-part books). */
  partNumber: number | null;
  /** Book part title, e.g. "Deconstruyendo lo que sabíamos" (null if none). */
  partTitle: string | null;
  userProgress: {
    status: "not-started" | "started" | "completed";
    progressPct: number;
  };
}

export interface BookRatingBreakdown {
  5: number;
  4: number;
  3: number;
  2: number;
  1: number;
}

export interface BookRating {
  avg: number;
  count: number;
  breakdown: BookRatingBreakdown;
}

export interface BookReviewSummary {
  id: string;
  userInitials: string;
  userCity: string | null;
  rating: number;
  text: string;
  createdAt: Date;
}

export interface BookDetailResponse {
  book: BookDetail;
  author: BookAuthorDetail | null;
  chaptersList: ChapterListItem[];
  rating: BookRating;
  reviews: BookReviewSummary[];
  userProgress: BookUserProgressSummary | null;
  isFavorite: boolean;
  isBookmarked: boolean;
}

export interface BookReviewsResponse {
  reviews: BookReviewSummary[];
  pagination: Pagination;
}

export interface CreateBookReviewRequest {
  rating: number;
  text: string;
}

export interface CreateBookReviewResponse {
  ok: true;
  review: BookReviewSummary;
}

export interface StartBookResponse {
  ok: true;
  userProgress: BookUserProgressSummary;
}

// ─── Home dashboard (Sprint S5) ──────────────────────────────────────────────

export type RecoKind = "book" | "audio" | "exercise" | "carta";
/**
 * Sprint B4 — Diario → Reflexiones rename. The shortcut id moved to
 * `"reflexiones"` to match the new dashboard label + URL (`/dashboard/
 * reflexiones`). `"diario"` is kept as a deprecated alias so clients that
 * cached an older HomeResponse don't blow up; the backend stops emitting
 * it after this sprint.
 */
export type ShortcutId =
  | "reflexiones"
  | "eco"
  | "biblioteca"
  | "terapia"
  | "diario";

export interface HomeUser {
  firstName: string;
  city: string | null;
  tier: UserTier;
  streakDays: number;
  mood: string | null;
}

export interface HomeGreeting {
  text: string;
  subtitle: string | null;
}

export interface HomeContinueBook {
  bookId: string;
  title: string;
  author: string;
  cover: CoverToken;
  chapterN: number;
  chapterTitle: string;
  progressPct: number;
  lastReadAt: Date;
}

/**
 * Adaptive Eco suggestions — rule-based conversation openers that adapt to
 * how the user has been interacting (reading, reflecting) and to their
 * self-reported Emotional-Map "momento".
 *
 * Design invariants:
 *   - READ-ONLY. Suggestions PROPOSE a conversation; they never write to the
 *     map (V2 principle: nothing enters the map silently).
 *   - Curated + deterministic (no LLM cost, no non-determinism).
 *   - Honest copy: `reason` reflects an EXPLICIT signal (a chapter you're
 *     reading, a mood YOU logged) — never "la IA notó cómo te sientes".
 */
export type EcoSuggestionKind =
  | "continue-chapter"
  | "after-chapter"
  | "mood-supportive"
  | "mood-savoring"
  | "after-reflection"
  | "cold-start";

export interface EcoSuggestion {
  /** Stable rule id — also the React key + analytics tag. */
  id: EcoSuggestionKind;
  /** Short card label. */
  title: string;
  /** Text seeded into the Eco composer when the user taps the suggestion. */
  prompt: string;
  /** Honest "why you're seeing this" — reflects an explicit user signal. */
  reason: string;
  /** Reader scope when the opener is chapter-anchored, else null. */
  scope: EcoScope | null;
}

export interface EcoSuggestionsResponse {
  suggestions: EcoSuggestion[];
}

export interface HomeEcoMoment {
  prompt: string;
  lastActiveAt: Date | null;
  pendingMessages: number;
  /**
   * Adaptive openers (top 2) surfaced on the Home Eco card. Read-only
   * proposals — tapping one opens Eco seeded, never touches the map.
   */
  suggestions: EcoSuggestion[];
}

export interface HomeReco {
  id: string;
  kind: RecoKind;
  title: string;
  byline: string;
  cover: CoverToken;
  reason: string;
  lockedByTier: boolean;
}

export interface HomeStats {
  minutesThisWeek: number;
  entriesThisWeek: number;
  streakDays: number;
  weeklyGoalPct: number;
  /**
   * Sprint G2b — Count of `WeeklySummary` rows the user has accumulated.
   * Each row = one editorial insight Eco generated for a finished ISO
   * week. Defaults to 0 for FREE users (they get the summary feature but
   * not the cron — surfaces zero until they regenerate manually).
   */
  insightsCount: number;
  /**
   * Sprint G2b — Distinct categorical tags across the user's full diary
   * history. Approximation of "patrones detectados" — patterns are
   * surfaces with shared tags. Until the LLM pattern detector lands, this
   * count is a meaningful proxy.
   */
  patternsCount: number;
}

export interface HomeReflectionPrompt {
  id: string;
  text: string;
}

export interface HomeShortcut {
  id: ShortcutId;
  label: string;
  badge: number | null;
}

export interface HomeResponse {
  user: HomeUser;
  greeting: HomeGreeting;
  continueBook: HomeContinueBook | null;
  ecoMoment: HomeEcoMoment | null;
  recos: HomeReco[];
  stats: HomeStats;
  reflectionPrompt: HomeReflectionPrompt | null;
  shortcuts: HomeShortcut[];
  // ─── Sprint B1 redesign additions ────────────────────────────────────────
  /** Active ambient theme from UserPreferences.ambient. Defaults to "calma". */
  ambient: AmbientId;
  /**
   * Daily insight surfaced at the top of the new dashboard. `null` when nothing
   * notable was detected — clients render a neutral placeholder in that case.
   * v1 is rule-based (see `composeInsightToday` in HomeService); v2 will be
   * LLM-backed analog to WeeklySummary.
   */
  insightToday: InsightToday | null;
  // ─── Sprint D additions ────────────────────────────────────────
  /**
   * Emotional Map for the Inicio radar (6 axes, cached 24h server-side).
   * PR-0.2: `null` when the map is temporarily unavailable (the
   * EMOTIONAL_MAP_PUBLIC kill switch is off). The client shows an
   * "unavailable" state — never zeros or an empty radar.
   */
  emotionalMap: EmotionalMapResult | null;
  /** Top-5 interleaved activity feed for the Inicio timeline card. */
  activity: ActivityFeedResponse;
}

// ─── Sprint D — Emotional Map ───────────────────────────────────────────

/** 6 axes in fixed order: Calma · Claridad · Conexión · Propósito ·
 *  Compasión · Consciencia. Each value in [0, 1]. */
export type EmotionalMapAxes = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];

/** Stable key per axis, in radar order. */
export type EmotionalMapDimensionKey =
  | "calma"
  | "claridad"
  | "conexion"
  | "proposito"
  | "compasion"
  | "consciencia";

/**
 * Per-dimension detail used by the transparency UI (the ℹ️ modal + the
 * "reuniendo datos" state). `value` is the 0..1 score; `confidence` is how
 * much real signal backs it — the client renders "aún reuniendo datos" when
 * confidence is below a small threshold instead of showing a fabricated
 * number. `sources` is a short human summary of what feeds the axis today.
 */
export interface EmotionalMapDimension {
  key: EmotionalMapDimensionKey;
  value: number;
  confidence: number;
  sources: string;
  /**
   * True when the axis comes from a real measurement (OU affect model for
   * Calma, daily check-in answers for Claridad/Compasión/Consciencia) rather
   * than an activity proxy or LLM interpretation. Optional so maps cached
   * before Etapa 2 keep parsing; UIs fall back to their own heuristic.
   */
  measured?: boolean;
  /**
   * Fase D — Evidence lite: the provenance the transparency modal shows.
   * `modelId` is a canonical Model Registry id (H1 / OU-G0 / OU-GT / CHK-S1
   * / TXT-L1); `n` is how many observations back the axis. Null while the
   * axis is still gathering; optional so pre-Fase-D cached maps keep parsing.
   */
  evidence?: { modelId: string; n: number } | null;
}

/**
 * Tier 2 — affect-dynamics block derived from fitting an Ornstein–Uhlenbeck
 * process to the user's ordinal mood series. `status: "gathering"` means there
 * isn't enough mood history yet (the UI shows progress toward `needed`); when
 * `"active"`, the four metrics carry the estimated parameters, each in a
 * human-friendly framing. NEVER a diagnosis — it's an experimental
 * self-knowledge signal (see docs/research/emotional-map-affect-dynamics.md).
 */
export interface EmotionalMapAffectDynamics {
  status: "active" | "gathering";
  /** Mood observations used for the fit. */
  nObs: number;
  /** Observations at which the estimate reaches full confidence. */
  needed: number;
  /**
   * Observations at which the recovery + inertia axes unlock. They need more
   * history than baseline/stability because θ is hard to estimate from short
   * series (Etapa 1 reliable-axes-first gating).
   */
  recoveryNeeded: number;
  /** 0..1 — how much the estimate can be trusted (grows with nObs). */
  confidence: number;
  /** Emotional baseline / tone in [0,1]. Present when status === "active". */
  baseline: number | null;
  /**
   * Recovery speed (θ) mapped to [0,1]. Higher = you bounce back faster. Null
   * until `nObs >= recoveryNeeded` (θ needs more data than the other axes).
   */
  recovery: number | null;
  /**
   * Emotional stability in [0,1]. Higher = lower volatility. Derived from the
   * stationary spread of moods with a measurement-noise floor, so ordinary
   * ±1-level day-to-day check-in swings don't count as instability (Etapa 1).
   */
  stability: number | null;
  /**
   * Emotional inertia = 1/θ in days. Higher = moods persist longer. Null until
   * `nObs >= recoveryNeeded` (same θ-identifiability gate as `recovery`).
   */
  inertiaDays: number | null;
  /**
   * Etapa 4 (v1 ordinal-latent) — season direction. "up"/"down" when a
   * statistically significant linear trend was detected in the latent mood
   * (the stability axis is then computed on the DETRENDED residuals, so
   * improving ≠ unstable); null when the mood is stationary. Optional so
   * cached pre-Etapa-4 blobs keep deserializing.
   */
  trend?: "up" | "down" | null;
  /**
   * Etapa 3 — 90% bootstrap half-widths per axis, in the same 0–1 units as
   * the axes (the UI renders "72% ±8"). Null per axis when that axis is
   * gated; the whole block is null when the bootstrap could not run.
   * Optional so cached pre-Etapa-3 blobs keep deserializing.
   */
  margins?: {
    baseline: number | null;
    recovery: number | null;
    stability: number | null;
  } | null;
  /**
   * Etapa 5 — early-warning signal (critical slowing down). "rising" when the
   * rolling lag-1 autocorrelation AND variance of the (detrended) mood series
   * both trend upward (Kendall τ ≥ threshold, calibrated to a ~6% false-alarm
   * rate under a stationary null — experiment E5). "insufficient" below the
   * observation floor (`needed`). NEVER a diagnosis — the UI surfaces it only
   * as a kind self-care nudge. Optional so cached pre-Etapa-5 blobs keep
   * deserializing.
   */
  ews?: {
    status: "insufficient" | "steady" | "rising";
    /** Kendall τ of the rolling lag-1 autocorrelation (null when insufficient). */
    tauAc: number | null;
    /** Kendall τ of the rolling variance (null when insufficient). */
    tauVar: number | null;
    /** Observations required before the signal can be computed. */
    needed: number;
  } | null;
}

export interface EmotionalMapResult {
  values: EmotionalMapAxes;
  /** Per-axis confidence in [0, 1], same order as `values`. */
  confidence: EmotionalMapAxes;
  /** 6 dimension details (radar order) for the transparency UI. */
  dimensions: EmotionalMapDimension[];
  /** 0–100 overall comprehension percentage shown next to the radar.
   *  Averages ONLY the axes with real signal, so low-data maps don't inflate.
   *  LEGACY (V2 principle: no global pct) — kept on the wire for cache/cron
   *  compat, but the V2 UI never renders it. */
  pct: number;
  /** 0..1 overall data coverage — gates the "aún reuniendo datos" banner. */
  coverage: number;
  /** Tier 2 affect-dynamics (OU) block. Null when the layer is disabled. */
  affectDynamics?: EmotionalMapAffectDynamics | null;
  computedAt: string;
  /** Which provider answered the LLM axes ("anthropic" / "rule-based" / …). */
  provider: string;
  /**
   * Fase F — V2 contract marker. Present (true) only when the server computed
   * the map under EMOTIONAL_MAP_V2 AND the legacy UI window is over
   * (EMOTIONAL_MAP_LEGACY_UI off). Clients branch their layout on this field
   * — server-driven rollout, no client env needed. Optional so cached and
   * legacy blobs keep parsing.
   */
  v2?: true;
  /**
   * Fase F (V2 sections) — "Mi momento": the latest self-reported mood
   * observation (diary or mood log). Null when the user never logged one.
   * Only populated under the V2 contract.
   */
  momento?: { mood: string; at: string } | null;
  /**
   * Fase F (V2 sections) — "Patrones de lenguaje", descriptive-only: how many
   * reflections the on-device analyzer (TXT-L1) processed in the window.
   * Under V2 the text features NO LONGER score any axis — they surface here
   * as an opt-in descriptive card instead. Null without consented data.
   */
  lenguaje?: { n: number } | null;
  /**
   * Fase F (decision L3) — optional narrative over the computed facts
   * (NAR-L1, copy only). Null when the narrator flag is off or the call
   * failed; switching it off never changes the data above.
   */
  narrative?: { headline: string; body: string; modelId: string } | null;
}

// ─── Sprint D — Activity feed ───────────────────────────────────────────

export type ActivityFeedItemType = "diary" | "reading" | "eco" | "voice";

export interface ActivityFeedItem {
  id: string;
  type: ActivityFeedItemType;
  /** ISO timestamp. Clients format relative ("hace 2h", "ayer", …). */
  timestamp: string;
  title: string;
  subtitle: string;
  href: string | null;
}

export interface ActivityFeedResponse {
  items: ActivityFeedItem[];
}

// ─── Sprint E1 — Evolución ──────────────────────────────────────────────

export interface EvolucionStats {
  reflexiones: number;
  capitulosCompletados: number;
  minutosLectura: number;
  rachaActual: number;
  rachaMasLarga: number;
  diasActivos30d: number;
  /**
   * Fase C (V2) — Evolución IS the learning dashboard: engagement counters
   * live here, not on the emotional map. Eco USER messages, all time.
   */
  conversacionesEco: number;
  /** Highlights + annotations created while reading, all time. */
  marcasLectura: number;
}

export interface EvolucionMilestone {
  id: string;
  label: string;
  description: string;
  /** Lucide-style icon token (`book-open`, `flame`, `star`…). Client maps it. */
  icon: string;
  progressTarget: number;
  progressCurrent: number;
  /** ISO timestamp, or null when still in progress. */
  unlockedAt: string | null;
  category: string | null;
}

/**
 * Sprint G2 — One point in the "Comprensión emocional" line chart of the
 * Evolución screen. The series is empty for a brand-new user; it fills in
 * one row per month thanks to the `EmotionalMapSnapshot` cron.
 */
export interface EvolucionEmotionalSeriesPoint {
  /** First day of the month in UTC, ISO date format `YYYY-MM-DD`. */
  monthIso: string;
  /** Same 0..100 percent shape as `EmotionalMapResult.pct`.
   *  LEGACY since Fase G — kept for wire compat; clients chart `coverage`. */
  pct: number;
  /**
   * Fase G — map data coverage that month, as a 0..100 percent. This is what
   * the Evolución chart plots now: how much signal backs the map (an honest
   * data-availability metric), never a psychological score. Null on
   * pre-Fase-G snapshots.
   */
  coverage: number | null;
}

export interface EvolucionResponse {
  stats: EvolucionStats;
  milestones: EvolucionMilestone[];
  /**
   * PR-0.2 — false when the emotional map is switched off
   * (EMOTIONAL_MAP_PUBLIC). Distinct from "an empty series": the clients must
   * show a "temporarily unavailable" note for the emotional history section,
   * NOT "you have no history yet". stats + milestones stay available.
   */
  emotionalMapAvailable: boolean;
  /**
   * Sprint G2 — Historical line chart series. Empty array when no
   * snapshots exist yet (new account or pre-cron period). Sorted by
   * month ascending. Client shows a single-dot fallback when length < 2.
   *
   * PR-0.2 — `null` (not `[]`) when `emotionalMapAvailable` is false: the map
   * is switched off, so the history is withheld, not absent.
   */
  emotionalSeries: EvolucionEmotionalSeriesPoint[] | null;
}

export interface UpdateUserMoodRequest {
  moodId: string;
}

export interface UpdateUserMoodResponse {
  ok: true;
  mood: string;
  swatch: string;
}

export interface DismissReflectionPromptResponse {
  ok: true;
}

// ─── Sprint B1 — Mood time series + ambient + insight ─────────────────────────
//
// MoodLog rows are written by POST /api/mood whenever the user picks a mood
// in the Topbar MoodChip or finishes a Diario entry. They drive Patrones IA
// and the InsightToday rule engine. See ADR-pending B1 for the rationale.

/**
 * Identifier for an ambient (UI theme) the user can pick from the AmbiencePicker.
 *   - calma   — default lavender palette
 *   - enfoque — cooler indigo, deeper focus
 *   - energia — warmer terracotta, daytime drive
 *   - noche   — dark mode for late sessions
 *
 * The token is validated at the backend with `AMBIENT_IDS` (runtime) and at
 * the frontend with `body.amb-{calma|enfoque|energia|noche}` CSS overrides.
 */
export type AmbientId = "calma" | "enfoque" | "energia" | "noche";

export const AMBIENT_IDS: readonly AmbientId[] = [
  "calma",
  "enfoque",
  "energia",
  "noche",
] as const;

export interface UpdateAmbientRequest {
  ambient: AmbientId;
}

export interface UpdateAmbientResponse {
  ok: true;
  ambient: AmbientId;
}

/**
 * One mood check-in. Persisted to MoodLog rows.
 *
 * `mood` is one of `DIARY_MOOD_IDS`; we ship the literal token (not an emoji
 * or swatch) so adding moods later does not require a wire migration.
 */
export interface MoodLogEntry {
  id: string;
  mood: DiaryMoodId;
  createdAt: Date;
}

export interface LogMoodRequest {
  mood: string;
}

export interface LogMoodResponse {
  ok: true;
  /** The just-created MoodLog row, returned so optimistic UIs can confirm. */
  entry: MoodLogEntry;
  /** Latest known mood across history (always equals `entry.mood` for new logs). */
  currentMood: DiaryMoodId;
  /** Hex/swatch hint for the badge — same source the Diario uses. */
  swatch: string;
}

// ─── Micro-checkins (Mapa Emocional · Etapa 2) ──────────────────────────────
//
// One 5-second question after the daily mood pick. Items are ADAPTED from
// validated instruments (TMMS-24 emotional clarity, Self-Compassion Scale
// short form, MAAS present-moment awareness) — inspiration, not the validated
// scales themselves. Answers are plain ordinal scores (0–4): no text, no
// ciphertext, ADR 0007-friendly. They feed the Claridad / Compasión /
// Consciencia axes of the Emotional Map as MEASURED signals.

export type CheckinAxis = "claridad" | "compasion" | "consciencia";

export interface CheckinItem {
  readonly key: string;
  readonly axis: CheckinAxis;
  /** The question shown to the user (Ecuadorian Spanish, tú). */
  readonly text: string;
}

export const CHECKIN_ITEMS: readonly CheckinItem[] = [
  {
    key: "claridad_nombrar",
    axis: "claridad",
    text: "¿Pudiste ponerle nombre a lo que sentiste hoy?",
  },
  {
    key: "claridad_causa",
    axis: "claridad",
    text: "¿Tuviste claro qué causó tus emociones de hoy?",
  },
  {
    key: "compasion_amable",
    axis: "compasion",
    text: "¿Fuiste amable contigo cuando algo salió mal?",
  },
  {
    key: "compasion_juicio",
    axis: "compasion",
    text: "Hoy, ¿te trataste sin juzgarte demasiado?",
  },
  {
    key: "consciencia_presente",
    axis: "consciencia",
    text: "¿Notaste tus emociones en el momento en que aparecían?",
  },
  {
    key: "consciencia_pausa",
    axis: "consciencia",
    text: "¿Te diste un momento para observar cómo estabas?",
  },
] as const;

/** Runtime array for validators (class-validator @IsIn). */
export const CHECKIN_ITEM_KEYS: readonly string[] = CHECKIN_ITEMS.map(
  (i) => i.key,
);

/** Answer scale, index = score (0–4). Shared so web + mobile render the same. */
export const CHECKIN_SCALE: readonly string[] = [
  "Para nada",
  "Un poco",
  "A medias",
  "Bastante",
  "Totalmente",
] as const;

export interface LogCheckinRequest {
  itemKey: string;
  /** 0–4 on the CHECKIN_SCALE. */
  score: number;
}

export interface LogCheckinResponse {
  ok: true;
  id: string;
  itemKey: string;
  score: number;
  createdAt: Date;
}

/** `item` is null when today's question was already answered (rolling ~20h). */
export interface CheckinNextResponse {
  item: CheckinItem | null;
}

/**
 * Daily insight surfaced in HomeResponse.insightToday. Rule-based v1: see the
 * `kind` discriminator for the four shapes the engine emits.
 */
export type InsightKind =
  | "mood-trend" // detected a streak of similar moods in the last 3 days
  | "book-progress" // user is mid-book; nudge to keep going
  | "streak" // celebrate currentStreakDays
  | "neutral"; // fallback — generic encouragement

export interface InsightToday {
  kind: InsightKind;
  headline: string;
  body: string;
  /** Optional CTA. When present, the dashboard renders a link with this href. */
  ctaHref?: string;
  ctaLabel?: string;
}

// ─── Diary · E2E-encrypted entries (Sprint S6) ───────────────────────────────
//
// Wire format only. The cleartext lives on-device. See ADR 0007 for the
// crypto model. Backend treats `textCiphertext` / `textNonce` as opaque
// blobs — these types do NOT include any plaintext shape.

export type DiaryEntryKind = "free" | "prompted" | "voz";

/**
 * Shared catalog of mood IDs used by the Diario composer + Inicio mood picker.
 *
 * The backend treats `User.mood` and `DiaryEntry.mood` as opaque strings (the
 * column is `String`, not an enum), so adding a new mood here does NOT require
 * a migration. The catalog ships in `@psico/types` so web + mobile render the
 * same set without copy-paste drift.
 *
 * IDs match the Onboarding seed (`OnboardingMood.id` values).
 */
export interface DiaryMoodOption {
  readonly id: string;
  readonly emoji: string;
  readonly label: string;
}

// Sprint B6b: aligned with redesign-v2 (5 wellness levels, design IDs).
// Legacy IDs (calma/foco/…) live in DB rows pre-B6b; the chip shows
// "¿Cómo estás?" until the user picks again. No migration needed — the
// column is String, the validator just accepts the new set.
export const DIARY_MOODS: readonly DiaryMoodOption[] = [
  { id: "great", emoji: "😄", label: "Muy bien" },
  { id: "good", emoji: "🙂", label: "Bien" },
  { id: "ok", emoji: "😐", label: "Neutral" },
  { id: "low", emoji: "😕", label: "Bajo" },
  { id: "hard", emoji: "😣", label: "Difícil" },
] as const;

export type DiaryMoodId = (typeof DIARY_MOODS)[number]["id"];

/**
 * Plain-string mood IDs for runtime validators that need a non-typed array
 * (e.g. class-validator's `@IsIn`). Sourced from DIARY_MOODS so adding a mood
 * there propagates automatically.
 */
export const DIARY_MOOD_IDS: readonly string[] = DIARY_MOODS.map((m) => m.id);

// ─── PR-2A · mood normalization (backend/schema only) ───────────────────────
//
// The OU affect-dynamics model must only ever consume mood observations we can
// vouch for: an explicit user pick in the canonical ordinal vocabulary. PR-2A
// lays the schema + a pure server-side normalizer; it does NOT backfill, does
// NOT touch scoring, and does NOT activate OU. See
// docs/architecture/emotional-map-mood-normalization.md (frozen contract).

/** The single ordinal vocabulary the OU can read. The NUMBER (great=1 … hard=-1)
 *  lives in model v0 (MOOD_SCALAR), never in the DB — the DB stores the CATEGORY. */
export const MOOD_CANONICAL_IDS = [
  "hard",
  "low",
  "ok",
  "good",
  "great",
] as const;
export type MoodCanonical = (typeof MOOD_CANONICAL_IDS)[number];

/** Where a mood observation came from. Derived by the SERVER from the write
 *  endpoint — never sent by the client. `READER_REFLECTION` is reserved for a
 *  future dedicated reader endpoint and is not assigned in PR-2A. */
export const MOOD_PROVENANCES = [
  "MOOD_LOG",
  "DIARY",
  "READER_REFLECTION",
  "ONBOARDING",
  "IMPORT",
  "SEED",
  "UNKNOWN",
] as const;
export type MoodProvenance = (typeof MOOD_PROVENANCES)[number];

/**
 * Why an observation is NOT eligible for the dynamics model. An eligible
 * observation always has exclusionReason = null. NOT the converse: rows not yet
 * normalized can have reason = null while they remain eligible = false.
 */
export const MOOD_EXCLUSION_REASONS = [
  "not_selected",
  "ambiguous_default",
  "pre_normalizer_review",
  "legacy_vocabulary",
  "unknown_token",
  "stale_normalizer",
] as const;
export type MoodExclusionReason = (typeof MOOD_EXCLUSION_REASONS)[number];

/** Current normalizer mapping version. Bump when the mapping changes so a
 *  future re-normalization can find the rows it must redo (`stale_normalizer`). */
export const MOOD_NORMALIZER_VERSION = "norm-1";

/**
 * PR-2B · versioned client attestation of explicit selection. A VERSIONED
 * CLIENT ATTESTATION, not a cryptographic proof — the client asserts "the user
 * actively picked this mood". Server-owned per endpoint:
 *   - `mood-log-v1`  — check-in (a face tap IS explicit).
 *   - `explicit-v1`  — Diary reflexion with an explicit pick (supported client).
 *   - `seed-v1`      — seeds.
 *   - null           — Diary legacy (no signal) / no pick.
 * The ONLY value a client may SEND is `explicit-v1` (on a reflexion write); the
 * rest are stamped by the server. `EXPLICIT_SELECTION_VERSION` is that token.
 */
export const EXPLICIT_SELECTION_VERSION = "explicit-v1";
export const MOOD_SELECTION_VERSIONS = [
  "explicit-v1",
  "mood-log-v1",
  "seed-v1",
] as const;
/** The selection-version values a CLIENT is allowed to send (only the explicit
 *  attestation). Anything else in the request body is a 400. */
export const CLIENT_SELECTION_VERSIONS = ["explicit-v1"] as const;
/** The FULL set — server / persistence side (explicit-v1 | mood-log-v1 | seed-v1). */
export type MoodSelectionVersion = (typeof MOOD_SELECTION_VERSIONS)[number];
/**
 * The subset a CLIENT may put on a reflexion request — only the explicit
 * attestation. Use this (not `MoodSelectionVersion`) on request DTOs so the wire
 * type can't express a server-owned attestation.
 */
export type ClientMoodSelectionVersion =
  (typeof CLIENT_SELECTION_VERSIONS)[number];

/** The server-computed normalization written alongside the RAW mood. All nine
 *  fields are server-owned; the client controls none of them. */
export interface MoodNormalization {
  moodNormalized: MoodCanonical | null;
  moodProvenance: MoodProvenance;
  moodExplicitlySelected: boolean;
  moodVocabularyVersion: string | null;
  moodNormalizerVersion: string;
  moodClientVersion: string | null;
  /** PR-2B — versioned attestation of explicit selection (server-owned). */
  moodSelectionVersion: string | null;
  moodEligibleForDynamics: boolean;
  moodExclusionReason: MoodExclusionReason | null;
}

/**
 * Shared catalog of post-session moods used by the Terapia feedback flow.
 * Independent from Diary moods — sessions use a coarser 5-option grid because
 * the user is rating their state right after therapy, not journaling.
 */
export interface TherapyMoodOption {
  readonly id: string;
  /** Already includes the emoji prefix (e.g. "🙂 Calmo") for inline rendering. */
  readonly label: string;
}

export const THERAPY_MOODS: readonly TherapyMoodOption[] = [
  { id: "calmo", label: "🙂 Calmo" },
  { id: "ansioso", label: "😰 Ansioso" },
  { id: "triste", label: "😔 Triste" },
  { id: "energico", label: "✨ Enérgico" },
  { id: "cansado", label: "🥱 Cansado" },
] as const;

export type TherapyMoodId = (typeof THERAPY_MOODS)[number]["id"];

/**
 * Plain-string therapy mood IDs for runtime validators (`@IsIn`).
 * Sourced from THERAPY_MOODS so adding a mood there propagates.
 */
export const THERAPY_MOOD_IDS: readonly string[] = THERAPY_MOODS.map(
  (m) => m.id,
);

/**
 * Wellness mood catalog — coarse english tokens used by the `PATCH /api/user/mood`
 * endpoint (`User.mood` column). Distinct from DIARY_MOODS (spanish, 7 entries
 * for journaling) and THERAPY_MOODS (spanish, 5 entries for post-session
 * check-in). This is the "quick wellness ping" vocabulary.
 *
 * Restricted whitelist — keeps the backend agnostic about UI tokens but
 * prevents free-form abuse. Frontend can use this to render a wellness mood
 * picker if needed.
 */
export const WELLNESS_MOOD_IDS = [
  "great",
  "good",
  "calm",
  "neutral",
  "tired",
  "anxious",
  "sad",
  "angry",
] as const;

export type WellnessMoodId = (typeof WELLNESS_MOOD_IDS)[number];

export interface DiaryEntrySummary {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  /**
   * PR-2B · the RAW persisted mood, `string | null`. Null = no pick (render
   * "Sin ánimo registrado" — NEVER coerce to "ok"/neutral). It is typed `string`
   * (not `DiaryMoodId`) on purpose: historical rows may carry a legacy
   * vocabulary token, and the response must represent that honestly rather than
   * pretend it's a current canonical id. REQUESTS stay `DiaryMoodId | null`.
   */
  mood: string | null;
  kind: DiaryEntryKind;
  promptId: string | null;
  promptText: string | null;
  tags: string[];
  /** Excerpt cipher (~80 chars decrypted). null when entry was too short. */
  excerptCiphertext: string | null;
  excerptNonce: string | null;
  audioUrl: string | null;
  audioDurationSec: number | null;
}

export interface DiaryEntryDetail extends DiaryEntrySummary {
  /** Full body cipher. */
  textCiphertext: string;
  textNonce: string;
}

/** moodMap.byDay: ISO date "YYYY-MM-DD" → mood token (most recent of the day). */
export interface DiaryMoodMap {
  byDay: Record<string, string>;
}

export interface DiaryTagCount {
  tag: string;
  count: number;
}

export interface DiaryListResponse {
  entries: DiaryEntrySummary[];
  moodMap: DiaryMoodMap;
  tags: DiaryTagCount[];
  pagination: Pagination;
}

export interface DiaryDetailResponse {
  entry: DiaryEntryDetail;
  relatedEntryIds: string[];
}

/**
 * Lean view returned by `GET /api/diario/entries/raw-ciphers` — only the
 * fields the password-change-with-rekey flow needs to re-encrypt entries.
 * No mood, no tags, no related-entry search.
 */
export interface DiaryRawCipherEntry {
  id: string;
  textCiphertext: string;
  textNonce: string;
  excerptCiphertext: string | null;
  excerptNonce: string | null;
}

export interface DiaryRawCiphersResponse {
  entries: DiaryRawCipherEntry[];
}

export interface CreateDiaryEntryRequest {
  /**
   * PR-2B · optional and null-capable. Omit (or send null) for a reflexión with
   * no mood pick. A present value must be a canonical `DiaryMoodId`.
   */
  mood?: DiaryMoodId | null;
  /**
   * PR-2B · the client's attestation that `mood` was an EXPLICIT pick. The ONLY
   * value a client may send is `explicit-v1`. Send it whenever the user taps a
   * mood; omit it for a defaulted mood. Sending it without a `mood` is a 400.
   */
  moodSelectionVersion?: ClientMoodSelectionVersion;
  kind?: DiaryEntryKind;
  promptId?: string;
  /** base64url ciphertext of the body. Up to ~1 MB. */
  textCiphertext: string;
  /** base64url 24-byte nonce. */
  textNonce: string;
  /** Optional preview cipher (~80 char plaintext encrypted separately). */
  excerptCiphertext?: string;
  excerptNonce?: string;
  tags?: string[];
  audioUrl?: string;
  audioDurationSec?: number;
}

export interface UpdateDiaryEntryRequest {
  /**
   * PR-2B · three-way. Omit to leave the mood untouched; send `null` to clear
   * it; send a canonical `DiaryMoodId` to set it.
   */
  mood?: DiaryMoodId | null;
  /** PR-2B · client attestation (`explicit-v1` only) that `mood` was tapped. */
  moodSelectionVersion?: ClientMoodSelectionVersion;
  textCiphertext?: string;
  textNonce?: string;
  excerptCiphertext?: string;
  excerptNonce?: string;
  tags?: string[];
}

export interface CreateDiaryEntryResponse {
  ok: true;
  id: string;
  createdAt: Date;
  /** Echoed back so the client can update its local cache without re-encrypting. */
  excerptCiphertext: string | null;
}

export interface DeleteDiaryEntryResponse {
  ok: true;
}

export interface DiaryPromptOfTheDay {
  id: string;
  text: string;
}

export interface ShareDiaryEntryRequest {
  therapistId: string;
  /** base64url ciphertext encrypted with an ephemeralKey only the therapist can derive. */
  ciphertextForTherapist: string;
  /** base64url AEAD(ephemeralKey, ECDH(userPriv, therapistPub)). */
  wrappedKey: string;
  /** base64url X25519 pubkey used in the ECDH on the user side. */
  userOneShotPubKey: string;
  /** Optional shorter TTL (ISO 8601). Server caps at 30 days; default 7. */
  expiresAt?: string;
}

export interface ShareDiaryEntryResponse {
  ok: true;
  shareId: string;
  shareUntil: Date;
}

// ─── Lector (Sprint S6) ───────────────────────────────────────────────────────
//
// Reader for book chapters. `Chapter.body` no longer lives in DB as a string;
// each chapter is split into typed `ChapterBlock`s so highlights and
// annotations can anchor to a stable block id, and so the Mode Guía audio
// track can sync each transcription segment to the corresponding block.
// See ADR-free for the schema rationale — design in 05-lector.md.

export type ChapterBlockKind =
  | "PARAGRAPH"
  | "HEADING"
  | "QUOTE"
  | "EXERCISE"
  | "AUDIO"
  | "IMAGE"
  | "PAUSE"
  | "VIDEO";

export type HighlightColor = "YELLOW" | "BLUE" | "PINK";

export interface ChapterBlockSummary {
  id: string;
  order: number;
  kind: ChapterBlockKind;
  /** Markdown text for PARAGRAPH/HEADING/QUOTE; caption for IMAGE/AUDIO/EXERCISE/VIDEO. */
  content: string;
  /** Structured metadata; shape depends on `kind`. See lector/README.md. */
  meta: Record<string, unknown> | null;
  /**
   * Stable public block identity (Content Core, CC-6B). Present on blocks
   * projected from the Content Core reader; used as the public write identity
   * when creating highlights/annotations. Absent on legacy lector blocks.
   */
  blockKey?: string;
}

// ── Content Core read shapes (CC-6A / CC-6A.1 / CC-6B) ────────────────────────
// Mirror the API read DTOs so web + mobile consume the canonical source of a
// chapter's text (Content Core, with a fail-closed legacy fallback) instead of
// the lector envelope. The reader keeps its visual block id as
// `legacyBlockId ?? blockKey` so marks/audio-sync/heartbeat keep matching.

/** One content block of a unit, from Content Core or the legacy fallback. */
export interface ContentReadBlock {
  /** Stable public block identity (uuidv5). */
  blockKey: string;
  /** Legacy ChapterBlock id (anchor-compat bridge); null for a pure-core block. */
  legacyBlockId: string | null;
  /** Block kind (PARAGRAPH, HEADING, …). Widen at the edge, narrow on project. */
  kind: string;
  /** 0-based position within the unit. */
  order: number;
  content: string;
  /** Structured metadata by kind (audioUrl, videoUrl, …). */
  meta: Record<string, unknown> | null;
}

/** A single content unit resolved by the read adapter (CC-6A). */
export interface ContentUnitRead {
  editionKey: string;
  /** Published revision number, or null when served from legacy. */
  revisionNumber: number | null;
  unitKey: string;
  title: string;
  summary: string | null;
  order: number;
  partNumber: number | null;
  partTitle: string | null;
  /** Which store served this unit. */
  source: "content-core" | "legacy";
  blocks: ContentReadBlock[];
}

/** One published unit in a book manifest (CC-6A.1). */
export interface ManifestUnit {
  unitKey: string;
  /** 1-based reading order within the book. */
  order: number;
  title: string;
  summary: string | null;
  partNumber: number | null;
  partTitle: string | null;
}

/** The ordered manifest of a book's published units (CC-6A.1). */
export interface BookManifest {
  bookSlug: string;
  /** Which store served this manifest. */
  source: "content-core" | "legacy";
  /** Server-owned edition key — clients never fabricate it. */
  editionKey: string;
  revisionNumber: number | null;
  units: ManifestUnit[];
}

/**
 * The current user's marks for one unit (CC-6C), keyed by the stable blockKey.
 * New clients read the chapter TEXT from `/api/content` and the marks from this
 * surface; the lector envelope keeps serving marks for old (legacy) clients.
 */
export interface ContentUnitMarks {
  editionKey: string;
  unitKey: string;
  highlights: HighlightSummary[];
  annotations: AnnotationSummary[];
}

/**
 * Project a Content Core unit's blocks into the reader's ChapterBlockSummary
 * shape (CC-6B). Single source of truth so web and mobile build a byte-identical
 * reader model from the same unit.
 *
 * The visual/anchor id stays `legacyBlockId ?? blockKey` so existing marks,
 * audio-transcript sync and the heartbeat's lastBlockId keep matching with zero
 * downstream churn; `blockKey` is carried through as the public write identity
 * used when creating highlights/annotations.
 */
export function projectReaderBlocks(unit: {
  blocks: ContentReadBlock[];
}): ChapterBlockSummary[] {
  return unit.blocks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((b) => ({
      id: b.legacyBlockId ?? b.blockKey,
      order: b.order,
      kind: b.kind as ChapterBlockKind,
      content: b.content,
      meta: b.meta,
      blockKey: b.blockKey,
    }));
}

/**
 * Metadata carried by a VIDEO block's `meta` JSON. All optional — an empty
 * (or null) meta means the video isn't uploaded yet and the player renders an
 * "en producción" placeholder. Book videos are public licensed content, so
 * `videoUrl` is a direct public R2/CDN URL (no signing needed, like audio).
 */
export interface VideoBlockMeta {
  /** Direct public URL of the video file (mp4/webm). */
  videoUrl?: string;
  /** Optional poster/thumbnail image shown before playback. */
  posterUrl?: string;
  /** Optional duration in seconds (for the UI to show a runtime hint). */
  durationSec?: number;
}

/** Resolved shape returned by {@link videoBlockInfo}. */
export interface VideoBlockInfo {
  /** Playable URL, or null when the video isn't uploaded yet. */
  url: string | null;
  /** Poster image URL, or null. */
  poster: string | null;
  /** Human caption (leading "🎬" stripped from legacy blocks). */
  caption: string;
  /** Runtime hint in seconds, or null. */
  durationSec: number | null;
}

/**
 * Detect whether a chapter block is a video, and resolve its playback info.
 *
 * Returns null for non-video blocks. A block counts as a video when its kind
 * is "VIDEO" OR — for backward compatibility with chapters ingested before the
 * VIDEO kind existed — it's an "EXERCISE" whose content starts with "🎬".
 * This lets already-seeded data upgrade to the real player without a
 * destructive re-ingest (which would cascade-delete highlights/annotations).
 *
 * Single source of truth so web + mobile agree on detection and meta parsing.
 */
export function videoBlockInfo(block: {
  kind: string;
  content: string;
  meta: Record<string, unknown> | null;
}): VideoBlockInfo | null {
  const isVideoKind = block.kind === "VIDEO";
  const isLegacyMock =
    block.kind === "EXERCISE" && block.content.trimStart().startsWith("🎬");
  if (!isVideoKind && !isLegacyMock) return null;

  const meta = block.meta ?? {};
  const url =
    typeof meta.videoUrl === "string" && meta.videoUrl ? meta.videoUrl : null;
  const poster =
    typeof meta.posterUrl === "string" && meta.posterUrl
      ? meta.posterUrl
      : null;
  const durationSec =
    typeof meta.durationSec === "number" && meta.durationSec > 0
      ? meta.durationSec
      : null;
  // Strip a leading "🎬" (+ whitespace) from legacy EXERCISE mocks.
  const caption = block.content.replace(/^\s*🎬\s*/, "").trim();

  return { url, poster, caption, durationSec };
}

export interface HighlightSummary {
  id: string;
  /** Stable public block identity (uuidv5). Match reader blocks by this. */
  blockKey: string;
  /** Legacy ChapterBlock id — compatibility bridge; nullable for pure-core blocks. */
  blockId: string | null;
  startOffset: number;
  endOffset: number;
  color: HighlightColor;
  note: string | null;
  createdAt: Date;
}

export interface AnnotationSummary {
  id: string;
  /** Stable public block identity (uuidv5). Match reader blocks by this. */
  blockKey: string;
  /** Legacy ChapterBlock id — compatibility bridge; nullable for pure-core blocks. */
  blockId: string | null;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LectorChapterLesson {
  id: string;
  title: string;
  /** Type tag mirrored from `Exercise.type`. */
  kind: string;
  durationMinutes: number | null;
  status: "locked" | "available" | "completed";
}

export interface LectorReadingSessionSnapshot {
  /** 0–1 ratio (clamped). */
  progressPct: number;
  lastBlockId: string | null;
  timeSpentSec: number;
  startedAt: Date;
  lastSeenAt: Date;
  completedAt: Date | null;
}

export interface LectorChapterResponse {
  book: {
    id: string;
    slug: string;
    title: string;
    authorName: string | null;
    cover: string;
    totalChapters: number;
  };
  chapter: {
    id: string;
    order: number;
    title: string;
    subtitle: string | null;
    durationMinutes: number | null;
    audioAvailable: boolean;
    /** Book part this chapter belongs to (null for single-part books). */
    partNumber: number | null;
    partTitle: string | null;
  };
  blocks: ChapterBlockSummary[];
  lessons: LectorChapterLesson[];
  highlights: HighlightSummary[];
  annotations: AnnotationSummary[];
  session: LectorReadingSessionSnapshot;
  /** Reader prefs from User.readerPreferences (mirrored here so the client can render without an extra fetch). */
  preferences: {
    theme: "system" | "light" | "sepia" | "dark";
    font: "serif" | "sans";
    fontSize: number;
    lineHeight: number;
  };
}

// ─── Lector · session heartbeat ──────────────────────────────────────────────

export interface LectorSessionHeartbeatRequest {
  bookId: string;
  chapterOrder: number;
  lastBlockId: string;
  /** Seconds elapsed since the previous heartbeat. Server caps at 60 to defend against tab-suspend resume. */
  timeSpentDeltaSec: number;
  /** 0–1 ratio. Server clamps; client computes from scroll position. */
  progressPct: number;
}

export interface LectorSessionHeartbeatResponse {
  ok: true;
  /** Server-canonical progress (may differ from request if server applies caps). */
  progressPct: number;
}

// ─── Lector · audio (Pro) ────────────────────────────────────────────────────

export interface LectorAudioTranscriptSegment {
  start: number;
  end: number;
  text: string;
  blockId: string | null;
}

/**
 * Display metadata for the chapter audio. The client shows it inside the
 * audio bar (artwork + title + subtitle). It is ALSO embedded in the
 * audio file itself via ID3v2 (MP3) / m4a atoms when the file is uploaded
 * — that's the only path through which iOS lock screen and Android
 * MediaSession can pick up the artwork. See the LectorModule README §audio.
 */
export interface LectorAudioMetadata {
  /** Track title — typically "Cap. N · Título del capítulo". */
  title: string;
  /** Track subtitle — typically the book title. */
  subtitle: string;
  /** Track artist — author name. Falls back to "Psico Platform". */
  artist: string;
  /** Album-art URL (book cover). PNG/JPG, ≥300×300 recommended. */
  artworkUrl: string;
}

export interface LectorAudioResponse {
  /** Signed R2 URL, expires in 1h. */
  url: string;
  durationSec: number;
  transcript: LectorAudioTranscriptSegment[];
  /**
   * Display metadata for the bar UI + the contract clients will use when
   * they migrate to a media library that supports dynamic lock-screen
   * metadata (expo-audio / react-native-track-player). With current
   * expo-av the lock-screen still reads embedded file tags — see
   * LectorModule README for the ffmpeg embed snippet.
   */
  metadata: LectorAudioMetadata;
}

// ─── Lector · complete ───────────────────────────────────────────────────────

export interface LectorCompleteResponse {
  ok: true;
  /** Order of the next chapter in the book, or null if this was the last. */
  nextChapter: number | null;
}

// ─── Highlights ──────────────────────────────────────────────────────────────

export interface CreateHighlightRequest {
  /** Public stable block identity (CC-6B). Preferred anchor for new clients. */
  blockKey?: string;
  /** Legacy ChapterBlock id. Still accepted for backward compatibility. */
  blockId?: string;
  startOffset: number;
  endOffset: number;
  color?: HighlightColor;
  note?: string | null;
}

export interface CreateHighlightResponse {
  ok: true;
  highlight: HighlightSummary;
}

// ─── Annotations ─────────────────────────────────────────────────────────────

export interface CreateAnnotationRequest {
  /** Public stable block identity (CC-6B). Preferred anchor for new clients. */
  blockKey?: string;
  /** Legacy ChapterBlock id. Still accepted for backward compatibility. */
  blockId?: string;
  text: string;
}

export interface CreateAnnotationResponse {
  ok: true;
  annotation: AnnotationSummary;
}

export interface UpdateAnnotationRequest {
  text: string;
}

export interface UpdateAnnotationResponse {
  ok: true;
  annotation: AnnotationSummary;
}

// ─── Reader preferences (response shape) ─────────────────────────────────────
// `UpdateReaderPreferencesRequest` was already declared above (UsersModule
// surface from Sesión 9). Sprint S6 reuses it — same fields, same validation.
// We only add the response shape that the Lector layout consumes.

export interface ReaderPreferencesResponse {
  theme: "system" | "light" | "sepia" | "dark";
  font: "serif" | "sans";
  fontSize: number;
  lineHeight: number;
  updatedAt: Date;
}

// ─── Patrones (Sprint S10) ───────────────────────────────────────────────────
//
// Pro-only Diario analytics. The shape mirrors handoff 12-patrones.md.
// v1 returns moodMap + hourMood + weeklySummary in full; themes, vocab,
// correlations, and ecoNotes ship as empty arrays until the NLP layer
// (privacy-preserving over ciphered excerpts) lands in a follow-up sprint.

export type PatronesPeriod = "30d" | "90d" | "1y";

export interface PatronesPeriodDescriptor {
  /** ISO YYYY-MM-DD inclusive. */
  from: string;
  /** ISO YYYY-MM-DD inclusive. */
  to: string;
  label: string;
}

export interface PatronesMoodMapDay {
  /** ISO YYYY-MM-DD. */
  date: string;
  /** moodId from the user's entry on that day (most recent if multiple). */
  moodId: string;
  /** Swatch hex/token from OnboardingMood, for the heatmap cell color. */
  swatch: string;
}

export interface PatronesHourMoodBucket {
  /** 0-23. */
  hour: number;
  /** { moodId: count } across the whole period. */
  moodCounts: Record<string, number>;
}

export interface PatronesTheme {
  id: string;
  label: string;
  count: number;
  entryIds: string[];
}

export interface PatronesCorrelation {
  id: string;
  label: string;
  coefficient: number;
  direction: "+" | "-";
}

export interface PatronesEcoNote {
  id: string;
  text: string;
  relatedTheme: string | null;
}

export interface PatronesVocabWord {
  word: string;
  count: number;
  delta: number;
}

export interface PatronesWeeklySummary {
  headline: string;
  /** Editorial paragraph, plain Markdown. */
  narrative: string;
  entriesUsed: number;
  generatedAt: Date;
  /** UTC midnight of the Monday opening the summary week. */
  weekStart: Date;
}

export interface PatronesResponse {
  /** Plan gate echo. FREE never gets full data — see `locked`. */
  tier: "free" | "pro";
  period: PatronesPeriodDescriptor;
  /** When true, the caller is FREE and the rest of the response is empty. */
  locked: boolean;
  /** How many DiaryEntry rows landed in the requested period. The UI uses
   *  this to gate the "less than 7 entries" empty state. */
  entryCount: number;
  hourMood: PatronesHourMoodBucket[];
  moodMap: PatronesMoodMapDay[];
  themes: PatronesTheme[];
  correlations: PatronesCorrelation[];
  ecoNotes: PatronesEcoNote[];
  vocab: PatronesVocabWord[];
  weeklySummary: PatronesWeeklySummary | null;
}

export interface PatronesRegenerateResponse {
  ok: true;
  weeklySummary: PatronesWeeklySummary;
}

export interface PatronesShareWithTherapistRequest {
  therapistId: string;
}

export interface PatronesShareWithTherapistResponse {
  ok: true;
  /** TerapiaModule (Sprint S13) is not live yet; v1 returns a stub. */
  status: "stub" | "scheduled" | "sent";
}

// ─── Pulso (Sprint S42) ─────────────────────────────────────────────────────
//
// Admin-only back-office. First slice: reports inbox over `EcoMessageReport`.
// All endpoints below sit under `/api/pulso/*` and require role=ADMIN.
//
// Privacy: rows expose `assistantTextSnippet` (the LLM reply that the user
// reported, NOT the user's prompt). User prompts live as ciphertext and are
// never decrypted server-side, so they are intentionally absent from this
// surface.

export type PulsoReportReason =
  | "HALLUCINATION"
  | "OFF_TONE"
  | "SENSITIVE_CONTENT"
  | "CRISIS_MISHANDLED"
  | "OTHER";

export interface PulsoReportRow {
  id: string;
  reason: PulsoReportReason;
  comment: string | null;
  createdAt: Date;
  userId: string;
  messageId: string;
  threadId: string;
  messageKind: "USER" | "ASSISTANT" | "CRISIS" | "SUGGESTION";
  /** Trimmed assistant text (plaintext from the LLM). */
  assistantTextSnippet: string;
  // Sprint S49 — resolution flow. `resolvedAt` null means the row is open;
  // a non-null timestamp marks it triaged. `resolvedBy` is the admin user
  // that acted; `resolutionNote` is an optional short editorial.
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

export interface PulsoReportListResponse {
  items: PulsoReportRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PulsoReportSummary {
  total: number;
  byReason: Record<PulsoReportReason, number>;
}

// Sprint S49 — list filter for resolution state.
//   `open` (default) → resolvedAt IS NULL
//   `resolved`        → resolvedAt IS NOT NULL
//   `all`             → no filter
export type PulsoReportStatus = "open" | "resolved" | "all";

// Sprint S49 — body for POST /api/pulso/reports/eco/:id/resolve. The note
// is optional and capped at 500 chars; the DTO on the server enforces the
// validation.
export interface PulsoMarkResolvedRequest {
  note?: string;
}

// ─── Pulso v2 · Overview (Sprint S48) ───────────────────────────────────────
//
// Single-screen "how is the platform doing" dashboard for ADMIN. All counts
// are aggregates; we deliberately don't expose per-user identifiers here so
// the response is safe to log + share inside the team.
//
// Privacy contract:
// - No userId, email, name, IP, or user-content snippet appears in this shape.
// - All values are integer counts or numeric metrics.
// - The `period.from`/`period.to` are UTC ISO date strings (YYYY-MM-DD).

export interface PulsoOverviewPeriod {
  from: string; // YYYY-MM-DD UTC
  to: string; // YYYY-MM-DD UTC
}

export interface PulsoOverviewUsersBlock {
  total: number;
  /** Created in the last 24h (UTC). */
  newToday: number;
  /** Created in the last 7 days (UTC). */
  newThisWeek: number;
  /** Created in the last 30 days (UTC). */
  newThisMonth: number;
}

export interface PulsoOverviewEngagementBlock {
  /** Distinct users with any activity (diary/eco/lector/voice) in the last 24h. */
  dau: number;
  /** Distinct users with activity in the last 7 days. */
  wau: number;
  /** Distinct users with activity in the last 30 days. */
  mau: number;
}

export interface PulsoOverviewContentBlock {
  diaryEntriesThisWeek: number;
  ecoMessagesThisWeek: number;
  /** Eco messages flagged as crisis (regex or LLM sentinel) in the last 7 days. */
  ecoCrisisThisWeek: number;
  voiceMinutesThisWeek: number;
  readingSessionsThisWeek: number;
}

export interface PulsoOverviewBusinessBlock {
  /** Users on a paid plan (PRO/ANNUAL/B2B). */
  paidUsers: number;
  /** Eco-reports awaiting admin review (no `resolvedAt` yet — v1 = total). */
  reportsBacklog: number;
}

// Sprint S50 — time series + deltas for sparklines in the admin Overview.
//
// `series` is keyed by metric name; each value is an array of N daily
// observations (oldest → newest) covering the last `seriesWindowDays`. Empty
// arrays when no historical data exists yet (fresh install, no
// PlatformMetricDaily rows). Sparse days are zero-filled.
//
// `deltas` compares the LAST 7 days against the PREVIOUS 7 days using
// the corresponding window in `series`. Values are percentage points,
// rounded to 1 decimal. `null` means we don't have enough history to
// compute a meaningful delta.

export interface PulsoOverviewSeries {
  /** Window length (e.g. 30). Same for all metrics. */
  windowDays: number;
  /** Active users that day. */
  dau: number[];
  /** Cumulative Pro+ users at end-of-day. */
  paidUsers: number[];
  /** Diary entries created that day. */
  diaryEntries: number[];
  /** Eco USER messages that day. */
  ecoMessages: number[];
  /** Crisis events flagged that day. */
  ecoCrisis: number[];
  /** Reports opened (created) that day. */
  reportsOpened: number[];
  /** Reports resolved (resolvedAt fell in that day). */
  reportsResolved: number[];
}

export interface PulsoOverviewDeltas {
  dau: number | null;
  diaryEntries: number | null;
  ecoMessages: number | null;
  reportsOpened: number | null;
  reportsResolved: number | null;
}

export interface PulsoOverviewResponse {
  generatedAt: Date;
  period: PulsoOverviewPeriod;
  users: PulsoOverviewUsersBlock;
  engagement: PulsoOverviewEngagementBlock;
  content: PulsoOverviewContentBlock;
  business: PulsoOverviewBusinessBlock;
  /** Sprint S50 — daily time series for sparklines. */
  series: PulsoOverviewSeries;
  /** Sprint S50 — percent-change last 7d vs prev 7d. */
  deltas: PulsoOverviewDeltas;
}

// Sprint S51 — cohort retention triangle (admin /dashboard/admin/cohorts).
//
// One `PulsoCohortRow` per signup-week (Monday UTC), newest first. Each
// row carries the `cohortSize` plus an ordered list of per-week-offset
// `cells` (offset 0 = signup week, offset 1 = +1 week, ...). Each cell
// has `activeUsers` and a precomputed `pct` (0-100, 1 decimal).
//
// `pct` is computed server-side as `activeUsers / cohortSize * 100`. The
// frontend can render the heatmap without doing math.

export interface PulsoCohortCell {
  weekOffset: number;
  activeUsers: number;
  /** Percent retention, 0–100, rounded to 1 decimal. */
  pct: number;
}

export interface PulsoCohortRow {
  /** ISO YYYY-MM-DD of the cohort week's Monday (UTC). */
  cohortWeek: string;
  cohortSize: number;
  cells: PulsoCohortCell[];
}

export interface PulsoCohortRetentionResponse {
  generatedAt: Date;
  /** Newest-first list of cohorts (Monday UTC dates). */
  rows: PulsoCohortRow[];
  /** Max week-offset in the data — useful for sizing the heatmap. */
  maxWeekOffset: number;
}

// ─── Pulso · Author publication reviews (Sprint S71.B) ──────────────────────
//
// Admin-only surface for approving / rejecting author book submissions.
// Doesn't carry author email leakage to non-ADMIN tokens — the backend
// gates with RolesGuard + @RequiredRole("ADMIN").

export type AuthorRequestStatus = "PENDING" | "ALL";
export type AuthorRequestReviewState = "PENDING" | "APPROVED" | "REJECTED";

export interface PulsoAuthorRequestBook {
  id: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  cover: string;
  coverArtUrl: string | null;
  status: "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "ARCHIVED";
  language: string;
  categoryId: string | null;
  chapters: number;
  author: {
    id: string;
    email: string;
    name: string;
  };
}

export interface PulsoAuthorRequestRow {
  id: string;
  bookId: string;
  reviewState: AuthorRequestReviewState;
  submittedAt: Date;
  reviewedAt: Date | null;
  feedback: string | null;
  book: PulsoAuthorRequestBook;
}

export interface PulsoAuthorRequestListResponse {
  total: number;
  items: PulsoAuthorRequestRow[];
}

export interface PulsoApproveAuthorRequestResponse {
  ok: true;
  bookId: string;
  slug: string;
  chapters: number;
}

export interface PulsoRejectAuthorRequestBody {
  feedback?: string;
}

// ─── Pulso · Admin users (Sprint S72) ───────────────────────────────────────

export interface PulsoAdminUserRow {
  id: string;
  email: string;
  name: string;
  firstName: string | null;
  role: UserRole;
  plan: UserPlan;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: Date;
}

export interface PulsoAdminUserListResponse {
  total: number;
  items: PulsoAdminUserRow[];
}

export interface PulsoChangeRoleRequest {
  role: UserRole;
  reason?: string;
}

export interface PulsoChangeRoleResponse {
  ok: true;
  role: UserRole;
  changed: boolean;
  oldRole?: UserRole;
}

export interface PulsoRoleChangeLogRow {
  id: string;
  targetUserId: string;
  oldRole: UserRole;
  newRole: UserRole;
  changedBy: string;
  reason: string | null;
  changedAt: Date;
}

// ─── Author module (Sprints S71 / S71.B / S71-front) ────────────────────────
//
// Wire types for /api/autor/* endpoints. The AuthorBook lives in the author
// workspace; it's promoted (copy-on-publish) to Book by admin approval.

export type AuthorBookStatus = "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "ARCHIVED";

export interface AuthorDashboardBook {
  id: string;
  title: string;
  subtitle: string | null;
  status: AuthorBookStatus;
  cover: string;
  chapters: number;
  lastEditedAt: Date;
  publishedAt: Date | null;
  archivedAt: Date | null;
}

export interface AuthorDashboardResponse {
  author: {
    id: string;
    name: string;
    title: string;
    verified: boolean;
    tier: "free" | "pro-autor";
  };
  books: AuthorDashboardBook[];
  templates: Array<{ id: string; label: string }>;
  aiHelpers: Array<{ id: string; label: string }>;
  publicationSteps: Array<{
    id: string;
    label: string;
    blocker: boolean;
  }>;
}

export interface CreateAuthorBookRequest {
  title: string;
  templateId?: string;
}

export interface CreateAuthorBookResponse {
  ok: true;
  bookId: string;
}

export interface AuthorBookChapterSummary {
  id: string;
  n: number;
  title: string;
  subtitle: string | null;
  isLocked: boolean;
  isHidden: boolean;
  version: number;
  updatedAt: Date;
}

export interface AuthorBookDetail {
  id: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  status: AuthorBookStatus;
  cover: string;
  coverArtUrl: string | null;
  categoryId: string | null;
  language: string;
  publishedAt: Date | null;
  archivedAt: Date | null;
  submittedAt: Date | null;
  structure: AuthorBookChapterSummary[];
}

export interface UpdateAuthorBookRequest {
  title?: string;
  subtitle?: string;
  summary?: string;
  cover?: string;
  coverArtUrl?: string;
  categoryId?: string;
  language?: string;
}

export interface AuthorChapterBlockDto {
  kind: string;
  content: string;
  meta?: Record<string, unknown>;
}

export interface AuthorBookChapter {
  id: string;
  n: number;
  title: string;
  subtitle: string | null;
  blocks: AuthorChapterBlockDto[];
  isLocked: boolean;
  isHidden: boolean;
  version: number;
  updatedAt: Date;
}

export interface UpdateAuthorChapterRequest {
  title?: string;
  subtitle?: string;
  blocks?: AuthorChapterBlockDto[];
  isLocked?: boolean;
  isHidden?: boolean;
  expectedVersion?: number;
}

export interface UpdateAuthorStructureItem {
  n: number;
  title?: string;
  subtitle?: string;
  isLocked?: boolean;
  isHidden?: boolean;
}

export interface UpdateAuthorStructureRequest {
  chapters: UpdateAuthorStructureItem[];
}

export interface AuthorPublicationStep {
  id: string;
  label: string;
  done: boolean;
  blocker: boolean;
}

export interface AuthorPublicationState {
  bookId: string;
  status: AuthorBookStatus;
  steps: AuthorPublicationStep[];
  reviewState: "PENDING" | "APPROVED" | "REJECTED" | null;
  submittedAt: Date | null;
  feedback: string | null;
}

// Revenue (Sprint S71.C-revenue)
export type AuthorPayoutMethod = "bank_ec" | "paypal" | "payphone" | "manual";
export type AuthorEarningStatus = "PENDING" | "PAID";

export interface AuthorRevenueSummary {
  ytdNetCents: number;
  lastMonthNetCents: number;
  pendingNetCents: number;
  fiscalYear: number;
}

export interface AuthorMonthlyRevenueRow {
  month: Date;
  grossCents: number;
  platformFeeCents: number;
  netCents: number;
  status: AuthorEarningStatus;
  paidAt: Date | null;
  paymentReference: string | null;
}

export interface AuthorPayoutSettings {
  method: AuthorPayoutMethod;
  details: Record<string, unknown>;
  taxId: string | null;
  legalName: string | null;
  legalAddress: string | null;
  updatedAt: Date | null;
}

export interface AuthorRevenueResponse {
  summary: AuthorRevenueSummary;
  monthly: AuthorMonthlyRevenueRow[];
  settings: AuthorPayoutSettings;
}

export interface UpdateAuthorPayoutRequest {
  method: AuthorPayoutMethod;
  details?: Record<string, unknown>;
  taxId?: string;
  legalName?: string;
  legalAddress?: string;
}

export interface UpdateAuthorPayoutResponse {
  ok: true;
  settings: AuthorPayoutSettings;
}

// Uploads (Sprint S71.C-uploads)
export interface AuthorCoverUploadResponse {
  ok: true;
  coverArtUrl: string;
}

export interface AuthorAudioBlock {
  kind: "audio";
  content: string;
  meta: {
    url: string;
    mimeType: string;
    sizeBytes: number;
  };
}

export interface AuthorAudioUploadResponse {
  ok: true;
  url: string;
  version: number;
  block: AuthorAudioBlock;
}

// AI helpers (Sprint S71.C-AI)
export type AuthorAiIntent = "revisar" | "ejemplo" | "tono" | "simplificar";

export interface AuthorAiHelpRequest {
  intent: AuthorAiIntent;
  text: string;
  blockId?: string;
  context?: string;
}

export interface AuthorAiHelpResponse {
  intent: AuthorAiIntent;
  suggestion: string;
  /** "model" when Anthropic generated the text; "fallback" when the local
   * rule-based path ran (no API key, 4xx, empty output). */
  source: "model" | "fallback";
  inputTokens?: number;
  outputTokens?: number;
}

// ─── Notifications (Sprint S43) ─────────────────────────────────────────────
//
// Device tokens registered by the mobile app via expo-notifications. The
// shape is intentionally minimal — push delivery details (badge, sound,
// channel) live server-side, not in the wire contract.

export type DevicePlatform = "EXPO" | "WEB";

export interface RegisterDeviceRequest {
  platform: DevicePlatform;
  token: string;
  deviceLabel?: string;
}

export interface RegisterDeviceResponse {
  id: string;
}

// ─── Terapia (Sprint S62) ──────────────────────────────────────────────────

export type TherapyModality = "INDIVIDUAL" | "COUPLE" | "FAMILY";

export interface CrisisLine {
  id: string;
  name: string;
  phone: string;
  whatsapp?: string;
  chatUrl?: string;
  availability: string;
  languages: string[];
}

export interface CrisisResponse {
  country: string;
  lines: CrisisLine[];
  safetyTipsShort: string[];
  nextSteps: string[];
}

export type CrisisTrigger =
  | "ECO_SAFETY_LAYER"
  | "HOME_BUTTON"
  | "PROFILE_LINK"
  | "THERAPIST_SUGGESTION";

export interface CrisisLogRequest {
  trigger: CrisisTrigger;
  contactedLineId?: string;
  country?: string;
}

export interface TherapistSummary {
  id: string;
  name: string;
  initials: string;
  title: string;
  avatarUrl: string | null;
  coverToken: string;
  modalities: TherapyModality[];
  specialties: string[];
  priceUsd: number;
  currency: string;
  avgRating: number;
  reviewsCount: number;
}

export interface TherapyHubResponse {
  intro: string;
  activeTherapist: TherapistSummary | null;
  nextSession: {
    id: string;
    therapist: TherapistSummary;
    scheduledAt: string;
    durationMin: number;
    modality: TherapyModality;
  } | null;
  recentPrescriptions: Array<{
    id: string;
    kind: "BOOK" | "AUDIO" | "EXERCISE" | "CARTA";
    targetId: string;
    dosage: string | null;
    note: string | null;
    dueBy: string | null;
    completedAt: string | null;
  }>;
}

// ─── Terapia · Directorio (Sprint S63) ─────────────────────────────────────

export interface TherapyFilters {
  motivo: Array<{ id: string; label: string; count: number }>;
  modalidad: Array<{ id: TherapyModality; label: string; count: number }>;
  genero: Array<{ id: string; label: string; count: number }>;
  precio: { min: number; max: number; currency: string };
  language: Array<{ id: string; label: string; count: number }>;
}

export interface TherapistListItem {
  id: string;
  name: string;
  initials: string;
  title: string;
  avatarUrl: string | null;
  coverToken: string;
  licenseNumber: string;
  licenseVerified: boolean;
  bioShort: string;
  specialties: string[];
  modalities: TherapyModality[];
  languages: string[];
  genderId: string | null;
  priceUsd: number;
  currency: string;
  avgRating: number;
  reviewsCount: number;
  nextSlotIso: string | null;
  acceptsInsurance: boolean;
  isFavorite: boolean;
}

export interface TherapistListResponse {
  items: TherapistListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TherapistDetail extends TherapistListItem {
  bioLong: string | null;
  approach: string | null;
  firstSessionPolicy: string | null;
  cancellationPolicy: string | null;
  videoPresentationUrl: string | null;
  availability: Array<{
    dayOfWeek: number;
    startMin: number;
    endMin: number;
    timezone: string;
  }>;
}

export interface TherapistReviewItem {
  id: string;
  userInitials: string;
  rating: number;
  text: string | null;
  tags: string[];
  createdAt: string;
}

export interface TherapistReviewsResponse {
  items: TherapistReviewItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TherapistFavoriteToggleResponse {
  isFavorite: boolean;
}

// ─── Terapia · Reserva + Pre-sesión (Sprint S64) ────────────────────────────

export interface AvailabilitySlot {
  iso: string; // start time UTC
  durationMin: number;
  priceUsd: number;
  currency: string;
  available: boolean;
}

export interface TherapistAvailabilityResponse {
  therapistId: string;
  days: number;
  timezone: string;
  slots: AvailabilitySlot[];
}

export type TherapyPaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

export interface CreateBookingRequest {
  therapistId: string;
  slotIso: string;
  modality: TherapyModality;
  firstReasonId?: string;
  durationMin?: number; // default 50
  // Optional URLs for the Stripe Checkout return flow (S65 wires real Stripe).
  successUrl?: string;
  cancelUrl?: string;
}

export interface CreateBookingResponse {
  sessionId: string;
  paymentStatus: TherapyPaymentStatus;
  checkoutUrl: string | null;
  scheduledAt: string;
}

export interface SessionPrepResponse {
  session: {
    id: string;
    therapist: TherapistSummary;
    scheduledAt: string;
    durationMin: number;
    modality: TherapyModality;
    joinUrl: string | null;
    paymentStatus: TherapyPaymentStatus;
    status: TherapySessionStatus;
  };
  prep: {
    intentionCiphertext: string | null;
    intentionNonce: string | null;
    checkInMood: string | null;
    sharedEntryIds: string[];
  };
}

export interface UpdateSessionPrepRequest {
  intentionCiphertext?: string;
  intentionNonce?: string;
  checkInMood?: string;
  sharedEntryIds?: string[];
}

// ─── Terapia · Sala video + Post-sesión + Technical report (Sprint S65) ────

export interface SessionJoinResponse {
  joinToken: string;
  roomUrl: string;
  expiresAt: string;
  isProviderConfigured: boolean;
}

export interface SessionFeedbackRequest {
  rating: number;
  tags?: string[];
  noteCiphertext?: string;
  noteNonce?: string;
}

export interface SessionFeedbackResponse {
  ok: true;
  status: "COMPLETED";
}

export type TherapyTechnicalIssue =
  | "AUDIO_FAILED"
  | "VIDEO_FAILED"
  | "CONNECTION_DROPPED"
  | "THERAPIST_NO_SHOW"
  | "OTHER";

export interface TechnicalReportRequest {
  issue: TherapyTechnicalIssue;
  description: string;
}

export interface TechnicalReportResponse {
  id: string;
}

// ─── Terapia · Lifecycle (Sprint S66.B) ────────────────────────────────────

export type TherapySessionStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW"
  | "MISSED";

export interface TherapySessionListItem {
  id: string;
  therapist: TherapistSummary;
  scheduledAt: string;
  durationMin: number;
  modality: TherapyModality;
  status: TherapySessionStatus;
  paymentStatus: TherapyPaymentStatus;
  feedbackRating: number | null;
}

export interface TherapySessionsListResponse {
  upcoming: TherapySessionListItem[];
  past: TherapySessionListItem[];
}

export type TherapyPrescriptionKind = "BOOK" | "AUDIO" | "EXERCISE" | "CARTA";

export interface TherapyPrescriptionItem {
  id: string;
  kind: TherapyPrescriptionKind;
  targetId: string;
  dosage: string | null;
  note: string | null;
  dueBy: string | null;
  completedAt: string | null;
  createdAt: string;
  sessionId: string | null;
}

export interface PrescriptionUpdateRequest {
  completed?: boolean;
}

export type TherapyNotificationKind =
  | "SESSION_REMINDER_24H"
  | "SESSION_REMINDER_1H"
  | "SESSION_STARTED"
  | "SESSION_RESCHEDULED"
  | "SESSION_CANCELLED"
  | "PRESCRIPTION_NEW"
  | "PRESCRIPTION_DUE_SOON"
  | "CRISIS_FOLLOWUP";

export interface TherapyNotificationItem {
  id: string;
  kind: TherapyNotificationKind;
  title: string;
  body: string;
  actionUrl: string | null;
  createdAt: string;
  readAt: string | null;
  sessionId: string | null;
}

export interface TherapyNotificationsListResponse {
  items: TherapyNotificationItem[];
  unreadCount: number;
}

export interface RescheduleSessionRequest {
  newSlotIso: string;
}

export interface CancelSessionRequest {
  reason: string;
  refundRequested?: boolean;
}

export interface RetryCheckoutRequest {
  successUrl: string;
  cancelUrl: string;
}

export interface RetryCheckoutResponse {
  sessionId: string;
  checkoutUrl: string;
  paymentStatus: TherapyPaymentStatus;
}

// ─── Exploraciones · Journeys (Sprint B5) ─────────────────────────────────────
//
// Curated bundles of books around a transformation arc. Listed at
// /dashboard/exploraciones. v1 returns a flat list; v2 will add per-user
// progress + recommended ordering.

export type JourneyCoverToken = "cool" | "warm" | "mixed";

export interface JourneyBookSummary {
  /** Slug of the book — same key used by /books/:idOrSlug. */
  slug: string;
  title: string;
  /** Human-friendly author name. `null` if the catalog row has no author. */
  authorName: string | null;
  cover: CoverToken;
  /** Estimated reading time of this specific book, in minutes. */
  durationMinutes: number;
}

export interface JourneyListItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string | null;
  coverToken: JourneyCoverToken;
  /** Sum of `Book.durationMinutes` of the bundled books, cached. */
  durationMinutes: number;
  /** Books in arc order. */
  books: JourneyBookSummary[];
  publishedAt: Date;
}

export interface JourneyListResponse {
  journeys: JourneyListItem[];
}

// ─── Mapa Emocional · Etapa 6 — on-device text features ──────────────────
export * from "./text-features";

// ─── Eco contextual · Sprint B — per-chapter suggested topics ────────────
export * from "./eco-chapter-prompts";

// ─── Backlog — interactive chapter exercises (reflect + breathe) ─────────
export * from "./chapter-exercises";

// ─── Fase E (V2) — ARC cycle: chapter concepts + resonance wire types ─────
export * from "./chapter-concepts";
