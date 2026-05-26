// pulso/console.jsx — Variación A. Console (back-office denso).

const {
  Sparkline, GrowthChart, MrrBars, Donut, FunnelRows, ChapterDropoff,
  fmt, fmtPct, fmtDelta, CHANNEL_COLORS,
} = window;

// ─────────────────────────────────────────────────────────────
// Sidebar nav (compartida por todas las vistas en Console)
// ─────────────────────────────────────────────────────────────
function ConsoleSidebar({ view, setView }) {
  const items = [
    { group: "Resumen", links: [
      { id: "overview", label: "Overview", glyph: "◉", tag: "1" },
    ]},
    { group: "Activo · v1", links: [
      { id: "book",      label: "Contenido · libros",    glyph: "▤", tag: "2" },
      { id: "funnel",    label: "Funnel · adquisición",  glyph: "▾", tag: "1" },
    ]},
    { group: "Pre-publicación", links: [
      { id: "podcast",   label: "Podcast",                glyph: "▶", tag: "jul" },
      { id: "resources", label: "Recursos",               glyph: "✎", tag: "jun" },
    ]},
    { group: "Pre-launch", links: [
      { id: "terapia",   label: "Terapia",                glyph: "◐", tag: "off" },
    ]},
  ];

  return (
    <aside className="pl-side">
      <div className="pl-side-head">
        <div className="pl-wordmark">Psico Platform</div>
        <div className="pl-wordmark-sub">Pulso · console</div>
      </div>
      {items.map((g) => (
        <React.Fragment key={g.group}>
          <div className="pl-side-section">{g.group}</div>
          <div className="pl-side-nav">
            {g.links.map((l) => (
              <div
                key={l.id}
                className={"pl-side-link" + (view === l.id ? " is-on" : "")}
                onClick={() => !l.disabled && setView(l.id)}
                style={l.disabled ? { opacity: 0.45 } : null}
              >
                <span className="pl-side-glyph">{l.glyph}</span>
                <span>{l.label}</span>
                <span className="pl-side-tag">{l.tag}</span>
              </div>
            ))}
          </div>
        </React.Fragment>
      ))}
      <div className="pl-side-foot">
        <div className="pl-side-user">
          <div className="pl-side-avatar">J</div>
          <div style={{ minWidth: 0 }}>
            <div className="pl-side-name">{window.P_META.user.firstName}</div>
            <div className="pl-side-role">{window.P_META.user.role.toUpperCase()}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────
// Topbar
// ─────────────────────────────────────────────────────────────
function ConsoleTopbar({ view, setView }) {
  const labels = {
    overview:  ["Pulso", "Overview"],
    book:      ["Pulso", "Contenido", "Libros"],
    funnel:    ["Pulso", "Funnel"],
    terapia:   ["Pulso", "Terapia · pre-launch"],
    podcast:   ["Pulso", "Podcast · pre-publicación"],
    resources: ["Pulso", "Recursos · pre-publicación"],
  };
  const parts = labels[view] || labels.overview;
  return (
    <div className="pl-top">
      <div className="pl-crumbs">
        {parts.map((p, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">›</span>}
            <a onClick={() => i === 0 && setView("overview")}>{p}</a>
          </React.Fragment>
        ))}
      </div>
      <div className="pl-top-right">
        <span className="pl-top-pill">Live · datos sintéticos</span>
        <span>Generado {window.P_META.generatedAt}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Page header
// ─────────────────────────────────────────────────────────────
function PageHeader({ eye, title, sub, period, extra }) {
  return (
    <div className="pl-pgh">
      <div className="pl-pgh-l">
        {eye && <div className="pl-pgh-eye">{eye}</div>}
        <h1>{title}</h1>
        {sub && <div className="pl-pgh-sub">{sub}</div>}
      </div>
      <div className="pl-pgh-r">
        {period && (
          <div className="pl-period">
            <span>{period}</span>
            <span className="chev">▾</span>
          </div>
        )}
        {extra}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI tarjeta
// ─────────────────────────────────────────────────────────────
function KpiCard({ k }) {
  return (
    <div className="kpi">
      <div className="kpi-h">
        <div className="kpi-label">{k.label}</div>
        <div className={"kpi-delta " + (k.deltaDir || "flat")}>{k.deltaLabel}</div>
      </div>
      <div className="kpi-val">
        {k.unit === "%" ? k.value.toFixed(1) : fmt(k.value)}
        <span className="kpi-unit">{k.unit === "%" ? "%" : ""}</span>
      </div>
      <div className="kpi-sub">{k.sub}</div>
      <div className="kpi-spark">
        <Sparkline values={k.spark} stroke={k.deltaDir === "down-bad" ? "#b91c1c" : k.deltaDir === "new" ? "#8b71f5" : "#5e42c0"} fill={k.deltaDir === "down-bad" ? "rgba(185,28,28,0.10)" : "rgba(94,66,192,0.10)"} />
      </div>
      <div className="kpi-note">{k.note}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Highlight card
// ─────────────────────────────────────────────────────────────
function HighlightCard({ h, setView }) {
  return (
    <div className={"hl " + h.kind}>
      <div className="hl-dot" />
      <div className="hl-body">
        <div className="hl-head">{h.headline}</div>
        <div className="hl-sub">{h.body}</div>
        {h.link && (
          <a className="hl-link" onClick={() => h.link.view && setView(h.link.view)}>{h.link.label} →</a>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Card shell
// ─────────────────────────────────────────────────────────────
function Card({ eye, title, meta, actions, children, flush, foot, className }) {
  return (
    <div className={"pc " + (className || "")}>
      {(eye || title || meta || actions) && (
        <div className="pc-h">
          <div className="pc-h-l">
            {eye && <div className="pc-h-eye">{eye}</div>}
            {title && <div className="pc-h-title">{title}</div>}
          </div>
          {actions ? <div className="pc-h-actions">{actions}</div> : meta && <div className="pc-h-meta">{meta}</div>}
        </div>
      )}
      <div className={"pc-body" + (flush ? " flush" : "")}>{children}</div>
      {foot && <div className="pc-foot">{foot}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// OVERVIEW
// ─────────────────────────────────────────────────────────────
function ConsoleOverview({ setView }) {
  const d = window;
  return (
    <div className="pl-page">
      <div className="pl-page-inner">
        <PageHeader
          eye="Pulso · esta es la foto del mes"
          title="Overview"
          sub={"Activos, conversión y terapia en una sola vista. Datos del " + d.P_META.period.toLowerCase().replace("30 días · ", "") + "."}
          period={d.P_META.period}
        />

        {/* KPIs */}
        <div className="pl-kpis">
          {d.P_KPIS.map((k) => <KpiCard k={k} key={k.id} />)}
        </div>

        {/* Highlights */}
        <Card eye="Lo que llama la atención" title="" meta={d.P_HIGHLIGHTS.length + " observaciones"}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {d.P_HIGHLIGHTS.map((h, i) => <HighlightCard key={i} h={h} setView={setView} />)}
          </div>
        </Card>

        {/* Growth + Channels */}
        <div className="pl-grid cols-12">
          <div className="span-8">
            <Card
              eye="Crecimiento · 30 d"
              title="Registros y activaciones por día"
              actions={
                <>
                  <button className="pc-h-tab is-on">DIARIO</button>
                  <button className="pc-h-tab">SEMANAL</button>
                </>
              }
            >
              <GrowthChart data={d.P_GROWTH.series} />
              <div style={{ display: "flex", gap: 16, paddingTop: 4 }}>
                <span style={{ font: "500 11px/1 var(--font-mono)", color: "var(--p-mute)", letterSpacing: "0.04em", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 12, height: 2, background: "#5e42c0", borderRadius: 1 }} /> Registros (su)
                </span>
                <span style={{ font: "500 11px/1 var(--font-mono)", color: "var(--p-mute)", letterSpacing: "0.04em", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 12, height: 2, background: "#7fae76", borderRadius: 1, borderTop: "1px dashed #7fae76" }} /> Activaciones (terminan onboarding)
                </span>
                <span style={{ font: "500 11px/1 var(--font-mono)", color: "var(--p-warn)", letterSpacing: "0.04em", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, background: "var(--p-warn)", borderRadius: 999 }} /> Eventos
                </span>
              </div>
            </Card>
          </div>
          <div className="span-4">
            <Card eye="Canales · 30 d" title="Cómo llegaron" meta="64 registros">
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 4 }}>
                <Donut data={d.P_CHANNELS} centerLabel="64" centerSub="REGISTROS" />
              </div>
              <div style={{ paddingTop: 6 }}>
                {d.P_CHANNELS.map((c) => (
                  <div className="ch-row" key={c.id}>
                    <span className="ch-swatch" style={{ background: CHANNEL_COLORS[c.id] }} />
                    <div className="ch-row-l">
                      <div className="ch-row-lbl">{c.label}</div>
                      <div className="ch-row-meta">{c.signups} · conv {fmtPct(c.conv)} · CAC {c.cacUsd ? "$" + c.cacUsd.toFixed(2) : "$0"}</div>
                    </div>
                    <div className="ch-row-num">{c.pct}%</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* Funnel + Features */}
        <div className="pl-grid cols-12">
          <div className="span-7">
            <Card
              eye="Funnel · landing → Pro"
              title="Dónde se rompe"
              meta="Compara con mes anterior"
              actions={<button className="pl-btn" onClick={() => setView("funnel")}>Ver detalle →</button>}
            >
              <FunnelRows funnel={d.P_FUNNEL} />
            </Card>
          </div>
          <div className="span-5">
            <Card eye="Funcionalidades · 30 d" title="Qué usa la gente" meta="Por minutos">
              <div style={{ display: "grid", gridTemplateColumns: "22px 1fr 70px 80px 70px 50px", gap: 12, padding: "0 0 4px", borderBottom: "1px solid var(--p-line)", font: "600 9.5px/1 var(--font-mono)", letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--p-mute)" }}>
                <span></span><span>Feature</span><span style={{ textAlign: "right" }}>Usuarios</span><span style={{ textAlign: "right" }}>Minutos</span><span style={{ textAlign: "right" }}>Ret. D7</span><span style={{ textAlign: "right" }}>30d</span>
              </div>
              {d.P_FEATURES.map((f) => (
                <div className="ft-row" key={f.id}>
                  <span className="ft-glyph">{f.icon}</span>
                  <span className="ft-name">{f.label}</span>
                  <span className="ft-num">{f.users}</span>
                  <span className="ft-num">{f.minutes.toLocaleString("es-419")}</span>
                  <span className="ft-num">{fmtPct(f.retentionD7, 0)}</span>
                  <span className={"ft-trend " + f.trend}>{f.trend === "up" ? "↑" : f.trend === "down" ? "↓" : f.trend === "new" ? "★" : "·"}{f.trendPct !== null ? " " + Math.abs(f.trendPct) + "%" : ""}</span>
                </div>
              ))}
            </Card>
          </div>
        </div>

        {/* Device + Terapia Pre-launch */}
        <div className="pl-grid cols-12">
          <div className="span-6">
            <Card eye="Móvil vs Web · ¿compiten o se complementan?" title="" meta="">
              <div className="dev-legend" style={{ paddingBottom: 4 }}>
                <span><span className="dev-legend-dot" style={{ background: "var(--p-brand-2)" }} />Móvil</span>
                <span><span className="dev-legend-dot" style={{ background: "#b8b3aa" }} />Web</span>
                <span style={{ marginLeft: "auto", color: "var(--p-ink-3)" }}>Se complementan — no compiten.</span>
              </div>
              {d.P_DEVICE.map((row) => (
                <div className="dev-row" key={row.event}>
                  <div className="dev-row-h">
                    <span className="dev-row-lbl">{row.event}</span>
                    <span className="dev-row-meta">{row.mobile}% / {row.web}%</span>
                  </div>
                  <div className="dev-row-bar">
                    <div className="dev-row-mobile" style={{ width: row.mobile + "%" }} />
                    <div className="dev-row-web" style={{ width: row.web + "%" }} />
                  </div>
                  <div className="dev-row-note">{row.note}</div>
                </div>
              ))}
            </Card>
          </div>
          <div className="span-6">
            <TerapiaPrelaunchCompact setView={setView} />
          </div>
        </div>

        {/* Revenue + Cohorts (compact) */}
        <div className="pl-grid cols-12">
          <div className="span-5">
            <Card eye="Ingresos · 6 meses" title="MRR" meta={"$" + d.P_REVENUE.series[d.P_REVENUE.series.length - 1].mrr + " · " + d.P_REVENUE.runwayMonths + " m de runway"}>
              <MrrBars data={d.P_REVENUE.series} />
              <div style={{ font: "400 11.5px/1.45 var(--font-sans)", color: "var(--p-ink-3)", borderTop: "1px dashed var(--p-line)", paddingTop: 8 }}>
                {d.P_REVENUE.note}
              </div>
            </Card>
          </div>
          <div className="span-7">
            <Card eye="Retención por cohorte" title="" meta="Semanas tras registro">
              <CohortGrid data={d.P_GROWTH.cohorts} />
            </Card>
          </div>
        </div>

        {/* Risk */}
        <Card eye="Señales de riesgo" title="" meta="Ética · uso del producto">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <div>
              <div className="kpi-label" style={{ paddingBottom: 4 }}>Banderas activas</div>
              <div className="kpi-val">{d.P_RISK.flagged}</div>
              <div className="kpi-sub">{d.P_RISK.pending} pendiente · {d.P_RISK.resolved} resueltas</div>
            </div>
            <div style={{ gridColumn: "span 3", padding: "8px 0" }}>
              <div className="kpi-label">Nota de la semana</div>
              <div style={{ font: "400 13px/1.5 var(--font-sans)", color: "var(--p-ink-2)", marginTop: 6 }}>
                {d.P_RISK.note}
              </div>
              <div style={{ font: "500 11px/1.4 var(--font-mono)", color: "var(--p-mute)", letterSpacing: "0.04em", marginTop: 6 }}>
                Protocolo activo · derivación a línea local 24/7 · contacto a terapeuta de guardia.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Cohort heatmap
// ─────────────────────────────────────────────────────────────
function CohortGrid({ data }) {
  function heat(n, size) {
    if (n === null || n === undefined) return "empty";
    const p = n / size;
    if (p === 0) return "heat-0";
    if (p < 0.3) return "heat-1";
    if (p < 0.5) return "heat-2";
    if (p < 0.7) return "heat-3";
    return "heat-4";
  }
  function pct(n, size) {
    if (n === null || n === undefined) return "—";
    return Math.round((n / size) * 100) + "%";
  }
  return (
    <div className="coh-grid">
      <div className="cell h left">COHORTE</div>
      <div className="cell h">N</div>
      <div className="cell h">SEM 1</div>
      <div className="cell h">SEM 2</div>
      <div className="cell h">SEM 3</div>
      <div className="cell h">SEM 4</div>
      {data.map((c, i) => (
        <React.Fragment key={i}>
          <div className="cell l">{c.cohort}</div>
          <div className="cell n">{c.size}</div>
          {[c.w1, c.w2, c.w3, c.w4].map((v, j) => (
            <div key={j} className={"cell n " + heat(v, c.size)}>
              {v === null || v === undefined ? "—" : v}
              {v !== null && v !== undefined && <span className="pct">{pct(v, c.size)}</span>}
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DETAIL · LIBRO
// ─────────────────────────────────────────────────────────────
function ConsoleBook({ setView }) {
  const d = window;
  const [bookId, setBookId] = React.useState("emociones");
  const book = d.P_BOOKS.find((b) => b.id === bookId);

  return (
    <div className="pl-page">
      <div className="pl-page-inner">
        <PageHeader
          eye="Contenido · libros"
          title="Cómo se está leyendo"
          sub="Para decidir qué capítulo promocionar, qué autor pagar mejor, y dónde la lectura se rompe."
          period={d.P_META.period}
          extra={<button className="pl-btn" onClick={() => setView("overview")}>← Overview</button>}
        />

        {/* Selector */}
        <div style={{ display: "flex", gap: 8 }}>
          {d.P_BOOKS.map((b) => (
            <button
              key={b.id}
              onClick={() => setBookId(b.id)}
              className="pc"
              style={{
                padding: "10px 14px",
                display: "flex", gap: 12, alignItems: "center",
                borderColor: bookId === b.id ? "var(--p-brand)" : "var(--p-line)",
                background: bookId === b.id ? "var(--p-brand-bg)" : "#fff",
                cursor: "pointer", borderRadius: 8,
                font: "inherit",
              }}
            >
              <div className={"cv " + (b.cover === "cool" ? "cover-cool" : "cover-warm")}>
                <span className="cv-init">{b.title[0]}</span>
              </div>
              <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ font: "600 13px/1.2 var(--font-sans)", color: "var(--p-ink)" }}>{b.title}</div>
                <div style={{ font: "500 11px/1 var(--font-mono)", color: "var(--p-mute)", letterSpacing: "0.04em" }}>
                  {b.author} · {b.chapters} caps · {b.startedBy} lectores
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Top stats strip */}
        <div className="pl-kpis">
          <div className="kpi">
            <div className="kpi-h">
              <div className="kpi-label">Lo empezaron</div>
              <div className="kpi-delta up-good">+{book.pickup7d} · 7 d</div>
            </div>
            <div className="kpi-val">{book.startedBy}</div>
            <div className="kpi-sub">{fmtPct((book.startedBy / d.P_META.totals.users) * 100, 0)} de la base</div>
          </div>
          <div className="kpi">
            <div className="kpi-h">
              <div className="kpi-label">Lo terminaron</div>
              <div className="kpi-delta flat">{book.completionPct.toFixed(1)}%</div>
            </div>
            <div className="kpi-val">{book.completedBy}</div>
            <div className="kpi-sub">Media industria ≈ 18%</div>
          </div>
          <div className="kpi">
            <div className="kpi-h">
              <div className="kpi-label">Minutos / cap.</div>
              <div className="kpi-delta flat">prom</div>
            </div>
            <div className="kpi-val">{book.avgMinPerChapter.toFixed(1)}</div>
            <div className="kpi-sub">Total · {book.totalMinutes.toLocaleString("es-419")} min leídos</div>
          </div>
          <div className="kpi">
            <div className="kpi-h">
              <div className="kpi-label">Favoritos · cap.</div>
              <div className="kpi-delta up-good">NPS {book.nps.toFixed(1)}</div>
            </div>
            <div className="kpi-val">{book.favorites}</div>
            <div className="kpi-sub">{book.sharedToTx} compartieron con terapeuta</div>
          </div>
        </div>

        {/* Drop-off chart */}
        <Card eye="Drop-off por capítulo" title="Quién empieza vs. quién termina" meta="Capítulos del libro">
          <ChapterDropoff chapters={book.chap} />
          <div style={{ font: "400 12px/1.5 var(--font-sans)", color: "var(--p-ink-3)", borderTop: "1px dashed var(--p-line)", paddingTop: 10, marginTop: 6 }}>
            <b style={{ color: "var(--p-ink)" }}>Lectura:</b> el campeón es <b style={{ color: "var(--p-good)" }}>Cap. 5 · {book.chap[4].title}</b> ({book.chap[4].completedBy} de {book.chap[4].startedBy} terminan). Vale entender qué hace diferente — y promocionarlo como punto de entrada al libro.
          </div>
        </Card>

        {/* Detailed table */}
        <Card eye="Detalle por capítulo" title="" meta={book.chapters + " capítulos"}>
          <div style={{ overflowX: "auto" }}>
            <table className="pt">
              <thead>
                <tr>
                  <th>Cap.</th>
                  <th>Título</th>
                  <th className="num">Empezaron</th>
                  <th className="num">Terminaron</th>
                  <th className="num">Cierre</th>
                  <th className="num">Min / lector</th>
                  <th className="num">Drop-off</th>
                  <th className="num">Favorito</th>
                </tr>
              </thead>
              <tbody>
                {book.chap.map((c) => {
                  const closePct = c.completedBy / c.startedBy * 100;
                  const dropHigh = c.drop >= 25;
                  return (
                    <tr key={c.n}>
                      <td className="muted">{c.n.toString().padStart(2, "0")}</td>
                      <td className="strong">
                        {c.title}
                        {c.star && <span className="pt-row-flag star" style={{ marginLeft: 8 }}>CAMPEÓN</span>}
                      </td>
                      <td className="num">{c.startedBy}</td>
                      <td className="num">{c.completedBy}</td>
                      <td className="num" style={{ color: closePct > 80 ? "var(--p-good)" : closePct > 60 ? "var(--p-ink)" : "var(--p-warn)" }}>{fmtPct(closePct, 0)}</td>
                      <td className="num">{c.avgMin}</td>
                      <td className="num" style={{ color: dropHigh ? "var(--p-bad)" : "var(--p-ink-2)" }}>{c.drop}%</td>
                      <td className="num">{c.favPct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DETAIL · FUNNEL
// ─────────────────────────────────────────────────────────────
function ConsoleFunnel({ setView }) {
  const d = window;
  return (
    <div className="pl-page">
      <div className="pl-page-inner">
        <PageHeader
          eye="Funnel · adquisición y onboarding"
          title="Dónde pierdes gente"
          sub="Cada salto es una decisión de producto. El paso con la mayor pérdida define la siguiente semana de trabajo."
          period={d.P_META.period}
          extra={<button className="pl-btn" onClick={() => setView("overview")}>← Overview</button>}
        />

        <Card eye="Funnel completo" title="Landing → Pago" meta="8 pasos">
          <FunnelRows funnel={d.P_FUNNEL} />
        </Card>

        <div className="pl-grid cols-12">
          <div className="span-7">
            <Card eye="Lectura · cap. 1 → cap. 2" title="El punto de mayor fricción" meta="Único alert del funnel">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
                <div style={{ padding: "10px 14px", borderRight: "1px solid var(--p-line)" }}>
                  <div className="kpi-label">Terminan cap. 1</div>
                  <div className="kpi-val" style={{ marginTop: 6 }}>106</div>
                  <div className="kpi-sub">de 204 que lo abrieron</div>
                </div>
                <div style={{ padding: "10px 14px", borderRight: "1px solid var(--p-line)", background: "var(--p-bad-bg)" }}>
                  <div className="kpi-label" style={{ color: "var(--p-bad)" }}>Pasan al cap. 2</div>
                  <div className="kpi-val" style={{ marginTop: 6, color: "var(--p-bad)" }}>41</div>
                  <div className="kpi-sub" style={{ color: "var(--p-bad)" }}>−61% · ruptura</div>
                </div>
                <div style={{ padding: "10px 14px" }}>
                  <div className="kpi-label">Mediana de espera</div>
                  <div className="kpi-val" style={{ marginTop: 6 }}>3.4 d</div>
                  <div className="kpi-sub">entre cap. 1 y cap. 2</div>
                </div>
              </div>
              <div style={{ font: "400 12.5px/1.55 var(--font-sans)", color: "var(--p-ink-2)", paddingTop: 4 }}>
                <b style={{ color: "var(--p-ink)" }}>Hipótesis a probar (en orden):</b><br />
                · El cap. 1 no termina con una pregunta o cliffhanger — el último párrafo cierra, no abre.<br />
                · Falta un recordatorio entre día 1 y día 4. Notificación push tras 48 h podría recuperar.<br />
                · El botón "Siguiente capítulo" se confunde con "Marcar como leído" en móvil.
              </div>
            </Card>
          </div>
          <div className="span-5">
            <Card eye="Conversión por canal" title="Qué fuente trae gente que paga" meta="CAC en USD">
              <table className="pt" style={{ marginTop: -4 }}>
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th className="num">Registros</th>
                    <th className="num">Conv</th>
                    <th className="num">CAC</th>
                  </tr>
                </thead>
                <tbody>
                  {d.P_CHANNELS.map((c) => (
                    <tr key={c.id}>
                      <td className="strong">
                        <span className="ch-swatch" style={{ background: CHANNEL_COLORS[c.id], display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />
                        {c.label}
                      </td>
                      <td className="num">{c.signups}</td>
                      <td className="num" style={{ color: c.conv > 10 ? "var(--p-good)" : c.conv < 5 ? "var(--p-warn)" : "var(--p-ink)" }}>{fmtPct(c.conv)}</td>
                      <td className="num">{c.cacUsd ? "$" + c.cacUsd.toFixed(2) : "$0"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ font: "400 11.5px/1.45 var(--font-sans)", color: "var(--p-ink-3)", borderTop: "1px dashed var(--p-line)", paddingTop: 8, marginTop: 4 }}>
                <b style={{ color: "var(--p-ink)" }}>Decisión:</b> recomendación + orgánico son tus apuestas. Instagram es caro y convierte la mitad — bajar o pausar.
              </div>
            </Card>
          </div>
        </div>

        <Card eye="Cohortes · retención" title="¿Las nuevas cohortes retienen mejor o peor?" meta="Semanas tras registro">
          <CohortGrid data={d.P_GROWTH.cohorts} />
          <div style={{ font: "400 12px/1.5 var(--font-sans)", color: "var(--p-ink-3)", borderTop: "1px dashed var(--p-line)", paddingTop: 10 }}>
            Las cohortes de abril mantienen ~65% en sem. 1 vs ~72% de las de marzo. La gente de Instagram está retornando peor — vale revisar a quién está atrayendo el anuncio.
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TERAPIA · pre-launch (compact card on overview)
// ─────────────────────────────────────────────────────────────
function GateRow({ g }) {
  const ratio = Math.min(1, g.current / g.target);
  const pct = Math.round(ratio * 100);
  const color = g.status === "green" ? "var(--p-good)" : g.status === "yellow" ? "var(--p-warn)" : "var(--p-bad)";
  const bgFill = g.status === "green" ? "#7fae76" : g.status === "yellow" ? "#e0b052" : "#d97757";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "16px 1fr 110px 90px", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px dashed var(--p-line)" }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: color, display: "inline-block" }} />
      <div>
        <div style={{ font: "600 12.5px/1.2 var(--font-sans)", color: "var(--p-ink)" }}>{g.label}</div>
        <div style={{ font: "400 11px/1.4 var(--font-sans)", color: "var(--p-ink-3)" }}>{g.note}</div>
      </div>
      <div className="bar"><div className="bar-fill" style={{ width: pct + "%", background: bgFill }} /></div>
      <div style={{ textAlign: "right", font: "500 11.5px/1.2 var(--font-mono)", color: "var(--p-ink)", letterSpacing: "0.02em" }}>
        <span style={{ fontWeight: 600 }}>{g.unit === "USD" ? "$" + g.current : g.current}{g.unit === "%" ? "%" : g.unit === "/10" ? "/10" : ""}</span>
        <span style={{ color: "var(--p-mute)" }}> / {g.unit === "USD" ? "$" + g.target : g.target}{g.unit === "%" ? "%" : g.unit === "/10" ? "" : ""}</span>
      </div>
    </div>
  );
}

function TerapiaPrelaunchCompact({ setView }) {
  const t = window.P_TERAPIA;
  const greens = t.gates.filter((g) => g.status === "green").length;
  const yellows = t.gates.filter((g) => g.status === "yellow").length;
  const reds = t.gates.filter((g) => g.status === "red").length;
  return (
    <Card
      eye="Terapia · pre-launch"
      title=""
      actions={<button className="pl-btn" onClick={() => setView("terapia")}>Ver gates →</button>}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "4px 0 8px", borderBottom: "1px solid var(--p-line)" }}>
        <div>
          <div style={{ font: "600 13px/1.2 var(--font-sans)", color: "var(--p-ink)" }}>
            Apagado — esperando 3 gates en verde
          </div>
          <div style={{ font: "400 11.5px/1.45 var(--font-sans)", color: "var(--p-ink-3)", marginTop: 3 }}>
            v1 = solo libros. Encender Terapia cuando los libros estén probando producto.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ font: "600 10px/1 var(--font-mono)", letterSpacing: "0.06em", color: "var(--p-good)", background: "var(--p-good-bg)", padding: "4px 6px", borderRadius: 3 }}>● {greens}</span>
          <span style={{ font: "600 10px/1 var(--font-mono)", letterSpacing: "0.06em", color: "var(--p-warn)", background: "#fef9e7", padding: "4px 6px", borderRadius: 3 }}>● {yellows}</span>
          <span style={{ font: "600 10px/1 var(--font-mono)", letterSpacing: "0.06em", color: "var(--p-bad)", background: "var(--p-bad-bg)", padding: "4px 6px", borderRadius: 3 }}>● {reds}</span>
        </div>
      </div>
      <div>
        {t.gates.slice(0, 3).map((g) => <GateRow key={g.id} g={g} />)}
      </div>
      <div style={{ font: "400 11.5px/1.45 var(--font-sans)", color: "var(--p-ink-3)", marginTop: 6 }}>
        +{t.gates.length - 3} más en la vista completa.
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// VIEW · TERAPIA pre-launch
// ─────────────────────────────────────────────────────────────
function ConsoleTerapia({ setView }) {
  const t = window.P_TERAPIA;
  const allGreen = t.gates.every((g) => g.status === "green");
  return (
    <div className="pl-page">
      <div className="pl-page-inner">
        <PageHeader
          eye="Terapia · pre-launch"
          title={allGreen ? "Listo para encender" : "Apagado por diseño"}
          sub="Aquí están los gates que tienen que estar en verde antes de activar Terapia. Tres ya están — los otros tres son los que mueves esta etapa."
          period={"Decidido " + t.decidedAt}
          extra={<button className="pl-btn" onClick={() => setView("overview")}>← Overview</button>}
        />

        {/* Statline */}
        <div className="pl-kpis">
          <div className="kpi">
            <div className="kpi-h">
              <div className="kpi-label">Estado</div>
              <div className="kpi-delta flat">v1 · solo libros</div>
            </div>
            <div className="kpi-val" style={{ color: "var(--p-warn)" }}>OFF</div>
            <div className="kpi-sub">Encender con todos los gates en verde</div>
          </div>
          <div className="kpi">
            <div className="kpi-h">
              <div className="kpi-label">Gates en verde</div>
              <div className="kpi-delta up-good">{t.gates.filter((g) => g.status === "green").length} de {t.gates.length}</div>
            </div>
            <div className="kpi-val">{t.gates.filter((g) => g.status === "green").length}/{t.gates.length}</div>
            <div className="kpi-sub">{t.gates.filter((g) => g.status === "yellow").length} amarillo · {t.gates.filter((g) => g.status === "red").length} rojo</div>
          </div>
          <div className="kpi">
            <div className="kpi-h">
              <div className="kpi-label">Costo si lanzas hoy</div>
              <div className="kpi-delta down-bad">−${t.ifLaunched.expectedAddCogs - 84}/mes</div>
            </div>
            <div className="kpi-val">${t.ifLaunched.expectedAddCogs}</div>
            <div className="kpi-sub">COGS extra · −$236 MRR neto</div>
          </div>
          <div className="kpi">
            <div className="kpi-h">
              <div className="kpi-label">Plan piloto</div>
              <div className="kpi-delta new">Diseñado</div>
            </div>
            <div className="kpi-val">{t.pilotPlan.users}</div>
            <div className="kpi-sub">usuarios · {t.pilotPlan.therapists} terapeutas · {t.pilotPlan.country}</div>
          </div>
        </div>

        {/* Hipótesis */}
        <Card eye="Hipótesis" title="" meta="Por qué esperar">
          <div style={{ font: "italic 500 14px/1.55 'Newsreader', Georgia, serif", color: "var(--p-ink-2)", borderLeft: "2px solid var(--p-brand-bg)", paddingLeft: 12 }}>
            {t.hypothesis}
          </div>
        </Card>

        {/* Gates table */}
        <Card eye="Gates · enciende cuando todos estén verdes" title="" meta={t.gates.length + " gates"}>
          {t.gates.map((g) => <GateRow key={g.id} g={g} />)}
        </Card>

        {/* What we'll track */}
        <div className="pl-grid cols-12">
          <div className="span-7">
            <Card eye="El día que encendamos · esto medirá el dashboard" title="">
              <ul style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 6 }}>
                {t.willTrack.map((w, i) => (
                  <li key={i} style={{ font: "400 13px/1.55 var(--font-sans)", color: "var(--p-ink-2)" }}>{w}</li>
                ))}
              </ul>
            </Card>
          </div>
          <div className="span-5">
            <Card eye="Plan piloto · primer mes" title="Ecuador · 50 usuarios · 2 terapeutas">
              <div style={{ font: "400 13px/1.55 var(--font-sans)", color: "var(--p-ink-2)" }}>
                <p style={{ marginBottom: 8 }}><b>Reservas esperadas:</b> {t.ifLaunched.expectedFirstMonth} en 30 días.</p>
                <p style={{ marginBottom: 8 }}><b>Rebook objetivo:</b> ≥{t.ifLaunched.expectedRebook}%. Por debajo de eso pausamos y revisamos.</p>
                <p style={{ marginBottom: 8 }}><b>Salida:</b> si no llegamos a 8 reservas y 50% de rebook en 60 días, pausamos. Mejor recortar que sostener algo que no funciona.</p>
                <p style={{ font: "italic 500 12.5px/1.5 'Newsreader', Georgia, serif", color: "var(--p-ink-3)", borderLeft: "2px solid var(--p-warn)", paddingLeft: 10, marginTop: 10 }}>
                  {t.ifLaunched.note}
                </p>
              </div>
            </Card>
          </div>
        </div>

        {/* Forzar lanzamiento — botón intencional */}
        <Card eye="Botón rojo" title="" meta="Solo si los gates te están mintiendo">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ font: "400 12.5px/1.5 var(--font-sans)", color: "var(--p-ink-3)", maxWidth: "60ch" }}>
              Si tienes información del mundo real que invalida los gates (un cliente B2B que quiere Terapia ya, un terapeuta ancla que se va a otra plataforma), puedes forzar. Pero <b style={{ color: "var(--p-ink)" }}>marca por qué</b> — es la única forma de aprender de la decisión.
            </div>
            <button className="pl-btn" style={{ borderColor: "var(--p-bad)", color: "var(--p-bad)" }}>
              Solicitar override →
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VIEW · PODCAST pre-publicación
// ─────────────────────────────────────────────────────────────
function ConsolePodcast({ setView }) {
  const p = window.P_PODCAST;
  return (
    <div className="pl-page">
      <div className="pl-page-inner">
        <PageHeader
          eye="Podcast · pre-publicación"
          title="Tu canal propio — listo el dashboard, falta producir"
          sub="Aquí está el espacio donde van a vivir los episodios. Datos mock para diseñar el dashboard antes de publicar."
          period={"Lanza " + p.plannedLaunch}
          extra={<button className="pl-btn" onClick={() => setView("overview")}>← Overview</button>}
        />

        {/* Statline */}
        <div className="pl-kpis">
          <div className="kpi">
            <div className="kpi-h">
              <div className="kpi-label">Estado</div>
              <div className="kpi-delta new">Pre</div>
            </div>
            <div className="kpi-val" style={{ color: "var(--p-brand)" }}>0/4</div>
            <div className="kpi-sub">episodios listos para publicar</div>
          </div>
          <div className="kpi">
            <div className="kpi-h">
              <div className="kpi-label">Cadencia objetivo</div>
              <div className="kpi-delta flat">semanal</div>
            </div>
            <div className="kpi-val">1×</div>
            <div className="kpi-sub">{p.cadenceTarget}</div>
          </div>
          <div className="kpi">
            <div className="kpi-h">
              <div className="kpi-label">Costo hosting</div>
              <div className="kpi-delta up-good">$0</div>
            </div>
            <div className="kpi-val">$0</div>
            <div className="kpi-sub">Spotify for Podcasters</div>
          </div>
          <div className="kpi">
            <div className="kpi-h">
              <div className="kpi-label">Conv. esperada</div>
              <div className="kpi-delta flat">benchmark</div>
            </div>
            <div className="kpi-val">9%</div>
            <div className="kpi-sub">basado en podcast invitado actual</div>
          </div>
        </div>

        {/* Rationale */}
        <Card eye="Por qué hacerlo" title="" meta="Hipótesis editorial">
          <div style={{ font: "italic 500 14px/1.55 'Newsreader', Georgia, serif", color: "var(--p-ink-2)", borderLeft: "2px solid var(--p-brand-bg)", paddingLeft: 12 }}>
            {p.rationale}
          </div>
        </Card>

        {/* Episodes planeados */}
        <Card eye="Episodios planificados" title="" meta={p.episodes.length + " borradores"}>
          <table className="pt">
            <thead>
              <tr>
                <th>Ep</th>
                <th>Título</th>
                <th>Invitado</th>
                <th className="num">Min</th>
                <th className="num">Lanza</th>
                <th>Estado</th>
                <th>Vinculado a</th>
              </tr>
            </thead>
            <tbody>
              {p.episodes.map((e) => (
                <tr key={e.n}>
                  <td className="muted">{e.n.toString().padStart(2, "0")}</td>
                  <td className="strong">
                    {e.title}
                    <div style={{ font: "400 11px/1.4 var(--font-sans)", color: "var(--p-ink-3)", marginTop: 2 }}>{e.sub}</div>
                  </td>
                  <td>{e.author}</td>
                  <td className="num">{e.durationMin}</td>
                  <td className="num">{e.plannedReleaseAt}</td>
                  <td>
                    <span className={"pt-row-flag " + (e.status === "draft" ? "new" : e.status === "outline" ? "" : "")} style={{ background: e.status === "draft" ? "var(--p-good-bg)" : e.status === "outline" ? "var(--p-bg)" : "var(--p-warn-bg)", color: e.status === "draft" ? "var(--p-good)" : e.status === "outline" ? "var(--p-mute)" : "var(--p-warn)" }}>
                      {e.status === "draft" ? "BORRADOR" : e.status === "outline" ? "ESBOZO" : "IDEA"}
                    </span>
                  </td>
                  <td className="muted">
                    {e.bookLink === "emociones" ? "Emociones en construcción" : "Familias ensambladas"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* What we'll track */}
        <Card eye="Esto medirá el dashboard cuando publiques" title="">
          <ul style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 6 }}>
            {p.willTrack.map((w, i) => (
              <li key={i} style={{ font: "400 13px/1.55 var(--font-sans)", color: "var(--p-ink-2)" }}>{w}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VIEW · RECURSOS pre-publicación
// ─────────────────────────────────────────────────────────────
function ConsoleResources({ setView }) {
  const r = window.P_RESOURCES;
  return (
    <div className="pl-page">
      <div className="pl-page-inner">
        <PageHeader
          eye="Recursos · pre-publicación"
          title="Contenido adicional dentro de la app"
          sub="Cartas cortas, audios guiados, prácticas diarias, preguntas. Para que abrir la app tenga sentido entre capítulos."
          period={"Lanza " + r.plannedLaunch}
          extra={<button className="pl-btn" onClick={() => setView("overview")}>← Overview</button>}
        />

        {/* Rationale */}
        <Card eye="Por qué" title="" meta="">
          <div style={{ font: "italic 500 14px/1.55 'Newsreader', Georgia, serif", color: "var(--p-ink-2)", borderLeft: "2px solid var(--p-brand-bg)", paddingLeft: 12 }}>
            {r.rationale}
          </div>
        </Card>

        {/* Formats */}
        <div className="pl-grid cols-12">
          {r.formats.map((f) => (
            <div className="span-6" key={f.id}>
              <Card eye={f.label.toUpperCase()} title="" meta={"Meta · " + f.targetPerMonth + "/mes"}>
                <div style={{ font: "400 13px/1.55 var(--font-sans)", color: "var(--p-ink-2)" }}>{f.desc}</div>
              </Card>
            </div>
          ))}
        </div>

        {/* Pieces planeadas */}
        <Card eye="Piezas piloto" title="" meta={r.pieces.length + " en cola para junio"}>
          <table className="pt">
            <thead>
              <tr>
                <th>Formato</th>
                <th>Título</th>
                <th>Autor</th>
                <th className="num">Min</th>
                <th className="num">Lanza</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {r.pieces.map((p) => {
                const fmt = r.formats.find((f) => f.id === p.format);
                return (
                  <tr key={p.id}>
                    <td className="muted">{fmt ? fmt.label : p.format}</td>
                    <td className="strong">{p.title}</td>
                    <td>{p.author}</td>
                    <td className="num">{p.mins}</td>
                    <td className="num">{p.plannedAt}</td>
                    <td>
                      <span style={{ font: "600 9.5px/1 var(--font-mono)", letterSpacing: "0.08em", padding: "2px 6px", borderRadius: 3, background: p.status === "ready" ? "var(--p-good-bg)" : p.status === "draft" ? "var(--p-brand-bg)" : "var(--p-bg)", color: p.status === "ready" ? "var(--p-good)" : p.status === "draft" ? "var(--p-brand)" : "var(--p-mute)" }}>
                        {p.status === "ready" ? "LISTO" : p.status === "draft" ? "BORRADOR" : p.status === "outline" ? "ESBOZO" : "IDEA"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        {/* What we'll track */}
        <Card eye="Esto medirá el dashboard cuando publiques" title="">
          <ul style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 6 }}>
            {r.willTrack.map((w, i) => (
              <li key={i} style={{ font: "400 13px/1.55 var(--font-sans)", color: "var(--p-ink-2)" }}>{w}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Console root
// ─────────────────────────────────────────────────────────────
function ConsoleApp({ view, setView }) {
  return (
    <div className="pl">
      <ConsoleSidebar view={view} setView={setView} />
      <main className="pl-main">
        <ConsoleTopbar view={view} setView={setView} />
        {view === "overview"  && <ConsoleOverview  setView={setView} />}
        {view === "book"      && <ConsoleBook      setView={setView} />}
        {view === "funnel"    && <ConsoleFunnel    setView={setView} />}
        {view === "terapia"   && <ConsoleTerapia   setView={setView} />}
        {view === "podcast"   && <ConsolePodcast   setView={setView} />}
        {view === "resources" && <ConsoleResources setView={setView} />}
      </main>
    </div>
  );
}

Object.assign(window, {
  ConsoleApp, ConsoleBook, ConsoleFunnel, ConsoleTerapia, ConsolePodcast, ConsoleResources,
  TerapiaPrelaunchCompact, GateRow,
  KpiCard, HighlightCard, Card, CohortGrid, PageHeader,
});
