import type {
  UpdateNotificationsRequest,
  UpdateTimezoneRequest,
  UserMeResponse,
  UserNotificationSettings,
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
};
