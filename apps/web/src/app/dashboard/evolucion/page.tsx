import type { Metadata } from "next";
import type { EvolucionResponse, HomeResponse } from "@psico/types";

import { serverFetch } from "@/lib/api.server";
import { ExportButton } from "@/components/dashboard/shell/ExportButton";
import { EvolucionEmotionalSection } from "@/components/dashboard/evolucion/EmotionalSection";
import { EvoQuarter } from "@/components/dashboard/evolucion/EvoQuarter";
import { LearningActivityCard } from "@/components/dashboard/evolucion/LearningActivityCard";
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
          <span className="eb">Tu recorrido, registrado</span>
          Mi Evolución
        </div>
        <ExportButton />
      </div>
      {/*
        GR-2 — factual copy. This page records what the person DID; it does not
        claim that doing it changed them. The Emotional Map stays a separate
        surface fed only by what someone chooses to express.
      */}
      <p className="screen-sub" style={{ margin: "-14px 0 26px" }}>
        Aquí puedes ver lo que has leído, practicado y completado. El Mapa
        Emocional se alimenta solo de señales que tú decides registrar.
      </p>

      <div className="evo-top">
        <EvolucionEmotionalSection
          emotionalMapAvailable={evolucion.emotionalMapAvailable}
          map={map}
          series={evolucion.emotionalSeries}
        />
        <EvoQuarter stats={evolucion.stats} />
      </div>

      <LearningActivityCard stats={evolucion.stats} />

      <MilestonesTimeline milestones={evolucion.milestones} />
    </>
  );
}
