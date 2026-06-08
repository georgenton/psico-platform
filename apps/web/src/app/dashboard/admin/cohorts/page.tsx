import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { PulsoCohortRetentionResponse } from "@psico/types";

import { getSessionUser, isNextThrow, serverFetch } from "@/lib/api.server";
import { CohortHeatmap } from "@/components/dashboard/admin/CohortHeatmap";

export const metadata: Metadata = { title: "Pulso · Cohorts" };
export const dynamic = "force-dynamic";

/**
 * /dashboard/admin/cohorts — Sprint S51.
 *
 * Cohort retention heatmap. ADMIN-only Server Component that fetches
 * `/api/pulso/cohorts` (cached server-side 5min) and renders a triangle
 * with rows = signup-week cohorts (newest first) and columns = weeks-since-
 * signup. Each cell is shaded by retention % (precomputed server-side).
 *
 * Privacy note: the response shape exposes only integer counts + percent
 * values. No per-user identifiers reach the browser. Same invariant as
 * /pulso/overview from S48.
 */
export default async function PulsoCohortsPage() {
  const user = getSessionUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  let data: PulsoCohortRetentionResponse | null = null;
  try {
    data = await serverFetch<PulsoCohortRetentionResponse>("/pulso/cohorts");
  } catch (err) {
    if (isNextThrow(err)) throw err;
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-6">
          <p
            className="text-[11px] uppercase tracking-widest"
            style={{ color: "var(--color-lavender-600)" }}
          >
            Pulso · Admin
          </p>
          <h1
            className="text-[28px] font-bold tracking-tight"
            style={{ color: "var(--color-warm-900)" }}
          >
            Cohorts
          </h1>
        </header>
        <p
          className="rounded-2xl border-[1.5px] bg-white p-6 text-[13px]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-500)",
          }}
        >
          No pudimos cargar las cohortes. Reintenta en unos minutos.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <header>
        <p
          className="text-[11px] uppercase tracking-widest"
          style={{ color: "var(--color-lavender-600)" }}
        >
          Pulso · Admin
        </p>
        <h1
          className="text-[28px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Cohorts
        </h1>
        <p
          className="mt-1 text-[13px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Retención por cohorte de signup (lunes UTC). Cada fila es una cohorte;
          cada columna W<i>n</i> es la semana <i>n</i> tras el signup. Datos
          materializados cada lunes 03:00 UTC · generado{" "}
          {new Date(data.generatedAt).toLocaleString("es")}.
        </p>
      </header>

      <CohortHeatmap data={data} />

      <p className="text-[11px]" style={{ color: "var(--color-warm-400)" }}>
        Privacidad: este reporte agrega counts por cohorte. Ningún identificador
        de usuario, email o IP aparece en el wire.
      </p>
    </div>
  );
}
