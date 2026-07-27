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
 * in a closure here, and tell the apiClient to use it on every request. This
 * is the INITIAL, general configuration for `/dashboard/*`.
 *
 * Freshness caveat: this reflects the rotated token only when the LAYOUT
 * re-renders — a full load, a browser reload, or a hard navigation. App Router
 * PRESERVES this layout across soft client navigations, so after the middleware
 * rotates A → B on a soft nav into another segment, this closure can still hold
 * A. Do NOT assume Eco/Tour/etc. get the rotated token on a soft navigation
 * unless that surface adds its own per-navigation resync. The Guide surface
 * does exactly that: its Exploraciones `template` (which App Router remounts on
 * every navigation) re-reads the fresh access cookie and re-syncs the singleton
 * before GuidePlayer mounts (see `GuideApiClientBoundary`).
 *
 * Note: this does NOT enable the singleton's auto-refresh — that flow requires
 * reading/writing the refresh cookie, which is HttpOnly. Renewal is the
 * middleware's job (the one writable boundary).
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
