// diario/web.jsx — Diario (web dashboard surface).

const {
  DIARIO_USER, DIARIO_TYPES, DIARIO_ENTRIES, DIARIO_MOODMAP, DIARIO_WEEKDAYS,
  DIARIO_TAGS, DIARIO_PROMPTS, MOOD_SWATCH, MOOD_NAMES,
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
  search: <Ico d={["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "m20 20-3.5-3.5"]}/>,
  plus:   <Ico d="M12 5v14M5 12h14" sw={2.2}/>,
  pen:    <Ico d={["M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", "M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"]}/>,
  arrow:  <Ico d="M5 12h14M13 6l6 6-6 6"/>,
  more:   <Ico d={["M12 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z","M5 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z","M19 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"]} sw={2.4}/>,
  bookm:  <Ico d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>,
  attach: <Ico d="M21 11.5 12.7 19.8a5.5 5.5 0 1 1-7.8-7.8L14 3a3.7 3.7 0 0 1 5.2 5.2L9.5 18a2 2 0 0 1-2.8-2.8L16 5.9"/>,
  smile:  <Ico d={["M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z","M8 14s1.5 2 4 2 4-2 4-2","M9 9h.01M15 9h.01"]}/>,
};

// ── Sidebar ─────────────────────────────────────────────────────────────
function WebSidebar({ tier }) {
  const N = window.Icons;
  // We add "Diario" as a sidebar item to integrate with the rest of the dashboard.
  const items = [
    { icon: <N.home    />, label: "Inicio" },
    { icon: <N.book    />, label: "Mi biblioteca" },
    { icon: <N.eco     />, label: "Eco" },
    { icon: <N.diary   />, label: "Diario", on: true },
    { icon: <N.plan    />, label: "Mi plan" },
    { icon: <N.user    />, label: "Perfil" },
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

// ── Composer ────────────────────────────────────────────────────────────
function Composer({ defaultMood }) {
  const [text, setText] = React.useState("");
  const [mood, setMood] = React.useState(defaultMood || "calma");
  const [tags] = React.useState([]);
  return (
    <section className="web-composer">
      <div className="web-composer-row">
        <button className="web-composer-mood" type="button">
          <span className="web-composer-mood-dot" style={{ background: MOOD_SWATCH[mood] }}></span>
          {MOOD_NAMES[mood]} <span style={{ color: "var(--color-warm-400)" }}>·</span>
          <span style={{ font: "500 11.5px/1 var(--font-mono)", color: "var(--color-warm-500)" }}>cambiar</span>
        </button>
        <span style={{ font: "500 11.5px/1 var(--font-mono)", color: "var(--color-warm-500)" }}>
          {new Date().toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" })} · 21:14
        </span>
      </div>
      <textarea
        className="web-composer-input"
        placeholder="¿Cómo llegas hoy? Escribe lo que necesites — nadie lo lee más que tú."
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="web-composer-prompts">
        {DIARIO_PROMPTS.map((p, i) => (
          <button key={i} className="web-composer-prompt" onClick={() => setText(p + "\n\n")} type="button">
            {p}
          </button>
        ))}
      </div>
      <div className="web-composer-foot">
        <div className="web-composer-foot-l">
          <span>🔒 Privado · solo tú</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="web-composer-extras">
            <button className="web-composer-extra" aria-label="Adjuntar">{I.attach}</button>
            <button className="web-composer-extra" aria-label="Etiquetas">#</button>
            <button className="web-composer-extra" aria-label="Más">{I.more}</button>
          </div>
          <button className="web-composer-save" disabled={!text.trim()}>
            {I.pen} Guardar entrada
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Entry components by type ────────────────────────────────────────────
function EntryHead({ e }) {
  const t = DIARIO_TYPES[e.type];
  return (
    <header className="entry-head">
      <span className={"entry-type " + e.type} style={{ ["--type-color"]: t.color }}>
        {t.icon} {t.label}
      </span>
      <span className="entry-time">{e.fullDate.split(" · ")[1] || ""}</span>
      <span className="entry-mood-name">
        <span className="entry-mood-dot" style={{ background: MOOD_SWATCH[e.mood] }}></span>
        {MOOD_NAMES[e.mood]}
      </span>
      <span className="entry-actions">
        <button className="entry-action" aria-label="Marcador">{I.bookm}</button>
        <button className="entry-action" aria-label="Más">{I.more}</button>
      </span>
    </header>
  );
}

function EntryManual({ e }) {
  return (
    <article className="entry" style={{ ["--mood-bg"]: MOOD_SWATCH[e.mood] }}>
      <EntryHead e={e}/>
      {e.title && <h3 className="entry-title">{e.title}</h3>}
      <p className="entry-body">{e.body}</p>
      {e.tags && e.tags.length > 0 && (
        <div className="entry-tags">
          {e.tags.map((t) => <span key={t} className="entry-tag">#{t}</span>)}
        </div>
      )}
    </article>
  );
}

function EntryReflexion({ e }) {
  return (
    <article className="entry is-reflexion" style={{ ["--mood-bg"]: MOOD_SWATCH[e.mood] }}>
      <EntryHead e={e}/>
      <div>
        <div className="entry-reflex-q">{e.promptQ}</div>
        <div className="entry-reflex-a">{e.body}</div>
        {e.note && <p className="entry-reflex-note">"{e.note}"</p>}
      </div>
      {e.tags && e.tags.length > 0 && (
        <div className="entry-tags">
          {e.tags.map((t) => <span key={t} className="entry-tag">#{t}</span>)}
        </div>
      )}
    </article>
  );
}

function EntryEco({ e }) {
  return (
    <article className="entry is-eco" style={{ ["--mood-bg"]: MOOD_SWATCH[e.mood] }}>
      <EntryHead e={e}/>
      {e.title && <h3 className="entry-title">{e.title}</h3>}
      <p className="entry-body">{e.body}</p>
      {e.ecoConversationLink && (
        <a className="entry-eco-link" href="#">
          <span className="eco-glyph" style={{ width: 14, height: 14, fontSize: 8 }}>✦</span>
          {e.ecoConversationLink}
        </a>
      )}
      {e.tags && e.tags.length > 0 && (
        <div className="entry-tags">
          {e.tags.map((t) => <span key={t} className="entry-tag">#{t}</span>)}
        </div>
      )}
    </article>
  );
}

function EntryHighlight({ e }) {
  return (
    <article className="entry" style={{ ["--mood-bg"]: MOOD_SWATCH[e.mood] }}>
      <EntryHead e={e}/>
      <div className="entry-quote-wrap">
        <span className={"entry-quote-cover cover-" + (e.book?.cover || "cool")}></span>
        <div className="entry-quote-meta">
          <div className="entry-quote-book">{e.book?.title}</div>
          <div className="entry-quote-chapter">{e.book?.chapter}</div>
        </div>
      </div>
      <p className="entry-quote">{e.quote}</p>
      <p className="entry-quote-reaction">{e.body}</p>
      {e.tags && e.tags.length > 0 && (
        <div className="entry-tags">
          {e.tags.map((t) => <span key={t} className="entry-tag">#{t}</span>)}
        </div>
      )}
    </article>
  );
}

function Entry({ e }) {
  if (e.type === "manual")    return <EntryManual e={e}/>;
  if (e.type === "reflexion") return <EntryReflexion e={e}/>;
  if (e.type === "eco")       return <EntryEco e={e}/>;
  if (e.type === "highlight") return <EntryHighlight e={e}/>;
  return null;
}

// ── Filters ─────────────────────────────────────────────────────────────
function Filters({ active, onChange }) {
  const filters = [
    { id: "all",       label: "Todas",         count: DIARIO_ENTRIES.length },
    { id: "manual",    label: "Mías",          count: DIARIO_ENTRIES.filter((e) => e.type === "manual").length },
    { id: "reflexion", label: "Reflexiones",   count: DIARIO_ENTRIES.filter((e) => e.type === "reflexion").length },
    { id: "eco",       label: "Con Eco",       count: DIARIO_ENTRIES.filter((e) => e.type === "eco").length },
    { id: "highlight", label: "Subrayados",    count: DIARIO_ENTRIES.filter((e) => e.type === "highlight").length },
  ];
  return (
    <div className="web-filters">
      {filters.map((f) => (
        <button
          key={f.id}
          className={"web-chip " + (active === f.id ? "is-on" : "")}
          onClick={() => onChange(f.id)}
          type="button"
        >
          {f.label}
          <span className="web-chip-count">{f.count}</span>
        </button>
      ))}
    </div>
  );
}

// ── Rail ────────────────────────────────────────────────────────────────
function MoodMap() {
  return (
    <section>
      <h3 className="web-rail-h">Mood en el tiempo · 4 semanas</h3>
      <div className="web-moodmap">
        {DIARIO_MOODMAP.map((week, wi) => (
          <div key={wi} className="web-moodmap-wkrow">
            {week.map((m, di) => {
              const isToday = wi === DIARIO_MOODMAP.length - 1 && di === 4; // viernes
              return (
                <div
                  key={di}
                  className={
                    "web-moodmap-cell " +
                    (m ? "has-mood " : "") +
                    (isToday ? "is-today" : "")
                  }
                  style={m ? { ["--mood-bg"]: MOOD_SWATCH[m] } : {}}
                  title={m ? MOOD_NAMES[m] : "Sin entrada"}
                />
              );
            })}
          </div>
        ))}
        <div className="web-moodmap-legend">
          {DIARIO_WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}
        </div>
      </div>
      <div className="web-moodmap-key">
        {Object.keys(MOOD_NAMES).map((m) => (
          <span key={m} className="web-moodmap-key-item">
            <span className="web-moodmap-key-dot" style={{ background: MOOD_SWATCH[m] }}></span>
            {MOOD_NAMES[m]}
          </span>
        ))}
      </div>
    </section>
  );
}

function TagsCloud() {
  return (
    <section>
      <h3 className="web-rail-h">Temas frecuentes</h3>
      <div className="web-tags">
        {DIARIO_TAGS.map((t) => (
          <button key={t.tag} className="web-tag">
            #{t.tag}
            <span className="web-tag-count">{t.count}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function StatsBlock() {
  return (
    <section>
      <h3 className="web-rail-h">Tu mes</h3>
      <div className="web-rail-stats">
        <div className="web-rail-stat">
          <div className="web-rail-stat-val">{DIARIO_USER.thisMonth}</div>
          <div className="web-rail-stat-lbl">entradas en mayo</div>
        </div>
        <div className="web-rail-stat">
          <div className="web-rail-stat-val">{DIARIO_USER.streakDays}<small> días</small></div>
          <div className="web-rail-stat-lbl">racha actual</div>
        </div>
      </div>
      <div className="web-streak" style={{ marginTop: 10 }}>
        <span className="web-streak-glyph">🔥</span>
        <div className="web-streak-meta">
          <div className="web-streak-num">6 días</div>
          <div className="web-streak-sub">No rompas el ritmo — bastan dos líneas.</div>
        </div>
      </div>
    </section>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="web-empty">
      <span className="web-empty-art">✎</span>
      <h2>Tu diario empieza con una frase.</h2>
      <p>
        No tiene que ser bonita ni completa. Solo tuya.
        Te dejo unas preguntas para empezar — usa la que más te llame.
      </p>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────
function WebDiario({ tweaks }) {
  const [filter, setFilter] = React.useState("all");

  let entries = DIARIO_ENTRIES;
  if (tweaks.state === "empty")  entries = [];
  else if (filter !== "all")     entries = entries.filter((e) => e.type === filter);

  // Group by date label for headers
  const grouped = [];
  let lastDate = null;
  for (const e of entries) {
    if (e.date !== lastDate) {
      grouped.push({ kind: "header", label: e.date, fullDate: e.fullDate.split(" · ")[0] });
      lastDate = e.date;
    }
    grouped.push({ kind: "entry", entry: e });
  }

  return (
    <div className="web">
      <WebSidebar tier={tweaks.tier}/>
      <main className="web-main">
        <header className="web-top">
          <div className="web-top-title">Diario</div>
          <div className="web-top-r">
            <label className="web-search">
              {I.search}
              <input placeholder="Buscar en tu diario…"/>
            </label>
            <button className="web-cta primary">{I.plus} Nueva entrada</button>
          </div>
        </header>

        <div className="web-body">
          <div className="web-stream">
            <div className="web-stream-inner">
              <div className="web-hello">
                <div>
                  <span className="web-hello-eyebrow">✎ Tu cuaderno</span>
                  <h1>Lo que vienes diciéndote.</h1>
                  <p className="web-hello-sub">
                    {DIARIO_USER.totalEntries} entradas · empezaste hace 6 meses.
                    Privado por defecto — ni siquiera Eco lee tu diario a menos que tú lo invites.
                  </p>
                </div>
                <span className="web-hello-count">{entries.length} de {DIARIO_USER.totalEntries}</span>
              </div>

              <Filters active={filter} onChange={setFilter}/>

              {tweaks.showComposer && <Composer defaultMood={tweaks.mood}/>}

              {entries.length === 0 ? (
                <EmptyState/>
              ) : (
                grouped.map((g, i) => (
                  g.kind === "header"
                    ? <div key={"h" + i} className="web-dateh">{g.label} · <span style={{ color: "var(--color-warm-400)" }}>{g.fullDate}</span></div>
                    : <Entry key={g.entry.id} e={g.entry}/>
                ))
              )}
            </div>
          </div>

          <aside className="web-rail">
            <StatsBlock/>
            <MoodMap/>
            <TagsCloud/>
          </aside>
        </div>
      </main>
    </div>
  );
}

window.WebDiario = WebDiario;
