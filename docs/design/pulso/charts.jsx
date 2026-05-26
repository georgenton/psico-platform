// pulso/charts.jsx — componentes de gráficos compactos en SVG.
// Sin libs. Todo SVG inline, escala con el contenedor.

const { useMemo } = React;

// ─────────────────────────────────────────────────────────────
// Helpers numéricos
// ─────────────────────────────────────────────────────────────
function maxOf(arr, key) {
  let m = 0;
  for (const v of arr) {
    const x = key ? v[key] : v;
    if (typeof x === "number" && x > m) m = x;
  }
  return m || 1;
}

function fmt(n) {
  if (n === null || n === undefined) return "—";
  if (typeof n !== "number") return n;
  if (Math.abs(n) >= 1000) return n.toLocaleString("es-419");
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(1);
}

function fmtPct(n, dec = 1) {
  if (n === null || n === undefined) return "—";
  return (dec === 0 ? Math.round(n) : n.toFixed(dec)) + "%";
}

function fmtDelta(d) {
  if (d === null || d === undefined) return "—";
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  return sign + Math.abs(d).toFixed(d % 1 === 0 ? 0 : 1) + "%";
}

// ─────────────────────────────────────────────────────────────
// Sparkline · curva mínima con dot al final
// ─────────────────────────────────────────────────────────────
function Sparkline({ values, height = 24, stroke = "#5e42c0", fill = "rgba(94,66,192,0.10)", strokeWidth = 1.5, showDot = true }) {
  const pathD = useMemo(() => {
    if (!values || values.length === 0) return { line: "", area: "", last: null };
    const w = 100;
    const h = 100;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = (max - min) || 1;
    const pad = 4;
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * (w - pad * 2) + pad;
      const y = h - ((v - min) / span) * (h - pad * 2) - pad;
      return [x, y];
    });
    const line = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" ");
    const area = line + " L" + pts[pts.length - 1][0].toFixed(2) + "," + h + " L" + pts[0][0].toFixed(2) + "," + h + " Z";
    return { line, area, last: pts[pts.length - 1] };
  }, [values]);

  return (
    <svg className="spark" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }}>
      <path d={pathD.area} fill={fill} stroke="none" />
      <path d={pathD.line} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {showDot && pathD.last && (
        <circle cx={pathD.last[0]} cy={pathD.last[1]} r="2.4" fill={stroke} stroke="#fff" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// LineDualChart · 30 días de signups vs activations + eventos
// ─────────────────────────────────────────────────────────────
function GrowthChart({ data, height = 180 }) {
  const W = 600;
  const H = 200;
  const pad = { t: 18, r: 10, b: 28, l: 28 };

  const max = Math.max(maxOf(data, "su"), maxOf(data, "act"));
  const x = (i) => pad.l + (i / (data.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);

  const pathSu = data.map((d, i) => (i === 0 ? "M" : "L") + x(i).toFixed(2) + "," + y(d.su).toFixed(2)).join(" ");
  const pathAct = data.map((d, i) => (i === 0 ? "M" : "L") + x(i).toFixed(2) + "," + y(d.act).toFixed(2)).join(" ");

  // y-axis ticks
  const ticks = [0, Math.ceil(max / 2), max];

  return (
    <svg className="gchart" viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none" style={{ height }}>
      {/* grid */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--p-grid)" strokeWidth="1" />
          <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontFamily="Geist Mono" fontSize="9" fill="var(--p-mute)">{t}</text>
        </g>
      ))}
      {/* x-axis labels every ~7 days */}
      {data.map((d, i) => {
        if (i % 5 !== 0 && i !== data.length - 1) return null;
        return (
          <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontFamily="Geist Mono" fontSize="9" fill="var(--p-mute)">{d.d}</text>
        );
      })}
      {/* events */}
      {data.map((d, i) => {
        if (!d.ev) return null;
        return (
          <g key={"ev-" + i}>
            <line x1={x(i)} x2={x(i)} y1={pad.t} y2={H - pad.b} stroke="var(--p-warn)" strokeDasharray="2 2" strokeWidth="1" opacity="0.7" />
            <circle cx={x(i)} cy={pad.t + 4} r="3" fill="var(--p-warn)" />
          </g>
        );
      })}
      {/* lines */}
      <path d={pathSu} fill="none" stroke="var(--p-brand)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d={pathAct} fill="none" stroke="#7fae76" strokeWidth="1.5" strokeLinejoin="round" strokeDasharray="3 2" />
      {/* dots on last point */}
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].su)} r="3" fill="var(--p-brand)" stroke="#fff" strokeWidth="1.5" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].act)} r="3" fill="#7fae76" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// MRR bar chart · 6 meses
// ─────────────────────────────────────────────────────────────
function MrrBars({ data, height = 90 }) {
  const W = 280;
  const H = 100;
  const pad = { t: 14, r: 4, b: 18, l: 4 };
  const max = maxOf(data, "mrr");
  const barW = (W - pad.l - pad.r) / data.length - 4;

  return (
    <svg className="gchart" viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none" style={{ height }}>
      {data.map((d, i) => {
        const x = pad.l + i * ((W - pad.l - pad.r) / data.length) + 2;
        const h = (d.mrr / max) * (H - pad.t - pad.b);
        const y = H - pad.b - h;
        const fill = d.current ? "var(--p-brand)" : "var(--p-brand-2)";
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} fill={fill} rx="1.5" />
            <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontFamily="Geist Mono" fontSize="9" fontWeight="600" fill="var(--p-ink)">${d.mrr}</text>
            <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontFamily="Geist Mono" fontSize="8.5" fill="var(--p-mute)">{d.m}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Donut · canales de adquisición
// ─────────────────────────────────────────────────────────────
const CHANNEL_COLORS = {
  organic:   "#5e42c0",
  instagram: "#8b71f5",
  referral:  "#7fae76",
  podcast:   "#a697ff",
  direct:    "#b8b3aa",
};

function Donut({ data, size = 140, thickness = 18, centerLabel, centerSub }) {
  const r = size / 2;
  const ri = r - thickness;
  const total = data.reduce((a, c) => a + c.pct, 0);
  let acc = 0;

  function arc(start, end, R, ir) {
    const a0 = (start / 100) * Math.PI * 2 - Math.PI / 2;
    const a1 = (end / 100) * Math.PI * 2 - Math.PI / 2;
    const x0 = r + R * Math.cos(a0);
    const y0 = r + R * Math.sin(a0);
    const x1 = r + R * Math.cos(a1);
    const y1 = r + R * Math.sin(a1);
    const x0i = r + ir * Math.cos(a0);
    const y0i = r + ir * Math.sin(a0);
    const x1i = r + ir * Math.cos(a1);
    const y1i = r + ir * Math.sin(a1);
    const large = end - start > 50 ? 1 : 0;
    return [
      "M", x0, y0,
      "A", R, R, 0, large, 1, x1, y1,
      "L", x1i, y1i,
      "A", ir, ir, 0, large, 0, x0i, y0i,
      "Z",
    ].join(" ");
  }

  return (
    <svg width={size} height={size} viewBox={"0 0 " + size + " " + size}>
      {data.map((d, i) => {
        const start = (acc / total) * 100;
        acc += d.pct;
        const end = (acc / total) * 100;
        return <path key={i} d={arc(start, end, r - 1, ri)} fill={CHANNEL_COLORS[d.id] || "#ccc"} />;
      })}
      <circle cx={r} cy={r} r={ri - 0.5} fill="#fff" />
      <text x={r} y={r - 2} textAnchor="middle" fontFamily="Geist" fontSize="18" fontWeight="700" fill="var(--p-ink)" style={{ letterSpacing: "-0.02em" }}>{centerLabel || ""}</text>
      <text x={r} y={r + 12} textAnchor="middle" fontFamily="Geist Mono" fontSize="9" fill="var(--p-mute)" letterSpacing="0.04em">{centerSub || ""}</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// HorizontalBars · drop-off por capítulo
// ─────────────────────────────────────────────────────────────
function ChapterDropoff({ chapters, height = 240 }) {
  const W = 500;
  const H = 28 + chapters.length * 22 + 18;
  const max = maxOf(chapters, "startedBy");
  const lblW = 240;
  const barW = W - lblW - 50;
  const rowH = 18;
  const pad = 4;

  return (
    <svg className="gchart" viewBox={"0 0 " + W + " " + H} preserveAspectRatio="xMinYMin meet" style={{ height: H }}>
      <text x={lblW} y={14} fontFamily="Geist Mono" fontSize="9" fill="var(--p-mute)" letterSpacing="0.10em">EMPEZARON</text>
      <text x={lblW + barW * 0.65} y={14} fontFamily="Geist Mono" fontSize="9" fill="var(--p-mute)" letterSpacing="0.10em">TERMINARON</text>

      {chapters.map((c, i) => {
        const y = 28 + i * 22;
        const wStart = (c.startedBy / max) * barW;
        const wDone  = (c.completedBy / max) * barW;
        return (
          <g key={c.n}>
            <text x={lblW - 8} y={y + 12} textAnchor="end" fontFamily="Geist" fontSize="11" fill="var(--p-ink-2)">{"Cap. " + c.n + " · " + c.title}</text>
            <rect x={lblW} y={y + 2} width={wStart} height={rowH - pad} fill="var(--p-line-2)" rx="2" />
            <rect x={lblW} y={y + 2} width={wDone} height={rowH - pad} fill={c.star ? "#7fae76" : "var(--p-brand-2)"} rx="2" />
            <text x={lblW + wStart + 6} y={y + 12} fontFamily="Geist Mono" fontSize="10" fill="var(--p-ink)" fontVariantNumeric="tabular-nums">{c.completedBy}/{c.startedBy}</text>
            {c.star && (
              <text x={lblW + 4} y={y + 12} fontFamily="Geist Mono" fontSize="8.5" fontWeight="600" fill="#fff" letterSpacing="0.10em">CAMPEÓN</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Funnel rows (no SVG — solo divs) — usado en console y briefing
// ─────────────────────────────────────────────────────────────
function FunnelRows({ funnel, compact = false }) {
  const max = funnel[0].count;
  return (
    <div className="funnel">
      {funnel.map((s, i) => {
        const widthPct = (s.count / max) * 100;
        const alert = s.alert === "break";
        const deltaCls = s.delta > 0 ? "up" : s.delta < 0 ? "down" : "flat";
        return (
          <React.Fragment key={i}>
            <div className="funnel-row">
              <div className="lbl">{s.step}</div>
              <div className="funnel-bar">
                <div className={"funnel-bar-fill" + (alert ? " alert" : "")} style={{ width: widthPct + "%" }} />
              </div>
              <div className="num">{fmt(s.count)}</div>
              <div className={"pass" + (alert ? " alert" : "")}>{i === 0 ? "100%" : fmtPct(s.passPct, s.passPct < 10 ? 1 : 0) + " ↓"}</div>
              <div className={"delta delta-i " + deltaCls}>{fmtDelta(s.delta)}</div>
            </div>
            {alert && !compact && (
              <div className="funnel-break">
                <span style={{ fontFamily: "Geist Mono", fontSize: 10, letterSpacing: "0.10em" }}>RUPTURA</span>
                <span>{s.break}</span>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Bars verticales (genérico) — usado en hora del día, día semana, etc.
// ─────────────────────────────────────────────────────────────
function VBars({ data, height = 64, fill = "var(--p-brand-2)", labelKey, valueKey }) {
  const W = 100;
  const H = 100;
  const max = maxOf(data, valueKey);
  const barW = W / data.length - 1;
  return (
    <svg viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none" style={{ display: "block", width: "100%", height }}>
      {data.map((d, i) => {
        const v = d[valueKey];
        const h = (v / max) * 80;
        const x = i * (W / data.length) + 0.5;
        const y = 90 - h;
        return <rect key={i} x={x} y={y} width={barW} height={h} fill={fill} rx="0.5" />;
      })}
    </svg>
  );
}

// Export al global
Object.assign(window, {
  Sparkline, GrowthChart, MrrBars, Donut, ChapterDropoff, FunnelRows, VBars,
  fmt, fmtPct, fmtDelta, CHANNEL_COLORS,
});
