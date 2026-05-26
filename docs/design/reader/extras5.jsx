// reader/extras5.jsx — #19 Community heatmap.
// Two surfaces:
//  • Inline heat-marks on paragraphs that the community has subrayed often
//    (a subtle pill next to the prose: "🔥 127").
//  • A drawer that summarises chapter-wide heat: a bar chart per lesson,
//    "most subrayed", "most quoted", "most paused".

function H5I({ d, size = 14, sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const H5 = {
  x:       <H5I d="M6 6l12 12M6 18L18 6"/>,
  arrow:   <H5I d="M5 12h14M13 6l6 6-6 6"/>,
  flame:   <H5I d="M12 2C10 6 6 8 6 12a6 6 0 0 0 12 0c0-2-1-3-2-4 1 3-1 5-2 5 0-4-2-7-2-11z"/>,
  people:  <H5I d={["M16 14a4 4 0 0 0-8 0","M12 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6z","M3 21a5 5 0 0 1 5-5","M21 21a5 5 0 0 0-5-5"]} sw={1.6}/>,
  quote:   <H5I d={["M7 7h4v4H7zM7 13a4 4 0 0 0 4-4","M15 7h4v4h-4zM15 13a4 4 0 0 0 4-4"]} sw={1.4}/>,
  pause:   <H5I d={["M9 5h2v14H9z","M13 5h2v14h-2z"]} sw={0}/>,
  share:   <H5I d={["M16 5l-4-4-4 4","M12 1v14","M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"]}/>,
  eye:     <H5I d={["M1 12C3 6 7 4 12 4s9 2 11 8","M1 12c2 6 6 8 11 8s9-2 11-8","M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"]} sw={1.5}/>,
  shield:  <H5I d="M12 2l8 4v6c0 5-4 9-8 10-4-1-8-5-8-10V6z"/>,
};

// ────────────────────────────────────────────────────────────────────────
// Data — synthetic community signal for the demo chapter.
// ────────────────────────────────────────────────────────────────────────
const HEAT_BY_PARAGRAPH = {
  // Keys match the start of the prose body text we want to mark.
  "La tristeza llegó primero": { count: 312, intensity: "med" },
  "Una de las cosas que aprendí en consulta": { count: 1208, intensity: "high" },
  "Antes de pensar la tristeza, conviene encontrarla en el cuerpo": { count: 547, intensity: "high" },
  "Notar el cuerpo cambia todo": { count: 892, intensity: "high" },
  "Hay tristezas que vienen": { count: 218, intensity: "low" },
  "Si reconociste varias de estas señales": { count: 76, intensity: "low" },
  "Cuando la tristeza es escuchada": { count: 1564, intensity: "high" },
  "Termino este capítulo con una invitación": { count: 432, intensity: "med" },
};

// Per-lesson stats for the chart.
const HEAT_PER_LESSON = [
  { n: 1, title: "Lo que confundimos con depresión", subrayados: 1520, paused: 28, quoted: 380 },
  { n: 2, title: "El cuerpo de la tristeza",           subrayados: 1439, paused: 41, quoted: 290 },
  { n: 3, title: "Cuándo se queda más de la cuenta",   subrayados:  294, paused:  9, quoted:  62 },
  { n: 4, title: "Lo que se va siendo escuchada",      subrayados: 1996, paused: 55, quoted: 510 },
];

const TOP_HIGHLIGHTS = [
  { text: "Cuando la tristeza es escuchada, suele cambiar de forma. No siempre se va — a veces se queda, pero más liviana.", n: 1564, lessonN: 4 },
  { text: "Notar el cuerpo cambia todo.",                                                                                  n:  892, lessonN: 2 },
  { text: "La tristeza no es un error del sistema. Es el sistema funcionando.",                                            n: 1208, lessonN: 1 },
  { text: "La tristeza es una visita. Llega, se queda lo que tenga que quedarse, y se va.",                                n:  747, lessonN: 1 },
];

const TOP_SHARED = [
  { text: "No siempre necesita ser resuelta; a veces solo necesita ser acompañada hasta la puerta.", n: 612 },
  { text: "Buscar ayuda no es rendirse. Es lo opuesto: es tomar en serio lo que sentís.",            n: 488 },
  { text: "La sensibilidad es uno de los instrumentos más finos que tiene el cuerpo.",               n: 354 },
];

const TOP_PAUSED = [
  { text: "Cierra los ojos un momento. ¿Dónde sientes hoy lo que te pesa?",      who: "Reflexión rápida · Lec. 2", min: 0.9, n: 412 },
  { text: "Una carta a la tristeza — Querida tristeza, hoy quiero decirte que…", who: "Ejercicio · Lec. 4",        min: 4.7, n: 287 },
  { text: "Te lo digo con franqueza: si alguna vez te dijeron que ser sensible era una debilidad, te mintieron.", who: "Callout · Lec. 1", min: 1.3, n: 198 },
];

// ────────────────────────────────────────────────────────────────────────
// HeatMark — inline pill that sits next to a paragraph. Shows count + a
// flame-tint based on intensity. Hover/tap reveals a tiny popover.
// ────────────────────────────────────────────────────────────────────────
function HeatMark({ body, onOpen, surface = "web" }) {
  // Find a matching synthetic entry by prefix match.
  const key = Object.keys(HEAT_BY_PARAGRAPH).find((k) => body.startsWith(k));
  if (!key) return null;
  const { count, intensity } = HEAT_BY_PARAGRAPH[key];
  const [hover, setHover] = React.useState(false);
  const formatted = count >= 1000 ? (count / 1000).toFixed(1).replace(/\.0$/, "") + "k" : count;
  return (
    <span
      className={"ext5-heat is-" + intensity + (surface === "mobile" ? " is-mobile" : "")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen && onOpen(); }}
      role="button"
      tabIndex={0}
      title="Comunidad subrayando · " + count + " personas"
    >
      <span className="ext5-heat-flame" aria-hidden>{H5.flame}</span>
      <span className="ext5-heat-num">{formatted}</span>
      {hover && (
        <span className="ext5-heat-pop" onMouseEnter={() => setHover(true)}>
          <span className="ext5-heat-pop-num">{count.toLocaleString("es")}</span>
          <span className="ext5-heat-pop-lbl">personas subrayaron este pasaje</span>
          <span className="ext5-heat-pop-cta">Ver el calor del capítulo →</span>
        </span>
      )}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────
// CommunityHeatDrawer — full overlay with charts and ranked passages.
// ────────────────────────────────────────────────────────────────────────
function CommunityHeatDrawer({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  const [tab, setTab] = React.useState("subrayado");

  const max = Math.max(...HEAT_PER_LESSON.map((l) => l.subrayados));
  const totalReaders = 12480;

  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext5-heat-drawer " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Calor de la comunidad"
      >
        <header className="ext5-drawer-head">
          <div>
            <span className="ext-eyebrow ext5-drawer-eyebrow">
              <span className="ext5-drawer-flame">{H5.flame}</span> Comunidad
            </span>
            <h2 className="ext5-drawer-title">El calor de este capítulo</h2>
            <p className="ext5-drawer-sub">
              {totalReaders.toLocaleString("es")} lectores han leído este capítulo · datos agregados, anónimos
            </p>
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{H5.x}</button>
        </header>

        {/* Chart: intensity per lesson */}
        <section className="ext5-drawer-section">
          <div className="ext5-section-h">{H5.people} Intensidad por lección</div>
          <div className="ext5-chart">
            {HEAT_PER_LESSON.map((l) => {
              const pct = Math.round((l.subrayados / max) * 100);
              return (
                <div key={l.n} className="ext5-chart-row">
                  <div className="ext5-chart-lbl">
                    <span className="ext5-chart-num">Lec. {String(l.n).padStart(2, "0")}</span>
                    <span className="ext5-chart-title">{l.title}</span>
                  </div>
                  <div className="ext5-chart-bar">
                    <div className="ext5-chart-fill" style={{ width: pct + "%" }}>
                      <span className="ext5-chart-fill-count">{l.subrayados.toLocaleString("es")}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Tabs: most underlined / shared / paused */}
        <div className="ext5-drawer-tabs" role="tablist">
          {[
            { id: "subrayado", label: "Más subrayado",   glyph: H5.flame, n: TOP_HIGHLIGHTS.length },
            { id: "compartido", label: "Más compartido", glyph: H5.share, n: TOP_SHARED.length },
            { id: "pausa",      label: "Más pausado",    glyph: H5.pause, n: TOP_PAUSED.length },
          ].map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              className={"ext5-tab " + (tab === t.id ? "is-on" : "")}
              onClick={() => setTab(t.id)}
            >
              <span className="ext5-tab-icon">{t.glyph}</span>
              <span>{t.label}</span>
              <span className="ext5-tab-count">{t.n}</span>
            </button>
          ))}
        </div>

        <div className="ext5-drawer-body">
          {tab === "subrayado" && (
            <ul className="ext5-list">
              {TOP_HIGHLIGHTS.map((h, i) => (
                <li key={i} className="ext5-list-row">
                  <span className="ext5-list-rank">{i + 1}</span>
                  <div className="ext5-list-meta">
                    <p className="ext5-list-text">"{h.text}"</p>
                    <div className="ext5-list-foot">
                      <span><strong>{h.n.toLocaleString("es")}</strong> subrayados</span>
                      <span className="ext5-list-sep"></span>
                      <span>Lec. {String(h.lessonN).padStart(2, "0")}</span>
                      <button className="ext5-list-go">Ir al pasaje →</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {tab === "compartido" && (
            <ul className="ext5-list">
              {TOP_SHARED.map((s, i) => (
                <li key={i} className="ext5-list-row">
                  <span className="ext5-list-rank tone-sage">{i + 1}</span>
                  <div className="ext5-list-meta">
                    <p className="ext5-list-text">"{s.text}"</p>
                    <div className="ext5-list-foot">
                      <span><strong>{s.n.toLocaleString("es")}</strong> personas compartieron</span>
                      <button className="ext5-list-go">{H5.share} Compartir tú</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {tab === "pausa" && (
            <ul className="ext5-list">
              {TOP_PAUSED.map((p, i) => (
                <li key={i} className="ext5-list-row">
                  <span className="ext5-list-rank tone-warm">{i + 1}</span>
                  <div className="ext5-list-meta">
                    <p className="ext5-list-text">"{p.text}"</p>
                    <div className="ext5-list-foot">
                      <span><strong>{p.min.toFixed(1)} min</strong> de pausa promedio</span>
                      <span className="ext5-list-sep"></span>
                      <span>{p.who}</span>
                      <span className="ext5-list-sep"></span>
                      <span>{p.n.toLocaleString("es")} pausas</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Privacy note */}
        <footer className="ext5-drawer-foot">
          <span className="ext5-drawer-foot-shield" aria-hidden>{H5.shield}</span>
          <div>
            <div className="ext5-drawer-foot-h">Sin nombres. Sin perfiles. Solo intensidad.</div>
            <div className="ext5-drawer-foot-s">
              Cada subrayado se cuenta sin tu identidad. No vemos quién subrayó, solo cuántos. Puedes apagarlo en Accesibilidad.
            </div>
          </div>
          <button className="ext5-drawer-foot-toggle">{H5.eye} Apagar el calor</button>
        </footer>
      </div>
    </div>
  );
}

Object.assign(window, { HeatMark, CommunityHeatDrawer });
