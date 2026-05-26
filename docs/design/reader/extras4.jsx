// reader/extras4.jsx — Fourth batch: items #5, #7, #9, #10, #13, #16, #18.

const { READER_CHAPTERS: CS4, READER_CHAPTER: CC4 } = window;

function E4I({ d, size = 16, sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const E4 = {
  x:        <E4I d="M6 6l12 12M6 18L18 6"/>,
  arrow:    <E4I d="M5 12h14M13 6l6 6-6 6"/>,
  back:     <E4I d="M15 6l-6 6 6 6"/>,
  moon:     <E4I d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>,
  bookm:    <E4I d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>,
  bookmF:   <E4I d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" sw={0}/>,
  queue:    <E4I d={["M4 6h16","M4 12h16","M4 18h10","M18 18l4-3-4-3z"]} sw={1.6}/>,
  play:     <E4I d="M8 5v14l11-7z"/>,
  clock:    <E4I d={["M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z","M12 7v5l3 2"]}/>,
  gift:     <E4I d={["M20 12v9H4v-9","M2 7h20v5H2z","M12 22V7","M12 7c-2-3-7-1-7 2","M12 7c2-3 7-1 7 2"]}/>,
  pen:      <E4I d={["M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7","M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"]}/>,
  spark:    <E4I d={["M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z"]} sw={1.4}/>,
  keyb:     <E4I d={["M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z","M7 10h.01","M11 10h.01","M15 10h.01","M19 10h.01","M7 14h10"]} sw={1.6}/>,
  send:     <E4I d="M5 12l14-7-5 14-3-6-6-1z" sw={1.6}/>,
  check:    <E4I d="M5 12l5 5L20 7" sw={2.4}/>,
  share:    <E4I d={["M16 5l-4-4-4 4","M12 1v14","M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"]}/>,
  wa:       <E4I d={["M3 21l1.5-5.3A8.5 8.5 0 1 1 8 20.5L3 21z"]}/>,
  link:     <E4I d={["M9 13a4 4 0 0 0 5.6 0L18 9.6a4 4 0 0 0-5.6-5.6L11 5.4","M15 11a4 4 0 0 0-5.6 0L6 14.4a4 4 0 0 0 5.6 5.6L13 18.6"]}/>,
  qrcode:   <E4I d={["M3 3h7v7H3z","M14 3h7v7h-7z","M3 14h7v7H3z","M14 14h3v3h-3z","M18 14h3v3h-3z","M14 18h3v3h-3z","M18 21h3"]} sw={1.6}/>,
};

// ════════════════════════════════════════════════════════════════════════
// #5  Pause card — "¿Cerrar por hoy?" — small modal triggered after a
// session, with a quick recap and gentle close vs continue options.
// ════════════════════════════════════════════════════════════════════════
function PauseCard({ todayMin = 12, goalMin = 15, streakDays = 7, highlightsNew = 2, onClose, onContinue, surface = "web" }) {
  const isMobile = surface === "mobile";
  const metGoal = todayMin >= goalMin;
  return (
    <div className={"ext-overlay ext4-pause-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext4-pause " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="¿Cerrar por hoy?"
      >
        <button className="ext4-pause-close" aria-label="Cerrar" onClick={onClose}>{E4.x}</button>
        <span className="ext4-pause-glyph" aria-hidden>{E4.moon}</span>
        <h2 className="ext4-pause-title">
          {metGoal ? "Llegaste a tu meta de hoy" : "Una buena pausa"}
        </h2>
        <p className="ext4-pause-sub">
          {metGoal
            ? `Llevas ${streakDays + 1} días seguidos. La práctica espaciada consolida mejor que una sentada larga.`
            : `Llevaste ${todayMin} min hoy. Si cierras aquí, retomamos justo en este pasaje mañana.`}
        </p>

        <div className="ext4-pause-recap">
          <div className="ext4-pause-recap-row">
            <span className="ext4-pause-recap-icon">{E4.clock}</span>
            <span><strong>{todayMin} min</strong> de lectura · meta {goalMin}</span>
          </div>
          {highlightsNew > 0 && (
            <div className="ext4-pause-recap-row">
              <span className="ext4-pause-recap-icon">{E4.bookm}</span>
              <span><strong>{highlightsNew} subrayados</strong> guardados en tu diario</span>
            </div>
          )}
          <div className="ext4-pause-recap-row">
            <span className="ext4-pause-recap-icon">{E4.spark}</span>
            <span>Quedaste en <strong>Cap. {CC4.num} · Lec. 02</strong></span>
          </div>
        </div>

        <p className="ext4-pause-quote">
          <em>"No siempre necesita ser resuelta; a veces solo necesita ser acompañada hasta la puerta."</em>
        </p>

        <div className="ext4-pause-actions">
          <button className="ext-btn-ghost" onClick={onContinue}>5 minutos más</button>
          <button className="ext-btn-primary" onClick={onClose}>Cerrar por hoy {E4.arrow}</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// #7  Save Eco conversation as note — bottom-sheet that converts a thread
// (or just the highlighted exchange) into a saved journal entry.
// ════════════════════════════════════════════════════════════════════════
function SaveEcoAsNote({ onClose, onSave, surface = "web" }) {
  const isMobile = surface === "mobile";
  const [title, setTitle] = React.useState("La tristeza como visita, no como sentencia");
  const [include, setInclude] = React.useState({
    quote: true,
    user: true,
    eco: true,
    extra: false,
  });
  const [reflection, setReflection] = React.useState(
    "Quiero recordarme esto la próxima vez que la tristeza llegue sin avisar."
  );
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext4-saveeco " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Guardar conversación como nota"
      >
        <header className="ext4-saveeco-head">
          <div>
            <span className="ext-eyebrow">{E4.spark} Guardar como nota</span>
            <h2 className="ext4-saveeco-title">Lleva esta conversación a tu diario</h2>
            <p className="ext4-saveeco-sub">Aparecerá en "Mi recorrido" — Eco no la vuelve a leer.</p>
          </div>
          <button className="ext-iconclose" aria-label="Cerrar" onClick={onClose}>{E4.x}</button>
        </header>

        <div className="ext4-saveeco-body">
          <label className="ext4-saveeco-field">
            <span className="ext4-saveeco-lbl">Título de la nota</span>
            <input
              type="text"
              className="ext4-saveeco-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <div className="ext4-saveeco-field">
            <span className="ext4-saveeco-lbl">¿Qué incluir?</span>
            <div className="ext4-saveeco-include">
              <label className={include.quote ? "is-on" : ""}>
                <input type="checkbox" checked={include.quote} onChange={(e) => setInclude({...include, quote: e.target.checked})}/>
                <div>
                  <div className="ext4-saveeco-inc-h">El pasaje del libro</div>
                  <div className="ext4-saveeco-inc-s">"tristeza y depresión no son lo mismo"</div>
                </div>
              </label>
              <label className={include.user ? "is-on" : ""}>
                <input type="checkbox" checked={include.user} onChange={(e) => setInclude({...include, user: e.target.checked})}/>
                <div>
                  <div className="ext4-saveeco-inc-h">Tu pregunta a Eco</div>
                  <div className="ext4-saveeco-inc-s">"¿Por qué la tristeza puede ser información?"</div>
                </div>
              </label>
              <label className={include.eco ? "is-on" : ""}>
                <input type="checkbox" checked={include.eco} onChange={(e) => setInclude({...include, eco: e.target.checked})}/>
                <div>
                  <div className="ext4-saveeco-inc-h">La respuesta de Eco</div>
                  <div className="ext4-saveeco-inc-s">"La tristeza suele venir a contarte qué cosa te importaba…"</div>
                </div>
              </label>
              <label className={include.extra ? "is-on" : ""}>
                <input type="checkbox" checked={include.extra} onChange={(e) => setInclude({...include, extra: e.target.checked})}/>
                <div>
                  <div className="ext4-saveeco-inc-h">Una pregunta de seguimiento</div>
                  <div className="ext4-saveeco-inc-s">"¿Y cómo distingo si ya es depresión?" + respuesta</div>
                </div>
              </label>
            </div>
          </div>

          <label className="ext4-saveeco-field">
            <span className="ext4-saveeco-lbl">Tu reflexión <span className="ext4-saveeco-optional">(opcional)</span></span>
            <textarea
              className="ext4-saveeco-textarea"
              rows="3"
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="¿Por qué quieres recordar esto?"
            />
          </label>
        </div>

        <footer className="ext4-saveeco-foot">
          <span className="ext4-saveeco-foot-meta">Se guarda en Cap. 5 · privado</span>
          <div className="ext4-saveeco-foot-actions">
            <button className="ext-btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="ext-btn-primary" onClick={() => { onSave && onSave({title, include, reflection}); onClose && onClose(); }}>
              Guardar en mi diario {E4.arrow}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// #9  Audio sleep timer + bookmarks panel — opens from the audio mini-player
// or full audio block. Lists existing bookmarks for the current track and
// lets the user set a sleep timer.
// ════════════════════════════════════════════════════════════════════════
const AUDIO_BOOKMARKS = [
  { id: 1, t: "0:32", label: "Donde late la tristeza", note: "Quiero volver acá cuando me cueste sentir." },
  { id: 2, t: "1:14", label: "El nudo en la garganta", note: "" },
  { id: 3, t: "3:08", label: "Acompañar sin apurar", note: "Frase para llevarme." },
];

function AudioPanel({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  const [sleep, setSleep] = React.useState(null);
  const [pinningNew, setPinningNew] = React.useState(false);
  const sleepOpts = [
    { id: "end", label: "Al final del audio", sub: "Cierra cuando termine el track." },
    { id: 5,    label: "5 minutos",            sub: "Pausa suave para no perderlo." },
    { id: 15,   label: "15 minutos",           sub: "Una lectura corta antes de dormir." },
    { id: 30,   label: "30 minutos",           sub: "Sesión completa." },
    { id: 60,   label: "1 hora",               sub: "Capítulo entero, aproximado." },
  ];
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext4-audio " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Audio · marcadores y temporizador"
      >
        <header className="ext4-audio-head">
          <div>
            <span className="ext-eyebrow">{E4.spark} Audio guiado</span>
            <h2 className="ext4-audio-title">Encontrar la tristeza en el cuerpo</h2>
            <p className="ext4-audio-sub">Cap. 5 · Lec. 02 · 4:12 · Voz de Marina</p>
          </div>
          <button className="ext-iconclose" aria-label="Cerrar" onClick={onClose}>{E4.x}</button>
        </header>

        <section className="ext4-audio-section">
          <div className="ext4-audio-section-h">{E4.moon} Temporizador de sueño</div>
          <div className="ext4-audio-sleep">
            {sleepOpts.map((o) => (
              <button
                key={o.id}
                type="button"
                className={"ext4-audio-sleep-opt " + (sleep === o.id ? "is-on" : "")}
                onClick={() => setSleep(o.id)}
              >
                <div className="ext4-audio-sleep-h">{o.label}</div>
                <div className="ext4-audio-sleep-s">{o.sub}</div>
              </button>
            ))}
            {sleep !== null && (
              <button className="ext4-audio-sleep-cancel" onClick={() => setSleep(null)}>
                Quitar temporizador
              </button>
            )}
          </div>
        </section>

        <section className="ext4-audio-section">
          <div className="ext4-audio-section-h">{E4.bookmF} Marcadores en este audio</div>
          <div className="ext4-audio-bms">
            {AUDIO_BOOKMARKS.map((b) => (
              <div key={b.id} className="ext4-audio-bm">
                <button className="ext4-audio-bm-time">{E4.play} {b.t}</button>
                <div className="ext4-audio-bm-meta">
                  <div className="ext4-audio-bm-label">{b.label}</div>
                  {b.note && <div className="ext4-audio-bm-note">{b.note}</div>}
                </div>
                <button className="ext4-audio-bm-del" aria-label="Eliminar marcador">{E4.x}</button>
              </div>
            ))}
            <button
              className="ext4-audio-bm-add"
              onClick={() => setPinningNew(!pinningNew)}
            >
              {E4.bookm} Marcar este momento <span className="ext4-audio-bm-add-t">(2:18)</span>
            </button>
            {pinningNew && (
              <div className="ext4-audio-bm-new">
                <input className="ext4-audio-bm-new-input" placeholder="Nombre del marcador (opcional)" autoFocus/>
                <textarea className="ext4-audio-bm-new-note" placeholder="Una nota corta…" rows="2"/>
                <div className="ext4-audio-bm-new-foot">
                  <button className="ext-btn-ghost ext-btn-sm" onClick={() => setPinningNew(false)}>Cancelar</button>
                  <button className="ext-btn-primary ext-btn-sm" onClick={() => setPinningNew(false)}>Guardar marcador</button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// #10  Audio queue — small panel listing the next audios in the chapter.
// Used inline below the mini-player.
// ════════════════════════════════════════════════════════════════════════
const AUDIO_QUEUE = [
  { n: 2, lessonN: 2, title: "Encontrar la tristeza en el cuerpo",   min: 4.2,  state: "playing" },
  { n: 3, lessonN: 3, title: "Cuándo se queda más de la cuenta",      min: 3.6,  state: "next"    },
  { n: 4, lessonN: 4, title: "Una carta a la tristeza · introducción", min: 5.1,  state: "queued"  },
  { n: 5, lessonN: 4, title: "Lo que se va siendo escuchada",          min: 4.4,  state: "queued"  },
];

function AudioQueueDrawer({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext4-queue " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Cola de audios"
      >
        <header className="ext4-queue-head">
          <div>
            <span className="ext-eyebrow">{E4.queue} Cola de audios</span>
            <h2 className="ext4-queue-title">{AUDIO_QUEUE.length} audios en Cap. 5</h2>
            <p className="ext4-queue-sub">Auto-play activado · pausa entre tracks de 8 segundos</p>
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{E4.x}</button>
        </header>

        <div className="ext4-queue-controls">
          <label className={"ext4-queue-flag is-on"}>
            <input type="checkbox" defaultChecked/>
            <span>Auto-play del siguiente</span>
          </label>
          <label className="ext4-queue-flag">
            <input type="checkbox"/>
            <span>Mezclar el orden</span>
          </label>
          <button className="ext4-queue-clear">Vaciar cola</button>
        </div>

        <ul className="ext4-queue-list">
          {AUDIO_QUEUE.map((q, i) => (
            <li key={q.n} className={"ext4-queue-row is-" + q.state}>
              <span className="ext4-queue-row-state">
                {q.state === "playing" && (
                  <span className="ext4-queue-bars" aria-label="Reproduciendo">
                    <span></span><span></span><span></span>
                  </span>
                )}
                {q.state === "next" && <span className="ext4-queue-next-num">A continuación</span>}
                {q.state === "queued" && <span className="ext4-queue-pos">{i + 1}</span>}
              </span>
              <div className="ext4-queue-row-meta">
                <div className="ext4-queue-row-title">{q.title}</div>
                <div className="ext4-queue-row-sub">Lec. {String(q.lessonN).padStart(2, "0")} · {q.min} min</div>
              </div>
              <button className="ext4-queue-row-action" aria-label={q.state === "playing" ? "Pausar" : "Reproducir"}>
                {E4.play}
              </button>
            </li>
          ))}
        </ul>

        <footer className="ext4-queue-foot">
          <button className="ext-btn-ghost ext-btn-sm">+ Agregar de otro capítulo</button>
          <button className="ext-btn-primary ext-btn-sm">Empezar desde el principio {E4.arrow}</button>
        </footer>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// #13  Keyboard shortcuts — overlay panel + global key handler
// ════════════════════════════════════════════════════════════════════════
const KB_GROUPS = [
  {
    h: "Navegación",
    rows: [
      { keys: ["J"],         desc: "Página siguiente / continuar leyendo" },
      { keys: ["K"],         desc: "Página anterior" },
      { keys: ["["],         desc: "Capítulo anterior" },
      { keys: ["]"],         desc: "Capítulo siguiente" },
      { keys: ["G", "G"],    desc: "Volver al inicio del capítulo" },
      { keys: ["Shift", "G"], desc: "Saltar al final del capítulo" },
    ],
  },
  {
    h: "Acciones",
    rows: [
      { keys: ["/"],          desc: "Buscar en el libro" },
      { keys: ["S"],          desc: "Subrayar selección" },
      { keys: ["N"],          desc: "Agregar nota" },
      { keys: ["E"],          desc: "Preguntar a Eco" },
      { keys: ["Shift", "S"], desc: "Compartir cita" },
      { keys: ["B"],          desc: "Marcar / quitar marcador" },
    ],
  },
  {
    h: "Audio",
    rows: [
      { keys: ["Espacio"],    desc: "Reproducir / pausar audio" },
      { keys: ["←"],          desc: "Retroceder 15s" },
      { keys: ["→"],          desc: "Adelantar 30s" },
      { keys: ["T"],          desc: "Mostrar / ocultar transcripción" },
      { keys: ["Shift", "T"], desc: "Temporizador de sueño" },
    ],
  },
  {
    h: "Lectura",
    rows: [
      { keys: ["A"],          desc: "Tamaño y tema (Aa)" },
      { keys: ["+"],          desc: "Aumentar tamaño de texto" },
      { keys: ["-"],          desc: "Reducir tamaño de texto" },
      { keys: ["R"],          desc: "Regla de lectura" },
      { keys: ["D"],          desc: "Cambiar a tema oscuro" },
      { keys: ["L"],          desc: "Cambiar a tema claro" },
    ],
  },
  {
    h: "Sistema",
    rows: [
      { keys: ["?"],          desc: "Abrir este panel" },
      { keys: ["Esc"],        desc: "Cerrar diálogo abierto" },
      { keys: ["M"],          desc: "Cambiar entre Modo Libro / Guía" },
      { keys: ["⌘", "K"],     desc: "Saltar a cualquier capítulo o lección" },
    ],
  },
];

function KeyboardShortcuts({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext4-kb " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Atajos de teclado"
      >
        <header className="ext4-kb-head">
          <div>
            <span className="ext-eyebrow">{E4.keyb} Atajos de teclado</span>
            <h2 className="ext4-kb-title">Más rápido con el teclado</h2>
            <p className="ext4-kb-sub">Funcionan en escritorio. En móvil usa gestos.</p>
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{E4.x}</button>
        </header>
        <div className="ext4-kb-grid">
          {KB_GROUPS.map((g) => (
            <section key={g.h} className="ext4-kb-group">
              <h3 className="ext4-kb-group-h">{g.h}</h3>
              <dl className="ext4-kb-list">
                {g.rows.map((r, i) => (
                  <React.Fragment key={i}>
                    <dt className="ext4-kb-keys">
                      {r.keys.map((k, j) => (
                        <React.Fragment key={j}>
                          {j > 0 && <span className="ext4-kb-plus">+</span>}
                          <kbd className="ext4-kb-key">{k}</kbd>
                        </React.Fragment>
                      ))}
                    </dt>
                    <dd className="ext4-kb-desc">{r.desc}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// Global keyboard handler — mount once at the App level. Open the shortcuts
// panel with ?, toggle modes/themes with letters, etc. Listens for tweak
// "kbShortcuts" being on.
function KeyboardHost({ tweaks, setTweak }) {
  React.useEffect(() => {
    if (!tweaks.kbShortcuts) return;
    const onKey = (e) => {
      // Skip when typing in a field.
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          setTweak("overlay", "search");
        }
        return;
      }
      switch (e.key) {
        case "?":
          e.preventDefault(); setTweak("overlay", "keyboard"); break;
        case "/":
          e.preventDefault(); setTweak("overlay", "search"); break;
        case "Escape":
          if (tweaks.overlay && tweaks.overlay !== "none") {
            e.preventDefault(); setTweak("overlay", "none");
          }
          break;
        case "a": case "A":
          // Aa popover — flip a flag in localStorage. The web's local state
          // owns it so we'll just dispatch a custom event.
          window.dispatchEvent(new CustomEvent("psico:toggle-aa"));
          break;
        case "d": case "D": setTweak("theme", "dark"); break;
        case "l": case "L": setTweak("theme", "light"); break;
        case "m": case "M":
          setTweak("mode", tweaks.mode === "libro" ? "guia" : "libro"); break;
        case "r": case "R":
          setTweak("readingRule", !tweaks.readingRule); break;
        case "+":
        case "=":
          setTweak("fontScale", Math.min(1.2, (tweaks.fontScale || 1) + 0.05)); break;
        case "-":
        case "_":
          setTweak("fontScale", Math.max(0.9, (tweaks.fontScale || 1) - 0.05)); break;
        case "t": case "T":
          if (e.shiftKey) {
            setTweak("overlay", "audio-panel");
          } else {
            setTweak("audio", tweaks.audio === "transcript" ? "playing" : "transcript");
          }
          break;
        case " ":
          if (tweaks.audio && tweaks.audio !== "idle") {
            e.preventDefault();
            setTweak("audio", tweaks.audio === "playing" ? "idle" : "playing");
          }
          break;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tweaks, setTweak]);
  return null;
}

// ════════════════════════════════════════════════════════════════════════
// #16  Recommended chapters (inside RichChapterEnd)
// ════════════════════════════════════════════════════════════════════════
const RECOMMENDATIONS = [
  {
    chap: 6,
    title: "Rabia útil, rabia que daña",
    why: "Sigue tu lectura lineal del libro.",
    tag: "Siguiente",
    primary: true,
    min: 24,
  },
  {
    chap: 3,
    title: "Miedo · qué cuida y qué encierra",
    why: "Marina recomienda revisitarlo después de leer sobre tristeza.",
    tag: "Por Marina",
    min: 18,
  },
  {
    chap: 11,
    title: "Volver a empezar después de sentir mucho",
    why: "Cierra el arco que abre este capítulo.",
    tag: "Por tu ritmo",
    min: 15,
  },
];

function RecommendedChapters({ onClose }) {
  return (
    <section className="ext4-recos">
      <header className="ext4-recos-head">
        <span className="ext-eyebrow">Para seguir</span>
        <h3 className="ext4-recos-title">Tres caminos desde acá</h3>
      </header>
      <div className="ext4-recos-grid">
        {RECOMMENDATIONS.map((r) => (
          <button key={r.chap} className={"ext4-reco " + (r.primary ? "is-primary" : "")}>
            <div className="ext4-reco-head">
              <span className="ext4-reco-num">Cap. {String(r.chap).padStart(2, "0")}</span>
              <span className={"ext4-reco-tag " + (r.primary ? "is-primary" : "")}>{r.tag}</span>
            </div>
            <h4 className="ext4-reco-title">{r.title}</h4>
            <p className="ext4-reco-why">{r.why}</p>
            <div className="ext4-reco-foot">
              <span>{r.min} min</span>
              <span className="ext4-reco-go">Abrir {E4.arrow}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════
// #18  Gift chapter / book — overlay to give a chapter or whole book.
// ════════════════════════════════════════════════════════════════════════
function GiftBookSheet({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  const [scope, setScope] = React.useState("chapter"); // chapter / book / month
  const [recipient, setRecipient] = React.useState("");
  const [note, setNote] = React.useState(
    "Estoy leyendo este libro y me hace bien. Pensé en ti y me pareció que quizás te llegue como me llegó a mí. Sin presión — solo si te late."
  );
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext4-gift " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Regalar Psico Platform"
      >
        <header className="ext4-gift-head">
          <div>
            <span className="ext-eyebrow">{E4.gift} Regalar</span>
            <h2 className="ext4-gift-title">Comparte el libro con alguien</h2>
            <p className="ext4-gift-sub">Reciben acceso gratis a lo que elijas. Vos también — un mes Pro para ambos.</p>
          </div>
          <button className="ext-iconclose" aria-label="Cerrar" onClick={onClose}>{E4.x}</button>
        </header>

        <div className="ext4-gift-scope">
          <button
            type="button"
            className={"ext4-gift-scope-opt " + (scope === "chapter" ? "is-on" : "")}
            onClick={() => setScope("chapter")}
          >
            <div className="ext4-gift-scope-h">Un capítulo</div>
            <div className="ext4-gift-scope-meta">
              <span className="ext4-gift-scope-price">Gratis</span>
              <span className="ext4-gift-scope-s">Cap. 5 · "Tristeza no es debilidad"</span>
            </div>
          </button>
          <button
            type="button"
            className={"ext4-gift-scope-opt is-feature " + (scope === "book" ? "is-on" : "")}
            onClick={() => setScope("book")}
          >
            <span className="ext4-gift-scope-flag">Más regalado</span>
            <div className="ext4-gift-scope-h">El libro completo</div>
            <div className="ext4-gift-scope-meta">
              <span className="ext4-gift-scope-price"><strong>$9</strong> USD <s>$14</s></span>
              <span className="ext4-gift-scope-s">12 capítulos · 4h · audios incluidos</span>
            </div>
          </button>
          <button
            type="button"
            className={"ext4-gift-scope-opt " + (scope === "month" ? "is-on" : "")}
            onClick={() => setScope("month")}
          >
            <div className="ext4-gift-scope-h">Un mes de Pro</div>
            <div className="ext4-gift-scope-meta">
              <span className="ext4-gift-scope-price"><strong>$7</strong> USD</span>
              <span className="ext4-gift-scope-s">Toda la biblioteca · 7 títulos hoy</span>
            </div>
          </button>
        </div>

        <div className="ext4-gift-form">
          <label className="ext4-gift-field">
            <span className="ext4-gift-field-lbl">Para quién</span>
            <input
              type="text"
              className="ext4-gift-input"
              placeholder="Email o nombre"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </label>
          <label className="ext4-gift-field">
            <span className="ext4-gift-field-lbl">Tu mensaje</span>
            <textarea
              className="ext4-gift-textarea"
              rows="4"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <span className="ext4-gift-counter">{note.length}/280</span>
          </label>
        </div>

        <div className="ext4-gift-preview">
          <div className="ext4-gift-card">
            <div className="ext4-gift-card-stripe" aria-hidden></div>
            <div className="ext4-gift-card-eyebrow">Te regalan en Psico Platform</div>
            <div className="ext4-gift-card-title">
              {scope === "chapter" && "Cap. 5 · Tristeza no es debilidad"}
              {scope === "book"    && "Emociones en construcción"}
              {scope === "month"   && "Un mes de Pro"}
            </div>
            <p className="ext4-gift-card-note">"{note.slice(0, 110)}{note.length > 110 ? "…" : ""}"</p>
            <div className="ext4-gift-card-from">— Ana</div>
          </div>
        </div>

        <footer className="ext4-gift-foot">
          <div className="ext4-gift-foot-share">
            <button className="ext4-gift-foot-action">{E4.wa} WhatsApp</button>
            <button className="ext4-gift-foot-action">{E4.send} Enviar por email</button>
            <button className="ext4-gift-foot-action">{E4.link} Copiar link</button>
            <button className="ext4-gift-foot-action">{E4.qrcode} Código QR</button>
          </div>
          <button className="ext-btn-primary ext4-gift-cta" disabled={!recipient.trim() && scope !== "chapter"}>
            {scope === "chapter" ? "Enviar regalo · gratis" : scope === "book" ? "Pagar $9 y enviar" : "Pagar $7 y enviar"} {E4.arrow}
          </button>
        </footer>
      </div>
    </div>
  );
}

// Export
Object.assign(window, {
  PauseCard, SaveEcoAsNote, AudioPanel, AudioQueueDrawer,
  KeyboardShortcuts, KeyboardHost, RecommendedChapters, GiftBookSheet,
});
