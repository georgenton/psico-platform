// reader/extras3.jsx — Third batch: items #2, #4, #11, #12, #14, #15.
// Edit highlight popover, loading/error gallery, advanced Aa, accessibility
// panel, journey timeline, streak/goal widget.

const { READER_ANNOTATIONS: AN3, READER_CHAPTERS: CS3 } = window;

function E3I({ d, size = 16, sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const E3 = {
  x:        <E3I d="M6 6l12 12M6 18L18 6"/>,
  arrow:    <E3I d="M5 12h14M13 6l6 6-6 6"/>,
  trash:    <E3I d={["M3 6h18","M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2","M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"]}/>,
  pen:      <E3I d={["M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7","M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"]}/>,
  copy:     <E3I d={["M9 9h10v10H9z","M5 15V5h10"]}/>,
  alert:    <E3I d={["M12 2L1 21h22z","M12 9v5","M12 17h.01"]}/>,
  refresh:  <E3I d={["M21 12a9 9 0 1 1-3-6.7","M21 3v6h-6"]}/>,
  wifi:     <E3I d={["M5 12.55a11 11 0 0 1 14 0","M1.42 9a16 16 0 0 1 21.16 0","M8.53 16.11a6 6 0 0 1 6.95 0","M12 20h.01"]}/>,
  wifiOff:  <E3I d={["M2 2l20 20","M5 12.55a11 11 0 0 1 5.17-2.39","M10.71 5.05A16 16 0 0 1 22.58 9","M8.53 16.11a6 6 0 0 1 5.94-.18","M12 20h.01"]}/>,
  brain:    <E3I d={["M9.5 2A2.5 2.5 0 0 0 7 4.5v15A2.5 2.5 0 0 0 9.5 22h5A2.5 2.5 0 0 0 17 19.5v-15A2.5 2.5 0 0 0 14.5 2","M12 6c-2 0-3 1-3 3","M12 12c-2 0-3 1-3 3"]} sw={1.6}/>,
  download: <E3I d={["M12 4v12","M8 12l4 4 4-4","M5 20h14"]}/>,
  ruler:    <E3I d="M4 12h16"/>,
  flame:    <E3I d={["M12 2C10 6 6 8 6 12a6 6 0 0 0 12 0c0-2-1-3-2-4 1 3-1 5-2 5 0-4-2-7-2-11z"]}/>,
  target:   <E3I d={["M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z","M12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12z","M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"]} sw={1.4}/>,
  cal:      <E3I d={["M5 4h14a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z","M16 2v4","M8 2v4","M4 10h16"]}/>,
  star:     <E3I d="M12 2l3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z" sw={1.4}/>,
  type:     <E3I d={["M4 4v16","M20 4v16","M9 4h6","M9 20h6","M9 12h6","M12 4v16"]}/>,
  contrast: <E3I d={["M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z","M12 2v20"]} sw={1.6}/>,
  motion:   <E3I d={["M13 4l-2 8H6l1-8","M9 12l-2 8h5l1-8"]}/>,
  caption:  <E3I d={["M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z","M7 12h4","M13 12h4","M7 16h7"]}/>,
  audio:    <E3I d={["M11 5L6 9H2v6h4l5 4z","M15.5 8.5a5 5 0 0 1 0 7","M19 5a9 9 0 0 1 0 14"]}/>,
  spark:    <E3I d={["M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z"]} sw={1.4}/>,
  feather:  <E3I d={["M20 4c0 8-7 12-12 12H4l1-1 11-11h4z","M16 8L2 22","M9 15h6"]}/>,
  check:    <E3I d="M5 12l5 5L20 7" sw={2.4}/>,
};

// ────────────────────────────────────────────────────────────────────────
// #2  Edit-highlight popover — appears when clicking an existing highlight.
// Color swap (re-highlight), edit note, delete. Used inline above the mark.
// ────────────────────────────────────────────────────────────────────────
function HighlightEditPopover({ color = "yellow", hasNote = true, onClose, onChangeColor, onEditNote, onDelete, surface = "web" }) {
  const [c, setC] = React.useState(color);
  const [confirming, setConfirming] = React.useState(false);
  return (
    <div
      className={"ext3-hlpop " + (surface === "mobile" ? "is-mobile" : "")}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="ext3-hlpop-arrow" aria-hidden></div>
      <div className="ext3-hlpop-head">
        <span className="ext3-hlpop-eyebrow">Subrayado guardado · hace 2 días</span>
        <button className="ext3-hlpop-close" aria-label="Cerrar" onClick={onClose}>{E3.x}</button>
      </div>
      <div className="ext3-hlpop-row">
        <span className="ext3-hlpop-lbl">Color</span>
        <div className="ext3-hlpop-colors">
          {["lavender", "yellow", "sage", "rose"].map((x) => (
            <button
              key={x}
              type="button"
              className={"ext3-hlpop-color c-" + x + (c === x ? " is-on" : "")}
              aria-label={"Cambiar a " + x}
              onClick={() => { setC(x); onChangeColor && onChangeColor(x); }}
            />
          ))}
        </div>
      </div>
      <div className="ext3-hlpop-actions">
        <button className="ext3-hlpop-act" onClick={onEditNote}>
          {E3.pen} {hasNote ? "Editar nota" : "Agregar nota"}
        </button>
        <button className="ext3-hlpop-act">
          {E3.copy} Copiar
        </button>
        <button className="ext3-hlpop-act">
          ✦ Preguntar a Eco
        </button>
        <button
          className={"ext3-hlpop-act is-danger " + (confirming ? "is-confirm" : "")}
          onClick={() => { if (confirming) { onDelete && onDelete(); } else setConfirming(true); }}
        >
          {E3.trash} {confirming ? "Tocar de nuevo para eliminar" : "Eliminar"}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// #4  Loading + error gallery
// ────────────────────────────────────────────────────────────────────────
function SkeletonBlock({ tall }) {
  return (
    <div className={"ext3-skel " + (tall ? "is-tall" : "")} aria-hidden>
      <div className="ext3-skel-line w-100"></div>
      <div className="ext3-skel-line w-95"></div>
      <div className="ext3-skel-line w-88"></div>
      <div className="ext3-skel-line w-70"></div>
    </div>
  );
}

function ErrorCard({ kind, title, body, cta, secondary }) {
  const glyph = {
    network: E3.wifiOff,
    ai:      E3.brain,
    audio:   E3.audio,
    sync:    E3.alert,
    payment: E3.alert,
  }[kind] || E3.alert;
  const tone = kind === "network" || kind === "audio" ? "warn" : "alert";
  return (
    <div className={"ext3-error is-" + tone}>
      <div className="ext3-error-glyph">{glyph}</div>
      <div className="ext3-error-meta">
        <div className="ext3-error-h">{title}</div>
        <div className="ext3-error-s">{body}</div>
        <div className="ext3-error-actions">
          {cta && <button className="ext3-error-cta">{E3.refresh} {cta}</button>}
          {secondary && <button className="ext3-error-secondary">{secondary}</button>}
        </div>
      </div>
    </div>
  );
}

function LoadingStatesGallery({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext3-loading " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Estados de carga y error"
      >
        <header className="ext3-loading-head">
          <div>
            <span className="ext-eyebrow">Vista de revisión</span>
            <h2 className="ext3-loading-title">Cargando y errores</h2>
            <p className="ext3-loading-sub">Cómo se ve cada estado mientras esperamos o algo sale mal.</p>
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{E3.x}</button>
        </header>

        <div className="ext3-loading-grid">
          <div className="ext3-loading-card">
            <span className="ext3-loading-tag">Cap. cargando</span>
            <SkeletonBlock tall/>
            <SkeletonBlock/>
          </div>

          <div className="ext3-loading-card">
            <span className="ext3-loading-tag">Eco pensando</span>
            <div className="ext3-skel-bubble">
              <span></span><span></span><span></span>
            </div>
            <div className="ext3-skel-bubble is-bigger">
              <div className="ext3-skel-line w-100"></div>
              <div className="ext3-skel-line w-70"></div>
            </div>
          </div>

          <div className="ext3-loading-card">
            <span className="ext3-loading-tag">Audio buffering</span>
            <div className="ext3-skel-audio">
              <div className="ext3-skel-circle"></div>
              <div className="ext3-skel-audio-meta">
                <div className="ext3-skel-line w-70"></div>
                <div className="ext3-skel-line w-40"></div>
              </div>
              <div className="ext3-skel-spinner" aria-label="Cargando"></div>
            </div>
            <div className="ext3-skel-bar"></div>
          </div>

          <div className="ext3-loading-card">
            <span className="ext3-loading-tag">Descarga en progreso</span>
            <div className="ext3-skel-down">
              <div className="ext3-skel-down-num">05</div>
              <div className="ext3-skel-down-meta">
                <div className="ext3-skel-down-title">Tristeza no es debilidad</div>
                <div className="ext3-skel-down-sub">Descargando · 12 MB de 32 MB</div>
                <div className="ext3-skel-progress">
                  <div className="ext3-skel-progress-fill" style={{ width: "38%" }}></div>
                </div>
              </div>
              <button className="ext3-skel-down-cancel">Cancelar</button>
            </div>
          </div>

          <div className="ext3-loading-card">
            <span className="ext3-loading-tag">Búsqueda</span>
            <div className="ext3-skel-search">
              <div className="ext3-skel-spinner"></div>
              <span>Buscando "tristeza" en 12 capítulos…</span>
            </div>
          </div>

          <div className="ext3-loading-card">
            <span className="ext3-loading-tag">Error · sin conexión</span>
            <ErrorCard
              kind="network"
              title="Sin conexión"
              body="Eco vuelve cuando vuelva el internet. Lo que escribes se guarda local."
              cta="Reintentar"
              secondary="Seguir sin Eco"
            />
          </div>

          <div className="ext3-loading-card">
            <span className="ext3-loading-tag">Error · IA</span>
            <ErrorCard
              kind="ai"
              title="Eco está descansando"
              body="No pudimos generar una respuesta esta vez. Lo intentamos de nuevo o seguimos leyendo."
              cta="Reintentar"
            />
          </div>

          <div className="ext3-loading-card">
            <span className="ext3-loading-tag">Error · audio</span>
            <ErrorCard
              kind="audio"
              title="Audio no se pudo cargar"
              body="Es probable que sea un tema temporal del servidor. Puedes leer la transcripción mientras."
              cta="Reintentar"
              secondary="Ver transcripción"
            />
          </div>

          <div className="ext3-loading-card">
            <span className="ext3-loading-tag">Conflicto de sync</span>
            <ErrorCard
              kind="sync"
              title="Tienes 3 notas sin sincronizar"
              body="Editaste mientras estabas offline. Elegí cuál versión queda guardada — la de este dispositivo o la del servidor."
              cta="Resolver"
              secondary="Después"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// #11  Aa Avanzado — extends AaPopover with margins/justify/hyphenation/
// reading-rule/line-height. Replaces the original AaPopover when toggled.
// ────────────────────────────────────────────────────────────────────────
function AaAdvanced({ tweaks, setTweak, onCloseAcc }) {
  const margins = [
    { id: "narrow",   label: "Estrecho",   bars: [3, 18, 3] },
    { id: "medium",   label: "Cómodo",     bars: [6, 12, 6] },
    { id: "wide",     label: "Amplio",     bars: [9, 6, 9] },
  ];
  const sizes = [0.9, 1.0, 1.1, 1.2];
  const lineH = tweaks.lineHeight || 1.6;
  return (
    <div className="aa-pop ext3-aa-adv">
      <div className="aa-pop-row">
        <span className="aa-pop-lbl">Tamaño · {Math.round(tweaks.fontScale * 100)}%</span>
        <div className="aa-pop-bar">
          {sizes.map((s) => (
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

      <div className="aa-pop-row">
        <span className="aa-pop-lbl">Márgenes</span>
        <div className="ext3-aa-margins">
          {margins.map((m) => (
            <button
              key={m.id}
              type="button"
              className={"ext3-aa-margin " + (tweaks.margins === m.id ? "is-on" : "")}
              onClick={() => setTweak("margins", m.id)}
              aria-label={"Márgenes " + m.label}
            >
              <span className="ext3-aa-margin-vis">
                <span style={{ width: m.bars[0] + "px" }}></span>
                <span className="ext3-aa-margin-text" style={{ width: m.bars[1] + "px" }}></span>
                <span style={{ width: m.bars[2] + "px" }}></span>
              </span>
              <span className="ext3-aa-margin-lbl">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="aa-pop-row">
        <span className="aa-pop-lbl">Altura de línea · {lineH.toFixed(2)}</span>
        <div className="ext3-aa-slider">
          <input
            type="range" min="1.3" max="2.0" step="0.05"
            value={lineH}
            onChange={(e) => setTweak("lineHeight", parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div className="aa-pop-row">
        <span className="aa-pop-lbl">Avanzado</span>
        <div className="ext3-aa-flags">
          <label className={"ext3-aa-flag " + (tweaks.justify ? "is-on" : "")}>
            <input type="checkbox" checked={!!tweaks.justify} onChange={(e) => setTweak("justify", e.target.checked)}/>
            <span>Justificar texto</span>
          </label>
          <label className={"ext3-aa-flag " + (tweaks.hyphens ? "is-on" : "")}>
            <input type="checkbox" checked={!!tweaks.hyphens} onChange={(e) => setTweak("hyphens", e.target.checked)}/>
            <span>Separar palabras al final</span>
          </label>
          <label className={"ext3-aa-flag " + (tweaks.readingRule ? "is-on" : "")}>
            <input type="checkbox" checked={!!tweaks.readingRule} onChange={(e) => setTweak("readingRule", e.target.checked)}/>
            <span>Regla de lectura (focus line)</span>
          </label>
        </div>
      </div>

      <button className="ext3-aa-acc" onClick={onCloseAcc}>
        {E3.brain} Más opciones de accesibilidad →
      </button>
    </div>
  );
}

// Floating "reading rule" — a horizontal band that dims everything outside
// of it. Stays under cursor on web, pinned to vertical middle on mobile.
function ReadingRule({ surface = "web" }) {
  const [y, setY] = React.useState(surface === "web" ? 300 : null);
  React.useEffect(() => {
    if (surface !== "web") return;
    const onMove = (e) => {
      const surf = document.querySelector(".web");
      if (!surf) return;
      const r = surf.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) return;
      setY(e.clientY - r.top);
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, [surface]);
  const top = surface === "web" ? (y ?? 300) - 26 : "calc(50% - 26px)";
  return (
    <div className="ext3-rule" aria-hidden style={{ ["--rule-top"]: typeof top === "number" ? top + "px" : top }}>
      <div className="ext3-rule-top"/>
      <div className="ext3-rule-band"/>
      <div className="ext3-rule-bot"/>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// #12  Accessibility panel — drawer with high contrast, dyslexia font,
// reduced motion, audio captions, focus rings, larger touch targets.
// ────────────────────────────────────────────────────────────────────────
function AccessibilityPanel({ tweaks, setTweak, onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  const T = (k, def = false) => tweaks[k] === undefined ? def : !!tweaks[k];
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext3-acc " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Accesibilidad"
      >
        <header className="ext3-acc-head">
          <div>
            <span className="ext-eyebrow">Accesibilidad</span>
            <h2 className="ext3-acc-title">Que leer sea fácil para ti</h2>
            <p className="ext3-acc-sub">Estos ajustes se aplican a todo el libro y se sincronizan entre tus dispositivos.</p>
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{E3.x}</button>
        </header>

        <section className="ext3-acc-section">
          <div className="ext3-acc-section-h">{E3.contrast} Visual</div>
          <ToggleRow
            label="Alto contraste"
            sub="Aumenta el contraste entre texto y fondo en cualquier tema."
            value={T("highContrast")}
            onChange={(v) => setTweak("highContrast", v)}
          />
          <ToggleRow
            label="Fuente OpenDyslexic"
            sub="Diseñada para reducir confusiones entre letras similares."
            value={T("dyslexicFont")}
            onChange={(v) => setTweak("dyslexicFont", v)}
          />
          <ToggleRow
            label="Espaciado generoso"
            sub="Aumenta espacio entre líneas y palabras automáticamente."
            value={T("spaciousType")}
            onChange={(v) => setTweak("spaciousType", v)}
          />
        </section>

        <section className="ext3-acc-section">
          <div className="ext3-acc-section-h">{E3.motion} Movimiento</div>
          <ToggleRow
            label="Reducir animaciones"
            sub="Quita transiciones suaves y fades. Útil con sensibilidad al movimiento."
            value={T("reducedMotion")}
            onChange={(v) => setTweak("reducedMotion", v)}
          />
        </section>

        <section className="ext3-acc-section">
          <div className="ext3-acc-section-h">{E3.audio} Audio</div>
          <ToggleRow
            label="Mostrar transcripción siempre"
            sub="Las transcripciones de los audios aparecen abiertas por defecto."
            value={T("alwaysTranscript")}
            onChange={(v) => setTweak("alwaysTranscript", v)}
          />
          <ToggleRow
            label="Avisar antes de empezar audio"
            sub="Una pausa breve antes de que arranque la voz."
            value={T("audioWarn", true)}
            onChange={(v) => setTweak("audioWarn", v)}
          />
        </section>

        <section className="ext3-acc-section">
          <div className="ext3-acc-section-h">{E3.target} Interacción</div>
          <ToggleRow
            label="Botones grandes"
            sub="Aumenta el área de cada toque al menos a 48×48px."
            value={T("largeTargets")}
            onChange={(v) => setTweak("largeTargets", v)}
          />
          <ToggleRow
            label="Indicadores de foco fuertes"
            sub="Bordes visibles para navegar con teclado o un switch."
            value={T("focusRings")}
            onChange={(v) => setTweak("focusRings", v)}
          />
        </section>

        <p className="ext3-acc-foot">
          Si necesitas ajustes más allá de estos, escríbenos a <a href="mailto:hola@psico.app">hola@psico.app</a> — adaptamos el lector contigo.
        </p>
      </div>
    </div>
  );
}

function ToggleRow({ label, sub, value, onChange }) {
  return (
    <label className={"ext3-tr " + (value ? "is-on" : "")}>
      <div className="ext3-tr-meta">
        <div className="ext3-tr-lbl">{label}</div>
        <div className="ext3-tr-sub">{sub}</div>
      </div>
      <span className="ext3-switch" aria-hidden>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)}/>
        <span className="ext3-switch-track">
          <span className="ext3-switch-thumb"></span>
        </span>
      </span>
    </label>
  );
}

// ────────────────────────────────────────────────────────────────────────
// #14  Mi recorrido — timeline of everything the reader has done across
// the book, grouped by day, with anchors to highlights, notes, sessions,
// mood-afters, audio listens.
// ────────────────────────────────────────────────────────────────────────
const JOURNEY_ENTRIES = [
  { day: "Hoy",          time: "11:48", kind: "note",      chap: 5, lessonN: 1, summary: "Pensar la tristeza como una visita, no como una sentencia.", body: "Me sirve para no apurarla cuando viene." },
  { day: "Hoy",          time: "11:42", kind: "highlight", chap: 5, lessonN: 1, color: "lavender", text: "La tristeza no es un error del sistema. Es el sistema funcionando." },
  { day: "Hoy",          time: "11:18", kind: "session",   chap: 5, sessionMin: 28, lessons: 2 },
  { day: "Ayer",         time: "21:04", kind: "mood",      chap: 4, mood: "lighter",  moodLbl: "Más liviana" },
  { day: "Ayer",         time: "18:22", kind: "highlight", chap: 4, lessonN: 3, color: "sage", text: "Permitirse estar bien también es un acto de salud." },
  { day: "Ayer",         time: "18:10", kind: "audio",     chap: 4, lessonN: 2, audio: "El cuerpo de la alegría", min: 4 },
  { day: "Hace 3 días",  time: "—",     kind: "note",      chap: 3, lessonN: 2, summary: "el miedo bien escuchado es información", body: "Mi miedo a hablar en público me venía diciendo que me importaba esa charla, no que no servía." },
  { day: "Hace 3 días",  time: "—",     kind: "ex",        chap: 3, lessonN: 2, exercise: "Carta al miedo", min: 10 },
  { day: "Semana pasada", time: "—",    kind: "session",   chap: 2, sessionMin: 22, lessons: 1 },
  { day: "Semana pasada", time: "—",    kind: "highlight", chap: 2, lessonN: 1, color: "yellow", text: "Respirar largo no relaja porque sí — le avisa al cuerpo que estás a salvo." },
];

function MyJourneyDrawer({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  const [filter, setFilter] = React.useState("all");
  const filtered = filter === "all"
    ? JOURNEY_ENTRIES
    : JOURNEY_ENTRIES.filter((e) => e.kind === filter);

  // Group by day, preserving original order.
  const groups = [];
  filtered.forEach((e) => {
    const last = groups[groups.length - 1];
    if (last && last.day === e.day) last.entries.push(e);
    else groups.push({ day: e.day, entries: [e] });
  });

  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext3-journey " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Mi recorrido"
      >
        <header className="ext3-journey-head">
          <div>
            <span className="ext-eyebrow">Tu lectura</span>
            <h2 className="ext3-journey-title">Mi recorrido por <em>Emociones en construcción</em></h2>
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{E3.x}</button>
        </header>

        <div className="ext3-journey-stats">
          <div className="ext3-journey-stat">
            <div className="ext3-journey-stat-num">5<span>/12</span></div>
            <div className="ext3-journey-stat-lbl">Capítulos</div>
          </div>
          <div className="ext3-journey-stat">
            <div className="ext3-journey-stat-num">8h<span>14m</span></div>
            <div className="ext3-journey-stat-lbl">Tiempo total</div>
          </div>
          <div className="ext3-journey-stat">
            <div className="ext3-journey-stat-num">{AN3.filter((a) => a.kind === "highlight").length}</div>
            <div className="ext3-journey-stat-lbl">Subrayados</div>
          </div>
          <div className="ext3-journey-stat">
            <div className="ext3-journey-stat-num">{AN3.filter((a) => a.kind === "note").length}</div>
            <div className="ext3-journey-stat-lbl">Notas</div>
          </div>
          <div className="ext3-journey-stat">
            <div className="ext3-journey-stat-num">2</div>
            <div className="ext3-journey-stat-lbl">Ejercicios</div>
          </div>
        </div>

        <div className="ext3-journey-filters">
          {[
            { id: "all",       label: "Todo" },
            { id: "highlight", label: "Subrayados" },
            { id: "note",      label: "Notas" },
            { id: "audio",     label: "Audios" },
            { id: "ex",        label: "Ejercicios" },
            { id: "mood",      label: "Mood after" },
            { id: "session",   label: "Sesiones" },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className={"ext3-journey-filter " + (filter === f.id ? "is-on" : "")}
              onClick={() => setFilter(f.id)}
            >{f.label}</button>
          ))}
        </div>

        <div className="ext3-journey-list">
          {groups.length === 0 && (
            <div className="ext3-journey-empty">Sin entradas en este filtro.</div>
          )}
          {groups.map((g) => (
            <section key={g.day} className="ext3-journey-group">
              <h3 className="ext3-journey-group-h">{g.day}</h3>
              <div className="ext3-journey-timeline">
                <span className="ext3-journey-rail" aria-hidden></span>
                {g.entries.map((e, i) => (
                  <JourneyEntry key={i} e={e}/>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function JourneyEntry({ e }) {
  const kindMeta = {
    highlight: { glyph: E3.pen,     tone: "lav",  word: "Subrayado" },
    note:      { glyph: E3.pen,     tone: "rose", word: "Nota" },
    audio:     { glyph: E3.audio,   tone: "sage", word: "Audio" },
    ex:        { glyph: E3.feather, tone: "lav",  word: "Ejercicio" },
    mood:      { glyph: E3.spark,   tone: "lav",  word: "Mood after" },
    session:   { glyph: E3.cal,     tone: "warm", word: "Sesión" },
  }[e.kind] || { glyph: E3.spark, tone: "lav", word: "Evento" };
  return (
    <article className={"ext3-journey-entry tone-" + kindMeta.tone}>
      <span className="ext3-journey-dot" aria-hidden>{kindMeta.glyph}</span>
      <div className="ext3-journey-body">
        <header className="ext3-journey-entry-head">
          <span className="ext3-journey-entry-kind">{kindMeta.word}</span>
          <span className="ext3-journey-entry-where">
            Cap. {String(e.chap).padStart(2, "0")}
            {e.lessonN ? " · Lec. " + String(e.lessonN).padStart(2, "0") : ""}
          </span>
          {e.time && e.time !== "—" && <span className="ext3-journey-entry-time">{e.time}</span>}
        </header>
        {e.kind === "highlight" && (
          <p className={"ext3-journey-quote c-" + e.color}>"{e.text}"</p>
        )}
        {e.kind === "note" && (
          <>
            <p className="ext3-journey-quote">"{e.summary}"</p>
            <p className="ext3-journey-note">{e.body}</p>
          </>
        )}
        {e.kind === "audio" && (
          <p className="ext3-journey-line"><strong>{e.audio}</strong> · {e.min} min</p>
        )}
        {e.kind === "ex" && (
          <p className="ext3-journey-line"><strong>{e.exercise}</strong> · {e.min} min · completado</p>
        )}
        {e.kind === "mood" && (
          <p className="ext3-journey-line">Te quedaste <strong>{e.moodLbl.toLowerCase()}</strong> al terminar.</p>
        )}
        {e.kind === "session" && (
          <p className="ext3-journey-line">{e.sessionMin} min de lectura · {e.lessons} lecciones</p>
        )}
      </div>
    </article>
  );
}

// ────────────────────────────────────────────────────────────────────────
// #15  Streak + goal widget — small chip for topbar, plus an expanded card
// for the AA popover or a separate sheet.
// ────────────────────────────────────────────────────────────────────────
function StreakChip({ days = 7, todayMin = 12, goalMin = 15, onClick }) {
  return (
    <button type="button" className="ext3-streak-chip" onClick={onClick}>
      <span className="ext3-streak-chip-flame" aria-hidden>{E3.flame}</span>
      <span className="ext3-streak-chip-num">{days}</span>
      <span className="ext3-streak-chip-sep"/>
      <span className="ext3-streak-chip-meta">
        <strong>{todayMin}</strong>/{goalMin} min hoy
      </span>
    </button>
  );
}

function StreakCard({ days = 7, todayMin = 12, goalMin = 15 }) {
  const pct = Math.min(100, Math.round((todayMin / goalMin) * 100));
  const week = ["L", "M", "X", "J", "V", "S", "D"];
  const today = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  return (
    <div className="ext3-streak-card">
      <header className="ext3-streak-card-head">
        <div>
          <span className="ext-eyebrow">Tu ritmo</span>
          <div className="ext3-streak-card-num">
            <span className="ext3-streak-card-num-val">{days}</span>
            <span className="ext3-streak-card-num-lbl">días de lectura seguidos</span>
          </div>
        </div>
        <span className="ext3-streak-card-flame" aria-hidden>{E3.flame}</span>
      </header>

      <div className="ext3-streak-card-goal">
        <div className="ext3-streak-card-goal-row">
          <span>Meta diaria</span>
          <span><strong>{todayMin}</strong> de {goalMin} min</span>
        </div>
        <div className="ext3-streak-card-bar">
          <div className="ext3-streak-card-bar-fill" style={{ width: pct + "%" }}/>
        </div>
        <div className="ext3-streak-card-hint">
          {pct >= 100
            ? "Cumpliste tu meta hoy. ¿Sigues unos minutos más o cierras por hoy?"
            : "Te faltan " + (goalMin - todayMin) + " min para tu meta. Lección siguiente: 5 min."}
        </div>
      </div>

      <div className="ext3-streak-card-week">
        {week.map((d, i) => {
          const state = i < today ? "done" : i === today ? "today" : "future";
          return (
            <div key={d} className={"ext3-streak-day is-" + state}>
              <span className="ext3-streak-day-dot">{state === "done" ? E3.check : null}</span>
              <span className="ext3-streak-day-lbl">{d}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, {
  HighlightEditPopover, LoadingStatesGallery, AaAdvanced, ReadingRule,
  AccessibilityPanel, MyJourneyDrawer, StreakChip, StreakCard,
  SkeletonBlock, ErrorCard, ToggleRow,
});
