import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { UserMeResponse } from "@psico/types";

import { isNextThrow, serverFetch } from "@/lib/api.server";

/**
 * Onboarding layout — Sprint S4-front.
 *
 * Distinct from /dashboard layout: full-screen, no sidebar, no header. The
 * dashboard layout redirects new users (no completed/skipped onboarding)
 * to /onboarding; this layout does the reverse — if the user ALREADY
 * finished onboarding and tries to navigate here (typing the URL, clicking
 * a stale link), we bounce them to the dashboard. There is no
 * "re-onboard" path by design — that would invalidate analytics and is a
 * recipe for inconsistent UserPreferences state.
 *
 * Edge runtime middleware (apps/web/src/middleware.ts) handles the
 * pre-auth check (no session → /login). We do the post-auth check here
 * because the middleware can't easily call /api/user/me from the edge.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  try {
    const me = await serverFetch<UserMeResponse>("/user/me");
    const onboarding = me.onboardingState;
    if (onboarding?.completedAt || onboarding?.skippedAt) {
      redirect("/dashboard");
    }
  } catch (err) {
    // serverFetch throws redirect('/login') if there's no session — let it
    // propagate. Other errors (Stripe outage, DB blip): render the
    // onboarding anyway, the user can retry the actions inside.
    if (isNextThrow(err)) throw err;
  }

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background:
          "radial-gradient(ellipse at top, var(--color-lavender-50), var(--color-warm-50) 60%)",
      }}
    >
      {children}
    </div>
  );
}
