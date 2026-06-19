"use client";

import { useEffect } from "react";
import { apiClient } from "@psico/api-client";

/**
 * Configures the shared `@psico/api-client` singleton on the browser side of
 * `/dashboard/*` pages.
 *
 * Why this exists
 * ---------------
 * Several client components (TourOverlay, Eco's ChatArea, Eco's
 * ReportMessageModal, Terapia BookingFlow) import the typed API wrappers
 * from `@psico/api-client` and call them directly. Those wrappers route
 * through `apiClient.get/post(...)`, which builds requests against the
 * configured `baseUrl`. Without configuration the singleton's baseUrl is
 * the empty string — so calls to `/api/onboarding/tour` become a fetch to
 * the same origin (Vercel) and return a 404 from the Next.js router.
 *
 * The mobile app calls `apiClient.configure(...)` from its AuthContext on
 * mount; this component is the web equivalent. It wires the singleton so
 * those typed wrappers actually reach the API on Railway.
 *
 * Token handling
 * --------------
 * Cookies are HttpOnly (the JWT lives in a cookie that JS cannot read).
 * We pass the access token down from the server layout as a prop, store it
 * in a closure here, and tell the apiClient to use it on every request.
 * If the token expires mid-session, the next `serverFetch` will refresh
 * and stamp a new cookie; the browser sees that on the next navigation/
 * reload. For client-only screens (Eco's chat, Tour catalog) this is fine
 * because their access windows are short.
 *
 * Note: this does NOT enable the singleton's auto-refresh — that flow
 * requires reading/writing the refresh cookie, which is HttpOnly. Hooking
 * into that responsibly would need a dedicated `/api/auth/session` round
 * trip; for v1 we tolerate the once-per-15min reload as the recovery path.
 */
export function ApiClientBootstrap({
  apiBase,
  accessToken,
}: {
  /** The API root WITHOUT the trailing /api (e.g. "https://api.example.com"). */
  apiBase: string;
  /** The current access token, or null when there is none yet. */
  accessToken: string | null;
}) {
  useEffect(() => {
    apiClient.configure(apiBase, {
      getAccessToken: () => accessToken,
      // No refresh path on the browser — the HttpOnly refresh cookie is not
      // reachable from JS. Surface the absence as `null` rather than guess.
      getRefreshToken: () => null,
      // We never receive a fresh pair client-side; this stays a no-op.
      onTokensRefreshed: () => {},
      // When the API returns 401, the page-level guard will kick in on the
      // next navigation. We don't redirect from here because that would race
      // with in-flight server actions.
      onUnauthenticated: () => {},
    });
  }, [apiBase, accessToken]);

  return null;
}
