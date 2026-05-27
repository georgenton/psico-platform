import type { UserMeResponse } from "@psico/types";

import { getSessionUser, serverFetch } from "@/lib/api.server";
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
  } catch {
    // If /user/me fails the dashboard pages will redirect on their own.
  }

  return (
    <DashboardShell user={user} cryptoSalt={cryptoSalt}>
      {children}
    </DashboardShell>
  );
}
