import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { notificationsApi } from "@psico/api-client";

/**
 * Push registration helpers — Sprint S43 (mobile).
 *
 * Flow on login:
 *   1. ensurePermission() — asks the OS once. Returns null if denied.
 *   2. getExpoPushToken()  — uses Expo's Notification API. Returns null on
 *                            iOS simulator (no APNs token possible).
 *   3. registerWithBackend(token) — POSTs to /api/notifications/devices.
 *
 * Flow on logout:
 *   unregisterFromBackend(savedId).
 *
 * We swallow all errors in registration — push is non-critical; the user
 * stays logged in even if registration fails. We log to console for
 * debugging (no PII).
 */

// Configure how foreground notifications render (banner + sound, no badge).
// This runs once at module load.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensurePermission(): Promise<boolean> {
  if (!Device.isDevice) {
    // Simulators don't support push.
    return false;
  }
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === "granted") return true;
  if (existing.status === "denied") return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.status === "granted";
}

async function getExpoPushToken(): Promise<string | null> {
  try {
    // projectId comes from app.json's `extra.eas.projectId`. Expo SDK 52
    // figures it out automatically when called from a managed app.
    const res = await Notifications.getExpoPushTokenAsync();
    return res.data ?? null;
  } catch (err) {
    console.warn("[push] failed to get expo push token:", err);
    return null;
  }
}

/**
 * Idempotent: caller invokes after auth is established. If anything fails,
 * returns null and caller is expected to NOT block the UX.
 */
export async function tryRegisterPushToken(): Promise<{
  id: string;
  token: string;
} | null> {
  const ok = await ensurePermission();
  if (!ok) return null;

  if (Platform.OS === "android") {
    // Android needs an explicit channel for high-priority notifications.
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
    });
  }

  const token = await getExpoPushToken();
  if (!token) return null;

  try {
    const res = await notificationsApi.registerDevice({
      platform: "EXPO",
      token,
      deviceLabel: `${Device.brand ?? "?"} ${Device.modelName ?? "?"}`.slice(
        0,
        64,
      ),
    });
    return { id: res.id, token };
  } catch (err) {
    console.warn("[push] register failed:", err);
    return null;
  }
}

/** Best-effort unregister on logout. */
export async function tryUnregisterPushToken(id: string): Promise<void> {
  try {
    await notificationsApi.unregisterDevice(id);
  } catch (err) {
    console.warn("[push] unregister failed:", err);
  }
}
