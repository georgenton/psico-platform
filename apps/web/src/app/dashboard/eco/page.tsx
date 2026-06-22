import type { Metadata } from "next";
import type { EcoPersona, EcoThreadListResponse } from "@psico/types";
import { getAccessToken, serverFetch } from "@/lib/api.server";
import { EcoShell } from "@/components/dashboard/eco/EcoShell";

export const metadata: Metadata = { title: "Eco" };
export const dynamic = "force-dynamic";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "")}/api`;

/**
 * /dashboard/eco — Sprint front-eco.
 *
 * Server shell that fetches the persona + initial thread rail in parallel,
 * then hands off to the EcoShell client tree. The DiaryKeyProvider lives
 * one level up (dashboard layout) so `ecoKey` is already available when
 * the user lands here.
 */
export default async function EcoPage() {
  const [capsResult, threadsResult] = await Promise.allSettled([
    serverFetch<EcoPersona>("/eco/caps"),
    serverFetch<EcoThreadListResponse>("/eco/threads"),
  ]);

  const caps: EcoPersona =
    capsResult.status === "fulfilled"
      ? capsResult.value
      : {
          name: "Eco",
          voice: "Companion conversacional.",
          caps: [],
        };
  const initialRail =
    threadsResult.status === "fulfilled" ? threadsResult.value.rail : [];
  const accessToken = getAccessToken();

  // Sprint F3 — paridad con design `s-eco`: no hay header en la página,
  // el título "Eco" vive dentro del chat header (`.eco-chead`). El shell
  // ya orquesta el `.eco-layout` grid + disclaimer en el rail.
  return (
    <EcoShell
      caps={caps}
      initialRail={initialRail}
      apiBase={API_BASE}
      token={accessToken}
    />
  );
}
