import type { Metadata } from "next";
import type { HomeResponse, ResonanceListResponse } from "@psico/types";

import { serverFetch } from "@/lib/api.server";
import { MapResonances } from "@/components/dashboard/mapa/MapResonances";
import { ExportButton } from "@/components/dashboard/shell/ExportButton";
import { MapDims } from "@/components/dashboard/mapa/MapDims";
import { MapFeed } from "@/components/dashboard/mapa/MapFeed";
import { MapStage } from "@/components/dashboard/mapa/MapStage";
import { MapAffectDynamics } from "@/components/dashboard/mapa/MapAffectDynamics";

export const metadata: Metadata = { title: "Mapa Emocional" };
export const dynamic = "force-dynamic";

/**
 * /dashboard/mapa — Sprint F2.
 *
 * Aligns with `docs/design/redesign-v2/dashboard/index.html` (s-mapa):
 * `screen-head` with eb + Exportar + `.map-grid` 2-col (`.map-stage` dark
 * gradient + `.map-dims` axis bars). Fase C: the engagement counters left
 * this page — `MapFeed` is now a pointer to Mi Evolución, so the map only
 * needs the cached emotional map from `/home`.
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

  const home = homeResult.value;

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
        Una representación viva de tu mundo interior. Se actualiza sola a medida
        que lees, escribes y conversas. No mide cuánto haces — refleja cuánto te
        comprendes.
      </p>

      <div className="map-grid">
        <MapStage map={home.emotionalMap} />
        <MapDims
          dimensions={home.emotionalMap.dimensions}
          affectActive={home.emotionalMap.affectDynamics?.status === "active"}
        />
      </div>

      <MapAffectDynamics data={home.emotionalMap.affectDynamics} />

      <MapResonances
        initial={
          resonancesResult.status === "fulfilled"
            ? resonancesResult.value.resonances
            : []
        }
      />

      <MapFeed />
    </>
  );
}
