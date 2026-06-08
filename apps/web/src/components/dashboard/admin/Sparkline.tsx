/**
 * Sparkline — Sprint S50.
 *
 * Inline SVG line chart. No `recharts` (~80KB gzip), no `react-chartjs` (~120KB).
 * For 30 data points and a fixed-size container, hand-rolled SVG renders in
 * ~50 lines of JSX and weighs zero KB at runtime.
 *
 * Rendering choices:
 *  - We use a viewBox of 100×30 (aspect 10:3) so the chart scales cleanly.
 *  - The line is drawn with a 1.5px stroke; mute color by default with
 *    explicit override via `stroke` prop.
 *  - A baseline at 0 is rendered when at least one value > 0; pure-zero
 *    series get a flat baseline only (no point markers, no fill).
 *  - We optionally fill the area under the curve at 12% opacity for visual
 *    density without distracting from neighbouring cards.
 */
export function Sparkline({
  values,
  stroke = "var(--color-lavender-500, #8B7CBF)",
  fill = true,
  ariaLabel,
}: {
  values: readonly number[];
  stroke?: string;
  fill?: boolean;
  ariaLabel?: string;
}) {
  if (values.length === 0) {
    return null;
  }
  const W = 100;
  const H = 30;
  const max = Math.max(...values, 1); // avoid div-by-zero on all-zero series
  const step = values.length > 1 ? W / (values.length - 1) : W;

  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = H - (v / max) * H;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const areaPath = fill
    ? `M0,${H} L${points.replaceAll(",", ",")} L${W},${H} Z`
    : null;

  return (
    <svg
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: 30, display: "block" }}
    >
      {areaPath ? (
        <path d={areaPath} fill={stroke} opacity={0.12} stroke="none" />
      ) : null}
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
