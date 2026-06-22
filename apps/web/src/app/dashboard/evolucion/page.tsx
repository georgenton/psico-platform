import type { Metadata } from "next";
import type { EvolucionResponse, HomeResponse } from "@psico/types";

import { serverFetch } from "@/lib/api.server";
import { ExportButton } from "@/components/dashboard/shell/ExportButton";
import { EvoChart } from "@/components/dashboard/evolucion/EvoChart";
import { EvoQuarter } from "@/components/dashboard/evolucion/EvoQuarter";
import { MilestonesTimeline } from "@/components/dashboard/evolucion/MilestonesTimeline";

export const metadata: Metadata = { title: "Mi Evolución" };
export const dynamic = "force-dynamic";

/**
 * /dashboard/evolucion — Sprint F2.
 *
 * Aligns with `docs/design/redesign-v2/dashboard/index.html`
 * (s-evolucion): `screen-head` with eb + Exportar + `.evo-top` 2-col
 * (`.card.evo-chart` line chart + `.card.evo-quarter` highlights) + `.tl`
 * timeline of milestones.
 *
 * Two parallel fetches: `/evolucion` (stats + milestones from Sprint E1)
 * and `/home` (for the cached emotional map snapshot — Sprint D).
 */
export default async function EvolucionPage() {
  const [evolucionResult, homeResult] = await Promise.allSettled([
    serverFetch<EvolucionResponse>("/evolucion"),
    serverFetch<HomeResponse>("/home"),
  ]);

  if (evolucionResult.status !== "fulfilled") {
    return (
      <>
        <div className="screen-head">
          <div className="screen-title">
            <span className="eb">Tu transformación en el tiempo</span>
            Mi Evolución
          </div>
        </div>
        <div className="card">
          <p
            style={{ margin: 0, color: "var(--color-warm-500)", fontSize: 14 }}
          >
            No pudimos cargar tu evolución. Reintenta en unos minutos.
          </p>
        </div>
      </>
    );
  }

  const evolucion = evolucionResult.value;
  const map =
    homeResult.status === "fulfilled" ? homeResult.value.emotionalMap : null;

  return (
    <>
      <div className="screen-head">
        <div className="screen-title">
          <span className="eb">Tu transformación en el tiempo</span>
          Mi Evolución
        </div>
        <ExportButton />
      </div>
      <p className="screen-sub" style={{ margin: "-14px 0 26px" }}>
        No es un registro de cuánto leíste, sino de cómo fuiste cambiando. Cada
        hito es un momento en que entendiste algo nuevo sobre ti.
      </p>

      <div className="evo-top">
        {map ? (
          <EvoChart map={map} />
        ) : (
          <div className="card evo-chart">
            <span className="card-tag">Comprensión emocional</span>
            <p
              style={{
                margin: "12px 0 0",
                color: "var(--color-warm-500)",
                fontSize: 13,
              }}
            >
              No pudimos cargar tu snapshot actual. Reintenta en un momento.
            </p>
          </div>
        )}
        <EvoQuarter stats={evolucion.stats} />
      </div>

      <MilestonesTimeline milestones={evolucion.milestones} />
    </>
  );
}
