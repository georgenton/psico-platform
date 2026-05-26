// pulso/mobile.jsx — vista móvil compañera. Para mirar de paso en el celular.

const { Sparkline, FunnelRows, MrrBars, fmt, fmtPct, fmtDelta, CHANNEL_COLORS } = window;

// ─────────────────────────────────────────────────────────────
// Compact KPI
// ─────────────────────────────────────────────────────────────
function MKpi({ k }) {
  return (
    <div className="pm-kpi">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="pm-kpi-lbl">{k.label}</div>
        <span className={"pm-kpi-delta " + (k.deltaDir || "flat")}>{k.deltaLabel}</span>
      </div>
      <div className="pm-kpi-val">
        {k.unit === "%" ? k.value.toFixed(1) + "%" : fmt(k.value)}
      </div>
      <div className="pm-kpi-sub">{k.sub}</div>
      <div style={{ height: 22, marginTop: 2 }}>
        <Sparkline values={k.spark} stroke={k.deltaDir === "down-bad" ? "#b91c1c" : "#5e42c0"} fill={k.deltaDir === "down-bad" ? "rgba(185,28,28,0.10)" : "rgba(94,66,192,0.10)"} />
      </div>
    </div>
  );
}

// Reuse kpi-delta classes from CSS
const __kpiDeltaCss = `
.pm-kpi-delta.up-good   { background: #e4efe0; color: #3a5e34; }
.pm-kpi-delta.down-bad  { background: #fef2f2; color: #b91c1c; }
.pm-kpi-delta.new       { background: #eeebff; color: #5e42c0; }
.pm-kpi-delta.flat      { background: #f5f4f1; color: #928d84; }
`;

// ─────────────────────────────────────────────────────────────
// Overview tab (mobile)
// ─────────────────────────────────────────────────────────────
function MobileOverview() {
  const d = window;
  return (
    <div className="pm-body">
      <style dangerouslySetInnerHTML={{ __html: __kpiDeltaCss }} />

      {/* 4 KPIs · 2x2 */}
      <div className="pm-kpis">
        {d.P_KPIS.map((k) => <MKpi k={k} key={k.id} />)}
      </div>

      {/* Highlights */}
      <div className="pm-card">
        <div className="pm-card-h">
          <div className="pm-card-eye">Lo que llama la atención</div>
          <div className="pm-card-meta">{d.P_HIGHLIGHTS.length} obs</div>
        </div>
        {d.P_HIGHLIGHTS.map((h, i) => (
          <div key={i} className={"hl " + h.kind} style={{ borderColor: "transparent", padding: "8px 0", background: "transparent", borderTop: i > 0 ? "1px dashed var(--p-line)" : "0", borderRadius: 0 }}>
            <div className="hl-dot" style={{ marginTop: 6 }} />
            <div className="hl-body">
              <div className="hl-head" style={{ fontSize: 12.5 }}>{h.headline}</div>
              <div className="hl-sub" style={{ fontSize: 11.5 }}>{h.body}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Mini funnel */}
      <div className="pm-card">
        <div className="pm-card-h">
          <div className="pm-card-eye">Funnel</div>
          <div className="pm-card-meta">8 pasos</div>
        </div>
        <FunnelMini funnel={d.P_FUNNEL} />
      </div>

      {/* Channels mini */}
      <div className="pm-card">
        <div className="pm-card-h">
          <div className="pm-card-eye">Canales</div>
          <div className="pm-card-meta">64 registros · 30 d</div>
        </div>
        {d.P_CHANNELS.map((c) => (
          <div className="ch-row" key={c.id} style={{ padding: "6px 0" }}>
            <span className="ch-swatch" style={{ background: CHANNEL_COLORS[c.id] }} />
            <div className="ch-row-l">
              <div className="ch-row-lbl">{c.label}</div>
              <div className="ch-row-meta">conv {fmtPct(c.conv)} · CAC ${c.cacUsd.toFixed(2)}</div>
            </div>
            <div className="ch-row-num">{c.signups}</div>
          </div>
        ))}
      </div>

      {/* Mobile vs Web - quick */}
      <div className="pm-card">
        <div className="pm-card-h">
          <div className="pm-card-eye">Móvil vs Web</div>
          <div className="pm-card-meta">Se complementan</div>
        </div>
        {d.P_DEVICE.slice(0, 5).map((row) => (
          <div className="dev-row" key={row.event} style={{ paddingBottom: 4 }}>
            <div className="dev-row-h">
              <span className="dev-row-lbl" style={{ fontSize: 11.5 }}>{row.event}</span>
              <span className="dev-row-meta">{row.mobile}% / {row.web}%</span>
            </div>
            <div className="dev-row-bar" style={{ height: 5 }}>
              <div className="dev-row-mobile" style={{ width: row.mobile + "%" }} />
              <div className="dev-row-web" style={{ width: row.web + "%" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Revenue mini */}
      <div className="pm-card">
        <div className="pm-card-h">
          <div className="pm-card-eye">MRR · 6 m</div>
          <div className="pm-card-meta">${d.P_REVENUE.series[d.P_REVENUE.series.length - 1].mrr} · runway {d.P_REVENUE.runwayMonths}m</div>
        </div>
        <MrrBars data={d.P_REVENUE.series} />
        <div style={{ font: "400 11px/1.4 var(--font-sans)", color: "var(--p-ink-3)", borderTop: "1px dashed var(--p-line)", paddingTop: 6 }}>
          {d.P_REVENUE.note}
        </div>
      </div>

      {/* Risk */}
      <div className="pm-card">
        <div className="pm-card-h">
          <div className="pm-card-eye text-warn">Riesgo · ética</div>
          <div className="pm-card-meta">{d.P_RISK.pending} pendiente</div>
        </div>
        <div style={{ font: "400 12px/1.5 var(--font-sans)", color: "var(--p-ink-2)" }}>
          {d.P_RISK.note}
        </div>
      </div>
    </div>
  );
}

// Mini funnel for mobile
function FunnelMini({ funnel }) {
  const max = funnel[0].count;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {funnel.map((s, i) => {
        const w = (s.count / max) * 100;
        const alert = s.alert === "break";
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 1fr 36px", gap: 8, alignItems: "center", fontSize: 11 }}>
            <div style={{ font: "500 11px/1.3 var(--font-sans)", color: "var(--p-ink-2)" }}>{s.step}</div>
            <div style={{ height: 14, background: "var(--p-bg)", borderRadius: 2, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, width: w + "%", background: alert ? "linear-gradient(90deg, #d97757, #b91c1c)" : "linear-gradient(90deg, var(--p-brand-2), var(--p-brand))", borderRadius: 2 }} />
            </div>
            <div style={{ textAlign: "right", font: "500 11px/1 var(--font-mono)", color: "var(--p-ink)" }}>{fmt(s.count)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Book tab (mobile)
// ─────────────────────────────────────────────────────────────
function MobileBook() {
  const d = window;
  const book = d.P_BOOKS[0];
  return (
    <div className="pm-body">
      <div className="pm-card">
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div className={"cv lg " + (book.cover === "cool" ? "cover-cool" : "cover-warm")} style={{ width: 44, height: 60 }}>
            <span className="cv-init">{book.title[0]}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "600 13.5px/1.3 var(--font-sans)", color: "var(--p-ink)" }}>{book.title}</div>
            <div style={{ font: "500 11px/1.3 var(--font-mono)", color: "var(--p-mute)", letterSpacing: "0.02em", marginTop: 3 }}>{book.author}</div>
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <span style={{ font: "600 10.5px/1 var(--font-mono)", color: "var(--p-ink)" }}>{book.startedBy} <span style={{ color: "var(--p-mute)" }}>empezaron</span></span>
              <span style={{ font: "600 10.5px/1 var(--font-mono)", color: "var(--p-ink)" }}>{book.completedBy} <span style={{ color: "var(--p-mute)" }}>cierre</span></span>
              <span style={{ font: "600 10.5px/1 var(--font-mono)", color: "var(--p-good)" }}>NPS {book.nps}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="pm-card">
        <div className="pm-card-h">
          <div className="pm-card-eye">Drop-off por capítulo</div>
          <div className="pm-card-meta">{book.chapters} caps</div>
        </div>
        {book.chap.map((c) => {
          const close = c.completedBy / c.startedBy * 100;
          const wTotal = (c.startedBy / book.startedBy) * 100;
          const wDone  = (c.completedBy / book.startedBy) * 100;
          return (
            <div key={c.n} style={{ display: "grid", gridTemplateColumns: "20px 1fr 44px", gap: 8, alignItems: "center", padding: "5px 0", borderBottom: "1px dashed var(--p-line)" }}>
              <div style={{ font: "600 10px/1 var(--font-mono)", color: "var(--p-mute)", letterSpacing: "0.04em" }}>{c.n.toString().padStart(2, "0")}</div>
              <div>
                <div style={{ font: "500 12px/1.2 var(--font-sans)", color: "var(--p-ink)", marginBottom: 3 }}>
                  {c.title} {c.star && <span style={{ marginLeft: 4, font: "600 9px/1 var(--font-mono)", letterSpacing: "0.10em", color: "#a06b00", background: "#fff7e0", padding: "1px 4px", borderRadius: 2 }}>★</span>}
                </div>
                <div style={{ height: 4, background: "var(--p-bg)", borderRadius: 2, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, width: wTotal + "%", background: "var(--p-line-2)", borderRadius: 2 }} />
                  <div style={{ position: "absolute", inset: 0, width: wDone + "%", background: c.star ? "#7fae76" : "var(--p-brand-2)", borderRadius: 2 }} />
                </div>
              </div>
              <div style={{ font: "500 10.5px/1 var(--font-mono)", color: close > 80 ? "var(--p-good)" : close > 60 ? "var(--p-ink)" : "var(--p-warn)", textAlign: "right" }}>{Math.round(close)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Funnel tab (mobile)
// ─────────────────────────────────────────────────────────────
function MobileFunnel() {
  const d = window;
  return (
    <div className="pm-body">
      <div className="pm-card">
        <div className="pm-card-h">
          <div className="pm-card-eye text-bad">Ruptura crítica</div>
          <div className="pm-card-meta">Cap. 1 → Cap. 2</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div className="pm-kpi-lbl">Terminan cap. 1</div>
            <div className="pm-kpi-val">106</div>
            <div className="pm-kpi-sub">de 204 abren</div>
          </div>
          <div>
            <div className="pm-kpi-lbl text-bad">Pasan al cap. 2</div>
            <div className="pm-kpi-val text-bad">41</div>
            <div className="pm-kpi-sub text-bad">−61% ruptura</div>
          </div>
        </div>
        <div style={{ font: "400 12px/1.5 var(--font-sans)", color: "var(--p-ink-3)", paddingTop: 4, borderTop: "1px dashed var(--p-line)" }}>
          Notificación push a 48 h podría recuperar ~30%. Es la palanca con más MRR potencial este mes.
        </div>
      </div>

      <div className="pm-card">
        <div className="pm-card-h">
          <div className="pm-card-eye">Funnel completo</div>
          <div className="pm-card-meta">vs mes anterior</div>
        </div>
        <FunnelMini funnel={d.P_FUNNEL} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Pre-launch tab (mobile) — Terapia + Podcast + Recursos
// ─────────────────────────────────────────────────────────────
function MobilePre() {
  const t = window.P_TERAPIA;
  const p = window.P_PODCAST;
  const r = window.P_RESOURCES;
  const greens = t.gates.filter((g) => g.status === "green").length;
  return (
    <div className="pm-body">
      {/* TERAPIA */}
      <div className="pm-card">
        <div className="pm-card-h">
          <div className="pm-card-eye text-warn">Terapia · pre-launch</div>
          <div className="pm-card-meta">{greens} de {t.gates.length} verdes</div>
        </div>
        <div style={{ font: "400 12px/1.5 var(--font-sans)", color: "var(--p-ink-3)" }}>
          {t.hypothesis}
        </div>
        {t.gates.map((g) => {
          const ratio = Math.min(1, g.current / g.target);
          const pct = Math.round(ratio * 100);
          const bgFill = g.status === "green" ? "#7fae76" : g.status === "yellow" ? "#e0b052" : "#d97757";
          const dotColor = g.status === "green" ? "var(--p-good)" : g.status === "yellow" ? "var(--p-warn)" : "var(--p-bad)";
          return (
            <div key={g.id} style={{ display: "grid", gridTemplateColumns: "12px 1fr auto", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px dashed var(--p-line)" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: dotColor }} />
              <div>
                <div style={{ font: "600 11.5px/1.2 var(--font-sans)", color: "var(--p-ink)" }}>{g.label}</div>
                <div className="bar" style={{ marginTop: 4 }}><div className="bar-fill" style={{ width: pct + "%", background: bgFill }} /></div>
              </div>
              <div style={{ font: "500 11px/1.2 var(--font-mono)", color: "var(--p-ink)", textAlign: "right", whiteSpace: "nowrap" }}>
                {g.unit === "USD" ? "$" + g.current : g.current}{g.unit === "%" ? "%" : ""}
                <span style={{ color: "var(--p-mute)" }}> /{g.unit === "USD" ? "$" + g.target : g.target}{g.unit === "%" ? "%" : ""}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* PODCAST */}
      <div className="pm-card">
        <div className="pm-card-h">
          <div className="pm-card-eye text-brand">Podcast · pre-pub</div>
          <div className="pm-card-meta">Lanza {p.plannedLaunch}</div>
        </div>
        <div style={{ font: "400 12px/1.5 var(--font-sans)", color: "var(--p-ink-3)" }}>
          {p.episodes.length} episodios en cola — 0 publicados todavía.
        </div>
        {p.episodes.map((e) => (
          <div key={e.n} style={{ display: "grid", gridTemplateColumns: "24px 1fr 60px", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px dashed var(--p-line)" }}>
            <span style={{ font: "700 11px/1 var(--font-mono)", color: "var(--p-mute)", letterSpacing: "0.04em" }}>{e.n.toString().padStart(2, "0")}</span>
            <div>
              <div style={{ font: "600 12px/1.2 var(--font-sans)", color: "var(--p-ink)" }}>{e.title}</div>
              <div style={{ font: "500 10.5px/1.3 var(--font-mono)", color: "var(--p-mute)", letterSpacing: "0.02em" }}>{e.author} · {e.durationMin} min</div>
            </div>
            <span style={{ font: "600 9px/1 var(--font-mono)", letterSpacing: "0.08em", padding: "2px 5px", borderRadius: 2, background: e.status === "draft" ? "var(--p-good-bg)" : e.status === "outline" ? "var(--p-bg)" : "var(--p-warn-bg)", color: e.status === "draft" ? "var(--p-good)" : e.status === "outline" ? "var(--p-mute)" : "var(--p-warn)", textAlign: "center" }}>
              {e.status === "draft" ? "BORR." : e.status === "outline" ? "ESBOZO" : "IDEA"}
            </span>
          </div>
        ))}
      </div>

      {/* RECURSOS */}
      <div className="pm-card">
        <div className="pm-card-h">
          <div className="pm-card-eye">Recursos · pre-pub</div>
          <div className="pm-card-meta">Lanza {r.plannedLaunch}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {r.formats.map((f) => (
            <div key={f.id} style={{ padding: "8px 10px", background: "var(--p-bg)", borderRadius: 6 }}>
              <div style={{ font: "600 11px/1.2 var(--font-sans)", color: "var(--p-ink)" }}>{f.label}</div>
              <div style={{ font: "500 10px/1 var(--font-mono)", color: "var(--p-mute)", letterSpacing: "0.04em", marginTop: 3 }}>{f.targetPerMonth}/mes objetivo</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Mobile root
// ─────────────────────────────────────────────────────────────
function MobilePulso({ view, setView }) {
  // Map detail views to tabs
  const tabFor = (v) => {
    if (v === "overview") return "overview";
    if (v === "book")     return "book";
    if (v === "funnel")   return "funnel";
    return "pre";
  };
  const activeTab = tabFor(view);

  const setTab = (tab) => {
    if (tab === "pre") setView("terapia");
    else setView(tab);
  };

  return (
    <div className="pm">
      <div className="pm-top">
        <div className="pm-top-l">Pulso · console</div>
        <div className="pm-top-h">Hola Jorge 👋</div>
        <div className="pm-top-meta">{window.P_META.period} · generado {window.P_META.generatedAt}</div>
      </div>

      <div className="pm-tabs">
        {[
          { id: "overview", label: "Overview" },
          { id: "book",     label: "Libro" },
          { id: "funnel",   label: "Funnel" },
          { id: "pre",      label: "Pre-launch" },
        ].map((t) => (
          <button
            key={t.id}
            className={"pm-tab" + (activeTab === t.id ? " is-on" : "")}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && <MobileOverview />}
      {activeTab === "book"     && <MobileBook />}
      {activeTab === "funnel"   && <MobileFunnel />}
      {activeTab === "pre"      && <MobilePre />}
    </div>
  );
}

Object.assign(window, { MobilePulso });
