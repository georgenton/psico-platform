// wallpapers/app.jsx — Wallpapers · set compartible + identidad

// ── Mini lock-screen tile ──
function WP({ bg, time = "9:41", date = "Viernes 15 de mayo", dark = true, children, noise = true, scale = 1 }) {
  const onClass = dark ? "wp-on-dark" : "wp-on-light";
  return (
    <div className="wp-frame" style={{ transform: scale === 1 ? undefined : `scale(${scale})`, transformOrigin: "top center" }}>
      <div className={`wp-bg ${bg} ${onClass} ${noise ? "wp-noise" : ""}`}>
        <div className="wp-status">
          <span>{time}</span>
          <span>•••• 5G</span>
        </div>
        {children}
      </div>
      <div className="wp-flashlight">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l-4 8h3v12l4-8h-3V2z"/></svg>
      </div>
      <div className="wp-camera">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/></svg>
      </div>
    </div>
  );
}

function LockHeader({ time = "9:41", date = "Viernes 15 de mayo" }) {
  return (
    <>
      <div className="wp-time">{time}</div>
      <div className="wp-date">{date}</div>
    </>
  );
}

// ── 1. Hero quote (book) ──
function HeroQuote({ scale = 1 }) {
  return (
    <WP bg="bg-lav-warm" scale={scale}>
      <LockHeader/>
      <div className="wp-quote">
        <div className="wp-quote-inner">
          "No todo lo que se acelera es ansiedad.<br/>
          <span className="wp-quote-em">A veces es solo el cuerpo<br/>terminando un día.</span>"
        </div>
      </div>
      <div className="wp-attr">Emociones en construcción · Cap. 4</div>
    </WP>
  );
}

// ── 2. Quote — pause/training ──
function PauseQuote() {
  return (
    <WP bg="bg-sage">
      <LockHeader/>
      <div className="wp-quote">
        <div className="wp-quote-inner">
          "La pausa <span className="wp-quote-em">no se hereda</span> —<br/>se entrena."
        </div>
      </div>
      <div className="wp-attr">Cap. 3 · La pausa antes de responder</div>
    </WP>
  );
}

// ── 3. Mantra light ──
function MantraLight() {
  return (
    <WP bg="bg-warm-pap" dark={false} noise={false}>
      <div className="wp-status" style={{ color: "var(--color-warm-900)" }}>
        <span>9:41</span><span>•••• 5G</span>
      </div>
      <div className="wp-mantra">
        <div className="wp-mantra-inner">
          A tu ritmo —<br/><em>en tu idioma.</em>
        </div>
      </div>
      <div className="wp-attr" style={{ color: "var(--color-warm-600)" }}>Psico Platform</div>
    </WP>
  );
}

// ── 4. Personal "mi pausa de las 7:30" ──
function PersonalPause() {
  return (
    <WP bg="bg-warm-dawn" dark={false} noise={false}>
      <div className="wp-status" style={{ color: "var(--color-warm-900)" }}>
        <span>7:30</span><span>•••• 5G</span>
      </div>
      <div className="wp-mantra">
        <div className="wp-mantra-inner" style={{ fontSize: 22 }}>
          Mi pausa<br/>de las <em>7:30</em>.
        </div>
      </div>
      <div className="wp-attr" style={{ color: "var(--color-warm-600)" }}>De tu diario · 15 may</div>
    </WP>
  );
}

// ── 5. Streak ──
function Streak() {
  return (
    <WP bg="bg-glow-vio">
      <div className="wp-status"><span>9:41</span><span>•••• 5G</span></div>
      <div className="wp-streak">
        <span className="wp-streak-glyph">🔥</span>
        <div className="wp-streak-num">6</div>
        <div className="wp-streak-cap">días seguidos</div>
        <div className="wp-streak-line">"No rompas el ritmo — bastan dos líneas."</div>
      </div>
    </WP>
  );
}

// ── 6. Cover blowup ──
function CoverBlowup() {
  return (
    <WP bg="bg-deep-night" noise={false}>
      <div className="wp-status"><span>9:41</span><span>•••• 5G</span></div>
      <div className="wp-cover-block">
        <div style={{ flex: 1, position: "relative" }}>
          {/* Decorative — abstract shape */}
          <div style={{
            position: "absolute", top: "30%", left: "50%", transform: "translate(-50%, -30%)",
            width: 140, height: 140, borderRadius: 999,
            background: "radial-gradient(closest-side, rgba(195,186,255,0.5), transparent 70%)",
            filter: "blur(8px)",
          }}/>
          <div style={{
            position: "absolute", top: "44%", left: "20%",
            width: 60, height: 60, borderRadius: 999,
            background: "radial-gradient(closest-side, rgba(127,174,118,0.45), transparent 70%)",
            filter: "blur(6px)",
          }}/>
        </div>
        <div className="wp-cover-strap">
          <div className="wp-cover-title">Familias ensambladas</div>
          <div className="wp-cover-sub">Empieza a leer · 15 may</div>
        </div>
      </div>
    </WP>
  );
}

// ── 7. Mood-of-week ──
function MoodOfWeek() {
  return (
    <WP bg="bg-mood-cal">
      <div className="wp-status"><span>9:41</span><span>•••• 5G</span></div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff", padding: 24 }}>
        <div style={{ font: "600 11px/1 var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.18em", opacity: 0.85, marginBottom: 14 }}>
          Esta semana fue
        </div>
        <div style={{ fontFamily: '"Newsreader", Georgia, serif', fontSize: 64, fontWeight: 500, letterSpacing: "-0.03em", fontStyle: "italic", lineHeight: 1 }}>
          Calma
        </div>
        <div style={{ fontFamily: '"Newsreader", Georgia, serif', fontStyle: "italic", fontSize: 13, opacity: 0.85, marginTop: 16, textAlign: "center", maxWidth: 180, lineHeight: 1.4 }}>
          "Tres mañanas, dos noches.<br/>Un domingo lento."
        </div>
      </div>
      <div className="wp-attr">Tu Patrón · 11–17 may</div>
    </WP>
  );
}

// ── 8. Identity ──
function Identity() {
  return (
    <WP bg="bg-id-lav">
      <div className="wp-status"><span>9:41</span><span>•••• 5G</span></div>
      <div className="wp-id">
        <div style={{ fontSize: 56, fontWeight: 200, fontFamily: '-apple-system, system-ui', letterSpacing: "-0.02em", marginBottom: 18 }}>✦</div>
        <div className="wp-id-mark">Psico Platform</div>
        <div className="wp-id-tag">Aprende a entenderte.</div>
      </div>
    </WP>
  );
}

// ── Tile wrapper ──
function Tile({ children, title, meta }) {
  return (
    <div className="wp-card">
      {children}
      <div className="wp-cap">
        <div className="wp-cap-title">{title}</div>
        <div className="wp-cap-meta">{meta}</div>
      </div>
      <div className="wp-actions">
        <button className="wp-icon-btn" aria-label="Compartir">⤴</button>
        <button className="wp-icon-btn" aria-label="Descargar">↓</button>
        <button className="wp-icon-btn" aria-label="Aplicar">✓</button>
      </div>
    </div>
  );
}

// ── Stage ──
function WallpapersApp() {
  return (
    <div className="stage">
      <header className="stage-head">
        <span className="stage-eyebrow">◇ Compartibles · identidad</span>
        <h1 className="stage-title">Lo que llevas contigo — en el bloqueo de tu teléfono.</h1>
        <p className="stage-sub">
          Wallpapers generados desde los libros, los subrayados y el diario del usuario. Para llevarse al bolsillo,
          para compartir, para recordar. Mantras y citas, no marketing.
        </p>
      </header>

      {/* Hero */}
      <div className="hero">
        <HeroQuote/>
        <div className="hero-meta">
          <h2>Subrayado del Cap. 4 — convertido en fondo.</h2>
          <p>
            Cuando subrayas en el lector, Psico Platform te ofrece quedarte con la frase como
            fondo de pantalla. Tipografía, color y atribución generados automáticamente desde
            el mood dominante del capítulo.
          </p>
          <div className="tags">
            <span className="tag">📖 Emociones en construcción</span>
            <span className="tag">Cap. 4</span>
            <span className="tag">2532 × 1170 px</span>
            <span className="tag">Lavender · oscuro</span>
          </div>
          <div className="hero-actions">
            <button className="btn-primary">↓ Descargar</button>
            <button className="btn-secondary">⤴ Compartir</button>
            <button className="btn-ghost">Ver otras del Cap. 4 →</button>
          </div>
        </div>
      </div>

      {/* Gallery */}
      <section className="section">
        <div className="section-h">
          <h3>Set base — 7 variantes</h3>
          <span className="meta">Generadas semanalmente · tu cuenta</span>
        </div>
        <div className="gallery">
          <Tile title="La pausa no se hereda" meta="Quote · sage · Cap. 3">
            <PauseQuote/>
          </Tile>
          <Tile title="A tu ritmo — en tu idioma" meta="Manifiesto · papel">
            <MantraLight/>
          </Tile>
          <Tile title="Mi pausa de las 7:30" meta="De tu diario · personal">
            <PersonalPause/>
          </Tile>
          <Tile title="6 días seguidos" meta="Racha actual · lavender">
            <Streak/>
          </Tile>
          <Tile title="Familias ensambladas" meta="Lanzamiento · noche">
            <CoverBlowup/>
          </Tile>
          <Tile title="Esta semana fue Calma" meta="Patrón · mood map">
            <MoodOfWeek/>
          </Tile>
          <Tile title="Psico Platform" meta="Identidad · plana">
            <Identity/>
          </Tile>
          <Tile title="Generar el tuyo" meta="A partir de un subrayado">
            <div className="wp-frame" style={{ background: "linear-gradient(180deg, #fff 0%, #f5f4f1 100%)" }}>
              <div className="wp-bg" style={{ alignItems: "center", justifyContent: "center", display: "flex" }}>
                <div style={{ textAlign: "center", padding: 24 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 999, background: "var(--color-lavender-100)", color: "var(--color-lavender-700)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 200, margin: "0 auto 16px" }}>+</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-warm-900)", marginBottom: 6 }}>Crear desde un subrayado</div>
                  <div style={{ font: "500 11.5px/1.5 var(--font-mono)", color: "var(--color-warm-500)" }}>Elige una cita y un mood · 8 fondos sugeridos.</div>
                </div>
              </div>
            </div>
          </Tile>
        </div>
      </section>

      {/* Generator panel */}
      <section className="generator">
        <div>
          <span style={{ font: "600 11px/1 var(--font-mono)", color: "var(--color-lavender-700)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
            ⚙ El sistema
          </span>
          <h3 style={{ marginTop: 10 }}>Cómo se hacen — para que no se parezcan a nada más.</h3>
          <p>
            Un wallpaper nace de tres entradas: una <b>frase</b> (subrayado o entrada del diario),
            un <b>mood</b> (de tu última semana o el del capítulo de origen) y un <b>formato</b> (oscuro, papel, blowup).
            Tipografía Newsreader para citas, Geist para meta — siempre. Resolución para iPhone 14/15/16.
          </p>

          <div className="gen-source">
            "No todo lo que se acelera es ansiedad. A veces es solo el cuerpo terminando un día — pero la mente todavía no se ha enterado."
            <div style={{ font: "500 10.5px/1 var(--font-mono)", color: "var(--color-warm-500)", marginTop: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Subrayado · 14 may · Cap. 4
            </div>
          </div>

          <div className="gen-controls">
            <div className="gen-radio on">
              <span className="gen-radio-dot"/>
              <span style={{ flex: 1 }}>Oscuro · lavender (mood del capítulo)</span>
              <span style={{ font: "500 11px/1 var(--font-mono)" }}>Recomendado</span>
            </div>
            <div className="gen-radio">
              <span className="gen-radio-dot"/>
              <span style={{ flex: 1 }}>Sage oscuro</span>
            </div>
            <div className="gen-radio">
              <span className="gen-radio-dot"/>
              <span style={{ flex: 1 }}>Papel · claro</span>
            </div>
          </div>

          <div className="gen-cta">
            <button className="btn-primary">Generar wallpaper →</button>
          </div>
        </div>
        <div className="gen-preview">
          <HeroQuote scale={0.85}/>
        </div>
      </section>

      <footer className="foot">
        <b>Decisiones de identidad:</b>&nbsp;
        sin logos sobre la cita &nbsp;·&nbsp;
        atribución mínima en monospace al pie &nbsp;·&nbsp;
        nunca emoji decorativos &nbsp;·&nbsp;
        2532×1170 nativo · respetan safe-area iOS &nbsp;·&nbsp;
        compartibles a Instagram Stories y WhatsApp Status.
      </footer>
    </div>
  );
}

window.WallpapersApp = WallpapersApp;
