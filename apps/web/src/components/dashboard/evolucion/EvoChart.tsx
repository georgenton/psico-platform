import type {
  EmotionalMapResult,
  EvolucionEmotionalSeriesPoint,
} from "@psico/types";
import { IconTrendUp } from "@/components/dashboard/shell/icons";

/**
 * EvoChart — Sprint F2, extended in Sprint G2.
 *
 * The `.card.evo-chart` from the design's `s-evolucion` screen — a line
 * chart of "Comprensión emocional" over the last months.
 *
 * Behavior:
 *  - With `series.length >= 2` we render the polyline + filled area + one
 *    dot per month + month labels along the x-axis.
 *  - With 0–1 points we render the snapshot-only fallback (single dot at
 *    the current `map.pct`) with the "we'll fill in over time" copy.
 *
 * The monthly snapshots are produced by the `EmotionalMapSnapshotProcessor`
 * cron (1st of month, 04:00 UTC). New users see the fallback until their
 * first month closes.
 */

const VIEW_W = 640;
const VIEW_H = 210;
const PAD_LEFT = 40;
const PAD_RIGHT = 40;
const Y_TOP = 50;
const Y_BOTTOM = 190;

const MONTH_LABELS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

interface Props {
  map: EmotionalMapResult;
  /** Sprint G2 — monthly snapshots, sorted ascending. Defaults to empty. */
  series?: EvolucionEmotionalSeriesPoint[];
}

export function EvoChart({ map, series = [] }: Props) {
  const pct = map.pct;
  const hasSeries = series.length >= 2;

  if (!hasSeries) {
    return <SnapshotFallback pct={pct} />;
  }

  const points = series.map((p, i) => ({
    x: scaleX(i, series.length),
    y: mapPctToY(p.pct),
    pct: p.pct,
    monthIso: p.monthIso,
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const areaD = `${pathD} L ${points[points.length - 1]!.x} ${Y_BOTTOM} L ${points[0]!.x} ${Y_BOTTOM} Z`;
  const last = points[points.length - 1]!;
  const first = series[0]!;
  const lastPoint = series[series.length - 1]!;
  const delta = lastPoint.pct - first.pct;

  return (
    <div className="card evo-chart">
      <span className="card-tag">Comprensión emocional</span>
      <div className="ec-score">
        <b>{lastPoint.pct}%</b>
        <span className="delta">
          <IconTrendUp size={14} />
          {delta > 0 ? `+${delta} pts` : `${delta} pts`} en{" "}
          {series.length === 1 ? "1 mes" : `${series.length} meses`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        style={{ maxHeight: 230 }}
        role="img"
        aria-label={`Comprensión emocional · serie de ${series.length} meses`}
      >
        <defs>
          <linearGradient id="evoFill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0"
              stopColor="var(--color-lavender-400)"
              stopOpacity="0.28"
            />
            <stop
              offset="1"
              stopColor="var(--color-lavender-400)"
              stopOpacity="0"
            />
          </linearGradient>
        </defs>
        <line className="ec-grid" x1="40" y1="152.5" x2="600" y2="152.5" />
        <line className="ec-grid" x1="40" y1="115" x2="600" y2="115" />
        <line className="ec-grid" x1="40" y1="77.5" x2="600" y2="77.5" />
        <path d={areaD} fill="url(#evoFill)" />
        <path className="ec-line" d={pathD} />
        {points.map((p, i) => (
          <circle
            key={p.monthIso}
            className={`ec-dot${i === points.length - 1 ? " last" : ""}`}
            cx={p.x}
            cy={p.y}
            r={i === points.length - 1 ? 5.5 : 4}
          />
        ))}
        {/* For accessibility — invisible-but-named title for screen readers. */}
        <title>
          Comprensión emocional al cierre del último mes: {last.pct}%
        </title>
      </svg>
      <div className="ec-x">
        {series.map((p) => (
          <span key={p.monthIso}>{formatMonth(p.monthIso)}</span>
        ))}
      </div>
    </div>
  );
}

function SnapshotFallback({ pct }: { pct: number }) {
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
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
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

function scaleX(i: number, total: number): number {
  if (total <= 1) return VIEW_W - PAD_RIGHT;
  const usable = VIEW_W - PAD_LEFT - PAD_RIGHT;
  return PAD_LEFT + (i / (total - 1)) * usable;
}

function mapPctToY(pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  return Y_BOTTOM - (clamped / 100) * (Y_BOTTOM - Y_TOP);
}

function formatMonth(iso: string): string {
  // iso = YYYY-MM-DD → MM index in 0..11
  const monthIdx = Number(iso.slice(5, 7)) - 1;
  return MONTH_LABELS[monthIdx] ?? "—";
}
