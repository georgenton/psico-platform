import type { Metadata } from "next";
import type { HomeResponse, ResonanceListResponse } from "@psico/types";

import { serverFetch } from "@/lib/api.server";
import { MapResonances } from "@/components/dashboard/mapa/MapResonances";
import { ExportButton } from "@/components/dashboard/shell/ExportButton";
import { MapFeed } from "@/components/dashboard/mapa/MapFeed";
import { MapAffectDynamics } from "@/components/dashboard/mapa/MapAffectDynamics";
import { MapInfoButton } from "@/components/dashboard/mapa/MapInfoButton";
import { MapLenguaje } from "@/components/dashboard/mapa/MapLenguaje";
import { MapMomento } from "@/components/dashboard/mapa/MapMomento";
import { MapNarrative } from "@/components/dashboard/mapa/MapNarrative";
import { MapRadar } from "@/components/dashboard/mapa/MapRadar";

export const metadata: Metadata = { title: "Mapa Emocional" };
export const dynamic = "force-dynamic";

/**
 * /dashboard/mapa — V2 layout (Fase F; legacy retired in Fase G).
 *
 * No global percentage, no 6-axis radar: independent sections, each with its
 * own provenance — Mi momento · Cómo me describí (self-report, decision L2) ·
 * Dinámica · Mis resonancias · Patrones de lenguaje · narrative (L3) · a
 * pointer to Mi Evolución for the activity counters. Every V2 section is
 * null-tolerant, so the page degrades gracefully even if the server is
 * rolled back to the legacy data contract (EMOTIONAL_MAP_V2=off).
 */
export default async function MapaPage() {
  const [homeResult, resonancesResult] = await Promise.allSettled([
    serverFetch<HomeResponse>("/home"),
    serverFetch<ResonanceListResponse>("/resonances"),
  ]);

  if (homeResult.status !== "fulfilled") {
    return (
      <>
        <div className="screen-head">
          <div className="screen-title">
            <span className="eb">El corazón de tu experiencia</span>
            Tu Mapa Emocional
          </div>
        </div>
        <div className="card">
          <p
            style={{ margin: 0, color: "var(--color-warm-500)", fontSize: 14 }}
          >
            No pudimos cargar tu mapa emocional. Reintenta en unos minutos.
          </p>
        </div>
      </>
    );
  }

  const map = homeResult.value.emotionalMap;
  const resonances =
    resonancesResult.status === "fulfilled"
      ? resonancesResult.value.resonances
      : [];

  return (
    <>
      <div className="screen-head">
        <div className="screen-title">
          <span className="eb">El corazón de tu experiencia</span>
          Tu Mapa Emocional
        </div>
        <ExportButton />
      </div>
      <p className="screen-sub" style={{ margin: "-14px 0 26px" }}>
        Lo que tú registras y confirmas: tu ánimo, tus respuestas, tus
        resonancias. Nada entra a este mapa sin ti.
      </p>

      <MapMomento momento={map.momento} />
      <MapRadar
        dimensions={map.dimensions}
        info={<MapInfoButton dimensions={map.dimensions} />}
      />
      <MapAffectDynamics data={map.affectDynamics} />
      <MapResonances initial={resonances} />
      <MapLenguaje lenguaje={map.lenguaje} />
      <MapNarrative narrative={map.narrative} />
      <MapFeed />
    </>
  );
}
