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
