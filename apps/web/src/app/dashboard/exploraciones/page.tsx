import type { Metadata } from "next";
import type { JourneyListResponse } from "@psico/types";

import { isNextThrow, serverFetch } from "@/lib/api.server";
import { ExCard } from "@/components/dashboard/exploraciones/ExCard";
import { ExFeaturedCard } from "@/components/dashboard/exploraciones/ExFeaturedCard";
import { GuideEntryCardMount } from "@/components/dashboard/guide/GuideEntryCardMount";

export const metadata: Metadata = { title: "Exploraciones" };
export const dynamic = "force-dynamic";

/**
 * /dashboard/exploraciones — Sprint F1, extended by CC-7.5.
 *
 * The screen now hosts two DIFFERENT products:
 *
 *   - a Guía breve (Guide V1): three short steps, its own route, its own
 *     lifecycle. It is not a Journey and never travels in `JourneyListResponse`;
 *   - the Journey paths: multi-book routes that keep the design's
 *     `ex-feature` + `explore-grid` vocabulary untouched.
 *
 * The guide card renders unconditionally, so the screen is never empty and
 * `/journeys` failing cannot hide it.
 *
 * CC-7.5 — this page fetches NO identity. The dashboard layout already
 * resolved the authenticated user and published the Guide actor scope through
 * `GuideActorScopeProvider`; `GuideEntryCardMount` reads it from context. So
 * the only server fetch here is `/journeys`.
 */
export default async function ExploracionesPage() {
  let data: JourneyListResponse | null = null;
  try {
    data = await serverFetch<JourneyListResponse>("/journeys");
  } catch (err) {
    // A journeys outage degrades to an empty list, but a Next redirect is not
    // an outage: swallowing it would render a page for a session that the
    // fetcher already decided has to log in again.
    if (isNextThrow(err)) throw err;
    data = { journeys: [] };
  }

  const journeys = data?.journeys ?? [];
  // First journey takes the featured slot; the rest fill the grid.
  const [featured, ...rest] = journeys;

  return (
    <>
      <div className="screen-head">
        <div className="screen-title">
          <span className="eb">Recorridos de transformación</span>
          Exploraciones
        </div>
      </div>
      <p className="screen-sub" style={{ margin: "-14px 0 26px" }}>
        Guías breves y recorridos más largos que combinan lectura, ejercicios y
        reflexión. Cada experiencia dice por sí misma qué registra.
      </p>

      <GuideEntryCardMount />

      {featured ? (
        <>
          <div className="sec-label" style={{ marginTop: 8 }}>
            Recorridos
          </div>
          <ExFeaturedCard journey={featured} />
        </>
      ) : null}

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

      {journeys.length === 0 ? (
        <>
          <div className="sec-label" style={{ marginTop: 8 }}>
            Recorridos
          </div>
          <div className="card" style={{ padding: 24 }}>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: "var(--color-warm-600)",
                margin: 0,
              }}
            >
              Estamos curando las primeras rutas. Vuelve en unos días para
              encontrar bundles temáticos de libros y prácticas.
            </p>
          </div>
        </>
      ) : null}
    </>
  );
}
