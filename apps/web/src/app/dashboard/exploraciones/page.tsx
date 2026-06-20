import type { Metadata } from "next";
import type { JourneyListResponse } from "@psico/types";

import { serverFetch } from "@/lib/api.server";
import { JourneyCard } from "@/components/dashboard/exploraciones/JourneyCard";
import { PlaceholderCard } from "@/components/dashboard/shell/PlaceholderCard";

export const metadata: Metadata = { title: "Exploraciones" };
export const dynamic = "force-dynamic";

/**
 * /dashboard/exploraciones — Sprint B5.
 *
 * Real page that replaces the B2 placeholder. Lists the curated journey
 * catalog returned by GET /api/journeys. When the catalog is empty (DB
 * has no published journey) we fall back to the same "Próximamente"
 * placeholder so the surface never renders an awkward blank state.
 */
export default async function ExploracionesPage() {
  let data: JourneyListResponse | null = null;
  try {
    data = await serverFetch<JourneyListResponse>("/journeys");
  } catch {
    data = { journeys: [] };
  }

  if (!data || data.journeys.length === 0) {
    return (
      <PlaceholderCard
        icon="🧭"
        subtitle="Próximamente"
        title="Exploraciones"
        body={
          <p>
            Estamos curando las primeras rutas. Vuelve en unos días para
            encontrar bundles temáticos de libros y prácticas.
          </p>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1080px]">
      <header className="mb-5">
        <p
          className="text-[10.5px] font-bold uppercase tracking-[0.16em]"
          style={{ color: "var(--color-lavender-700)" }}
        >
          Exploraciones
        </p>
        <h1
          className="mt-1 text-2xl font-bold"
          style={{ color: "var(--color-warm-900)" }}
        >
          Rutas temáticas para tu camino
        </h1>
        <p
          className="mt-1 max-w-[640px] text-sm"
          style={{ color: "var(--color-warm-600)" }}
        >
          Bundles curados que combinan libros y prácticas alrededor de una
          intención. Sigue una completa o toma sólo lo que resuene hoy.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        {data.journeys.map((j) => (
          <JourneyCard key={j.id} journey={j} />
        ))}
      </div>
    </div>
  );
}
