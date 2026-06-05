import type {
  RegisterDeviceRequest,
  RegisterDeviceResponse,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * notificationsApi — Sprint S43.
 *
 * Device token registration for push notifications. Today only Expo (mobile);
 * web push is reserved for post-v1.
 */
export const notificationsApi = {
  registerDevice: (body: RegisterDeviceRequest) =>
    apiClient.post<RegisterDeviceResponse>("/notifications/devices", body),

  unregisterDevice: (id: string) =>
    apiClient.delete<void>(`/notifications/devices/${id}`),
};
