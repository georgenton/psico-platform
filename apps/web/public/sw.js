/* eslint-disable no-undef */
/**
 * Psico Platform — Web Push Service Worker (Sprint S47).
 *
 * Minimal SW that handles two events:
 *  - `push`: render the notification with title/body/url from the payload.
 *  - `notificationclick`: focus an existing tab on the deep-link URL or open
 *    a new one.
 *
 * We deliberately DON'T cache resources here — this is a notifications-only
 * SW. If we ever want offline support, that's a separate Workbox-flavored
 * SW that registers at a different scope to avoid conflicting with this one.
 *
 * Versioning: bump the comment below when you change the file so browsers
 * pick up the update. The Service Worker spec compares byte-by-byte, so
 * any change to this file forces re-registration.
 *
 * Version: 1
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Psico", body: event.data.text() };
  }

  const title = payload.title || "Psico";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: payload.url || "/", ...(payload.data || {}) },
    tag: payload.tag,
    // We want the user to see the notification even if a tab is focused —
    // they may not have the app in view.
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If a tab is already open on this origin, focus and navigate it.
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(url).catch(() => undefined);
            return client.focus();
          }
        }
        // Otherwise open a new tab.
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
        return undefined;
      }),
  );
});
