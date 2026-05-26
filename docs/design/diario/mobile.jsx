// diario/mobile.jsx — Diario iPhone surface.

const {
  DIARIO_ENTRIES: EM, DIARIO_USER: UM, DIARIO_TYPES: TM,
  MOOD_SWATCH: SW, MOOD_NAMES: NM,
} = window;

function MI({ d, size = 14, sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const MICO = {
  back:   <MI d="M15 6l-6 6 6 6"/>,
  search: <MI d={["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z","m20 20-3.5-3.5"]}/>,
};

function MobTabbar() {
  // Diario is reached from Inicio's shortcuts in mobile.
  // We surface it here as an active section anyway, on top of the "Inicio" tab.
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

function MobEntry({ e }) {
  const t = TM[e.type];
  const cls = "mob-entry" + (e.type === "eco" ? " is-eco" : "");
  return (
    <article className={cls} style={{ ["--mood-bg"]: SW[e.mood] }}>
      <header className="mob-entry-head">
        <span className={"mob-entry-type " + e.type}>{t.icon} {t.label}</span>
        <span className="mob-entry-time">{e.fullDate.split(" · ")[1] || ""}</span>
      </header>
      {e.type === "reflexion" ? (
        <>
          <div className="mob-entry-reflex-q">{e.promptQ}</div>
          <div className="mob-entry-reflex-a">{e.body}</div>
          {e.note && <p style={{ font: "400 11.5px/1.5 'Newsreader', Georgia, serif", color: "var(--color-warm-600)", margin: "6px 0 0", fontStyle: "italic" }}>"{e.note}"</p>}
        </>
      ) : e.type === "highlight" ? (
        <>
          <div className="mob-entry-quote">{e.quote}</div>
          <div className="mob-entry-quote-book">{e.book?.title} · {e.book?.chapter}</div>
          <p className="mob-entry-body" style={{ marginTop: 8 }}>{e.body}</p>
        </>
      ) : (
        <>
          {e.title && <h3 className="mob-entry-title">{e.title}</h3>}
          <p className="mob-entry-body">{e.body}</p>
          {e.ecoConversationLink && <a className="mob-entry-eco-link" href="#">✦ {e.ecoConversationLink}</a>}
        </>
      )}
      {e.tags && e.tags.length > 0 && (
        <div className="mob-entry-tags">
          {e.tags.map((t) => <span key={t} className="mob-entry-tag">#{t}</span>)}
        </div>
      )}
    </article>
  );
}

function MobileDiario({ tweaks }) {
  const [filter, setFilter] = React.useState("all");

  let entries = EM;
  if (tweaks.state === "empty") entries = [];
  else if (filter !== "all") entries = entries.filter((e) => e.type === filter);

  // Group by date
  const grouped = [];
  let lastDate = null;
  for (const e of entries) {
    if (e.date !== lastDate) {
      grouped.push({ kind: "header", label: e.date, fullDate: e.fullDate.split(" · ")[0] });
      lastDate = e.date;
    }
    grouped.push({ kind: "entry", entry: e });
  }

  const filters = [
    { id: "all", label: "Todas" },
    { id: "manual", label: "Mías" },
    { id: "reflexion", label: "Reflexiones" },
    { id: "eco", label: "Con Eco" },
    { id: "highlight", label: "Subrayados" },
  ];

  return (
    <div className="mob">
      <header className="mob-top">
        <button className="mob-top-back" aria-label="Atrás">{MICO.back}</button>
        <div className="mob-top-title">Diario</div>
        <button className="mob-top-search" aria-label="Buscar">{MICO.search}</button>
      </header>

      <div className="mob-scroll">
        <div className="mob-h">
          <h1 className="mob-h-title">Tu cuaderno</h1>
          <p className="mob-h-sub">
            {UM.totalEntries} entradas · privado · solo tú.
          </p>
        </div>

        <div className="mob-stats">
          <div className="mob-stat">
            <div className="mob-stat-val">{UM.thisMonth}</div>
            <div className="mob-stat-lbl">Mayo</div>
          </div>
          <div className="mob-stat">
            <div className="mob-stat-val">🔥 {UM.streakDays}</div>
            <div className="mob-stat-lbl">Racha</div>
          </div>
          <div className="mob-stat">
            <div className="mob-stat-val">{UM.totalEntries}</div>
            <div className="mob-stat-lbl">Total</div>
          </div>
        </div>

        <div className="mob-filters">
          {filters.map((f) => (
            <button
              key={f.id}
              className={"mob-chip " + (filter === f.id ? "is-on" : "")}
              onClick={() => setFilter(f.id)}
              type="button"
            >{f.label}</button>
          ))}
        </div>

        {entries.length === 0 ? (
          <div className="mob-empty">
            <span className="mob-empty-art">✎</span>
            <h2>Tu diario empieza con una frase.</h2>
            <p>No tiene que ser bonita ni completa. Solo tuya.</p>
          </div>
        ) : (
          <>
            {grouped.map((g, i) => (
              g.kind === "header"
                ? <div key={"h" + i} className="mob-dateh">{g.label} · {g.fullDate}</div>
                : (
                  <div key={g.entry.id} className="mob-entries">
                    <MobEntry e={g.entry}/>
                  </div>
                )
            ))}
          </>
        )}
      </div>

      <button className="mob-fab" aria-label="Nueva entrada">+</button>
      <MobTabbar/>
    </div>
  );
}

window.MobileDiario = MobileDiario;
