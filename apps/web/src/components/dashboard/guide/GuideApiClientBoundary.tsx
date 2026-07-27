"use client";

import { useEffect, useState, type ReactNode } from "react";
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
 * reads the fresh access cookie server-side and hands it here. This component
 * renders a closed loading state FIRST; only after hydration does an effect
 * configure the singleton, and only then do the children mount. Configuring the
 * singleton is a side effect, so it must live in an effect — never in render
 * (where SSR/prerender would run it, and concurrent React could repeat or
 * abandon it). No cookies are read here, no token is stored beyond the
 * singleton's own closure, and none is logged.
 */

/** The (apiBase, accessToken) the singleton was last configured for. */
interface ConfiguredClient {
  apiBase: string;
  accessToken: string | null;
}

/** Minimal, accessible, token-free placeholder shown until configuration lands. */
function GuideClientLoadingState() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: "48px 24px",
        textAlign: "center",
        color: "var(--color-warm-600)",
        fontSize: 14,
      }}
    >
      Preparando tu guía…
    </div>
  );
}

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
  const [configured, setConfigured] = useState<ConfiguredClient | null>(null);

  useEffect(() => {
    apiClient.configure(apiBase, {
      getAccessToken: () => accessToken,
      // The refresh cookie is HttpOnly; renewal is the middleware's job.
      getRefreshToken: () => null,
      onTokensRefreshed: () => {},
      onUnauthenticated: () => {},
    });
    setConfigured({ apiBase, accessToken });
  }, [apiBase, accessToken]);

  // Children mount ONLY once the singleton is configured for the CURRENT props.
  // During an A → B window (props changed on the same instance) `configured`
  // still holds A, so the gate stays closed until the effect reconfigures to B
  // — no Guide command ever fires against a stale token.
  const ready =
    configured !== null &&
    configured.apiBase === apiBase &&
    configured.accessToken === accessToken;

  if (!ready) return <GuideClientLoadingState />;
  return <>{children}</>;
}
