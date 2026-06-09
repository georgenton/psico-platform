// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = "USER" | "PSYCHOLOGIST" | "ADMIN";

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
    "shareDiaryWithTherapist" | "anonymizedAnalytics" | "marketingEmail"
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

export interface OnboardingTourStep {
  target: string;
  title: string;
  body: string;
  order: number;
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
export type BookListView = "catalogo" | "mis" | "recos";

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
export type ShortcutId = "diario" | "eco" | "biblioteca" | "terapia";

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

export interface HomeEcoMoment {
  prompt: string;
  lastActiveAt: Date | null;
  pendingMessages: number;
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

// ─── Diary · E2E-encrypted entries (Sprint S6) ───────────────────────────────
//
// Wire format only. The cleartext lives on-device. See ADR 0007 for the
// crypto model. Backend treats `textCiphertext` / `textNonce` as opaque
// blobs — these types do NOT include any plaintext shape.

export type DiaryEntryKind = "free" | "prompted" | "voz";

export interface DiaryEntrySummary {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  mood: string;
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
  mood: string;
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
  mood?: string;
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
  | "PAUSE";

export type HighlightColor = "YELLOW" | "BLUE" | "PINK";

export interface ChapterBlockSummary {
  id: string;
  order: number;
  kind: ChapterBlockKind;
  /** Markdown text for PARAGRAPH/HEADING/QUOTE; caption for IMAGE/AUDIO/EXERCISE. */
  content: string;
  /** Structured metadata; shape depends on `kind`. See lector/README.md. */
  meta: Record<string, unknown> | null;
}

export interface HighlightSummary {
  id: string;
  blockId: string;
  startOffset: number;
  endOffset: number;
  color: HighlightColor;
  note: string | null;
  createdAt: Date;
}

export interface AnnotationSummary {
  id: string;
  blockId: string;
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

export interface LectorAudioResponse {
  /** Signed R2 URL, expires in 1h. */
  url: string;
  durationSec: number;
  transcript: LectorAudioTranscriptSegment[];
}

// ─── Lector · complete ───────────────────────────────────────────────────────

export interface LectorCompleteResponse {
  ok: true;
  /** Order of the next chapter in the book, or null if this was the last. */
  nextChapter: number | null;
}

// ─── Highlights ──────────────────────────────────────────────────────────────

export interface CreateHighlightRequest {
  blockId: string;
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
  blockId: string;
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

export type TherapyPaymentStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "REFUNDED";

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
