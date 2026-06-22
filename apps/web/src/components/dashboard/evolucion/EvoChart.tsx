import type { EmotionalMapResult } from "@psico/types";
import { IconTrendUp } from "@/components/dashboard/shell/icons";

/**
 * EvoChart — Sprint F2.
 *
 * The `.card.evo-chart` from the design's `s-evolucion` screen — a line
 * chart of "Comprensión emocional" over the last months. The design
 * shows a 6-month series; until we have historical snapshots of the
 * emotional map, we render a single point at the current pct and an
 * inline note explaining the chart will fill in as data accumulates.
 *
 * Backend-side TODO: snapshot `emotionalMap.pct` once a month into a new
 * table. When that table exists, this component takes its series prop
 * and draws the real polyline. The visual structure (SVG viewBox + grid
 * lines + ec-line + ec-dot.last) is already in place.
 */
export function EvoChart({ map }: { map: EmotionalMapResult }) {
  const pct = map.pct;

  // SVG coords mirror the design's 640×210 viewBox so the styles in
  // dashboard-design.css (ec-line/ec-dot/ec-grid) compose cleanly.
  // Single point lands at x=600 (rightmost) y=mapped from pct.
  const y = mapPctToY(pct);

  return (
    <div className="card evo-chart">
      <span className="card-tag">Comprensión emocional</span>
      <div className="ec-score">
        <b>{pct}%</b>
        <span className="delta">
          <IconTrendUp size={14} />
          Snapshot actual
        </span>
      </div>
      <svg
        viewBox="0 0 640 210"
        preserveAspectRatio="none"
        style={{ maxHeight: 230 }}
        role="img"
        aria-label={`Comprensión emocional actual: ${pct}%`}
      >
        <line className="ec-grid" x1="40" y1="152.5" x2="600" y2="152.5" />
        <line className="ec-grid" x1="40" y1="115" x2="600" y2="115" />
        <line className="ec-grid" x1="40" y1="77.5" x2="600" y2="77.5" />
        <circle className="ec-dot last" cx="600" cy={y} r="5.5" />
      </svg>
      <div className="ec-x">
        <span>—</span>
        <span>—</span>
        <span>—</span>
        <span>—</span>
        <span>—</span>
        <span>Hoy</span>
      </div>
      <p
        style={{
          margin: "12px 0 0",
          color: "var(--color-warm-500)",
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        Cuando acumules más meses de práctica, aquí vas a ver tu evolución real.
        Por ahora, solo tu snapshot de hoy.
      </p>
    </div>
  );
}

/** Map pct [0..100] to SVG y in [190..50] — design's chart bounds. */
function mapPctToY(pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  return 190 - (clamped / 100) * 140;
}
