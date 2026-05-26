// reader/web.jsx — Lector web surface.

const {
  READER_BOOK, READER_CHAPTER, READER_LESSONS, READER_BLOCKS, READER_CHAPTERS,
  READER_ECO_PROMPTS, READER_ECO_THREAD, READER_HIGHLIGHTS, READER_SESSION,
  READER_AUDIO_TRANSCRIPT, READER_AUDIO_PLAYER, READER_ANNOTATIONS,
} = window;

function Ico({ d, size = 16, sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const I = {
  back:    <Ico d="M15 6l-6 6 6 6"/>,
  aa:      <Ico d={["M5 18L12 4l7 14","M8 13h8"]} sw={2}/>,
  bookm:   <Ico d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>,
  cloud:   <Ico d={["M7 18a5 5 0 0 1-1-9.9 6 6 0 0 1 11.7 1A4 4 0 0 1 17 18z","M12 12v6","M9 15l3-3 3 3"]}/>,
  toc:     <Ico d="M4 6h16M4 12h16M4 18h10"/>,
  more:    <Ico d={["M12 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z","M5 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z","M19 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"]} sw={2.4}/>,
  search:  <Ico d={["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z","M16 16l5 5"]}/>,
  share:   <Ico d={["M16 5l-4-4-4 4","M12 1v14","M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"]}/>,
  lock:    <Ico d={["M7 11V7a5 5 0 0 1 10 0v4","M5 11h14v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"]}/>,
  play:    <Ico d="M8 5v14l11-7z"/>,
  pause:   <Ico d={["M6 5h4v14H6z","M14 5h4v14h-4z"]} sw={0}/>,
  check:   <Ico d="M5 12l5 5L20 7" sw={2.4}/>,
  pen:     <Ico d={["M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7","M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"]}/>,
  arrow:   <Ico d="M5 12h14M13 6l6 6-6 6"/>,
  ask:     <Ico d="M21 12a8 8 0 1 1-3-6.2L21 4v6h-6"/>,
  hl:      <Ico d={["M9 11l-4 4 4 4","M9 11l11-7 4 4-7 11","M15 4l5 5"]}/>,
  copy:    <Ico d={["M9 9h10v10H9z","M5 15V5h10"]}/>,
  back15:  <Ico d={["M3 12a9 9 0 1 0 3-6.7","M3 3v6h6"]}/>,
  fwd30:   <Ico d={["M21 12a9 9 0 1 1-3-6.7","M21 3v6h-6"]}/>,
  trans:   <Ico d={["M4 6h16","M4 12h16","M4 18h10"]}/>,
  send:    <Ico d="M5 12l14-7-5 14-3-6-6-1z" sw={1.6}/>,
  chev:    <Ico d="M9 6l6 6-6 6"/>,
  x:       <Ico d="M6 6l12 12M6 18L18 6"/>,
};

// ── Constants for the selection demo ─────────────────────────────────────
const SELECTION_ANCHOR = "Una de las cosas que aprendí en consulta";
const SELECTION_PHRASE = "tristeza y depresión no son lo mismo";

// ── Top bar ─────────────────────────────────────────────────────────────
function ReaderTop({ tweaks, setTweak, onToggleAa, aaOpen }) {
  return (
    <header className="reader-top">
      <div className="reader-top-l">
        <button className="reader-top-back" aria-label="Atrás" type="button">
          {I.back} <span style={{ letterSpacing: ".02em" }}>Detalle</span>
        </button>
        <div className="reader-top-crumb">
          <span className={"reader-top-crumb-cover cover-" + READER_BOOK.cover}></span>
          <div className="reader-top-crumb-meta">
            <div className="reader-top-crumb-book">{READER_BOOK.title}</div>
            <div className="reader-top-crumb-chap">
              Cap. {READER_CHAPTER.num} de {READER_BOOK.totalChapters} · {READER_CHAPTER.totalMin} min
            </div>
          </div>
          {tweaks.sampleMode && <window.SampleBadge/>}
        </div>
      </div>
      <div className="reader-top-r">
        <div className="reader-mode" role="tablist" aria-label="Modo de lectura" data-onb="mode">
          <button
            type="button" role="tab" aria-selected={tweaks.mode === "libro"}
            className={"reader-mode-btn " + (tweaks.mode === "libro" ? "is-on" : "")}
            onClick={() => setTweak("mode", "libro")}
          >Modo Libro</button>
          <button
            type="button" role="tab" aria-selected={tweaks.mode === "guia"}
            className={"reader-mode-btn " + (tweaks.mode === "guia" ? "is-on" : "")}
            onClick={() => setTweak("mode", "guia")}
          >
            Modo Guía
            {tweaks.tier === "free" && (
              <span className="reader-mode-btn-pro">{I.lock} Pro</span>
            )}
          </button>
        </div>
        <button className="reader-top-iconbtn" aria-label="Buscar en el libro" onClick={() => setTweak("overlay", "search")}>{I.search}</button>
        <button
          className="reader-top-iconbtn"
          aria-label="Descargas y offline"
          onClick={() => setTweak("overlay", "downloads")}
          title="Descargas offline"
        >{I.cloud}</button>
        {tweaks.showStreak !== false && (
          <window.StreakChip
            days={tweaks.streakDays || 7}
            todayMin={tweaks.todayMin || 12}
            goalMin={tweaks.goalMin || 15}
            onClick={() => setTweak("overlay", "journey")}
          />
        )}
        <button className="reader-top-iconbtn" aria-label="Tamaño y tema" onClick={onToggleAa}>{I.aa}</button>
        <button className="reader-top-iconbtn" aria-label="Subrayados" onClick={() => setTweak("annoOpen", !tweaks.annoOpen)}>{I.hl}</button>
        <button className="reader-top-iconbtn" aria-label="Más">{I.more}</button>
      </div>
      <div className="reader-top-progress">
        <div className="reader-top-progress-fill" style={{ width: Math.round(READER_SESSION.chapterProgress * 100) + "%" }}/>
      </div>
      {aaOpen && <window.AaAdvanced tweaks={tweaks} setTweak={setTweak} onCloseAcc={() => setTweak("overlay", "accessibility")}/>}
    </header>
  );
}

// ── Aa popover ──────────────────────────────────────────────────────────
function AaPopover({ tweaks, setTweak }) {
  const steps = [0.9, 1.0, 1.1, 1.2];
  return (
    <div className="aa-pop">
      <div className="aa-pop-row">
        <span className="aa-pop-lbl">Tamaño · {Math.round(tweaks.fontScale * 100)}%</span>
        <div className="aa-pop-bar">
          {steps.map((s) => (
            <button
              key={s}
              className={"aa-pop-step " + (Math.abs(tweaks.fontScale - s) < 0.05 ? "is-on" : "")}
              onClick={() => setTweak("fontScale", s)}
              type="button"
              style={{ fontSize: 10 + (s - 0.9) * 8 + "px" }}
            >Aa</button>
          ))}
        </div>
      </div>
      <div className="aa-pop-row">
        <span className="aa-pop-lbl">Tipografía</span>
        <div className="aa-pop-fonts">
          <button
            type="button"
            className={"aa-pop-font f-serif " + (tweaks.bodyFont === "serif" ? "is-on" : "")}
            onClick={() => setTweak("bodyFont", "serif")}
          >Newsreader</button>
          <button
            type="button"
            className={"aa-pop-font f-sans " + (tweaks.bodyFont === "sans" ? "is-on" : "")}
            onClick={() => setTweak("bodyFont", "sans")}
          >Geist Sans</button>
        </div>
      </div>
      <div className="aa-pop-row">
        <span className="aa-pop-lbl">Papel</span>
        <div className="aa-pop-themes">
          <button className={"aa-pop-theme t-light " + (tweaks.theme === "light" ? "is-on" : "")} onClick={() => setTweak("theme", "light")} type="button">Claro</button>
          <button className={"aa-pop-theme t-sepia " + (tweaks.theme === "sepia" ? "is-on" : "")} onClick={() => setTweak("theme", "sepia")} type="button">Sepia</button>
          <button className={"aa-pop-theme t-dark "  + (tweaks.theme === "dark"  ? "is-on" : "")} onClick={() => setTweak("theme", "dark")} type="button">Oscuro</button>
        </div>
      </div>
    </div>
  );
}

// ── Chapter TOC (left rail) ─────────────────────────────────────────────
function TocLessons() {
  return (
    <React.Fragment>
      <div className="reader-toc-chap">
        <div className="reader-toc-chap-num">Capítulo {String(READER_CHAPTER.num).padStart(2, "0")}</div>
        <h2 className="reader-toc-chap-title">{READER_CHAPTER.title}</h2>
        <div className="reader-toc-chap-meta">{READER_CHAPTER.totalLessons} lecciones · {READER_CHAPTER.totalMin} min</div>
      </div>
      <div className="reader-toc-list">
        {READER_LESSONS.map((l) => {
          const cls =
            l.state === "current" ? "is-on" :
            l.state === "done"    ? "is-done" : "";
          return (
            <div key={l.n} className={"reader-toc-row " + cls}>
              {l.state === "done" ? (
                <span className="reader-toc-tick">{I.check}</span>
              ) : (
                <span className="reader-toc-num">{String(l.n).padStart(2, "0")}</span>
              )}
              <span className="reader-toc-title">{l.title}</span>
              <span className="reader-toc-time">{l.min} min</span>
            </div>
          );
        })}
      </div>
    </React.Fragment>
  );
}

function TocBook() {
  return (
    <div className="reader-toc-book">
      {READER_CHAPTERS.map((c) => {
        const cls =
          c.state === "current" ? "is-on" :
          c.state === "done"    ? "is-done" : "";
        return (
          <div key={c.n} className={"reader-toc-bookrow " + cls}>
            <span className="reader-toc-bookrow-num">{String(c.n).padStart(2, "0")}</span>
            <div>
              <div className="reader-toc-bookrow-title">{c.title}</div>
              <div className="reader-toc-bookrow-meta">
                {c.state === "done" && <span className="reader-toc-bookrow-tick">{I.check}</span>}
                <span>{c.min} min</span>
                {c.state === "current" && <span className="reader-toc-bookrow-current">Aquí</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TocHighlightsList({ onJump }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {READER_ANNOTATIONS.slice(0, 5).map((a, i) => (
        <div key={i} className="reader-toc-hl" onClick={onJump}>
          "{a.text}"
          <div className="reader-toc-hl-meta">Cap. {a.chapter} · Lec. {a.lessonN} · {a.when}</div>
        </div>
      ))}
      <button
        type="button"
        className="reader-rail-eco-back"
        style={{ alignSelf: "flex-start" }}
        onClick={onJump}
      >
        Abrir panel completo {I.arrow}
      </button>
    </div>
  );
}

function TocRail({ tab, onTab, onOpenAnno }) {
  return (
    <aside className="reader-toc">
      <div className="reader-toc-tabs" role="tablist" aria-label="Navegación">
        <button
          type="button" role="tab"
          className={"reader-toc-tab " + (tab === "book" ? "is-on" : "")}
          onClick={() => onTab("book")}
        >Libro</button>
        <button
          type="button" role="tab"
          className={"reader-toc-tab " + (tab === "lessons" ? "is-on" : "")}
          onClick={() => onTab("lessons")}
        >Lecciones</button>
        <button
          type="button" role="tab"
          className={"reader-toc-tab " + (tab === "highlights" ? "is-on" : "")}
          onClick={() => onTab("highlights")}
        >Subrayados</button>
      </div>
      {tab === "book"       && <TocBook/>}
      {tab === "lessons"    && <TocLessons/>}
      {tab === "highlights" && <TocHighlightsList onJump={onOpenAnno}/>}
    </aside>
  );
}

// ── Annotations panel (drawer over reading area) ────────────────────────
function AnnotationsPanel({ onClose }) {
  const [filter, setFilter] = React.useState("all");
  const filtered = filter === "all"
    ? READER_ANNOTATIONS
    : filter === "notes"
      ? READER_ANNOTATIONS.filter((a) => a.kind === "note")
      : READER_ANNOTATIONS.filter((a) => a.kind === "highlight" && a.color === filter);

  // group by chapter
  const groups = filtered.reduce((acc, a) => {
    const k = "Cap. " + String(a.chapter).padStart(2, "0");
    (acc[k] = acc[k] || []).push(a);
    return acc;
  }, {});
  const groupKeys = Object.keys(groups);

  return (
    <div className="reader-anno-scrim" onClick={onClose}>
      <aside className="reader-anno" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Tus subrayados y notas">
        <header className="reader-anno-head">
          <div className="reader-anno-head-row">
            <div>
              <div className="reader-anno-title">Tus subrayados y notas</div>
              <div className="reader-anno-meta" style={{ marginTop: 4 }}>
                {READER_ANNOTATIONS.length} en este libro · {READER_ANNOTATIONS.filter((a) => a.kind === "note").length} notas
              </div>
            </div>
            <button className="reader-anno-close" aria-label="Cerrar" onClick={onClose}>{I.x}</button>
          </div>
          <div className="reader-anno-filters">
            <button
              type="button"
              className={"reader-anno-filter " + (filter === "all" ? "is-on" : "")}
              onClick={() => setFilter("all")}
            >Todo</button>
            <button
              type="button"
              className={"reader-anno-filter " + (filter === "notes" ? "is-on" : "")}
              onClick={() => setFilter("notes")}
            >{I.pen} Con nota</button>
            <button
              type="button"
              className={"reader-anno-filter " + (filter === "lavender" ? "is-on" : "")}
              onClick={() => setFilter("lavender")}
            ><span className="reader-anno-filter-dot c-lavender"></span> Lila</button>
            <button
              type="button"
              className={"reader-anno-filter " + (filter === "yellow" ? "is-on" : "")}
              onClick={() => setFilter("yellow")}
            ><span className="reader-anno-filter-dot c-yellow"></span> Amarillo</button>
            <button
              type="button"
              className={"reader-anno-filter " + (filter === "sage" ? "is-on" : "")}
              onClick={() => setFilter("sage")}
            ><span className="reader-anno-filter-dot c-sage"></span> Verde</button>
            <button
              type="button"
              className={"reader-anno-filter " + (filter === "rose" ? "is-on" : "")}
              onClick={() => setFilter("rose")}
            ><span className="reader-anno-filter-dot c-rose"></span> Rosa</button>
          </div>
        </header>

        <div className="reader-anno-list">
          {filtered.length === 0 && (
            <div className="reader-anno-empty">
              <div className="reader-anno-empty-h">Sin coincidencias</div>
              <div className="reader-anno-empty-s">Prueba con otro filtro.</div>
            </div>
          )}
          {groupKeys.map((g) => (
            <React.Fragment key={g}>
              <div className="reader-anno-group">{g}</div>
              {groups[g].map((a, i) => (
                <div key={i} className="reader-anno-card">
                  <header className="reader-anno-card-head">
                    <span className={"reader-anno-card-dot c-" + a.color}></span>
                    <span className="reader-anno-card-kind">{a.kind === "note" ? "Nota" : "Subrayado"}</span>
                    <span className="reader-anno-card-spacer"></span>
                    <span className="reader-anno-card-when">{a.when}</span>
                  </header>
                  <p className="reader-anno-card-text">"{a.text}"</p>
                  {a.note && <div className="reader-anno-card-note">{a.note}</div>}
                  <footer className="reader-anno-card-foot">
                    <span className="reader-anno-card-where">Lección {a.lessonN} · {a.lessonTitle}</span>
                    <button className="reader-anno-card-jump" type="button">Ir al pasaje →</button>
                  </footer>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </aside>
    </div>
  );
}

// ── Resume banner ───────────────────────────────────────────────────────
function ResumeBanner({ onDismiss }) {
  const r = READER_SESSION.resumeFrom;
  return (
    <div className="reader-resume" role="region" aria-label="Continuar lectura">
      <span className="reader-resume-avatar">📖</span>
      <div className="reader-resume-meta">
        <div className="reader-resume-eyebrow">Continúa donde quedaste</div>
        <div className="reader-resume-title">Lección {String(r.lessonN).padStart(2, "0")} · {r.lessonTitle}</div>
        <div className="reader-resume-sub">Última lectura {READER_SESSION.lastReadAt} · llevas {READER_SESSION.startedAtMin} min en el capítulo</div>
      </div>
      <button className="reader-resume-cta" type="button">Continuar →</button>
      <button className="reader-resume-close" aria-label="Cerrar" onClick={onDismiss}>{I.x}</button>
    </div>
  );
}
function EcoRailPrompts({ onStart }) {
  return (
    <section className="reader-rail-eco">
      <header className="reader-rail-eco-head">
        <span className="reader-rail-eco-avatar">✦</span>
        <div>
          <div className="reader-rail-eco-id">Eco</div>
          <div className="reader-rail-eco-status">Está aquí mientras lees</div>
        </div>
      </header>
      <p className="reader-rail-eco-body">
        Lo que digas o preguntes queda solo entre nosotros. Toca cualquier sugerencia para empezar.
      </p>
      <div className="reader-rail-eco-prompts">
        {READER_ECO_PROMPTS.map((p, i) => (
          <button key={i} className="reader-rail-eco-prompt" onClick={() => onStart(p)}>{p}</button>
        ))}
      </div>
    </section>
  );
}

// ── Right rail — Eco helper (conversation mode) ────────────────────────
function EcoRailThread({ onBack }) {
  const [draft, setDraft] = React.useState("");
  return (
    <section className="reader-rail-eco">
      <header className="reader-rail-eco-head">
        <span className="reader-rail-eco-avatar">✦</span>
        <div>
          <div className="reader-rail-eco-id">Eco</div>
          <div className="reader-rail-eco-status">Pensando contigo</div>
        </div>
      </header>
      <div className="reader-rail-eco-anchor">
        <span className="reader-rail-eco-anchor-eyebrow">Sobre este pasaje</span>
        <span className="reader-rail-eco-anchor-text">{READER_ECO_THREAD.anchor}</span>
      </div>
      <div className="reader-rail-eco-thread">
        {READER_ECO_THREAD.messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "reader-rail-eco-msg-user" : "reader-rail-eco-msg-eco"}>
            {m.text}
          </div>
        ))}
        <window.EcoCitationCard onJump={() => {
          // Scroll into view the in-page anchor (the selection paragraph).
          const el = document.querySelector(".sel-anchor");
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        }}/>
        <div className="reader-rail-eco-msg-typing" aria-label="Eco está escribiendo">
          <span></span><span></span><span></span>
        </div>
      </div>
      <div className="reader-rail-eco-composer">
        <input
          type="text"
          placeholder="Pregúntale algo sobre lo que lees…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="reader-rail-eco-composer-send" aria-label="Enviar">{I.send}</button>
      </div>
      <button className="reader-rail-eco-back" type="button" onClick={onBack}>
        {I.back} Volver a sugerencias
      </button>
    </section>
  );
}

// ── Right rail wrapper ──────────────────────────────────────────────────
function EcoRail({ tweaks, setTweak }) {
  return (
    <aside className="reader-rail" data-onb="eco">
      {tweaks.ecoConv ? (
        <EcoRailThread onBack={() => setTweak("ecoConv", false)}/>
      ) : (
        <EcoRailPrompts onStart={() => setTweak("ecoConv", true)}/>
      )}
      <section className="reader-rail-actions">
        <button className="reader-rail-action" onClick={() => setTweak("selection", !tweaks.selection)}>
          <span className="reader-rail-action-icon">{I.hl}</span>
          <div>
            <div className="reader-rail-action-lbl">Subrayar selección</div>
            <div className="reader-rail-action-sub">Guarda la frase en tu diario.</div>
          </div>
          <span className="reader-rail-action-chev">→</span>
        </button>
        <button className="reader-rail-action" onClick={() => { setTweak("selection", true); setTweak("note", !tweaks.note); }}>
          <span className="reader-rail-action-icon">{I.pen}</span>
          <div>
            <div className="reader-rail-action-lbl">Nota al margen</div>
            <div className="reader-rail-action-sub">Tu reacción para este pasaje.</div>
          </div>
          <span className="reader-rail-action-chev">→</span>
        </button>
        <button className="reader-rail-action">
          <span className="reader-rail-action-icon">{I.bookm}</span>
          <div>
            <div className="reader-rail-action-lbl">Marcar página</div>
            <div className="reader-rail-action-sub">Vuelve aquí desde Inicio.</div>
          </div>
          <span className="reader-rail-action-chev">→</span>
        </button>
      </section>
    </aside>
  );
}

// ── Selection popover ───────────────────────────────────────────────────
function SelectionPopover({ onNote, onEco, onShare }) {
  const [color, setColor] = React.useState("c-lavender");
  return (
    <span className="sel-pop" role="menu" contentEditable={false}>
      <span className="sel-pop-colors">
        {["c-lavender", "c-yellow", "c-sage", "c-rose"].map((c) => (
          <button
            key={c}
            type="button"
            className={"sel-pop-color " + c + (color === c ? " is-on" : "")}
            aria-label={"Subrayar en " + c}
            onClick={() => setColor(c)}
          />
        ))}
      </span>
      <span className="sel-pop-sep"></span>
      <button type="button" className="sel-pop-btn" onClick={onNote}>{I.pen} Nota</button>
      <span className="sel-pop-sep"></span>
      <button type="button" className="sel-pop-btn" onClick={onEco}>✦ Preguntar a Eco</button>
      <span className="sel-pop-sep"></span>
      <button type="button" className="sel-pop-btn" onClick={onShare} aria-label="Compartir cita">{I.share} Compartir</button>
      <span className="sel-pop-sep"></span>
      <button type="button" className="sel-pop-btn" aria-label="Copiar">{I.copy}</button>
    </span>
  );
}

// ── Block renderers ─────────────────────────────────────────────────────
function Prose({ body, selection, onNote, onEco, onShare, editHighlight, onCloseEdit, onDeleteHighlight, communityHeat, onOpenHeat }) {
  // Existing saved highlight (visible always).
  if (body.startsWith("Notar el cuerpo cambia todo")) {
    return (
      <p className="reader-prose">
        <span className="reader-hl-anchor">
          <mark>Notar el cuerpo cambia todo.</mark>
          {editHighlight && (
            <window.HighlightEditPopover
              color="yellow"
              hasNote={false}
              onClose={onCloseEdit}
              onDelete={onDeleteHighlight}
              onEditNote={() => {}}
            />
          )}
        </span>
        {" "}Mientras la mente está ocupada explicándose la tristeza — buscando culpables,
        armando argumentos, prometiéndose que mañana estará mejor — el cuerpo simplemente la está sintiendo. Y ese sentir, sin palabras,
        es el único lugar donde la tristeza realmente puede pasar.
        {communityHeat && window.HeatMark && <window.HeatMark body={body} onOpen={onOpenHeat}/>}
      </p>
    );
  }
  // Selection demo paragraph.
  if (body.startsWith(SELECTION_ANCHOR)) {
    return (
      <p className="reader-prose" data-onb="prose">
        Una de las cosas que aprendí en consulta — y que sigo aprendiendo — es que{" "}
        <span className="sel-anchor">
          <span className="sel-text c-lavender">{SELECTION_PHRASE}</span>
          {selection && <SelectionPopover onNote={onNote} onEco={onEco} onShare={onShare}/>}
        </span>
        . La tristeza es una visita. Llega, se queda lo que tenga que quedarse, y se va.
        Trae información: dice qué cosa nos importaba, qué perdimos, qué echamos de menos.
        La depresión, en cambio, es cuando la visita se instala y trae sus propias llaves.
        {communityHeat && window.HeatMark && <window.HeatMark body={body} onOpen={onOpenHeat}/>}
      </p>
    );
  }
  return (
    <p className="reader-prose">
      {body}
      {communityHeat && window.HeatMark && <window.HeatMark body={body} onOpen={onOpenHeat}/>}
    </p>
  );
}

function PullQuote({ text }) {
  return <blockquote className="reader-pq">{text}</blockquote>;
}

function Callout({ author, body }) {
  return (
    <aside className="reader-callout">
      <header className="reader-callout-head">
        <span className="reader-callout-avatar">MS</span>
        <div>
          <div className="reader-callout-id">{author}</div>
          <div className="reader-callout-label">De la autora</div>
        </div>
      </header>
      <p className="reader-callout-body">"{body}"</p>
    </aside>
  );
}

// ── Margin note inline editor ───────────────────────────────────────────
function MarginNote({ onClose }) {
  const [text, setText] = React.useState(
    "Pensar la tristeza como una visita — no como una sentencia. Me sirve para no apurarla cuando viene."
  );
  return (
    <div className="reader-note" role="dialog" aria-label="Nota al margen">
      <div className="reader-note-eyebrow">{I.pen} Tu nota · borrador</div>
      <div className="reader-note-quote">"{SELECTION_PHRASE}"</div>
      <textarea
        className="reader-note-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="¿Qué te dejó esta frase?"
      />
      <div className="reader-note-foot">
        <span className="reader-note-meta">Cap. 5 · Lección 01 · {text.length} caracteres</span>
        <div className="reader-note-actions">
          <button type="button" className="reader-note-btn is-ghost" onClick={onClose}>Descartar</button>
          <button type="button" className="reader-note-btn">Guardar nota</button>
        </div>
      </div>
    </div>
  );
}

// ── Audio block (idle vs playing vs transcript) ─────────────────────────
function AudioBlock({ block, audio, setAudio }) {
  const isPlaying = audio !== "idle";
  const showTranscript = audio === "transcript";

  if (!isPlaying) {
    return (
      <div className="reader-audio">
        <button className="reader-audio-play" aria-label="Reproducir" onClick={() => setAudio("playing")}>{I.play}</button>
        <div>
          <div className="reader-audio-eyebrow">Audio guiado</div>
          <div className="reader-audio-title">{block.title}</div>
          <div className="reader-audio-sub">{block.sub}</div>
        </div>
        <span className="reader-audio-time">{READER_AUDIO_PLAYER.duration}</span>
      </div>
    );
  }

  const pct = Math.round(READER_AUDIO_PLAYER.progress * 100);

  return (
    <div className="reader-audio is-playing">
      <div className="reader-audio-head">
        <button className="reader-audio-play" aria-label="Pausar" onClick={() => setAudio("idle")}>{I.pause}</button>
        <div>
          <div className="reader-audio-eyebrow">Audio guiado · sonando</div>
          <div className="reader-audio-title">{block.title}</div>
          <div className="reader-audio-sub">{block.sub}</div>
        </div>
        <span className="reader-audio-time">{READER_AUDIO_PLAYER.speed}</span>
      </div>
      <div className="reader-audio-scrub">
        <span>{READER_AUDIO_PLAYER.current}</span>
        <div className="reader-audio-scrub-bar">
          <div className="reader-audio-scrub-fill" style={{ width: pct + "%" }}/>
          <div className="reader-audio-scrub-thumb" style={{ left: pct + "%" }}/>
        </div>
        <span>{READER_AUDIO_PLAYER.duration}</span>
      </div>
      <div className="reader-audio-tools">
        <button type="button" className="reader-audio-tool" aria-label="Atrás 15s">{I.back15} 15</button>
        <button type="button" className="reader-audio-tool" aria-label="Adelante 30s">{I.fwd30} 30</button>
        <button type="button" className="reader-audio-tool">{READER_AUDIO_PLAYER.speed}</button>
        <span className="reader-audio-tool-spacer"/>
        <button
          type="button"
          className={"reader-audio-tool " + (showTranscript ? "is-on" : "")}
          onClick={() => setAudio(showTranscript ? "playing" : "transcript")}
        >
          {I.trans} Transcripción
        </button>
      </div>
      {showTranscript && (
        <div className="reader-audio-transcript">
          {READER_AUDIO_TRANSCRIPT.map((line, i) => (
            <div key={i} className={"reader-audio-tr-line " + (line.on ? "is-on" : "")}>
              <span className="reader-audio-tr-time">{line.t}</span>
              <span>{line.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Reflection({ block }) {
  const [pick, setPick] = React.useState(null);
  return (
    <div className="reader-reflection">
      <span className="reader-reflection-eyebrow">Reflexión rápida</span>
      <div className="reader-reflection-q">{block.question}</div>
      <div className="reader-reflection-chips">
        {block.chips.map((c) => (
          <button
            key={c}
            className={"reader-reflection-chip " + (pick === c ? "is-on" : "")}
            onClick={() => setPick(c)}
            type="button"
          >{c}</button>
        ))}
      </div>
    </div>
  );
}

function Checklist({ block }) {
  const [checked, setChecked] = React.useState({});
  return (
    <div className="reader-check">
      <span className="reader-check-eyebrow">Auto-observación</span>
      <h3 className="reader-check-title">{block.title}</h3>
      <p className="reader-check-sub">{block.sub}</p>
      <ul className="reader-check-items">
        {block.items.map((item, i) => (
          <li
            key={i}
            className={"reader-check-item " + (checked[i] ? "is-on" : "")}
            onClick={() => setChecked((c) => ({ ...c, [i]: !c[i] }))}
          >
            <span className="reader-check-box">{checked[i] && I.check}</span>
            <span className="reader-check-label">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Exercise({ block, onOpen }) {
  return (
    <div className="reader-ex">
      <span className="reader-ex-eyebrow">Ejercicio</span>
      <h3 className="reader-ex-title">{block.title}</h3>
      <div className="reader-ex-sub">{block.sub}</div>
      <p className="reader-ex-body">"{block.body}"</p>
      <button className="reader-ex-cta" onClick={onOpen}>Empezar ahora {I.arrow}</button>
    </div>
  );
}

function LockedTease({ kind }) {
  const map = {
    audio: { glyph: "🎧", h: "Audio guiado · Modo Guía",       s: "Marina te guía con la voz — solo en Pro." },
    reflection: { glyph: "✎", h: "Reflexión rápida · Modo Guía", s: "Una pausa breve para responderte — solo en Pro." },
    checklist: { glyph: "✓", h: "Auto-observación · Modo Guía",  s: "Una lista para notarte — solo en Pro." },
    exercise: { glyph: "🌱", h: "Ejercicio · Modo Guía",          s: "Una práctica de 10 min — solo en Pro." },
  };
  const m = map[kind];
  return (
    <div className="reader-locked-tease">
      <span className="reader-locked-glyph">{m.glyph}</span>
      <div className="reader-locked-meta">
        <div className="reader-locked-h">{m.h}</div>
        <div className="reader-locked-s">{m.s}</div>
      </div>
      <button className="reader-locked-cta">Desbloquear con Pro {I.arrow}</button>
    </div>
  );
}

function LessonHead({ block }) {
  return (
    <header className="reader-lesson-head">
      <span className="reader-lesson-head-num">Lección {String(block.n).padStart(2, "0")}</span>
      <h2 className="reader-lesson-head-title">{block.title}</h2>
      <span className="reader-lesson-head-min">{block.min} min</span>
    </header>
  );
}

function ChapterEnd({ block }) {
  return (
    <div className="reader-end">
      <div className="reader-end-eyebrow">{I.check} Capítulo terminado</div>
      <h3 className="reader-end-h">"No siempre necesita ser resuelta; a veces solo necesita ser acompañada hasta la puerta."</h3>
      <p className="reader-end-s">Siguiente · <strong>Cap. {block.next.n}</strong> · {block.next.title}</p>
      <button className="reader-end-cta">Empezar capítulo {block.next.n} {I.arrow}</button>
    </div>
  );
}

// ── Block dispatcher ────────────────────────────────────────────────────
function Block({ block, tweaks, setTweak }) {
  const guideOnly = !!block.guideOnly;
  const showAsGuide = tweaks.mode === "guia" && tweaks.tier === "pro";
  // Audio block — when demo state is on, allow rendering even if normally locked.
  if (block.kind === "audio" && tweaks.audio !== "idle") {
    return <AudioBlock block={block} audio={tweaks.audio} setAudio={(v) => setTweak("audio", v)}/>;
  }
  if (guideOnly && !showAsGuide) {
    return <LockedTease kind={block.kind}/>;
  }
  switch (block.kind) {
    case "lesson-head":  return <LessonHead block={block}/>;
    case "prose": {
      const isSelectionPara = block.body.startsWith(SELECTION_ANCHOR);
      const showSel = isSelectionPara && (tweaks.selection || tweaks.note);
      return (
        <React.Fragment>
          <Prose
            body={block.body}
            selection={isSelectionPara && tweaks.selection}
            onNote={() => setTweak("note", true)}
            onEco={() => setTweak("ecoConv", true)}
            onShare={() => setTweak("overlay", "share-quote")}
            editHighlight={tweaks.editHighlight}
            onCloseEdit={() => setTweak("editHighlight", false)}
            onDeleteHighlight={() => setTweak("editHighlight", false)}
            communityHeat={tweaks.communityHeat !== false}
            onOpenHeat={() => setTweak("overlay", "community-heat")}
          />
          {isSelectionPara && tweaks.note && (
            <MarginNote onClose={() => setTweak("note", false)}/>
          )}
        </React.Fragment>
      );
    }
    case "pullquote":    return <PullQuote text={block.text}/>;
    case "callout":      return <Callout author={block.author} body={block.body}/>;
    case "audio":        return <AudioBlock block={block} audio={tweaks.audio} setAudio={(v) => setTweak("audio", v)}/>;
    case "reflection":   return <Reflection block={block}/>;
    case "checklist":    return <Checklist block={block}/>;
    case "exercise":     return <Exercise block={block} onOpen={() => setTweak("overlay", "exercise")}/>;
    case "chapter-end":  return tweaks.chapterEndRich
      ? <window.RichChapterEnd next={block.next}/>
      : <ChapterEnd block={block}/>;
    default: return null;
  }
}

// ── Mini-player (sticky) ────────────────────────────────────────────────
function MiniPlayer({ audio, setAudio }) {
  const pct = Math.round(READER_AUDIO_PLAYER.progress * 100);
  return (
    <div className="reader-mini-floating">
      <div className="reader-mini" role="region" aria-label="Reproduciendo">
        <button className="reader-mini-play" aria-label="Pausar" onClick={() => setAudio("idle")}>{I.pause}</button>
        <div className="reader-mini-meta">
          <div className="reader-mini-eyebrow">Audio guiado · Cap. 5 · Lección 02</div>
          <div className="reader-mini-title">Encontrar la tristeza en el cuerpo</div>
          <div className="reader-mini-progress">
            <span className="reader-mini-time">{READER_AUDIO_PLAYER.current}</span>
            <div className="reader-mini-progress-bar">
              <div className="reader-mini-progress-fill" style={{ width: pct + "%" }}/>
            </div>
            <span className="reader-mini-time">{READER_AUDIO_PLAYER.duration}</span>
          </div>
        </div>
        <div className="reader-mini-actions">
          <button
            className="reader-mini-iconbtn"
            aria-label={audio === "transcript" ? "Cerrar transcripción" : "Ver transcripción"}
            onClick={() => setAudio(audio === "transcript" ? "playing" : "transcript")}
          >{I.trans}</button>
          <button className="reader-mini-iconbtn" aria-label="Cerrar" onClick={() => setAudio("idle")}>{I.x}</button>
        </div>
      </div>
    </div>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <header className="reader-hero">
      <span className="reader-hero-eyebrow">Capítulo {READER_CHAPTER.num} · Emociones en construcción</span>
      <h1 className="reader-hero-title">{READER_CHAPTER.title}</h1>
      <p className="reader-hero-sub">{READER_CHAPTER.subtitle}</p>
      <div className="reader-hero-meta">
        <span className="reader-hero-meta-author">
          <span className="reader-hero-meta-avatar">{READER_BOOK.authorInitials}</span>
          {READER_BOOK.author}
        </span>
        <span className="reader-hero-meta-sep"/>
        <span>{READER_CHAPTER.totalLessons} lecciones</span>
        <span className="reader-hero-meta-sep"/>
        <span>{READER_CHAPTER.totalMin} min · llevas {READER_SESSION.startedAtMin}</span>
      </div>
    </header>
  );
}

// ── Page ────────────────────────────────────────────────────────────────
function WebReader({ tweaks, setTweak }) {
  const [aaOpen, setAaOpen] = React.useState(false);
  // Listen for global Aa toggle (from KeyboardHost on 'A').
  React.useEffect(() => {
    const h = () => setAaOpen((v) => !v);
    window.addEventListener("psico:toggle-aa", h);
    return () => window.removeEventListener("psico:toggle-aa", h);
  }, []);

  const cls =
    "web theme-" + tweaks.theme +
    (tweaks.bodyFont === "sans" ? " font-sans-body" : "") +
    (tweaks.justify ? " prose-justify" : "") +
    (tweaks.hyphens ? " prose-hyphens" : "") +
    " prose-margins-" + (tweaks.margins || "medium") +
    (tweaks.highContrast  ? " acc-high-contrast" : "") +
    (tweaks.dyslexicFont  ? " acc-dyslexic"      : "") +
    (tweaks.spaciousType  ? " acc-spacious"      : "") +
    (tweaks.reducedMotion ? " acc-reduced-motion" : "") +
    (tweaks.largeTargets  ? " acc-large-targets" : "") +
    (tweaks.focusRings    ? " acc-focus-rings"   : "");

  const styleVars = {
    ["--reader-font-scale"]: tweaks.fontScale,
    ["--reader-line-height"]: tweaks.lineHeight || 1.6,
  };

  return (
    <div className={cls} style={styleVars}>
      {tweaks.offline && tweaks.offline !== "off" && (
        <window.OfflineBanner
          kind={tweaks.offline}
          onAction={() => setTweak("overlay", "downloads")}
        />
      )}
      <ReaderTop
        tweaks={tweaks}
        setTweak={setTweak}
        aaOpen={aaOpen}
        onToggleAa={() => setAaOpen((v) => !v)}
      />
      <div className="reader-body">
        <TocRail
          tab={tweaks.tocTab}
          onTab={(v) => setTweak("tocTab", v)}
          onOpenAnno={() => setTweak("annoOpen", true)}
        />
        <div className="reader-page-col">
          <div className="reader-page">
            <div className="reader-page-inner">
              <Hero/>
              {tweaks.sampleMode && (
                <window.SampleBanner
                  remainingMin={4}
                  onUpgrade={() => setTweak("overlay", "paywall-hard")}
                />
              )}
              {tweaks.resume && (
                <ResumeBanner onDismiss={() => setTweak("resume", false)}/>
              )}
              {READER_BLOCKS.map((b, i) => (
                <Block key={i} block={b} tweaks={tweaks} setTweak={setTweak}/>
              ))}
              {tweaks.sampleMode && (
                <window.SoftPaywall
                  onUpgrade={() => setTweak("overlay", "paywall-hard")}
                  onClose={() => setTweak("sampleMode", false)}
                />
              )}
            </div>
          </div>
          {tweaks.audio !== "idle" && (
            <MiniPlayer audio={tweaks.audio} setAudio={(v) => setTweak("audio", v)}/>
          )}
          {tweaks.annoOpen && (
            <AnnotationsPanel onClose={() => setTweak("annoOpen", false)}/>
          )}
        </div>
        <EcoRail tweaks={tweaks} setTweak={setTweak}/>
      </div>
      {tweaks.overlay === "exercise" && (
        <window.ExerciseSheet surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "search" && (
        <window.SearchSheet surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "empties" && (
        <window.EmptyStatesGallery surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "downloads" && (
        <window.DownloadsSheet surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "share-quote" && (
        <window.ShareQuoteSheet surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "paywall-hard" && (
        <window.HardPaywall
          surface="web"
          onClose={() => setTweak("overlay", "none")}
          onContinueFree={() => { setTweak("mode", "libro"); setTweak("overlay", "none"); }}
        />
      )}
      {tweaks.overlay === "safety" && (
        <window.SafetyCard
          surface="web"
          onClose={() => setTweak("overlay", "none")}
          onPauseEco={() => { setTweak("ecoConv", false); setTweak("overlay", "none"); }}
          onContinue={() => setTweak("overlay", "none")}
        />
      )}
      {tweaks.onboardingStep > 0 && (
        <window.OnboardingTour
          surface="web"
          step={tweaks.onboardingStep}
          onStep={(s) => setTweak("onboardingStep", s)}
          onDone={() => setTweak("onboardingStep", 0)}
        />
      )}
      {tweaks.overlay === "loading" && (
        <window.LoadingStatesGallery surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "accessibility" && (
        <window.AccessibilityPanel
          surface="web"
          tweaks={tweaks} setTweak={setTweak}
          onClose={() => setTweak("overlay", "none")}
        />
      )}
      {tweaks.overlay === "journey" && (
        <window.MyJourneyDrawer surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.readingRule && <window.ReadingRule surface="web"/>}
      {tweaks.overlay === "pause" && (
        <window.PauseCard
          surface="web"
          todayMin={tweaks.todayMin || 0}
          goalMin={tweaks.goalMin || 15}
          streakDays={tweaks.streakDays || 7}
          highlightsNew={2}
          onClose={() => setTweak("overlay", "none")}
          onContinue={() => setTweak("overlay", "none")}
        />
      )}
      {tweaks.overlay === "save-eco" && (
        <window.SaveEcoAsNote surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "audio-panel" && (
        <window.AudioPanel surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "audio-queue" && (
        <window.AudioQueueDrawer surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "keyboard" && (
        <window.KeyboardShortcuts surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "gift" && (
        <window.GiftBookSheet surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "community-heat" && (
        <window.CommunityHeatDrawer surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "tts" && (
        <window.TTSPanel surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "bookclub" && (
        <window.BookclubDrawer surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "weekly-recap" && (
        <window.WeeklyRecapEmail surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "author-onboarding" && (
        <window.AuthorOnboarding surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.ttsActive && (
        <window.TTSMiniBar
          voice="marina"
          onOpen={() => setTweak("overlay", "tts")}
          onClose={() => setTweak("ttsActive", false)}
        />
      )}
      {tweaks.overlay === "content-warning" && (
        <window.ContentWarningCard
          surface="web"
          kind="tristeza"
          onClose={() => setTweak("overlay", "none")}
          onLater={() => setTweak("overlay", "none")}
          onContinue={() => setTweak("overlay", "none")}
        />
      )}
      {tweaks.overlay === "author-page" && (
        <window.AuthorPage surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "habit-calendar" && (
        <window.HabitCalendar surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "reminders" && (
        <window.RemindersPreview surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "breath" && (
        <window.BreathBreak surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "privacy" && (
        <window.PrivacyDashboard surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "emotional-map" && (
        <window.EmotionalMap surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "home-widget" && (
        <window.HomeWidgetPreview surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "inbox" && (
        <window.InboxDrawer surface="web" onClose={() => setTweak("overlay", "none")}/>
      )}
    </div>
  );
}

window.WebReader = WebReader;
