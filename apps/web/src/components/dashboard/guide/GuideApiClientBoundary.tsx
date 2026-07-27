"use client";

import { useState, type ReactNode } from "react";
import { apiClient } from "@psico/api-client";

/**
 * PR #596 — re-sync the API client singleton with the token of THIS navigation.
 *
 * The `@psico/api-client` singleton reads its access token from a closure the
 * dashboard layout installs once. App Router preserves that layout across soft
 * client navigations, so after the middleware rotates A → B on a navigation
 * into the Guide segment, the singleton can still send Bearer A — and the first
 * `createGuideSession` would 401.
 *
 * The Exploraciones `template` (which App Router REMOUNTS on every navigation)
 * reads the fresh access cookie server-side and hands it here. We reconfigure
 * the singleton DURING the first render — a lazy `useState` initializer runs
 * exactly once, before any child mounts — so `GuidePlayer`'s recovery command
 * never fires against a stale token. No cookies are read here, no token is
 * stored beyond the singleton's own closure, and none is logged.
 */
export function GuideApiClientBoundary({
  apiBase,
  accessToken,
  children,
}: {
  /** The API root WITHOUT the trailing /api. */
  apiBase: string;
  /** This navigation's access token, or null when there is none. */
  accessToken: string | null;
  children: ReactNode;
}) {
  // The initializer runs while THIS component renders — ahead of its children —
  // so the singleton carries the current token before GuidePlayer mounts.
  useState(() => {
    apiClient.configure(apiBase, {
      getAccessToken: () => accessToken,
      // The refresh cookie is HttpOnly; renewal is the middleware's job.
      getRefreshToken: () => null,
      onTokensRefreshed: () => {},
      onUnauthenticated: () => {},
    });
    return true;
  });

  return <>{children}</>;
}
