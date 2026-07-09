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
  affectActive = false,
}: {
  dimensions: EmotionalMapDimension[];
  /** True when the affect-dynamics (OU) model is active — Calma is then a real
   *  measurement, not an activity proxy, and gets the "Medido" badge. */
  affectActive?: boolean;
}) {
  return (
    <div className="map-dims">
      {dimensions.map((dim) => {
        const Icon = ICONS[dim.key];
        const label = LABELS[dim.key];
        const covered = dim.confidence >= CONFIDENCE_FLOOR;
        const pct = Math.round(dim.value * 100);
        // Prefer the backend flag (Etapa 2+); fall back to the OU heuristic
        // for maps cached before the field existed.
        const measured = dim.measured ?? (dim.key === "calma" && affectActive);
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
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      padding: "2px 7px",
                      borderRadius: 999,
                      background: measured
                        ? "var(--color-lavender-50)"
                        : "var(--color-warm-100)",
                      color: measured
                        ? "var(--color-lavender-700)"
                        : "var(--color-warm-500)",
                    }}
                  >
                    {measured ? "Medido" : "Tu actividad"}
                  </span>
                  <span className="d-trend flat">{pct}%</span>
                </span>
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
