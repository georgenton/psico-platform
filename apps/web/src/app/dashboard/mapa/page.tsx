import type { Metadata } from "next";
import type { HomeResponse } from "@psico/types";

import { serverFetch } from "@/lib/api.server";
import { Radar } from "@/components/dashboard/shell/Radar";
import { AxisBreakdown } from "@/components/dashboard/mapa/AxisBreakdown";

export const metadata: Metadata = { title: "Mapa Emocional" };
export const dynamic = "force-dynamic";

const AXES = [
  "Calma",
  "Claridad",
  "Conexión",
  "Propósito",
  "Compasión",
  "Consciencia",
] as const;

export default async function MapaPage() {
  // The emotional map is already cached server-side (24h Redis); calling
  // /api/home keeps us with one round-trip and reuses the value rendered
  // on Inicio. If the user navigates here cold, the home payload is the
  // canonical source.
  const home = await serverFetch<HomeResponse>("/home");
  const { values, pct, computedAt, provider } = home.emotionalMap;

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div className="greet-eyebrow">Tu mapa</div>
        <div className="greet">Tu Mapa Emocional</div>
        <div className="greet-sub">
          Seis ejes que se mueven con cada práctica. Esta vista es solo tuya.
        </div>
      </div>

      <div
        className="card insight"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 32,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Radar
            size={360}
            values={values}
            axes={AXES as unknown as string[]}
            showLabels
          />
        </div>
        <div>
          <span className="card-tag">Comprensión emocional</span>
          <div
            style={{
              font: "700 64px/1 var(--font-sans)",
              letterSpacing: "-0.03em",
              color: "var(--color-warm-900)",
              marginTop: 8,
            }}
          >
            {pct}%
          </div>
          <div
            style={{
              color: "var(--color-warm-500)",
              fontSize: 13,
              marginTop: 8,
            }}
          >
            Promedio de los 6 ejes. Mientras más equilibrado, más sostenida tu
            práctica.
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--color-warm-400)",
              letterSpacing: ".05em",
              textTransform: "uppercase",
            }}
          >
            Actualizado · {formatDate(computedAt)} · {provider}
          </div>
        </div>
      </div>

      <div className="sec-label" style={{ marginTop: 36 }}>
        Cada eje en detalle
      </div>
      <AxisBreakdown values={values} />
    </>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-EC", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
