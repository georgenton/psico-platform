import { redirect } from "next/navigation";
import type { UserMeResponse } from "@psico/types";

import {
  getAccessToken,
  getSessionUser,
  isNextThrow,
  serverFetch,
} from "@/lib/api.server";
import { ApiClientBootstrap } from "./_ApiClientBootstrap";
import { DashboardShell } from "./_DashboardShell";
import { TimezoneSync } from "./_TimezoneSync";

const API_ROOT = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = getSessionUser();

  // We fetch cryptoSalt + onboardingState once at the layout level so the
  // DiaryKeyProvider can be hoisted above the entire /dashboard subtree.
  // That way the diary unlock survives navigation (e.g. Diario → Seguridad
  // → back), which the password-change-with-rekey flow specifically needs.
  let cryptoSalt: string | null = null;
  let me: UserMeResponse | null = null;
  try {
    me = await serverFetch<UserMeResponse>("/user/me");
    cryptoSalt = me.cryptoSalt;
  } catch (err) {
    // CRITICAL: `serverFetch` throws `redirect('/login')` on auth failure;
    // that throw must propagate so Next.js can perform the actual redirect.
    // Swallowing it (the previous `catch {}` did) leaves the user on
    // /dashboard with stale tokens and the client falls into an infinite
    // refresh loop. Surface anything that ISN'T a missing-cryptoSalt error
    // — non-auth errors get re-thrown too so the error boundary catches.
    if (isNextThrow(err)) throw err;
    // Other non-redirect errors: leave cryptoSalt as null. The Diario
    // UnlockGate will render the empty state instead of crashing.
  }

  // Sprint S4-front: redirect new users to /onboarding before they can
  // reach any dashboard page. We treat "no OnboardingState row" and "row
  // exists but neither completedAt nor skippedAt is set" as the same case
  // — the user has not yet decided about onboarding.
  //
  // Sprint S37: compute showTour at the layout level so the check happens
  // server-side per navigation, not per render. Tour fires only for users
  // who finished onboarding (`completedAt`) but never saw the tour yet
  // (`tourCompletedAt === null`). Users who explicitly skipped the whole
  // onboarding (`skippedAt`) DON'T get the tour either — they opted out.
  let showTour = false;
  if (me) {
    const onboarding = me.onboardingState;
    const onboardingDone = Boolean(
      onboarding?.completedAt || onboarding?.skippedAt,
    );
    if (!onboardingDone) {
      redirect("/onboarding");
    }
    showTour = Boolean(onboarding?.completedAt && !onboarding?.tourCompletedAt);
  }

  // Sprint S53 — auto-detect the user's timezone on first dashboard load
  // if the backend has none yet. The probe is invisible; if it fails
  // the user just keeps receiving notifications in UTC.
  const needsTimezoneProbe = Boolean(me && me.user.timezone === null);

  const accessToken = getAccessToken();

  return (
    <DashboardShell user={user} cryptoSalt={cryptoSalt} showTour={showTour}>
      <ApiClientBootstrap apiBase={API_ROOT} accessToken={accessToken} />
      <TimezoneSync needsProbe={needsTimezoneProbe} />
      {children}
    </DashboardShell>
  );
}
