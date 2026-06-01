// voz/app.jsx — Voice-to-text · 4 estados en iPhone.

const { IOSDevice } = window;

// ── Waveform (recording) ──
function Waveform({ animated = true, count = 56 }) {
  const seed = (i) => {
    // deterministic-ish ondas
    const v = Math.sin(i * 0.6) * 0.6 + Math.sin(i * 1.7) * 0.3 + Math.sin(i * 0.27) * 0.5;
    return Math.max(0.12, Math.min(1, (v + 1) / 2));
  };
  return (
    <div className="rec-wave">
      {Array.from({ length: count }).map((_, i) => {
        const base = seed(i);
        const h = 12 + base * 56;
        const style = animated
          ? { height: h, animation: `wave-${i % 6} 1.${(i % 4) + 1}s ease-in-out infinite`, animationDelay: `${(i % 8) * 0.07}s` }
          : { height: h, opacity: 0.55 };
        return <span key={i} className="rec-bar" style={style}/>;
      })}
      <style>{`
        @keyframes wave-0 { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.4); } }
        @keyframes wave-1 { 0%,100% { transform: scaleY(0.5); } 50% { transform: scaleY(1.15); } }
        @keyframes wave-2 { 0%,100% { transform: scaleY(0.85); } 50% { transform: scaleY(0.35); } }
        @keyframes wave-3 { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1.05); } }
        @keyframes wave-4 { 0%,100% { transform: scaleY(1.1); } 50% { transform: scaleY(0.5); } }
        @keyframes wave-5 { 0%,100% { transform: scaleY(0.7); } 50% { transform: scaleY(0.25); } }
      `}</style>
    </div>
  );
}

// ── Screen scaffold ──
function ScreenTop({ title, rText }) {
  return (
    <div className="scr-top">
      <button className="scr-top-back" aria-label="Atrás">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div className="scr-top-title">{title}</div>
      <div className="scr-top-r">{rText}</div>
    </div>
  );
}

function MoodMeta() {
  return (
    <div className="scr-meta">
      <span className="mood-pill">
        <span className="mood-dot"/>
        Calma
      </span>
      <span className="dot-sep">·</span>
      <span className="meta-time">Vie 15 may · 21:14</span>
    </div>
  );
}

// ── 1. IDLE ──
function ScreenIdle() {
  return (
    <div className="scr">
      <ScreenTop title="Nueva entrada" rText="Cancelar"/>
      <div className="scr-body">
        <h1 className="scr-h">¿Cómo llegas hoy?</h1>
        <p className="scr-sub">Escribe o cuéntalo en voz alta — nadie lo lee más que tú.</p>
        <MoodMeta/>

        <section className="composer">
          <div className="composer-txt">Empieza aquí…</div>
          <div className="composer-actions">
            <div className="composer-extras">
              <button className="composer-extra" aria-label="Adjuntar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5 12.7 19.8a5.5 5.5 0 1 1-7.8-7.8L14 3a3.7 3.7 0 0 1 5.2 5.2L9.5 18a2 2 0 0 1-2.8-2.8L16 5.9"/></svg>
              </button>
              <button className="composer-extra" aria-label="Etiqueta">#</button>
            </div>
            <button className="composer-save" disabled>Guardar</button>
          </div>
        </section>

        <div className="mic-cta">
          <span className="mic-cta-hint">— o —</span>
          <button className="mic-btn" aria-label="Grabar voz">
            <span className="mic-btn-shadow"/>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3"/>
              <path d="M19 10a7 7 0 0 1-14 0"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
          </button>
          <p className="mic-cta-caption">
            <b>Mantén pulsado</b> para grabar — o toca y habla todo lo que necesites.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── 2. RECORDING ──
function ScreenRecording() {
  return (
    <div className="scr">
      <ScreenTop title="Grabando" rText="Cancelar"/>
      <div className="scr-body">
        <div className="rec-card">
          <div className="rec-status">
            <span className="rec-status-dot"/>
            Grabando · te escucho
          </div>
          <div className="rec-timer">0:42</div>
          <Waveform animated count={48}/>
          <p className="rec-partial">
            "Hoy noté el cuerpo antes que la mente. Salí al balcón antes del café y eso bastó para que el resto del día tuviera otra textura…
            <span className="ghost"> voy a probarlo unos días más</span>"
          </p>
          <div className="rec-controls">
            <button className="rec-ctrl" aria-label="Pausar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
            </button>
            <button className="rec-ctrl is-stop" aria-label="Detener">
              <span className="sq"/>
            </button>
            <button className="rec-ctrl" aria-label="Más">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
            </button>
          </div>
          <div className="rec-tip">Toca · pausar &nbsp;·&nbsp; Mantén · cancelar</div>
        </div>

        <div className="settings-hint" style={{ marginTop: 16 }}>
          <span style={{ fontSize: 14 }}>🔒</span>
          <span><b>Solo en tu dispositivo.</b> El audio no sale del teléfono hasta que tú lo guardes — y aun así se transcribe localmente.</span>
        </div>
      </div>
    </div>
  );
}

// ── 3. TRANSCRIBING ──
function ScreenTranscribing() {
  return (
    <div className="scr">
      <ScreenTop title="Transcribiendo" rText=""/>
      <div className="scr-body">
        <div className="tx-card">
          <div className="tx-status">
            <span className="tx-dots"><span/><span/><span/></span>
            Convirtiendo voz a texto · 0:48
          </div>
          <p className="tx-text">
            Hoy noté el cuerpo antes que la mente. Salí al balcón antes del café — solo dos minutos —
            y eso bastó para que el resto del día tuviera otra textura.<br/><br/>
            <span className="live">Voy a probarlo unos días más. Si funciona, lo llamo mi pausa de las siete y media</span>
            <span className="caret"/>
            <span className="pending"> de la mañana…</span>
          </p>
          <div className="tx-progress">
            <span className="tx-progress-icon">✦</span>
            <div className="tx-progress-text">
              <b style={{ color: "var(--color-lavender-700)" }}>Eco está aprendiendo tu voz.</b><br/>
              Tus próximas transcripciones llegarán más rápido y con menos correcciones.
            </div>
          </div>
        </div>

        <div className="settings-hint" style={{ marginTop: 16 }}>
          <span style={{ fontSize: 14 }}>⚡</span>
          <span>Transcripción <b>en tu dispositivo</b> · Whisper · ~3s por minuto · no consume datos.</span>
        </div>
      </div>
    </div>
  );
}

// ── 4. RESULT ──
function ScreenResult() {
  return (
    <div className="scr">
      <ScreenTop title="Tu entrada" rText="Editar"/>
      <div className="scr-body">
        <MoodMeta/>

        <div className="res-card">
          <span className="res-tag">✓ Transcrito · 0:48 → 312 caracteres</span>
          <p className="res-text">
            Hoy noté el cuerpo antes que la mente. Salí al balcón antes del café — solo dos minutos — y eso bastó para que el resto del día tuviera otra textura.{"\n\n"}
            Voy a probarlo unos días más. Si funciona, lo llamo <span className="mark">mi pausa de las 7:30</span>.
          </p>
          <div className="res-meta">
            <span>Tocar cualquier palabra para editar</span>
            <span className="pos">94% confianza</span>
          </div>
        </div>

        <div className="res-row">
          <span className="res-row-chip">🎧 Guardar audio también</span>
          <span className="res-row-chip">#mañana</span>
          <span className="res-row-chip">+</span>
        </div>

        <div className="res-actions">
          <button className="res-btn ghost">Volver a grabar</button>
          <button className="res-btn primary">Guardar entrada</button>
        </div>

        <div className="settings-hint" style={{ marginTop: 16 }}>
          <span style={{ fontSize: 14 }}>✦</span>
          <span>Si quieres, Eco puede ayudarte a <b>profundizar</b> sobre esto en una conversación — sin tocar lo que ya escribiste.</span>
        </div>
      </div>
    </div>
  );
}

// ── Stage ──
function VozApp() {
  const cols = [
    { num: "01", title: "Composer",       sub: "El mic vive junto al teclado — siempre a un toque, nunca obligatorio.", scr: <ScreenIdle/> },
    { num: "02", title: "Grabando",       sub: "Tiempo grande, waveform tranquilo, transcripción parcial en vivo.",     scr: <ScreenRecording/> },
    { num: "03", title: "Transcribiendo", sub: "Whisper local. La burbuja se llena palabra por palabra.",               scr: <ScreenTranscribing/> },
    { num: "04", title: "Resultado",      sub: "Texto editable · audio opcional · entrada lista para guardar.",         scr: <ScreenResult/> },
  ];
  return (
    <div className="stage">
      <header className="stage-head">
        <span className="stage-eyebrow">◐ Diario · voice-to-text</span>
        <h1 className="stage-title">Hablar como quien escribe — sin perder lo escrito.</h1>
        <p className="stage-sub">
          El diario es íntimo, pero la palabra suele venir antes de la mano. Este flujo añade voz como entrada de primera
          clase: transcripción local, edición en sitio, audio opcional. Cuatro estados en iPhone 14 Pro.
        </p>
      </header>

      <div className="row">
        {cols.map((c) => (
          <div key={c.num} className="col">
            <span className="col-num">Paso {c.num}</span>
            <h2 className="col-title">{c.title}</h2>
            <p className="col-sub">{c.sub}</p>
            <div className="phone">
              <IOSDevice width={390} height={844}>{c.scr}</IOSDevice>
            </div>
          </div>
        ))}
      </div>

      <p className="foot-note">
        <b>Decisiones de UX:</b>&nbsp; mic siempre presente (no oculto en menú) &nbsp;·&nbsp;
        transcripción local primero (Whisper · privado) &nbsp;·&nbsp;
        timer mostrado como "tiempo recordado" no "tiempo gastado" &nbsp;·&nbsp;
        edición tocando la palabra, no botón "editar" &nbsp;·&nbsp;
        audio opcional para que la entrada pese poco en backup.
      </p>
    </div>
  );
}

window.VozApp = VozApp;
