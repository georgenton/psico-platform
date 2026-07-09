import type { Metadata } from "next";
import type { EvolucionResponse, HomeResponse } from "@psico/types";

import { serverFetch } from "@/lib/api.server";
import { ExportButton } from "@/components/dashboard/shell/ExportButton";
import { MapDims } from "@/components/dashboard/mapa/MapDims";
import { MapFeed } from "@/components/dashboard/mapa/MapFeed";
import { MapStage } from "@/components/dashboard/mapa/MapStage";

export const metadata: Metadata = { title: "Mapa Emocional" };
export const dynamic = "force-dynamic";

/**
 * /dashboard/mapa — Sprint F2.
 *
 * Aligns with `docs/design/redesign-v2/dashboard/index.html` (s-mapa):
 * `screen-head` with eb + Exportar + `.map-grid` 2-col (`.map-stage` dark
 * gradient + `.map-dims` axis bars) + `.map-feed` chips. Reuses the
 * cached emotional map from `/home` and the evolución stats for the feed
 * counts.
 */
export default async function MapaPage() {
  const [homeResult, evolucionResult] = await Promise.allSettled([
    serverFetch<HomeResponse>("/home"),
    serverFetch<EvolucionResponse>("/evolucion"),
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
  const stats =
    evolucionResult.status === "fulfilled" ? evolucionResult.value.stats : null;

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
        <MapDims dimensions={home.emotionalMap.dimensions} />
      </div>

      <MapFeed stats={stats} />
    </>
  );
}
