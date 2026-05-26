// reader/extras.jsx — Pending review items #5, #9, #10, #14, #15, #18, #20.
// #13 (refinamientos por tema) is in extras.css.
//
// All overlays share an outer scrim and stop click-propagation. They render
// inside whichever surface (desktop or mobile) calls them — the chrome is
// surface-aware: full-screen-sheet on mobile, centered card on desktop.

const {
  READER_BOOK: EB, READER_CHAPTER: EC, READER_CHAPTERS: ECS,
  READER_ANNOTATIONS: EAN, READER_LESSONS: ELS,
} = window;

// Reuse the icon helper pattern.
function EI({ d, size = 16, sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const EICO = {
  x:        <EI d="M6 6l12 12M6 18L18 6"/>,
  search:   <EI d={["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z","M16 16l5 5"]}/>,
  arrow:    <EI d="M5 12h14M13 6l6 6-6 6"/>,
  back:     <EI d="M15 6l-6 6 6 6"/>,
  cloud:    <EI d="M7 18a5 5 0 0 1-1-9.9 6 6 0 0 1 11.7 1A4 4 0 0 1 17 18z"/>,
  cloudOff: <EI d={["M4 4l16 16","M7 18h10a4 4 0 0 0 1.4-7.8","M6.5 8.1A6 6 0 0 1 16.6 9.7"]}/>,
  download: <EI d={["M12 4v12","M8 12l4 4 4-4","M5 20h14"]}/>,
  share:    <EI d={["M16 5l-4-4-4 4","M12 1v14","M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"]}/>,
  copy:     <EI d={["M9 9h10v10H9z","M5 15V5h10"]}/>,
  lock:     <EI d={["M7 11V7a5 5 0 0 1 10 0v4","M5 11h14v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"]}/>,
  sparkle:  <EI d={["M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z","M19 14l.7 2L22 17l-2.3 1L19 20l-.7-2L16 17l2.3-1z"]} sw={1.4}/>,
  check:    <EI d="M5 12l5 5L20 7" sw={2.4}/>,
  heart:    <EI d="M12 21s-7-4.5-9.3-9.3a5.3 5.3 0 0 1 9.3-5.1 5.3 5.3 0 0 1 9.3 5.1C19 16.5 12 21 12 21z"/>,
  feather:  <EI d={["M20 4c0 8-7 12-12 12H4l1-1 11-11h4z","M16 8L2 22","M9 15h6"]}/>,
  send:     <EI d="M5 12l14-7-5 14-3-6-6-1z" sw={1.6}/>,
  pen:      <EI d={["M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7","M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"]}/>,
  ig:       <EI d={["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z","M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z","M17 6.5h.01"]}/>,
  wa:       <EI d={["M3 21l1.5-5.3A8.5 8.5 0 1 1 8 20.5L3 21z","M8 11c.4 1.6 1.6 2.8 3.2 3.2","M11.2 14.2L13 12.5l2.5 1c.5.2.5.8.2 1.3"]}/>,
  link:     <EI d={["M9 13a4 4 0 0 0 5.6 0L18 9.6a4 4 0 0 0-5.6-5.6L11 5.4","M15 11a4 4 0 0 0-5.6 0L6 14.4a4 4 0 0 0 5.6 5.6L13 18.6"]}/>,
  save:     <EI d={["M5 4h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z","M8 4v5h7V4","M8 14h8v6H8z"]}/>,
};

// ────────────────────────────────────────────────────────────────────────
// #5  Exercise sheet · "Una carta a la tristeza"
// 10-min writing exercise. Drawer-style sheet on top of the reader.
// ────────────────────────────────────────────────────────────────────────
function ExerciseSheet({ onClose, surface = "web" }) {
  const [text, setText] = React.useState(
    "Querida tristeza, hoy quiero decirte que llegaste sin aviso — como casi siempre — pero esta vez no quiero apurarte. " +
    "Te he tratado como un visitante incómodo durante años. Te tapé con trabajo, con ruido, con planes que no me importaban tanto…"
  );
  const [secs, setSecs] = React.useState(8 * 60 + 47);
  const [paused, setPaused] = React.useState(false);
  React.useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [paused]);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const isMobile = surface === "mobile";

  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext-exercise " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Ejercicio · Una carta a la tristeza"
      >
        <header className="ext-exercise-head">
          <div className="ext-exercise-head-meta">
            <span className="ext-eyebrow">Ejercicio · Modo Guía</span>
            <h2 className="ext-exercise-title">Una carta a la tristeza</h2>
            <p className="ext-exercise-sub">Cap. 5 · Lec. 04 · Escritura libre, 10 minutos</p>
          </div>
          <button className="ext-iconclose" aria-label="Cerrar" onClick={onClose}>{EICO.x}</button>
        </header>

        <div className="ext-exercise-prompt">
          <span className="ext-exercise-prompt-mark">"</span>
          <p>
            Sin pensar mucho. Empieza así: <em>Querida tristeza, hoy quiero decirte que…</em>{" "}
            Si te sale algo que no esperabas, está bien — siempre pasa.
          </p>
          <span className="ext-exercise-prompt-author">— Dra. Marina Salazar</span>
        </div>

        <div className="ext-exercise-toolbar">
          <div className={"ext-exercise-timer " + (secs < 60 ? "is-low" : "")}>
            <span className="ext-exercise-timer-dot" aria-hidden></span>
            <span className="ext-exercise-timer-time">{mm}:{ss}</span>
            <button
              type="button"
              className="ext-exercise-timer-toggle"
              onClick={() => setPaused((p) => !p)}
            >{paused ? "Reanudar" : "Pausar"}</button>
          </div>
          <span className="ext-exercise-counter">
            <strong>{words}</strong> palabras · <strong>{text.length}</strong> caracteres
          </span>
          <span className="ext-exercise-save">
            <span className="ext-exercise-save-dot"></span>
            Guardando…
          </span>
        </div>

        <textarea
          className="ext-exercise-area"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Querida tristeza, hoy quiero decirte que…"
          autoFocus
        />

        <div className="ext-exercise-hint">
          <span aria-hidden>{EICO.feather}</span>
          <span>
            Esto es solo para ti — Eco no lo lee. Si quieres compartir un pasaje en Discusión, puedes elegirlo al terminar.
          </span>
        </div>

        <footer className="ext-exercise-foot">
          <button className="ext-btn-ghost" onClick={onClose}>Guardar borrador</button>
          <div className="ext-exercise-foot-r">
            <button className="ext-btn-ghost">Descartar</button>
            <button className="ext-btn-primary">Terminar ejercicio {EICO.arrow}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// #9  Search within the book
// ────────────────────────────────────────────────────────────────────────
const SEARCH_RESULTS_FOR = {
  "tristeza": [
    { chap: 5, lesson: 1, lessonTitle: "Lo que confundimos con depresión", snippet: "La __tristeza__ llegó primero — antes que la palabra. Antes que la cultura encontrara cómo nombrarla, ya estaba en nosotros.", in: "Prosa" },
    { chap: 5, lesson: 1, lessonTitle: "Lo que confundimos con depresión", snippet: "La __tristeza__ es una visita. Llega, se queda lo que tenga que quedarse, y se va.", in: "Prosa" },
    { chap: 5, lesson: 1, lessonTitle: "Lo que confundimos con depresión", snippet: "La __tristeza__ no es un error del sistema. Es el sistema funcionando.", in: "Pull-quote" },
    { chap: 5, lesson: 2, lessonTitle: "El cuerpo de la tristeza", snippet: "¿Dónde se aloja esta __tristeza__ en mí? Para algunas personas vive en la garganta…", in: "Prosa" },
    { chap: 5, lesson: 4, lessonTitle: "Lo que se va siendo escuchada", snippet: "Cuando la __tristeza__ es escuchada, suele cambiar de forma. No siempre se va — a veces se queda, pero más liviana.", in: "Prosa" },
    { chap: 4, lesson: 1, lessonTitle: "Alegría sin culpa", snippet: "La alegría y la __tristeza__ no se cancelan — pueden vivir en el mismo cuerpo al mismo tiempo.", in: "Prosa" },
    { chap: 1, lesson: 2, lessonTitle: "El nervio vago, en breve", snippet: "El cuerpo registra la __tristeza__ antes que la palabra. Esa es la pista clínica más antigua.", in: "Prosa" },
  ],
};
function highlight(snippet) {
  const parts = snippet.split(/__([^_]+)__/g);
  return parts.map((p, i) => i % 2 === 1 ? <mark key={i}>{p}</mark> : <React.Fragment key={i}>{p}</React.Fragment>);
}
function SearchSheet({ onClose, surface = "web" }) {
  const [q, setQ] = React.useState("tristeza");
  const [scope, setScope] = React.useState("all"); // all · current · highlights · notes
  const results = (SEARCH_RESULTS_FOR[q.toLowerCase()] || []).filter((r) =>
    scope === "current" ? r.chap === 5 : true
  );
  const groups = results.reduce((acc, r) => {
    const k = "Capítulo " + String(r.chap).padStart(2, "0");
    (acc[k] = acc[k] || []).push(r);
    return acc;
  }, {});
  const groupKeys = Object.keys(groups);
  const isMobile = surface === "mobile";
  const recents = ["disparador", "respirar", "alegría sin culpa", "duelo", "marina"];

  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext-search " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog" aria-label="Buscar en el libro"
      >
        <div className="ext-search-input">
          <span className="ext-search-input-icon">{EICO.search}</span>
          <input
            autoFocus
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar palabras, frases, citas…"
          />
          {q && <button className="ext-search-input-clear" aria-label="Limpiar" onClick={() => setQ("")}>{EICO.x}</button>}
          <kbd className="ext-search-input-esc" onClick={onClose}>esc</kbd>
        </div>

        <div className="ext-search-scopes">
          {[
            { id: "all",        label: "Todo el libro" },
            { id: "current",    label: "Capítulo actual" },
            { id: "highlights", label: "Mis subrayados" },
            { id: "notes",      label: "Mis notas" },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              className={"ext-search-scope " + (scope === s.id ? "is-on" : "")}
              onClick={() => setScope(s.id)}
            >{s.label}</button>
          ))}
        </div>

        <div className="ext-search-body">
          {q.trim() === "" ? (
            <div className="ext-search-recents">
              <div className="ext-search-recents-h">Búsquedas recientes</div>
              <div className="ext-search-recents-list">
                {recents.map((r) => (
                  <button key={r} className="ext-search-recent" onClick={() => setQ(r)}>
                    {EICO.search} {r}
                  </button>
                ))}
              </div>
            </div>
          ) : results.length === 0 ? (
            <EmptyState
              kind="search"
              title="Sin resultados para "
              accent={q}
              body="Prueba con otra palabra o quita los filtros para buscar en todo el libro."
              cta="Quitar filtros"
              onCta={() => setScope("all")}
            />
          ) : (
            <React.Fragment>
              <div className="ext-search-count">
                <strong>{results.length}</strong> resultados {scope === "current" ? "en este capítulo" : "en el libro"}
              </div>
              {groupKeys.map((g) => (
                <section key={g} className="ext-search-group">
                  <h3 className="ext-search-group-h">{g}</h3>
                  {groups[g].map((r, i) => (
                    <button key={i} className="ext-search-result" type="button">
                      <div className="ext-search-result-snip">{highlight(r.snippet)}</div>
                      <div className="ext-search-result-meta">
                        <span className="ext-search-result-loc">Lec. {String(r.lesson).padStart(2, "0")} · {r.lessonTitle}</span>
                        <span className="ext-search-result-kind">{r.in}</span>
                      </div>
                    </button>
                  ))}
                </section>
              ))}
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// #10  Empty states — gallery. Renders multiple empty-state cards in one
// frame so reviewers can see all the wording / shapes in one place.
// ────────────────────────────────────────────────────────────────────────
function EmptyState({ kind, title, accent, body, cta, onCta, secondary }) {
  const glyph = {
    highlights: EICO.feather,
    notes:      EICO.pen,
    search:     EICO.search,
    chapter:    EICO.lock,
    offline:    EICO.cloudOff,
    discussion: EICO.heart,
  }[kind];
  return (
    <div className={"ext-empty ext-empty-" + kind}>
      <div className="ext-empty-glyph" aria-hidden>{glyph}</div>
      <h3 className="ext-empty-title">
        {title}{accent && <em className="ext-empty-accent">"{accent}"</em>}
      </h3>
      <p className="ext-empty-body">{body}</p>
      {cta && (
        <div className="ext-empty-actions">
          <button className="ext-btn-primary ext-btn-sm" onClick={onCta}>{cta}</button>
          {secondary && <button className="ext-btn-ghost ext-btn-sm">{secondary}</button>}
        </div>
      )}
    </div>
  );
}

function EmptyStatesGallery({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext-empties " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="ext-empties-head">
          <div>
            <span className="ext-eyebrow">Vista de revisión</span>
            <h2 className="ext-empties-title">Estados vacíos</h2>
            <p className="ext-empties-sub">Cómo se ven los paneles cuando aún no hay datos.</p>
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{EICO.x}</button>
        </header>

        <div className="ext-empties-grid">
          <div className="ext-empties-card">
            <span className="ext-empties-card-tag">Subrayados · panel</span>
            <EmptyState
              kind="highlights"
              title="Aún no tienes subrayados"
              body="Selecciona una frase mientras lees y elige un color. Quedará guardada acá y en tu diario."
              cta="Cómo subrayar"
              secondary="Explorar capítulos"
            />
          </div>

          <div className="ext-empties-card">
            <span className="ext-empties-card-tag">Notas · filtro vacío</span>
            <EmptyState
              kind="notes"
              title="Aún no escribiste notas"
              body="Cuando subrayes algo, podrás agregar una nota al margen. Tus notas son privadas — Eco no las lee."
              cta="Empezar una nota"
            />
          </div>

          <div className="ext-empties-card">
            <span className="ext-empties-card-tag">Búsqueda · sin resultados</span>
            <EmptyState
              kind="search"
              title="Sin resultados para "
              accent="vergüenza temprana"
              body="Intenta con palabras más cortas. La búsqueda no distingue mayúsculas ni acentos."
              cta="Buscar 'vergüenza'"
              secondary="Limpiar búsqueda"
            />
          </div>

          <div className="ext-empties-card">
            <span className="ext-empties-card-tag">Capítulo bloqueado</span>
            <EmptyState
              kind="chapter"
              title="Capítulo 7 · Vergüenza"
              body="Disponible al pasarte a Pro. Marina te guía con la voz, los ejercicios escritos y la conversación privada con Eco."
              cta="Conocer Pro"
              secondary="Volver al índice"
            />
          </div>

          <div className="ext-empties-card">
            <span className="ext-empties-card-tag">Discusión · primer hilo</span>
            <EmptyState
              kind="discussion"
              title="Sé la primera persona en compartir"
              body="Lo que escribas se publica como anónimo por defecto. Marina y la comunidad responden en menos de un día."
              cta="Abrir un hilo"
            />
          </div>

          <div className="ext-empties-card">
            <span className="ext-empties-card-tag">Offline · sin descargas</span>
            <EmptyState
              kind="offline"
              title="No tienes capítulos descargados"
              body="Descarga el capítulo que estás leyendo para acceder sin conexión — audio guiado incluido."
              cta="Descargar Cap. 5"
              secondary="Descargar el libro entero"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// #14  Rich chapter end — replaces the simple `chapter-end` block when
// the tweak is on. Stats, prompt, mood-after, next chapter preview.
// ────────────────────────────────────────────────────────────────────────
function RichChapterEnd({ next }) {
  const [moodAfter, setMoodAfter] = React.useState(null);
  const moods = [
    { id: "lighter",   label: "Más liviana",       hint: "Sentí que algo se movió." },
    { id: "thinking",  label: "Pensativa",         hint: "Me quedé con preguntas." },
    { id: "moved",     label: "Conmovida",         hint: "Algo me tocó adentro." },
    { id: "neutral",   label: "Igual que antes",   hint: "No mucho, está bien." },
  ];
  return (
    <div className="ext-chend">
      <div className="ext-chend-burst" aria-hidden>{EICO.sparkle}</div>
      <span className="ext-eyebrow ext-chend-eyebrow">Capítulo {String(EC.num).padStart(2, "0")} · Terminado</span>
      <h2 className="ext-chend-title">{EC.title}</h2>

      <blockquote className="ext-chend-quote">
        “No siempre necesita ser resuelta; a veces solo necesita ser acompañada hasta la puerta.”
        <cite>— Dra. Marina Salazar, Cap. 5</cite>
      </blockquote>

      <div className="ext-chend-stats" role="group" aria-label="Resumen del capítulo">
        <div className="ext-chend-stat">
          <div className="ext-chend-stat-num">{EC.totalLessons}</div>
          <div className="ext-chend-stat-lbl">Lecciones</div>
        </div>
        <div className="ext-chend-stat-sep"/>
        <div className="ext-chend-stat">
          <div className="ext-chend-stat-num">{EC.totalMin}<span>min</span></div>
          <div className="ext-chend-stat-lbl">Lectura</div>
        </div>
        <div className="ext-chend-stat-sep"/>
        <div className="ext-chend-stat">
          <div className="ext-chend-stat-num">{EAN.filter((a) => a.chapter === 5).length}</div>
          <div className="ext-chend-stat-lbl">Subrayados</div>
        </div>
        <div className="ext-chend-stat-sep"/>
        <div className="ext-chend-stat">
          <div className="ext-chend-stat-num">1</div>
          <div className="ext-chend-stat-lbl">Ejercicio</div>
        </div>
      </div>

      <div className="ext-chend-mood">
        <div className="ext-chend-mood-h">¿Cómo te quedaste después de este capítulo?</div>
        <div className="ext-chend-mood-grid">
          {moods.map((m) => (
            <button
              key={m.id}
              type="button"
              className={"ext-chend-mood-opt " + (moodAfter === m.id ? "is-on" : "")}
              onClick={() => setMoodAfter(m.id)}
            >
              <span className="ext-chend-mood-opt-name">{m.label}</span>
              <span className="ext-chend-mood-opt-hint">{m.hint}</span>
            </button>
          ))}
        </div>
        {moodAfter && (
          <div className="ext-chend-mood-thanks">
            <span aria-hidden>{EICO.heart}</span>
            Gracias por contarnos — eso ayuda a que Eco te recomiende mejor.
          </div>
        )}
      </div>

      <div className="ext-chend-prompt">
        <span className="ext-eyebrow">Para llevarte</span>
        <p>Esta semana, cuando notes el peso suave del pecho, no le preguntes “¿qué haces aquí?” — pregúntale “¿qué viniste a contarme?”.</p>
      </div>

      <div className="ext-chend-next">
        <div className="ext-chend-next-meta">
          <span className="ext-eyebrow">Siguiente</span>
          <h3 className="ext-chend-next-title">Cap. {next.n} · {next.title}</h3>
          <p className="ext-chend-next-sub">{ECS[next.n - 1]?.min || 24} min · 4 lecciones · 2 audios guiados</p>
        </div>
        <div className="ext-chend-next-actions">
          <button className="ext-btn-ghost">Volver al libro</button>
          <button className="ext-btn-primary">Empezar capítulo {next.n} {EICO.arrow}</button>
        </div>
      </div>
      {window.RecommendedChapters && <window.RecommendedChapters/>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// #15  Hard paywall — full-surface takeover, blurred reader behind.
// ────────────────────────────────────────────────────────────────────────
function HardPaywall({ onClose, onContinueFree, surface = "web" }) {
  const [plan, setPlan] = React.useState("annual");
  const isMobile = surface === "mobile";
  const benefits = [
    { glyph: EICO.feather, h: "Modo Guía completo",       s: "Audios de Marina, ejercicios y checklists." },
    { glyph: EICO.sparkle, h: "Eco · conversación privada", s: "Pregunta sobre cualquier pasaje. Solo tú lo lees." },
    { glyph: EICO.download, h: "Biblioteca offline",         s: "Descarga capítulos y audios — viaja sin datos." },
    { glyph: EICO.heart,   h: "Discusión moderada",         s: "Comparte con la comunidad y con la autora." },
  ];
  return (
    <div className={"ext-takeover " + (isMobile ? "is-mobile" : "")} role="dialog" aria-label="Modo Guía es Pro">
      <header className="ext-takeover-head">
        <div className="ext-takeover-crumb">
          <span className="reader-top-crumb-cover cover-cool"></span>
          <div>
            <div className="ext-takeover-book">{EB.title}</div>
            <div className="ext-takeover-where">Cap. {EC.num} · Lección 02 · Modo Guía</div>
          </div>
        </div>
        <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{EICO.x}</button>
      </header>

      <div className="ext-takeover-body">
        <span className="ext-eyebrow ext-takeover-eyebrow">
          <span className="ext-takeover-pro-pill">{EICO.lock} Solo Pro</span>
          Modo Guía
        </span>
        <h1 className="ext-takeover-title">
          Esta lección incluye un audio guiado <em>de Marina</em>, un ejercicio escrito y reflexiones.
        </h1>
        <p className="ext-takeover-sub">
          Modo Libro queda gratis — la prosa entera de los 12 capítulos. Lo que se desbloquea con Pro es la práctica.
        </p>

        <div className="ext-takeover-benefits">
          {benefits.map((b, i) => (
            <div key={i} className="ext-takeover-benefit">
              <span className="ext-takeover-benefit-glyph">{b.glyph}</span>
              <div>
                <div className="ext-takeover-benefit-h">{b.h}</div>
                <div className="ext-takeover-benefit-s">{b.s}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="ext-takeover-plans">
          <button
            type="button"
            className={"ext-takeover-plan " + (plan === "monthly" ? "is-on" : "")}
            onClick={() => setPlan("monthly")}
          >
            <div className="ext-takeover-plan-h">Mensual</div>
            <div className="ext-takeover-plan-price"><strong>$7</strong> USD/mes</div>
            <div className="ext-takeover-plan-sub">Cancela cuando quieras</div>
          </button>
          <button
            type="button"
            className={"ext-takeover-plan is-feature " + (plan === "annual" ? "is-on" : "")}
            onClick={() => setPlan("annual")}
          >
            <span className="ext-takeover-plan-flag">Ahorra 30%</span>
            <div className="ext-takeover-plan-h">Anual</div>
            <div className="ext-takeover-plan-price"><strong>$59</strong> USD/año</div>
            <div className="ext-takeover-plan-sub">Equivale a $4.92/mes</div>
          </button>
        </div>

        <button className="ext-btn-primary ext-btn-block">
          Empezar Pro — {plan === "annual" ? "$59 USD/año" : "$7 USD/mes"} {EICO.arrow}
        </button>
        <p className="ext-takeover-fine">
          Sin tarjeta para los primeros 7 días · Cancela en un toque · Garantía de devolución a 30 días.
        </p>
        <button className="ext-takeover-continue" onClick={onContinueFree}>
          Continuar en Modo Libro
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// #18  Offline · top banner + downloads side-sheet.
// ────────────────────────────────────────────────────────────────────────
function OfflineBanner({ kind = "offline", onAction }) {
  const map = {
    offline: {
      icon: EICO.cloudOff,
      h: "Estás leyendo sin conexión",
      s: "Tienes Cap. 5 y dos audios descargados. Eco vuelve cuando vuelva el internet.",
      cta: "Ver descargas",
      tone: "warn",
    },
    syncing: {
      icon: EICO.cloud,
      h: "Sincronizando subrayados…",
      s: "Tus 4 notas y 6 subrayados de esta sesión se están guardando.",
      cta: null,
      tone: "info",
    },
    done: {
      icon: EICO.check,
      h: "Todo guardado",
      s: "Capítulo 5 descargado · disponible offline (32 MB)",
      cta: "OK",
      tone: "ok",
    },
  };
  const m = map[kind];
  return (
    <div className={"ext-offline-banner is-" + m.tone}>
      <span className="ext-offline-banner-icon">{m.icon}</span>
      <div className="ext-offline-banner-meta">
        <div className="ext-offline-banner-h">{m.h}</div>
        <div className="ext-offline-banner-s">{m.s}</div>
      </div>
      {m.cta && <button className="ext-offline-banner-cta" onClick={onAction}>{m.cta} →</button>}
    </div>
  );
}

function DownloadsSheet({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  const downloaded = [4, 5];
  const sizes = { 4: "28 MB", 5: "32 MB", 6: "31 MB", 7: "27 MB" };
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext-downloads " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="ext-downloads-head">
          <div>
            <span className="ext-eyebrow">Sin conexión</span>
            <h2 className="ext-downloads-title">Descargas</h2>
            <p className="ext-downloads-sub">
              <span className="ext-offline-dot is-off"></span> Sin conexión desde hace 12 min · Reintentar
            </p>
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{EICO.x}</button>
        </header>

        <div className="ext-downloads-summary">
          <div>
            <div className="ext-downloads-summary-num">60 <span>MB</span></div>
            <div className="ext-downloads-summary-lbl">Usado en este dispositivo</div>
          </div>
          <div className="ext-downloads-summary-bar">
            <div className="ext-downloads-summary-bar-fill" style={{ width: "12%" }}></div>
          </div>
          <button className="ext-btn-ghost ext-btn-sm">Descargar libro entero (340 MB)</button>
        </div>

        <ul className="ext-downloads-list">
          {ECS.map((c) => {
            const isDown = downloaded.includes(c.n);
            return (
              <li key={c.n} className={"ext-downloads-row " + (isDown ? "is-down" : "")}>
                <span className="ext-downloads-row-num">{String(c.n).padStart(2, "0")}</span>
                <div className="ext-downloads-row-meta">
                  <div className="ext-downloads-row-title">{c.title}</div>
                  <div className="ext-downloads-row-sub">
                    {c.min} min · {sizes[c.n] || "30 MB"} aprox
                  </div>
                </div>
                {isDown ? (
                  <div className="ext-downloads-row-state">
                    <span className="ext-downloads-row-state-tick">{EICO.check}</span>
                    <span>Descargado</span>
                  </div>
                ) : (
                  <button className="ext-downloads-row-cta" disabled>
                    {EICO.download} Descargar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// #20  Share quote — designed quote card + share options.
// ────────────────────────────────────────────────────────────────────────
const QUOTE_TEXT = "La tristeza no es un error del sistema. Es el sistema funcionando.";
const QUOTE_CITE = "Dra. Marina Salazar · Cap. 5 · Emociones en construcción";

function QuoteCard({ format, theme }) {
  // Three formats: square (1:1), story (9:16), landscape (16:9). Theme: light/sepia/dark/lavender/sage.
  return (
    <div className={"ext-quote ext-quote-" + format + " ext-quote-theme-" + theme}>
      <div className="ext-quote-stripe" aria-hidden>
        <span></span><span></span><span></span>
      </div>
      <div className="ext-quote-mark" aria-hidden>"</div>
      <p className="ext-quote-text">{QUOTE_TEXT}</p>
      <div className="ext-quote-cite">{QUOTE_CITE}</div>
      <div className="ext-quote-foot">
        <div className="ext-quote-foot-mark">Psico Platform</div>
        <div className="ext-quote-foot-url">psico.app/cap-5</div>
      </div>
    </div>
  );
}
function ShareQuoteSheet({ onClose, surface = "web" }) {
  const [format, setFormat] = React.useState("square");
  const [theme, setTheme] = React.useState("lavender");
  const isMobile = surface === "mobile";
  const themes = [
    { id: "lavender", label: "Lila"   },
    { id: "sage",     label: "Verde"  },
    { id: "sepia",    label: "Sepia"  },
    { id: "dark",     label: "Oscuro" },
  ];
  const formats = [
    { id: "square",    label: "Cuadrado",  meta: "1:1 · Instagram feed" },
    { id: "story",     label: "Story",     meta: "9:16 · IG / WhatsApp" },
    { id: "landscape", label: "Apaisado",  meta: "16:9 · Twitter / link" },
  ];
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext-share " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog" aria-label="Compartir cita"
      >
        <header className="ext-share-head">
          <div>
            <span className="ext-eyebrow">Compartir cita</span>
            <h2 className="ext-share-title">Una imagen para llevarte la frase</h2>
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{EICO.x}</button>
        </header>

        <div className="ext-share-body">
          <div className="ext-share-preview">
            <div className="ext-share-preview-stage">
              <QuoteCard format={format} theme={theme}/>
            </div>
            <div className="ext-share-preview-meta">
              <span className="ext-share-preview-meta-dot"></span>
              <span>Vista previa · {format === "square" ? "1080×1080" : format === "story" ? "1080×1920" : "1920×1080"}</span>
            </div>
          </div>

          <div className="ext-share-controls">
            <section className="ext-share-section">
              <div className="ext-share-section-h">Formato</div>
              <div className="ext-share-formats">
                {formats.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={"ext-share-format " + (format === f.id ? "is-on" : "")}
                    onClick={() => setFormat(f.id)}
                  >
                    <span className={"ext-share-format-thumb is-" + f.id} aria-hidden></span>
                    <div>
                      <div className="ext-share-format-lbl">{f.label}</div>
                      <div className="ext-share-format-meta">{f.meta}</div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="ext-share-section">
              <div className="ext-share-section-h">Color</div>
              <div className="ext-share-themes">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={"ext-share-theme is-" + t.id + (theme === t.id ? " is-on" : "")}
                    onClick={() => setTheme(t.id)}
                  >
                    <span className="ext-share-theme-swatch"></span>
                    {t.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="ext-share-section">
              <div className="ext-share-section-h">Compartir en</div>
              <div className="ext-share-actions">
                <button className="ext-share-action is-ig">{EICO.ig} Instagram</button>
                <button className="ext-share-action is-wa">{EICO.wa} WhatsApp</button>
                <button className="ext-share-action">{EICO.link} Copiar enlace</button>
                <button className="ext-share-action">{EICO.save} Guardar imagen</button>
              </div>
            </section>

            <div className="ext-share-fine">
              Las imágenes incluyen el wordmark de Psico Platform y un enlace al capítulo. Puedes desactivarlo en Ajustes.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Export to window so the renderers in web.jsx / mobile.jsx can call them.
Object.assign(window, {
  ExerciseSheet, SearchSheet, EmptyStatesGallery, RichChapterEnd,
  HardPaywall, OfflineBanner, DownloadsSheet, ShareQuoteSheet,
  EmptyState,
});
