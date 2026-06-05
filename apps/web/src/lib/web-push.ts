/**
 * Web Push helpers — Sprint S47.
 *
 * Browser-side flow:
 *   1. Register `/sw.js` as a Service Worker.
 *   2. Request `Notification` permission.
 *   3. Subscribe via `pushManager.subscribe({ applicationServerKey })`.
 *   4. POST the serialized subscription to `/api/notifications/devices`.
 *
 * The token format we send to the API is `web:<JSON>` so the backend's
 * existing `DeviceToken.token` column can hold it without a schema change.
 * PushService parses it back at send time (see `parseWebToken`).
 *
 * Auth model: `apiBase` and `accessToken` flow in from the page (Server
 * Component reads them and props them down) — same pattern as EcoShell.
 * We don't use `@psico/api-client` on web because that singleton is wired
 * for the mobile bundle.
 *
 * NOTE: Every function here assumes a browser context — DO NOT import
 * from Server Components.
 */

export type WebPushSupport =
  | { supported: true; permission: NotificationPermission }
  | {
      supported: false;
      reason:
        | "no-service-worker"
        | "no-push-manager"
        | "no-notifications-api"
        | "insecure-context";
    };

export function detectWebPushSupport(): WebPushSupport {
  if (typeof window === "undefined") {
    return { supported: false, reason: "insecure-context" };
  }
  // Service workers require HTTPS (or localhost). Browsers expose
  // `window.isSecureContext` for the check.
  if (!window.isSecureContext) {
    return { supported: false, reason: "insecure-context" };
  }
  if (!("serviceWorker" in navigator)) {
    return { supported: false, reason: "no-service-worker" };
  }
  if (!("PushManager" in window)) {
    return { supported: false, reason: "no-push-manager" };
  }
  if (!("Notification" in window)) {
    return { supported: false, reason: "no-notifications-api" };
  }
  return { supported: true, permission: Notification.permission };
}

/**
 * Convert a base64-url VAPID public key to the Uint8Array that
 * `pushManager.subscribe` expects. The W3C spec is finicky about this —
 * we have to pad + swap the URL-safe alphabet to standard base64 first.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Allocate an ArrayBuffer-backed view explicitly so the result is
  // compatible with DOM `BufferSource` (the Push API's
  // `applicationServerKey` parameter) under TS lib.dom.
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Idempotent: registers the SW if needed, requests permission if needed,
 * subscribes, and POSTs to the API. Returns the registered DeviceToken id.
 *
 * Throws with a stable code in `.message`:
 *  - "permission-denied" — user said no
 *  - "no-vapid-key"      — VAPID env not configured (operator bug)
 *  - "subscribe-failed"  — browser/network error during subscribe
 *  - "register-failed"   — POST to /api/notifications/devices failed
 */
export async function subscribeWebPush(
  apiBase: string,
  accessToken: string,
): Promise<{ id: string }> {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    throw new Error("no-vapid-key");
  }

  // Permission first — browsers gate `pushManager.subscribe` on it.
  if (Notification.permission === "default") {
    const result = await Notification.requestPermission();
    if (result !== "granted") {
      throw new Error("permission-denied");
    }
  } else if (Notification.permission !== "granted") {
    throw new Error("permission-denied");
  }

  // SW registration (idempotent — same scope, same file → reuse).
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  // Subscribe. If we already have a subscription, browsers return the
  // existing one — perfect for our idempotent register path.
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast to BufferSource — the TS lib.dom type union expects an
        // `ArrayBuffer`-backed view but our helper returns a generic
        // Uint8Array whose buffer type is `ArrayBufferLike`. The cast is
        // safe because we always allocate a fresh ArrayBuffer in the helper.
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
          .buffer as ArrayBuffer,
      });
    } catch {
      throw new Error("subscribe-failed");
    }
  }

  const token = `web:${JSON.stringify(subscription.toJSON())}`;
  try {
    const res = await fetch(`${apiBase}/notifications/devices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        platform: "WEB",
        token,
        deviceLabel: getDeviceLabel(),
      }),
    });
    if (!res.ok) throw new Error(`register-failed`);
    return (await res.json()) as { id: string };
  } catch {
    throw new Error("register-failed");
  }
}

/**
 * Unsubscribe + delete server-side token. Best-effort: failures are logged
 * but don't throw, because the local SW unsubscribe should always succeed
 * even if the backend delete trips.
 */
export async function unsubscribeWebPush(
  apiBase: string,
  accessToken: string,
  deviceTokenId: string,
): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    }
  } catch {
    // ignore — we still want to delete the DB row.
  }
  if (!deviceTokenId) return;
  try {
    await fetch(`${apiBase}/notifications/devices/${deviceTokenId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // ignore
  }
}

function getDeviceLabel(): string {
  // Short, human-readable label so users can identify devices in /security.
  // Browsers don't expose a clean name, so we fall back to UA shorthand.
  const ua = navigator.userAgent;
  if (/Chrome/.test(ua) && !/Edg/.test(ua)) return "Chrome";
  if (/Edg/.test(ua)) return "Edge";
  if (/Firefox/.test(ua)) return "Firefox";
  if (/Safari/.test(ua)) return "Safari";
  return "Web";
}
