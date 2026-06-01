// detalle/mobile.jsx — Página detalle del libro · iPhone.

const {
  PSICO_BOOK: BOOK, PSICO_AUTHOR: AUTHOR,
  PSICO_CHAPTERS: CHAPS, PSICO_REVIEWS: REVIEWS,
} = window;

function MI({ d, size = 16, sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const MICO = {
  back:  <MI d="M15 6l-6 6 6 6"/>,
  share: <MI d={["M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8", "M16 6l-4-4-4 4", "M12 2v13"]}/>,
  bookm: <MI d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>,
  lock:  <MI d={["M7 11V7a5 5 0 0 1 10 0v4", "M5 11h14v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"]}/>,
  arrow: <MI d="M5 12h14M13 6l6 6-6 6"/>,
  play:  <MI d="M8 5v14l11-7z"/>,
  check: <MI d="M5 12l5 5L20 7" sw={2.4}/>,
};

function MobileDetalle({ tweaks }) {
  const { tier, progress, showLearnings, showReviews } = tweaks;

  const completedCount = CHAPS.filter((c) => c.state === "done").length;
  const totalCount = CHAPS.length;
  const current = CHAPS.find((c) => c.state === "current");
  const pct =
    progress === "new"     ? 0 :
    progress === "started" ? 0.08 :
    progress === "mid"     ? completedCount / totalCount :
    progress === "almost"  ? 0.92 :
    progress === "done"    ? 1 : 0;
  const pctNum = Math.round(pct * 100);

  let ctaLabel = "Empezar capítulo 1";
  if (progress === "mid" && current) ctaLabel = `Continuar capítulo ${current.n}`;
  else if (progress === "almost")    ctaLabel = "Continuar capítulo 11";
  else if (progress === "done")      ctaLabel = "Releer desde el inicio";
  else if (progress === "started")   ctaLabel = "Continuar capítulo 1";

  // Adapt chapters to the progress state (mirror web)
  const chapters = CHAPS.map((c) => {
    let st = c.state;
    if (progress === "new")     st = "ready";
    if (progress === "started") st = c.n === 1 ? "current" : "ready";
    if (progress === "almost")  st = c.n <= 10 ? "done" : c.n === 11 ? "current" : "ready";
    if (progress === "done")    st = "done";
    return { ...c, state: st };
  });

  return (
    <div className="mob">
      {/* Topbar — sticky, glass over hero */}
      <header className="mob-top">
        <button className="mob-top-btn" aria-label="Atrás">{MICO.back}</button>
        <div className="mob-top-actions">
          <button className="mob-top-btn" aria-label="Compartir">{MICO.share}</button>
          <button className="mob-top-btn" aria-label="Guardar">{MICO.bookm}</button>
        </div>
      </header>

      <div className="mob-scroll">
        {/* Hero */}
        <section className="mob-hero">
          <div className={"mob-hero-cover cover-" + BOOK.cover}>
            <span className="mob-hero-cover-glyph">📖</span>
          </div>
          <span className="mob-hero-eyebrow">{BOOK.category}</span>
          <h1 className="mob-hero-title">{BOOK.title}</h1>
          <p className="mob-hero-sub">{BOOK.subtitle}</p>
          <div className="mob-hero-author">
            <span className="mob-hero-author-avatar">{AUTHOR.initials}</span>
            {AUTHOR.name}
          </div>
          <div className="mob-hero-stats">
            <span><strong>{BOOK.totalChapters}</strong> caps</span>
            <span className="mob-hero-stats-sep"/>
            <span><strong>{BOOK.duration}</strong></span>
            <span className="mob-hero-stats-sep"/>
            <span>★ <strong>{BOOK.rating}</strong> · {BOOK.reviewsCount.toLocaleString("es")}</span>
          </div>
        </section>

        {/* Sobre */}
        <section className="mob-section">
          <h3>Sobre este libro</h3>
          <p className="mob-section-body">{BOOK.description}</p>
        </section>

        {/* Lo que aprenderás */}
        {showLearnings && (
          <section className="mob-section">
            <h3>Lo que aprenderás</h3>
            <ul className="mob-learnings">
              {BOOK.learnings.map((l, i) => (
                <li key={i} className="mob-learning">
                  <span className="mob-learning-tick">{MICO.check}</span>
                  {l}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* TOC */}
        <section className="mob-section">
          <h3>Capítulos · {totalCount}</h3>
          <ol className="mob-toc" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {chapters.map((c) => {
              const locked = tier !== "pro" && c.plan === "PRO";
              const cls = locked ? "is-locked" : c.state === "current" ? "is-current" : c.state === "done" ? "is-done" : "";
              return (
                <li key={c.n} className={"mob-toc-row " + cls}>
                  <span className="mob-toc-num">{String(c.n).padStart(2, "0")}</span>
                  <div className="mob-toc-meta">
                    <div className="mob-toc-title">{c.title}</div>
                    <div className="mob-toc-sub">{c.sub}</div>
                    <div className="mob-toc-info" style={{ marginTop: 4 }}>
                      {c.min} min · {c.lessons} lecciones
                      {c.plan === "FREE" && !locked && <span> · Gratis</span>}
                      {locked && <span> · Pro</span>}
                    </div>
                  </div>
                  <span className="mob-toc-icon">
                    {locked ? MICO.lock : c.state === "done" ? MICO.check : c.state === "current" ? MICO.play : MICO.arrow}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Autora */}
        <section className="mob-section">
          <h3>Sobre la autora</h3>
          <div className="mob-autora">
            <span className="mob-autora-avatar">{AUTHOR.initials}</span>
            <div style={{ minWidth: 0 }}>
              <div className="mob-autora-name">{AUTHOR.name}</div>
              <div className="mob-autora-title">{AUTHOR.title}</div>
              <p className="mob-autora-bio">{AUTHOR.bio}</p>
            </div>
          </div>
        </section>

        {/* Upgrade — solo free */}
        {tier !== "pro" && (
          <section className="mob-section" style={{ background: "linear-gradient(135deg, var(--color-lavender-500), var(--color-lavender-800))", borderBottom: 0, color: "#fff", margin: "12px 16px", borderRadius: 18, padding: "20px" }}>
            <span style={{ font: "700 10px/1 var(--font-sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>
              Plan Pro · $7/mes
            </span>
            <h3 style={{ font: "700 16px/1.2 var(--font-sans)", color: "#fff", margin: "8px 0 4px", letterSpacing: "-0.012em" }}>
              Desbloquea los 12 capítulos
            </h3>
            <p style={{ font: "400 13px/1.5 var(--font-sans)", color: "rgba(255,255,255,.78)", margin: 0 }}>
              Solo el primer capítulo es gratis — el resto, los ejercicios y los audios vienen con Pro.
            </p>
          </section>
        )}

        {/* Reseñas */}
        {showReviews && (
          <section className="mob-section">
            <h3>Reseñas · ★ {BOOK.rating}</h3>
            {REVIEWS.map((r, i) => (
              <article key={i} className="mob-review">
                <header className="mob-review-head">
                  <span className="mob-review-avatar">{r.initials}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="mob-review-name">{r.name} · {r.country}</div>
                    <div className="mob-review-where">{r.when}</div>
                  </div>
                  <span className="mob-review-stars">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                </header>
                <p className="mob-review-text">{r.text}</p>
              </article>
            ))}
          </section>
        )}
      </div>

      {/* Sticky CTA */}
      <footer className="mob-cta-bar">
        {pct > 0 && pct < 1 && (
          <div className="mob-cta-progress">
            <div className="mob-cta-progress-bar"><div className="mob-cta-progress-fill" style={{ width: pctNum + "%" }}/></div>
            <span style={{ color: "var(--color-warm-800)", fontWeight: 700 }}>{pctNum}%</span>
          </div>
        )}
        <button className={"mob-cta" + (tier !== "pro" && progress === "new" ? "" : "")}>
          {MICO.play} {ctaLabel}
        </button>
      </footer>
    </div>
  );
}

window.MobileDetalle = MobileDetalle;
