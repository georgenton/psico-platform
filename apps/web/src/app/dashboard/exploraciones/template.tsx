import type { ReactNode } from "react";
import type { GuideAvailabilityResponse } from "@psico/types";

import { getAccessToken } from "@/lib/api.server";
import { GuideApiClientBoundary } from "@/components/dashboard/guide/GuideApiClientBoundary";
import { GuideAvailabilityProvider } from "@/components/dashboard/guide/guide-availability";

const API_ROOT = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * CC-7.R1 — resolve the server-owned pilot decision for the current actor.
 *
 * A `no-store` fetch against `GET /api/guide/availability` with the actor's own
 * bearer token. The decision is the SERVER'S: the client sends nothing about
 * the mode or the allowlist and receives only `{ available }`. Any failure —
 * no token, a 401, a network blip, the API down — fails CLOSED to `false`, so a
 * degraded fetch behaves exactly like being outside the pilot. It is NOT a
 * `serverFetch` because a 401 here must not log the user out; it just means the
 * guide is unavailable this render.
 */
async function resolveGuideAvailability(
  accessToken: string | null | undefined,
): Promise<boolean> {
  if (!accessToken) return false;
  try {
    const res = await fetch(`${API_ROOT}/api/guide/availability`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const body = (await res.json()) as GuideAvailabilityResponse;
    return body?.available === true;
  } catch {
    return false;
  }
}

/**
 * PR #596 — the per-navigation token sync for the Guide surface.
 *
 * App Router preserves the shared `DashboardLayout` across soft client
 * navigations, so `ApiClientBootstrap`'s closure can keep serving a stale
 * access token after the middleware rotated it. A `template` (unlike a layout)
 * REMOUNTS on every navigation, so this runs fresh each time: it reads the
 * access cookie the middleware just rotated and hands it to
 * `GuideApiClientBoundary`, which reconfigures the singleton before
 * `GuidePlayer` mounts. CC-7.R1 additionally resolves the pilot availability
 * from the API and publishes it through `GuideAvailabilityProvider`.
 *
 * It resolves NO identity: no `/user/me`, no actorScope (that stays in the
 * layout, `GuideActorScopeProvider`), no refresh token. Only the current access
 * token, the availability boolean, and only to the client boundary/context.
 */
export default async function ExploracionesTemplate({
  children,
}: {
  children: ReactNode;
}) {
  const accessToken = getAccessToken();
  const available = await resolveGuideAvailability(accessToken);

  return (
    <GuideApiClientBoundary apiBase={API_ROOT} accessToken={accessToken}>
      <GuideAvailabilityProvider available={available}>
        {children}
      </GuideAvailabilityProvider>
    </GuideApiClientBoundary>
  );
}
