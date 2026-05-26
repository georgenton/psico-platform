// dynamic-island/app.jsx — Dynamic Island states · iOS-native

// ── Phone shell ──
function PhoneTop({ children, island, wallpaper = "lav", height = "normal", time, label }) {
  const cls = "phone-top " + (height === "tall" ? "tall" : height === "short" ? "short" : "");
  return (
    <div className={cls}>
      <div className={"phone-wallpaper phone-noise " + wallpaper}/>
      <div className="phone-status">
        <span>{time || "9:41"}</span>
        <span>•••• 5G</span>
      </div>
      {height === "tall" && <div className="phone-time">{time || "9:41"}</div>}
      {children}
      {island}
    </div>
  );
}

// ── Wave bars (mini) ──
function Wave({ count = 4, height = 12, color = "currentColor", animated = true }) {
  const seq = [0.55, 1.0, 0.4, 0.85, 0.65, 0.95, 0.3, 0.8].slice(0, count);
  return (
    <span className="is-wave" style={{ color, height }}>
      {seq.map((s, i) => (
        <span key={i} className="bar" style={{
          height: `${s * 100}%`,
          animation: animated ? `is-wave-${i % 4} 0.9s ease-in-out infinite` : undefined,
          animationDelay: `${i * 0.08}s`,
        }}/>
      ))}
      <style>{`
        @keyframes is-wave-0 { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.35); } }
        @keyframes is-wave-1 { 0%,100% { transform: scaleY(0.5); } 50% { transform: scaleY(1); } }
        @keyframes is-wave-2 { 0%,100% { transform: scaleY(0.9); } 50% { transform: scaleY(0.4); } }
        @keyframes is-wave-3 { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
      `}</style>
    </span>
  );
}

// ── Islands (each is a self-contained variant) ──

// EXPANDED — Eco escuchando (hero)
function IslandEcoListening() {
  return (
    <div className="island tall">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <span className="is-icon eco" style={{ width: 36, height: 36, borderRadius: 12, fontSize: 14 }}>✦</span>
        <div style={{ flex: 1 }}>
          <div className="is-label">Eco · te escucha</div>
          <div className="is-label-sm">Conversación · 4 min activa</div>
        </div>
        <span className="is-pulse violet"/>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 4px" }}>
        <Wave count={8} height={28} color="#b08eff"/>
      </div>
      <div style={{
        fontFamily: '"Newsreader", Georgia, serif', fontStyle: "italic",
        fontSize: 13, lineHeight: 1.45, color: "rgba(255,255,255,0.78)",
        marginTop: 10,
      }}>
        "Cuéntame qué pasó después de la conversación con S…"
      </div>
    </div>
  );
}

// COMPACT — Audio playing
function IslandAudioCompact() {
  return (
    <div className="island compact">
      <span className="is-icon audio">📖</span>
      <Wave count={3} height={11} color="#a697ff"/>
    </div>
  );
}

// EXPANDED — Audio capítulo
function IslandAudioExpanded() {
  return (
    <div className="island expanded">
      <span className="is-icon audio" style={{ width: 36, height: 36, borderRadius: 8, fontSize: 14 }}>📖</span>
      <div style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
        <div className="is-label" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          Cap. 4 · Miedo, ansiedad…
        </div>
        <div className="is-label-sm">Emociones en construcción</div>
        <div className="is-progress"><span style={{ width: "42%", background: "#a697ff" }}/></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
        <Wave count={3} height={14} color="#a697ff"/>
      </div>
    </div>
  );
}

// TALL — Pausa diaria (countdown)
function IslandPausa() {
  return (
    <div className="island tall">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <span className="is-icon sage" style={{ width: 32, height: 32, borderRadius: 10, fontSize: 14 }}>◐</span>
        <div style={{ flex: 1 }}>
          <div className="is-label">Pausa de 3 minutos</div>
          <div className="is-label-sm">Respira · inhala 4 · exhala 6</div>
        </div>
        <div className="is-meta tabular" style={{ fontSize: 16, fontWeight: 600 }}>1:42</div>
      </div>
      {/* breathing dot */}
      <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
        <div style={{
          width: 56, height: 56, borderRadius: 999,
          background: "radial-gradient(closest-side, #7fae76, #3a5e34)",
          boxShadow: "0 0 0 8px rgba(127,174,118,0.18), 0 0 0 18px rgba(127,174,118,0.08)",
          animation: "breathe 5s ease-in-out infinite",
        }}/>
        <style>{`
          @keyframes breathe {
            0%, 100% { transform: scale(0.7); }
            50% { transform: scale(1); }
          }
        `}</style>
      </div>
      <div style={{ font: "500 10.5px/1.3 -apple-system, system-ui", color: "rgba(255,255,255,0.55)", textAlign: "center", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        Inhala · 3 / 4
      </div>
    </div>
  );
}

// SPLIT compact — Streak
function IslandStreakSplit() {
  return (
    <div className="island split">
      <div className="island-bubble">
        <span style={{ fontSize: 14 }}>🔥</span>
        <span>6</span>
      </div>
      <div className="island-bubble" style={{ background: "var(--color-lavender-600)" }}>
        <span style={{ fontWeight: 500 }}>Día seguido</span>
      </div>
    </div>
  );
}

// EXPANDED — Diario recordatorio
function IslandDiarioRec() {
  return (
    <div className="island expanded" style={{ padding: "10px 14px" }}>
      <span className="is-icon diario" style={{ width: 32, height: 32, borderRadius: 10, fontSize: 14 }}>✎</span>
      <div style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
        <div className="is-label">¿Una línea antes de dormir?</div>
        <div className="is-label-sm">Diario · sin presión · cuatro días sin escribir</div>
      </div>
      <button className="is-action-btn" style={{ width: 30, height: 30, fontSize: 12 }}>×</button>
    </div>
  );
}

// COMPACT — Highlight saved (transient)
function IslandHighlightCompact() {
  return (
    <div className="island compact" style={{ width: 200 }}>
      <span className="is-icon" style={{ background: "#7fae76", width: 22, height: 22, borderRadius: 999, color: "#fff", fontSize: 13 }}>✓</span>
      <span className="is-label" style={{ fontSize: 11 }}>Subrayado guardado</span>
    </div>
  );
}

// SPLIT compact — Reading session
function IslandReadingSplit() {
  return (
    <div className="island split" style={{ width: 230 }}>
      <div className="island-bubble" style={{ padding: "0 8px" }}>
        <span className="is-icon book" style={{ borderRadius: 4, width: 18, height: 22, fontSize: 10 }}/>
        <span style={{ marginLeft: 4 }}>Cap. 4</span>
      </div>
      <div className="island-bubble" style={{ padding: "0 12px" }}>
        <span className="is-meta tabular">12:38</span>
      </div>
    </div>
  );
}

// EXPANDED — Eco respuesta lista
function IslandEcoReady() {
  return (
    <div className="island tall">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <span className="is-icon eco" style={{ width: 32, height: 32, borderRadius: 999, fontSize: 14 }}>✦</span>
        <div style={{ flex: 1 }}>
          <div className="is-label">Eco respondió</div>
          <div className="is-label-sm">Hace 12 segundos</div>
        </div>
      </div>
      <div style={{
        fontFamily: '"Newsreader", Georgia, serif', fontStyle: "italic",
        fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.85)",
        padding: "4px 0 12px",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        marginTop: 4, paddingTop: 12,
      }}>
        "Cuando dices ‹otra vez›, ¿te refieres a la conversación que tuvieron el sábado, o a un patrón más viejo?"
      </div>
      <div className="is-actions" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <button className="is-action-btn" style={{ flex: 1, height: 32, borderRadius: 999 }}>Después</button>
        <button className="is-action-btn primary" style={{ flex: 2, height: 32, borderRadius: 999, fontWeight: 600 }}>Responder ✦</button>
      </div>
    </div>
  );
}

// TALL — Sesión de lectura (active)
function IslandReadingTall() {
  return (
    <div className="island tall" style={{ width: 320 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 50, height: 64, borderRadius: 6,
          background: "linear-gradient(135deg, #a697ff, #5e42c0)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, color: "rgba(255,255,255,0.85)",
        }}>📖</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="is-label" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Emociones en construcción
          </div>
          <div className="is-label-sm">Cap. 4 · pág. 64 de 92</div>
          <div className="is-progress"><span style={{ width: "68%", background: "#a697ff" }}/></div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div>
          <div className="is-meta tabular">12:38</div>
          <div className="is-label-sm">Hoy</div>
        </div>
        <div>
          <div className="is-meta tabular">3.2h</div>
          <div className="is-label-sm">Semana</div>
        </div>
        <div>
          <div className="is-meta">4 ✦</div>
          <div className="is-label-sm">Subrayados</div>
        </div>
      </div>
    </div>
  );
}

// ── Tile wrapper ──
function Tile({ num, title, sub, tags, phoneProps, children }) {
  return (
    <div className="tile">
      <PhoneTop {...phoneProps} island={children}/>
      <div className="tile-meta">
        <div className="tile-num">{num}</div>
        <div className="tile-title">{title}</div>
        <div className="tile-sub">{sub}</div>
        {tags && (
          <div className="tile-tags">
            {tags.map((t) => <span key={t} className="tile-tag">{t}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stage ──
function IslandApp() {
  return (
    <div className="stage">
      <header className="stage-head">
        <span className="stage-eyebrow">◯ iOS · Dynamic Island</span>
        <h1 className="stage-title">Vive en la isla — no en una notificación.</h1>
        <p className="stage-sub">
          Audio, Eco, pausas y rachas usan la Dynamic Island como su superficie persistente.
          Cada estado tiene tres formas: compacto (siempre presente), expandido (tap largo)
          y separado (cuando algo más comparte la isla). Nueve estados pensados para no robar atención.
        </p>
      </header>

      {/* Hero */}
      <div className="hero">
        <PhoneTop wallpaper="deep" height="tall" island={<IslandEcoListening/>}/>
        <div className="hero-meta">
          <span style={{ font: "600 11px/1 var(--font-mono)", color: "var(--color-lavender-300)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
            ✦ Eco · activa
          </span>
          <h2 style={{ marginTop: 10 }}>El estado más íntimo del producto, ahí donde no se pierde.</h2>
          <p>
            Cuando hablas con Eco — por voz o texto — la conversación se queda en la isla.
            La frase que ves arriba es lo último que Eco te dijo. Mientras el waveform respira,
            sabes que sigue escuchando.
          </p>
          <div className="hero-list">
            <div className="hero-li">
              <span className="hero-li-key">Compacto</span>
              <span className="hero-li-body">Ícono ✦ a la izquierda · waveform vivo a la derecha · siempre presente mientras la conversación esté activa.</span>
            </div>
            <div className="hero-li">
              <span className="hero-li-key">Expandido</span>
              <span className="hero-li-body">Toca largo → última frase, tiempo de conversación, botón <b>Responder</b>. Sin salir de la app actual.</span>
            </div>
            <div className="hero-li">
              <span className="hero-li-key">Cierra</span>
              <span className="hero-li-body">Swipe-down sobre la isla pausa la conversación, no la termina. Vuelve en cualquier momento.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Audio */}
      <section className="section">
        <div className="section-h">
          <h3>Audio · capítulo en escucha</h3>
          <span className="meta">Compacto → expandido</span>
        </div>
        <div className="grid two">
          <Tile
            num="01a · compact"
            title="Cap. en audio"
            sub="Ícono del libro + waveform. Mientras camines, sabrás que sigue."
            tags={["Persistente", "Pulsable"]}
            phoneProps={{ wallpaper: "lav" }}
          >
            <IslandAudioCompact/>
          </Tile>
          <Tile
            num="01b · expanded"
            title="Reproductor mini"
            sub="Toca y se abre el control completo — ▷ ⏪ ⏩ y velocidad."
            tags={["Tap largo"]}
            phoneProps={{ wallpaper: "deep" }}
          >
            <IslandAudioExpanded/>
          </Tile>
        </div>
      </section>

      {/* Active states */}
      <section className="section">
        <div className="section-h">
          <h3>Estados activos</h3>
          <span className="meta">9 patrones, todos persistentes</span>
        </div>
        <div className="grid">
          <Tile
            num="02"
            title="Pausa de 3 minutos"
            sub="Respiración guiada · countdown a la vista mientras usas otras apps."
            tags={["Tall", "Animado"]}
            phoneProps={{ wallpaper: "warm", height: "tall" }}
          >
            <IslandPausa/>
          </Tile>

          <Tile
            num="03"
            title="Día 6 · racha"
            sub="Cuando escribes en el diario hoy, la isla se parte para celebrarlo · 4s y vuelve."
            tags={["Split", "Transient"]}
            phoneProps={{ wallpaper: "lav" }}
          >
            <IslandStreakSplit/>
          </Tile>

          <Tile
            num="04"
            title="¿Una línea antes de dormir?"
            sub="A las 22h si llevas 3+ días sin entrada. Cierra con × — no insiste."
            tags={["Recordatorio", "Suave"]}
            phoneProps={{ wallpaper: "dawn" }}
          >
            <IslandDiarioRec/>
          </Tile>

          <Tile
            num="05"
            title="Subrayado guardado"
            sub="Aparece cuando marcas una frase en el lector. 2s y se va."
            tags={["Toast", "2 segundos"]}
            phoneProps={{ wallpaper: "lav" }}
          >
            <IslandHighlightCompact/>
          </Tile>

          <Tile
            num="06"
            title="Leyendo · 12:38"
            sub="Cap. activo + tiempo de lectura. Tocar pausa la sesión y guarda la posición."
            tags={["Split", "Activo"]}
            phoneProps={{ wallpaper: "warm" }}
          >
            <IslandReadingSplit/>
          </Tile>

          <Tile
            num="07"
            title="Eco respondió"
            sub="Llega como notificación blanda · responder o ‹después› — nada más."
            tags={["Async", "Tall"]}
            phoneProps={{ wallpaper: "deep", height: "tall" }}
          >
            <IslandEcoReady/>
          </Tile>

          <Tile
            num="08"
            title="Sesión de lectura · expandida"
            sub="Tap largo → progreso del capítulo + minutos hoy/semana + subrayados."
            tags={["Tall", "Stats"]}
            phoneProps={{ wallpaper: "lav", height: "tall" }}
          >
            <IslandReadingTall/>
          </Tile>
        </div>
      </section>

      <footer className="foot">
        <b>Principios para la isla:</b>&nbsp;
        nunca más de una isla por sesión &nbsp;·&nbsp;
        animaciones bajo 300ms con ease-out (--easing-default) &nbsp;·&nbsp;
        sin texto-en-mayúsculas largo &nbsp;·&nbsp;
        privadísimo · jamás el texto del diario en la isla &nbsp;·&nbsp;
        el waveform respira, no salta.
      </footer>
    </div>
  );
}

window.IslandApp = IslandApp;
