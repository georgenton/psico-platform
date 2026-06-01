// perfil/web.jsx — Perfil (dashboard web surface).

const {
  PERFIL_USER, PERFIL_STATS, PERFIL_ACHIEVEMENTS, PERFIL_PREFS,
  PERFIL_VOICE_OPTS, PERFIL_MOOD_OPTS, PERFIL_TIME_OPTS, PERFIL_REMINDER_OPTS,
  PERFIL_NOTIFS, PERFIL_PRIVACY, PERFIL_ACCOUNT_ROWS, PERFIL_APP_ROWS,
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
  pen:    <Ico d={["M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", "M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"]}/>,
  chev:   <Ico d="M6 9l6 6 6-6"/>,
  arrow:  <Ico d="M5 12h14M13 6l6 6-6 6"/>,
  out:    <Ico d={["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"]}/>,
  shield: <Ico d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
  bell:   <Ico d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21a2 2 0 0 0 4 0"/>,
  cog:    <Ico d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .67.39 1.27 1 1.51h.09a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>,
  user:   <Ico d={["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"]}/>,
  mail:   <Ico d={["M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z","m22 6-10 7L2 6"]}/>,
  lock:   <Ico d={["M7 11V7a5 5 0 0 1 10 0v4", "M5 11h14v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"]}/>,
  info:   <Ico d={["M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z","M12 16v-4","M12 8h.01"]}/>,
  globe:  <Ico d={["M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z","M2 12h20","M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20"]}/>,
  eco:    <span className="eco-glyph">✦</span>,
};

// ── Sidebar ──────────────────────────────────────────────────────────────
function WebSidebar({ tier }) {
  const N = window.Icons;
  const items = [
    { icon: <N.home />, label: "Inicio" },
    { icon: <N.book />, label: "Mi biblioteca" },
    { icon: <N.eco />, label: "Eco" },
    { icon: <N.plan />, label: "Mi plan" },
    { icon: <N.user />, label: "Perfil", on: true },
  ];
  return (
    <aside className="web-side">
      <div className="web-side-head"><span className="web-side-wordmark">Psico Platform</span></div>
      <nav className="web-side-nav">
        <div className="web-side-eyebrow">Menú</div>
        {items.map((it) => (
          <a key={it.label} className={"web-side-link " + (it.on ? "is-on" : "")} href="#">
            <span className="web-side-link-icon">{it.icon}</span>
            <span style={{ flex: 1 }}>{it.label}</span>
          </a>
        ))}
      </nav>
      <div className="web-side-foot">
        <div className="web-side-user">
          <span className="web-side-avatar">{PERFIL_USER.avatarSeed[0]}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="web-side-user-name">{PERFIL_USER.email}</div>
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

// ── Hero ────────────────────────────────────────────────────────────────
function HeroBlock({ tier }) {
  return (
    <section className="web-hero">
      <div className="web-hero-row">
        <div className="web-hero-avatar">
          {PERFIL_USER.avatarSeed}
          <span className="web-hero-avatar-edit" aria-label="Cambiar foto">{I.pen}</span>
        </div>
        <div className="web-hero-meta">
          <h1 className="web-hero-name">{PERFIL_USER.fullName}</h1>
          <div className="web-hero-email">
            {PERFIL_USER.email} <span style={{ color: "var(--color-warm-300)" }}>·</span> {PERFIL_USER.city}, {PERFIL_USER.country}
          </div>
          <p className="web-hero-bio">"{PERFIL_USER.bio}"</p>
          <div className="web-hero-pills">
            <span className="web-hero-pill">
              <span className={"web-hero-pill-dot " + (tier === "pro" ? "pro" : "")}></span>
              Plan {tier === "pro" ? "Pro" : "Gratuito"}
            </span>
            <span className="web-hero-pill">
              <span style={{ fontSize: 11 }}>🌱</span>
              Miembro desde {PERFIL_USER.joinedAt}
            </span>
            <span className="web-hero-pill">
              <span style={{ fontSize: 11 }}>🔥</span>
              Racha · 6 días
            </span>
          </div>
        </div>
        <div className="web-hero-aside">
          <button className="web-hero-edit-btn">{I.pen} Editar perfil</button>
          {tier === "free" && (
            <button className="web-hero-edit-btn" style={{
              background: "var(--color-lavender-700)", color: "#fff", border: 0
            }}>
              ✦ Actualizar a Pro
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Stats ───────────────────────────────────────────────────────────────
function StatsBlock() {
  return (
    <section>
      <div className="web-sech">
        <h2 className="web-sech-h">Tu camino</h2>
        <a className="web-sech-link" href="#">Ver historial completo →</a>
      </div>
      <div className="web-stats">
        {PERFIL_STATS.map((s) => (
          <div key={s.id} className="web-stat">
            <div className="web-stat-lbl">{s.lbl}</div>
            <div className="web-stat-val">{s.val}{s.unit && <small>{s.unit}</small>}</div>
            <div className="web-stat-hint">{s.hint}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Achievements ────────────────────────────────────────────────────────
function AchsBlock() {
  return (
    <section>
      <div className="web-sech">
        <h2 className="web-sech-h">Hitos</h2>
        <a className="web-sech-link" href="#">Ver todos los 18 →</a>
      </div>
      <div className="web-achs">
        {PERFIL_ACHIEVEMENTS.map((a) => (
          <div key={a.id} className={"web-ach " + (a.locked || !a.done ? "is-locked" : "")}>
            <span className="web-ach-glyph">{a.icon}</span>
            <div className="web-ach-label">{a.label}</div>
            <div className="web-ach-sub">{a.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Preferencias card ───────────────────────────────────────────────────
function PrefsCard({ tweaks, setTweak }) {
  return (
    <div className="web-card">
      <header className="web-card-h">
        <h2>Preferencias</h2>
        <span className="web-card-h-sub">Cómo se siente Psico Platform para ti.</span>
      </header>
      <div className="web-row">
        <span className="web-row-icon">🎙</span>
        <div className="web-row-meta">
          <div className="web-row-lbl">Voz</div>
          <div className="web-row-sub">Usado por Eco y los audios.</div>
        </div>
        <button className="web-select">
          {PERFIL_VOICE_OPTS.find((o) => o.id === tweaks.voice).label.split(" ").slice(0, 2).join(" ")}
          <span className="web-select-chev">{I.chev}</span>
        </button>
      </div>
      <div className="web-row">
        <span className="web-row-icon">🕊</span>
        <div className="web-row-meta">
          <div className="web-row-lbl">Mood por defecto</div>
          <div className="web-row-sub">Lo que Eco asume al abrir un libro.</div>
        </div>
        <div className="web-seg">
          {PERFIL_MOOD_OPTS.map((m) => (
            <button
              key={m.id}
              className={"web-seg-btn " + (tweaks.defaultMood === m.id ? "is-on" : "")}
              onClick={() => setTweak("defaultMood", m.id)}
            >{m.label}</button>
          ))}
        </div>
      </div>
      <div className="web-row">
        <span className="web-row-icon">⏱</span>
        <div className="web-row-meta">
          <div className="web-row-lbl">Tiempo de lectura</div>
          <div className="web-row-sub">Para sugerir capítulos del tamaño correcto.</div>
        </div>
        <button className="web-select">
          {PERFIL_TIME_OPTS.find((o) => o.id === tweaks.readingTime).label}
          <span className="web-select-chev">{I.chev}</span>
        </button>
      </div>
      <div className="web-row">
        <span className="web-row-icon">🌗</span>
        <div className="web-row-meta">
          <div className="web-row-lbl">Tema</div>
          <div className="web-row-sub">El claro es la voz de la marca; el oscuro es de noche.</div>
        </div>
        <div className="web-seg">
          <button className={"web-seg-btn " + (tweaks.theme === "system" ? "is-on" : "")} onClick={() => setTweak("theme", "system")}>Sistema</button>
          <button className={"web-seg-btn " + (tweaks.theme === "light"  ? "is-on" : "")} onClick={() => setTweak("theme", "light")}>Claro</button>
          <button className={"web-seg-btn " + (tweaks.theme === "dark"   ? "is-on" : "")} onClick={() => setTweak("theme", "dark")}>Oscuro</button>
        </div>
      </div>
    </div>
  );
}

// ── Notificaciones card ─────────────────────────────────────────────────
function NotifsCard({ tweaks, setTweak }) {
  return (
    <div className="web-card">
      <header className="web-card-h">
        <h2>Notificaciones</h2>
        <span className="web-card-h-sub">Pocas y útiles. Sin spam, lo prometemos.</span>
      </header>
      {PERFIL_NOTIFS.map((n, i) => (
        <div key={n.id} className="web-row">
          <span className="web-row-icon">{I.bell}</span>
          <div className="web-row-meta">
            <div className="web-row-lbl">{n.label}</div>
            <div className="web-row-sub">{n.sub}</div>
          </div>
          <button
            className={"tog " + (tweaks["notif_" + n.id] ?? n.enabled ? "is-on" : "")}
            onClick={() => setTweak("notif_" + n.id, !(tweaks["notif_" + n.id] ?? n.enabled))}
            aria-label={"Activar " + n.label}
          />
        </div>
      ))}
      <div className="web-row">
        <span className="web-row-icon">{I.bell}</span>
        <div className="web-row-meta">
          <div className="web-row-lbl">Cuándo prefieres tu recordatorio</div>
          <div className="web-row-sub">Solo aplica si tienes el recordatorio diario activado.</div>
        </div>
        <div className="web-seg">
          {PERFIL_REMINDER_OPTS.map((r) => (
            <button
              key={r.id}
              className={"web-seg-btn " + (tweaks.reminderTime === r.id ? "is-on" : "")}
              onClick={() => setTweak("reminderTime", r.id)}
            >{r.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Privacidad card ─────────────────────────────────────────────────────
function PrivacyCard({ tweaks, setTweak }) {
  return (
    <div className="web-card">
      <header className="web-card-h">
        <h2>Privacidad</h2>
        <span className="web-card-h-sub">Tu información es tuya — siempre.</span>
      </header>
      <div className="web-privacy-note">
        <span className="web-privacy-note-icon">{I.shield}</span>
        <span>
          Nunca compartimos tu diario ni tus conversaciones con Eco con nadie — ni equipos de marketing, ni terceros. Si quieres, puedes pedir tu información completa o borrarla en un par de clics.
        </span>
      </div>
      <div className="web-row">
        <span className="web-row-icon">✦</span>
        <div className="web-row-meta">
          <div className="web-row-lbl">Eco recuerda lo que conversamos</div>
          <div className="web-row-sub">Si lo apagas, Eco empieza cada conversación desde cero.</div>
        </div>
        <button
          className={"tog " + (tweaks.priv_ecoMemory ?? PERFIL_PRIVACY.ecoMemory ? "is-on" : "")}
          onClick={() => setTweak("priv_ecoMemory", !(tweaks.priv_ecoMemory ?? PERFIL_PRIVACY.ecoMemory))}
        />
      </div>
      <div className="web-row">
        <span className="web-row-icon">✎</span>
        <div className="web-row-meta">
          <div className="web-row-lbl">Diario privado</div>
          <div className="web-row-sub">Solo tú puedes leerlo. Recomendado activado.</div>
        </div>
        <button
          className={"tog " + (tweaks.priv_journal ?? PERFIL_PRIVACY.journalPrivate ? "is-on" : "")}
          onClick={() => setTweak("priv_journal", !(tweaks.priv_journal ?? PERFIL_PRIVACY.journalPrivate))}
        />
      </div>
      <div className="web-row">
        <span className="web-row-icon">📊</span>
        <div className="web-row-meta">
          <div className="web-row-lbl">Compartir uso anónimo</div>
          <div className="web-row-sub">Datos sin identificarte para mejorar el producto.</div>
        </div>
        <button
          className={"tog " + (tweaks.priv_share ?? PERFIL_PRIVACY.shareUsage ? "is-on" : "")}
          onClick={() => setTweak("priv_share", !(tweaks.priv_share ?? PERFIL_PRIVACY.shareUsage))}
        />
      </div>
      <div className="web-row">
        <span className="web-row-icon">⬇</span>
        <div className="web-row-meta">
          <div className="web-row-lbl">Descargar mi información</div>
          <div className="web-row-sub">Te enviamos un .zip con todo — libros leídos, diario, conversaciones.</div>
        </div>
        <button className="web-row-action">Solicitar →</button>
      </div>
    </div>
  );
}

// ── Cuenta card ─────────────────────────────────────────────────────────
function AccountCard() {
  const icons = { name: I.user, email: I.mail, pw: I.lock, "2fa": I.shield };
  return (
    <div className="web-card">
      <header className="web-card-h">
        <h2>Cuenta</h2>
        <span className="web-card-h-sub">Identidad y acceso.</span>
      </header>
      {PERFIL_ACCOUNT_ROWS.map((r) => (
        <div key={r.id} className="web-row">
          <span className="web-row-icon">{icons[r.id]}</span>
          {r.warn && <span className="web-row-warn-dot" aria-label="Atención"></span>}
          <div className="web-row-meta">
            <div className="web-row-lbl">{r.lbl}</div>
            <div className="web-row-sub">{r.val}</div>
          </div>
          <button className={"web-row-action " + (r.warn ? "warn" : "")}>{r.action} →</button>
        </div>
      ))}
    </div>
  );
}

// ── App card ────────────────────────────────────────────────────────────
function AppCard() {
  const icons = { version: I.info, support: I.mail, terms: I.shield, privacy: I.shield };
  return (
    <div className="web-card">
      <header className="web-card-h">
        <h2>App y soporte</h2>
      </header>
      {PERFIL_APP_ROWS.map((r) => (
        <div key={r.id} className="web-row">
          <span className="web-row-icon">{icons[r.id]}</span>
          <div className="web-row-meta">
            <div className="web-row-lbl">{r.lbl}</div>
            {r.val && <div className="web-row-sub">{r.val}</div>}
          </div>
          {r.link
            ? <button className="web-row-action">Abrir →</button>
            : <span className="web-row-val">{r.val}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Danger zone ─────────────────────────────────────────────────────────
function DangerBlock() {
  return (
    <div className="web-danger">
      <div className="web-danger-h">Cuenta</div>
      <div className="web-danger-row">
        <div className="web-danger-row-meta">
          <div className="web-danger-row-lbl">Cerrar sesión</div>
          <div className="web-danger-row-sub">Tu progreso se queda guardado.</div>
        </div>
        <button className="web-danger-btn subtle">{I.out} Cerrar sesión</button>
      </div>
      <div className="web-danger-row">
        <div className="web-danger-row-meta">
          <div className="web-danger-row-lbl">Eliminar mi cuenta</div>
          <div className="web-danger-row-sub">Borramos tu diario, conversaciones y datos en 14 días.</div>
        </div>
        <button className="web-danger-btn">Eliminar cuenta</button>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────
function WebPerfil({ tweaks, setTweak }) {
  return (
    <div className="web">
      <WebSidebar tier={tweaks.tier}/>
      <main className="web-main">
        <header className="web-top">
          <div className="web-top-title">Perfil</div>
          <div style={{ font: "500 12px/1 var(--font-sans)", color: "var(--color-warm-500)" }}>
            Ajustes · Privacidad · Cuenta
          </div>
        </header>
        <div className="web-page">
          <div className="web-page-inner">
            <HeroBlock tier={tweaks.tier}/>
            {tweaks.showStats && <StatsBlock/>}
            {tweaks.showAchievements && <AchsBlock/>}

            <div className="web-twocol">
              <PrefsCard tweaks={tweaks} setTweak={setTweak}/>
              <NotifsCard tweaks={tweaks} setTweak={setTweak}/>
            </div>

            {tweaks.showPrivacy && <PrivacyCard tweaks={tweaks} setTweak={setTweak}/>}

            <div className="web-twocol">
              <AccountCard/>
              <AppCard/>
            </div>

            <DangerBlock/>
          </div>
        </div>
      </main>
    </div>
  );
}

window.WebPerfil = WebPerfil;
