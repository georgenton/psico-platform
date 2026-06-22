import type { EmotionalMapResult } from "@psico/types";
import { Radar } from "@/components/dashboard/shell/Radar";
import { IconTrendUp } from "@/components/dashboard/shell/icons";

const AXES = [
  "Calma",
  "Claridad",
  "Conexión",
  "Propósito",
  "Compasión",
  "Consciencia",
] as const;

/**
 * MapStage — Sprint F2.
 *
 * Dark gradient card (`.map-stage` in dashboard-design.css) with the
 * Radar centered and a comprehension score below. Mirrors the design's
 * left column in the `s-mapa` screen.
 *
 * `delta` is honest: until we have month-over-month emotional map history,
 * we surface the score and the `computedAt` timestamp in the ms-meta. When
 * historical data lands, the delta swaps to "+N pts este mes".
 */
export function MapStage({ map }: { map: EmotionalMapResult }) {
  return (
    <div className="map-stage">
      <div className="ms-head">
        <div className="ms-title">
          <span className="d" />
          Dimensiones del autoconocimiento
        </div>
        <div className="ms-meta">
          Actualizado · {formatDate(map.computedAt)}
        </div>
      </div>
      <div className="radar-holder">
        <Radar
          size={420}
          values={map.values}
          axes={AXES as unknown as string[]}
          showLabels
        />
      </div>
      <div className="ms-score">
        <div>
          <b>{map.pct}%</b>
          <div className="lbl">Comprensión emocional</div>
        </div>
        <span className="delta">
          <IconTrendUp size={14} />
          {map.provider === "anthropic"
            ? "Análisis con IA"
            : "Análisis rule-based"}
        </span>
      </div>
    </div>
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
