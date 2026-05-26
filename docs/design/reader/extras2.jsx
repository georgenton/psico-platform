// reader/extras2.jsx — Second batch: items #1, #3, #6, #8, #17.
// Components only — wiring lives in web.jsx / mobile.jsx and tweak defaults
// in app.jsx. CSS in extras2.css.

const { READER_BOOK: B2, READER_CHAPTER: C2 } = window;

function E2I({ d, size = 16, sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const E2 = {
  x:       <E2I d="M6 6l12 12M6 18L18 6"/>,
  arrow:   <E2I d="M5 12h14M13 6l6 6-6 6"/>,
  back:    <E2I d="M15 6l-6 6 6 6"/>,
  pen:     <E2I d={["M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7","M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"]}/>,
  copy:    <E2I d={["M9 9h10v10H9z","M5 15V5h10"]}/>,
  share:   <E2I d={["M16 5l-4-4-4 4","M12 1v14","M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"]}/>,
  heart:   <E2I d="M12 21s-7-4.5-9.3-9.3a5.3 5.3 0 0 1 9.3-5.1 5.3 5.3 0 0 1 9.3 5.1C19 16.5 12 21 12 21z"/>,
  phone:   <E2I d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>,
  chat:    <E2I d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>,
  spark:   <E2I d={["M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z"]} sw={1.4}/>,
  lock:    <E2I d={["M7 11V7a5 5 0 0 1 10 0v4","M5 11h14v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"]}/>,
  quote:   <E2I d={["M7 7h4v4H7zM7 13a4 4 0 0 0 4-4","M15 7h4v4h-4zM15 13a4 4 0 0 0 4-4"]} sw={1.4}/>,
  link:    <E2I d={["M9 13a4 4 0 0 0 5.6 0L18 9.6a4 4 0 0 0-5.6-5.6L11 5.4","M15 11a4 4 0 0 0-5.6 0L6 14.4a4 4 0 0 0 5.6 5.6L13 18.6"]}/>,
};

// ────────────────────────────────────────────────────────────────────────
// #1  Mobile selection popover — appears above the highlighted phrase
// with selection handles. Same actions as the web selection popover.
// ────────────────────────────────────────────────────────────────────────
function MobSelectionPopover({ onNote, onEco, onShare, onClose }) {
  const [color, setColor] = React.useState("c-lavender");
  return (
    <div className="ext2-mobsel" role="menu">
      <div className="ext2-mobsel-arrow" aria-hidden></div>
      <div className="ext2-mobsel-row">
        <div className="ext2-mobsel-colors">
          {["c-lavender", "c-yellow", "c-sage", "c-rose"].map((c) => (
            <button
              key={c}
              type="button"
              className={"ext2-mobsel-color " + c + (color === c ? " is-on" : "")}
              aria-label={"Subrayar en " + c}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <span className="ext2-mobsel-sep"/>
        <button className="ext2-mobsel-btn" onClick={onNote} aria-label="Agregar nota">{E2.pen}</button>
        <button className="ext2-mobsel-btn" onClick={onEco} aria-label="Preguntar a Eco">✦</button>
        <button className="ext2-mobsel-btn" onClick={onShare} aria-label="Compartir">{E2.share}</button>
        <button className="ext2-mobsel-btn" aria-label="Copiar">{E2.copy}</button>
      </div>
      <div className="ext2-mobsel-second">
        <button className="ext2-mobsel-second-btn">Definir</button>
        <button className="ext2-mobsel-second-btn">Traducir</button>
        <button className="ext2-mobsel-second-btn">Leer en voz alta</button>
        <button className="ext2-mobsel-second-btn" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// #3  Onboarding tour — three guided steps for first-time readers.
// Each step shows a darkened scrim with a "spotlight" hole around a target,
// a callout with title + body, and prev/next/skip controls.
// ────────────────────────────────────────────────────────────────────────
const ONBOARDING_STEPS = [
  {
    id: "select",
    target: "[data-onb=\"prose\"]",
    title: "Subraya lo que te llega",
    body: "Mantén presionada una frase para guardarla. Quedará acá y en tu diario.",
    pos: "below",
  },
  {
    id: "eco",
    target: "[data-onb=\"eco\"]",
    title: "Eco lee contigo",
    body: "Pregúntale sobre cualquier pasaje. Lo que digas queda solo entre ustedes.",
    pos: "left",
  },
  {
    id: "mode",
    target: "[data-onb=\"mode\"]",
    title: "Cambia de Modo cuando quieras",
    body: "Modo Libro es prosa pura. Modo Guía suma audios, ejercicios y reflexiones.",
    pos: "below",
  },
];

function OnboardingTour({ step, onStep, onDone, surface = "web" }) {
  // step: 0 = none, 1..N = active. Compute target rect on each step change.
  const [rect, setRect] = React.useState(null);
  const idx = step - 1;
  const meta = ONBOARDING_STEPS[idx];

  React.useEffect(() => {
    if (!meta) { setRect(null); return; }
    const compute = () => {
      const el = document.querySelector(meta.target);
      if (!el) { setRect(null); return; }
      // Use the closest reader surface (.web or .mob) as the coordinate space
      // since that's the overlay's positioning ancestor.
      const surf = el.closest(".web, .mob");
      if (!surf) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      const s = surf.getBoundingClientRect();
      setRect({
        top: r.top - s.top,
        left: r.left - s.left,
        width: r.width,
        height: r.height,
      });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [meta && meta.id]);

  if (!meta || !rect) return null;

  // Position the callout relative to the spotlight.
  const pad = 8;
  const callout = (() => {
    if (meta.pos === "left") {
      return { top: rect.top, right: `calc(100% - ${rect.left - pad}px)` };
    }
    // default "below"
    return { top: rect.top + rect.height + pad + 6, left: Math.max(16, rect.left) };
  })();

  return (
    <div className={"ext2-onb " + (surface === "mobile" ? "is-mobile" : "")} role="dialog" aria-label="Tour del Lector">
      {/* Scrim with a punched-out spotlight via box-shadow */}
      <div
        className="ext2-onb-spot"
        style={{
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
        }}
      />
      <div className="ext2-onb-callout" style={callout}>
        <div className="ext2-onb-step">Paso {step} de {ONBOARDING_STEPS.length}</div>
        <h3 className="ext2-onb-title">{meta.title}</h3>
        <p className="ext2-onb-body">{meta.body}</p>
        <div className="ext2-onb-dots" aria-hidden>
          {ONBOARDING_STEPS.map((_, i) => (
            <span key={i} className={"ext2-onb-dot " + (i === idx ? "is-on" : "")}/>
          ))}
        </div>
        <div className="ext2-onb-actions">
          <button className="ext2-onb-skip" onClick={onDone}>Omitir</button>
          <div className="ext2-onb-nav">
            {step > 1 && (
              <button className="ext2-onb-prev" onClick={() => onStep(step - 1)}>{E2.back} Atrás</button>
            )}
            {step < ONBOARDING_STEPS.length ? (
              <button className="ext2-onb-next" onClick={() => onStep(step + 1)}>Siguiente {E2.arrow}</button>
            ) : (
              <button className="ext2-onb-next" onClick={onDone}>Listo {E2.arrow}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// #6  Eco-with-citation — block that renders inside the Eco rail / thread,
// showing the source passage Eco grounded an answer in.
// ────────────────────────────────────────────────────────────────────────
function EcoCitationCard({ chapter = 5, lesson = 1, lessonTitle = "Lo que confundimos con depresión", quote = "La tristeza no es un error del sistema. Es el sistema funcionando.", onJump }) {
  return (
    <button className="ext2-cite" onClick={onJump} type="button">
      <div className="ext2-cite-head">
        <span className="ext2-cite-glyph" aria-hidden>{E2.quote}</span>
        <div className="ext2-cite-where">
          <div className="ext2-cite-source">Cap. {String(chapter).padStart(2, "0")} · Lec. {String(lesson).padStart(2, "0")}</div>
          <div className="ext2-cite-title">{lessonTitle}</div>
        </div>
        <span className="ext2-cite-arrow" aria-hidden>↗</span>
      </div>
      <div className="ext2-cite-quote">"{quote}"</div>
      <div className="ext2-cite-foot">
        <span aria-hidden>{E2.link}</span> Ir al pasaje en el libro
      </div>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────
// #8  Safety / crisis card — appears as a full-overlay tarjeta cuando se
// detectan señales de crisis en el journal o conversación con Eco. Tono
// suave, prioriza pausa antes que escalamiento.
// ────────────────────────────────────────────────────────────────────────
const CRISIS_LINES = [
  { country: "Ecuador",   line: "171",                 desc: "Línea de salud · 24/7" },
  { country: "México",    line: "800 290 0024",        desc: "SAPTEL · 24/7" },
  { country: "Colombia",  line: "106",                 desc: "Línea Bogotá / Nacional" },
  { country: "Argentina", line: "135",                 desc: "Centro de Asistencia · gratuita" },
  { country: "Perú",      line: "113 (opción 5)",      desc: "MINSA · 24/7" },
  { country: "Chile",     line: "*4141",               desc: "Salud Responde · 24/7" },
];

function SafetyCard({ onClose, onPauseEco, onContinue, surface = "web" }) {
  const isMobile = surface === "mobile";
  return (
    <div className={"ext-overlay ext2-safety-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext2-safety " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Si lo que sientes hoy pesa más de lo usual"
      >
        <header className="ext2-safety-head">
          <span className="ext2-safety-glyph" aria-hidden>{E2.heart}</span>
          <div>
            <span className="ext2-eyebrow">Una pausa</span>
            <h2 className="ext2-safety-title">Si lo que sientes hoy pesa más de lo usual</h2>
          </div>
        </header>

        <p className="ext2-safety-lead">
          Notamos algo en lo que escribiste — no para alarmarte, sí para acompañarte. <strong>No tienes que sostener esto solo.</strong>
          {" "}Hablar con alguien capacitado es uno de los pasos más cuidadosos que puedes dar.
        </p>

        <div className="ext2-safety-lines">
          <div className="ext2-safety-lines-h">Líneas de ayuda en tu país</div>
          <div className="ext2-safety-lines-grid">
            {CRISIS_LINES.map((c) => (
              <a key={c.country} className="ext2-safety-line" href={`tel:${c.line.replace(/\s/g, "")}`}>
                <span className="ext2-safety-line-icon">{E2.phone}</span>
                <div>
                  <div className="ext2-safety-line-country">{c.country}</div>
                  <div className="ext2-safety-line-num">{c.line}</div>
                  <div className="ext2-safety-line-desc">{c.desc}</div>
                </div>
              </a>
            ))}
          </div>
        </div>

        <div className="ext2-safety-also">
          <span className="ext2-eyebrow">También puedes</span>
          <button className="ext2-safety-also-row" onClick={onPauseEco}>
            <span className="ext2-safety-also-icon">⏸</span>
            <div>
              <div className="ext2-safety-also-h">Pausar Eco hasta mañana</div>
              <div className="ext2-safety-also-s">Apaga el chat — vuelve cuando estés listo.</div>
            </div>
          </button>
          <button className="ext2-safety-also-row">
            <span className="ext2-safety-also-icon">{E2.chat}</span>
            <div>
              <div className="ext2-safety-also-h">Avisarle a un contacto de confianza</div>
              <div className="ext2-safety-also-s">Comparte tu ubicación + un mensaje preparado.</div>
            </div>
          </button>
        </div>

        <p className="ext2-safety-disclaimer">
          Psico Platform no reemplaza un psicólogo ni un servicio de emergencia. Si estás en peligro inmediato, contacta a una línea de tu país.
        </p>

        <div className="ext2-safety-foot">
          <button className="ext-btn-ghost" onClick={onContinue}>Continuar leyendo</button>
          <button className="ext-btn-primary" onClick={() => window.open("tel:171")}>
            {E2.phone} Llamar al 171
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// #17  Sample mode — free user reads Cap. 1 as a sample. Visible cues:
//   • SampleBadge in the topbar
//   • SampleBanner inline at the top of the page
//   • SoftPaywall at the bottom of the sample (vs the hard one for Pro-only)
// ────────────────────────────────────────────────────────────────────────
function SampleBadge() {
  return (
    <span className="ext2-sample-badge">
      <span className="ext2-sample-badge-dot" aria-hidden></span>
      Muestra gratuita
    </span>
  );
}

function SampleBanner({ remainingMin = 4, onUpgrade }) {
  return (
    <div className="ext2-sample-banner">
      <span className="ext2-sample-banner-glyph" aria-hidden>{E2.spark}</span>
      <div className="ext2-sample-banner-meta">
        <div className="ext2-sample-banner-h">Estás leyendo el capítulo 1 como muestra</div>
        <div className="ext2-sample-banner-s">
          Te faltan <strong>~{remainingMin} min</strong> para terminarlo · 11 capítulos más con Pro
        </div>
      </div>
      <button className="ext2-sample-banner-cta" onClick={onUpgrade}>Ver Pro {E2.arrow}</button>
    </div>
  );
}

function SoftPaywall({ onUpgrade, onClose }) {
  return (
    <section className="ext2-soft">
      <div className="ext2-soft-fade" aria-hidden></div>
      <div className="ext2-soft-body">
        <span className="ext2-eyebrow">Hasta aquí va la muestra</span>
        <h2 className="ext2-soft-title">
          Llegaste al final del capítulo 1.
          {" "}<em>Quedan 11 capítulos más</em>.
        </h2>
        <p className="ext2-soft-sub">
          Marina sigue desarmando emociones — tristeza, miedo, rabia, vergüenza — con lecciones, audios y ejercicios que puedes hacer a tu ritmo.
        </p>
        <div className="ext2-soft-stats">
          <div className="ext2-soft-stat"><strong>11</strong><span>capítulos</span></div>
          <div className="ext2-soft-stat"><strong>48</strong><span>lecciones</span></div>
          <div className="ext2-soft-stat"><strong>16</strong><span>audios guiados</span></div>
          <div className="ext2-soft-stat"><strong>12</strong><span>ejercicios</span></div>
        </div>
        <div className="ext2-soft-actions">
          <button className="ext-btn-primary ext2-soft-cta" onClick={onUpgrade}>
            Continuar con Pro — $7 USD/mes {E2.arrow}
          </button>
          <button className="ext-btn-ghost" onClick={onClose}>Seguir explorando libros gratis</button>
        </div>
        <p className="ext2-soft-fine">
          7 días sin tarjeta · Cancela cuando quieras · Si no lo disfrutas, te devolvemos lo pagado.
        </p>
      </div>
    </section>
  );
}

// Export
Object.assign(window, {
  MobSelectionPopover, OnboardingTour, EcoCitationCard,
  SafetyCard, SampleBadge, SampleBanner, SoftPaywall,
});
