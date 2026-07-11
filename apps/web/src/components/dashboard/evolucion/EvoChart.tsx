import type {
  EmotionalMapResult,
  EvolucionEmotionalSeriesPoint,
} from "@psico/types";
import { IconTrendUp } from "@/components/dashboard/shell/icons";

/**
 * EvoChart — Sprint F2/G2, reframed in Fase G (V2 principle 2).
 *
 * The `.card.evo-chart` from the design's `s-evolucion` screen, now a line
 * chart of the map's data COVERAGE over the last months: how much signal
 * backs the map (an honest data-availability metric), never a psychological
 * score. The legacy "Comprensión emocional" pct series had no defensible
 * interpretation and retired with the legacy layout.
 *
 * Behavior:
 *  - With ≥2 monthly snapshots that carry coverage we render the polyline +
 *    filled area + one dot per month + month labels along the x-axis.
 *  - Otherwise the snapshot-only fallback (single dot at the map's current
 *    coverage) with the "we'll fill in over time" copy. Pre-Fase-G snapshot
 *    rows have no coverage and are skipped rather than faked.
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
  // Fase G — only points with coverage count; pre-Fase-G rows are skipped.
  const usable = series
    .filter((p): p is typeof p & { coverage: number } => p.coverage != null)
    .map((p) => ({ monthIso: p.monthIso, value: p.coverage }));
  const currentCoverage = Math.round((map.coverage ?? 0) * 100);

  if (usable.length < 2) {
    return <SnapshotFallback value={currentCoverage} />;
  }

  const points = usable.map((p, i) => ({
    x: scaleX(i, usable.length),
    y: mapValueToY(p.value),
    value: p.value,
    monthIso: p.monthIso,
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const areaD = `${pathD} L ${points[points.length - 1]!.x} ${Y_BOTTOM} L ${points[0]!.x} ${Y_BOTTOM} Z`;
  const last = points[points.length - 1]!;
  const delta = usable[usable.length - 1]!.value - usable[0]!.value;

  return (
    <div className="card evo-chart">
      <span className="card-tag">Cobertura de tu mapa</span>
      <div className="ec-score">
        <b>{last.value}%</b>
        <span className="delta">
          <IconTrendUp size={14} />
          {delta > 0 ? `+${delta} pts` : `${delta} pts`} en{" "}
          {usable.length === 1 ? "1 mes" : `${usable.length} meses`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        style={{ maxHeight: 230 }}
        role="img"
        aria-label={`Cobertura del mapa · serie de ${usable.length} meses`}
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
          Cobertura del mapa al cierre del último mes: {last.value}%
        </title>
      </svg>
      <div className="ec-x">
        {usable.map((p) => (
          <span key={p.monthIso}>{formatMonth(p.monthIso)}</span>
        ))}
      </div>
      <p
        style={{
          margin: "12px 0 0",
          color: "var(--color-warm-500)",
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        La cobertura mide cuánta señal respalda tu mapa cada mes — cuánta
        información tienes, no cómo estás.
      </p>
    </div>
  );
}

function SnapshotFallback({ value }: { value: number }) {
  const y = mapValueToY(value);
  return (
    <div className="card evo-chart">
      <span className="card-tag">Cobertura de tu mapa</span>
      <div className="ec-score">
        <b>{value}%</b>
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
        aria-label={`Cobertura actual del mapa: ${value}%`}
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
        La cobertura mide cuánta señal respalda tu mapa — cuánta información
        tienes, no cómo estás. Cuando acumules más meses, aquí verás cómo se fue
        llenando.
      </p>
    </div>
  );
}

function scaleX(i: number, total: number): number {
  if (total <= 1) return VIEW_W - PAD_RIGHT;
  const usable = VIEW_W - PAD_LEFT - PAD_RIGHT;
  return PAD_LEFT + (i / (total - 1)) * usable;
}

function mapValueToY(value: number): number {
  const clamped = Math.max(0, Math.min(100, value));
  return Y_BOTTOM - (clamped / 100) * (Y_BOTTOM - Y_TOP);
}

function formatMonth(iso: string): string {
  // iso = YYYY-MM-DD → MM index in 0..11
  const monthIdx = Number(iso.slice(5, 7)) - 1;
  return MONTH_LABELS[monthIdx] ?? "—";
}
