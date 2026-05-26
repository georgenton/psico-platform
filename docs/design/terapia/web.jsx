// terapia/web.jsx — Las 7 pantallas en superficie WEB.

const {
  T_USER, T_MOTIVOS, T_THERAPISTS, T_WEEK,
  T_NEXT_SESSION, T_SESSIONS_PAST,
  T_PREP_ITEMS, T_DIARY_ENTRIES,
  T_POST_TAGS, T_POST_HOMEWORK, T_POST_RECOS,
  T_HOW, T_FAQ, T_WEEKDAYS,
} = window;

// ── Shared shell ───────────────────────────────────────────
function WSidebar({ activeScreen, setTweak }) {
  const I = window.Icons;
  const items = [
    { icon: <I.home    />, label: "Inicio" },
    { icon: <I.book    />, label: "Mi biblioteca" },
    { icon: <I.diary   />, label: "Mi diario" },
    { icon: <I.terapia />, label: "Terapia", on: true },
    { icon: <I.plan    />, label: "Mi plan" },
    { icon: <I.user    />, label: "Perfil" },
  ];
  return (
    <aside className="tw-side">
      <div className="tw-side-head">
        <span className="tw-wordmark">Psico Platform</span>
      </div>
      <nav className="tw-side-nav">
        <div className="tw-eyebrow-side">Menú</div>
        {items.map((it) => (
          <a key={it.label} className={"tw-side-link " + (it.on ? "is-on" : "")} href="#">
            <span className="tw-side-link-icon">{it.icon}</span>
            {it.label}
          </a>
        ))}
      </nav>
      <div className="tw-side-foot">
        <button className="tw-crisis-trigger" onClick={() => setTweak("screen", "crisis")}>
          <span className="tw-crisis-trigger-glyph">!</span>
          <span>Apoyo inmediato</span>
        </button>
        <div className="tw-side-user">
          <span className="tw-side-avatar">A</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="tw-side-user-name">ana@correo.com</div>
            <div className="tw-side-user-plan">
              <span className="plan-dot pro"></span>
              Plan Pro
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

const SCREEN_TITLES = {
  hub:      { title: "Terapia",            crumbs: null },
  dir:      { title: "Terapeutas",         crumbs: ["Terapia", "Terapeutas"] },
  prof:     { title: "Dra. Marina Salazar", crumbs: ["Terapia", "Terapeutas", "Marina Salazar"] },
  book:     { title: "Reservar consulta",  crumbs: ["Terapia", "Terapeutas", "Marina Salazar", "Reservar"] },
  prep:     { title: "Antes de tu sesión", crumbs: ["Terapia", "Mis sesiones", "Antes de tu sesión"] },
  sessions: { title: "Mis sesiones",       crumbs: ["Terapia", "Mis sesiones"] },
  post:     { title: "Después de la sesión", crumbs: ["Terapia", "Mis sesiones", "Sesión 5"] },
  onboarding:{ title: "Empezar terapia",   crumbs: ["Terapia", "Empezar"] },
  crisis:   { title: "Apoyo inmediato",    crumbs: ["Terapia", "Apoyo inmediato"] },
  match:    { title: "Te ayudamos a elegir", crumbs: ["Terapia", "Encontrar terapeuta"] },
  progress:      { title: "Tu camino",       crumbs: ["Terapia", "Tu camino"] },
  notifs:        { title: "Notificaciones",  crumbs: null },
  prescriptions: { title: "Lo que Marina sugirió", crumbs: ["Terapia", "Mi camino con Marina"] },
  cancel:        { title: "Mover o cancelar sesión", crumbs: ["Terapia", "Mis sesiones", "Sesión 5", "Mover"] },
  "b2b-user":    { title: "Mi beneficio · Quanta Studios", crumbs: ["Mi plan", "Beneficio corporativo"] },
};

function WShell({ screen, setTweak, children }) {
  const meta = SCREEN_TITLES[screen];
  const unread = (window.T_NOTIFS || []).filter((n) => n.unread).length;
  return (
    <div className="tw">
      <WSidebar activeScreen={screen} setTweak={setTweak}/>
      <main className="tw-main">
        <header className="tw-top">
          {meta.crumbs ? (
            <div className="tw-top-crumbs">
              {meta.crumbs.map((c, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="sep">/</span>}
                  {i < meta.crumbs.length - 1
                    ? <a href="#">{c}</a>
                    : <span style={{ color: "var(--color-warm-800)" }}>{c}</span>}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="tw-top-title">{meta.title}</div>
          )}
          <div className="tw-top-right">
            <button className="tw-top-bell" onClick={() => setTweak("screen", "notifs")} title="Notificaciones">
              <window.Icons.bell width="20" height="20" />
              {unread > 0 && <span className="tw-top-bell-dot"></span>}
            </button>
            <div className="tw-top-day">martes · 20 may · 16:46</div>
          </div>
        </header>
        <div className="tw-page">
          <div className="tw-page-inner">{children}</div>
        </div>
      </main>
    </div>
  );
}

// Cover/initials avatar
function Avatar({ cover, initials, size = 56 }) {
  const cls = "tw-avatar size-" + size + " cover-" + cover;
  return <span className={cls}>{initials}</span>;
}

// ───────────────────────────────────────────────────────────
// PANTALLA 1 · HUB
// ───────────────────────────────────────────────────────────
function ScreenHub({ tweaks, setTweak }) {
  const featured = T_THERAPISTS.slice(0, 3);
  const style = tweaks.hubStyle || "calmado";
  return (
    <>
      {/* Hero */}
      <section className={"hub-hero " + style} style={{ position: "relative" }}>
        <div className="hub-style-switch">
          {window.T_HUB_STYLES.map((s) => (
            <button key={s.value}
              className={"hub-style-switch-btn " + (style === s.value ? "is-on" : "")}
              onClick={() => setTweak("hubStyle", s.value)}
              type="button"
              title={s.sub}
            >{s.label}</button>
          ))}
        </div>

        <span className="hub-hero-eyebrow">
          {style === "datos" ? "Tu camino hasta hoy · 4 meses"
            : style === "editorial" ? "Edición · Psicología 1:1"
            : "Terapia · Psicología 1:1"}
        </span>

        {style === "editorial" ? (
          <h1>Algo no se está acomodando. <em>Hablémoslo.</em></h1>
        ) : style === "datos" ? (
          <h1>Llevas <em>8 sesiones</em> y 47 días de diario. Esto sigue.</h1>
        ) : style === "inmersivo" ? (
          <h1>Tu cabeza no se apaga.<br/><em>Probemos hablarlo.</em></h1>
        ) : (
          <h1>Habla con un<em> psicólogo </em>cuando lo necesites, a tu ritmo.</h1>
        )}

        <p className="hub-hero-sub">
          {style === "editorial"
            ? "Una conversación con un psicólogo titulado. Cincuenta minutos, en español, donde lo único que se te pide es estar."
            : style === "datos"
            ? "Tu próxima sesión con Marina es hoy a las 19:00. Llevas a buen ritmo — un capítulo nuevo abierto y la práctica del 'tengo que' activa esta semana."
            : style === "inmersivo"
            ? "Sesiones por video con psicólogos titulados. Sin listas de espera. Cuando lo necesites — y solo cuando lo necesites."
            : "Sesiones por video con psicólogos titulados de Ecuador y LATAM. Desde $28/sesión — sin listas de espera, sin paquetes obligatorios. La primera tiene 30 min de cortesía si necesitas conocer a tu terapeuta antes."}
        </p>

        <div className="hub-hero-cta">
          <button className="btn-sage" onClick={() => setTweak("screen", "onboarding")}>
            {style === "datos" ? "Preparar sesión de hoy →" : "Empezar terapia →"}
          </button>
          <button className="btn-outline" onClick={() => setTweak("screen", "match")}>
            ✦ Ayúdame a elegir
          </button>
          {style !== "datos" && (
            <button className="btn-soft" onClick={() => setTweak("screen", "dir")}>
              Ver todos los terapeutas
            </button>
          )}
        </div>

        <span className="hub-hero-reassure">
          ✓ Confidencial
          <span className="hub-hero-reassure-dot">·</span>
          Cambias de terapeuta sin costo
          <span className="hub-hero-reassure-dot">·</span>
          Cancelas hasta 12 h antes
        </span>

        {style === "datos" && (
          <div className="hub-datos-row">
            <div className="hub-datos-cell">
              <div className="hub-datos-cell-val">8<small>sesiones</small></div>
              <div className="hub-datos-cell-lbl">Con Marina</div>
              <div className="hub-datos-cell-delta">+1 esta semana</div>
            </div>
            <div className="hub-datos-cell">
              <div className="hub-datos-cell-val">47<small>días</small></div>
              <div className="hub-datos-cell-lbl">De diario</div>
              <div className="hub-datos-cell-delta">5 seguidos</div>
            </div>
            <div className="hub-datos-cell">
              <div className="hub-datos-cell-val">3<small>libros</small></div>
              <div className="hub-datos-cell-lbl">Terminados</div>
              <div className="hub-datos-cell-delta">1 en curso</div>
            </div>
            <div className="hub-datos-cell">
              <div className="hub-datos-cell-val">7.1<small>h sueño</small></div>
              <div className="hub-datos-cell-lbl">Antes 5.2 h</div>
              <div className="hub-datos-cell-delta">↑ desde feb</div>
            </div>
          </div>
        )}
      </section>

      {/* Cómo funciona */}
      <div>
        <div className="tw-sech">
          <h2 className="tw-sech-h">Cómo funciona</h2>
        </div>
        <div className="hub-how">
          {T_HOW.map((s) => (
            <div className="hub-how-step" key={s.num}>
              <div className="hub-how-num">{s.num}</div>
              <h3 className="hub-how-title">{s.title}</h3>
              <p className="hub-how-sub">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Featured therapists */}
      <div>
        <div className="tw-sech">
          <h2 className="tw-sech-h">Terapeutas que recomendamos para empezar</h2>
          <a className="tw-sech-link" href="#" onClick={(e) => { e.preventDefault(); setTweak("screen", "dir"); }}>
            Ver todo el directorio →
          </a>
        </div>
        <div className="hub-feat">
          {featured.map((t) => (
            <article key={t.id} className="hub-feat-card" onClick={() => setTweak("screen", "prof")}>
              <header className="hub-feat-head">
                <Avatar cover={t.cover} initials={t.initials} size={48}/>
                <div style={{ minWidth: 0 }}>
                  <div className="hub-feat-name">{t.name}</div>
                  <div className="hub-feat-meta">{t.title} · {t.pais}</div>
                </div>
              </header>
              <p className="hub-feat-blurb">{t.blurb}</p>
              <div className="hub-feat-tags">
                {t.especialidades.slice(0, 3).map((e) => (
                  <span key={e} className="tw-pill warm">{e}</span>
                ))}
              </div>
              <div className="hub-feat-foot">
                <span className="hub-feat-slot">Próximo: {t.nextSlot}</span>
                <div className="hub-feat-price">${t.price} <small>USD/sesión</small></div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div>
        <div className="tw-sech">
          <h2 className="tw-sech-h">Lo más preguntado</h2>
        </div>
        <div className="hub-faq">
          {T_FAQ.map((f, i) => (
            <div key={i} className="hub-faq-item">
              <div className="hub-faq-q">{f.q}</div>
              <div className="hub-faq-a">{f.a}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 2 · DIRECTORIO
// ───────────────────────────────────────────────────────────
function ScreenDirectory({ setTweak }) {
  const filters = [
    { label: "Especialidad",   v: "" },
    { label: "Idioma · Español", v: "es", on: true },
    { label: "Modalidad",      v: "" },
    { label: "Precio",         v: "" },
    { label: "Disponibilidad", v: "" },
  ];

  return (
    <>
      <div>
        <span className="tw-eyebrow">Terapeutas verificados</span>
        <h1 style={{ font: "700 30px/1.15 var(--font-sans)", letterSpacing: "-0.022em", color: "var(--color-warm-900)", margin: "10px 0 6px", maxWidth: "22ch", textWrap: "balance" }}>
          Encuentra a alguien con quien te sientas en confianza.
        </h1>
        <p style={{ font: "400 14.5px/1.55 var(--font-sans)", color: "var(--color-warm-600)", margin: 0, maxWidth: "54ch" }}>
          {T_THERAPISTS.length} psicólogos disponibles esta semana. Filtra por enfoque,
          modalidad o precio — verás disponibilidad real en tu zona horaria.
        </p>
      </div>

      <div className="dir-toolbar">
        <div className="dir-search">
          <span className="dir-search-glyph">⌕</span>
          <input placeholder='Buscar — p. ej. "ansiedad", "pareja", "duelo"…'/>
        </div>
        {filters.map((f) => (
          <button key={f.label} className={"dir-filter-pill " + (f.on ? "is-on" : "")}>
            {f.label} <span className="caret">▾</span>
          </button>
        ))}
      </div>

      <div className="dir-meta">
        <span><strong>{T_THERAPISTS.length}</strong> terapeutas · esta semana</span>
        <span>
          Ordenar por{" "}
          <select defaultValue="rec">
            <option value="rec">Recomendado</option>
            <option value="price">Precio</option>
            <option value="rating">Mejor calificado</option>
            <option value="slot">Más cercano</option>
          </select>
        </span>
      </div>

      <div className="dir-list">
        {T_THERAPISTS.map((t, i) => (
          <article key={t.id} className="dir-card" onClick={() => setTweak("screen", "prof")}>
            <Avatar cover={t.cover} initials={t.initials} size={96}/>
            <div className="dir-card-head">
              <div className="dir-card-name">{t.name}</div>
              <div className="dir-card-line">{t.title} · {t.pais} · {t.licencia}</div>
              <p className="dir-card-blurb">{t.blurb}</p>
              <div className="dir-card-tags">
                {t.especialidades.map((e) => <span key={e} className="tw-pill lavender">{e}</span>)}
                {t.modalidad.map((m) => <span key={m} className="tw-pill warm">{m}</span>)}
              </div>
            </div>
            <div className="dir-card-aside">
              <span className="dir-card-rating">
                <span className="star">★</span> {t.rating} <small>· {t.reviews}</small>
              </span>
              <div style={{ textAlign: "right" }}>
                <div className="dir-card-price">${t.price}<small>USD</small></div>
                <div style={{ font: "500 11px/1 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 3 }}>
                  / sesión · {t.duration} min
                </div>
              </div>
              <span className="dir-card-slot">Próximo · {t.nextSlot}</span>
              <button className="dir-card-cta" onClick={(e) => { e.stopPropagation(); setTweak("screen", "prof"); }}>
                Ver perfil →
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 3 · PERFIL DEL TERAPEUTA
// ───────────────────────────────────────────────────────────
function ScreenProfile({ setTweak }) {
  const t = T_THERAPISTS[0]; // Marina
  const [dayIdx, setDayIdx] = React.useState(0);
  const [timeIdx, setTimeIdx] = React.useState(0);
  const day = T_WEEK[dayIdx] || T_WEEK[0];

  return (
    <>
      <section className="prof-hero">
        <Avatar cover={t.cover} initials={t.initials} size={96}/>
        <div className="prof-hero-meta">
          <h1 className="prof-name">{t.name}</h1>
          <div className="prof-title">{t.title} · {t.pais} · {t.licencia}</div>
          <div className="prof-stats">
            <span className="prof-stat"><strong>★ {t.rating}</strong> · {t.reviews} reseñas</span>
            <span className="prof-stat"><strong>{t.duration} min</strong> / sesión</span>
            <span className="prof-stat">Habla <strong>{t.idiomas.join(", ")}</strong></span>
          </div>
        </div>
        <div className="prof-tags">
          {t.especialidades.map((e) => <span key={e} className="tw-pill lavender">{e}</span>)}
          {t.enfoques.map((e) => <span key={e} className="tw-pill warm">{e}</span>)}
          {t.modalidad.map((m) => <span key={m} className="tw-pill outline">{m}</span>)}
          {t.isAutor && <span className="tw-pill sage">✦ Autora en Psico Platform</span>}
        </div>
        <blockquote className="prof-quote">{t.quote}</blockquote>
        <div className="prof-aside">
          <div className="prof-aside-price">
            <div>
              <span className="prof-price">${t.price}<small>USD</small></span>
            </div>
            <div className="prof-price-sub">/ sesión · {t.duration} min · cancelas 12 h antes</div>
          </div>
          <div className="prof-aside-cta">
            <button className="btn-outline">Mensaje antes de reservar</button>
            <button className="btn-sage" onClick={() => setTweak("screen", "book")}>
              Reservar sesión →
            </button>
          </div>
        </div>
      </section>

      <div className="prof-body">
        <div className="prof-col">
          <div className="tw-card">
            <h3 className="prof-h">Sobre Marina</h3>
            <p className="prof-bio">{t.longBio}</p>
          </div>
          <div className="tw-card">
            <h3 className="prof-h">Enfoque clínico</h3>
            <ul className="prof-approach-list">
              {t.enfoques.map((e) => <li key={e}>{e}</li>)}
              <li>Sesiones estructuradas con tareas opcionales entre encuentros</li>
              <li>Trabajo activo con el catálogo de lecturas y ejercicios</li>
            </ul>
          </div>
          <div className="tw-card">
            <h3 className="prof-h">Reseñas recientes</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="prof-review">
                <div className="prof-review-head">
                  Sebastián · 8 sesiones <span className="prof-review-stars">★★★★★</span>
                </div>
                <p className="prof-review-text">
                  Marina no apura. Las primeras tres sesiones pensé que estábamos perdiendo
                  el tiempo — hoy entiendo que estábamos abriendo espacio. Vale cada minuto.
                </p>
              </div>
              <div className="prof-review">
                <div className="prof-review-head">
                  Daniela · 4 sesiones <span className="prof-review-stars">★★★★★</span>
                </div>
                <p className="prof-review-text">
                  Llegué con la idea de "necesito herramientas". Salí con la idea de que las
                  herramientas no funcionan sin entender de dónde sale el problema. Gracias.
                </p>
              </div>
              <div className="prof-review">
                <div className="prof-review-head">
                  Anónimo · 2 sesiones <span className="prof-review-stars">★★★★☆</span>
                </div>
                <p className="prof-review-text">
                  Esperaba algo más directivo. No es para todos — pero el espacio que crea es real.
                </p>
              </div>
            </div>
          </div>
        </div>

        <aside className="prof-col">
          <div className="tw-card prof-slot-card">
            <span className="prof-slot-h">Próxima disponibilidad</span>
            <div className="prof-slot-days">
              {T_WEEK.map((d, i) => (
                <button
                  key={i}
                  className={"prof-slot-day " +
                    (d.slots.length === 0 ? "is-empty " : "") +
                    (i === dayIdx ? "is-on" : "")}
                  onClick={() => d.slots.length && setDayIdx(i)}
                  type="button"
                >
                  <div className="prof-slot-day-w">{d.day}</div>
                  <div className="prof-slot-day-d">{d.date}</div>
                </button>
              ))}
            </div>
            <div className="prof-slot-times">
              {day.slots.length ? day.slots.map((s, i) => (
                <button
                  key={s}
                  className={"prof-slot-time " + (i === timeIdx ? "is-on" : "")}
                  onClick={() => setTimeIdx(i)}
                  type="button"
                >{s}</button>
              )) : (
                <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "12px 0", font: "500 12px/1.4 var(--font-sans)", color: "var(--color-warm-500)" }}>
                  Sin huecos este día — prueba otro.
                </div>
              )}
            </div>
            <button className="btn-sage" style={{ width: "100%", marginTop: 14 }} onClick={() => setTweak("screen", "book")}>
              Reservar {day.label.toLowerCase()} a las {day.slots[timeIdx] || day.slots[0] || "—"} →
            </button>
          </div>
          <div className="tw-card" style={{ padding: 16 }}>
            <span className="prof-slot-h" style={{ display: "block", marginBottom: 10 }}>Garantías</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, font: "400 12.5px/1.5 var(--font-sans)", color: "var(--color-warm-700)" }}>
              <div>✓ Si no encajas, cambias sin costo en la siguiente sesión.</div>
              <div>✓ Cancelación gratuita hasta 12 h antes.</div>
              <div>✓ 30 min iniciales de cortesía si lo necesitas.</div>
              <div>✓ Factura emitida para reembolso de seguros.</div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 4 · FLUJO DE RESERVA
// ───────────────────────────────────────────────────────────
function BookingProgress({ step }) {
  const steps = [
    { n: "01", l: "Motivo" },
    { n: "02", l: "Fecha y hora" },
    { n: "03", l: "Confirmar" },
  ];
  return (
    <div className="bk-progress">
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          {i > 0 && <span className={"bk-progress-line " + (i <= step ? "is-done" : "")}></span>}
          <span className={"bk-progress-step " +
            (i === step ? "is-on" : "") +
            (i < step ? "is-done" : "")}>
            <span className="step-n">{s.n}</span> {s.l}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

function ScreenBook({ tweaks, setTweak }) {
  const [step, setStep] = React.useState(0);
  const [motivo, setMotivo] = React.useState("ansiedad");
  const [dayIdx, setDayIdx] = React.useState(0);
  const [timeIdx, setTimeIdx] = React.useState(0);
  const [payMethod, setPayMethod] = React.useState("card");
  const [calView, setCalView] = React.useState("week"); // week | month
  const [selectedDate, setSelectedDate] = React.useState(20);
  const t = T_THERAPISTS[0];
  const day = T_WEEK[dayIdx] || T_WEEK[0];
  const time = day.slots[timeIdx] || day.slots[0];

  return (
    <>
      <BookingProgress step={step}/>

      {step === 0 && (
        <div>
          <h1 className="bk-title">¿Qué te trae hoy, {T_USER.firstName}?</h1>
          <p className="bk-sub">
            Elige lo que más se acerque. No es definitivo — puedes cambiarlo durante
            la sesión. Esto solo le da a Marina un punto de partida.
          </p>

          <div className="bk-motivos">
            {T_MOTIVOS.map((m) => (
              <button
                key={m.id}
                className={"bk-motivo " + (motivo === m.id ? "is-on" : "")}
                onClick={() => setMotivo(m.id)}
                type="button"
              >
                <span className="bk-motivo-glyph">{m.glyph}</span>
                <div className="bk-motivo-meta">
                  <div className="bk-motivo-label">{m.label}</div>
                  <div className="bk-motivo-sub">{m.sub}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="bk-note">
            <label className="bk-note-h">¿Quieres añadir algo? (opcional)</label>
            <textarea placeholder="Una frase, un contexto. Lo lee solo tu terapeuta."></textarea>
            <span className="bk-note-helper">
              ✓ Confidencial · solo lo lee tu terapeuta · puedes editarlo antes de la sesión.
            </span>
          </div>

          <div className="bk-foot">
            <button className="bk-foot-back" onClick={() => setTweak("screen", "prof")}>
              ← Volver al perfil
            </button>
            <button className="btn-sage" onClick={() => setStep(1)}>
              Continuar — elegir fecha →
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <h1 className="bk-title">¿Cuándo te queda bien?</h1>
          <p className="bk-sub">
            Horarios mostrados en hora de <strong>{T_USER.city}</strong> (GMT-5). La sesión
            dura {t.duration} minutos. Puedes cancelar gratis hasta 12 h antes.
          </p>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "8px 0 14px" }}>
            <span className="tw-eyebrow warm" style={{ fontSize: 11, color: "var(--color-warm-500)" }}>
              {calView === "week" ? "Próximos 7 días" : window.T_MONTH.monthLabel}
            </span>
            <div className="bk-cal-toggle">
              <button className={"bk-cal-toggle-btn " + (calView === "week" ? "is-on" : "")} onClick={() => setCalView("week")}>Semana</button>
              <button className={"bk-cal-toggle-btn " + (calView === "month" ? "is-on" : "")} onClick={() => setCalView("month")}>Mes</button>
            </div>
          </div>

          {calView === "week" ? (
            <div className="bk-cal-week">
              {T_WEEK.map((d, i) => (
                <button
                  key={i}
                  className={"bk-cal-day " +
                    (d.slots.length === 0 ? "is-empty " : "") +
                    (i === dayIdx ? "is-on" : "")}
                  onClick={() => d.slots.length && setDayIdx(i)}
                  type="button"
                >
                  <div className="bk-cal-day-w">{d.day}</div>
                  <div className="bk-cal-day-d">{d.date}</div>
                  <div className="bk-cal-day-lbl">{d.label.toLowerCase()}</div>
                  {d.slots.length > 0 && <span className="bk-cal-day-dot"></span>}
                </button>
              ))}
            </div>
          ) : (
            <MonthView selectedDate={selectedDate} onPick={setSelectedDate}/>
          )}

          <div className="bk-times">
            {day.slots.length ? day.slots.map((s, i) => (
              <button
                key={s}
                className={"bk-time " + (i === timeIdx ? "is-on" : "")}
                onClick={() => setTimeIdx(i)}
                type="button"
              >{s}</button>
            )) : (
              <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "16px 0", font: "500 13px/1.4 var(--font-sans)", color: "var(--color-warm-500)" }}>
                {day.label} no tiene huecos. Marina suele liberar más espacio los domingos.
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, padding: "14px 16px", background: "var(--color-warm-100)", borderRadius: 12, font: "500 12.5px/1.5 var(--font-sans)", color: "var(--color-warm-700)" }}>
            <strong style={{ color: "var(--color-warm-900)" }}>¿No ves un buen hueco?</strong> Marina abre nuevos cupos todos los lunes a las 09:00. Si lo prefieres, te avisamos por correo en cuanto se liberen.
          </div>

          <div className="bk-foot">
            <button className="bk-foot-back" onClick={() => setStep(0)}>
              ← Cambiar motivo
            </button>
            <button className="btn-sage" disabled={!time} onClick={() => setStep(2)}>
              Continuar — revisar y pagar →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h1 className="bk-title">Revisemos antes de confirmar.</h1>
          <p className="bk-sub">
            Tu reserva queda activa al pagar. Te enviamos correo de confirmación y
            la sesión aparece en <em>Mis sesiones</em>.
          </p>

          <div className="bk-confirm">
            <div className="bk-summary">
              <div className="bk-summary-therapist">
                <Avatar cover={t.cover} initials={t.initials} size={56}/>
                <div>
                  <div style={{ font: "700 16px/1.2 var(--font-sans)", color: "var(--color-warm-900)", letterSpacing: "-0.012em" }}>
                    {t.name}
                  </div>
                  <div style={{ font: "500 12px/1.3 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 3 }}>
                    {t.title} · {t.pais}
                  </div>
                </div>
              </div>

              <div className="bk-summary-row">
                <div className="bk-summary-lbl">Fecha</div>
                <div className="bk-summary-val">
                  <strong>{day.label}</strong> — {day.day} {day.date} de {day.month}
                  <small>Horario {T_USER.city} (GMT-5)</small>
                </div>
              </div>
              <div className="bk-summary-row">
                <div className="bk-summary-lbl">Hora</div>
                <div className="bk-summary-val">
                  <strong>{time}</strong> · {t.duration} minutos
                  <small>Termina a las {time ? String(parseInt(time, 10) + 1).padStart(2, "0") + ":00" : "—"}.</small>
                </div>
              </div>
              <div className="bk-summary-row">
                <div className="bk-summary-lbl">Modalidad</div>
                <div className="bk-summary-val">
                  <strong>Videollamada</strong>
                  <small>Desde el navegador o la app. No necesitas instalar nada.</small>
                </div>
              </div>
              <div className="bk-summary-row">
                <div className="bk-summary-lbl">Motivo</div>
                <div className="bk-summary-val">
                  <strong>{T_MOTIVOS.find((m) => m.id === motivo)?.label}</strong>
                  <small>{T_MOTIVOS.find((m) => m.id === motivo)?.sub}</small>
                </div>
              </div>
            </div>

            <aside className="bk-pay">
              <div className="bk-pay-h">Resumen de pago</div>
              <div className="bk-pay-line">
                <span>Sesión · 50 min</span>
                <strong>${t.price}.00</strong>
              </div>
              <div className="bk-pay-line muted">
                <span>Descuento Pro (–10 %)</span>
                <span>–${(t.price * 0.10).toFixed(2)}</span>
              </div>
              <div className="bk-pay-total">
                <span>Total</span>
                <span>${(t.price * 0.9).toFixed(2)} USD</span>
              </div>

              <div style={{ marginTop: 6, font: "600 11px/1 var(--font-sans)", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--color-warm-500)" }}>
                Método
              </div>
              <div className="bk-pay-methods">
                <button className={"bk-pay-method " + (payMethod === "card" ? "is-on" : "")} onClick={() => setPayMethod("card")}>Tarjeta</button>
                <button className={"bk-pay-method " + (payMethod === "paypal" ? "is-on" : "")} onClick={() => setPayMethod("paypal")}>PayPal</button>
                <button className={"bk-pay-method " + (payMethod === "transfer" ? "is-on" : "")} onClick={() => setPayMethod("transfer")}>Transfer.</button>
              </div>

              <button className="btn-sage" style={{ marginTop: 8 }} onClick={() => setTweak("screen", "sessions")}>
                Pagar ${(t.price * 0.9).toFixed(2)} y reservar →
              </button>
              <span className="bk-pay-reassure">
                ✓ Pago seguro · Stripe. Cancelación gratuita hasta 12 h antes.
                Si no encajas con Marina, cambias sin costo.
              </span>
            </aside>
          </div>

          <div className="bk-foot">
            <button className="bk-foot-back" onClick={() => setStep(1)}>
              ← Cambiar fecha
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 5 · PRE-SESIÓN
// ───────────────────────────────────────────────────────────
function ScreenPrep({ setTweak }) {
  const s = T_NEXT_SESSION;
  const [items, setItems] = React.useState(T_PREP_ITEMS);
  const [entries, setEntries] = React.useState(T_DIARY_ENTRIES);
  const done = items.filter((i) => i.state === "done").length;

  const toggleEntry = (id) =>
    setEntries((es) => es.map((e) => e.id === id ? { ...e, picked: !e.picked } : e));

  return (
    <>
      <section className="prep-banner">
        <Avatar cover={s.cover} initials={s.therapistInitials} size={72}/>
        <div>
          <span style={{ font: "700 10.5px/1 var(--font-sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>
            Tu próxima sesión
          </span>
          <h2 className="prep-banner-title">Sesión 5 · {s.therapistName}</h2>
          <p className="prep-banner-sub">
            {s.dateLabel} a las <strong>{s.time}</strong> · {s.modalidad} · {s.duration} min
          </p>
        </div>
        <div className="prep-banner-countdown">
          <div className="prep-banner-countdown-val">{s.timeUntil}</div>
          <div className="prep-banner-countdown-lbl">para empezar</div>
        </div>
      </section>

      <div className="prep-progress">
        <div className="prep-progress-num">{done}<small>/{items.length}</small></div>
        <div className="prep-progress-meta">
          <div className="prep-progress-lbl">Preparación · vas bien</div>
          <div className="prep-progress-bar">
            <div className="prep-progress-bar-fill" style={{ width: `${(done / items.length) * 100}%` }}/>
          </div>
        </div>
        <button className="btn-ghost">Saltar todo</button>
      </div>

      <div>
        <div className="tw-sech">
          <h3 className="tw-sech-h">Antes de empezar</h3>
          <span className="tw-eyebrow warm" style={{ fontSize: 10 }}>Toma 4–5 min</span>
        </div>
        <div className="prep-list">
          {items.map((it) => (
            <div key={it.id} className={"prep-item " + (it.state === "done" ? "is-done" : "")}>
              <span className="prep-item-tick">{it.state === "done" ? "✓" : ""}</span>
              <div style={{ minWidth: 0 }}>
                <div className="prep-item-title">{it.title}</div>
                <div className="prep-item-sub">{it.sub}</div>
                {it.state === "done" && it.answer && (
                  <div className="prep-item-answer">{it.answer}</div>
                )}
                {it.kind === "diario" && (
                  <div className="prep-diary">
                    {entries.map((e) => (
                      <button
                        key={e.id}
                        className={"prep-diary-entry " + (e.picked ? "is-on" : "")}
                        onClick={() => toggleEntry(e.id)}
                        type="button"
                      >
                        <span className="prep-diary-check">{e.picked && "✓"}</span>
                        <div className="prep-diary-meta">
                          <div className="prep-diary-title">{e.title}</div>
                          <div className="prep-diary-excerpt">{e.excerpt}</div>
                        </div>
                        <div className="prep-diary-date">{e.date.split(",")[0]}</div>
                      </button>
                    ))}
                    <div style={{ font: "500 11.5px/1.4 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 6 }}>
                      ✓ {entries.filter((e) => e.picked).length} de {entries.length} marcadas — Marina solo verá las que elijas.
                    </div>
                  </div>
                )}
              </div>
              {it.state === "done" ? (
                <span className="prep-item-status">Listo</span>
              ) : it.state === "optional" ? (
                <button className="btn-soft">Empezar ejercicio →</button>
              ) : (
                <button className="prep-item-cta">Elegir entradas →</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px", background: "#fff", border: "1.5px solid var(--color-warm-200)", borderRadius: 16 }}>
        <div>
          <div style={{ font: "700 13.5px/1.2 var(--font-sans)", color: "var(--color-warm-900)", letterSpacing: "-0.008em" }}>
            La sala se abre 5 min antes.
          </div>
          <div style={{ font: "400 12px/1.4 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 4 }}>
            Te avisaremos por email y notificación. También puedes entrar directo desde aquí.
          </div>
        </div>
        <button className="btn-lavender" onClick={() => setTweak("screen", "room")}>Entrar a la sala →</button>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 6 · MIS SESIONES
// ───────────────────────────────────────────────────────────
function ScreenSessions({ setTweak }) {
  const [tab, setTab] = React.useState("prox");
  const s = T_NEXT_SESSION;

  return (
    <>
      <section className="ses-next">
        <Avatar cover={s.cover} initials={s.therapistInitials} size={72}/>
        <div>
          <span className="ses-next-when">Próxima · {s.dateLabel}</span>
          <h2 className="ses-next-title">Sesión 5 con {s.therapistName}</h2>
          <p className="ses-next-meta">
            {s.time} · {s.modalidad} · {s.duration} min — empieza {s.timeUntil}
          </p>
        </div>
        <div className="ses-next-cta-row">
          <button className="ses-next-cta ghost" onClick={() => setTweak("screen", "prep")}>
            Preparar →
          </button>
          <button className="ses-next-cta" onClick={() => setTweak("screen", "room")}>Entrar a la sala →</button>
        </div>
      </section>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a href="#" onClick={(e) => { e.preventDefault(); setTweak("screen", "progress"); }}
           style={{ flex: 1, minWidth: 220, padding: "14px 18px", background: "#fff", border: "1.5px solid var(--color-warm-200)", borderRadius: 14, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ font: "700 13.5px/1.2 var(--font-sans)", color: "var(--color-warm-900)", letterSpacing: "-0.008em" }}>Tu camino · 4 meses</div>
            <div style={{ font: "500 11.5px/1.4 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 4 }}>
              8 sesiones · 47 días de diario · 3 libros
            </div>
          </div>
          <span style={{ font: "600 13px/1 var(--font-sans)", color: "var(--color-lavender-700)" }}>Ver →</span>
        </a>
        <a href="#" onClick={(e) => { e.preventDefault(); setTweak("screen", "prescriptions"); }}
           style={{ flex: 1, minWidth: 220, padding: "14px 18px", background: "#fff", border: "1.5px solid var(--color-warm-200)", borderRadius: 14, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ font: "700 13.5px/1.2 var(--font-sans)", color: "var(--color-warm-900)", letterSpacing: "-0.008em" }}>Lo que Marina sugirió</div>
            <div style={{ font: "500 11.5px/1.4 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 4 }}>
              5 sugerencias · 2 en curso · 2 terminadas
            </div>
          </div>
          <span style={{ font: "600 13px/1 var(--font-sans)", color: "var(--color-lavender-700)" }}>Abrir →</span>
        </a>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="ses-tabs">
          <button className={"ses-tab " + (tab === "prox" ? "is-on" : "")} onClick={() => setTab("prox")}>
            Próximas · 1
          </button>
          <button className={"ses-tab " + (tab === "hist" ? "is-on" : "")} onClick={() => setTab("hist")}>
            Historial · {T_SESSIONS_PAST.length}
          </button>
          <button className={"ses-tab " + (tab === "notas" ? "is-on" : "")} onClick={() => setTab("notas")}>
            Mis notas
          </button>
        </div>
        <button className="btn-outline" onClick={() => setTweak("screen", "dir")}>
          Reservar otra sesión →
        </button>
      </div>

      {tab === "prox" && (
        <div className="ses-list">
          <div className="ses-row">
            <div className="ses-row-date">
              <div className="ses-row-date-d">20</div>
              <div className="ses-row-date-m">may</div>
            </div>
            <Avatar cover={s.cover} initials={s.therapistInitials} size={48}/>
            <div style={{ minWidth: 0 }}>
              <div className="ses-row-title">Sesión 5 con {s.therapistName}</div>
              <div className="ses-row-snippet">
                Continuamos con el patrón del "tengo que" — Marina sugiere abrir con la práctica de la semana.
              </div>
              <div className="ses-row-meta">
                <span>{s.time} · {s.duration} min</span>
                <span>·</span>
                <span>{s.modalidad}</span>
                <span>·</span>
                <span>Preparación {s.prep.ready}/{s.prep.total}</span>
                <span>·</span>
                <a href="#" onClick={(e) => { e.preventDefault(); setTweak("screen", "cancel"); }}
                   style={{ color: "var(--color-warm-600)", textDecoration: "underline", textUnderlineOffset: 2 }}>
                  Mover o cancelar
                </a>
              </div>
            </div>
            <button className="btn-sage" onClick={() => setTweak("screen", "prep")}>Preparar →</button>
          </div>
        </div>
      )}

      {tab === "hist" && (
        <div className="ses-list">
          {T_SESSIONS_PAST.map((p) => (
            <div key={p.id} className="ses-row">
              <div className="ses-row-date">
                <div className="ses-row-date-d">{p.date.split(" ")[0]}</div>
                <div className="ses-row-date-m">may</div>
              </div>
              <Avatar cover={p.cover} initials="MS" size={48}/>
              <div style={{ minWidth: 0 }}>
                <div className="ses-row-title">{p.title}</div>
                <div className="ses-row-snippet">{p.snippet}</div>
                <div className="ses-row-meta">
                  <span>{p.time} · {p.duration} min</span>
                  <span>·</span>
                  <span>{p.therapistName}</span>
                  <span>·</span>
                  <span>{p.hasNotes ? "Notas disponibles" : "Sin notas"}</span>
                </div>
              </div>
              <button className="btn-outline">Ver notas →</button>
            </div>
          ))}
        </div>
      )}

      {tab === "notas" && (
        <div className="tw-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ font: "700 16px/1.2 var(--font-sans)", color: "var(--color-warm-900)", marginBottom: 6 }}>
            Aquí guardas tus reflexiones de cada sesión.
          </div>
          <div style={{ font: "400 13px/1.55 var(--font-sans)", color: "var(--color-warm-500)", maxWidth: "48ch", margin: "0 auto" }}>
            Marina nunca lee tus notas. Son tuyas — pero si quieres, puedes
            compartir una entrada específica antes de la próxima sesión.
          </div>
        </div>
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 7 · POST-SESIÓN
// ───────────────────────────────────────────────────────────
function ScreenPost({ setTweak }) {
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
    <>
      <section className="post-hero">
        <span className="post-hero-eyebrow">Acabas de terminar — sesión 5</span>
        <h1>¿Cómo te sientes ahora, {T_USER.firstName}?</h1>
        <p className="post-hero-sub">
          Tómate 30 segundos antes de seguir con el día. Lo que registres ahora le
          ayuda a Marina a empezar mejor la próxima — y a ti, a notar cómo cambias.
        </p>
        <div className="post-feel">
          {T_POST_TAGS.map((t) => (
            <button
              key={t.id}
              className={"post-feel-chip " + (picked.has(t.id) ? "is-on" : "")}
              onClick={() => toggle(t.id)}
              type="button"
            >{t.label}</button>
          ))}
        </div>
      </section>

      {/* Homework */}
      <div className="post-homework">
        <span className="post-homework-eyebrow">Práctica de la semana</span>
        <p className="post-homework-body">{T_POST_HOMEWORK.body}</p>
        <span className="post-homework-from">
          ✦ Sugerido por {T_POST_HOMEWORK.fromTherapist}
        </span>
      </div>

      {/* Sigue creciendo (recos catálogo) */}
      <div>
        <div className="tw-sech">
          <h2 className="tw-sech-h">Sigue creciendo esta semana</h2>
          <a className="tw-sech-link" href="#">Ver todo el catálogo →</a>
        </div>
        <div className="post-recos">
          {T_POST_RECOS.map((r, i) => (
            <article key={i} className="post-reco">
              {r.fromTherapist && <span className="post-reco-flag">✦ De Marina</span>}
              <div className="post-reco-row">
                <span className={"post-reco-cover cover-" + r.cover}></span>
                <div style={{ minWidth: 0 }}>
                  <span className="post-reco-kind">
                    {r.type === "chapter" ? "Capítulo" : r.type === "exercise" ? "Ejercicio · 12 min" : "Audio · 4 min"}
                  </span>
                  <div className="post-reco-title">{r.title}</div>
                  <div className="post-reco-author">{r.author}</div>
                </div>
              </div>
              <div className="post-reco-reason">{r.reason}</div>
              <a className="post-reco-cta" href="#">{r.cta} →</a>
            </article>
          ))}
        </div>
      </div>

      {/* Compartir con terapeuta — el puente con el otro SaaS */}
      <div className="post-share">
        <h3 className="post-share-h">Comparte con Marina antes de la próxima sesión</h3>
        <p className="post-share-sub">
          Tu diario, mood y lecturas son privados — solo se comparten si tú lo activas.
          Marina recibe un resumen breve antes de la próxima sesión, no la información en bruto.
        </p>

        <div className="post-share-row">
          <span className="post-share-row-glyph">✍︎</span>
          <div>
            <div className="post-share-row-label">Diario · esta semana</div>
            <div className="post-share-row-sub">3 entradas — Marina ve solo las que tú marques.</div>
          </div>
          <span
            className={"post-share-toggle " + (shareDiary ? "is-on" : "")}
            onClick={() => setShareDiary(!shareDiary)}
          ></span>
        </div>

        <div className="post-share-row">
          <span className="post-share-row-glyph">◐</span>
          <div>
            <div className="post-share-row-label">Mood diario</div>
            <div className="post-share-row-sub">Gráfico de los últimos 7 días.</div>
          </div>
          <span
            className={"post-share-toggle " + (shareEmotions ? "is-on" : "")}
            onClick={() => setShareEmotions(!shareEmotions)}
          ></span>
        </div>

        <div className="post-share-row">
          <span className="post-share-row-glyph">📖</span>
          <div>
            <div className="post-share-row-label">Capítulos que estoy leyendo</div>
            <div className="post-share-row-sub">"Tristeza no es debilidad" · 34 % de avance.</div>
          </div>
          <span
            className={"post-share-toggle " + (shareReading ? "is-on" : "")}
            onClick={() => setShareReading(!shareReading)}
          ></span>
        </div>

        <div className="post-share-foot">
          <span className="post-share-foot-meta">
            Compartiendo <strong>{[shareDiary, shareEmotions, shareReading].filter(Boolean).length} de 3</strong> · revocas cuando quieras.
          </span>
          <button className="btn-lavender" onClick={() => setTweak("screen", "sessions")}>
            Listo — ir a mis sesiones →
          </button>
        </div>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 8 · SALA DE VIDEOLLAMADA (sesión en vivo)
// ───────────────────────────────────────────────────────────
function ScreenRoom({ setTweak }) {
  const r = window.T_ROOM;
  const [mic, setMic] = React.useState(true);
  const [cam, setCam] = React.useState(true);
  const [notesOpen, setNotesOpen] = React.useState(true);
  const [notes, setNotes] = React.useState("");

  const remaining = r.duration - r.elapsed;
  const elapsedStr = `${String(r.elapsed).padStart(2,"0")}:14`;

  return (
    <div className={"room " + (notesOpen ? "" : "notes-closed")}>
      <header className="room-bar">
        <div className="room-bar-left">
          <Avatar cover={r.cover} initials={r.therapistInitials} size={48}/>
          <div>
            <div className="room-bar-name">{r.therapistName}</div>
            <div className="room-bar-meta">Sesión {r.sessionNum} · {r.duration} min</div>
          </div>
        </div>

        <div className="room-bar-mid">
          <span className="room-bar-mid-dot"></span>
          En sesión · {elapsedStr} · quedan {remaining} min
        </div>

        <div className="room-bar-right">
          <span className="room-bar-quality" title="Conexión buena">
            <span className="room-bar-quality-bars">
              <span className="room-bar-quality-bar b1"></span>
              <span className="room-bar-quality-bar b2"></span>
              <span className="room-bar-quality-bar b3"></span>
              <span className="room-bar-quality-bar b4" style={{ opacity: 0.35 }}></span>
            </span>
            HD
          </span>
          <button
            className="room-ctrl"
            style={{ width: 36, height: 36, fontSize: 14 }}
            onClick={() => setNotesOpen(!notesOpen)}
            title="Notas privadas"
          >✎</button>
        </div>
      </header>

      <div className="room-stage">
        <div className="room-tile">
          <div className="room-tile-initials">{r.therapistInitials}</div>
          <div className="room-tile-name">{r.therapistName}</div>
          <div className="room-tile-mic">🎙</div>
          <div className="room-self">
            <div className="room-self-glyph">A</div>
            <div className="room-self-tag">Tú</div>
          </div>
        </div>
      </div>

      <aside className="room-notes">
        <div className="room-notes-head">
          <div>
            <div className="room-notes-title">Notas privadas</div>
            <div className="room-notes-sub">Solo tú las ves. Marina nunca tiene acceso.</div>
          </div>
          <button
            className="room-ctrl"
            style={{ width: 28, height: 28, fontSize: 11 }}
            onClick={() => setNotesOpen(false)}
            title="Cerrar"
          >×</button>
        </div>

        <div className="room-notes-body">
          <div className="room-notes-intention">
            <div className="room-notes-intention-lbl">Tu intención de hoy</div>
            {r.intention}
          </div>

          <textarea
            className="room-notes-input"
            placeholder="Escribe lo que quieras recordar — una palabra basta…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div style={{ font: "700 9.5px/1 var(--font-sans)", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginTop: 8 }}>
            Sugerencias
          </div>
          <div className="room-notes-hints">
            {window.T_ROOM_NOTES_HINTS.map((h, i) => (
              <button key={i} className="room-notes-hint" type="button"
                onClick={() => setNotes((n) => n + (n ? "\n\n" : "") + h + ": ")}>
                {h}
              </button>
            ))}
          </div>
        </div>

        <div className="room-notes-foot">
          🔒 Tus notas se guardan automáticamente en tu diario, marcadas como privadas.
        </div>
      </aside>

      <div className="room-controls">
        <button className={"room-ctrl " + (mic ? "" : "is-off")} onClick={() => setMic(!mic)} title="Micrófono">
          {mic ? "🎙" : "🚫"}
        </button>
        <button className={"room-ctrl " + (cam ? "" : "is-off")} onClick={() => setCam(!cam)} title="Cámara">
          {cam ? "📹" : "🚫"}
        </button>
        <button className="room-ctrl" title="Compartir pantalla">⇧</button>
        <button className="room-ctrl" title="Chat">💬</button>
        <div className="room-ctrl-sep"></div>
        <button
          className={"room-ctrl " + (notesOpen ? "is-on" : "")}
          onClick={() => setNotesOpen(!notesOpen)}
          title="Notas privadas"
        >✎</button>
        <div className="room-ctrl-sep"></div>
        <button className="room-ctrl end" onClick={() => setTweak("screen", "post")}>
          ⏻ Terminar sesión
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 9 · ONBOARDING TERAPÉUTICO
// ───────────────────────────────────────────────────────────
function ScreenOnboarding({ setTweak }) {
  const steps = window.T_ONBOARD_STEPS;
  const [stepIdx, setStepIdx] = React.useState(0);
  const [answers, setAnswers] = React.useState({
    etapa: "first",
    salud: "no",
    urgencia: new Set(["nada"]),
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
  const setPref = (id, value) => setAnswers((a) => ({
    ...a, preferencias: { ...a.preferencias, [id]: value }
  }));

  const showUrgent = s.id === "urgencia" && [...(answers.urgencia || [])].some((x) => x !== "nada");

  return (
    <div className="onb-wrap">
      <div className="onb-progress">
        {steps.map((_, i) => (
          <span key={i} className={"onb-progress-step " + (i < stepIdx ? "is-done " : i === stepIdx ? "is-on" : "")}/>
        ))}
      </div>

      <div>
        <span className={"onb-eyebrow " + (s.id === "urgencia" ? "warn" : "")}>{s.eyebrow}</span>
        <h1 className="onb-title">{s.title}</h1>
        <p className="onb-sub">{s.sub}</p>
      </div>

      {s.kind === "choice" && (
        <div className="onb-choices">
          {s.options.map((o) => (
            <button key={o.id} className={"onb-choice " + (answers[s.id] === o.id ? "is-on" : "")}
              onClick={() => setSingle(o.id)} type="button">
              <span className="onb-radio"></span>
              <div className="onb-choice-meta">
                <div className="onb-choice-label">{o.label}</div>
                {o.sub && <div className="onb-choice-sub">{o.sub}</div>}
              </div>
            </button>
          ))}
        </div>
      )}

      {s.kind === "multi" && (
        <>
          <div className="onb-choices">
            {s.options.map((o) => {
              const on = (answers[s.id] || new Set()).has(o.id);
              return (
                <button key={o.id} className={"onb-choice urgent " + (on ? "is-on" : "")}
                  onClick={() => toggleMulti(o.id)} type="button">
                  <span className="onb-radio onb-checkbox"></span>
                  <div className="onb-choice-meta">
                    <div className="onb-choice-label">{o.label}</div>
                    {o.sub && <div className="onb-choice-sub">{o.sub}</div>}
                  </div>
                </button>
              );
            })}
          </div>
          {showUrgent && (
            <div className="onb-urgent-banner">
              <span className="onb-urgent-glyph">!</span>
              <div>
                <div className="onb-urgent-title">Gracias por contarnos</div>
                <div className="onb-urgent-body">
                  Lo que marcaste es importante. Te asignaremos una primera sesión en las
                  próximas 48 h con un terapeuta de guardia. Mientras tanto, puedes ver{" "}
                  <a href="#" onClick={(e) => { e.preventDefault(); setTweak("screen", "crisis"); }}>
                    líneas de apoyo inmediato
                  </a>.
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {s.kind === "preferences" && (
        <div className="onb-prefs">
          {s.options.map((o) => (
            <div key={o.id} className="onb-pref">
              <div className="onb-pref-label">{o.label}</div>
              <select value={answers.preferencias[o.id]} onChange={(e) => setPref(o.id, e.target.value)}>
                {o.options.map((opt) => <option key={opt}>{opt}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      <div className="bk-foot" style={{ marginTop: 16, borderTop: "1.5px solid var(--color-warm-200)" }}>
        <button className="bk-foot-back" onClick={() => stepIdx === 0 ? setTweak("screen", "hub") : setStepIdx(stepIdx - 1)}>
          ← {stepIdx === 0 ? "Volver al hub" : "Paso anterior"}
        </button>
        <button className="btn-sage" onClick={() => isLast ? setTweak("screen", "match") : setStepIdx(stepIdx + 1)}>
          {isLast ? "Ver terapeutas sugeridos →" : "Continuar →"}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 10 · CRISIS — apoyo inmediato
// ───────────────────────────────────────────────────────────
function ScreenCrisis({ setTweak }) {
  const lines = window.T_CRISIS_LINES;
  const [country, setCountry] = React.useState(lines.find((l) => l.isUser).country);
  const active = lines.find((l) => l.country === country);

  return (
    <div className="crisis-wrap">
      <section className="crisis-hero">
        <span className="crisis-hero-eyebrow">▲ Apoyo inmediato</span>
        <h1>Estás aquí. Eso ya es algo.</h1>
        <p>
          Si te sientes en peligro o necesitas hablar con alguien <strong>ahora</strong>,
          estos canales atienden gratis y en español. No tienes que estar en crisis para llamar —
          basta con que no quieras estar sole.
        </p>
      </section>

      <div>
        <div className="crisis-section-h">Líneas de ayuda · 24 / 7</div>
        <div className="crisis-country-tabs" style={{ marginBottom: 12 }}>
          {lines.map((l) => (
            <button key={l.country}
              className={"crisis-country-tab " + (country === l.country ? "is-on" : "")}
              onClick={() => setCountry(l.country)}>
              <span>{l.flag}</span> {l.country}
              {l.isUser && <span className="tw-pill sage" style={{ padding: "2px 7px", fontSize: 9.5 }}>Tu país</span>}
            </button>
          ))}
        </div>

        <div className="crisis-lines">
          {active.lines.map((line) => (
            <div key={line.phone} className={"crisis-line " + (line.kind === "emergency" ? "is-emergency" : "")}>
              <span className="crisis-line-flag">{active.flag}</span>
              <div>
                <div className="crisis-line-name">{line.name}</div>
                <div className="crisis-line-hours">{line.hours}</div>
              </div>
              <div className="crisis-line-phone">{line.phone}</div>
              <button className="crisis-line-cta">Llamar →</button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="crisis-section-h">Mientras llamas — vuelve al ahora</div>
        <div className="crisis-ground">
          {window.T_CRISIS_GROUNDING.map((g, i) => (
            <button key={i} className="crisis-ground-card" type="button">
              <div className="crisis-ground-card-glyph">{g.glyph}</div>
              <div className="crisis-ground-card-title">{g.title}</div>
              <div className="crisis-ground-card-sub">{g.sub}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="crisis-section-h">¿Prefieres hablar con tu terapeuta?</div>
        <div className="crisis-next" style={{ marginBottom: 8 }}>
          <div>
            <div className="crisis-next-label">Marina · próxima cita en 2 días</div>
            <div className="crisis-next-sub">Le pedimos a Marina que te adelante a hoy a las 19:00.</div>
          </div>
          <button className="btn-lavender">Adelantar a hoy →</button>
        </div>
        <div className="crisis-next">
          <div>
            <div className="crisis-next-label">Chat con terapeuta de guardia · 1–5 min</div>
            <div className="crisis-next-sub">Disponible 24/7 para suscriptores Pro.</div>
          </div>
          <button className="btn-sage">Conectar ahora →</button>
        </div>
      </div>

      <div className="crisis-foot">
        <strong>Confidencialidad:</strong> Psico Platform no comparte tu uso de esta página
        con nadie — ni con tu terapeuta, ni con tu empleador si tienes plan corporativo.
        Si alguien más usa esta cuenta y necesita ayuda, hay un{" "}
        <a href="#" style={{ color: "var(--color-lavender-700)", fontWeight: 700 }}>botón de salida rápida (Esc Esc)</a> que limpia el historial al cerrar.
      </div>

      <div className="bk-foot" style={{ marginTop: 0, borderTop: "none" }}>
        <button className="bk-foot-back" onClick={() => setTweak("screen", "hub")}>
          ← Volver
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 11 · MATCHING ASISTIDO
// ───────────────────────────────────────────────────────────
function ScreenMatch({ setTweak }) {
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
      <div className="mat-wrap">
        <div>
          <span className="onb-eyebrow">✦ Tu coincidencia</span>
          <h1 className="mat-results-h">Estos tres encajan con lo que nos contaste.</h1>
          <p className="mat-results-sub">
            El ranking se basa en especialidad, estilo, disponibilidad real y precio.
            Cualquiera puede ser una buena primera elección — y siempre puedes cambiar sin costo.
          </p>
        </div>

        {window.T_MATCH_RESULTS.map((r, i) => {
          const t = window.T_THERAPISTS.find((x) => x.id === r.therapistId);
          return (
            <article key={r.therapistId} className={"mat-result-card " + (i === 0 ? "is-top" : "")}>
              {i === 0 && <span className="mat-result-flag">★ Mejor coincidencia</span>}
              <Avatar cover={t.cover} initials={t.initials} size={72}/>
              <div className="mat-result-head">
                <div className="mat-result-name">{t.name}</div>
                <div className="mat-result-meta">{t.title} · {t.pais} · ★ {t.rating} ({t.reviews})</div>
                <ul className="mat-result-reasons">
                  {r.matchReasons.map((reason, j) => <li key={j}>{reason}</li>)}
                </ul>
                {r.mismatch && <div className="mat-result-mismatch">{r.mismatch}</div>}
              </div>
              <div className="mat-result-aside">
                <div className="mat-result-score">{r.score}<small>match</small></div>
                <div style={{ font: "700 16px/1 var(--font-sans)", color: "var(--color-warm-900)" }}>${t.price}<small style={{ font: "500 11px/1 var(--font-sans)", color: "var(--color-warm-500)", marginLeft: 3 }}>USD</small></div>
                <button className="btn-sage" onClick={() => setTweak("screen", "prof")}>Ver perfil →</button>
                <button className="btn-soft" onClick={() => setTweak("screen", "book")}>Reservar</button>
              </div>
            </article>
          );
        })}

        <div className="bk-foot" style={{ marginTop: 0, borderTop: "none" }}>
          <button className="bk-foot-back" onClick={() => { setShowResults(false); setStepIdx(0); }}>
            ← Cambiar mis respuestas
          </button>
          <button className="btn-outline" onClick={() => setTweak("screen", "dir")}>
            Ver todo el directorio →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mat-wrap">
      <div className="mat-progress">
        <span className="mat-progress-step">Pregunta {stepIdx + 1} de {questions.length}</span>
        <div className="mat-progress-bar"><div className="mat-progress-bar-fill" style={{ width: pct + "%" }}/></div>
      </div>

      <div>
        <h1 className="mat-q-title">{q.title}</h1>
        <p className="mat-q-sub">{q.sub}</p>
      </div>

      <div className="mat-options">
        {q.options.map((o) => (
          <button key={o.id} className={"mat-option " + (answers[q.id] === o.id ? "is-on" : "")}
            onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))} type="button">
            {o.glyph && <span className="mat-option-glyph">{o.glyph}</span>}
            <div style={{ minWidth: 0 }}>
              <div className="mat-option-label">{o.label}</div>
              {o.sub && <div className="mat-option-sub">{o.sub}</div>}
            </div>
          </button>
        ))}
      </div>

      <div className="bk-foot" style={{ marginTop: 0, borderTop: "none" }}>
        <button className="bk-foot-back" onClick={() => stepIdx === 0 ? setTweak("screen", "hub") : setStepIdx(stepIdx - 1)}>
          ← {stepIdx === 0 ? "Volver al hub" : "Pregunta anterior"}
        </button>
        <button className="btn-sage" onClick={() => isLast ? setShowResults(true) : setStepIdx(stepIdx + 1)}>
          {isLast ? "Ver mis 3 coincidencias →" : "Continuar →"}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 12 · PROGRESO LONGITUDINAL (Tu camino)
// ───────────────────────────────────────────────────────────
function ScreenProgress() {
  const p = window.T_PROGRESS;
  const max = Math.max(...p.moodWeeks.map((w) => w.mood));

  return (
    <>
      <section className="pg-hero">
        <span className="pg-hero-eyebrow">Tu camino · {p.monthsActive} meses contigo</span>
        <h1>Has venido sosteniendo el espacio — y se nota.</h1>
        <p className="pg-hero-sub">
          Empezaste el {p.startedAt}. Lo que viene es lo que la plataforma ve de ti — no
          un diagnóstico, sino una foto de tu propio compromiso.
        </p>
        <div className="pg-stats">
          <div className="pg-stat">
            <div className="pg-stat-val">{p.totalSessions}<small>sesiones</small></div>
            <div className="pg-stat-lbl">Con Marina</div>
          </div>
          <div className="pg-stat">
            <div className="pg-stat-val">{p.diaryDays}<small>días</small></div>
            <div className="pg-stat-lbl">De diario</div>
          </div>
          <div className="pg-stat">
            <div className="pg-stat-val">{p.chaptersDone}<small>libros</small></div>
            <div className="pg-stat-lbl">Terminados</div>
          </div>
          <div className="pg-stat">
            <div className="pg-stat-val">{p.exercisesDone}<small>veces</small></div>
            <div className="pg-stat-lbl">Ejercicios</div>
          </div>
        </div>
      </section>

      <div className="pg-chart">
        <header className="pg-chart-head">
          <div>
            <div className="pg-chart-h">Cómo te has sentido — 17 semanas</div>
            <div className="pg-chart-sub" style={{ marginTop: 4 }}>
              Una barra por semana · más alta = más liviana
            </div>
          </div>
          <span className="pg-chart-sub">Hace 4 meses · → hoy</span>
        </header>

        <div className="pg-chart-canvas">
          <div className="pg-chart-bars">
            {p.moodWeeks.map((w, i) => (
              <div
                key={i}
                className={
                  "pg-chart-bar " +
                  (w.sessions > 0 ? "has-session " : "") +
                  (w.isNow ? "is-now" : "")
                }
                style={{ height: `${(w.mood / max) * 100}%` }}
                title={`${w.week} · estado ${w.mood}${w.note ? " · " + w.note : ""}`}
              />
            ))}
          </div>
        </div>

        <div className="pg-chart-axis">
          {p.moodWeeks.map((w, i) => (
            <span key={i} style={{ visibility: i % 4 === 0 || w.isNow ? "visible" : "hidden" }}>
              {w.isNow ? "hoy" : w.week}
            </span>
          ))}
        </div>

        <div className="pg-chart-legend">
          <span className="pg-chart-legend-item">
            <span className="pg-chart-legend-mood"></span>
            Estado de la semana
          </span>
          <span className="pg-chart-legend-item">
            <span className="pg-chart-legend-session"></span>
            Sesión esa semana
          </span>
        </div>
      </div>

      <div>
        <div className="tw-sech">
          <h2 className="tw-sech-h">Antes vs. ahora</h2>
        </div>
        <div className="pg-comp">
          {p.comparisons.map((c) => (
            <div key={c.metric} className="pg-comp-card">
              <div className="pg-comp-lbl">{c.metric}</div>
              <div className="pg-comp-row">
                <div className="pg-comp-cell">
                  <div className="pg-comp-cell-when">Hace 4 meses</div>
                  <div className="pg-comp-cell-val">{c.before}</div>
                </div>
                <div className={"pg-comp-arrow " + c.direction}>→</div>
                <div className="pg-comp-cell">
                  <div className="pg-comp-cell-when">Esta semana</div>
                  <div className="pg-comp-cell-val after">{c.after}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="tw-sech">
          <h2 className="tw-sech-h">Temas que han aparecido en sesión</h2>
          <span className="tw-sech-link" style={{ color: "var(--color-warm-500)", cursor: "default" }}>
            Marina los marca · no eres tú quien escribe esto
          </span>
        </div>
        <div className="pg-themes">
          {p.themes.map((t) => (
            <span key={t.label} className="pg-theme">
              {t.label}
              <span className="pg-theme-count">×{t.count}</span>
              <span className={"pg-theme-trend " + t.trend}>
                {t.trend === "active" ? "Activo" :
                 t.trend === "fading" ? "Bajando" :
                 t.trend === "resolved" ? "Cerrado" : "Emerge"}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="tw-sech">
          <h2 className="tw-sech-h">Hitos de tu camino</h2>
        </div>
        <div className="pg-milestones">
          {p.milestones.map((m, i) => (
            <div key={i} className="pg-milestone">
              <div className="pg-milestone-date">{m.date}</div>
              <div className="pg-milestone-dot">{m.glyph}</div>
              <div>
                <div className="pg-milestone-title">{m.title}</div>
                <div className="pg-milestone-sub">{m.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 13 · NOTIFICACIONES
// ───────────────────────────────────────────────────────────
function ScreenNotifs({ setTweak }) {
  const all = window.T_NOTIFS;
  const kinds = window.T_NOTIF_KINDS;
  const [filter, setFilter] = React.useState("all");
  const list = filter === "all" ? all : all.filter((n) => n.kind === filter);
  const unread = all.filter((n) => n.unread).length;

  const tabs = [
    { id: "all", label: "Todo", count: all.length },
    ...Object.entries(kinds).map(([id, meta]) => ({
      id, label: meta.label, count: all.filter((n) => n.kind === id).length,
    })),
  ];

  return (
    <>
      <div>
        <span className="tw-eyebrow">{unread} sin leer · 7 días</span>
        <h1 style={{ font: "700 28px/1.15 var(--font-sans)", letterSpacing: "-0.02em", color: "var(--color-warm-900)", margin: "8px 0 4px" }}>
          Tu actividad
        </h1>
        <p style={{ font: "400 14px/1.55 var(--font-sans)", color: "var(--color-warm-600)", margin: 0, maxWidth: "56ch" }}>
          Sesiones, mensajes de Marina, hitos y cobros. Configura cada categoría desde tu perfil.
        </p>
      </div>

      <div className="notif-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={"notif-tab " + (filter === t.id ? "is-on" : "")}
            onClick={() => setFilter(t.id)}
            type="button"
          >
            {t.label} <span className="notif-tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="notif-list">
        {list.map((n) => {
          const meta = kinds[n.kind] || {};
          return (
            <article
              key={n.id}
              className={"notif-row " + (n.unread ? "is-unread" : "")}
              onClick={() => n.actionScreen && setTweak("screen", n.actionScreen)}
            >
              <span className={"notif-icon " + (meta.color || "warm")}>{n.icon}</span>
              <span className="notif-when">{n.when}</span>
              <div className="notif-meta">
                <div className="notif-title">{n.title}</div>
                <div className="notif-body">{n.body}</div>
              </div>
              {n.actionLabel && (
                <button className="notif-action" onClick={(e) => { e.stopPropagation(); n.actionScreen && setTweak("screen", n.actionScreen); }}>
                  {n.actionLabel} →
                </button>
              )}
            </article>
          );
        })}
      </div>

      <div className="notif-foot">
        <span>{unread > 0 ? `${unread} sin leer` : "Estás al día — nada nuevo."}</span>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn-ghost">Marcar todo como leído</button>
          <button className="btn-outline">Configurar avisos</button>
        </div>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 14 · RECETAS — Mi camino con Marina
// ───────────────────────────────────────────────────────────
function ScreenPrescriptions({ setTweak }) {
  const all = window.T_PRESCRIPTIONS;
  const allItems = all.flatMap((s) => s.items);
  const counts = {
    active: allItems.filter((i) => i.state === "active" || i.state === "in-progress").length,
    done: allItems.filter((i) => i.state === "done").length,
    total: allItems.length,
  };
  const t = window.T_THERAPISTS[0];

  return (
    <>
      <section className="rx-hero">
        <Avatar cover={t.cover} initials={t.initials} size={56}/>
        <div>
          <h1>Lo que Marina te ha sugerido</h1>
          <p className="rx-hero-sub">
            Lecturas, ejercicios y prácticas que han salido de tus sesiones — organizadas en orden.
            Lo que abras desde aquí se guarda automáticamente como "de tu terapeuta".
          </p>
        </div>
      </section>

      <div className="rx-summary">
        <div className="rx-summary-cell">
          <div className="rx-summary-val">{counts.total}</div>
          <div className="rx-summary-lbl">Sugerencias</div>
        </div>
        <div className="rx-summary-cell">
          <div className="rx-summary-val" style={{ color: "var(--color-lavender-700)" }}>{counts.active}</div>
          <div className="rx-summary-lbl">En curso</div>
        </div>
        <div className="rx-summary-cell">
          <div className="rx-summary-val" style={{ color: "var(--color-sage-700)" }}>{counts.done}</div>
          <div className="rx-summary-lbl">Terminadas</div>
        </div>
        <div className="rx-summary-cell">
          <div className="rx-summary-val">{all.length}</div>
          <div className="rx-summary-lbl">Sesiones</div>
        </div>
      </div>

      {all.map((s, sidx) => (
        <div key={s.sessionNum} className="rx-session">
          <header className="rx-session-head">
            <span className="rx-session-num">Sesión {s.sessionNum}</span>
            <span className="rx-session-date">{s.sessionDate} · {sidx === 0 ? "más reciente" : "antes"}</span>
          </header>
          <div className="rx-items">
            {s.items.map((it, ii) => (
              <article key={ii} className={"rx-item " + (it.state === "done" ? "is-done" : "")}>
                {it.cover
                  ? <span className={"rx-item-cover cover-" + it.cover}></span>
                  : <span className="rx-item-cover placeholder">
                      {it.type === "practice" ? "◐" : it.type === "ritual" ? "✓" : "◌"}
                    </span>
                }
                <div className="rx-item-meta">
                  <span className="rx-item-kind">
                    {it.type === "chapter" ? "Capítulo" :
                     it.type === "book" ? "Libro" :
                     it.type === "exercise" ? "Ejercicio guiado" :
                     it.type === "practice" ? "Práctica" :
                     it.type === "ritual" ? "Ritual diario" : "Recurso"}
                  </span>
                  <div className="rx-item-title">{it.title}</div>
                  <div className="rx-item-author">{it.author}</div>
                  {it.marinaNote && <div className="rx-item-marina">{it.marinaNote}</div>}
                </div>
                <div className="rx-item-aside">
                  <span className={"rx-item-state " + it.state}>
                    {it.state === "active" ? "Activo" :
                     it.state === "in-progress" ? "En curso" : "Terminado"}
                  </span>
                  {typeof it.progress === "number" && (
                    <>
                      <div className="rx-item-progress">
                        <div className={"rx-item-progress-fill " + (it.state === "done" ? "done" : "")} style={{ width: `${it.progress * 100}%` }}/>
                      </div>
                      <span className="rx-item-times">{Math.round(it.progress * 100)} %</span>
                    </>
                  )}
                  {typeof it.completedTimes === "number" && (
                    <span className="rx-item-times">×{it.completedTimes} veces</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 15 · CANCELAR / REAGENDAR
// ───────────────────────────────────────────────────────────
function ScreenCancel({ setTweak }) {
  const s = window.T_NEXT_SESSION;
  const t = window.T_THERAPISTS[0];
  const pol = window.T_CANCEL_POLICY;

  const [action, setAction] = React.useState(null); // "reschedule" | "cancel" | "pause"
  const [reason, setReason] = React.useState(null);
  const [altDay, setAltDay] = React.useState(0);
  const [altTime, setAltTime] = React.useState(0);

  const day = window.T_WEEK[altDay] || window.T_WEEK[0];

  return (
    <div className="cn-wrap">
      {/* Session summary */}
      <div className="cn-session-card">
        <Avatar cover={s.cover} initials={s.therapistInitials} size={48}/>
        <div>
          <div className="cn-session-meta-h">Sesión 5 con {s.therapistName}</div>
          <div className="cn-session-meta-sub">{s.modalidad} · {s.duration} min · {s.dateLabel}</div>
        </div>
        <div className="cn-session-when">
          <strong>{s.time}</strong>
          en {s.timeUntil}
        </div>
      </div>

      {!action && (
        <div className="cn-card">
          <h2 className="cn-card-h">¿Qué necesitas hacer?</h2>
          <p className="cn-card-sub">Cancelar no es un fracaso. Pausar a veces es lo que sigue.</p>

          <div className="cn-actions" style={{ marginTop: 18 }}>
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

          <div className="cn-foot" style={{ marginTop: 18 }}>
            <span className="cn-foot-msg">Sigue siendo tu espacio — siempre puedes volver al directorio.</span>
            <button className="btn-soft" onClick={() => setTweak("screen", "sessions")}>← Volver</button>
          </div>
        </div>
      )}

      {action === "reschedule" && (
        <div className="cn-card">
          <h2 className="cn-card-h">¿Cuándo te queda mejor?</h2>
          <p className="cn-card-sub">Marina tiene estos huecos abiertos esta semana. La sesión se mueve, no se cobra de nuevo.</p>

          <div className="cn-policy" style={{ marginTop: 14 }}>
            <span className="cn-policy-glyph">✓</span>
            <div>
              <div className="cn-policy-title">Reagendar es gratis siempre.</div>
              <div className="cn-policy-body">El cargo se aplica a la nueva fecha.</div>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ font: "700 11px/1 var(--font-sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-warm-500)", marginBottom: 10 }}>
              Días disponibles
            </div>
            <div className="bk-cal-week">
              {window.T_WEEK.map((d, i) => (
                <button
                  key={i}
                  className={"bk-cal-day " +
                    (d.slots.length === 0 ? "is-empty " : "") +
                    (i === altDay ? "is-on" : "")}
                  onClick={() => d.slots.length && setAltDay(i)}
                  type="button"
                >
                  <div className="bk-cal-day-w">{d.day}</div>
                  <div className="bk-cal-day-d">{d.date}</div>
                  {d.slots.length > 0 && <span className="bk-cal-day-dot"></span>}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ font: "700 11px/1 var(--font-sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-warm-500)", marginBottom: 10 }}>
              Huecos del {day.label.toLowerCase()}
            </div>
            <div className="cn-alt-slots">
              {day.slots.slice(0, 6).map((slot, i) => (
                <button
                  key={slot}
                  className={"cn-alt-slot " + (i === altTime ? "is-on" : "")}
                  onClick={() => setAltTime(i)}
                  type="button"
                >
                  <div className="cn-alt-slot-day">{day.day} {day.date} {day.month}</div>
                  <div className="cn-alt-slot-time">{slot}</div>
                  <div className="cn-alt-slot-meta">{t.duration} min · video</div>
                </button>
              ))}
            </div>
          </div>

          <div className="cn-foot" style={{ marginTop: 22 }}>
            <button className="btn-ghost" onClick={() => setAction(null)}>← Volver</button>
            <button className="btn-sage" onClick={() => setTweak("screen", "sessions")}>
              Confirmar — mover a {day.day} {day.date} a las {day.slots[altTime] || day.slots[0]} →
            </button>
          </div>
        </div>
      )}

      {action === "cancel" && (
        <div className="cn-card">
          <h2 className="cn-card-h">¿Qué pasó esta semana?</h2>
          <p className="cn-card-sub">
            Es opcional. Pero si nos cuentas, Marina lo recibe como una nota antes de la próxima — y no te lo preguntará si no quieres hablarlo.
          </p>

          <div className="cn-reasons" style={{ marginTop: 16 }}>
            {window.T_CANCEL_REASONS.map((r) => (
              <button
                key={r.id}
                className={"cn-reason " + (reason === r.id ? "is-on" : "")}
                onClick={() => setReason(r.id)}
                type="button"
              >
                <span className="cn-reason-radio"></span>
                <div>
                  <div className="cn-reason-label">{r.label}</div>
                  {r.sub && <div className="cn-reason-sub">{r.sub}</div>}
                </div>
              </button>
            ))}
          </div>

          <div className={"cn-policy " + (pol.outsideWindow ? "warning" : "")} style={{ marginTop: 16 }}>
            <span className="cn-policy-glyph">{pol.outsideWindow ? "!" : "✓"}</span>
            <div>
              <div className="cn-policy-title">
                {pol.outsideWindow ? "Se cobra el 50 % por cancelación tardía" : "Cancelación sin costo"}
              </div>
              <div className="cn-policy-body">{pol.context}</div>
            </div>
          </div>

          <div className="cn-foot" style={{ marginTop: 22 }}>
            <button className="btn-ghost" onClick={() => setAction(null)}>← No cancelar</button>
            <button
              className="btn-destructive solid"
              onClick={() => setTweak("screen", "sessions")}
              disabled={!reason}
            >
              Cancelar esta sesión
            </button>
          </div>
        </div>
      )}

      {action === "pause" && (
        <div className="cn-card">
          <h2 className="cn-card-h">Pausar tiene su propio ritmo.</h2>
          <p className="cn-card-sub">
            Te sugerimos hablarlo con Marina antes de cerrar — incluso una sesión breve de cierre
            suele cambiar cómo se queda esto contigo. No hay costo extra.
          </p>

          <div className="cn-actions" style={{ marginTop: 18, gridTemplateColumns: "1fr 1fr" }}>
            <button className="cn-action" onClick={() => setTweak("screen", "sessions")} type="button">
              <div className="cn-action-glyph">💬</div>
              <div className="cn-action-title">Reservar sesión de cierre</div>
              <div className="cn-action-sub">Una conversación corta — sin costo extra dentro del Pro.</div>
            </button>
            <button className="cn-action" onClick={() => setTweak("screen", "sessions")} type="button">
              <div className="cn-action-glyph">⏸</div>
              <div className="cn-action-title">Pausar sin cierre</div>
              <div className="cn-action-sub">Marina recibe un aviso. Volves cuando quieras.</div>
            </button>
          </div>

          <div className="cn-foot" style={{ marginTop: 22 }}>
            <button className="btn-ghost" onClick={() => setAction(null)}>← Volver</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// MonthView — utilizado en booking step 2
// ───────────────────────────────────────────────────────────
function MonthView({ selectedDate, onPick }) {
  const m = window.T_MONTH;
  const weekdays = ["L", "M", "M", "J", "V", "S", "D"];

  // Build a grid of 7 cols * N rows. startsOnDay = 4 (Friday on lun-base)
  const totalCells = m.startsOnDay + m.daysInMonth;
  const rows = Math.ceil(totalCells / 7);
  const cells = [];
  for (let i = 0; i < rows * 7; i++) {
    const date = i - m.startsOnDay + 1;
    if (date < 1 || date > m.daysInMonth) {
      cells.push({ empty: true });
    } else {
      const slots = m.availability[date] || 0;
      cells.push({
        date,
        slots,
        isToday: date === m.todayDate,
        isWeekend: m.weekendsBy1Idx.has(date),
      });
    }
  }

  return (
    <div className="bk-month">
      <div className="bk-month-h">
        <div className="bk-month-title">{m.monthLabel}</div>
        <div className="bk-month-nav">
          <button className="bk-month-nav-btn" type="button">‹</button>
          <button className="bk-month-nav-btn" type="button">›</button>
        </div>
      </div>

      <div className="bk-month-grid">
        {weekdays.map((d, i) => <div key={i} className="bk-month-wday">{d}</div>)}
        {cells.map((c, i) => {
          if (c.empty) return <div key={i} className="bk-month-cell is-empty"></div>;
          const noSlots = c.slots === 0;
          return (
            <button
              key={i}
              className={
                "bk-month-cell " +
                (noSlots ? "no-slots " : "has-slots ") +
                (c.isWeekend ? "is-weekend " : "") +
                (c.isToday ? "is-today " : "") +
                (selectedDate === c.date ? "is-on" : "")
              }
              onClick={() => !noSlots && onPick(c.date)}
              type="button"
              title={noSlots ? "Sin huecos" : `${c.slots} huecos · ${c.date}`}
            >
              {c.date}
              {!noSlots && (
                <span className="bk-month-cell-availability">
                  {[...Array(Math.min(3, c.slots))].map((_, j) => (
                    <span key={j} className="bk-month-cell-dot"></span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="bk-month-legend">
        <span className="bk-month-legend-item">
          <span className="bk-month-cell-dot" style={{ background: "var(--color-sage-500)" }}></span>
          Con disponibilidad
        </span>
        <span className="bk-month-legend-item">
          <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--color-lavender-50)", border: "1.5px solid var(--color-lavender-300)" }}></span>
          Hoy
        </span>
        <span className="bk-month-legend-item">
          <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--color-warm-100)" }}></span>
          Fin de semana
        </span>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 16 · VISTA TERAPEUTA (dashboard de Marina)
// ───────────────────────────────────────────────────────────
function ScreenTherapist({ setTweak }) {
  const u = window.T_TX_USER;
  const today = window.T_TX_TODAY;
  const patients = window.T_TX_PATIENTS;
  const inbox = window.T_TX_INBOX;
  const load = window.T_TX_LOAD;
  const next = today.find((s) => s.state === "next");
  const I = window.Icons;
  const sideItems = [
    { glyph: <I.home     />, label: "Hoy",          on: true },
    { glyph: <I.people   />, label: "Pacientes" },
    { glyph: <I.calendar />, label: "Calendario" },
    { glyph: <I.diary    />, label: "Notas" },
    { glyph: <I.inbox    />, label: "Intakes" },
    { glyph: <I.plan     />, label: "Cobros" },
    { glyph: <I.settings />, label: "Cuenta" },
  ];

  return (
    <div className="tx-shell">
      <aside className="tx-side">
        <div className="tx-side-head">
          <div className="tx-side-wordmark">Psico Platform</div>
          <span className="tx-side-role">✦ Terapeuta</span>
        </div>
        <nav className="tx-side-nav">
          {sideItems.map((i) => (
            <a key={i.label} className={"tx-side-link " + (i.on ? "is-on" : "")} href="#">
              <span className="tx-side-link-glyph">{i.glyph}</span>
              {i.label}
            </a>
          ))}
        </nav>
        <div className="tx-side-foot">
          <div className="tx-side-foot-card">
            <span className="tx-side-foot-avatar">{u.initials}</span>
            <div style={{ minWidth: 0 }}>
              <div className="tx-side-foot-name">{u.firstName} {u.lastName}</div>
              <div className="tx-side-foot-meta">Cédula · {window.T_THERAPISTS[0].licencia}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="tx-main">
        <header className="tx-top">
          <div>
            <div className="tx-top-title">Hoy, martes 20 de mayo</div>
            <div className="tx-top-sub">{today.length} sesiones agendadas · {today.filter((s) => s.state === "done").length} completadas</div>
          </div>
          <div className="tx-top-actions">
            <button className="btn-outline">Bloquear hueco</button>
            <button className="btn-sage">Empezar próxima sesión →</button>
          </div>
        </header>

        <div className="tx-page">
          <div className="tx-page-inner">
            <div className="tx-col">
              {/* Greeting */}
              <section className="tx-greet">
                <span className="tx-greet-eyebrow">Buenos días, Marina ☀</span>
                <h1>Ana llega a las 19:00 — y trae 3 entradas del diario contigo.</h1>
                <p className="tx-greet-sub">
                  Camila pidió mover la suya. Un paciente nuevo (Tomás) marcó ansiedad y sueño en su intake.
                  Tienes 16:30 h trabajadas esta semana — vas en ritmo.
                </p>
              </section>

              {/* Today timeline */}
              <div>
                <div className="tx-day-h">
                  <div className="tx-day-h-title">Sesiones de hoy</div>
                  <div className="tx-day-h-meta">{today.length} · zona horaria Quito (GMT-5)</div>
                </div>
                <div className="tx-day-list">
                  {today.map((s, i) => (
                    <div key={i} className={"tx-day-row is-" + s.state}>
                      <div className="tx-day-time">
                        {s.time}
                        <small>{s.endTime}</small>
                      </div>
                      <div className="tx-day-rail">
                        <div className="tx-day-rail-dot"></div>
                      </div>
                      <Avatar cover={s.cover} initials={s.initials} size={48}/>
                      <div className="tx-day-meta">
                        <div className="tx-day-name">
                          {s.patientName}
                          {s.flag === "new" && <span className="tx-day-flag">Nuevo paciente</span>}
                        </div>
                        <div className="tx-day-label">{s.sessionLabel}</div>
                        {s.state === "done" && s.note && (
                          <div className="tx-day-note">"{s.note}"</div>
                        )}
                        {s.state === "next" && (
                          <>
                            <div className="tx-day-note">"{s.intention}"</div>
                            <div className="tx-day-share">Compartió: {s.sharedItems.join(" · ")}</div>
                          </>
                        )}
                      </div>
                      <button className="tx-day-act" onClick={() => s.state === "next" && setTweak("screen", "room")}>
                        {s.state === "next" ? "Entrar a la sala →" :
                         s.state === "done" ? "Ver notas" : "Preparar"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Patient table */}
              <div>
                <div className="tx-patients-h">
                  <div className="tx-patients-h-title">Tus pacientes activos · {patients.length}</div>
                  <a href="#" style={{ font: "600 12px/1 var(--font-sans)", color: "var(--color-lavender-700)", textDecoration: "none" }}>
                    Ver todos →
                  </a>
                </div>
                <div className="tx-patients-list">
                  {patients.map((p) => (
                    <div key={p.id} className="tx-patient">
                      <Avatar cover={p.cover} initials={p.initials} size={48}/>
                      <div style={{ minWidth: 0 }}>
                        <div className="tx-patient-name">{p.name}</div>
                        <div className="tx-patient-note">{p.note}</div>
                      </div>
                      <div className="tx-patient-meta">
                        <strong>{p.sessionsTotal} ses.</strong>
                        {p.freq}
                      </div>
                      <div className="tx-patient-meta">
                        <strong>{p.lastSeen}</strong>
                        Última vez
                      </div>
                      <div className={"tx-patient-trend " + p.trend}>
                        {p.trend === "up" ? "↗" :
                         p.trend === "alert" ? "!" :
                         p.trend === "new" ? "✦" : "→"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <aside className="tx-col aside">
              {/* Inbox */}
              <div className="tx-card">
                <div className="tx-card-h">Bandeja · {inbox.length}</div>
                {inbox.map((m) => (
                  <div key={m.id} className="tx-inbox-row">
                    <Avatar cover={m.cover} initials={m.initials} size={36}/>
                    <div>
                      <div className="tx-inbox-body">
                        <strong style={{ color: "var(--color-warm-900)" }}>{m.patient}</strong> · {m.body}
                      </div>
                      <div className="tx-inbox-meta">
                        <span>{m.when}</span>
                        {m.flag && <span className={"tx-inbox-flag " + m.flag}>{m.flag === "urgent" ? "Urgente" : "Nuevo"}</span>}
                        <a href="#" style={{ marginLeft: "auto", color: "var(--color-lavender-700)", font: "600 11px/1 var(--font-sans)", textDecoration: "none" }}>
                          {m.cta} →
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Load chart */}
              <div className="tx-card">
                <div className="tx-card-h">Tu carga · esta semana</div>
                <div className="tx-load-stats">
                  <div>
                    <div className="tx-load-stat-val">{load.hoursThisWeek}<small>h</small></div>
                    <div className="tx-load-stat-lbl">De {load.hoursTarget} h objetivo</div>
                  </div>
                  <div>
                    <div className="tx-load-stat-val">{load.activePatients}</div>
                    <div className="tx-load-stat-lbl">Pacientes activos</div>
                  </div>
                </div>
                <div className="tx-load-bars">
                  {load.weekLoad.map((d, i) => (
                    <div key={i}
                      className={
                        "tx-load-bar " +
                        (d.sessions === 0 ? "is-zero " : "") +
                        (d.isToday ? "is-today" : "")
                      }
                      style={{ height: d.sessions ? `${(d.sessions / 6) * 100}%` : "6px" }}
                      title={`${d.day} · ${d.sessions} sesiones`}
                    ></div>
                  ))}
                </div>
                <div className="tx-load-axis">
                  {load.weekLoad.map((d, i) => (
                    <span key={i} className={"tx-load-axis-day " + (d.isToday ? "is-today" : "")}>
                      {d.day.split(" ")[0]}
                    </span>
                  ))}
                </div>
              </div>

              {/* Earnings */}
              <div className="tx-card">
                <div className="tx-card-h">Mayo · cobros</div>
                <div className="tx-load-stat-val" style={{ fontSize: 32, marginBottom: 8 }}>
                  ${load.earningsMonth}<small style={{ fontSize: 13 }}>USD</small>
                </div>
                <div style={{ font: "500 12px/1.5 var(--font-sans)", color: "var(--color-warm-600)" }}>
                  De {load.sessionsBookedNext} sesiones agendadas para junio.
                </div>
                <a href="#" style={{ display: "block", marginTop: 12, font: "600 12px/1 var(--font-sans)", color: "var(--color-lavender-700)", textDecoration: "none" }}>
                  Ver desglose →
                </a>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 17 · B2B · Beneficio activo (vista paciente)
// ───────────────────────────────────────────────────────────
function ScreenB2BUser({ setTweak }) {
  const b = window.T_B2B_USER;
  const pct = b.sessionsUsed / b.sessionsCoveredYear;

  return (
    <>
      <section className="b2b-banner">
        <div className="b2b-banner-meta">
          <span className="b2b-employer">{b.employerLogo}</span>
          <div>
            <div className="b2b-employer-name">{b.employer}</div>
            <div className="b2b-plan-name">{b.plan}</div>
          </div>
        </div>
        <h2>Tu equipo cubre tu terapia. Lo único que tienes que hacer es venir.</h2>
        <p className="b2b-banner-sub">
          Quanta Studios paga por tus sesiones — no se cobra a tu tarjeta. Tu uso es{" "}
          <strong>completamente anónimo</strong> para Quanta; ellos solo ven números agregados del equipo, nunca el tuyo.
        </p>

        <div className="b2b-counter">
          <span className="b2b-counter-ring" style={{ "--p": pct }}>
            <span className="b2b-counter-ring-text">
              {b.sessionsRemaining}
              <small>quedan</small>
            </span>
          </span>
          <div>
            <div className="b2b-counter-meta-h">
              {b.sessionsUsed} de {b.sessionsCoveredYear} sesiones usadas este año
            </div>
            <div className="b2b-counter-meta-sub">
              Tu beneficio se renueva el {b.renewDate}. Si necesitas más sesiones después, te avisamos antes — y siempre puedes seguir como Pro individual.
            </div>
          </div>
        </div>
      </section>

      <div>
        <div className="tw-sech">
          <h2 className="tw-sech-h">Lo que incluye tu beneficio</h2>
        </div>
        <div className="b2b-perks">
          {b.perks.map((p) => (
            <div key={p.title} className="b2b-perk">
              <span className="b2b-perk-glyph">{p.glyph}</span>
              <div>
                <div className="b2b-perk-title">{p.title}</div>
                <div className="b2b-perk-sub">{p.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="b2b-privacy">
        <span className="b2b-privacy-glyph">🔒</span>
        <div>
          <div className="b2b-privacy-title">Quanta nunca ve quién eres dentro de la plataforma.</div>
          <div className="b2b-privacy-body">
            RR.HH. y tu jefatura ven solo conteos agregados (cuántas personas activaron, cuántas sesiones, satisfacción promedio).
            Tu identidad, tu terapeuta y los temas de tus sesiones nunca se reportan al empleador — esto está en el contrato de servicio con Quanta.{" "}
            <a href="#" style={{ color: "var(--color-warm-900)", textDecoration: "underline", textUnderlineOffset: 2 }}>Lee la política completa →</a>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", padding: "20px 24px", background: "#fff", border: "1.5px solid var(--color-warm-200)", borderRadius: 14 }}>
        <div>
          <div style={{ font: "700 13.5px/1.2 var(--font-sans)", color: "var(--color-warm-900)" }}>¿Dudas o problemas con tu beneficio?</div>
          <div style={{ font: "400 12.5px/1.4 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 4 }}>
            Contacta a {b.contact} — solo en tu empresa, no a la plataforma.
          </div>
        </div>
        <button className="btn-outline">Reservar próxima sesión →</button>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────
// PANTALLA 18 · B2B · Dashboard del empleador (vista RR.HH.)
// ───────────────────────────────────────────────────────────
function ScreenB2BAdmin() {
  const a = window.T_B2B_ADMIN;
  const maxBar = Math.max(...a.monthlyUsage.map((m) => m.activations));

  return (
    <div className="tx-shell" style={{ background: "var(--color-warm-50)" }}>
      <aside className="tx-side">
        <div className="tx-side-head">
          <div className="tx-side-wordmark" style={{ color: "var(--color-warm-900)" }}>Quanta · Bienestar</div>
          <span className="tx-side-role" style={{ background: "var(--color-lavender-100)", color: "var(--color-lavender-700)" }}>
            ✦ Admin RR.HH.
          </span>
        </div>
        <nav className="tx-side-nav">
          {(() => { const I = window.Icons; return [
            { glyph: <I.chart    />, label: "Resumen", on: true },
            { glyph: <I.people   />, label: "Activación" },
            { glyph: <I.chart    />, label: "Tendencias" },
            { glyph: <I.plan     />, label: "Facturación" },
            { glyph: <I.diary    />, label: "Política" },
            { glyph: <I.settings />, label: "Cuenta" },
          ]; })().map((i) => (
            <a key={i.label} className={"tx-side-link " + (i.on ? "is-on" : "")} href="#"
               style={i.on ? { background: "var(--color-lavender-100)", color: "var(--color-lavender-700)" } : {}}>
              <span className="tx-side-link-glyph">{i.glyph}</span>
              {i.label}
            </a>
          ))}
        </nav>
        <div className="tx-side-foot">
          <div className="tx-side-foot-card">
            <span className="tx-side-foot-avatar" style={{ background: "linear-gradient(135deg, #574f45, #2a2420)" }}>J</span>
            <div style={{ minWidth: 0 }}>
              <div className="tx-side-foot-name">Jimena Castro</div>
              <div className="tx-side-foot-meta">Talento · Quanta Studios</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="tx-main">
        <header className="tx-top">
          <div>
            <div className="tx-top-title">Bienestar · {a.org}</div>
            <div className="tx-top-sub">{a.monthOf}</div>
          </div>
          <div className="tx-top-actions">
            <button className="btn-outline">Descargar PDF</button>
            <button className="btn-sage">Compartir resumen →</button>
          </div>
        </header>

        <div className="tx-page">
          <div className="tx-page-inner" style={{ gridTemplateColumns: "1fr" }}>
            <div className="tx-col">

              <section className="b2b-adm-hero">
                <div>
                  <span className="b2b-adm-eyebrow">Resumen · {a.monthOf}</span>
                  <h1 className="b2b-adm-org">{a.org}</h1>
                  <div className="b2b-adm-domain">@{a.domain} · {a.seats} licencias</div>
                </div>
                <span className="b2b-adm-key">
                  Cobertura · <strong>{a.sessionsCovered} sesiones / persona / año</strong>
                </span>
              </section>

              <div className="b2b-adm-stats">
                <div className="b2b-adm-stat">
                  <div className="b2b-adm-stat-val">{a.activatedSeats}<small>de {a.seats}</small></div>
                  <div className="b2b-adm-stat-lbl">Activaciones</div>
                  <div className="b2b-adm-stat-delta">+8 vs. abril</div>
                </div>
                <div className="b2b-adm-stat">
                  <div className="b2b-adm-stat-val">{a.monthlyUsage[a.monthlyUsage.length - 1].sessions}</div>
                  <div className="b2b-adm-stat-lbl">Sesiones · mayo</div>
                  <div className="b2b-adm-stat-delta">+12 % MoM</div>
                </div>
                <div className="b2b-adm-stat">
                  <div className="b2b-adm-stat-val">{a.satisfactionAvg}<small>/5</small></div>
                  <div className="b2b-adm-stat-lbl">Satisfacción · {a.satisfactionN} reseñas</div>
                  <div className="b2b-adm-stat-delta">↑ desde 4.6</div>
                </div>
                <div className="b2b-adm-stat">
                  <div className="b2b-adm-stat-val" style={{ color: "var(--color-warn-text)" }}>{a.burnoutSignal}</div>
                  <div className="b2b-adm-stat-lbl">Señal de carga</div>
                  <div className="b2b-adm-stat-delta warn">Pico Q1 entregables</div>
                </div>
              </div>

              <section className="b2b-adm-chart">
                <div className="pg-chart-head">
                  <div>
                    <div className="pg-chart-h">Uso del beneficio · 6 meses</div>
                    <div className="pg-chart-sub" style={{ marginTop: 4 }}>
                      Sesiones tomadas vs. personas activadas · datos agregados
                    </div>
                  </div>
                </div>
                <div className="b2b-adm-chart-bars">
                  {a.monthlyUsage.map((m, i) => (
                    <div key={i} className="b2b-adm-chart-col">
                      <div className="b2b-adm-chart-bar activations" style={{ height: `${(m.activations / maxBar) * 100}%` }}/>
                      <div className="b2b-adm-chart-bar sessions" style={{ height: `${(m.sessions / maxBar) * 100}%` }} title={`${m.sessions} sesiones · ${m.activations} personas`}/>
                    </div>
                  ))}
                </div>
                <div className="b2b-adm-chart-axis">
                  {a.monthlyUsage.map((m, i) => (
                    <div key={i} className={"b2b-adm-chart-axis-cell " + (m.isCurrent ? "is-current" : "")}>
                      {m.month}
                    </div>
                  ))}
                </div>
                <div className="b2b-adm-chart-legend">
                  <span className="b2b-adm-chart-legend-item">
                    <span className="b2b-adm-chart-legend-dot sessions"></span>Sesiones tomadas
                  </span>
                  <span className="b2b-adm-chart-legend-item">
                    <span className="b2b-adm-chart-legend-dot activations"></span>Personas activadas
                  </span>
                </div>
              </section>

              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
                <section className="tx-card">
                  <div className="tx-card-h">Temas más trabajados</div>
                  <div className="b2b-adm-themes-list">
                    {a.topThemes.map((t) => (
                      <div key={t.label} className="b2b-adm-themes-row">
                        <div className="b2b-adm-themes-lbl">{t.label}</div>
                        <div className="b2b-adm-themes-bar">
                          <div className="b2b-adm-themes-bar-fill" style={{ width: `${(t.pct / 30) * 100}%` }}/>
                        </div>
                        <div className="b2b-adm-themes-pct">{t.pct} %</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12, font: "400 11.5px/1.45 var(--font-sans)", color: "var(--color-warm-500)" }}>
                    Datos categorizados por terapeutas — siempre agrupados, nunca por persona.
                  </div>
                </section>

                <section className={"b2b-adm-signal " + a.burnoutSignal}>
                  <span className="b2b-adm-signal-glyph">⚠</span>
                  <div>
                    <div className="b2b-adm-signal-h">Señal de carga · {a.burnoutSignal}</div>
                    <div className="b2b-adm-signal-b">{a.burnoutNote}</div>
                  </div>
                </section>
              </div>

              <div className="b2b-adm-disclaimer">
                <strong>Confidencialidad:</strong> Este dashboard nunca muestra qué empleado usó el beneficio, ni los temas
                específicos de ninguna persona. Mínimo de 5 personas activadas por segmento para que aparezcan datos —
                si tu equipo es menor a 5, no verás cruces (ej. por departamento) para proteger anonimato.
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Router web
// ───────────────────────────────────────────────────────────
function WebTerapia({ tweaks, setTweak }) {
  const map = {
    hub:      <ScreenHub tweaks={tweaks} setTweak={setTweak}/>,
    dir:      <ScreenDirectory setTweak={setTweak}/>,
    prof:     <ScreenProfile setTweak={setTweak}/>,
    book:     <ScreenBook tweaks={tweaks} setTweak={setTweak}/>,
    prep:     <ScreenPrep setTweak={setTweak}/>,
    sessions: <ScreenSessions setTweak={setTweak}/>,
    post:     <ScreenPost setTweak={setTweak}/>,
    room:        <ScreenRoom setTweak={setTweak}/>,
    onboarding:  <ScreenOnboarding setTweak={setTweak}/>,
    crisis:      <ScreenCrisis setTweak={setTweak}/>,
    match:       <ScreenMatch setTweak={setTweak}/>,
    progress:      <ScreenProgress/>,
    notifs:        <ScreenNotifs setTweak={setTweak}/>,
    prescriptions: <ScreenPrescriptions setTweak={setTweak}/>,
    cancel:        <ScreenCancel setTweak={setTweak}/>,
    therapist:    <ScreenTherapist setTweak={setTweak}/>,
    "b2b-user":   <ScreenB2BUser setTweak={setTweak}/>,
    "b2b-admin":  <ScreenB2BAdmin/>,
  };
  // Sala + Therapist + B2B Admin usan shells propios
  if (tweaks.screen === "room") return map.room;
  if (tweaks.screen === "therapist") return map.therapist;
  if (tweaks.screen === "b2b-admin") return map["b2b-admin"];
  return <WShell screen={tweaks.screen} setTweak={setTweak}>{map[tweaks.screen]}</WShell>;
}

window.WebTerapia = WebTerapia;
