// terapia/mobile.jsx — Las 7 pantallas en superficie MÓVIL (iPhone).

const {
  T_USER: U_M, T_MOTIVOS: MO_M, T_THERAPISTS: TH_M, T_WEEK: WK_M,
  T_NEXT_SESSION: NS_M, T_SESSIONS_PAST: SP_M,
  T_PREP_ITEMS: PR_M, T_DIARY_ENTRIES: DE_M,
  T_POST_TAGS: PT_M, T_POST_HOMEWORK: PH_M, T_POST_RECOS: RC_M,
  T_HOW: HW_M, T_FAQ: FQ_M,
} = window;

function MAvatar({ cover, initials, size = 48 }) {
  return <span className={"tw-avatar size-" + size + " cover-" + cover}>{initials}</span>;
}

function MTopnav({ title, onBack, right }) {
  return (
    <div className="mob-topnav">
      <button className="mob-topnav-back" onClick={onBack}>‹</button>
      <span className="mob-topnav-title">{title}</span>
      {right || <span className="mob-topnav-spacer"></span>}
    </div>
  );
}

function MTabbar({ active = "terapia" }) {
  const tabs = [
    { id: "home",    icon: "🏠", lbl: "Inicio" },
    { id: "books",   icon: "📚", lbl: "Libros" },
    { id: "terapia", icon: "🪷", lbl: "Terapia" },
    { id: "plan",    icon: "💎", lbl: "Mi plan" },
    { id: "perfil",  icon: "👤", lbl: "Perfil" },
  ];
  return (
    <nav className="mob-tabbar">
      {tabs.map((t) => (
        <span key={t.id} className={"mob-tab " + (active === t.id ? "is-on" : "")}>
          <span className="mob-tab-icon">{t.icon}</span>
          <span>{t.lbl}</span>
        </span>
      ))}
    </nav>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 1 · HUB · MÓVIL
// ───────────────────────────────────────────────────────────
function MHub({ setTweak }) {
  return (
    <div className="mob">
      <div className="mob-scroll">
        <MTopnav title="Terapia" right={<span className="mob-topnav-spacer">⌕</span>}/>
        <div>
          <span className="mob-eyebrow">✦ Psicología 1:1</span>
          <h1 className="mob-h1">Habla con un psicólogo, a tu ritmo.</h1>
          <p className="mob-sub">
            Sesiones por video con psicólogos titulados. Desde $28 — sin listas
            de espera, sin paquetes obligatorios.
          </p>
          <div className="mob-cta-row" style={{ flexDirection: "column", gap: 6 }}>
            <button className="mob-cta" onClick={() => setTweak("screen", "onboarding")}>
              Empezar terapia →
            </button>
            <button className="mob-cta ghost" onClick={() => setTweak("screen", "match")}>
              ✦ Ayúdame a elegir
            </button>
          </div>
        </div>

        <div>
          <div style={{ font: "700 11px/1 var(--font-sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-warm-500)", marginBottom: 8 }}>
            Cómo funciona
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {HW_M.map((s) => (
              <div key={s.num} className="mob-card" style={{ padding: 14 }}>
                <div style={{ font: "600 10.5px/1 var(--font-mono)", letterSpacing: ".14em", color: "var(--color-lavender-700)" }}>{s.num}</div>
                <div style={{ font: "700 14px/1.3 var(--font-sans)", color: "var(--color-warm-900)", letterSpacing: "-0.008em", marginTop: 8 }}>
                  {s.title}
                </div>
                <div style={{ font: "400 12.5px/1.5 var(--font-sans)", color: "var(--color-warm-600)", marginTop: 5 }}>
                  {s.sub}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ font: "700 11px/1 var(--font-sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-warm-500)" }}>
              Para empezar
            </span>
            <a href="#" onClick={(e) => { e.preventDefault(); setTweak("screen", "dir"); }}
               style={{ font: "600 12px/1 var(--font-sans)", color: "var(--color-lavender-700)", textDecoration: "none" }}>
              Ver todo →
            </a>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {TH_M.slice(0, 2).map((t) => (
              <article key={t.id} className="mob-dir-card" onClick={() => setTweak("screen", "prof")}>
                <MAvatar cover={t.cover} initials={t.initials} size={48}/>
                <div style={{ minWidth: 0 }}>
                  <div className="mob-dir-card-name">{t.name}</div>
                  <div className="mob-dir-card-meta">{t.title} · {t.pais}</div>
                  <div className="mob-dir-card-tags">
                    {t.especialidades.slice(0, 2).map((e) => (
                      <span key={e} className="tw-pill warm" style={{ fontSize: 10 }}>{e}</span>
                    ))}
                  </div>
                </div>
                <div className="mob-dir-card-price">
                  ${t.price}
                  <small>{t.nextSlot}</small>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div>
          <div style={{ font: "700 11px/1 var(--font-sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-warm-500)", marginBottom: 8 }}>
            Lo más preguntado
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {FQ_M.slice(0, 3).map((f, i) => (
              <div key={i} className="mob-card" style={{ padding: 14 }}>
                <div style={{ font: "700 13.5px/1.3 var(--font-sans)", color: "var(--color-warm-900)", letterSpacing: "-0.008em" }}>
                  {f.q}
                </div>
                <div style={{ font: "400 12.5px/1.5 var(--font-sans)", color: "var(--color-warm-600)", marginTop: 6 }}>
                  {f.a}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <MTabbar/>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 2 · DIRECTORIO · MÓVIL
// ───────────────────────────────────────────────────────────
function MDir({ setTweak }) {
  return (
    <div className="mob">
      <div className="mob-scroll">
        <MTopnav title="Terapeutas" onBack={() => setTweak("screen", "hub")} right={<span className="mob-topnav-spacer">⚲</span>}/>
        <div>
          <span className="mob-eyebrow">{TH_M.length} disponibles esta semana</span>
          <h1 className="mob-h1" style={{ fontSize: 22 }}>
            Encuentra a alguien con quien te sientas en confianza.
          </h1>
        </div>

        <div style={{ display: "flex", gap: 6, overflowX: "auto", margin: "0 -16px", padding: "0 16px 4px" }}>
          {["Todos", "Ansiedad", "Pareja", "Duelo", "Identidad", "Trauma"].map((l, i) => (
            <button key={l} className={"dir-filter-pill " + (i === 0 ? "is-on" : "")} style={{ whiteSpace: "nowrap" }}>{l}</button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {TH_M.map((t) => (
            <article key={t.id} className="mob-card" onClick={() => setTweak("screen", "prof")} style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <MAvatar cover={t.cover} initials={t.initials} size={56}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "700 15px/1.2 var(--font-sans)", color: "var(--color-warm-900)", letterSpacing: "-0.008em" }}>
                    {t.name}
                  </div>
                  <div style={{ font: "500 11.5px/1.3 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 3 }}>
                    {t.title} · {t.pais}
                  </div>
                  <div style={{ font: "600 12px/1 var(--font-sans)", color: "var(--color-warm-700)", marginTop: 6, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "var(--color-lavender-600)" }}>★</span> {t.rating}
                    <span style={{ color: "var(--color-warm-300)" }}>·</span>
                    {t.reviews} reseñas
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ font: "700 16px/1 var(--font-sans)", color: "var(--color-warm-900)" }}>${t.price}</div>
                  <div style={{ font: "500 10px/1 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 4 }}>USD/sesión</div>
                </div>
              </div>
              <p style={{ font: "400 12.5px/1.5 var(--font-sans)", color: "var(--color-warm-700)", margin: 0, textWrap: "pretty" }}>
                {t.blurb}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {t.especialidades.slice(0, 3).map((e) => <span key={e} className="tw-pill lavender" style={{ fontSize: 10 }}>{e}</span>)}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--color-warm-200)" }}>
                <span className="dir-card-slot">Próximo · {t.nextSlot}</span>
                <button className="btn-sage" style={{ padding: "10px 14px", fontSize: 12 }}>Ver perfil →</button>
              </div>
            </article>
          ))}
        </div>
      </div>
      <MTabbar/>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 3 · PERFIL · MÓVIL
// ───────────────────────────────────────────────────────────
function MProf({ setTweak }) {
  const t = TH_M[0];
  const [dayIdx, setDayIdx] = React.useState(0);
  const [timeIdx, setTimeIdx] = React.useState(0);
  const day = WK_M[dayIdx] || WK_M[0];

  return (
    <div className="mob">
      <div className="mob-scroll">
        <MTopnav title="Perfil" onBack={() => setTweak("screen", "dir")} right={<span className="mob-topnav-spacer">⋯</span>}/>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
          <MAvatar cover={t.cover} initials={t.initials} size={96}/>
          <div>
            <div style={{ font: "700 21px/1.2 var(--font-sans)", letterSpacing: "-0.018em", color: "var(--color-warm-900)" }}>
              {t.name}
            </div>
            <div style={{ font: "500 12px/1.3 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 4 }}>
              {t.title} · {t.pais}
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, font: "500 12px/1 var(--font-sans)", color: "var(--color-warm-700)" }}>
            <span><strong style={{ color: "var(--color-warm-900)" }}>★ {t.rating}</strong> · {t.reviews}</span>
            <span style={{ color: "var(--color-warm-300)" }}>·</span>
            <span>{t.duration} min</span>
            <span style={{ color: "var(--color-warm-300)" }}>·</span>
            <span>{t.idiomas[0]}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center" }}>
            {t.especialidades.map((e) => <span key={e} className="tw-pill lavender" style={{ fontSize: 10 }}>{e}</span>)}
          </div>
        </div>

        <div className="mob-card">
          <span className="mob-eyebrow warm" style={{ color: "var(--color-warm-500)" }}>Sobre Marina</span>
          <p style={{ font: "400 13.5px/1.6 var(--font-sans)", color: "var(--color-warm-800)", margin: "8px 0 0", textWrap: "pretty" }}>
            {t.longBio}
          </p>
        </div>

        <div className="mob-card">
          <span className="mob-eyebrow warm" style={{ color: "var(--color-warm-500)" }}>Próxima disponibilidad</span>
          <div className="mob-week" style={{ marginTop: 12 }}>
            {WK_M.map((d, i) => (
              <button
                key={i}
                className={"mob-week-day " +
                  (d.slots.length === 0 ? "is-empty " : "") +
                  (i === dayIdx ? "is-on" : "")}
                onClick={() => d.slots.length && setDayIdx(i)}
                type="button"
              >
                <div className="mob-week-day-w">{d.day}</div>
                <div className="mob-week-day-d">{d.date}</div>
              </button>
            ))}
          </div>
          <div className="mob-times-grid" style={{ marginTop: 12 }}>
            {day.slots.map((s, i) => (
              <button
                key={s}
                className={"mob-time " + (i === timeIdx ? "is-on" : "")}
                onClick={() => setTimeIdx(i)}
                type="button"
              >{s}</button>
            ))}
          </div>
        </div>

        <blockquote style={{ margin: 0, padding: "14px 16px", background: "var(--color-lavender-50)", border: "1.5px solid var(--color-lavender-100)", borderRadius: 14, font: "400 14px/1.55 Newsreader, Georgia, serif", color: "var(--color-warm-800)", fontStyle: "italic" }}>
          <span style={{ color: "var(--color-lavender-400)", font: "700 22px/0 var(--font-sans)", marginRight: 6, verticalAlign: "-2px" }}>«</span>
          {t.quote}
        </blockquote>

        <div className="mob-cta-row">
          <button className="mob-cta ghost" style={{ flex: "0 0 auto", padding: "14px 18px" }}>Mensaje</button>
          <button className="mob-cta" onClick={() => setTweak("screen", "book")}>
            Reservar · ${t.price} →
          </button>
        </div>
      </div>
      <MTabbar/>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 4 · RESERVA · MÓVIL (3 pasos)
// ───────────────────────────────────────────────────────────
function MBook({ setTweak }) {
  const [step, setStep] = React.useState(0);
  const [motivo, setMotivo] = React.useState("ansiedad");
  const [dayIdx, setDayIdx] = React.useState(0);
  const [timeIdx, setTimeIdx] = React.useState(0);
  const t = TH_M[0];
  const day = WK_M[dayIdx] || WK_M[0];
  const time = day.slots[timeIdx] || day.slots[0];
  const stepLbls = ["Motivo", "Fecha y hora", "Confirmar"];

  return (
    <div className="mob">
      <div className="mob-scroll">
        <MTopnav
          title={`Reservar · ${step + 1}/3`}
          onBack={() => step === 0 ? setTweak("screen", "prof") : setStep(step - 1)}
        />

        <div style={{ display: "flex", gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 999,
              background: i <= step ? "var(--color-warm-900)" : "var(--color-warm-200)",
            }}/>
          ))}
        </div>

        {step === 0 && (
          <>
            <div>
              <span className="mob-eyebrow">Paso 1 · {stepLbls[0]}</span>
              <h1 className="mob-h1" style={{ fontSize: 22 }}>¿Qué te trae hoy?</h1>
              <p className="mob-sub">No es definitivo. Marina lo lee como punto de partida.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {MO_M.map((m) => (
                <button
                  key={m.id}
                  className={"bk-motivo " + (motivo === m.id ? "is-on" : "")}
                  onClick={() => setMotivo(m.id)}
                  type="button"
                  style={{ width: "100%" }}
                >
                  <span className="bk-motivo-glyph">{m.glyph}</span>
                  <div className="bk-motivo-meta">
                    <div className="bk-motivo-label">{m.label}</div>
                    <div className="bk-motivo-sub">{m.sub}</div>
                  </div>
                </button>
              ))}
            </div>
            <button className="mob-cta" onClick={() => setStep(1)}>Continuar →</button>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <span className="mob-eyebrow">Paso 2 · {stepLbls[1]}</span>
              <h1 className="mob-h1" style={{ fontSize: 22 }}>¿Cuándo te queda bien?</h1>
              <p className="mob-sub">Horarios en hora de Quito (GMT-5).</p>
            </div>
            <div className="mob-week">
              {WK_M.map((d, i) => (
                <button
                  key={i}
                  className={"mob-week-day " +
                    (d.slots.length === 0 ? "is-empty " : "") +
                    (i === dayIdx ? "is-on" : "")}
                  onClick={() => d.slots.length && setDayIdx(i)}
                  type="button"
                >
                  <div className="mob-week-day-w">{d.day}</div>
                  <div className="mob-week-day-d">{d.date}</div>
                </button>
              ))}
            </div>
            <div className="mob-times-grid">
              {day.slots.map((s, i) => (
                <button
                  key={s}
                  className={"mob-time " + (i === timeIdx ? "is-on" : "")}
                  onClick={() => setTimeIdx(i)}
                  type="button"
                >{s}</button>
              ))}
            </div>
            <button className="mob-cta" onClick={() => setStep(2)} disabled={!time}>
              Continuar — revisar →
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <span className="mob-eyebrow">Paso 3 · {stepLbls[2]}</span>
              <h1 className="mob-h1" style={{ fontSize: 22 }}>Revisemos antes de pagar.</h1>
            </div>

            <div className="mob-card" style={{ padding: 16 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", paddingBottom: 12, borderBottom: "1px dashed var(--color-warm-200)" }}>
                <MAvatar cover={t.cover} initials={t.initials} size={48}/>
                <div>
                  <div style={{ font: "700 14px/1.2 var(--font-sans)", color: "var(--color-warm-900)" }}>{t.name}</div>
                  <div style={{ font: "500 11px/1.3 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 3 }}>{t.title}</div>
                </div>
              </div>
              {[
                ["Fecha", `${day.label} · ${day.date} ${day.month}`],
                ["Hora", `${time} · ${t.duration} min`],
                ["Modalidad", "Videollamada"],
                ["Motivo", MO_M.find((m) => m.id === motivo)?.label],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px dashed var(--color-warm-200)", font: "500 13px/1.4 var(--font-sans)" }}>
                  <span style={{ color: "var(--color-warm-500)", textTransform: "uppercase", letterSpacing: ".08em", fontSize: 10, fontWeight: 700, alignSelf: "center" }}>{k}</span>
                  <span style={{ color: "var(--color-warm-900)", fontWeight: 600, textAlign: "right" }}>{v}</span>
                </div>
              ))}
            </div>

            <div className="mob-card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", font: "500 13px/1.4 var(--font-sans)", color: "var(--color-warm-700)" }}>
                <span>Sesión · 50 min</span><strong>${t.price}.00</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", font: "500 12px/1.4 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 6 }}>
                <span>Descuento Pro</span><span>–${(t.price * 0.1).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1.5px solid var(--color-warm-200)", font: "700 16px/1 var(--font-sans)", color: "var(--color-warm-900)" }}>
                <span>Total</span><span>${(t.price * 0.9).toFixed(2)} USD</span>
              </div>
            </div>

            <button className="mob-cta" onClick={() => setTweak("screen", "sessions")}>
              Pagar ${(t.price * 0.9).toFixed(2)} →
            </button>
            <span style={{ font: "500 11px/1.5 var(--font-sans)", color: "var(--color-warm-500)", textAlign: "center", textWrap: "pretty" }}>
              ✓ Pago seguro vía Stripe · cancelas gratis hasta 12 h antes.
            </span>
          </>
        )}
      </div>
      <MTabbar/>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 5 · PRE-SESIÓN · MÓVIL
// ───────────────────────────────────────────────────────────
function MPrep({ setTweak }) {
  const [items, setItems] = React.useState(PR_M);
  const done = items.filter((i) => i.state === "done").length;

  return (
    <div className="mob">
      <div className="mob-scroll">
        <MTopnav title="Antes de tu sesión" onBack={() => setTweak("screen", "sessions")}/>

        <div className="prep-banner" style={{ padding: "16px 18px", gridTemplateColumns: "auto 1fr" }}>
          <MAvatar cover={NS_M.cover} initials={NS_M.therapistInitials} size={56}/>
          <div>
            <div style={{ font: "700 10px/1 var(--font-sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>
              Tu próxima sesión
            </div>
            <div style={{ font: "700 16px/1.2 var(--font-sans)", color: "#fff", marginTop: 6 }}>
              Sesión 5 con {NS_M.therapistName}
            </div>
            <div style={{ font: "500 12px/1.4 var(--font-sans)", color: "rgba(255,255,255,.75)", marginTop: 4 }}>
              {NS_M.dateLabel} · {NS_M.time} · empieza {NS_M.timeUntil}
            </div>
          </div>
        </div>

        <div className="mob-card" style={{ padding: 14, display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "center" }}>
          <div style={{ font: "700 22px/1 var(--font-sans)", color: "var(--color-warm-900)" }}>
            {done}<small style={{ font: "500 13px/1 var(--font-sans)", color: "var(--color-warm-500)" }}>/{items.length}</small>
          </div>
          <div>
            <div style={{ font: "600 12px/1 var(--font-sans)", color: "var(--color-warm-700)", marginBottom: 6 }}>Vas bien</div>
            <div className="prep-progress-bar"><div className="prep-progress-bar-fill" style={{ width: `${(done / items.length) * 100}%` }}/></div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it) => (
            <div key={it.id} className={"mob-prep-item " + (it.state === "done" ? "is-done" : "")}>
              <span className="mob-prep-tick">{it.state === "done" ? "✓" : ""}</span>
              <div>
                <div className="mob-prep-title">{it.title}</div>
                <div className="mob-prep-sub">{it.sub}</div>
                {it.state === "done" && it.answer && (
                  <div style={{ marginTop: 8, padding: "8px 10px", background: "#fff", border: "1px solid var(--color-sage-200)", borderRadius: 8, font: "400 12px/1.5 Newsreader, Georgia, serif", color: "var(--color-warm-800)", fontStyle: "italic" }}>
                    {it.answer}
                  </div>
                )}
              </div>
              <span style={{ font: "600 10.5px/1 var(--font-sans)", padding: "5px 8px", borderRadius: 999, background: it.state === "done" ? "var(--color-sage-200)" : "var(--color-warm-100)", color: it.state === "done" ? "var(--color-sage-700)" : "var(--color-warm-600)", whiteSpace: "nowrap" }}>
                {it.state === "done" ? "Listo" : it.state === "optional" ? "Opcional" : "Pendiente"}
              </span>
            </div>
          ))}
        </div>

        <button className="mob-cta lavender" onClick={() => setTweak("screen", "room")}>Entrar a la sala →</button>
        <span style={{ font: "500 11px/1.5 var(--font-sans)", color: "var(--color-warm-500)", textAlign: "center" }}>
          La sala se abre 5 min antes.
        </span>
      </div>
      <MTabbar/>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 6 · MIS SESIONES · MÓVIL
// ───────────────────────────────────────────────────────────
function MSessions({ setTweak }) {
  const [tab, setTab] = React.useState("prox");

  return (
    <div className="mob">
      <div className="mob-scroll">
        <MTopnav title="Mis sesiones" right={<span className="mob-topnav-spacer">⌕</span>}/>

        <div className="ses-next" style={{ padding: "18px 20px", gridTemplateColumns: "auto 1fr", gap: 14 }}>
          <MAvatar cover={NS_M.cover} initials={NS_M.therapistInitials} size={56}/>
          <div>
            <div style={{ font: "700 10px/1 var(--font-sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>
              Próxima · {NS_M.dateLabel}
            </div>
            <div style={{ font: "700 17px/1.2 var(--font-sans)", letterSpacing: "-0.012em", color: "#fff", marginTop: 6 }}>
              Sesión 5 con {NS_M.therapistName}
            </div>
            <div style={{ font: "500 12px/1.4 var(--font-sans)", color: "rgba(255,255,255,.78)", marginTop: 4 }}>
              {NS_M.time} · empieza {NS_M.timeUntil}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              <button onClick={() => setTweak("screen", "prep")} style={{ background: "rgba(255,255,255,.15)", color: "#fff", border: 0, borderRadius: 8, padding: "8px 12px", font: "600 11px/1 var(--font-sans)" }}>
                Preparar
              </button>
              <button onClick={() => setTweak("screen", "room")} style={{ background: "#fff", color: "var(--color-lavender-700)", border: 0, borderRadius: 8, padding: "8px 12px", font: "600 11px/1 var(--font-sans)" }}>
                Entrar a sala →
              </button>
            </div>
          </div>
        </div>

        <div className="ses-tabs">
          <button className={"ses-tab " + (tab === "prox" ? "is-on" : "")} onClick={() => setTab("prox")}>Próximas</button>
          <button className={"ses-tab " + (tab === "hist" ? "is-on" : "")} onClick={() => setTab("hist")}>Historial</button>
          <button className={"ses-tab " + (tab === "notas" ? "is-on" : "")} onClick={() => setTab("notas")}>Mis notas</button>
        </div>

        {tab === "hist" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SP_M.map((p) => (
              <div key={p.id} className="mob-ses-row">
                <div className="mob-ses-row-date">
                  <div className="mob-ses-row-d">{p.date.split(" ")[0]}</div>
                  <div className="mob-ses-row-m">may</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="mob-ses-row-title">{p.title}</div>
                  <div className="mob-ses-row-snip">{p.snippet}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, font: "500 11px/1 var(--font-sans)", color: "var(--color-warm-500)" }}>
                    <span>{p.time}</span><span>·</span><span>{p.duration} min</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "prox" && (
          <div className="mob-ses-row">
            <div className="mob-ses-row-date">
              <div className="mob-ses-row-d">20</div>
              <div className="mob-ses-row-m">may</div>
            </div>
            <div>
              <div className="mob-ses-row-title">Sesión 5 con Marina Salazar</div>
              <div className="mob-ses-row-snip">
                Continuamos con el patrón del "tengo que" — Marina sugiere abrir con la práctica de la semana.
              </div>
            </div>
          </div>
        )}

        {tab === "notas" && (
          <div className="mob-card" style={{ textAlign: "center", padding: "28px 20px" }}>
            <div style={{ font: "700 14px/1.2 var(--font-sans)", color: "var(--color-warm-900)", marginBottom: 6 }}>
              Aquí guardas tus reflexiones.
            </div>
            <div style={{ font: "400 12px/1.55 var(--font-sans)", color: "var(--color-warm-500)" }}>
              Marina nunca lee tus notas. Son tuyas.
            </div>
          </div>
        )}

        <button className="mob-cta ghost" onClick={() => setTweak("screen", "dir")}>
          Reservar otra sesión →
        </button>
      </div>
      <MTabbar/>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 7 · POST-SESIÓN · MÓVIL
// ───────────────────────────────────────────────────────────
function MPost({ setTweak }) {
  const [picked, setPicked] = React.useState(new Set(["pensativa", "esperanza"]));
  const [shareDiary, setShareDiary] = React.useState(true);
  const [shareEmotions, setShareEmotions] = React.useState(true);
  const [shareReading, setShareReading] = React.useState(false);

  const toggle = (id) => {
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  return (
    <div className="mob">
      <div className="mob-scroll">
        <MTopnav title="Después de la sesión" onBack={() => setTweak("screen", "sessions")}/>

        <div className="post-hero" style={{ padding: "24px 22px" }}>
          <span className="post-hero-eyebrow">Acabas de terminar · sesión 5</span>
          <h1 style={{ position: "relative", font: "700 22px/1.2 var(--font-sans)", letterSpacing: "-0.018em", color: "var(--color-warm-900)", margin: "10px 0 6px" }}>
            ¿Cómo te sientes ahora?
          </h1>
          <p style={{ position: "relative", font: "400 13.5px/1.55 var(--font-sans)", color: "var(--color-warm-600)", margin: 0 }}>
            Tómate 30 segundos antes de seguir con el día.
          </p>
          <div className="post-feel">
            {PT_M.map((t) => (
              <button
                key={t.id}
                className={"post-feel-chip " + (picked.has(t.id) ? "is-on" : "")}
                onClick={() => toggle(t.id)}
                type="button"
                style={{ padding: "8px 12px", fontSize: 12 }}
              >{t.label}</button>
            ))}
          </div>
        </div>

        <div className="post-homework" style={{ padding: "18px 20px" }}>
          <span className="post-homework-eyebrow">Práctica de la semana</span>
          <p style={{ font: "400 14.5px/1.55 Newsreader, Georgia, serif", color: "var(--color-warm-900)", margin: "10px 0 0", textWrap: "pretty" }}>
            {PH_M.body}
          </p>
          <span className="post-homework-from">✦ {PH_M.fromTherapist}</span>
        </div>

        <div>
          <div style={{ font: "700 11px/1 var(--font-sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-warm-500)", marginBottom: 8 }}>
            Sigue creciendo esta semana
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {RC_M.map((r, i) => (
              <article key={i} className="mob-card" style={{ padding: 12, display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, position: "relative" }}>
                {r.fromTherapist && (
                  <span style={{ position: "absolute", top: -7, left: 14, padding: "3px 7px", background: "var(--color-lavender-700)", color: "#fff", borderRadius: 6, font: "700 9px/1 var(--font-sans)", letterSpacing: ".1em", textTransform: "uppercase" }}>
                    ✦ De Marina
                  </span>
                )}
                <span className={"cover-" + r.cover} style={{ width: 44, height: 60, borderRadius: 6, boxShadow: "var(--shadow-cover)" }}></span>
                <div style={{ minWidth: 0 }}>
                  <span style={{ font: "700 9.5px/1 var(--font-sans)", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-lavender-700)" }}>
                    {r.type === "chapter" ? "Capítulo" : r.type === "exercise" ? "Ejercicio · 12 min" : "Audio · 4 min"}
                  </span>
                  <div style={{ font: "700 13px/1.25 var(--font-sans)", color: "var(--color-warm-900)", margin: "4px 0 2px" }}>{r.title}</div>
                  <div style={{ font: "500 11px/1.3 var(--font-sans)", color: "var(--color-warm-500)" }}>{r.author}</div>
                  <div style={{ font: "400 11px/1.45 var(--font-sans)", color: "var(--color-warm-700)", background: "var(--color-warm-100)", padding: "6px 8px", borderRadius: 7, marginTop: 7 }}>
                    {r.reason}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="mob-card" style={{ padding: 16 }}>
          <div style={{ font: "700 14px/1.2 var(--font-sans)", color: "var(--color-warm-900)" }}>
            Comparte con Marina
          </div>
          <p style={{ font: "400 12px/1.5 var(--font-sans)", color: "var(--color-warm-600)", margin: "6px 0 14px" }}>
            Solo lo que tú actives. Marina ve un resumen, no el detalle.
          </p>
          {[
            { lbl: "Diario · esta semana", sub: "3 entradas", v: shareDiary, set: setShareDiary, g: "✍︎" },
            { lbl: "Mood diario", sub: "Últimos 7 días", v: shareEmotions, set: setShareEmotions, g: "◐" },
            { lbl: "Lecturas en curso", sub: "Cap. 5 · 34 %", v: shareReading, set: setShareReading, g: "📖" },
          ].map((r) => (
            <div key={r.lbl} className="post-share-row" style={{ padding: "10px 12px", marginBottom: 6 }}>
              <span className="post-share-row-glyph" style={{ width: 30, height: 30, fontSize: 13 }}>{r.g}</span>
              <div>
                <div style={{ font: "600 12.5px/1.3 var(--font-sans)", color: "var(--color-warm-900)" }}>{r.lbl}</div>
                <div style={{ font: "400 11px/1.3 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 2 }}>{r.sub}</div>
              </div>
              <span
                className={"post-share-toggle " + (r.v ? "is-on" : "")}
                onClick={() => r.set(!r.v)}
              ></span>
            </div>
          ))}
        </div>

        <button className="mob-cta lavender" onClick={() => setTweak("screen", "sessions")}>
          Listo — ir a mis sesiones →
        </button>
      </div>
      <MTabbar/>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 8 · SALA · MÓVIL
// ───────────────────────────────────────────────────────────
function MRoom({ setTweak }) {
  const r = window.T_ROOM;
  const [mic, setMic] = React.useState(true);
  const [cam, setCam] = React.useState(true);

  return (
    <div className="mob-room">
      <div className="mob-room-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MAvatar cover={r.cover} initials={r.therapistInitials} size={48}/>
          <div>
            <div style={{ font: "700 13px/1.2 var(--font-sans)", color: "#fff" }}>{r.therapistName}</div>
            <div style={{ font: "500 10.5px/1.3 var(--font-sans)", color: "rgba(255,255,255,0.55)", marginTop: 3 }}>
              Sesión {r.sessionNum}
            </div>
          </div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "rgba(255,255,255,0.08)", borderRadius: 9999, font: "600 10.5px/1 var(--font-mono)", color: "rgba(255,255,255,0.85)" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-sage-300)" }}/>
          {String(r.elapsed).padStart(2,"0")}:14
        </div>
      </div>

      <div className="mob-room-tile">
        <div className="mob-room-tile-initials">{r.therapistInitials}</div>
        <div className="mob-room-self">A</div>
        <div style={{ position: "absolute", bottom: 14, left: 14, padding: "5px 10px", background: "rgba(0,0,0,0.35)", color: "#fff", borderRadius: 9999, font: "600 11px/1 var(--font-sans)" }}>
          {r.therapistName}
        </div>
      </div>

      <div className="mob-card" style={{ margin: "0 16px", padding: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ font: "700 9.5px/1 var(--font-sans)", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(195,186,255,0.85)" }}>
          Tu intención de hoy
        </div>
        <div style={{ font: "400 13px/1.55 Newsreader, Georgia, serif", color: "rgba(255,255,255,0.85)", marginTop: 8, fontStyle: "italic" }}>
          {r.intention}
        </div>
      </div>

      <div className="mob-room-controls">
        <button className={"mob-room-ctrl " + (mic ? "" : "is-off")} onClick={() => setMic(!mic)}>
          {mic ? "🎙" : "🚫"}
        </button>
        <button className={"mob-room-ctrl " + (cam ? "" : "is-off")} onClick={() => setCam(!cam)}>
          {cam ? "📹" : "🚫"}
        </button>
        <button className="mob-room-ctrl">💬</button>
        <button className="mob-room-ctrl">✎</button>
        <button className="mob-room-ctrl end" onClick={() => setTweak("screen", "post")}>
          ⏻ Terminar
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 9 · ONBOARDING · MÓVIL
// ───────────────────────────────────────────────────────────
function MOnboarding({ setTweak }) {
  const steps = window.T_ONBOARD_STEPS;
  const [stepIdx, setStepIdx] = React.useState(0);
  const [answers, setAnswers] = React.useState({
    etapa: "first", salud: "no", urgencia: new Set(["nada"]),
    preferencias: { genero: "Cualquiera", edad: "20s–30s", enfoque: "No estoy segura", horario: "Tarde / noche" },
  });
  const s = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;
  const setSingle = (id) => setAnswers((a) => ({ ...a, [s.id]: id }));
  const toggleMulti = (id) => setAnswers((a) => {
    const set = new Set(a[s.id]);
    if (id === "nada") return { ...a, [s.id]: new Set(["nada"]) };
    set.delete("nada");
    set.has(id) ? set.delete(id) : set.add(id);
    if (set.size === 0) set.add("nada");
    return { ...a, [s.id]: set };
  });
  const setPref = (id, value) => setAnswers((a) => ({ ...a, preferencias: { ...a.preferencias, [id]: value } }));

  return (
    <div className="mob">
      <div className="mob-scroll">
        <MTopnav
          title={`Empezar · ${stepIdx + 1}/4`}
          onBack={() => stepIdx === 0 ? setTweak("screen", "hub") : setStepIdx(stepIdx - 1)}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {steps.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: i < stepIdx ? "var(--color-sage-400)" : i === stepIdx ? "var(--color-warm-900)" : "var(--color-warm-200)" }}/>
          ))}
        </div>

        <div>
          <span className={"mob-eyebrow " + (s.id === "urgencia" ? "warn" : "")} style={{ color: s.id === "urgencia" ? "var(--color-warn-text)" : "var(--color-lavender-700)" }}>
            {s.eyebrow}
          </span>
          <h1 className="mob-h1" style={{ fontSize: 22 }}>{s.title}</h1>
          <p className="mob-sub">{s.sub}</p>
        </div>

        {s.kind === "choice" && s.options.map((o) => (
          <button key={o.id} className={"onb-choice " + (answers[s.id] === o.id ? "is-on" : "")}
            onClick={() => setSingle(o.id)} type="button" style={{ padding: "14px 16px" }}>
            <span className="onb-radio"></span>
            <div className="onb-choice-meta">
              <div className="onb-choice-label" style={{ fontSize: 13.5 }}>{o.label}</div>
              {o.sub && <div className="onb-choice-sub" style={{ fontSize: 11.5 }}>{o.sub}</div>}
            </div>
          </button>
        ))}

        {s.kind === "multi" && s.options.map((o) => {
          const on = (answers[s.id] || new Set()).has(o.id);
          return (
            <button key={o.id} className={"onb-choice urgent " + (on ? "is-on" : "")}
              onClick={() => toggleMulti(o.id)} type="button" style={{ padding: "14px 16px" }}>
              <span className="onb-radio onb-checkbox"></span>
              <div className="onb-choice-meta">
                <div className="onb-choice-label" style={{ fontSize: 13.5 }}>{o.label}</div>
              </div>
            </button>
          );
        })}

        {s.kind === "preferences" && s.options.map((o) => (
          <div key={o.id} className="onb-pref" style={{ padding: "12px 14px" }}>
            <div className="onb-pref-label" style={{ fontSize: 12.5 }}>{o.label}</div>
            <select value={answers.preferencias[o.id]} onChange={(e) => setPref(o.id, e.target.value)}>
              {o.options.map((opt) => <option key={opt}>{opt}</option>)}
            </select>
          </div>
        ))}

        <button className="mob-cta" onClick={() => isLast ? setTweak("screen", "match") : setStepIdx(stepIdx + 1)}>
          {isLast ? "Ver terapeutas sugeridos →" : "Continuar →"}
        </button>
      </div>
      <MTabbar/>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 10 · CRISIS · MÓVIL
// ───────────────────────────────────────────────────────────
function MCrisis({ setTweak }) {
  const lines = window.T_CRISIS_LINES;
  const [country, setCountry] = React.useState(lines.find((l) => l.isUser).country);
  const active = lines.find((l) => l.country === country);

  return (
    <div className="mob">
      <div className="mob-scroll">
        <MTopnav title="Apoyo inmediato" onBack={() => setTweak("screen", "hub")}/>

        <section className="crisis-hero" style={{ padding: "22px 20px" }}>
          <span className="crisis-hero-eyebrow">▲ Apoyo inmediato</span>
          <h1 style={{ position: "relative", font: "700 22px/1.18 var(--font-sans)", letterSpacing: "-0.02em", color: "var(--color-warm-900)", margin: "10px 0 8px" }}>
            Estás aquí. Eso ya es algo.
          </h1>
          <p style={{ position: "relative", font: "400 13.5px/1.55 var(--font-sans)", color: "var(--color-warm-700)", margin: 0 }}>
            Estos canales atienden gratis y en español. No tienes que estar en crisis para llamar.
          </p>
        </section>

        <div style={{ display: "flex", gap: 6, overflowX: "auto", margin: "0 -16px", padding: "0 16px 4px" }}>
          {lines.map((l) => (
            <button key={l.country}
              className={"crisis-country-tab " + (country === l.country ? "is-on" : "")}
              onClick={() => setCountry(l.country)}
              style={{ whiteSpace: "nowrap" }}>
              <span>{l.flag}</span> {l.country}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {active.lines.map((line) => (
            <div key={line.phone} className="mob-card" style={{
              padding: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center",
              borderColor: line.kind === "emergency" ? "var(--color-error-border)" : "var(--color-warm-200)",
              background: line.kind === "emergency" ? "var(--color-error-bg)" : "#fff",
            }}>
              <div>
                <div style={{ font: "700 13px/1.3 var(--font-sans)", color: "var(--color-warm-900)" }}>{line.name}</div>
                <div style={{ font: "500 11px/1 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 4 }}>{line.hours}</div>
                <div style={{ font: "700 15px/1 var(--font-mono)", color: "var(--color-warm-900)", marginTop: 8, letterSpacing: ".02em" }}>{line.phone}</div>
              </div>
              <button style={{
                background: line.kind === "emergency" ? "var(--color-error-text)" : "var(--color-warm-900)",
                color: "#fff", border: 0, borderRadius: 10, padding: "10px 14px",
                font: "600 12px/1 var(--font-sans)", whiteSpace: "nowrap",
              }}>Llamar →</button>
            </div>
          ))}
        </div>

        <div>
          <div style={{ font: "700 11px/1 var(--font-sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-warm-500)", marginBottom: 8 }}>
            Mientras llamas
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {window.T_CRISIS_GROUNDING.map((g, i) => (
              <button key={i} className="crisis-ground-card" type="button" style={{ padding: 14, textAlign: "left" }}>
                <div className="crisis-ground-card-glyph" style={{ fontSize: 20 }}>{g.glyph}</div>
                <div className="crisis-ground-card-title">{g.title}</div>
                <div className="crisis-ground-card-sub">{g.sub}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mob-card" style={{ background: "var(--color-warm-100)", border: "none", padding: 14, font: "400 11.5px/1.5 var(--font-sans)", color: "var(--color-warm-700)" }}>
          <strong style={{ color: "var(--color-warm-900)" }}>Confidencialidad:</strong> tu uso de esta página no se comparte con nadie, ni con tu terapeuta.
        </div>
      </div>
      <MTabbar/>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 11 · MATCHING · MÓVIL
// ───────────────────────────────────────────────────────────
function MMatch({ setTweak }) {
  const questions = window.T_MATCH_QUESTIONS;
  const [stepIdx, setStepIdx] = React.useState(0);
  const [answers, setAnswers] = React.useState({
    tema: "ansiedad", estilo: "mixto", frecuencia: "semanal", preferencia: "ninguna", horario: "noche",
  });
  const [showResults, setShowResults] = React.useState(false);
  const q = questions[stepIdx];
  const isLast = stepIdx === questions.length - 1;
  const pct = ((stepIdx + 1) / questions.length) * 100;

  if (showResults) {
    return (
      <div className="mob">
        <div className="mob-scroll">
          <MTopnav title="Tus coincidencias" onBack={() => setShowResults(false)}/>
          <div>
            <span className="mob-eyebrow">✦ Tu coincidencia</span>
            <h1 className="mob-h1" style={{ fontSize: 22 }}>Estos tres encajan.</h1>
            <p className="mob-sub">Ranking por especialidad, estilo, disponibilidad y precio.</p>
          </div>
          {window.T_MATCH_RESULTS.map((r, i) => {
            const t = window.T_THERAPISTS.find((x) => x.id === r.therapistId);
            return (
              <article key={r.therapistId} className="mob-card" style={{
                padding: 16, position: "relative",
                borderColor: i === 0 ? "var(--color-sage-400)" : "var(--color-warm-200)",
                background: i === 0 ? "linear-gradient(135deg, var(--color-sage-50), #fff)" : "#fff",
              }}>
                {i === 0 && (
                  <span style={{ position: "absolute", top: -8, left: 16, padding: "3px 8px", background: "var(--color-sage-400)", color: "#fff", borderRadius: 6, font: "700 9px/1 var(--font-sans)", letterSpacing: ".12em", textTransform: "uppercase" }}>
                    ★ Mejor coincidencia
                  </span>
                )}
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <MAvatar cover={t.cover} initials={t.initials} size={56}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "700 14.5px/1.2 var(--font-sans)", color: "var(--color-warm-900)" }}>{t.name}</div>
                    <div style={{ font: "500 11px/1.3 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 3 }}>
                      {t.title} · ${t.price}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ font: "700 22px/1 var(--font-sans)", color: "var(--color-sage-700)" }}>{r.score}</div>
                    <div style={{ font: "500 9.5px/1 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 3 }}>match</div>
                  </div>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
                  {r.matchReasons.map((reason, j) => (
                    <li key={j} style={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: 8, font: "500 12px/1.45 var(--font-sans)", color: "var(--color-warm-700)" }}>
                      <span style={{ color: "var(--color-sage-500)", fontWeight: 700 }}>✓</span>
                      {reason}
                    </li>
                  ))}
                </ul>
                <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                  <button className="btn-soft" style={{ flex: 1 }}>Ver perfil</button>
                  <button className="btn-sage" style={{ flex: 1 }} onClick={() => setTweak("screen", "book")}>Reservar</button>
                </div>
              </article>
            );
          })}
          <button className="btn-outline" onClick={() => setTweak("screen", "dir")}>Ver todo el directorio →</button>
        </div>
        <MTabbar/>
      </div>
    );
  }

  return (
    <div className="mob">
      <div className="mob-scroll">
        <MTopnav
          title={`Pregunta ${stepIdx + 1}/${questions.length}`}
          onBack={() => stepIdx === 0 ? setTweak("screen", "hub") : setStepIdx(stepIdx - 1)}
        />
        <div className="mat-progress-bar"><div className="mat-progress-bar-fill" style={{ width: pct + "%" }}/></div>

        <div>
          <h1 className="mob-h1" style={{ fontSize: 22 }}>{q.title}</h1>
          <p className="mob-sub">{q.sub}</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {q.options.map((o) => (
            <button key={o.id} className={"mat-option " + (answers[q.id] === o.id ? "is-on" : "")}
              onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))} type="button"
              style={{ padding: "14px 16px" }}>
              {o.glyph && <span className="mat-option-glyph" style={{ width: 34, height: 34, fontSize: 15 }}>{o.glyph}</span>}
              <div style={{ minWidth: 0 }}>
                <div className="mat-option-label" style={{ fontSize: 13.5 }}>{o.label}</div>
                {o.sub && <div className="mat-option-sub" style={{ fontSize: 11.5 }}>{o.sub}</div>}
              </div>
            </button>
          ))}
        </div>

        <button className="mob-cta" onClick={() => isLast ? setShowResults(true) : setStepIdx(stepIdx + 1)}>
          {isLast ? "Ver mis 3 coincidencias →" : "Continuar →"}
        </button>
      </div>
      <MTabbar/>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 12 · PROGRESO · MÓVIL
// ───────────────────────────────────────────────────────────
function MProgress({ setTweak }) {
  const p = window.T_PROGRESS;
  const max = Math.max(...p.moodWeeks.map((w) => w.mood));

  return (
    <div className="mob">
      <div className="mob-scroll">
        <MTopnav title="Tu camino" onBack={() => setTweak("screen", "hub")}/>

        <section className="pg-hero" style={{ padding: "20px 20px" }}>
          <span className="pg-hero-eyebrow">{p.monthsActive} meses · {p.totalSessions} sesiones</span>
          <h1 style={{ position: "relative", font: "700 22px/1.18 var(--font-sans)", letterSpacing: "-0.02em", color: "var(--color-warm-900)", margin: "10px 0 6px" }}>
            Has venido sosteniendo el espacio.
          </h1>
          <p style={{ position: "relative", font: "400 13.5px/1.55 var(--font-sans)", color: "var(--color-warm-600)", margin: 0 }}>
            Lo que sigue es una foto de tu propio compromiso.
          </p>
          <div className="pg-stats" style={{ marginTop: 14, gridTemplateColumns: "1fr 1fr" }}>
            <div className="pg-stat"><div className="pg-stat-val">{p.totalSessions}<small>ses.</small></div><div className="pg-stat-lbl">Sesiones</div></div>
            <div className="pg-stat"><div className="pg-stat-val">{p.diaryDays}<small>días</small></div><div className="pg-stat-lbl">Diario</div></div>
            <div className="pg-stat"><div className="pg-stat-val">{p.chaptersDone}<small>libros</small></div><div className="pg-stat-lbl">Terminados</div></div>
            <div className="pg-stat"><div className="pg-stat-val">{p.exercisesDone}<small>x</small></div><div className="pg-stat-lbl">Ejercicios</div></div>
          </div>
        </section>

        <div className="mob-card">
          <div style={{ font: "700 14px/1.2 var(--font-sans)", color: "var(--color-warm-900)" }}>
            Cómo te has sentido · 17 semanas
          </div>
          <div className="pg-chart-canvas" style={{ height: 130, marginTop: 14 }}>
            <div className="pg-chart-bars">
              {p.moodWeeks.map((w, i) => (
                <div key={i}
                  className={"pg-chart-bar " + (w.sessions > 0 ? "has-session " : "") + (w.isNow ? "is-now" : "")}
                  style={{ height: `${(w.mood / max) * 100}%` }}/>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 18, font: "500 11px/1 var(--font-sans)", color: "var(--color-warm-600)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span className="pg-chart-legend-mood"></span>Estado semanal
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span className="pg-chart-legend-session"></span>Sesión
            </span>
          </div>
        </div>

        <div>
          <div style={{ font: "700 11px/1 var(--font-sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-warm-500)", marginBottom: 8 }}>
            Antes vs. ahora
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {p.comparisons.map((c) => (
              <div key={c.metric} className="pg-comp-card" style={{ padding: "12px 14px" }}>
                <div className="pg-comp-lbl">{c.metric}</div>
                <div className="pg-comp-row">
                  <div className="pg-comp-cell">
                    <div className="pg-comp-cell-when">Antes</div>
                    <div className="pg-comp-cell-val" style={{ fontSize: 15 }}>{c.before}</div>
                  </div>
                  <div className={"pg-comp-arrow " + c.direction}>→</div>
                  <div className="pg-comp-cell">
                    <div className="pg-comp-cell-when">Ahora</div>
                    <div className="pg-comp-cell-val after" style={{ fontSize: 15 }}>{c.after}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ font: "700 11px/1 var(--font-sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-warm-500)", marginBottom: 8 }}>
            Temas recurrentes
          </div>
          <div className="pg-themes">
            {p.themes.map((t) => (
              <span key={t.label} className="pg-theme" style={{ padding: "8px 12px", fontSize: 11.5 }}>
                {t.label}
                <span className="pg-theme-count">×{t.count}</span>
              </span>
            ))}
          </div>
        </div>

        <div>
          <div style={{ font: "700 11px/1 var(--font-sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-warm-500)", marginBottom: 8 }}>
            Hitos
          </div>
          <div className="pg-milestones" style={{ padding: 4 }}>
            {p.milestones.map((m, i) => (
              <div key={i} className="pg-milestone" style={{ gridTemplateColumns: "70px 30px 1fr", gap: 10 }}>
                <div className="pg-milestone-date" style={{ fontSize: 10.5 }}>{m.date}</div>
                <div className="pg-milestone-dot" style={{ width: 26, height: 26, fontSize: 11 }}>{m.glyph}</div>
                <div>
                  <div className="pg-milestone-title" style={{ fontSize: 13 }}>{m.title}</div>
                  <div className="pg-milestone-sub" style={{ fontSize: 11.5 }}>{m.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <MTabbar/>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 13 · NOTIFICACIONES · MÓVIL
// ───────────────────────────────────────────────────────────
function MNotifs({ setTweak }) {
  const all = window.T_NOTIFS;
  const kinds = window.T_NOTIF_KINDS;
  const unread = all.filter((n) => n.unread).length;

  return (
    <div className="mob">
      <div className="mob-scroll">
        <MTopnav title="Notificaciones" onBack={() => setTweak("screen", "hub")}/>

        <div>
          <span className="mob-eyebrow">{unread} sin leer</span>
          <h1 className="mob-h1" style={{ fontSize: 22 }}>Tu actividad</h1>
        </div>

        <div className="notif-list" style={{ gap: 6 }}>
          {all.map((n) => {
            const meta = kinds[n.kind] || {};
            return (
              <article key={n.id}
                className={"notif-row " + (n.unread ? "is-unread" : "")}
                onClick={() => n.actionScreen && setTweak("screen", n.actionScreen)}
                style={{ padding: "14px 14px 14px 18px", gridTemplateColumns: "auto 1fr", gap: 12 }}>
                <span className={"notif-icon " + (meta.color || "warm")} style={{ width: 32, height: 32, fontSize: 14 }}>{n.icon}</span>
                <div className="notif-meta">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div className="notif-title" style={{ fontSize: 13 }}>{n.title}</div>
                    <div className="notif-when" style={{ padding: 0, fontSize: 10 }}>{n.when}</div>
                  </div>
                  <div className="notif-body" style={{ fontSize: 11.5, marginTop: 5 }}>{n.body}</div>
                  {n.actionLabel && (
                    <button className="notif-action" style={{ marginTop: 10, fontSize: 11 }}
                      onClick={(e) => { e.stopPropagation(); n.actionScreen && setTweak("screen", n.actionScreen); }}>
                      {n.actionLabel} →
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <MTabbar/>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 14 · RECETAS · MÓVIL
// ───────────────────────────────────────────────────────────
function MPrescriptions({ setTweak }) {
  const all = window.T_PRESCRIPTIONS;
  const allItems = all.flatMap((s) => s.items);
  const t = window.T_THERAPISTS[0];

  return (
    <div className="mob">
      <div className="mob-scroll">
        <MTopnav title="Mi camino con Marina" onBack={() => setTweak("screen", "sessions")}/>

        <section className="rx-hero" style={{ padding: "16px 18px" }}>
          <MAvatar cover={t.cover} initials={t.initials} size={48}/>
          <div>
            <h1 style={{ fontSize: 18 }}>Lo que Marina sugirió</h1>
            <p className="rx-hero-sub" style={{ fontSize: 12 }}>
              Lecturas y prácticas que salieron de tus sesiones.
            </p>
          </div>
        </section>

        <div className="rx-summary">
          <div className="rx-summary-cell" style={{ padding: 10 }}>
            <div className="rx-summary-val" style={{ fontSize: 18 }}>{allItems.length}</div>
            <div className="rx-summary-lbl">Sugerencias</div>
          </div>
          <div className="rx-summary-cell" style={{ padding: 10 }}>
            <div className="rx-summary-val" style={{ fontSize: 18, color: "var(--color-lavender-700)" }}>
              {allItems.filter((i) => i.state === "active" || i.state === "in-progress").length}
            </div>
            <div className="rx-summary-lbl">En curso</div>
          </div>
          <div className="rx-summary-cell" style={{ padding: 10 }}>
            <div className="rx-summary-val" style={{ fontSize: 18, color: "var(--color-sage-700)" }}>
              {allItems.filter((i) => i.state === "done").length}
            </div>
            <div className="rx-summary-lbl">Hechas</div>
          </div>
          <div className="rx-summary-cell" style={{ padding: 10 }}>
            <div className="rx-summary-val" style={{ fontSize: 18 }}>{all.length}</div>
            <div className="rx-summary-lbl">Sesiones</div>
          </div>
        </div>

        {all.map((s) => (
          <div key={s.sessionNum}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "6px 0" }}>
              <span style={{ padding: "5px 8px", background: "var(--color-warm-100)", borderRadius: 6, font: "700 11px/1 var(--font-sans)", color: "var(--color-warm-900)" }}>
                Sesión {s.sessionNum}
              </span>
              <span style={{ font: "500 11px/1 var(--font-mono)", color: "var(--color-warm-500)" }}>{s.sessionDate}</span>
            </div>
            {s.items.map((it, ii) => (
              <article key={ii} className={"rx-item " + (it.state === "done" ? "is-done" : "")}
                style={{ padding: 14, marginTop: 6, gridTemplateColumns: "40px 1fr", gap: 12 }}>
                {it.cover
                  ? <span className={"rx-item-cover cover-" + it.cover} style={{ width: 40, height: 54 }}></span>
                  : <span className="rx-item-cover placeholder" style={{ width: 40, height: 54, fontSize: 16 }}>
                      {it.type === "practice" ? "◐" : it.type === "ritual" ? "✓" : "◌"}
                    </span>
                }
                <div className="rx-item-meta">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span className="rx-item-kind">
                      {it.type === "chapter" ? "Capítulo" : it.type === "book" ? "Libro" : it.type === "exercise" ? "Ejercicio" : it.type === "practice" ? "Práctica" : "Ritual"}
                    </span>
                    <span className={"rx-item-state " + it.state} style={{ fontSize: 9 }}>
                      {it.state === "active" ? "Activo" : it.state === "in-progress" ? "En curso" : "Hecho"}
                    </span>
                  </div>
                  <div className="rx-item-title" style={{ fontSize: 13 }}>{it.title}</div>
                  <div className="rx-item-author" style={{ fontSize: 11 }}>{it.author}</div>
                  {it.marinaNote && (
                    <div className="rx-item-marina" style={{ fontSize: 11.5, padding: "8px 10px" }}>
                      {it.marinaNote}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        ))}
      </div>
      <MTabbar/>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 15 · CANCELAR · MÓVIL
// ───────────────────────────────────────────────────────────
function MCancel({ setTweak }) {
  const s = window.T_NEXT_SESSION;
  const pol = window.T_CANCEL_POLICY;
  const [action, setAction] = React.useState(null);
  const [reason, setReason] = React.useState(null);
  const [altDay, setAltDay] = React.useState(0);
  const [altTime, setAltTime] = React.useState(0);
  const day = window.T_WEEK[altDay] || window.T_WEEK[0];

  return (
    <div className="mob">
      <div className="mob-scroll">
        <MTopnav title="Mover o cancelar" onBack={() => action ? setAction(null) : setTweak("screen", "sessions")}/>

        <div className="cn-session-card" style={{ padding: "14px 16px", background: "var(--color-warm-100)" }}>
          <MAvatar cover={s.cover} initials={s.therapistInitials} size={40}/>
          <div>
            <div className="cn-session-meta-h" style={{ fontSize: 13 }}>Sesión 5 con {s.therapistName}</div>
            <div className="cn-session-meta-sub" style={{ fontSize: 11.5 }}>{s.dateLabel} · {s.time}</div>
          </div>
          <div className="cn-session-when" style={{ fontSize: 10 }}>
            <strong style={{ fontSize: 14 }}>{s.time}</strong>
            en {s.timeUntil}
          </div>
        </div>

        {!action && (
          <>
            <div>
              <h1 className="mob-h1" style={{ fontSize: 20 }}>¿Qué necesitas hacer?</h1>
              <p className="mob-sub">Cancelar no es un fracaso. Pausar a veces es lo que sigue.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="cn-action" onClick={() => setAction("reschedule")} type="button">
                <div className="cn-action-glyph">↻</div>
                <div className="cn-action-title">Mover de horario</div>
                <div className="cn-action-sub">Sigue la sesión, otra hora o día.</div>
              </button>
              <button className="cn-action" onClick={() => setAction("cancel")} type="button">
                <div className="cn-action-glyph">×</div>
                <div className="cn-action-title">Cancelar esta sesión</div>
                <div className="cn-action-sub">No esta semana. Vuelves cuando quieras.</div>
              </button>
              <button className="cn-action" onClick={() => setAction("pause")} type="button">
                <div className="cn-action-glyph">‖</div>
                <div className="cn-action-title">Pausa más larga</div>
                <div className="cn-action-sub">Hablamos con Marina antes de cerrar.</div>
              </button>
            </div>
          </>
        )}

        {action === "reschedule" && (
          <>
            <div>
              <h1 className="mob-h1" style={{ fontSize: 20 }}>¿Cuándo te queda mejor?</h1>
              <p className="mob-sub">Marina tiene estos huecos abiertos esta semana.</p>
            </div>

            <div className="cn-policy">
              <span className="cn-policy-glyph">✓</span>
              <div>
                <div className="cn-policy-title" style={{ fontSize: 12 }}>Reagendar es gratis siempre.</div>
              </div>
            </div>

            <div className="mob-week">
              {window.T_WEEK.map((d, i) => (
                <button
                  key={i}
                  className={"mob-week-day " + (d.slots.length === 0 ? "is-empty " : "") + (i === altDay ? "is-on" : "")}
                  onClick={() => d.slots.length && setAltDay(i)}
                  type="button"
                >
                  <div className="mob-week-day-w">{d.day}</div>
                  <div className="mob-week-day-d">{d.date}</div>
                </button>
              ))}
            </div>
            <div className="mob-times-grid">
              {day.slots.map((slot, i) => (
                <button key={slot}
                  className={"mob-time " + (i === altTime ? "is-on" : "")}
                  onClick={() => setAltTime(i)} type="button">
                  {slot}
                </button>
              ))}
            </div>

            <button className="mob-cta" onClick={() => setTweak("screen", "sessions")}>
              Confirmar — mover a {day.day} {day.date} →
            </button>
          </>
        )}

        {action === "cancel" && (
          <>
            <div>
              <h1 className="mob-h1" style={{ fontSize: 20 }}>¿Qué pasó esta semana?</h1>
              <p className="mob-sub">Opcional. Marina lo recibe como nota antes de la próxima.</p>
            </div>
            <div className="cn-reasons">
              {window.T_CANCEL_REASONS.map((r) => (
                <button key={r.id}
                  className={"cn-reason " + (reason === r.id ? "is-on" : "")}
                  onClick={() => setReason(r.id)} type="button">
                  <span className="cn-reason-radio"></span>
                  <div>
                    <div className="cn-reason-label" style={{ fontSize: 12.5 }}>{r.label}</div>
                    {r.sub && <div className="cn-reason-sub" style={{ fontSize: 11 }}>{r.sub}</div>}
                  </div>
                </button>
              ))}
            </div>

            <div className={"cn-policy " + (pol.outsideWindow ? "warning" : "")}>
              <span className="cn-policy-glyph">{pol.outsideWindow ? "!" : "✓"}</span>
              <div>
                <div className="cn-policy-title" style={{ fontSize: 12.5 }}>
                  {pol.outsideWindow ? "Cargo del 50 %" : "Cancelación sin costo"}
                </div>
                <div className="cn-policy-body" style={{ fontSize: 11.5 }}>{pol.context}</div>
              </div>
            </div>

            <button className="mob-cta" disabled={!reason}
              style={{ background: "var(--color-error-text)" }}
              onClick={() => setTweak("screen", "sessions")}>
              Cancelar esta sesión
            </button>
          </>
        )}

        {action === "pause" && (
          <>
            <div>
              <h1 className="mob-h1" style={{ fontSize: 20 }}>Pausar tiene su propio ritmo.</h1>
              <p className="mob-sub">Una sesión breve de cierre suele cambiar cómo se queda esto contigo.</p>
            </div>
            <button className="cn-action" type="button" onClick={() => setTweak("screen", "sessions")}>
              <div className="cn-action-glyph">💬</div>
              <div className="cn-action-title">Reservar sesión de cierre</div>
              <div className="cn-action-sub">Sin costo extra dentro del Pro.</div>
            </button>
            <button className="cn-action" type="button" onClick={() => setTweak("screen", "sessions")}>
              <div className="cn-action-glyph">⏸</div>
              <div className="cn-action-title">Pausar sin cierre</div>
              <div className="cn-action-sub">Marina recibe un aviso. Vuelves cuando quieras.</div>
            </button>
          </>
        )}
      </div>
      <MTabbar/>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 16 · VISTA TERAPEUTA · MÓVIL (vista compacta de hoy)
// ───────────────────────────────────────────────────────────
function MTherapist({ setTweak }) {
  const today = window.T_TX_TODAY;
  const load = window.T_TX_LOAD;
  const inbox = window.T_TX_INBOX;
  const next = today.find((s) => s.state === "next");

  return (
    <div className="mob" style={{ background: "#f7f5f0" }}>
      <div className="mob-scroll">
        <MTopnav title="Hoy · Marina" right={<span className="mob-topnav-spacer">⌕</span>}/>

        <section className="tx-greet" style={{ padding: "18px 20px" }}>
          <span className="tx-greet-eyebrow">✦ Vista terapeuta</span>
          <h1 style={{ font: "700 20px/1.18 var(--font-sans)", letterSpacing: "-0.018em", color: "var(--color-warm-900)", margin: "10px 0 6px" }}>
            Ana llega a las 19:00.
          </h1>
          <p style={{ font: "400 13px/1.5 var(--font-sans)", color: "var(--color-warm-600)", margin: 0 }}>
            Y trae 3 entradas del diario contigo. Vas en ritmo esta semana.
          </p>
        </section>

        {next && (
          <div className="mob-card" style={{ padding: 14, display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center" }}>
            <MAvatar cover={next.cover} initials={next.initials} size={44}/>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: "600 10px/1 var(--font-mono)", letterSpacing: ".08em", color: "var(--color-lavender-700)", textTransform: "uppercase" }}>
                Próxima · {next.time}
              </div>
              <div style={{ font: "700 13.5px/1.2 var(--font-sans)", color: "var(--color-warm-900)", marginTop: 5 }}>
                {next.patientName}
              </div>
              <div style={{ font: "400 11.5px/1.4 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 3 }}>
                {next.sessionLabel}
              </div>
            </div>
            <button className="btn-sage" style={{ padding: "10px 14px", fontSize: 12 }}
              onClick={() => setTweak("screen", "room")}>
              Entrar →
            </button>
          </div>
        )}

        <div>
          <div style={{ font: "700 11px/1 var(--font-sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-warm-500)", marginBottom: 8 }}>
            Hoy · {today.length} sesiones
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {today.map((s, i) => (
              <div key={i} className="mob-card" style={{
                padding: 12, display: "grid", gridTemplateColumns: "auto auto 1fr",
                gap: 12, alignItems: "center",
                opacity: s.state === "done" ? 0.7 : 1,
                borderColor: s.state === "next" ? "var(--color-lavender-300)" : "var(--color-warm-200)",
              }}>
                <div style={{
                  font: "700 13px/1 var(--font-mono)", color: "var(--color-warm-700)",
                  width: 44, textAlign: "center",
                }}>{s.time}</div>
                <MAvatar cover={s.cover} initials={s.initials} size={36}/>
                <div style={{ minWidth: 0 }}>
                  <div style={{ font: "700 13px/1.2 var(--font-sans)", color: "var(--color-warm-900)" }}>
                    {s.patientName}
                    {s.flag === "new" && <span className="tx-day-flag" style={{ marginLeft: 5, fontSize: 8 }}>Nuevo</span>}
                  </div>
                  <div style={{ font: "400 11px/1.3 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 3 }}>
                    {s.sessionLabel}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mob-card">
          <div className="tx-card-h" style={{ marginBottom: 12 }}>Bandeja</div>
          {inbox.slice(0, 3).map((m) => (
            <div key={m.id} className="tx-inbox-row" style={{ padding: "10px 0", gridTemplateColumns: "auto 1fr" }}>
              <MAvatar cover={m.cover} initials={m.initials} size={32}/>
              <div>
                <div style={{ font: "400 12px/1.5 var(--font-sans)", color: "var(--color-warm-800)" }}>
                  <strong>{m.patient}</strong> · {m.body}
                </div>
                <div style={{ font: "500 10.5px/1 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 4 }}>
                  {m.when}
                  {m.flag && <span className={"tx-inbox-flag " + m.flag} style={{ marginLeft: 6, fontSize: 9 }}>
                    {m.flag === "urgent" ? "Urgente" : "Nuevo"}
                  </span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mob-card">
          <div className="tx-card-h" style={{ marginBottom: 10 }}>Tu carga</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ font: "700 22px/1 var(--font-sans)", color: "var(--color-warm-900)" }}>
                {load.hoursThisWeek}<small style={{ font: "500 12px/1 var(--font-sans)", color: "var(--color-warm-500)" }}>h</small>
              </div>
              <div style={{ font: "600 10.5px/1 var(--font-sans)", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-warm-500)", marginTop: 5 }}>
                De {load.hoursTarget} h
              </div>
            </div>
            <div>
              <div style={{ font: "700 22px/1 var(--font-sans)", color: "var(--color-warm-900)" }}>
                {load.activePatients}
              </div>
              <div style={{ font: "600 10.5px/1 var(--font-sans)", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-warm-500)", marginTop: 5 }}>
                Pacientes
              </div>
            </div>
          </div>
          <div className="tx-load-bars" style={{ height: 50 }}>
            {load.weekLoad.map((d, i) => (
              <div key={i}
                className={"tx-load-bar " + (d.sessions === 0 ? "is-zero " : "") + (d.isToday ? "is-today" : "")}
                style={{ height: d.sessions ? `${(d.sessions / 6) * 100}%` : "4px" }}/>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 17 · B2B Beneficio · MÓVIL
// ───────────────────────────────────────────────────────────
function MB2BUser({ setTweak }) {
  const b = window.T_B2B_USER;
  const pct = b.sessionsUsed / b.sessionsCoveredYear;
  return (
    <div className="mob">
      <div className="mob-scroll">
        <MTopnav title="Mi beneficio" onBack={() => setTweak("screen", "hub")}/>

        <section className="b2b-banner" style={{ padding: "22px 22px" }}>
          <div className="b2b-banner-meta">
            <span className="b2b-employer" style={{ width: 40, height: 40, fontSize: 16 }}>{b.employerLogo}</span>
            <div>
              <div className="b2b-employer-name">{b.employer}</div>
              <div className="b2b-plan-name">{b.plan}</div>
            </div>
          </div>
          <h2 style={{ font: "700 19px/1.2 var(--font-sans)", margin: "14px 0 6px" }}>
            Tu equipo cubre tu terapia.
          </h2>
          <p className="b2b-banner-sub" style={{ fontSize: 13 }}>
            No se cobra a tu tarjeta. Tu uso es completamente anónimo para Quanta.
          </p>

          <div className="b2b-counter" style={{ marginTop: 14, padding: "12px 14px" }}>
            <span className="b2b-counter-ring" style={{ "--p": pct, width: 56, height: 56 }}>
              <span className="b2b-counter-ring-text" style={{ fontSize: 16 }}>
                {b.sessionsRemaining}
                <small style={{ fontSize: 8 }}>quedan</small>
              </span>
            </span>
            <div>
              <div className="b2b-counter-meta-h" style={{ fontSize: 13 }}>
                {b.sessionsUsed} / {b.sessionsCoveredYear} usadas
              </div>
              <div className="b2b-counter-meta-sub" style={{ fontSize: 11 }}>
                Renueva el {b.renewDate}.
              </div>
            </div>
          </div>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {b.perks.map((p) => (
            <div key={p.title} className="b2b-perk" style={{ padding: "12px 14px" }}>
              <span className="b2b-perk-glyph">{p.glyph}</span>
              <div>
                <div className="b2b-perk-title" style={{ fontSize: 12.5 }}>{p.title}</div>
                <div className="b2b-perk-sub" style={{ fontSize: 11.5 }}>{p.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="b2b-privacy" style={{ padding: "14px 16px" }}>
          <span className="b2b-privacy-glyph">🔒</span>
          <div>
            <div className="b2b-privacy-title" style={{ fontSize: 12.5 }}>Quanta nunca te identifica.</div>
            <div className="b2b-privacy-body" style={{ fontSize: 11.5 }}>
              Solo ven conteos agregados. Nunca tu nombre, tu terapeuta o los temas de tus sesiones.
            </div>
          </div>
        </div>

        <button className="mob-cta" onClick={() => setTweak("screen", "dir")}>
          Reservar próxima sesión →
        </button>
      </div>
      <MTabbar/>
    </div>
  );
}

// B2B Admin no tiene vista móvil — es herramienta de productividad
function MB2BAdmin({ setTweak }) {
  return (
    <div className="mob">
      <div className="mob-scroll">
        <MTopnav title="Bienestar · Admin" onBack={() => setTweak("screen", "hub")}/>
        <div style={{ padding: "48px 24px", textAlign: "center" }}>
          <div style={{ font: "700 56px/1 var(--font-sans)", color: "var(--color-warm-300)", marginBottom: 16 }}>
            ⊟
          </div>
          <h2 style={{ font: "700 18px/1.2 var(--font-sans)", color: "var(--color-warm-900)", margin: "0 0 8px" }}>
            Mejor desde el escritorio
          </h2>
          <p style={{ font: "400 13px/1.55 var(--font-sans)", color: "var(--color-warm-600)", margin: "0 auto", maxWidth: "34ch" }}>
            El dashboard de Bienestar está optimizado para pantallas grandes.
            Abre el enlace que te enviamos a {window.T_B2B_USER.contact}.
          </p>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Router móvil
// ───────────────────────────────────────────────────────────
function MobileTerapia({ tweaks, setTweak }) {
  const map = {
    hub: <MHub setTweak={setTweak}/>,
    dir: <MDir setTweak={setTweak}/>,
    prof: <MProf setTweak={setTweak}/>,
    book: <MBook setTweak={setTweak}/>,
    prep: <MPrep setTweak={setTweak}/>,
    sessions: <MSessions setTweak={setTweak}/>,
    post: <MPost setTweak={setTweak}/>,
    room: <MRoom setTweak={setTweak}/>,
    onboarding: <MOnboarding setTweak={setTweak}/>,
    crisis: <MCrisis setTweak={setTweak}/>,
    match: <MMatch setTweak={setTweak}/>,
    progress:      <MProgress setTweak={setTweak}/>,
    notifs:        <MNotifs setTweak={setTweak}/>,
    prescriptions: <MPrescriptions setTweak={setTweak}/>,
    cancel:        <MCancel setTweak={setTweak}/>,
    therapist:    <MTherapist setTweak={setTweak}/>,
    "b2b-user":   <MB2BUser setTweak={setTweak}/>,
    "b2b-admin":  <MB2BAdmin setTweak={setTweak}/>,
  };
  return map[tweaks.screen] || null;
}

window.MobileTerapia = MobileTerapia;
