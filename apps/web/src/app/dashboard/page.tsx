import type { Metadata } from "next";
import type { HomeResponse } from "@psico/types";

import { ApiError } from "@/lib/api";
import { getSessionUser, serverFetch } from "@/lib/api.server";
import { EmptyHomeState } from "@/components/dashboard/home/EmptyHomeState";
import { InicioV2 } from "@/components/dashboard/home/InicioV2";

export const metadata: Metadata = { title: "Inicio" };

// Reload the dashboard on every request — it depends on the authenticated
// user's state and stats. The data is cheap to compute (HomeService.getHome
// runs 6 queries in Promise.all) so we trade some latency for freshness.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = getSessionUser();

  let home: HomeResponse | null = null;
  let fetchError = false;
  try {
    home = await serverFetch<HomeResponse>("/home");
  } catch (err) {
    // 404 (user not found) shouldn't happen for an authenticated session, but
    // we don't want to crash the dashboard if the backend hiccups. Render the
    // empty state instead.
    if (!(err instanceof ApiError)) {
      fetchError = true;
    } else if (err.status !== 404 && err.status !== 500) {
      throw err;
    }
    fetchError = true;
  }

  const firstName =
    home?.user.firstName ?? user?.email?.split("@")[0] ?? "amigo";

  if (!home || fetchError) {
    return <EmptyHomeState firstName={firstName} />;
  }

  return <InicioV2 home={home} />;
}
