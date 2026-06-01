// biblioteca/web.jsx — Web dashboard surface for "Mi biblioteca".
// Layout: 240px sidebar + 56px topbar + scrolling page (continue · recos · catalog grid).

const { PSICO_BOOKS, PSICO_AUTHORS, PSICO_CATEGORIES, PSICO_RECOS, MOOD_NAMES, MOOD_SWATCH } = window;

// ── Icons (inline, lucide-ish 2px stroke) ─────────────────────────────────
function Ico({ d, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const ICONS = {
  search: <Ico d={["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "m20 20-3.5-3.5"]} />,
  arrow:  <Ico d="M5 12h14M13 6l6 6-6 6" />,
  filter: <Ico d="M4 6h16M7 12h10M10 18h4" />,
  bell:   <Ico d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21a2 2 0 0 0 4 0" />,
};

// ── Sidebar ───────────────────────────────────────────────────────────────
function WebSidebar({ tier }) {
  const N = window.Icons;
  const items = [
    { href: "#inicio", icon: <N.home />, label: "Inicio" },
    { href: "#libros", icon: <N.book />, label: "Mi biblioteca", on: true },
    { href: "#plan",   icon: <N.plan />, label: "Mi plan" },
    { href: "#perfil", icon: <N.user />, label: "Perfil" },
  ];
  return (
    <aside className="web-side">
      <div className="web-side-head">
        <span className="web-side-wordmark">Psico Platform</span>
      </div>
      <nav className="web-side-nav">
        <div className="web-side-eyebrow">Menú</div>
        {items.map((it) => (
          <a key={it.label} className={"web-side-link " + (it.on ? "is-on" : "")} href={it.href}>
            <span className="web-side-link-icon">{it.icon}</span>
            {it.label}
          </a>
        ))}
      </nav>
      <div className="web-side-foot">
        <div className="web-side-user">
          <span className="web-side-avatar">A</span>
          <div className="web-side-user-meta">
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

// ── Cover gradient picker ─────────────────────────────────────────────────
function coverClass(cover) {
  return "cover-" + (cover || "mixed");
}

// ── Continue (hero) ───────────────────────────────────────────────────────
function WebContinue({ book }) {
  if (!book) return null;
  const a = PSICO_AUTHORS[book.author];
  const pct = Math.round((book.progress || 0) * 100);
  return (
    <div className="web-continue">
      <div className={"web-card-cover " + coverClass(book.cover)} style={{ height: 156, borderRadius: 16 }}>
        <span className="web-card-cover-glyph">📖</span>
      </div>
      <div>
        <span className="web-continue-eyebrow">Continúa donde quedaste · {book.lastRead}</span>
        <h2 className="web-continue-title">{book.title}</h2>
        <div className="web-continue-next">{book.nextChapter}</div>
        <div className="web-continue-progress">
          <div className="web-continue-bar"><div className="web-continue-bar-fill" style={{ width: pct + "%" }}/></div>
          <span className="web-continue-bar-pct">{pct}%</span>
        </div>
      </div>
      <button className="web-continue-cta">
        Seguir leyendo
        <Ico d="M5 12h14M13 6l6 6-6 6" size={13}/>
      </button>
    </div>
  );
}

// ── Upgrade banner (free users) ───────────────────────────────────────────
function WebUpgrade() {
  return (
    <div className="web-upgrade">
      <div>
        <div className="web-upgrade-eyebrow">Plan Gratuito</div>
        <h3 className="web-upgrade-title">Desbloquea toda la biblioteca</h3>
        <p className="web-upgrade-sub">
          Actualiza a Pro por <strong>$7/mes</strong> — acceso a todos los libros, audios y a Eco.
        </p>
      </div>
      <button className="web-upgrade-cta">
        Actualizar a Pro
        <Ico d="M5 12h14M13 6l6 6-6 6" size={13}/>
      </button>
    </div>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────
function WebFilters({ active, onChange }) {
  return (
    <div className="web-filters">
      {PSICO_CATEGORIES.map((c) => (
        <button
          key={c.id}
          className={"web-chip " + (active === c.id ? "is-on" : "")}
          onClick={() => onChange(c.id)}
          type="button"
        >
          {c.label}
          {c.count != null && <span className="web-chip-count">{c.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Recommendation row (Eco) ──────────────────────────────────────────────
function WebRecos() {
  return (
    <div>
      <div className="web-section-h">
        <h2>Para ti — sugerido por Eco</h2>
        <a className="web-section-h-link" href="#">Cómo elige Eco →</a>
      </div>
      <div className="web-recos" style={{ marginTop: 14 }}>
        {PSICO_RECOS.map((r) => {
          const b = PSICO_BOOKS.find((x) => x.id === r.bookId);
          if (!b) return null;
          const a = PSICO_AUTHORS[b.author];
          return (
            <article key={r.bookId} className="web-reco">
              <div className="web-reco-head">
                <div className={"web-reco-cover " + coverClass(b.cover)}></div>
                <div className="web-reco-meta">
                  <span className="web-reco-badge">✦ {r.badge}</span>
                  <h3 className="web-reco-title">{b.title}</h3>
                  <span className="web-reco-author">{a.name}</span>
                </div>
              </div>
              <div className="web-reco-reason">
                <span className="web-reco-marina">MS</span>
                {r.reason}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

// ── Book card (grid) ──────────────────────────────────────────────────────
function WebCard({ book, tier }) {
  const locked = book.plan !== "FREE" && tier !== "pro";
  const a = PSICO_AUTHORS[book.author];
  const pct = Math.round((book.progress || 0) * 100);
  const started = pct > 0;
  return (
    <article className="web-card">
      <div className={"web-card-cover " + coverClass(book.cover)}>
        {book.badge === "Nuevo" && <span className="web-card-cover-tag new">{book.badge}</span>}
        {book.badge === "Más leído" && <span className="web-card-cover-tag top">{book.badge}</span>}
        <span className="web-card-cover-glyph">📖</span>
        {locked && (
          <div className="web-card-lock">
            <span className="web-card-lock-glyph">🔒</span>
            <span className="web-card-lock-text">Pro</span>
          </div>
        )}
      </div>
      <div className="web-card-body">
        <h3 className="web-card-title">{book.title}</h3>
        <div className="web-card-author">
          <span className="web-card-author-dot">{a.initials}</span>
          {a.name}
        </div>
        <p className="web-card-desc">{book.description}</p>
        <div className="web-card-meta">
          <span>{book.chapters} caps</span>
          <span className="web-card-meta-sep">·</span>
          <span>{book.duration}</span>
          <span className="web-card-meta-sep">·</span>
          <span>★ {book.rating}</span>
        </div>
        {started && !locked && (
          <div className="web-card-progress">
            <div className="web-card-progress-bar"><div className="web-card-progress-fill" style={{ width: pct + "%" }}/></div>
            <span className="web-card-progress-pct">{pct}%</span>
          </div>
        )}
        {locked ? (
          <button className="web-card-cta locked">Desbloquear con Pro →</button>
        ) : (
          <button className="web-card-cta free">{started ? "Seguir leyendo" : "Empezar lectura"} →</button>
        )}
      </div>
    </article>
  );
}

// ── List row ──────────────────────────────────────────────────────────────
function WebRow({ book, tier }) {
  const locked = book.plan !== "FREE" && tier !== "pro";
  const a = PSICO_AUTHORS[book.author];
  const pct = Math.round((book.progress || 0) * 100);
  const started = pct > 0;
  return (
    <div className="web-list-row">
      <div className={"web-list-cover " + coverClass(book.cover)}>
        {locked && <div className="lockmini">🔒</div>}
      </div>
      <div className="web-list-meta">
        <h3 className="web-list-title">{book.title}</h3>
        <p className="web-list-sub">{book.description}</p>
        <div className="web-list-microm">
          <span>{a.name}</span>
          <span className="web-card-meta-sep">·</span>
          <span>{book.chapters} caps · {book.duration}</span>
          {started && !locked && (
            <>
              <span className="web-card-meta-sep">·</span>
              <span style={{ color: "var(--color-lavender-700)", fontWeight: 600 }}>{pct}% leído</span>
            </>
          )}
        </div>
      </div>
      <div className="web-list-cta-col">
        {locked ? (
          <button className="web-card-cta locked">Desbloquear con Pro →</button>
        ) : (
          <button className="web-card-cta free">{started ? "Seguir" : "Empezar"} →</button>
        )}
      </div>
    </div>
  );
}

// ── Web library page ─────────────────────────────────────────────────────
function WebLibrary({ tweaks }) {
  const tier = tweaks.tier;
  const mood = tweaks.mood;
  const view = tweaks.view;            // grid · list
  const showContinue = tweaks.showContinue;
  const showRecos = tweaks.showRecos;
  const sort = tweaks.sort;            // recent · alpha · marina
  const [filter, setFilter] = React.useState("all");

  // Compute book list to render
  const continueBook = PSICO_BOOKS.find((b) => b.progress > 0);
  let books = PSICO_BOOKS;

  // Apply category filter
  if (filter === "empezados") {
    books = books.filter((b) => b.progress > 0);
  } else if (filter === "marina") {
    const recoIds = new Set(PSICO_RECOS.map((r) => r.bookId));
    books = books.filter((b) => recoIds.has(b.id));
  } else if (filter !== "all") {
    books = books.filter((b) => b.category.includes(filter));
  }

  // Sort
  books = [...books];
  if (sort === "alpha") books.sort((a, b) => a.title.localeCompare(b.title, "es"));
  else if (sort === "marina") {
    const order = new Map(PSICO_RECOS.map((r, i) => [r.bookId, i]));
    books.sort((a, b) => (order.has(a.id) ? order.get(a.id) : 999) - (order.has(b.id) ? order.get(b.id) : 999));
  } else {
    // recent: started first, by lastRead implicitly
    books.sort((a, b) => (b.progress > 0 ? 1 : 0) - (a.progress > 0 ? 1 : 0));
  }

  return (
    <div className="web">
      <WebSidebar tier={tier}/>
      <main className="web-main">
        <header className="web-top">
          <div className="web-top-title">Mi biblioteca</div>
          <div className="web-top-actions">
            <label className="web-search">
              {ICONS.search}
              <input placeholder="Buscar libros, autores, temas…"/>
            </label>
            <button className="web-mood" type="button" aria-label="Mood activo">
              <span className="web-mood-dot" style={{ background: MOOD_SWATCH[mood] }}></span>
              {MOOD_NAMES[mood]}
            </button>
          </div>
        </header>

        <div className="web-page">
          <div className="web-page-inner">
            <div className="web-hello">
              <div>
                <h1>Tu biblioteca, Ana.</h1>
                <p className="web-hello-sub">
                  {tier === "pro"
                    ? "Acceso completo · 8 libros · Eco está leyendo contigo."
                    : "1 libro gratuito · 7 disponibles con Pro."}
                </p>
              </div>
              <span className="web-hello-counter">{books.length} libros</span>
            </div>

            {showContinue && continueBook && <WebContinue book={continueBook}/>}
            {tier === "free" && <WebUpgrade/>}

            <WebFilters active={filter} onChange={setFilter}/>

            {showRecos && filter === "all" && <WebRecos/>}

            <div>
              <div className="web-section-h">
                <h2>
                  {filter === "all"      ? "Todo el catálogo"
                  : filter === "empezados" ? "Empezados"
                  : filter === "marina"    ? "Sugerencias para ti"
                  : PSICO_CATEGORIES.find((c) => c.id === filter)?.label}
                </h2>
                <span className="web-section-h-link" style={{ color: "var(--color-warm-500)", fontWeight: 500 }}>
                  Orden: {sort === "alpha" ? "A → Z" : sort === "marina" ? "Sugerido" : "Recientes"}
                </span>
              </div>
              <div style={{ marginTop: 14 }}>
                {view === "list" ? (
                  <div className="web-list">
                    {books.map((b) => <WebRow key={b.id} book={b} tier={tier}/>)}
                  </div>
                ) : (
                  <div className="web-grid">
                    {books.map((b) => <WebCard key={b.id} book={b} tier={tier}/>)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

window.WebLibrary = WebLibrary;
