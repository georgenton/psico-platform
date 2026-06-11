import type {
  DataExportRequestResponse,
  DeleteAccountRequest,
  DeleteAccountResponse,
  EmailChangeRequestPayload,
  EmailChangeRequestResponse,
  UpdateNotificationsRequest,
  UpdatePreferencesRequest,
  UpdatePrivacyRequest,
  UpdateProfileRequest,
  UpdateTimezoneRequest,
  UserMeResponse,
  UserNotificationSettings,
  UserPreferences,
  UserPrivacySettings,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * usersApi — Sprint S45.
 *
 * Surface for `/user/*` endpoints. Web Server Components reach
 * `/user/me` via `serverFetch` (so the response is cached per request
 * automatically); mobile uses these helpers from screens with token-aware
 * fetch via `apiClient`.
 *
 * Only methods that mobile actually invokes are added here; the rest of
 * the UsersController surface (changePassword, requestDataExport, etc.)
 * lives elsewhere or in `authApi`.
 */
export const usersApi = {
  getMe: () => apiClient.get<UserMeResponse>("/user/me"),

  updateNotifications: (body: UpdateNotificationsRequest) =>
    apiClient.patch<UserNotificationSettings>("/user/notifications", body),

  /**
   * Sprint S53 — Auto-detected by web/mobile right after login from
   * `Intl.DateTimeFormat().resolvedOptions().timeZone` when
   * `UserMeResponse.profile.timezone === null`. Idempotent; safe to
   * call on every login. Returns the refreshed `/user/me` shape.
   */
  updateTimezone: (body: UpdateTimezoneRequest) =>
    apiClient.patch<UserMeResponse>("/user/timezone", body),

  /** Sprint S57 — Update name/city/country (mobile profile). */
  updateProfile: (body: UpdateProfileRequest) =>
    apiClient.patch<UserMeResponse>("/user/profile", body),

  /** Sprint S57 — Trigger email-change verification flow. */
  requestEmailChange: (body: EmailChangeRequestPayload) =>
    apiClient.post<EmailChangeRequestResponse>(
      "/user/email-change-request",
      body,
    ),

  /** Sprint S57 — Trigger ZIP export (sent by email when ready). */
  requestDataExport: () =>
    apiClient.post<DataExportRequestResponse>("/user/data-export", {}),

  /** Sprint S57 — Schedule account deletion (30-day cooldown). */
  requestAccountDeletion: (body: DeleteAccountRequest) =>
    apiClient.post<DeleteAccountResponse>("/user/delete-request", body),

  /** Sprint Perfil — Update voice/theme/bestTime/weeklyGoal/moodPrompts/language. */
  updatePreferences: (body: UpdatePreferencesRequest) =>
    apiClient.patch<UserPreferences>("/user/preferences", body),

  /** Sprint Perfil — Toggle privacy switches (immediate effect). */
  updatePrivacy: (body: UpdatePrivacyRequest) =>
    apiClient.patch<UserPrivacySettings>("/user/privacy", body),
};
