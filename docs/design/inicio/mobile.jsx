// inicio/mobile.jsx — Inicio en iPhone.

const {
  USER: U_M, GREETINGS: G_M, MOODS: MD_M, MOOD_SWATCH: SW_M,
  CONTINUE_BOOK: CB_M, ECO_MOMENT: MM_M, RECOS: RC_M, STATS: ST_M,
  REFLECTION_PROMPT: RP_M, SHORTCUTS: SC_M, WEEKDAYS_FULL: WF_M,
} = window;

function tod(hour) { return hour < 12 ? "morning" : hour < 19 ? "afternoon" : "evening"; }

function MobTabbar() {
  const tabs = [
    { id: "home",   icon: "🏠", lbl: "Inicio", on: true },
    { id: "books",  icon: "📚", lbl: "Libros" },
    { id: "plan",   icon: "💎", lbl: "Mi plan" },
    { id: "perfil", icon: "👤", lbl: "Perfil" },
  ];
  return (
    <nav className="mob-tabbar">
      {tabs.map((t) => (
        <span key={t.id} className={"mob-tab " + (t.on ? "is-on" : "")}>
          <span className="mob-tab-icon">{t.icon}</span>
          <span className="mob-tab-lbl">{t.lbl}</span>
        </span>
      ))}
    </nav>
  );
}

function MobileInicio({ tweaks, setTweak }) {
  const g = G_M[tod(tweaks.hour)];
  const [pick, setPick] = React.useState(null);
  const mood = MD_M.find((m) => m.id === tweaks.mood);
  const checkedIn = tweaks.checkedIn && mood;

  return (
    <div className="mob">
      <div className="mob-scroll">
        {/* Greeting */}
        <div className="mob-greet">
          <div>
            <span className="mob-greet-eyebrow">Viernes · {U_M.city}</span>
            <h1>{g.greet}, {U_M.firstName}.</h1>
            <p className="mob-greet-sub">{g.sub}</p>
          </div>
          <span className="mob-plan-chip">
            <span className={"mob-plan-chip-dot " + (tweaks.tier === "pro" ? "pro" : "")}></span>
            {tweaks.tier === "pro" ? "Pro" : "Gratuito"}
          </span>
        </div>

        {/* Check-in */}
        <div className="mob-card">
          {checkedIn ? (
            <>
              <span className="mob-card-eyebrow">Tu check-in de hoy</span>
              <div className="mob-checkin-done">
                <span className="mob-checkin-done-dot" style={{ background: SW_M[mood.id] }}></span>
                <div>
                  <div className="mob-checkin-done-name">{mood.emoji} {mood.name}</div>
                  <div className="mob-checkin-done-sub">Hace 12 min · libro adaptado</div>
                </div>
              </div>
            </>
          ) : (
            <>
              <span className="mob-card-eyebrow">Antes de empezar</span>
              <h2 className="mob-card-h">¿Cómo te sientes ahora?</h2>
              <p className="mob-card-sub">El libro se ajusta a tu mood.</p>
              <div className="mob-checkin-moods">
                {MD_M.map((m) => (
                  <button
                    key={m.id}
                    className={"mob-mood-btn " + (tweaks.mood === m.id ? "is-on" : "")}
                    onClick={() => { setTweak("mood", m.id); setTweak("checkedIn", true); }}
                    type="button"
                  >
                    <span style={{ fontSize: 13 }}>{m.emoji}</span>
                    {m.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Continue */}
        {tweaks.hasProgress && (
          <div className="mob-cont">
            <div className={"mob-cont-cover cover-" + CB_M.cover}></div>
            <div style={{ minWidth: 0 }}>
              <span className="mob-cont-eyebrow">Continúa</span>
              <div className="mob-cont-title">{CB_M.title}</div>
              <div className="mob-cont-next">{CB_M.nextChapter}</div>
              <div className="mob-cont-bar"><div className="mob-cont-bar-fill" style={{ width: Math.round(CB_M.progress * 100) + "%" }}/></div>
              <span className="mob-cont-cta">▶ Seguir leyendo · {CB_M.estimatedMin} min</span>
            </div>
          </div>
        )}

        {/* Marina */}
        {tweaks.showMarina && (
          <div className="mob-marina">
            <header className="mob-marina-head">
              <span className="mob-marina-avatar">{MM_M.initials}</span>
              <div>
                <div className="mob-marina-id">Eco</div>
                <div className="mob-marina-badge">✦ {MM_M.badge}</div>
              </div>
            </header>
            <p className="mob-marina-body">{MM_M.message}</p>
            <button className="mob-marina-cta">✦ Aplicar Reflexión →</button>
          </div>
        )}

        {/* Recos */}
        <div className="mob-sech">
          <h3>Para ti</h3>
          <a href="#">Ver todo</a>
        </div>
        <div className="mob-recos">
          {RC_M.map((r, i) => (
            <article key={i} className="mob-reco">
              <div className="mob-reco-row">
                <span className={"mob-reco-cover cover-" + r.cover}></span>
                <div style={{ minWidth: 0 }}>
                  <span className="mob-reco-kind">
                    {r.type === "book" ? "Libro" : r.type === "chapter" ? "Capítulo" : "Audio · 7 min"}
                  </span>
                  <div className="mob-reco-title">{r.title}</div>
                  <div className="mob-reco-author">{r.author}</div>
                </div>
              </div>
              <div className="mob-reco-reason">{r.reason}</div>
            </article>
          ))}
        </div>

        {/* Stats */}
        {tweaks.showStats && (
          <>
            <div className="mob-sech">
              <h3>Tu camino</h3>
              <a href="#">Ver todo</a>
            </div>
            <div className="mob-stats">
              <div className="web-stat">
                <div className="web-stat-lbl">Racha</div>
                <div className="web-stat-val">{ST_M.streakDays}<small>días</small></div>
                <div className="web-stat-sub">Mejor: {ST_M.longestStreak} días</div>
              </div>
              <div className="web-stat">
                <div className="web-stat-lbl">Esta semana</div>
                <div className="web-stat-val">{ST_M.weekMinutes}<small>min</small></div>
                <div className="web-stat-sub">Meta · {ST_M.weekTarget} min</div>
              </div>
            </div>
          </>
        )}

        {/* Reflexión */}
        {tweaks.showReflexion && (
          <div className="mob-reflex">
            <span className="mob-card-eyebrow">✎ Reflexión · 30 s</span>
            <h3>{RP_M.question}</h3>
            <div className="mob-reflex-chips">
              {RP_M.chips.map((c) => (
                <button
                  key={c.id}
                  className={"mob-reflex-chip " + (pick === c.id ? "is-on" : "")}
                  onClick={() => setPick(c.id)}
                  type="button"
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Upgrade (free) */}
        {tweaks.tier === "free" && (
          <div className="mob-upgrade">
            <span className="mob-upgrade-glyph">⭐</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="mob-upgrade-title">Desbloquea todo · Pro $7/mes</div>
              <p className="mob-upgrade-sub">8 libros · audios · Eco</p>
            </div>
            <span className="mob-upgrade-arrow">→</span>
          </div>
        )}

        {/* Shortcuts */}
        <div className="mob-sech">
          <h3>Atajos</h3>
        </div>
        <div className="mob-shortcuts">
          {SC_M.map((s) => (
            <a key={s.id} className="mob-shortcut" href={s.href}>
              <span className="mob-shortcut-icon">{s.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div className="mob-shortcut-lbl">{s.label}</div>
                <div className="mob-shortcut-sub">{s.sub}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
      <MobTabbar/>
    </div>
  );
}

window.MobileInicio = MobileInicio;
