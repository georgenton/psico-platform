// pulso/briefing.jsx — Variación B. Briefing semanal denso (editorial).

const {
  Sparkline, GrowthChart, MrrBars, Donut, FunnelRows, ChapterDropoff,
  fmt, fmtPct, fmtDelta, CHANNEL_COLORS,
} = window;

// ─────────────────────────────────────────────────────────────
// Sidebar — table of contents tipo periódico
// ─────────────────────────────────────────────────────────────
function BriefingSidebar({ view, setView }) {
  const items = [
    { id: "overview",  num: "00", label: "Síntesis ejecutiva", group: "Esta semana" },
    { id: "book",      num: "01", label: "Contenido",          group: "Detalle" },
    { id: "funnel",    num: "02", label: "Funnel",             group: "Detalle" },
    { id: "therapist", num: "03", label: "Terapeutas",         group: "Detalle" },
  ];
  let lastGroup = null;
  return (
    <aside className="pl-side br-side">
      <div className="pl-side-head" style={{ paddingBottom: 12 }}>
        <div className="pl-wordmark">Psico Platform</div>
        <div className="pl-wordmark-sub">Pulso · briefing</div>
      </div>
      <div style={{ padding: "0 16px 14px", borderBottom: "1px solid var(--p-line)" }}>
        <div style={{ font: "400 11px/1.4 var(--font-sans)", color: "var(--p-ink-3)" }}>
          Una lectura semanal — números puestos en contexto. Si solo lees una sola sección, lee la <b style={{ color: "var(--p-ink)" }}>00</b>.
        </div>
      </div>
      {items.map((it, i) => {
        const showGroup = it.group !== lastGroup;
        lastGroup = it.group;
        return (
          <React.Fragment key={it.id}>
            {showGroup && <div className="pl-side-section">{it.group}</div>}
            <div className="pl-side-nav">
              <div
                className={"pl-side-link" + (view === it.id ? " is-on" : "")}
                onClick={() => setView(it.id)}
              >
                <span className="pl-side-glyph" style={{ width: 22, font: "700 10.5px/1 var(--font-mono)", letterSpacing: "0.06em", color: view === it.id ? "var(--p-brand)" : "var(--p-mute)" }}>{it.num}</span>
                <span>{it.label}</span>
              </div>
            </div>
          </React.Fragment>
        );
      })}
      <div style={{ padding: "14px 16px", marginTop: 8, borderTop: "1px solid var(--p-line)" }}>
        <div style={{ font: "600 9.5px/1 var(--font-mono)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--p-mute-2)", paddingBottom: 6 }}>De la edición</div>
        <div style={{ font: "500 11.5px/1.5 var(--font-sans)", color: "var(--p-ink-3)" }}>
          {window.P_META.period}<br />
          Cierre · {window.P_META.generatedAt}
        </div>
      </div>
      <div className="pl-side-foot">
        <div className="pl-side-user">
          <div className="pl-side-avatar">J</div>
          <div style={{ minWidth: 0 }}>
            <div className="pl-side-name">{window.P_META.user.firstName}</div>
            <div className="pl-side-role">EDITOR</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────
// Section header con número editorial
// ─────────────────────────────────────────────────────────────
function BrSection({ num, title, takeaway, children }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="br-section-h">
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span className="br-section-num">§ {num}</span>
          <span className="br-section-title">{title}</span>
        </div>
        {takeaway && <div className="br-section-takeaway">{takeaway}</div>}
      </div>
      {children}
    </section>
  );
}

function BrStatLine({ stats }) {
  return (
    <div className="br-statline">
      {stats.map((s, i) => (
        <div key={i} className="br-stat">
          <div className="br-stat-lbl">{s.label}</div>
          <div className="br-stat-val">{s.value}</div>
          <div className="br-stat-sub">{s.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// OVERVIEW — la lectura semanal
// ─────────────────────────────────────────────────────────────
function BriefingOverview({ setView }) {
  const d = window;
  return (
    <div className="br-page">
      {/* Hero */}
      <div>
        <div className="br-eyebrow">Pulso · edición {d.P_META.weekOf.toLowerCase()}</div>
        <h1 className="br-title">Mes corto. La cosa más interesante no es el MRR.</h1>
        <p className="br-lede">
          178 personas activas, <b>12 pagando Pro</b>, <b>8 sesiones de terapia</b> agendadas en el primer mes — y un capítulo del libro de Marina cerrando al <b>89%</b>. La pregunta de la semana no es cuánto creciste; es por qué <b>el cap. 2 pierde al 61% de tus lectores</b> y qué hacer con eso antes de Junio.
        </p>
      </div>

      {/* Statline executive summary */}
      <BrStatLine
        stats={[
          { label: "Activos · 7 d",      value: "78",   sub: "+14% vs sem ant" },
          { label: "Conv. Pro",          value: "6.8%", sub: "12 de 178 pagan" },
          { label: "MRR",                value: "$84",  sub: "+20% mes a mes" },
          { label: "Sesiones terapia",   value: "8",    sub: "mes 1 · 5 son repe" },
        ]}
      />

      {/* §01 — Crecimiento */}
      <BrSection
        num="01"
        title="Crecimiento se desacelera, pero no se rompe"
        takeaway="Cierra Instagram o ajusta. Orgánico y boca a boca cargan el resto."
      >
        <div className="pl-grid cols-12" style={{ gridTemplateColumns: "minmax(0, 7fr) minmax(0, 5fr)" }}>
          <div className="span-7">
            <div className="pc">
              <div className="pc-body">
                <GrowthChart data={d.P_GROWTH.series} />
                <div style={{ display: "flex", gap: 16, paddingTop: 4 }}>
                  <span style={{ font: "500 11px/1 var(--font-mono)", color: "var(--p-mute)", letterSpacing: "0.04em", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 12, height: 2, background: "#5e42c0", borderRadius: 1 }} /> Registros
                  </span>
                  <span style={{ font: "500 11px/1 var(--font-mono)", color: "var(--p-mute)", letterSpacing: "0.04em", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 12, height: 2, background: "#7fae76", borderRadius: 1 }} /> Activaciones
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="span-5">
            <div className="br-margin br-prose">
              <p>Los <b className="num">64</b> registros de los últimos 30 días bajaron desde <b className="num">70</b> el mes pasado. La curva no quiebra — se sostiene en orgánico y recomendación — pero la pausa de Instagram el <b>5 may</b> dejó un hueco que ningún otro canal está rellenando.</p>
              <p style={{ marginTop: 10 }}>El podcast invitado del 2 de mayo trajo <b className="num">4</b> personas en 48 h. Repetir ese formato es más barato y convierte mejor que un anuncio.</p>
              <p style={{ marginTop: 10, font: "italic 500 13px/1.5 'Newsreader', Georgia, serif", color: "var(--p-ink-3)", borderLeft: "2px solid var(--p-brand-bg)", paddingLeft: 10 }}>
                Decisión sugerida — invertir podcast (2-3 al mes) antes que volver a Instagram, hasta validar que el embudo aguanta.
              </p>
            </div>
          </div>
        </div>

        <div className="pl-grid cols-2">
          <div className="pc">
            <div className="pc-h">
              <div className="pc-h-l">
                <span className="pc-h-eye">Canales · 30 d</span>
              </div>
              <span className="pc-h-meta">CAC en USD</span>
            </div>
            <div className="pc-body">
              <table className="pt">
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th className="num">Registros</th>
                    <th className="num">% mix</th>
                    <th className="num">Conv Pro</th>
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
                      <td className="num muted">{c.pct}%</td>
                      <td className="num" style={{ color: c.conv > 10 ? "var(--p-good)" : c.conv < 5 ? "var(--p-warn)" : "var(--p-ink)" }}>{fmtPct(c.conv)}</td>
                      <td className="num">{c.cacUsd ? "$" + c.cacUsd.toFixed(2) : "$0"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="pc">
            <div className="pc-h">
              <div className="pc-h-l"><span className="pc-h-eye">Cohortes · retención</span></div>
              <span className="pc-h-meta">% activos n semanas tras registro</span>
            </div>
            <div className="pc-body">
              <CohortGridB data={d.P_GROWTH.cohorts} />
            </div>
          </div>
        </div>
      </BrSection>

      {/* §02 — Contenido */}
      <BrSection
        num="02"
        title="El cap. 5 retiene al 89%. El cap. 2 pierde al 61%."
        takeaway="Aprende del primero, arregla el segundo."
      >
        <div className="br-prose">
          <p>De los <b className="num">204</b> lectores que abrieron <i>Emociones en construcción</i>, <b className="num">106</b> terminaron el cap. 1. Solo <b className="num">41</b> empezaron el cap. 2. Es la única ruptura crítica de tu funnel — más grave que la conversión a Pro.</p>
          <p style={{ marginTop: 8 }}>El comportamiento se aplana después del cap. 5, donde algo en la escritura sostiene a la gente al <b className="num">89%</b> de cierre y al <b className="num">31%</b> de favoritos — el doble del promedio del libro. Vale leer ese capítulo otra vez con un editor.</p>
        </div>

        <div className="pl-grid cols-12">
          <div className="span-8">
            <div className="pc">
              <div className="pc-h">
                <div className="pc-h-l">
                  <span className="pc-h-eye">Drop-off por capítulo</span>
                  <span className="pc-h-title">Emociones en construcción</span>
                </div>
                <button className="pl-btn" onClick={() => setView("book")}>Ver detalle →</button>
              </div>
              <div className="pc-body">
                <ChapterDropoff chapters={d.P_BOOKS[0].chap} />
              </div>
            </div>
          </div>
          <div className="span-4">
            <div className="pc">
              <div className="pc-h">
                <div className="pc-h-l"><span className="pc-h-eye">Tu segundo libro</span><span className="pc-h-title">Familias ensambladas</span></div>
              </div>
              <div className="pc-body">
                <div className="br-prose">
                  <p><b>87</b> lectores la empezaron, <b>21</b> la terminaron. NPS <b>8.6</b>, ligeramente debajo de Marina (9.1) pero con tendencia plana — no ha tenido empuje editorial.</p>
                </div>
                <BrStatLine
                  stats={[
                    { label: "Empezaron", value: "87",  sub: "−" },
                    { label: "Cierre",    value: "24%", sub: "vs 27%" },
                    { label: "Min/cap",   value: "11.2",sub: "−" },
                    { label: "Sugerido",  value: "3×",  sub: "por Tx" },
                  ]}
                />
                <div className="br-prose" style={{ marginTop: 2 }}>
                  <p style={{ font: "italic 500 12.5px/1.5 'Newsreader', Georgia, serif", color: "var(--p-ink-3)", borderLeft: "2px solid var(--p-brand-bg)", paddingLeft: 10 }}>
                    Vale dedicarle una semana de marketing dirigida a parejas — público que no estás tocando con Marina.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </BrSection>

      {/* §03 — Funnel */}
      <BrSection
        num="03"
        title="El punto que rompe el embudo es la lectura, no el pago"
        takeaway="Una notificación a 48 h podría recuperar el 30%."
      >
        <div className="pc">
          <div className="pc-body">
            <FunnelRows funnel={d.P_FUNNEL} />
          </div>
        </div>
        <div className="br-prose">
          <p><b>22</b> personas probaron Pro, <b>12</b> pagaron. Eso es <b className="num">54%</b> de conversión trial-paid — bueno. Pero la pérdida está antes: solo <b className="num">2.2%</b> de quien aterriza pasa al cap. 2. El experimento que vale la pena <i>la próxima semana</i> es: notificación push <b>48 h después</b> de leer cap. 1, con un párrafo del cap. 2 como gancho. Cualquier movimiento aquí mueve más MRR que cambiar el checkout.</p>
        </div>
      </BrSection>

      {/* §04 — Móvil vs Web */}
      <BrSection
        num="04"
        title="Móvil y web no compiten — se complementan"
        takeaway="Excepto en el checkout, donde móvil sí pierde."
      >
        <div className="br-prose">
          <p>El diario es <b className="num">88%</b> móvil. La lectura larga es <b className="num">62%</b> web. La compra Pro es <b className="num">58%</b> web. Patrón claro: los celulares son para reflejos rápidos y reservas; el escritorio para lectura sostenida y decisiones de dinero. No tienes un problema de canibalización — tienes un problema localizado de checkout móvil.</p>
        </div>
        <div className="pc">
          <div className="pc-body">
            <div className="dev-legend" style={{ paddingBottom: 4 }}>
              <span><span className="dev-legend-dot" style={{ background: "var(--p-brand-2)" }} />Móvil</span>
              <span><span className="dev-legend-dot" style={{ background: "#b8b3aa" }} />Web</span>
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
          </div>
        </div>
      </BrSection>

      {/* §05 — Terapia */}
      <BrSection
        num="05"
        title="Marina ya paga sus costos. El resto, no todavía."
        takeaway="Sube payout a Marina antes de buscar quinto terapeuta."
      >
        <div className="br-prose">
          <p>Tres semanas tras lanzar Terapia: <b className="num">8</b> sesiones reservadas, <b className="num">5</b> son repeticiones, <b className="num">62%</b> de rebook agregado. Con <i>n</i> chico no se festeja, pero el <b>sí volvió</b> es la única señal temprana que importa — y la tienes.</p>
          <p style={{ marginTop: 6 }}>El problema es la distribución: <b className="num">6</b> de las <b className="num">8</b> son Marina. Tomás, Valeria y Joaquín están subutilizados. La solución no es marketing más fuerte de "Terapia" — es darles visibilidad puntual a esos terapeutas en superficies que ya tienen tráfico (recetas en Inicio, sugerencia tras un capítulo).</p>
        </div>
        <div className="pc">
          <div className="pc-h">
            <div className="pc-h-l"><span className="pc-h-eye">Tus 4 terapeutas</span></div>
            <button className="pl-btn" onClick={() => setView("therapist")}>Ver detalle →</button>
          </div>
          <div className="pc-body">
            <table className="pt">
              <thead>
                <tr>
                  <th></th>
                  <th>Terapeuta</th>
                  <th className="num">Reservas 30 d</th>
                  <th className="num">Rebook</th>
                  <th className="num">Rating</th>
                  <th className="num">Payout</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {d.P_THERAPISTS.map((t) => {
                  const status = t.bookedThis30 >= 4 ? ["good", "Anclando"] : t.bookedThis30 === 0 ? ["bad", "Inactivo"] : ["watch", "Bajo radar"];
                  return (
                    <tr key={t.id}>
                      <td>
                        <div className={"cv " + (t.cover === "cool" ? "cover-cool" : t.cover === "warm" ? "cover-warm" : "cover-mixed")}>
                          <span className="cv-init">{t.initials}</span>
                        </div>
                      </td>
                      <td className="strong">{t.name} {t.isAutor && <span style={{ marginLeft: 6, font: "600 9.5px/1 var(--font-mono)", letterSpacing: "0.10em", color: "var(--p-brand)" }}>AUTOR</span>}</td>
                      <td className="num">{t.bookedThis30}</td>
                      <td className="num" style={{ color: t.rebookRate > 0.6 ? "var(--p-good)" : t.rebookRate < 0.4 && t.bookedThis30 > 0 ? "var(--p-warn)" : "var(--p-ink)" }}>{fmtPct(t.rebookRate * 100, 0)}</td>
                      <td className="num">{t.avgRating.toFixed(1)}</td>
                      <td className="num">${t.payoutThis30}</td>
                      <td><span className={"delta-i " + (status[0] === "good" ? "up" : status[0] === "bad" ? "down" : "flat")}>{status[1]}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </BrSection>

      {/* §06 — Dinero */}
      <BrSection
        num="06"
        title="MRR $84 cubre 35% de tus costos"
        takeaway="22 meses de runway. No es para celebrar, pero es para construir."
      >
        <div className="pl-grid cols-12">
          <div className="span-5">
            <div className="pc">
              <div className="pc-body">
                <MrrBars data={d.P_REVENUE.series} />
              </div>
            </div>
          </div>
          <div className="span-7">
            <div className="br-prose">
              <p>MRR creció <b className="num">+20%</b> mes a mes. ARPU $7, churn 1 persona. Estamos en el modo en que cada nuevo Pro mueve la aguja porque la base es chica. <b>$84 cubre el <span className="num">35%</span> de los $240 de costos operativos</b> — Stripe, dominios, Claude, Resend, Posthog.</p>
              <p style={{ marginTop: 8 }}>Para llegar al breakeven necesitas <b className="num">22</b> pagos más. A la velocidad actual (<b>+2 Pro/mes</b>) son <b>~11 meses</b>. Para acortar, el botón a mover es <b>conversión de trial</b>, no más registros: trial actual va al <b>54%</b>; subirlo al 70% saca <b>4 pagos extra</b> sin más adquisición.</p>
            </div>
          </div>
        </div>
      </BrSection>

      {/* §07 — Riesgo */}
      <BrSection
        num="07"
        title="Una bandera ética sin resolver"
        takeaway="Cierra antes del lunes."
      >
        <div className="br-prose">
          <p>{d.P_RISK.flagged} usuarios marcaron señales de riesgo en la admisión esta semana. {d.P_RISK.resolved} ya fueron derivados a terapeuta de guardia. <b>1 sigue pendiente</b> — revísalo y márcalo antes del lunes. Es lo único que importa más que cualquier número de arriba.</p>
        </div>
      </BrSection>

      <div style={{ font: "italic 500 13px/1.6 'Newsreader', Georgia, serif", color: "var(--p-mute)", paddingTop: 8, borderTop: "1px solid var(--p-line-2)", marginTop: 8 }}>
        Pulso · edición {d.P_META.weekOf.toLowerCase()} — preparada {d.P_META.generatedAt}. Si algo no cuadra, escríbele a Pulso.
      </div>
    </div>
  );
}

// Cohort grid simplificada (mismo dato que en console)
function CohortGridB({ data }) {
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
// Briefing root — reutiliza vistas de detalle de Console
// ─────────────────────────────────────────────────────────────
function BriefingApp({ view, setView }) {
  const detail = view !== "overview";
  return (
    <div className="pl">
      <BriefingSidebar view={view} setView={setView} />
      <main className="pl-main">
        <div className="pl-top">
          <div className="pl-crumbs">
            <a onClick={() => setView("overview")}>Pulso</a>
            <span className="sep">·</span>
            <span>{detail ? "Detalle · " + (view === "book" ? "Contenido" : view === "funnel" ? "Funnel" : "Terapeutas") : "Briefing semanal — " + window.P_META.weekOf}</span>
          </div>
          <div className="pl-top-right">
            <span className="pl-top-pill">{detail ? "Datos sintéticos" : "Edición " + window.P_META.weekOf.split(" ")[1]}</span>
            <span>Cierre · {window.P_META.generatedAt}</span>
          </div>
        </div>
        {view === "overview"  && <BriefingOverview setView={setView} />}
        {view === "book"      && <window.ConsoleBook      setView={setView} />}
        {view === "funnel"    && <window.ConsoleFunnel    setView={setView} />}
        {view === "therapist" && <window.ConsoleTherapist setView={setView} />}
      </main>
    </div>
  );
}

Object.assign(window, { BriefingApp });
