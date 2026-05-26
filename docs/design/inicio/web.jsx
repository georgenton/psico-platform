// inicio/web.jsx — Inicio (dashboard home) web surface.

const { USER, GREETINGS, MOODS, MOOD_SWATCH, CONTINUE_BOOK, ECO_MOMENT,
        RECOS, STATS, REFLECTION_PROMPT, SHORTCUTS, WEEKDAYS, WEEKDAYS_FULL } = window;

function Ico({ d, size = 16, sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const I = {
  arrow:  <Ico d="M5 12h14M13 6l6 6-6 6"/>,
  play:   <Ico d="M8 5v14l11-7z"/>,
  sparkle: <Ico d={["M12 3l1.7 4.6L18 9l-4.3 1.4L12 15l-1.7-4.6L6 9l4.3-1.4z","M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z"]}/>,
};

// ── Sidebar ──────────────────────────────────────────────────────────────
function WebSidebar({ tier }) {
  const N = window.Icons;
  const items = [
    { icon: <N.home />, label: "Inicio", on: true },
    { icon: <N.book />, label: "Mi biblioteca" },
    { icon: <N.plan />, label: "Mi plan" },
    { icon: <N.user />, label: "Perfil" },
  ];
  return (
    <aside className="web-side">
      <div className="web-side-head">
        <span className="web-side-wordmark">Psico Platform</span>
      </div>
      <nav className="web-side-nav">
        <div className="web-side-eyebrow">Menú</div>
        {items.map((it) => (
          <a key={it.label} className={"web-side-link " + (it.on ? "is-on" : "")} href="#">
            <span className="web-side-link-icon">{it.icon}</span>
            {it.label}
          </a>
        ))}
      </nav>
      <div className="web-side-foot">
        <div className="web-side-user">
          <span className="web-side-avatar">A</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="web-side-user-name">ana@correo.com</div>
            <div className="web-side-user-plan">
              <span className={"plan-dot " + (tier === "pro" ? "pro" : "")}></span>
              Plan {tier === "pro" ? "Pro" : "Gratuito"}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── Greeting ─────────────────────────────────────────────────────────────
function timeOfDay(hour) {
  if (hour < 12) return "morning";
  if (hour < 19) return "afternoon";
  return "evening";
}
function timeLabel(hour) {
  const h = ((hour + 11) % 12) + 1;
  const ampm = hour < 12 ? "a.m." : "p.m.";
  return `${h}:${String(Math.floor(Math.random() * 50) + 10).padStart(2, "0")} ${ampm}`;
}

// Stable time string for given hour
function timeAt(hour) {
  return `${String(hour % 12 === 0 ? 12 : hour % 12).padStart(2, "0")}:34 ${hour < 12 ? "a.m." : "p.m."}`;
}

function GreetBlock({ hour }) {
  const tod = timeOfDay(hour);
  const g = GREETINGS[tod];
  return (
    <div className="web-greet">
      <div>
        <span className="web-greet-eyebrow">Viernes · {USER.city} · {timeAt(hour)}</span>
        <h1>{g.greet}, {USER.firstName}.</h1>
        <p className="web-greet-sub">{g.sub} {WEEKDAYS_FULL[tod]}</p>
      </div>
      <div className="web-greet-aside">
        <span className="web-greet-time">Tu racha · <strong>{STATS.streakDays} días</strong></span>
      </div>
    </div>
  );
}

// ── Check-in ─────────────────────────────────────────────────────────────
function CheckinBlock({ tweaks, setTweak }) {
  const done = tweaks.checkedIn;
  const mood = MOODS.find((m) => m.id === tweaks.mood);
  if (done && mood) {
    return (
      <div className="web-checkin">
        <div className="web-checkin-done">
          <span className="web-checkin-done-dot" style={{ background: MOOD_SWATCH[mood.id] }}></span>
          <div className="web-checkin-done-meta">
            <span className="web-checkin-eyebrow">Tu check-in de hoy</span>
            <div className="web-checkin-done-name">{mood.emoji} {mood.name}</div>
            <div className="web-checkin-done-sub">
              Marcaste hace 12 min · El libro se ha adaptado.
            </div>
          </div>
        </div>
        <button className="web-checkin-cta" onClick={() => setTweak("checkedIn", false)}>
          Cambiar mood
        </button>
      </div>
    );
  }
  return (
    <div className="web-checkin">
      <div>
        <span className="web-checkin-eyebrow">Check-in · antes de empezar</span>
        <h3>¿Cómo te sientes ahora mismo?</h3>
        <p className="web-checkin-sub">El libro se ajusta a tu estado — colores, tipografía y ritmo cambian.</p>
        <div className="web-checkin-moods">
          {MOODS.map((m) => (
            <button
              key={m.id}
              className={"web-mood-btn " + (tweaks.mood === m.id ? "is-on" : "")}
              onClick={() => { setTweak("mood", m.id); setTweak("checkedIn", true); }}
              type="button"
            >
              <span className="web-mood-btn-emoji">{m.emoji}</span>
              {m.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Continue ─────────────────────────────────────────────────────────────
function ContinueBlock() {
  const b = CONTINUE_BOOK;
  const pct = Math.round(b.progress * 100);
  return (
    <div className="web-continue">
      <div className={"web-continue-cover cover-" + b.cover}>
        <span className="web-continue-cover-glyph">📖</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <span className="web-continue-eyebrow">Continúa donde quedaste</span>
        <h3 className="web-continue-title">{b.title}</h3>
        <div className="web-continue-author">{b.author}</div>
        <div className="web-continue-next">Siguiente · {b.nextChapter}</div>
        <div className="web-continue-meta">
          <span>{b.estimatedMin} min de lectura</span>
          <span className="web-continue-meta-sep">·</span>
          <span>{b.lastReadAt}</span>
          <span className="web-continue-meta-sep">·</span>
          <span className="web-continue-bar"><span className="web-continue-bar-fill" style={{ width: pct + "%" }}/></span>
          <span className="web-continue-pct">{pct}%</span>
        </div>
      </div>
      <button className="web-continue-cta">{I.play} Seguir leyendo</button>
    </div>
  );
}

// ── Eco moment ──────────────────────────────────────────────────────────
function EcoMomentBlock() {
  const m = ECO_MOMENT;
  const swatch = MOOD_SWATCH[m.suggestion.toLowerCase()] || MOOD_SWATCH.reflexion;
  return (
    <div className="web-marina">
      <header className="web-marina-head">
        <span className="web-marina-avatar">{m.initials}</span>
        <div>
          <div className="web-marina-id">Eco</div>
          <div className="web-marina-badge">✦ {m.badge}</div>
        </div>
      </header>
      <p className="web-marina-body">{m.message}</p>
      <div className="web-marina-sugg">
        <span className="web-marina-sugg-swatch" style={{ background: swatch }}></span>
        <div className="web-marina-sugg-meta">
          <div className="web-marina-sugg-lbl">Sugerencia de mood</div>
          <div className="web-marina-sugg-name">{m.suggestion}</div>
          <div className="web-marina-sugg-reason">{m.suggestionReason}</div>
        </div>
      </div>
      <div className="web-marina-actions">
        <button className="web-marina-act primary">{I.sparkle} Aplicar Reflexión</button>
        <button className="web-marina-act ghost">Hablar con Eco →</button>
      </div>
    </div>
  );
}

// ── Recos ───────────────────────────────────────────────────────────────
function RecosBlock() {
  return (
    <div>
      <div className="web-sech">
        <h2 className="web-sech-h">Para ti — basado en tu última semana</h2>
        <a className="web-sech-link" href="#">Cómo elige Marina →</a>
      </div>
      <div className="web-recos">
        {RECOS.map((r, i) => (
          <article key={i} className="web-reco">
            <div className="web-reco-row">
              <span className={"web-reco-cover cover-" + r.cover}></span>
              <div style={{ minWidth: 0 }}>
                <span className="web-reco-kind">
                  {r.type === "book" ? "Libro" : r.type === "chapter" ? "Capítulo" : "Audio · 7 min"}
                </span>
                <div className="web-reco-title">{r.title}</div>
                <div className="web-reco-author">{r.author}</div>
              </div>
            </div>
            <div className="web-reco-reason">{r.reason}</div>
            <a className="web-reco-cta" href="#">{r.cta} →</a>
          </article>
        ))}
      </div>
    </div>
  );
}

// ── Stats ───────────────────────────────────────────────────────────────
function StatsBlock() {
  const s = STATS;
  const pct = Math.round((s.weekMinutes / s.weekTarget) * 100);
  return (
    <div>
      <div className="web-sech">
        <h2 className="web-sech-h">Tu camino esta semana</h2>
        <a className="web-sech-link" href="#">Ver historial →</a>
      </div>
      <div className="web-stats">
        <div className="web-stat">
          <div className="web-stat-lbl">Racha actual</div>
          <div className="web-stat-val">{s.streakDays}<small>días</small></div>
          <div className="web-stat-sub">Tu mejor: {s.longestStreak} días</div>
        </div>
        <div className="web-stat">
          <div className="web-stat-lbl">Esta semana</div>
          <div className="web-stat-val">{s.weekMinutes}<small>min de {s.weekTarget}</small></div>
          <div className="web-stat-bar"><div className="web-stat-bar-fill" style={{ width: pct + "%" }}/></div>
          <div className="web-stat-week">
            {s.lastSevenDays.map((m, i) => (
              <div
                key={i}
                data-d={WEEKDAYS[i]}
                className={"web-stat-week-day " +
                  (i === s.weekday ? "is-today" : m > 0 ? "is-active" : "")}
                style={{ height: Math.max(4, (m / 25) * 36) + "px" }}
                title={WEEKDAYS[i] + ": " + m + " min"}
              />
            ))}
          </div>
        </div>
        <div className="web-stat">
          <div className="web-stat-lbl">Capítulos terminados</div>
          <div className="web-stat-val">{s.chaptersCompleted}<small>de 12</small></div>
          <div className="web-stat-sub">Cap. 5 “Tristeza no es debilidad” en curso.</div>
        </div>
      </div>
    </div>
  );
}

// ── Reflexión ───────────────────────────────────────────────────────────
function ReflexionBlock() {
  const [pick, setPick] = React.useState(null);
  const [text, setText] = React.useState("");
  return (
    <div className="web-reflex">
      <span className="web-reflex-eyebrow">Reflexión rápida · 30 segundos</span>
      <h3>{REFLECTION_PROMPT.question}</h3>
      <p className="web-reflex-helper">{REFLECTION_PROMPT.helper}</p>
      <div className="web-reflex-chips">
        {REFLECTION_PROMPT.chips.map((c) => (
          <button
            key={c.id}
            className={"web-reflex-chip " + (pick === c.id ? "is-on" : "")}
            onClick={() => setPick(c.id)}
            type="button"
          >
            {c.label}
          </button>
        ))}
      </div>
      {pick && (
        <input
          className="web-reflex-input"
          placeholder="Si quieres, dale una palabra o frase. Marina solo lee si tú lo permites."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      <div className="web-reflex-actions">
        <button className="web-reflex-skip" onClick={() => { setPick(null); setText(""); }}>Saltar por hoy</button>
        <button className="web-reflex-send" disabled={!pick}>Guardar en mi diario →</button>
      </div>
    </div>
  );
}

// ── Side rail ───────────────────────────────────────────────────────────
function StreakCard() {
  const s = STATS;
  const p = Math.min(s.streakDays / 14, 1);
  return (
    <div className="web-side-card">
      <span className="web-side-card-eyebrow">Tu racha</span>
      <div className="web-side-streak" style={{ padding: 0 }}>
        <div className="web-streak-ring" style={{ ["--p"]: p }}>
          <div className="web-streak-ring-inner">{s.streakDays}</div>
        </div>
        <div>
          <div className="web-streak-name">{s.streakDays} días seguidos</div>
          <div className="web-streak-sub">Falta poco para tu mejor marca · {s.longestStreak} días.</div>
        </div>
      </div>
    </div>
  );
}

function ShortcutsCard() {
  return (
    <div className="web-shortcuts">
      {SHORTCUTS.map((s) => (
        <a key={s.id} className="web-shortcut" href={s.href}>
          <span className="web-shortcut-icon">{s.icon}</span>
          <div style={{ minWidth: 0 }}>
            <div className="web-shortcut-label">{s.label}</div>
            <div className="web-shortcut-sub">{s.sub}</div>
          </div>
          <span className="web-shortcut-arrow">→</span>
        </a>
      ))}
    </div>
  );
}

function UpgradeCard() {
  return (
    <div className="web-side-card web-side-upgrade">
      <span className="web-side-card-eyebrow">Plan Pro · $7/mes</span>
      <h3>Desbloquea toda la biblioteca</h3>
      <p>Acceso a los 8 libros, audios, Eco dentro del capítulo y modo offline.</p>
      <button className="web-side-upgrade-cta">Actualizar a Pro {I.arrow}</button>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────
function WebInicio({ tweaks, setTweak }) {
  return (
    <div className="web">
      <WebSidebar tier={tweaks.tier}/>
      <main className="web-main">
        <header className="web-top">
          <div className="web-top-title">Inicio</div>
          <div className="web-top-day">{WEEKDAYS[STATS.weekday]} · 15 may</div>
        </header>
        <div className="web-page">
          <div className="web-page-inner">
            <GreetBlock hour={tweaks.hour}/>

            <div className="web-grid">
              <div className="web-col">
                <CheckinBlock tweaks={tweaks} setTweak={setTweak}/>
                {tweaks.hasProgress && <ContinueBlock/>}
                {tweaks.showMarina && <EcoMomentBlock/>}
                <RecosBlock/>
                {tweaks.showStats && <StatsBlock/>}
                {tweaks.showReflexion && <ReflexionBlock/>}
              </div>
              <div className="web-col-side">
                {tweaks.tier === "free" && <UpgradeCard/>}
                <StreakCard/>
                <ShortcutsCard/>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

window.WebInicio = WebInicio;
