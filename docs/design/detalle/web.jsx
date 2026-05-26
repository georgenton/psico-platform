// detalle/web.jsx — Página detalle del libro en el dashboard web.

const { PSICO_BOOK, PSICO_AUTHOR, PSICO_CHAPTERS, PSICO_REVIEWS, PSICO_RATING_BREAKDOWN } = window;

// ── Icons ─────────────────────────────────────────────────────────────────
function Ico({ d, size = 16, strokeWidth = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const I = {
  back:   <Ico d="M15 6l-6 6 6 6"/>,
  arrow:  <Ico d="M5 12h14M13 6l6 6-6 6"/>,
  share:  <Ico d={["M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8", "M16 6l-4-4-4 4", "M12 2v13"]}/>,
  bookm:  <Ico d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>,
  lock:   <Ico d={["M7 11V7a5 5 0 0 1 10 0v4", "M5 11h14v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"]}/>,
  play:   <Ico d="M8 5v14l11-7z"/>,
  check:  <Ico d="M5 12l5 5L20 7" strokeWidth={2.4}/>,
  audio:  <Ico d={["M3 12v0a3 3 0 0 1 3-3h2v6H6a3 3 0 0 1-3-3z", "M21 12a3 3 0 0 0-3-3h-2v6h2a3 3 0 0 0 3-3z", "M6 9V7a6 6 0 0 1 12 0v2"]}/>,
};

// ── Sidebar ───────────────────────────────────────────────────────────────
function WebSidebar({ tier }) {
  const N = window.Icons;
  const items = [
    { icon: <N.home />, label: "Inicio" },
    { icon: <N.book />, label: "Mi biblioteca", on: true },
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

// ── Hero (cover + meta + CTAs + progress) ────────────────────────────────
function WebHero({ tweaks }) {
  const { tier, progress, hero } = tweaks;
  const book = PSICO_BOOK;
  const author = PSICO_AUTHOR;
  const isImmersive = hero === "immersive";

  // Resolve progress state. Pulled from chapters' `state` count.
  const completedChapters = PSICO_CHAPTERS.filter((c) => c.state === "done").length;
  const totalChapters = PSICO_CHAPTERS.length;
  const currentChapter = PSICO_CHAPTERS.find((c) => c.state === "current");
  const pct =
    progress === "new"      ? 0 :
    progress === "started"  ? 0.08 :
    progress === "mid"      ? Math.round((completedChapters / totalChapters) * 100) / 100 :
    progress === "almost"   ? 0.92 :
    progress === "done"     ? 1 : 0;
  const pctNum = Math.round(pct * 100);

  // CTA copy
  let ctaLabel = "Empezar capítulo 1";
  let ctaSub = null;
  if (progress === "mid" && currentChapter) {
    ctaLabel = `Continuar capítulo ${currentChapter.n}`;
    ctaSub = currentChapter.title;
  } else if (progress === "almost") {
    ctaLabel = "Continuar capítulo 11";
    ctaSub = "Crear hábitos emocionales";
  } else if (progress === "done") {
    ctaLabel = "Releer desde el inicio";
    ctaSub = "Capítulo 1 · Lo que sientes no es lo que eres";
  } else if (progress === "started") {
    ctaLabel = "Continuar capítulo 1";
    ctaSub = "Lo que sientes no es lo que eres";
  }

  return (
    <section className={"web-hero" + (isImmersive ? " immersive" : "")}>
      <div className="web-hero-cover-wrap">
        <div className={"web-hero-cover cover-" + book.cover}>
          {book.badge && <span className="web-hero-cover-badge">★ {book.badge}</span>}
          <span className="web-hero-cover-glyph">📖</span>
        </div>
        {!isImmersive && (
          <div className="web-hero-formats" aria-label="Formatos disponibles">
            {book.formats.map((f) => (
              <span key={f} className="web-hero-format">{f}</span>
            ))}
          </div>
        )}
      </div>
      <div className="web-hero-meta">
        <span className="web-hero-eyebrow">{book.category}</span>
        <h1 className="web-hero-title">{book.title}</h1>
        <p className="web-hero-subtitle">{book.subtitle}</p>

        <div className="web-hero-author">
          <span className="web-hero-author-avatar">{author.initials}</span>
          <div>
            <div className="web-hero-author-name">{author.name}</div>
            <div className="web-hero-author-title">{author.title}</div>
          </div>
        </div>

        <div className="web-hero-stats">
          <div className="web-hero-stat">
            <div className="web-hero-stat-val">{book.totalChapters}</div>
            <div className="web-hero-stat-lbl">Capítulos</div>
          </div>
          <div className="web-hero-stat-sep"/>
          <div className="web-hero-stat">
            <div className="web-hero-stat-val">{book.duration}</div>
            <div className="web-hero-stat-lbl">Lectura</div>
          </div>
          <div className="web-hero-stat-sep"/>
          <div className="web-hero-stat">
            <div className="web-hero-stat-val">★ {book.rating}</div>
            <div className="web-hero-stat-lbl">{book.reviewsCount.toLocaleString("es")} reseñas</div>
          </div>
          <div className="web-hero-stat-sep"/>
          <div className="web-hero-stat">
            <div className="web-hero-stat-val">{book.readersCount}</div>
            <div className="web-hero-stat-lbl">Lectores</div>
          </div>
        </div>

        {pct > 0 && pct < 1 && (
          <div className="web-hero-progress">
            <div className="web-hero-progress-row">
              <span>Tu progreso · <strong>{pctNum}%</strong></span>
              <span>{Math.round(book.totalChapters * pct)} de {book.totalChapters} capítulos</span>
            </div>
            <div className="web-hero-progress-bar"><div className="web-hero-progress-fill" style={{ width: pctNum + "%" }}/></div>
          </div>
        )}
        {pct === 1 && (
          <div className="web-hero-progress">
            <div className="web-hero-progress-row">
              <span style={{ color: "var(--color-sage-700)" }}>✓ Completado — gracias por leerlo hasta el final.</span>
              <span>{book.totalChapters} de {book.totalChapters}</span>
            </div>
            <div className="web-hero-progress-bar"><div className="web-hero-progress-fill" style={{ width: "100%", background: "var(--color-sage-400)" }}/></div>
          </div>
        )}

        <div className="web-hero-ctas">
          <button className="web-hero-cta primary">
            {I.play} {ctaLabel}
          </button>
          <button className="web-hero-cta outline">
            {I.audio} Escuchar audio
          </button>
          <button className="web-hero-cta ghost">
            {I.bookm} Guardar
          </button>
        </div>
        {ctaSub && (
          <div style={{ font: "500 12px/1 var(--font-sans)", color: isImmersive ? "rgba(255,255,255,.7)" : "var(--color-warm-500)", marginTop: 6 }}>
            Siguiente: <span style={{ color: isImmersive ? "#fff" : "var(--color-warm-800)", fontWeight: 600 }}>{ctaSub}</span>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────
function Tabs({ active, onChange, items }) {
  return (
    <div className="web-tabs">
      {items.map((it) => (
        <button
          key={it.id}
          className={"web-tab " + (active === it.id ? "is-on" : "")}
          onClick={() => onChange(it.id)}
          type="button"
        >
          {it.label}
          {it.count != null && <span className="web-tab-count">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── About + Learnings ─────────────────────────────────────────────────────
function AboutBlock() {
  return (
    <div className="web-section">
      <h2 className="web-h2">Sobre este libro</h2>
      <p className="web-about-body">
        <strong>{PSICO_BOOK.description}</strong>
      </p>
      <p className="web-about-body" style={{ marginTop: 8 }}>
        El libro está pensado para leerse en sesiones cortas — entre 10 y 22 minutos por capítulo —
        e incluye <strong>ejercicios prácticos</strong> al cierre de cada uno. Funciona como introducción
        para quienes empiezan y como repaso para quienes ya tienen camino recorrido en terapia.
      </p>
    </div>
  );
}

function LearningsBlock() {
  return (
    <div className="web-section">
      <h2 className="web-h2">Lo que aprenderás</h2>
      <ul className="web-learnings">
        {PSICO_BOOK.learnings.map((l, i) => (
          <li key={i} className="web-learning">
            <span className="web-learning-tick">{I.check}</span>
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── TOC ───────────────────────────────────────────────────────────────────
function TocBlock({ tier, progress }) {
  // Adapt chapter state to the progress tweak
  const chapters = PSICO_CHAPTERS.map((c) => {
    let state = c.state;
    if (progress === "new")     state = c.n === 1 ? "ready" : "ready";
    if (progress === "started") state = c.n === 1 ? "current" : "ready";
    if (progress === "almost")  state = c.n <= 10 ? "done" : c.n === 11 ? "current" : "ready";
    if (progress === "done")    state = "done";
    return { ...c, state };
  });

  return (
    <div className="web-section">
      <div className="web-section-h" style={{ marginBottom: 12 }}>
        <h2 className="web-h2" style={{ margin: 0 }}>Capítulos</h2>
        <span style={{ font: "500 12px/1 var(--font-sans)", color: "var(--color-warm-500)" }}>
          {PSICO_CHAPTERS.length} capítulos · {PSICO_BOOK.totalLessons} lecciones · {PSICO_BOOK.duration}
        </span>
      </div>
      <ol className="web-toc" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {chapters.map((c) => {
          const locked = tier !== "pro" && c.plan === "PRO";
          const cls = locked ? "is-locked" : c.state === "current" ? "is-current" : c.state === "done" ? "is-done" : "";
          const badgeNode =
            c.state === "current" ? <span className="web-toc-badge current">En curso</span> :
            locked ? <span className="web-toc-badge pro">{I.lock} Pro</span> :
            c.plan === "FREE" ? <span className="web-toc-badge free">Gratis</span> : null;
          return (
            <li key={c.n} className={"web-toc-row " + cls}>
              {c.state === "done" && !locked ? (
                <span className="web-toc-tick">{I.check}</span>
              ) : (
                <span className="web-toc-num">{String(c.n).padStart(2, "0")}</span>
              )}
              <div className="web-toc-meta">
                <div className="web-toc-title">
                  {c.title}
                  {badgeNode}
                </div>
                <div className="web-toc-sub">{c.sub}</div>
              </div>
              <div className="web-toc-info">
                <span>{c.min} min</span>
                <span className="web-toc-info-sep">·</span>
                <span>{c.lessons} lecciones</span>
              </div>
              <span className="web-toc-go">
                {locked ? I.lock : I.arrow}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Reviews ──────────────────────────────────────────────────────────────
function ReviewsBlock() {
  const book = PSICO_BOOK;
  return (
    <div className="web-section">
      <div className="web-section-h" style={{ marginBottom: 12 }}>
        <h2 className="web-h2" style={{ margin: 0 }}>Reseñas verificadas</h2>
        <a href="#" style={{ font: "600 12.5px/1 var(--font-sans)", color: "var(--color-lavender-700)", textDecoration: "none" }}>
          Ver las {book.reviewsCount.toLocaleString("es")} →
        </a>
      </div>

      <div className="web-reviews-summary">
        <div className="web-reviews-score">
          <div className="web-reviews-score-num">{book.rating}</div>
          <div className="web-reviews-score-stars">★★★★★</div>
          <div className="web-reviews-score-count">{book.reviewsCount.toLocaleString("es")} reseñas</div>
        </div>
        <div className="web-reviews-bars">
          {PSICO_RATING_BREAKDOWN.map((b) => (
            <div key={b.stars} className="web-reviews-bar">
              <span className="web-reviews-bar-lbl">{b.stars} ★</span>
              <div className="web-reviews-bar-track"><div className="web-reviews-bar-fill" style={{ width: b.pct + "%" }}/></div>
              <span className="web-reviews-bar-pct">{b.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        {PSICO_REVIEWS.map((r, i) => (
          <article key={i} className="web-review">
            <header className="web-review-head">
              <span className="web-review-avatar">{r.initials}</span>
              <div className="web-review-id">
                <span className="web-review-name">{r.name} <span style={{ color: "var(--color-warm-400)", fontWeight: 400 }}>· {r.country}</span></span>
                <span className="web-review-where">{r.when}{r.chapter ? " · Sobre el capítulo " + r.chapter : ""}</span>
              </div>
              <span className="web-review-stars">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
            </header>
            <p className="web-review-text">{r.text}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

// ── Side: Autora + Plan upgrade + Eco ─────────────────────────────────────
function AutoraCard() {
  return (
    <div className="web-side-card">
      <span className="web-side-card-eyebrow">Sobre la autora</span>
      <div className="web-autora">
        <span className="web-autora-avatar">{PSICO_AUTHOR.initials}</span>
        <div className="web-autora-meta">
          <div className="web-autora-name">{PSICO_AUTHOR.name}</div>
          <div className="web-autora-title">{PSICO_AUTHOR.title}</div>
        </div>
      </div>
      <p>{PSICO_AUTHOR.bio}</p>
      <div className="web-autora-other">
        <span className="web-side-card-eyebrow">Otros libros de la autora</span>
        {PSICO_AUTHOR.otherBooks.map((b) => (
          <a key={b.id} href="#" className="web-autora-other-row">
            <span className={"web-autora-other-cover cover-" + b.cover}></span>
            <div style={{ minWidth: 0 }}>
              <div className="web-autora-other-title">{b.title}</div>
              <div className="web-autora-other-meta">{b.chapters} caps · {b.plan === "PRO" ? "Pro" : "Gratis"}</div>
            </div>
            <span className="web-autora-other-arrow">→</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function UpgradeCard() {
  return (
    <div className="web-side-card web-side-upgrade">
      <span className="web-side-card-eyebrow">Plan Pro · $7/mes</span>
      <h3>Desbloquea los 12 capítulos.</h3>
      <p>Solo el primer capítulo es gratis. Los 11 restantes — incluido el audio, los ejercicios y los quizzes — vienen con Pro.</p>
      <ul className="web-side-list">
        <li><span className="web-side-list-tick">✓</span> Toda la biblioteca</li>
        <li><span className="web-side-list-tick">✓</span> Audios profesionales</li>
        <li><span className="web-side-list-tick">✓</span> Eco dentro del libro</li>
        <li><span className="web-side-list-tick">✓</span> Sin tarjeta para empezar</li>
      </ul>
      <button className="web-side-upgrade-cta">Actualizar a Pro {I.arrow}</button>
    </div>
  );
}

function MarinaCard() {
  return (
    <div className="web-side-card">
      <span className="web-side-card-eyebrow">✦ Eco</span>
      <h3>¿Tienes una duda sobre este libro?</h3>
      <p>Eco aprendió de los textos de la Dra. Salazar. Puede aclarar pasajes, sugerir ejercicios y recordarte dónde quedaste.</p>
      <button className="web-hero-cta outline" style={{ height: 40, fontSize: 13 }}>
        Conversar con Eco {I.arrow}
      </button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────
function WebDetalle({ tweaks }) {
  const { tier, progress, showLearnings, showReviews, hero } = tweaks;
  const [tab, setTab] = React.useState("capitulos");

  const tabItems = [
    { id: "capitulos", label: "Capítulos", count: PSICO_CHAPTERS.length },
    { id: "sobre",     label: "Sobre" },
    { id: "autora",    label: "Autora" },
    ...(showReviews ? [{ id: "resenas", label: "Reseñas", count: PSICO_BOOK.reviewsCount }] : []),
  ];

  return (
    <div className="web">
      <WebSidebar tier={tier}/>
      <main className="web-main">
        <header className="web-top">
          <button className="web-top-back" type="button">
            {I.back}
            Mi biblioteca
          </button>
          <div className="web-top-actions">
            <button className="web-top-iconbtn" aria-label="Compartir">{I.share}</button>
            <button className="web-top-iconbtn" aria-label="Guardar">{I.bookm}</button>
          </div>
        </header>

        <div className="web-page">
          <div className="web-page-inner">
            <WebHero tweaks={tweaks}/>

            <Tabs active={tab} onChange={setTab} items={tabItems}/>

            <div className="web-body">
              <div className="web-body-main">
                {tab === "capitulos" && (
                  <>
                    {showLearnings && <LearningsBlock/>}
                    <TocBlock tier={tier} progress={progress}/>
                  </>
                )}
                {tab === "sobre" && (
                  <>
                    <AboutBlock/>
                    {showLearnings && <LearningsBlock/>}
                  </>
                )}
                {tab === "autora" && (
                  <div className="web-section">
                    <h2 className="web-h2">{PSICO_AUTHOR.name}</h2>
                    <p className="web-about-body">{PSICO_AUTHOR.bio}</p>
                    <h3 className="web-h2" style={{ marginTop: 22 }}>Otros libros</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {PSICO_AUTHOR.otherBooks.map((b) => (
                        <a key={b.id} className="web-autora-other-row" href="#">
                          <span className={"web-autora-other-cover cover-" + b.cover}></span>
                          <div style={{ minWidth: 0 }}>
                            <div className="web-autora-other-title">{b.title}</div>
                            <div className="web-autora-other-meta">{b.chapters} capítulos · Plan {b.plan === "PRO" ? "Pro" : "Gratuito"}</div>
                          </div>
                          <span className="web-autora-other-arrow">→</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {tab === "resenas" && showReviews && <ReviewsBlock/>}
              </div>
              <div className="web-body-side">
                {tier !== "pro" && <UpgradeCard/>}
                <AutoraCard/>
                <MarinaCard/>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

window.WebDetalle = WebDetalle;
