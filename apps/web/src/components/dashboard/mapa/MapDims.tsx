import type { EmotionalMapDimension } from "@psico/types";
import {
  IconBook,
  IconEco,
  IconFlame,
  IconPatterns,
  IconReflections,
  IconWind,
} from "@/components/dashboard/shell/icons";

/**
 * MapDims — hybrid rework.
 *
 * Renders the 6 axes of the Emotional Map as `.dim` rows. Each row reads its
 * value AND its confidence from the backend. When an axis doesn't yet have
 * enough real signal (confidence below the floor) we render an honest
 * "Reuniendo datos" state — never a fabricated percentage. The `sources`
 * caption tells the user exactly what feeds that axis so they know how to
 * fill it.
 */

/** Must match `CONFIDENCE_FLOOR` in the backend service. */
const CONFIDENCE_FLOOR = 0.15;

const ICONS: Record<
  EmotionalMapDimension["key"],
  (p: { size?: number }) => React.JSX.Element
> = {
  calma: IconWind,
  claridad: IconBook,
  conexion: IconReflections,
  proposito: IconFlame,
  compasion: IconEco,
  consciencia: IconPatterns,
};

const LABELS: Record<EmotionalMapDimension["key"], string> = {
  calma: "Calma",
  claridad: "Claridad",
  conexion: "Conexión",
  proposito: "Propósito",
  compasion: "Compasión",
  consciencia: "Consciencia",
};

export function MapDims({
  dimensions,
}: {
  dimensions: EmotionalMapDimension[];
}) {
  return (
    <div className="map-dims">
      {dimensions.map((dim) => {
        const Icon = ICONS[dim.key];
        const label = LABELS[dim.key];
        const covered = dim.confidence >= CONFIDENCE_FLOOR;
        const pct = Math.round(dim.value * 100);
        return (
          <div key={dim.key} className="dim">
            <div className="d-top">
              <div className="d-name">
                <span className="dg">
                  <Icon size={17} />
                </span>
                {label}
              </div>
              {covered ? (
                <span className="d-trend flat">{pct}%</span>
              ) : (
                <span
                  className="d-trend"
                  style={{
                    background: "var(--color-warm-100)",
                    color: "var(--color-warm-500)",
                  }}
                >
                  Reuniendo datos
                </span>
              )}
            </div>
            <div
              className="d-bar"
              role="progressbar"
              aria-valuenow={covered ? pct : 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={label}
            >
              <i
                style={{
                  width: covered ? `${pct}%` : "0%",
                  opacity: covered ? 1 : 0.35,
                }}
              />
            </div>
            <p
              style={{
                margin: "7px 0 0",
                fontSize: 11.5,
                lineHeight: 1.4,
                color: "var(--color-warm-500)",
              }}
            >
              {dim.sources}
            </p>
          </div>
        );
      })}
    </div>
  );
}
