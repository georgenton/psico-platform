import type { UserMeResponse } from "@psico/types";

import { getSessionUser, isNextThrow, serverFetch } from "@/lib/api.server";
import { DashboardShell } from "./_DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = getSessionUser();

  // We fetch cryptoSalt once at the layout level so the DiaryKeyProvider can
  // be hoisted above the entire /dashboard subtree. That way the diary
  // unlock survives navigation (e.g. Diario → Seguridad → back), which the
  // password-change-with-rekey flow specifically needs.
  let cryptoSalt: string | null = null;
  try {
    const me = await serverFetch<UserMeResponse>("/user/me");
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

  return (
    <DashboardShell user={user} cryptoSalt={cryptoSalt}>
      {children}
    </DashboardShell>
  );
}
