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
