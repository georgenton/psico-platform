import type { Metadata } from "next";
import type {
  DiaryListResponse,
  DiaryPromptOfTheDay,
  EvolucionResponse,
  UserMeResponse,
} from "@psico/types";

import { getAccessToken, serverFetch } from "@/lib/api.server";
import { DiarioShell } from "@/components/dashboard/diario/DiarioShell";
import { ReflSidePanel } from "@/components/dashboard/diario/ReflSidePanel";

export const metadata: Metadata = { title: "Reflexiones" };
export const dynamic = "force-dynamic";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "")}/api`;

export default async function ReflexionesPage() {
  // Four parallel fetches: entries, prompt, me (for cryptoSalt) and the
  // evolución stats that drive the right-hand sidepanel. Each can fail
  // independently — we degrade gracefully.
  const [entriesResult, promptResult, meResult, evolucionResult] =
    await Promise.allSettled([
      serverFetch<DiaryListResponse>("/reflexiones/entries?perPage=30"),
      serverFetch<DiaryPromptOfTheDay | null>("/reflexiones/prompt-of-the-day"),
      serverFetch<UserMeResponse>("/user/me"),
      serverFetch<EvolucionResponse>("/evolucion"),
    ]);

  const entries =
    entriesResult.status === "fulfilled" ? entriesResult.value.entries : [];
  const prompt =
    promptResult.status === "fulfilled" ? promptResult.value : null;
  const seedAlreadyShown =
    meResult.status === "fulfilled"
      ? meResult.value.cryptoSeedShownAt !== null
      : true;
  const evolucion =
    evolucionResult.status === "fulfilled" ? evolucionResult.value : null;
  const accessToken = getAccessToken();

  return (
    <>
      <div
        className="screen-head"
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div className="screen-title">
          <span className="eb">Tu hilo de autoconocimiento</span>
          Reflexiones
        </div>
        {/* The "Nueva reflexión" CTA from the design is rendered inline by
            the DiarioShell composer below — surfacing it here would create
            two competing entry points. The capture card IS the CTA. */}
      </div>
      <p className="screen-sub" style={{ margin: "0 0 26px" }}>
        Cada cosa que escribes aquí le da forma a tu Mapa Emocional. No es un
        diario que se archiva — es la materia prima de tu evolución.
      </p>

      <div className="refl-grid">
        <div>
          <DiarioShell
            seedAlreadyShown={seedAlreadyShown}
            entries={entries}
            prompt={prompt}
            apiBase={API_BASE}
            token={accessToken}
          />
        </div>
        <div className="refl-side">
          <ReflSidePanel stats={evolucion?.stats ?? null} />
        </div>
      </div>
    </>
  );
}
