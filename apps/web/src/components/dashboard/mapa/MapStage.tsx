import type { EmotionalMapResult } from "@psico/types";
import { Radar } from "@/components/dashboard/shell/Radar";
import { IconTrendUp } from "@/components/dashboard/shell/icons";
import { MapInfoButton } from "./MapInfoButton";

const AXES = [
  "Calma",
  "Claridad",
  "Conexión",
  "Propósito",
  "Compasión",
  "Consciencia",
] as const;

/**
 * MapStage — hybrid rework.
 *
 * Dark gradient card with the Radar centered and a comprehension score below.
 * The header now carries an ℹ️ that opens the transparency modal (how the map
 * is measured + how it fills). When overall coverage is still low we say so
 * honestly next to the score instead of implying the number is final.
 */
export function MapStage({ map }: { map: EmotionalMapResult }) {
  const gathering = map.coverage < 0.4;
  return (
    <div className="map-stage">
      <div className="ms-head">
        <div className="ms-title">
          <span className="d" />
          Dimensiones del autoconocimiento
        </div>
        <div
          className="ms-meta"
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          <span>Actualizado · {formatDate(map.computedAt)}</span>
          <MapInfoButton dimensions={map.dimensions} />
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
          <div className="lbl">
            {gathering ? "Tu mapa se está formando" : "Comprensión emocional"}
          </div>
        </div>
        <span className="delta">
          <IconTrendUp size={14} />
          {map.provider === "anthropic"
            ? "Análisis con IA"
            : "Análisis inicial"}
        </span>
      </div>
      {gathering ? (
        <p
          style={{
            margin: "12px 0 0",
            fontSize: 12,
            lineHeight: 1.5,
            color: "rgba(255,255,255,0.72)",
          }}
        >
          Todavía estamos reuniendo señales. Escribe una reflexión, conversa con
          Eco o avanza en una lectura y verás cómo cada dimensión se enciende.
        </p>
      ) : null}
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
