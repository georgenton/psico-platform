// reader/extras8.jsx — Seventh batch: #2 breath break, #6 privacy dashboard,
// #11 emotional map, #13 home-screen widget, #19 inbox interno.

function H8I({ d, size = 16, sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const H8 = {
  x:        <H8I d="M6 6l12 12M6 18L18 6"/>,
  arrow:    <H8I d="M5 12h14M13 6l6 6-6 6"/>,
  back:     <H8I d="M15 6l-6 6 6 6"/>,
  check:    <H8I d="M5 12l5 5L20 7" sw={2.4}/>,
  shield:   <H8I d="M12 2l8 4v6c0 5-4 9-8 10-4-1-8-5-8-10V6z"/>,
  download: <H8I d={["M12 4v12","M8 12l4 4 4-4","M5 20h14"]}/>,
  trash:    <H8I d={["M3 6h18","M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2","M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"]}/>,
  eye:      <H8I d={["M1 12C3 6 7 4 12 4s9 2 11 8","M1 12c2 6 6 8 11 8s9-2 11-8","M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"]} sw={1.5}/>,
  key:      <H8I d={["M21 2l-9.6 9.6","M15.5 8.5l2 2","M14 14a4 4 0 1 1-6 5l-4 4-2-2 9-9a4 4 0 1 1 3 2z"]}/>,
  data:     <H8I d={["M4 6h16","M4 12h16","M4 18h16"]}/>,
  brain:    <H8I d={["M9 2C7 2 6 4 6 5c-2 0-3 2-2 4-2 1-2 4 0 5-1 2 0 4 2 4 0 2 1 4 3 4 1 1 3 1 3-1V2z"]} sw={1.5}/>,
  heart:    <H8I d="M12 21s-7-4.5-9.3-9.3a5.3 5.3 0 0 1 9.3-5.1 5.3 5.3 0 0 1 9.3 5.1C19 16.5 12 21 12 21z"/>,
  bell:     <H8I d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9zM10 21a2 2 0 0 0 4 0"/>,
  envelope: <H8I d={["M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z","M3 6l9 7 9-7"]}/>,
  spark:    <H8I d={["M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z"]} sw={1.4}/>,
  reply:    <H8I d={["M9 17l-5-5 5-5","M4 12h11a5 5 0 0 1 5 5"]}/>,
  pen:      <H8I d={["M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7","M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"]}/>,
  layout:   <H8I d={["M3 3h18v18H3z","M3 9h18","M9 9v12"]} sw={1.6}/>,
  device:   <H8I d={["M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z","M11 18h2"]} sw={1.6}/>,
};

// ════════════════════════════════════════════════════════════════════════
// #2  BreathBreak — guided 4-7-8 cycle overlay. Optional, dismissable.
// ════════════════════════════════════════════════════════════════════════
function BreathBreak({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  // Phases: inhale 4s · hold 7s · exhale 8s
  const cycle = [
    { id: "inhale", dur: 4, label: "Inhala", sub: "por la nariz" },
    { id: "hold",   dur: 7, label: "Mantén",  sub: "suavemente" },
    { id: "exhale", dur: 8, label: "Exhala",  sub: "por la boca" },
  ];
  const [phase, setPhase] = React.useState(0);
  const [secs, setSecs] = React.useState(cycle[0].dur);
  const [rounds, setRounds] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setSecs((s) => {
        if (s > 1) return s - 1;
        // advance phase
        setPhase((p) => {
          const next = (p + 1) % cycle.length;
          if (next === 0) setRounds((r) => r + 1);
          return next;
        });
        return cycle[(phase + 1) % cycle.length].dur;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [paused, phase]);

  const cur = cycle[phase];
  return (
    <div className={"ext-overlay ext8-breath-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext8-breath " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Pausa de respiración"
      >
        <button className="ext-iconclose ext8-breath-close" aria-label="Cerrar" onClick={onClose}>{H8.x}</button>

        <span className="ext-eyebrow ext8-breath-eyebrow">
          {H8.heart} Pausa breve · 4-7-8
        </span>

        <div className="ext8-breath-stage">
          <div className={"ext8-breath-circle is-" + cur.id} aria-hidden>
            <div className="ext8-breath-circle-inner"></div>
            <div className="ext8-breath-circle-glow"></div>
          </div>
          <div className="ext8-breath-label">
            <div className="ext8-breath-action">{cur.label}</div>
            <div className="ext8-breath-secs">{secs}</div>
            <div className="ext8-breath-sub">{cur.sub}</div>
          </div>
        </div>

        <div className="ext8-breath-progress">
          {cycle.map((c, i) => (
            <span key={c.id} className={"ext8-breath-pill " + (i === phase ? "is-on" : i < phase ? "is-done" : "")}>
              {c.label}
              <span className="ext8-breath-pill-dur">{c.dur}s</span>
            </span>
          ))}
        </div>

        <div className="ext8-breath-meta">
          <div>Ronda <strong>{rounds + 1}</strong> de 4 sugeridas</div>
          <div>{paused ? "En pausa" : "Respirando contigo"}</div>
        </div>

        <p className="ext8-breath-hint">
          Llevas 22 min leyendo a Marina. Esta práctica activa el nervio vago.
          {" "}Si te sientes mareado, abre los ojos y para.
        </p>

        <div className="ext8-breath-actions">
          <button className="ext-btn-ghost" onClick={() => setPaused((p) => !p)}>
            {paused ? "Reanudar" : "Pausar"}
          </button>
          <button className="ext-btn-primary" onClick={onClose}>
            Volver al texto {H8.arrow}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// #6  Privacy dashboard
// ════════════════════════════════════════════════════════════════════════
const PRIVACY_SECTIONS = [
  {
    h: "Lo que escribes",
    icon: "pen",
    items: [
      { label: "Notas al margen",            n: "47 notas",     size: "12 KB", scope: "solo tú",                 export: true },
      { label: "Subrayados",                 n: "208 frases",   size: "8 KB",  scope: "solo tú · agregados anónimos a la comunidad", export: true },
      { label: "Reflexiones del journal",    n: "18 entradas",  size: "32 KB", scope: "solo tú",                 export: true },
      { label: "Mensajes con Eco",           n: "84 mensajes",  size: "44 KB", scope: "solo tú · borrables",     export: true, sensitive: true },
    ],
  },
  {
    h: "Cómo lees",
    icon: "eye",
    items: [
      { label: "Tiempo en cada lección",     n: "5 capítulos",  size: "5 KB",  scope: "tú · usado para sugerencias", export: true },
      { label: "Mood-after pickeado",        n: "8 picks",      size: "<1 KB", scope: "tú · agregado anónimo",       export: true },
      { label: "Pausas de audio · marcadores", n: "12 marcadores", size: "2 KB", scope: "tú",                     export: true },
    ],
  },
  {
    h: "Lo que el sistema infiere",
    icon: "brain",
    inferred: true,
    items: [
      { label: "Sueles leer entre 21:00 y 23:00",                meta: "calculado en tu dispositivo · no se sube" },
      { label: "Tu mood predominante: Reflexión",                meta: "se borra al salir" },
      { label: "Capítulo más revisitado: Cap. 5 Lec. 01",        meta: "se borra al salir" },
      { label: "Ritmo de lectura: balanceado",                   meta: "se borra al salir" },
    ],
  },
];

const PRIVACY_ACCESS = [
  { who: "Tú · este dispositivo",      what: "Todo",                              type: "self" },
  { who: "Tú · otros dispositivos",    what: "Tu progreso, subrayados y notas",   type: "sync" },
  { who: "Tu círculo de lectura (4)",  what: "Anotaciones que marcaste compartidas + tu progreso", type: "club" },
  { who: "Marina (autora)",            what: "Ninguno — nunca lee tus notas",     type: "none" },
  { who: "Equipo de Psico Platform",   what: "Datos anonimizados agregados · soporte solo bajo pedido tuyo", type: "team" },
];

function PrivacyDashboard({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext8-privacy " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Tu información, transparente"
      >
        <header className="ext8-privacy-head">
          <div>
            <span className="ext-eyebrow ext8-privacy-eyebrow">{H8.shield} Tu información</span>
            <h2 className="ext8-privacy-title">Lo que sabemos de ti, sin tecnicismos</h2>
            <p className="ext8-privacy-sub">
              Cada categoría se puede exportar, borrar o pausar. Si algo no está claro, escríbenos a <a href="mailto:privacidad@psico.app">privacidad@psico.app</a>.
            </p>
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{H8.x}</button>
        </header>

        <div className="ext8-privacy-summary">
          <div className="ext8-privacy-summary-card">
            <span className="ext8-privacy-summary-num">3 categorías</span>
            <span className="ext8-privacy-summary-lbl">de datos guardados</span>
          </div>
          <div className="ext8-privacy-summary-card">
            <span className="ext8-privacy-summary-num">104 KB</span>
            <span className="ext8-privacy-summary-lbl">tu peso total en nuestros servidores</span>
          </div>
          <div className="ext8-privacy-summary-card is-good">
            <span className="ext8-privacy-summary-num">{H8.check} Encriptado</span>
            <span className="ext8-privacy-summary-lbl">en tránsito y en reposo (AES-256)</span>
          </div>
        </div>

        {PRIVACY_SECTIONS.map((s, si) => (
          <section key={si} className={"ext8-privacy-section " + (s.inferred ? "is-inferred" : "")}>
            <div className="ext8-privacy-section-h">
              <span className="ext8-privacy-section-icon">{H8[s.icon] || H8.data}</span>
              {s.h}
              {s.inferred && <span className="ext8-privacy-section-tag">Solo en tu dispositivo</span>}
            </div>
            <div className="ext8-privacy-rows">
              {s.items.map((it, i) => (
                <div key={i} className={"ext8-privacy-row " + (it.sensitive ? "is-sensitive" : "")}>
                  <div className="ext8-privacy-row-meta">
                    <div className="ext8-privacy-row-label">{it.label}</div>
                    <div className="ext8-privacy-row-sub">
                      {it.n && <span><strong>{it.n}</strong> · {it.size}</span>}
                      {it.scope && <span> · {it.scope}</span>}
                      {it.meta && <em>{it.meta}</em>}
                    </div>
                  </div>
                  {!s.inferred && (
                    <div className="ext8-privacy-row-actions">
                      {it.export && <button>{H8.download} Exportar</button>}
                      <button className="is-danger">{H8.trash} Borrar</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="ext8-privacy-section">
          <div className="ext8-privacy-section-h">
            <span className="ext8-privacy-section-icon">{H8.key}</span>
            Quién tiene acceso
          </div>
          <ul className="ext8-privacy-access">
            {PRIVACY_ACCESS.map((a, i) => (
              <li key={i} className={"ext8-privacy-access-row tone-" + a.type}>
                <span className="ext8-privacy-access-who">{a.who}</span>
                <span className="ext8-privacy-access-what">{a.what}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="ext8-privacy-bulk">
          <div>
            <div className="ext8-privacy-bulk-h">Llevarte todo o cerrar la puerta</div>
            <div className="ext8-privacy-bulk-s">Exportá tus datos en un .zip o cierra tu cuenta para siempre. En 30 días borramos todo, sin preguntas.</div>
          </div>
          <div className="ext8-privacy-bulk-actions">
            <button className="ext-btn-ghost">{H8.download} Exportar todo</button>
            <button className="ext-btn-ghost is-danger">{H8.trash} Cerrar mi cuenta</button>
          </div>
        </div>

        <footer className="ext8-privacy-foot">
          <a href="#">Política de privacidad completa</a>
          <span>·</span>
          <a href="#">Solicitar acceso a tus datos</a>
          <span>·</span>
          <a href="#">Reportar un incidente</a>
        </footer>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// #11  Emotional map of the book — mood-after picked per chapter
// ════════════════════════════════════════════════════════════════════════
const CHAPTER_MOODS = [
  { n: 1,  title: "Lo que nadie te enseñó a nombrar",            mood: "thinking", finished: true,  intensity: 3 },
  { n: 2,  title: "Tu sistema nervioso te habla",                mood: "lighter",  finished: true,  intensity: 4 },
  { n: 3,  title: "Miedo · qué cuida y qué encierra",            mood: "moved",    finished: true,  intensity: 4 },
  { n: 4,  title: "Alegría que no se siente culpable",           mood: "lighter",  finished: true,  intensity: 5 },
  { n: 5,  title: "Tristeza no es debilidad",                    mood: "moved",    finished: true,  intensity: 5, current: true },
  { n: 6,  title: "Rabia útil, rabia que daña",                  mood: null,       finished: false, intensity: 0 },
  { n: 7,  title: "Vergüenza · la emoción más silenciosa",       mood: null,       finished: false, intensity: 0 },
  { n: 8,  title: "Culpa que repara, culpa que pesa",            mood: null,       finished: false, intensity: 0 },
  { n: 9,  title: "Cuando lo que sientes parece exagerado",      mood: null,       finished: false, intensity: 0 },
  { n: 10, title: "Las emociones de los otros también pesan",     mood: null,       finished: false, intensity: 0 },
  { n: 11, title: "Volver a empezar después de sentir mucho",     mood: null,       finished: false, intensity: 0 },
  { n: 12, title: "Una vida emocional propia",                   mood: null,       finished: false, intensity: 0 },
];

const MOOD_COLORS = {
  lighter:  { color: "#7ca775", label: "Más liviana"      },
  thinking: { color: "#8b71f5", label: "Pensativa"        },
  moved:    { color: "#d97e84", label: "Conmovida"        },
  neutral:  { color: "#c1a87a", label: "Igual que antes"  },
};

function EmotionalMap({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  const finished = CHAPTER_MOODS.filter((c) => c.finished);
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext8-emap " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Mapa emocional del libro"
      >
        <header className="ext8-emap-head">
          <div>
            <span className="ext-eyebrow ext8-emap-eyebrow">{H8.heart} Tu lectura emocional</span>
            <h2 className="ext8-emap-title">Cómo te dejó cada capítulo</h2>
            <p className="ext8-emap-sub">Lo registramos al final de cada capítulo con tu picker de mood-after. Sin él, no mostramos nada.</p>
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{H8.x}</button>
        </header>

        <div className="ext8-emap-legend">
          {Object.entries(MOOD_COLORS).map(([id, m]) => (
            <span key={id} className="ext8-emap-legend-item">
              <span className="ext8-emap-legend-swatch" style={{ background: m.color }}></span>
              {m.label}
            </span>
          ))}
        </div>

        <div className="ext8-emap-graph">
          {CHAPTER_MOODS.map((c, i) => {
            const m = c.mood ? MOOD_COLORS[c.mood] : null;
            return (
              <div key={c.n} className={"ext8-emap-col " + (c.current ? "is-current" : "") + (c.finished ? " is-finished" : "")}>
                <div className="ext8-emap-bar-wrap">
                  <div
                    className="ext8-emap-bar"
                    style={m ? {
                      background: m.color,
                      height: ((c.intensity / 5) * 100) + "%",
                    } : null}
                  >
                    {c.intensity > 0 && (
                      <span className="ext8-emap-bar-dot" style={{ background: m.color }}></span>
                    )}
                  </div>
                </div>
                <div className="ext8-emap-x">
                  <div className="ext8-emap-x-num">{String(c.n).padStart(2, "0")}</div>
                  {c.current && <div className="ext8-emap-x-current">Aquí</div>}
                </div>
              </div>
            );
          })}
        </div>

        <ul className="ext8-emap-list">
          {finished.map((c) => {
            const m = c.mood ? MOOD_COLORS[c.mood] : null;
            return (
              <li key={c.n} className={"ext8-emap-row " + (c.current ? "is-current" : "")}>
                <span className="ext8-emap-row-num">{String(c.n).padStart(2, "0")}</span>
                <div className="ext8-emap-row-meta">
                  <div className="ext8-emap-row-title">{c.title}</div>
                  <div className="ext8-emap-row-mood">
                    <span className="ext8-emap-row-swatch" style={{ background: m.color }}></span>
                    {m.label}
                    {c.current && <span className="ext8-emap-row-tag">Leyendo ahora</span>}
                  </div>
                </div>
                <div className="ext8-emap-row-intensity" aria-label="Intensidad">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span
                      key={i}
                      className={"ext8-emap-row-dot " + (i < c.intensity ? "is-on" : "")}
                      style={i < c.intensity ? { background: m.color } : null}
                    />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="ext8-emap-insight">
          <span className="ext8-emap-insight-icon">{H8.spark}</span>
          <div>
            <div className="ext8-emap-insight-h">Lo que vimos</div>
            <div className="ext8-emap-insight-s">
              Los capítulos sobre emociones primarias (alegría, tristeza, miedo) te dejan más conmovida o más liviana — nunca neutral. Eso sugiere que los estás <strong>encarnando</strong>, no solo entendiendo.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// #13  Home screen widget preview — iOS widget gallery
// ════════════════════════════════════════════════════════════════════════
function HomeWidgetPreview({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext8-widget " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Widget de inicio"
      >
        <header className="ext8-widget-head">
          <div>
            <span className="ext-eyebrow">{H8.device} Widget de inicio · iOS / Android</span>
            <h2 className="ext8-widget-title">Frase del día, sin abrir la app</h2>
            <p className="ext8-widget-sub">3 tamaños. Toca para volver al lector justo donde quedaste.</p>
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{H8.x}</button>
        </header>

        <div className="ext8-widget-stage">
          <div className="ext8-widget-wallpaper" aria-hidden></div>

          {/* Small (2x2) */}
          <div className="ext8-widget-card is-small">
            <div className="ext8-widget-card-tag">2×2</div>
            <div className="ext8-widget-mark">📖</div>
            <div className="ext8-widget-small-num">12<span>/15 min</span></div>
            <div className="ext8-widget-small-lbl">Tu meta de hoy</div>
            <div className="ext8-widget-small-bar"><div style={{ width: "80%" }}></div></div>
            <div className="ext8-widget-small-streak">🔥 7 días</div>
          </div>

          {/* Medium (4x2) — quote */}
          <div className="ext8-widget-card is-med">
            <div className="ext8-widget-card-tag">4×2</div>
            <div className="ext8-widget-med-head">
              <span className="ext8-widget-mark sm">📖</span>
              <span className="ext8-widget-med-label">FRASE DEL DÍA</span>
            </div>
            <p className="ext8-widget-med-quote">
              "La tristeza no es un error del sistema. Es el sistema funcionando."
            </p>
            <div className="ext8-widget-med-cite">— Marina · Cap. 5</div>
          </div>

          {/* Large (4x4) — progress + cover + next */}
          <div className="ext8-widget-card is-large">
            <div className="ext8-widget-card-tag">4×4</div>
            <div className="ext8-widget-large-head">
              <div className="ext8-widget-large-cover"></div>
              <div className="ext8-widget-large-meta">
                <div className="ext8-widget-large-title">Emociones en construcción</div>
                <div className="ext8-widget-large-author">Dra. Marina Salazar</div>
              </div>
            </div>
            <div className="ext8-widget-large-progress">
              <div className="ext8-widget-large-progress-row">
                <span>Cap. 5 · Lec. 02</span>
                <span>42%</span>
              </div>
              <div className="ext8-widget-large-bar"><div style={{ width: "42%" }}></div></div>
            </div>
            <div className="ext8-widget-large-next">
              <div className="ext8-widget-large-next-label">SIGUE</div>
              <div className="ext8-widget-large-next-title">El cuerpo de la tristeza</div>
              <div className="ext8-widget-large-next-meta">6 min · audio guiado disponible</div>
            </div>
            <div className="ext8-widget-large-streak">
              <span>🔥 7</span>
              <span>12 / 15 min hoy</span>
            </div>
          </div>
        </div>

        <div className="ext8-widget-options">
          <div className="ext8-widget-options-h">Variantes que mostraremos</div>
          <div className="ext8-widget-options-grid">
            {[
              { id: "quote",    on: true,  label: "Frase del día",            sub: "Rota cada mañana entre tus subrayados" },
              { id: "progress", on: true,  label: "Progreso del capítulo",     sub: "Llegaste al 42% del Cap. 5" },
              { id: "streak",   on: true,  label: "Racha + meta",             sub: "🔥 7 días · 12/15 min" },
              { id: "audio",    on: false, label: "Audio próximo a escuchar",  sub: "Solo si tienes audios pendientes" },
              { id: "circle",   on: false, label: "Tu círculo está leyendo",   sub: "Carla está en el Cap. 6" },
              { id: "marina",   on: false, label: "Frase de Marina",           sub: "Un pensamiento corto, escrito hoy" },
            ].map((o) => (
              <label key={o.id} className={"ext8-widget-opt " + (o.on ? "is-on" : "")}>
                <input type="checkbox" defaultChecked={o.on}/>
                <div>
                  <div className="ext8-widget-opt-h">{o.label}</div>
                  <div className="ext8-widget-opt-s">{o.sub}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <footer className="ext8-widget-foot">
          <span className="ext8-widget-foot-meta">
            iOS 17+ · Android 12+ · también disponible como Lock-screen widget
          </span>
          <button className="ext-btn-primary ext-btn-sm">Activar widgets {H8.arrow}</button>
        </footer>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// #19  Inbox interno — anuncios, círculo, respuestas a discusiones
// ════════════════════════════════════════════════════════════════════════
const INBOX_ITEMS = [
  {
    id: 1, kind: "circle", read: false, time: "hace 12 min",
    avatar: "CR", color: "sage",
    who: "Carla R.", action: "anotó en el Cap. 5",
    body: "Me hizo pensar en cuando murió mi abuela y todo el mundo me decía 'no te deprimas'. Era tristeza, no era depresión.",
    cta: "Ver anotación",
  },
  {
    id: 2, kind: "reply", read: false, time: "hace 1 h",
    avatar: "MS", color: "lav",
    who: "Marina (autora)", action: "respondió a tu hilo en la discusión",
    body: "Lo que describes — esa pausa antes de notar que te enojaste — es exactamente la maestría de esta lección. Sigue así.",
    cta: "Leer respuesta",
  },
  {
    id: 3, kind: "ann", read: false, time: "hace 4 h",
    avatar: "✦", color: "lav",
    who: "Psico Platform", action: "publicó",
    body: "Nuevo libro de Marina: 'El duelo que no se nombra'. Disponible desde el 15 de diciembre. Si eres Pro, ya está en tu biblioteca.",
    cta: "Ver libro",
  },
  {
    id: 4, kind: "circle", read: true, time: "ayer",
    avatar: "JP", color: "warm",
    who: "Joaco P.", action: "subrayó una frase compartida",
    body: "Notar el cuerpo cambia todo.",
    cta: "Ver subrayado",
  },
  {
    id: 5, kind: "event", read: true, time: "ayer",
    avatar: "📅", color: "sage",
    who: "Evento en vivo", action: "el domingo 7 PM",
    body: "Marina conversa con Camila sobre 'Tristeza y duelo en familia'. 45 min · gratis para Pro · cupos limitados.",
    cta: "Reservar lugar",
  },
  {
    id: 6, kind: "system", read: true, time: "hace 3 días",
    avatar: "⚙", color: "warm",
    who: "Sistema", action: "tu suscripción anual se renovó",
    body: "Tu plan Anual ($59 USD) se renovó automáticamente. Próximo cobro: 14 de noviembre 2026.",
    cta: "Ver detalle",
  },
];

function InboxDrawer({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  const [filter, setFilter] = React.useState("all");
  const filtered = filter === "all"
    ? INBOX_ITEMS
    : filter === "unread"
      ? INBOX_ITEMS.filter((i) => !i.read)
      : INBOX_ITEMS.filter((i) => i.kind === filter);
  const unread = INBOX_ITEMS.filter((i) => !i.read).length;

  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext8-inbox " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Bandeja de entrada"
      >
        <header className="ext8-inbox-head">
          <div>
            <span className="ext-eyebrow ext8-inbox-eyebrow">
              {H8.envelope} Bandeja interna
              {unread > 0 && <span className="ext8-inbox-unread">{unread} nuevos</span>}
            </span>
            <h2 className="ext8-inbox-title">Lo que está pasando dentro</h2>
            <p className="ext8-inbox-sub">
              Sin emails — solo lo que pasa contigo, tu círculo, Marina y los anuncios oficiales.
            </p>
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{H8.x}</button>
        </header>

        <div className="ext8-inbox-filters">
          {[
            { id: "all",    label: "Todo",        n: INBOX_ITEMS.length },
            { id: "unread", label: "Sin leer",    n: unread, primary: true },
            { id: "circle", label: "Tu círculo",  n: INBOX_ITEMS.filter((i) => i.kind === "circle").length },
            { id: "reply",  label: "Respuestas",  n: INBOX_ITEMS.filter((i) => i.kind === "reply").length },
            { id: "ann",    label: "Anuncios",    n: INBOX_ITEMS.filter((i) => i.kind === "ann").length },
            { id: "event",  label: "Eventos",     n: INBOX_ITEMS.filter((i) => i.kind === "event").length },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className={"ext8-inbox-filter " + (filter === f.id ? "is-on" : "") + (f.primary ? " is-primary" : "")}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="ext8-inbox-filter-n">{f.n}</span>
            </button>
          ))}
        </div>

        <ul className="ext8-inbox-list">
          {filtered.length === 0 && (
            <li className="ext8-inbox-empty">
              No hay nada acá. Vuelve después — siempre llega algo cuando dejas de mirar.
            </li>
          )}
          {filtered.map((item) => (
            <li key={item.id} className={"ext8-inbox-row tone-" + item.color + (item.read ? "" : " is-unread")}>
              {!item.read && <span className="ext8-inbox-dot" aria-label="Sin leer"></span>}
              <span className={"ext8-inbox-avatar " + (item.avatar.length > 2 ? "is-emoji" : "")}>{item.avatar}</span>
              <div className="ext8-inbox-meta">
                <div className="ext8-inbox-head-row">
                  <span className="ext8-inbox-who">{item.who}</span>
                  <span className="ext8-inbox-action"> {item.action}</span>
                  <span className="ext8-inbox-time">{item.time}</span>
                </div>
                <p className="ext8-inbox-body">{item.body}</p>
                <div className="ext8-inbox-actions">
                  <button className="ext8-inbox-cta">{item.kind === "reply" ? H8.reply : null} {item.cta} →</button>
                  {!item.read && <button className="ext8-inbox-mark">Marcar leído</button>}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <footer className="ext8-inbox-foot">
          <button className="ext8-inbox-foot-action">Marcar todo como leído</button>
          <button className="ext8-inbox-foot-action">Ajustes de bandeja</button>
        </footer>
      </div>
    </div>
  );
}

Object.assign(window, { BreathBreak, PrivacyDashboard, EmotionalMap, HomeWidgetPreview, InboxDrawer });
