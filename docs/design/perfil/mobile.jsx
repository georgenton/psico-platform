// perfil/mobile.jsx — Perfil iPhone surface.

const {
  PERFIL_USER: U_M, PERFIL_STATS: ST_M, PERFIL_ACHIEVEMENTS: AC_M,
  PERFIL_NOTIFS: NF_M, PERFIL_ACCOUNT_ROWS: AR_M, PERFIL_PRIVACY: PV_M,
  PERFIL_MOOD_OPTS: MO_M, PERFIL_REMINDER_OPTS: RO_M,
} = window;

function MobTabbar() {
  const tabs = [
    { id: "home",   icon: "🏠", lbl: "Inicio" },
    { id: "books",  icon: "📚", lbl: "Libros" },
    { id: "plan",   icon: "💎", lbl: "Mi plan" },
    { id: "perfil", icon: "👤", lbl: "Perfil", on: true },
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

function MobilePerfil({ tweaks, setTweak }) {
  const tier = tweaks.tier;
  return (
    <div className="mob">
      <div className="mob-scroll">
        {/* Hero */}
        <section className="mob-hero">
          <div className="mob-hero-avatar">
            {U_M.avatarSeed}
            <span className="mob-hero-avatar-edit">✎</span>
          </div>
          <div className="mob-hero-name">{U_M.fullName}</div>
          <div className="mob-hero-email">{U_M.email}</div>
          <p className="mob-hero-bio">"{U_M.bio}"</p>
          <div className="mob-hero-pills">
            <span className="mob-hero-pill">
              <span className={"mob-hero-pill-dot " + (tier === "pro" ? "pro" : "")}></span>
              Plan {tier === "pro" ? "Pro" : "Gratuito"}
            </span>
            <span className="mob-hero-pill">🌱 Desde nov. 2025</span>
            <span className="mob-hero-pill">🔥 6 días</span>
          </div>
        </section>

        {/* Stats */}
        {tweaks.showStats && (
          <>
            <div className="mob-sech"><h3>Tu camino</h3></div>
            <div className="mob-stats">
              {ST_M.slice(0, 3).map((s) => (
                <div key={s.id} className="mob-stat">
                  <div className="mob-stat-lbl">{s.lbl}</div>
                  <div className="mob-stat-val">{s.val}{s.unit && <small> {s.unit}</small>}</div>
                  <div className="mob-stat-hint">{s.hint}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Achievements horizontal */}
        {tweaks.showAchievements && (
          <>
            <div className="mob-sech"><h3>Hitos</h3></div>
            <div className="mob-achs">
              {AC_M.map((a) => (
                <div key={a.id} className={"mob-ach " + (a.locked || !a.done ? "is-locked" : "")}>
                  <span className="mob-ach-glyph">{a.icon}</span>
                  <div className="mob-ach-label">{a.label}</div>
                  <div className="mob-ach-sub">{a.sub}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Preferencias */}
        <div className="mob-sech"><h3>Preferencias</h3></div>
        <div className="mob-card">
          <div className="mob-row">
            <span className="mob-row-icon">🎙</span>
            <div style={{ minWidth: 0 }}>
              <div className="mob-row-lbl">Voz</div>
              <div className="mob-row-sub">Español neutro</div>
            </div>
            <span className="mob-row-chev">›</span>
          </div>
          <div className="mob-row">
            <span className="mob-row-icon">🕊</span>
            <div style={{ minWidth: 0 }}>
              <div className="mob-row-lbl">Mood por defecto</div>
              <div className="mob-row-sub">{MO_M.find((m) => m.id === tweaks.defaultMood)?.label}</div>
            </div>
            <span className="mob-row-chev">›</span>
          </div>
          <div className="mob-row">
            <span className="mob-row-icon">🌗</span>
            <div style={{ minWidth: 0 }}>
              <div className="mob-row-lbl">Tema</div>
              <div className="mob-row-sub">Sistema</div>
            </div>
            <span className="mob-row-chev">›</span>
          </div>
          <div className="mob-row">
            <span className="mob-row-icon">⏱</span>
            <div style={{ minWidth: 0 }}>
              <div className="mob-row-lbl">Tiempo de lectura</div>
              <div className="mob-row-sub">15 min / día</div>
            </div>
            <span className="mob-row-chev">›</span>
          </div>
        </div>

        {/* Notificaciones */}
        <div className="mob-sech"><h3>Notificaciones</h3></div>
        <div className="mob-card">
          {NF_M.map((n) => (
            <div key={n.id} className="mob-row">
              <span className="mob-row-icon">🔔</span>
              <div style={{ minWidth: 0 }}>
                <div className="mob-row-lbl">{n.label}</div>
                <div className="mob-row-sub">{n.sub}</div>
              </div>
              <button
                className={"tog " + (tweaks["notif_" + n.id] ?? n.enabled ? "is-on" : "")}
                onClick={() => setTweak("notif_" + n.id, !(tweaks["notif_" + n.id] ?? n.enabled))}
                aria-label={n.label}
              />
            </div>
          ))}
        </div>

        {/* Privacidad */}
        {tweaks.showPrivacy && (
          <>
            <div className="mob-sech"><h3>Privacidad</h3></div>
            <div className="mob-card">
              <div className="mob-row">
                <span className="mob-row-icon">✦</span>
                <div style={{ minWidth: 0 }}>
                  <div className="mob-row-lbl">Eco recuerda</div>
                  <div className="mob-row-sub">Memoria entre conversaciones</div>
                </div>
                <button
                  className={"tog " + (tweaks.priv_ecoMemory ?? PV_M.ecoMemory ? "is-on" : "")}
                  onClick={() => setTweak("priv_ecoMemory", !(tweaks.priv_ecoMemory ?? PV_M.ecoMemory))}
                />
              </div>
              <div className="mob-row">
                <span className="mob-row-icon">✎</span>
                <div style={{ minWidth: 0 }}>
                  <div className="mob-row-lbl">Diario privado</div>
                  <div className="mob-row-sub">Solo tú lo lees</div>
                </div>
                <button
                  className={"tog " + (tweaks.priv_journal ?? PV_M.journalPrivate ? "is-on" : "")}
                  onClick={() => setTweak("priv_journal", !(tweaks.priv_journal ?? PV_M.journalPrivate))}
                />
              </div>
              <div className="mob-row">
                <span className="mob-row-icon">⬇</span>
                <div style={{ minWidth: 0 }}>
                  <div className="mob-row-lbl">Descargar mi información</div>
                  <div className="mob-row-sub">.zip con todo lo tuyo</div>
                </div>
                <button className="mob-row-action">Solicitar</button>
              </div>
            </div>
          </>
        )}

        {/* Cuenta */}
        <div className="mob-sech"><h3>Cuenta</h3></div>
        <div className="mob-card">
          {AR_M.map((r) => (
            <div key={r.id} className="mob-row">
              <span className="mob-row-icon">{r.id === "name" ? "👤" : r.id === "email" ? "✉" : r.id === "pw" ? "🔒" : "🛡"}</span>
              <div style={{ minWidth: 0 }}>
                <div className="mob-row-lbl">{r.lbl}</div>
                <div className="mob-row-sub">{r.val}</div>
              </div>
              <span className="mob-row-chev">›</span>
            </div>
          ))}
        </div>

        {/* App */}
        <div className="mob-sech"><h3>App</h3></div>
        <div className="mob-card">
          <div className="mob-row">
            <span className="mob-row-icon">ⓘ</span>
            <div style={{ minWidth: 0 }}>
              <div className="mob-row-lbl">Versión</div>
              <div className="mob-row-sub">2.4.1 · iOS</div>
            </div>
          </div>
          <div className="mob-row">
            <span className="mob-row-icon">✉</span>
            <div style={{ minWidth: 0 }}>
              <div className="mob-row-lbl">Soporte</div>
              <div className="mob-row-sub">hola@psico.app</div>
            </div>
            <span className="mob-row-chev">›</span>
          </div>
          <div className="mob-row">
            <span className="mob-row-icon">🛡</span>
            <div style={{ minWidth: 0 }}>
              <div className="mob-row-lbl">Términos y privacidad</div>
              <div className="mob-row-sub">Versión 2026.05</div>
            </div>
            <span className="mob-row-chev">›</span>
          </div>
        </div>

        {/* Danger */}
        <div className="mob-danger">
          <div className="mob-danger-h">Cuenta</div>
          <button className="mob-danger-btn" style={{ border: "1.5px solid var(--color-warm-300)", color: "var(--color-warm-700)" }}>
            ↩ Cerrar sesión
          </button>
          <button className="mob-danger-btn" style={{ marginTop: 8 }}>
            Eliminar mi cuenta
          </button>
        </div>
      </div>
      <MobTabbar/>
    </div>
  );
}

window.MobilePerfil = MobilePerfil;
