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

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="mb-5">
        <h1
          className="text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]"
          style={{ color: "var(--color-warm-900)" }}
        >
          Eco
        </h1>
        <p
          className="mt-1.5 text-[14px] leading-relaxed"
          style={{ color: "var(--color-warm-500)" }}
        >
          Un companion para nombrar lo que pasa adentro. Cifrado en tu
          dispositivo. No reemplaza a un profesional.
        </p>
      </header>

      <EcoShell
        caps={caps}
        initialRail={initialRail}
        apiBase={API_BASE}
        token={accessToken}
      />
    </div>
  );
}
