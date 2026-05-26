// biblioteca/mobile.jsx — Mobile (iPhone) surface for "Mi biblioteca".

const {
  PSICO_BOOKS: BOOKS_M, PSICO_AUTHORS: AUTH_M, PSICO_CATEGORIES: CATS_M,
  PSICO_RECOS: RECOS_M, MOOD_NAMES: MOOD_M, MOOD_SWATCH: SW_M,
} = window;

function MobMoodPill({ mood }) {
  return (
    <span className="mob-mood">
      <span className="mob-mood-dot" style={{ background: SW_M[mood] }}></span>
      {MOOD_M[mood]}
    </span>
  );
}

function MobContinue({ book }) {
  if (!book) return null;
  const pct = Math.round((book.progress || 0) * 100);
  return (
    <div className="mob-continue">
      <div className={"mob-continue-cover cover-" + (book.cover || "mixed")}></div>
      <div className="mob-continue-body">
        <span className="mob-continue-eyebrow">Continúa · {book.lastRead}</span>
        <div className="mob-continue-title">{book.title}</div>
        <div className="mob-continue-next">{book.nextChapter}</div>
        <div className="mob-continue-bar"><div className="mob-continue-bar-fill" style={{ width: pct + "%" }}/></div>
      </div>
    </div>
  );
}

function MobReco({ reco }) {
  const b = BOOKS_M.find((x) => x.id === reco.bookId);
  if (!b) return null;
  const a = AUTH_M[b.author];
  return (
    <div className="mob-reco">
      <div className="mob-reco-row">
        <div className={"mob-reco-cover cover-" + (b.cover || "mixed")}></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span className="mob-reco-badge">✦ {reco.badge}</span>
          <div className="mob-reco-title">{b.title}</div>
          <div style={{ font: "500 11px/1.2 var(--font-sans)", color: "var(--color-warm-500)" }}>{a.name}</div>
        </div>
      </div>
      <div className="mob-reco-reason">{reco.reason}</div>
    </div>
  );
}

function MobCard({ book, tier }) {
  const locked = book.plan !== "FREE" && tier !== "pro";
  const pct = Math.round((book.progress || 0) * 100);
  return (
    <div className="mob-card">
      <div className={"mob-card-cover cover-" + (book.cover || "mixed")}>
        <span className="mob-card-cover-glyph">📖</span>
        {locked && (
          <div className="mob-card-lock">
            <span style={{ fontSize: 20 }}>🔒</span>
            <span className="mob-card-lock-lbl">Requiere Pro</span>
          </div>
        )}
      </div>
      <div className="mob-card-body">
        <div className="mob-card-title">{book.title}</div>
        {locked ? (
          <div className="mob-card-plan-pill">🔒 Plan Pro</div>
        ) : (
          <div className="mob-card-meta">{book.chapters} caps · {book.duration}</div>
        )}
        {pct > 0 && !locked && (
          <div className="mob-card-progress">
            <div className="mob-card-progress-fill" style={{ width: pct + "%" }}></div>
          </div>
        )}
      </div>
    </div>
  );
}

function MobUpgrade() {
  return (
    <div className="mob-upgrade">
      <span className="mob-upgrade-glyph">⭐</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mob-upgrade-title">Desbloquea todo</div>
        <p className="mob-upgrade-sub">Actualiza a Pro · $7/mes</p>
      </div>
      <span className="mob-upgrade-arrow">→</span>
    </div>
  );
}

function MobTabbar() {
  const tabs = [
    { id: "home",   icon: "🏠", lbl: "Inicio" },
    { id: "books",  icon: "📚", lbl: "Libros", on: true },
    { id: "plan",   icon: "💎", lbl: "Mi plan" },
    { id: "perfil", icon: "👤", lbl: "Perfil" },
  ];
  return (
    <nav className="mob-tabbar" aria-label="Tabs">
      {tabs.map((t) => (
        <span key={t.id} className={"mob-tab " + (t.on ? "is-on" : "")}>
          <span className="mob-tab-icon">{t.icon}</span>
          <span className="mob-tab-lbl">{t.lbl}</span>
        </span>
      ))}
    </nav>
  );
}

function MobileLibrary({ tweaks }) {
  const tier = tweaks.tier;
  const mood = tweaks.mood;
  const showContinue = tweaks.showContinue;
  const showRecos = tweaks.showRecos;
  const sort = tweaks.sort;
  const [filter, setFilter] = React.useState("all");

  const continueBook = BOOKS_M.find((b) => b.progress > 0);
  let books = BOOKS_M;
  if (filter === "empezados") books = books.filter((b) => b.progress > 0);
  else if (filter === "marina") {
    const recoIds = new Set(RECOS_M.map((r) => r.bookId));
    books = books.filter((b) => recoIds.has(b.id));
  } else if (filter !== "all") books = books.filter((b) => b.category.includes(filter));

  books = [...books];
  if (sort === "alpha") books.sort((a, b) => a.title.localeCompare(b.title, "es"));
  else if (sort === "marina") {
    const order = new Map(RECOS_M.map((r, i) => [r.bookId, i]));
    books.sort((a, b) => (order.has(a.id) ? order.get(a.id) : 999) - (order.has(b.id) ? order.get(b.id) : 999));
  } else {
    books.sort((a, b) => (b.progress > 0 ? 1 : 0) - (a.progress > 0 ? 1 : 0));
  }

  return (
    <div className="mob">
      <div className="mob-scroll">
        <div className="mob-h">
          <div>
            <h1 className="mob-h-title">Libros</h1>
            <p className="mob-h-sub">
              {tier === "pro" ? "Catálogo completo · 8 libros" : "1 gratuito · 7 con Pro"}
            </p>
          </div>
          <MobMoodPill mood={mood}/>
        </div>

        <div className="mob-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z"/><path d="m20 20-3.5-3.5"/>
          </svg>
          Buscar libros, autores…
        </div>

        <div className="mob-chips">
          {CATS_M.map((c) => (
            <button
              key={c.id}
              className={"mob-chip " + (filter === c.id ? "is-on" : "")}
              onClick={() => setFilter(c.id)}
              type="button"
            >
              {c.label}
            </button>
          ))}
        </div>

        {showContinue && continueBook && <MobContinue book={continueBook}/>}

        {showRecos && filter === "all" && (
          <>
            <div className="mob-section-h">
              <h3>Para ti · Eco</h3>
              <a href="#">Ver todo</a>
            </div>
            <div className="mob-recos">
              {RECOS_M.map((r) => <MobReco key={r.bookId} reco={r}/>)}
            </div>
          </>
        )}

        <div className="mob-section-h">
          <h3>
            {filter === "all"      ? "Todo el catálogo"
            : filter === "empezados" ? "Empezados"
            : filter === "marina"    ? "Para ti"
            : CATS_M.find((c) => c.id === filter)?.label}
          </h3>
          <a href="#">Ordenar</a>
        </div>
        <div className="mob-grid">
          {books.map((b) => <MobCard key={b.id} book={b} tier={tier}/>)}
        </div>

        {tier === "free" && <MobUpgrade/>}
      </div>
      <MobTabbar/>
    </div>
  );
}

window.MobileLibrary = MobileLibrary;
