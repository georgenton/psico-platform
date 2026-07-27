import type { ReactNode } from "react";

import { getAccessToken } from "@/lib/api.server";
import { GuideApiClientBoundary } from "@/components/dashboard/guide/GuideApiClientBoundary";

const API_ROOT = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * PR #596 — the per-navigation token sync for the Guide surface.
 *
 * App Router preserves the shared `DashboardLayout` across soft client
 * navigations, so `ApiClientBootstrap`'s closure can keep serving a stale
 * access token after the middleware rotated it. A `template` (unlike a layout)
 * REMOUNTS on every navigation, so this runs fresh each time: it reads the
 * access cookie the middleware just rotated and hands it to
 * `GuideApiClientBoundary`, which reconfigures the singleton before
 * `GuidePlayer` mounts.
 *
 * It resolves NO identity: no `/user/me`, no actorScope (that stays in the
 * layout, `GuideActorScopeProvider`), no refresh token. Only the current access
 * token, and only to the client boundary.
 */
export default function ExploracionesTemplate({
  children,
}: {
  children: ReactNode;
}) {
  const accessToken = getAccessToken();

  return (
    <GuideApiClientBoundary apiBase={API_ROOT} accessToken={accessToken}>
      {children}
    </GuideApiClientBoundary>
  );
}
