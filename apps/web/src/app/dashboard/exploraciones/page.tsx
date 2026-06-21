import type { Metadata } from "next";
import type { JourneyListResponse } from "@psico/types";

import { serverFetch } from "@/lib/api.server";
import { ExCard } from "@/components/dashboard/exploraciones/ExCard";
import { ExFeaturedCard } from "@/components/dashboard/exploraciones/ExFeaturedCard";
import { PlaceholderCard } from "@/components/dashboard/shell/PlaceholderCard";

export const metadata: Metadata = { title: "Exploraciones" };
export const dynamic = "force-dynamic";

/**
 * /dashboard/exploraciones — Sprint F1.
 *
 * Aligns with `docs/design/redesign-v2/dashboard/index.html` (s-exploraciones):
 * `screen-head` + `screen-sub` + featured `card.ex-feature` + `sec-label`
 * + `explore-grid` of `card.ex-card`. Reuses the same `JourneyListResponse`
 * data that powered Sprint B5, but rebrands the surface in the design's
 * vocabulary so the screen visually matches Claude Design.
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

  // First journey takes the featured slot; the rest fill the grid. When
  // only one is available we render just the featured card and the grid
  // collapses naturally.
  const [featured, ...rest] = data.journeys;

  return (
    <>
      <div className="screen-head">
        <div className="screen-title">
          <span className="eb">Recorridos de transformación</span>
          Exploraciones
        </div>
      </div>
      <p className="screen-sub" style={{ margin: "-14px 0 26px" }}>
        No son cursos ni libros sueltos — son recorridos guiados hacia algo que
        quieres trabajar en ti. Cada uno combina lectura, ejercicios y
        reflexión, y alimenta tu mapa.
      </p>

      {featured ? <ExFeaturedCard journey={featured} /> : null}

      {rest.length > 0 ? (
        <>
          <div className="sec-label" style={{ marginTop: 8 }}>
            Más recorridos
          </div>
          <div className="explore-grid">
            {rest.map((journey, i) => (
              <ExCard key={journey.id} journey={journey} index={i} />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
