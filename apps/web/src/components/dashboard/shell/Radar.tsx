/**
 * Radar — Sprint B6 visual parity.
 *
 * 6-axis SVG radar lifted from `docs/design/redesign-v2/dashboard/scripts.js`.
 * Rendered server-side so it appears on first paint without JS hydration.
 *
 * The design ships sample values pending Sprint D's real /api/emotional-map
 * endpoint. Pass `values` to drive the polygon; defaults match the landing
 * page sample (Calma, Claridad, Conexión, Propósito, Compasión, Consciencia).
 *
 * The component intentionally renders only the geometry — no labels — so the
 * mini variant inside the home hero fits in a 200×200 viewport. The full
 * Mapa screen (Sprint B6b) will layer labels above with absolute positioning.
 */

const DEFAULT_AXES = [
  "Calma",
  "Claridad",
  "Conexión",
  "Propósito",
  "Compasión",
  "Consciencia",
] as const;

const DEFAULT_VALUES = [0.58, 0.72, 0.8, 0.62, 0.5, 0.74] as const;

type RadarProps = {
  axes?: readonly string[];
  values?: readonly number[];
  size?: number;
  /** When true, draws the axis labels around the radar. */
  showLabels?: boolean;
};

export function Radar({
  axes = DEFAULT_AXES,
  values = DEFAULT_VALUES,
  size = 200,
  showLabels = false,
}: RadarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.36;
  const rings = 4;
  const N = axes.length;

  function ang(i: number) {
    return ((-90 + (i * 360) / N) * Math.PI) / 180;
  }
  function pt(i: number, r: number): [number, number] {
    return [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r];
  }
  function polyPoints(r: number) {
    return Array.from({ length: N }, (_, i) => {
      const [x, y] = pt(i, r);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }

  const dataPoints = Array.from({ length: N }, (_, i) => {
    const [x, y] = pt(i, R * (values[i] ?? 0.5));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label="Radar de dimensiones del autoconocimiento"
    >
      {/* Rings */}
      {Array.from({ length: rings }, (_, k) => (
        <polygon
          key={`ring-${k}`}
          points={polyPoints((R * (k + 1)) / rings)}
          fill="none"
          stroke="var(--color-warm-300)"
          strokeWidth={1}
          opacity={0.55}
        />
      ))}
      {/* Axes */}
      {Array.from({ length: N }, (_, i) => {
        const [ex, ey] = pt(i, R);
        return (
          <line
            key={`axis-${i}`}
            x1={cx}
            y1={cy}
            x2={ex.toFixed(1)}
            y2={ey.toFixed(1)}
            stroke="var(--color-warm-300)"
            strokeWidth={1}
            opacity={0.55}
          />
        );
      })}
      {/* Data polygon */}
      <polygon
        points={dataPoints}
        fill="rgba(139,113,245,0.22)"
        stroke="var(--color-lavender-500)"
        strokeWidth={1.6}
      />
      {/* Nodes */}
      {Array.from({ length: N }, (_, i) => {
        const [x, y] = pt(i, R * (values[i] ?? 0.5));
        return (
          <circle
            key={`node-${i}`}
            cx={x.toFixed(1)}
            cy={y.toFixed(1)}
            r={3.5}
            fill="var(--color-lavender-500)"
            stroke="white"
            strokeWidth={1.2}
          />
        );
      })}
      {/* Labels */}
      {showLabels
        ? axes.map((label, i) => {
            const [lx, ly] = pt(i, R + 18);
            const a = ang(i);
            const anchor =
              Math.abs(Math.cos(a)) < 0.3
                ? "middle"
                : Math.cos(a) > 0
                  ? "start"
                  : "end";
            return (
              <text
                key={`label-${i}`}
                x={lx.toFixed(1)}
                y={ly.toFixed(1)}
                fill="var(--color-warm-600)"
                fontSize={11}
                fontWeight={500}
                textAnchor={anchor}
                dominantBaseline="middle"
              >
                {label}
              </text>
            );
          })
        : null}
      {/* Pulse + core */}
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill="none"
        stroke="var(--color-lavender-400)"
        strokeWidth={1.4}
        opacity={0.7}
      />
      <circle cx={cx} cy={cy} r={4.5} fill="var(--color-lavender-600)" />
    </svg>
  );
}
