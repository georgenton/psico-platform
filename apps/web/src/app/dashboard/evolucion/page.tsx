import type { Metadata } from "next";
import type { EvolucionResponse } from "@psico/types";

import { serverFetch } from "@/lib/api.server";
import { MilestonesList } from "@/components/dashboard/evolucion/MilestonesList";
import { StatsGrid } from "@/components/dashboard/evolucion/StatsGrid";

export const metadata: Metadata = { title: "Mi Evolución" };
export const dynamic = "force-dynamic";

export default async function EvolucionPage() {
  const data = await serverFetch<EvolucionResponse>("/evolucion");

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div className="greet-eyebrow">Tu camino</div>
        <div className="greet">Mi Evolución</div>
        <div className="greet-sub">
          Lo que has sumado hasta hoy: tus cifras y los hitos que vas
          desbloqueando con la práctica.
        </div>
      </div>

      <div className="sec-label">Tus cifras</div>
      <StatsGrid stats={data.stats} />

      <div className="sec-label" style={{ marginTop: 36 }}>
        Hitos
      </div>
      <MilestonesList milestones={data.milestones} />
    </>
  );
}
