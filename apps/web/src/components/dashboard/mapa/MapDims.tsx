import {
  IconBook,
  IconEco,
  IconFlame,
  IconPatterns,
  IconReflections,
  IconWind,
} from "@/components/dashboard/shell/icons";

type RadarValues = readonly [number, number, number, number, number, number];

/**
 * MapDims — Sprint F2.
 *
 * Renders the 6 axes of the Emotional Map as `.dim` rows following the
 * design's `s-mapa` screen. Each row carries an icon, the axis name, a
 * trend chip (we surface raw % since we don't have weekly deltas yet)
 * and a bar with the current value.
 *
 * No fake deltas — when we wire month-over-month historical values
 * (currently the emotionalMap cache is single-snapshot), the trend chip
 * will swap from `flat` to `up`/`down`.
 */

const AXES: ReadonlyArray<{
  label: string;
  Icon: (p: { size?: number }) => React.JSX.Element;
}> = [
  { label: "Calma", Icon: IconWind },
  { label: "Claridad", Icon: IconBook },
  { label: "Conexión", Icon: IconReflections },
  { label: "Propósito", Icon: IconFlame },
  { label: "Compasión", Icon: IconEco },
  { label: "Consciencia", Icon: IconPatterns },
];

export function MapDims({ values }: { values: RadarValues }) {
  return (
    <div className="map-dims">
      {AXES.map((axis, i) => {
        const v = values[i] ?? 0.5;
        const pct = Math.round(v * 100);
        return (
          <div key={axis.label} className="dim">
            <div className="d-top">
              <div className="d-name">
                <span className="dg">
                  <axis.Icon size={17} />
                </span>
                {axis.label}
              </div>
              <span className="d-trend flat">{pct}%</span>
            </div>
            <div
              className="d-bar"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={axis.label}
            >
              <i style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
