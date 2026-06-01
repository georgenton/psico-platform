// patrones/app.jsx — Patrones · Lo que se repite en ti.

const {
  PAT_USER, PAT_HOUR_MOOD, PAT_MOODMAP, PAT_THEMES, PAT_CORRELATIONS,
  PAT_ECO_NOTES, PAT_WEEKLY_SUMMARY, PAT_VOCAB,
  MOOD_SWATCH, MOOD_SOLID, MOOD_NAMES,
} = window;

// ── Sidebar ──
function Sidebar() {
  const N = window.Icons;
  const items = [
    { icon: <N.home />, label: "Inicio" },
    { icon: <N.book />, label: "Mi biblioteca" },
    { icon: <N.eco />, label: "Eco" },
    { icon: <N.diary />,  label: "Diario" },
    { icon: <N.patrones />,  label: "Patrones", on: true },
    { icon: <N.plan />, label: "Mi plan" },
    { icon: <N.user />, label: "Perfil" },
  ];
  return (
    <aside className="side">
      <div className="side-head"><span className="side-wm">Psico Platform</span></div>
      <nav className="side-nav">
        <div className="side-eyebrow">Menú</div>
        {items.map((it) => (
          <a key={it.label} className={"side-link " + (it.on ? "is-on" : "")} href="#">
            <span className="side-link-icon">{it.icon}</span>
            <span style={{ flex: 1 }}>{it.label}</span>
          </a>
        ))}
      </nav>
      <div className="side-foot">
        <div className="side-user">
          <span className="side-avatar">A</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="side-user-name">ana@correo.com</div>
            <div className="side-user-plan"><span className="plan-dot pro"></span>Plan Pro</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── Hero ──
function Hero() {
  const s = PAT_WEEKLY_SUMMARY;
  return (
    <section className="hero">
      <span className="hero-eyebrow">◎ {s.weekLabel}</span>
      <h1 className="hero-title">{s.headline}</h1>
      <p className="hero-body">{s.body}</p>
      <div className="hero-hilites">
        {s.hilites.map((h) => (
          <div key={h.lbl} className="hero-hilite">
            <div className="hero-hilite-lbl">{h.lbl}</div>
            <div className="hero-hilite-val">{h.val}</div>
            <div className="hero-hilite-sub">{h.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Reloj de mood (24h) ──
function MoodClock() {
  const R_OUTER = 132;
  const R_INNER = 42;
  const cx = R_OUTER + 30, cy = R_OUTER + 30;
  const segs = PAT_HOUR_MOOD.map((d, i) => {
    const a0 = (i / 24) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / 24) * Math.PI * 2 - Math.PI / 2;
    const ro = R_INNER + (R_OUTER - R_INNER) * Math.max(0.12, d.v);
    const pad = 0.5 * Math.PI / 180; // gap entre cuñas
    const x0 = cx + R_INNER * Math.cos(a0 + pad);
    const y0 = cy + R_INNER * Math.sin(a0 + pad);
    const x1 = cx + ro * Math.cos(a0 + pad);
    const y1 = cy + ro * Math.sin(a0 + pad);
    const x2 = cx + ro * Math.cos(a1 - pad);
    const y2 = cy + ro * Math.sin(a1 - pad);
    const x3 = cx + R_INNER * Math.cos(a1 - pad);
    const y3 = cy + R_INNER * Math.sin(a1 - pad);
    const path =
      `M ${x0} ${y0} L ${x1} ${y1} A ${ro} ${ro} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${R_INNER} ${R_INNER} 0 0 0 ${x0} ${y0} Z`;
    return { i, path, mood: d.m, v: d.v, hour: d.h };
  });

  const tickPos = (h, r) => {
    const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const peakHour = PAT_HOUR_MOOD.reduce((a, b) => (b.v > a.v ? b : a)).h;

  return (
    <div className="clock">
      <svg className="clock-svg" viewBox={`0 0 ${(R_OUTER + 30) * 2} ${(R_OUTER + 30) * 2}`}>
        {/* anillo guía */}
        <circle cx={cx} cy={cy} r={R_OUTER + 6} fill="none" stroke="var(--color-warm-200)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={R_INNER - 4} fill="none" stroke="var(--color-warm-200)" strokeWidth="1" />
        {/* sectores */}
        {segs.map((s) => (
          <path
            key={s.i}
            d={s.path}
            fill={s.mood ? MOOD_SOLID[s.mood] : "var(--color-warm-100)"}
            opacity={s.mood ? 0.35 + 0.55 * s.v : 0.6}
          />
        ))}
        {/* ticks */}
        {[0, 6, 12, 18].map((h) => {
          const [x, y] = tickPos(h, R_OUTER + 18);
          return (
            <text key={h}
              x={x} y={y + 3} textAnchor="middle"
              className={"clock-tick " + (h === peakHour ? "clock-now" : "")}
            >{h.toString().padStart(2, "0")}h</text>
          );
        })}
      </svg>
      <div className="clock-hub">
        <div className="clock-hub-big">21h</div>
        <div className="clock-hub-sm">Hora pico<br/>reflexión</div>
      </div>
    </div>
  );
}

// ── MoodMap 12 semanas ──
function MoodMap() {
  return (
    <div>
      <div className="moodmap">
        {PAT_MOODMAP.map((wk, wi) => {
          const monthLbl = ["Mar","Mar","Mar","Mar","Abr","Abr","Abr","Abr","May","May","May","May"][wi];
          const isCurrent = wi === PAT_MOODMAP.length - 1;
          return (
            <div key={wi} className="moodmap-row">
              <span className="moodmap-row-lbl">{wi % 4 === 0 ? monthLbl : ""}</span>
              {wk.map((m, di) => {
                const isToday = isCurrent && di === 4;
                return (
                  <div
                    key={di}
                    className={"moodmap-cell " + (m ? "has-mood " : "") + (isToday ? "is-today" : "")}
                    style={m ? { ["--mood-bg"]: MOOD_SWATCH[m] } : {}}
                    title={m ? MOOD_NAMES[m] : "Sin entrada"}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="moodmap-legend">
        <span></span>
        {["L","M","M","J","V","S","D"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="moodmap-key">
        {Object.keys(MOOD_NAMES).map((m) => (
          <span key={m} className="moodmap-key-item">
            <span className="moodmap-key-dot" style={{ ["--mood-bg"]: MOOD_SWATCH[m] }}></span>
            {MOOD_NAMES[m]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Theme sparkline ──
function ThemeRow({ t }) {
  const w = 240, h = 36;
  const max = Math.max(...t.trend);
  const pts = t.trend.map((v, i) => {
    const x = (i / (t.trend.length - 1)) * (w - 4) + 2;
    const y = h - 4 - (v / max) * (h - 10);
    return [x, y];
  });
  const pathLine = pts.map((p, i) => (i === 0 ? "M" : "L") + " " + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const pathArea = pathLine + ` L ${w - 2} ${h - 2} L 2 ${h - 2} Z`;
  return (
    <div className="theme-row" style={{ ["--theme-color"]: t.color }}>
      <span className="theme-name">#{t.theme}</span>
      <svg viewBox={`0 0 ${w} ${h}`} className="theme-spark" preserveAspectRatio="none">
        <path d={pathArea} fill={t.color} opacity="0.12"/>
        <path d={pathLine} fill="none" stroke={t.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 3 : 1.5}
            fill={i === pts.length - 1 ? t.color : "#fff"} stroke={t.color} strokeWidth="1.5" />
        ))}
      </svg>
      <span className="theme-note">{t.note}</span>
    </div>
  );
}

// ── Correlation card ──
function Correlation({ c }) {
  return (
    <div className="cor">
      <span className="cor-icon">{c.icon}</span>
      <div className="cor-text">
        <div className="when">Cuando · {c.if_}</div>
        <div className="then">→ <b>{c.then_}</b></div>
      </div>
      <div className="cor-conf">
        <span>{Math.round(c.confidence * 100)}%</span>
        <span className="cor-conf-bar"><span style={{ width: (c.confidence * 100) + "%" }}/></span>
        <span style={{ color: "var(--color-warm-400)" }}>{c.sample}</span>
      </div>
    </div>
  );
}

// ── Vocab ──
function Vocab() {
  const max = Math.max(...PAT_VOCAB.map((v) => v.n));
  return (
    <div className="vocab">
      {PAT_VOCAB.map((v) => {
        const size = 13 + (v.n / max) * 11;
        return (
          <span key={v.w} className="vocab-w"
            style={{ ["--mood-bg"]: MOOD_SWATCH[v.mood], ["--size"]: size + "px" }}>
            {v.w} <small>·{v.n}× · desde {v.since}</small>
          </span>
        );
      })}
    </div>
  );
}

// ── Page ──
function PatronesApp() {
  return (
    <div className="stage">
      <Sidebar/>
      <main className="main">
        <header className="top">
          <div className="top-title">Patrones</div>
          <div className="top-meta">{PAT_USER.weeksActive} semanas · {PAT_USER.totalEntries} entradas analizadas</div>
        </header>

        <div className="body">
          <Hero/>

          <div className="grid">
            {/* Mood clock — cuándo escribes y con qué mood */}
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <div className="card-h">
                <h3>Tu reloj — cuándo y con qué mood escribes</h3>
                <span className="meta">Últimos 60 días</span>
              </div>
              <p className="card-sub">
                Cada cuña es una hora del día. Más alto = escribes más a esa hora. Color = mood que aparece más en esas entradas.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "center" }}>
                <MoodClock/>
                <div style={{ paddingRight: 12 }}>
                  <p style={{ font: "500 12px/1 var(--font-mono)", color: "var(--color-warm-500)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 14px" }}>
                    Lo que vemos
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                    <li style={{ fontSize: 14, color: "var(--color-warm-800)", lineHeight: 1.5 }}>
                      Tu hora más fértil es <b style={{ color: "var(--color-lavender-700)" }}>21h</b> — mood predominante <em style={{ fontStyle: "normal", color: "var(--color-lavender-700)" }}>Reflexión</em>.
                    </li>
                    <li style={{ fontSize: 14, color: "var(--color-warm-800)", lineHeight: 1.5 }}>
                      Las entradas <b style={{ color: "var(--color-sage-700)" }}>matutinas</b> (7–9h) son las más cortas — y las que correlacionan con un mejor mood al cierre del día.
                    </li>
                    <li style={{ fontSize: 14, color: "var(--color-warm-800)", lineHeight: 1.5 }}>
                      Tienes un punto ciego entre las <b>2 y las 5 de la mañana</b>. Bueno — descansas.
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Mood map */}
            <div className="card">
              <div className="card-h">
                <h3>Tres meses de mood</h3>
                <span className="meta">12 semanas</span>
              </div>
              <p className="card-sub">
                Cada cuadrado es un día. Cuadrados vacíos son días sin entrada — no son días malos.
              </p>
              <MoodMap/>
              <div className="card-foot">
                <span>Hoy es viernes · 5/7 días esta semana</span>
                <a href="#">Ver año completo →</a>
              </div>
            </div>

            {/* Vocab */}
            <div className="card">
              <div className="card-h">
                <h3>Tu vocabulario</h3>
                <span className="meta">Palabras que vuelven</span>
              </div>
              <p className="card-sub">
                Las palabras que más escribes — el color es el mood con el que sueles usarlas.
              </p>
              <Vocab/>
              <div className="card-foot">
                <span>‹Pausa› aparece desde abril — el mes del Cap. 3.</span>
                <a href="#">Explorar →</a>
              </div>
            </div>

            {/* Themes */}
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <div className="card-h">
                <h3>Temas vivos · seis meses</h3>
                <span className="meta">Variación vs. tu media</span>
              </div>
              <p className="card-sub">
                Lo que sube — y lo que se aquieta. Esto no se interpreta solo, pero ayuda a notar lo que ya estaba pasando.
              </p>
              <div className="themes">
                {PAT_THEMES.map((t) => <ThemeRow key={t.theme} t={t}/>)}
              </div>
            </div>

            {/* Correlations */}
            <div className="card">
              <div className="card-h">
                <h3>Lo que cuando · entonces</h3>
                <span className="meta">Correlaciones, no diagnósticos</span>
              </div>
              <p className="card-sub">
                Patrones detectados a partir de tu uso. No son verdades — son hipótesis para que pruebes.
              </p>
              <div className="cors">
                {PAT_CORRELATIONS.map((c, i) => <Correlation key={i} c={c}/>)}
              </div>
            </div>

            {/* Eco notes */}
            <div className="card">
              <div className="card-h">
                <h3>Eco notó</h3>
                <span className="meta">3 cosas este mes</span>
              </div>
              <p className="card-sub">
                Eco lee lo que tú le compartes — no tu diario. Estas observaciones vienen de las conversaciones que tuvieron.
              </p>
              <div className="eco-notes">
                {PAT_ECO_NOTES.map((n, i) => (
                  <div key={i} className="eco-note">
                    <span className="eco-note-glyph">✦</span>
                    <div>
                      <div className="eco-note-meta">{n.notedOn} · #{n.tag}</div>
                      <div className="eco-note-body">{n.body}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="card-foot">
                <span>Eco actualiza estas notas cada domingo.</span>
                <a href="#">Hablar con Eco →</a>
              </div>
            </div>
          </div>

          <div className="privacy">
            <span style={{ fontSize: 16 }}>🔒</span>
            <span>
              <b>Privado por defecto.</b> Estos patrones se calculan en tu dispositivo cuando es posible.
              Nadie — ni Eco, ni el equipo — ve tu diario sin que tú lo invites. Puedes pausar el análisis
              o descargar todo en <a href="#" style={{ color: "var(--color-lavender-600)", fontWeight: 600 }}>Ajustes · Privacidad</a>.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

window.PatronesApp = PatronesApp;
