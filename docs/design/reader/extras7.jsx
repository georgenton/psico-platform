// reader/extras7.jsx — Sixth batch: items #1 content warnings, #7 author page,
// #10 habit calendar, #15 contextual reminders. (#17 animation system is in
// extras7.css only — no JS.)

const { READER_AUTHOR_BIO } = window;

function H7I({ d, size = 16, sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const H7 = {
  x:        <H7I d="M6 6l12 12M6 18L18 6"/>,
  arrow:    <H7I d="M5 12h14M13 6l6 6-6 6"/>,
  back:     <H7I d="M15 6l-6 6 6 6"/>,
  shield:   <H7I d="M12 2l8 4v6c0 5-4 9-8 10-4-1-8-5-8-10V6z"/>,
  heart:    <H7I d="M12 21s-7-4.5-9.3-9.3a5.3 5.3 0 0 1 9.3-5.1 5.3 5.3 0 0 1 9.3 5.1C19 16.5 12 21 12 21z"/>,
  flame:    <H7I d="M12 2C10 6 6 8 6 12a6 6 0 0 0 12 0c0-2-1-3-2-4 1 3-1 5-2 5 0-4-2-7-2-11z"/>,
  cal:      <H7I d={["M5 4h14a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z","M16 2v4","M8 2v4","M4 10h16"]}/>,
  bell:     <H7I d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9zM10 21a2 2 0 0 0 4 0"/>,
  clock:    <H7I d={["M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z","M12 7v5l3 2"]}/>,
  moon:     <H7I d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>,
  sun:      <H7I d={["M12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z","M12 2v3","M12 19v3","M2 12h3","M19 12h3","M4.6 4.6l2 2","M17.4 17.4l2 2","M4.6 19.4l2-2","M17.4 6.6l2-2"]} sw={1.5}/>,
  check:    <H7I d="M5 12l5 5L20 7" sw={2.4}/>,
  share:    <H7I d={["M16 5l-4-4-4 4","M12 1v14","M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"]}/>,
  star:     <H7I d="M12 2l3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z" sw={1.2}/>,
  mic:      <H7I d={["M12 14a3 3 0 0 1-3-3V6a3 3 0 0 1 6 0v5a3 3 0 0 1-3 3z","M5 11a7 7 0 0 0 14 0","M12 18v3"]}/>,
  book:     <H7I d={["M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z","M9 3v18"]}/>,
  external: <H7I d={["M14 4h6v6","M20 4l-9 9","M9 5H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"]}/>,
  ig:       <H7I d={["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z","M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z","M17 6.5h.01"]}/>,
  globe:    <H7I d={["M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z","M3 12h18","M12 3a13 13 0 0 1 0 18","M12 3a13 13 0 0 0 0 18"]} sw={1.4}/>,
  pause:    <H7I d={["M9 5h2v14H9z","M13 5h2v14h-2z"]} sw={0}/>,
};

// ════════════════════════════════════════════════════════════════════════
// #1  Content warning — pre-chapter card with three actions
// ════════════════════════════════════════════════════════════════════════
function ContentWarningCard({ kind = "tristeza", onContinue, onLater, onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  const meta = {
    suicidio: {
      eyebrow: "Pausa antes de empezar",
      title: "Este capítulo habla de ideación suicida",
      body: "Marina lo escribe con cuidado clínico, pero los temas pueden tocar fibras vivas. Si hoy no es buen día, está bien dejarlo para mañana.",
      tags: ["Ideación suicida", "Pensamientos autolesivos", "Crisis"],
      safe: "Si en algún momento necesitas pausar, hay una línea de ayuda siempre a un toque.",
    },
    duelo: {
      eyebrow: "Pausa antes de empezar",
      title: "Este capítulo habla de duelo y pérdida",
      body: "Algunos pasajes hablan de muerte cercana. Marina escribe desde su práctica con familias en duelo, con cuidado pero sin endulzar.",
      tags: ["Duelo", "Muerte", "Pérdida"],
      safe: "Puedes saltar entre lecciones — la 02 y la 04 son las más intensas.",
    },
    tristeza: {
      eyebrow: "Pausa antes de empezar",
      title: "Este capítulo habla de tristeza prolongada",
      body: "Toca diferencias entre tristeza y depresión, señales para mirar con calma, y cuándo buscar ayuda. No diagnostica — invita a notar.",
      tags: ["Tristeza", "Depresión", "Autoobservación"],
      safe: "Si reconocer cosas en ti se vuelve intenso, hay una pausa guiada disponible al final.",
    },
    abuso: {
      eyebrow: "Pausa antes de empezar",
      title: "Este capítulo menciona experiencias de abuso",
      body: "Sin descripciones gráficas, pero sí relatos compuestos (anonimizados) de consultas reales sobre violencia psicológica y abuso temprano.",
      tags: ["Abuso", "Violencia psicológica", "Trauma"],
      safe: "Puedes leer en pareja con alguien de confianza — Marina sugiere no leer este capítulo de noche.",
    },
  }[kind];

  return (
    <div className={"ext-overlay ext7-warn-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext7-warn " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={meta.title}
      >
        <button className="ext-iconclose ext7-warn-close" aria-label="Cerrar" onClick={onClose}>{H7.x}</button>

        <div className="ext7-warn-glyph" aria-hidden>
          <span className="ext7-warn-glyph-inner">{H7.shield}</span>
        </div>

        <span className="ext-eyebrow ext7-warn-eyebrow">{meta.eyebrow}</span>
        <h2 className="ext7-warn-title">{meta.title}</h2>
        <p className="ext7-warn-body">{meta.body}</p>

        <div className="ext7-warn-tags">
          {meta.tags.map((t) => <span key={t} className="ext7-warn-tag">{t}</span>)}
        </div>

        <div className="ext7-warn-safe">
          <span className="ext7-warn-safe-icon">{H7.heart}</span>
          <span>{meta.safe}</span>
        </div>

        <div className="ext7-warn-actions">
          <button className="ext-btn-ghost" onClick={onLater}>Dejarlo para mañana</button>
          <button className="ext-btn-primary" onClick={onContinue}>
            Empezar con cuidado {H7.arrow}
          </button>
        </div>

        <button className="ext7-warn-tone">
          ¿Quieres revisar tu tono de avisos? Ajustar avisos sensibles
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// #7  Author page — Marina's public profile
// ════════════════════════════════════════════════════════════════════════
function AuthorPage({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  const books = [
    { title: "Emociones en construcción", subtitle: "Manual práctico de regulación emocional", chap: 12, year: "2024", state: "current", cover: "lavender" },
    { title: "Familias ensambladas",       subtitle: "Cuando dos historias hacen una casa",      chap: 8,  year: "2022", state: "done",    cover: "sage" },
    { title: "El duelo que no se nombra",  subtitle: "Pérdidas invisibles, dolores que cuentan", chap: 10, year: "2020", state: "ready",   cover: "warm" },
  ];
  const stats = [
    { num: "18",    lbl: "Años de práctica" },
    { num: "3",     lbl: "Libros publicados" },
    { num: "42k",   lbl: "Lectores activos" },
    { num: "4.8",   lbl: "Rating promedio", glyph: H7.star },
  ];
  const talks = [
    { date: "12 dic", time: "7:00 PM ECT",   title: "Tristeza y duelo en familia",        place: "En vivo · Psico Platform", tag: "Gratis · público" },
    { date: "20 dic", time: "Cuándo quieras", title: "Episodio · 'Ojos abiertos' #47",     place: "Podcast · Spotify",         tag: "1h 24m" },
    { date: "8 ene",  time: "TED Cuenca",     title: "La sensibilidad como instrumento",    place: "Charla pública",            tag: "20 min · video" },
  ];
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext7-author " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Dra. Marina Salazar"
      >
        <header className="ext7-author-cover">
          <button className="ext7-author-back" aria-label="Cerrar" onClick={onClose}>{H7.x}</button>
          <button className="ext7-author-share" aria-label="Compartir">{H7.share}</button>
          <div className="ext7-author-cover-bg" aria-hidden></div>
        </header>

        <div className="ext7-author-id">
          <div className="ext7-author-avatar">MS</div>
          <div className="ext7-author-id-meta">
            <h2 className="ext7-author-name">Dra. Marina Salazar</h2>
            <p className="ext7-author-role">
              Psicóloga clínica · Quito, Ecuador <span className="ext7-author-credentials">Reg. EC-PSI-04812</span>
            </p>
            <div className="ext7-author-bio">
              <p>
                Trabajo con regulación emocional y duelo. 18 años en consulta privada y supervisión clínica.
                Escribo en Psico Platform porque la psicoeducación buena no debería costar lo que cuesta una sesión.
              </p>
              <p>
                Creo que la sensibilidad es un instrumento, no una debilidad. Que la tristeza llega para contarnos algo.
                Y que el cuerpo dice antes que la palabra.
              </p>
            </div>
            <div className="ext7-author-actions">
              <button className="ext-btn-primary">Seguir a Marina {H7.arrow}</button>
              <button className="ext-btn-ghost">Agendar consulta privada</button>
              <a href="#" className="ext7-author-external">marinasalazar.com {H7.external}</a>
            </div>
          </div>
        </div>

        <div className="ext7-author-stats">
          {stats.map((s, i) => (
            <div key={i} className="ext7-author-stat">
              <div className="ext7-author-stat-num">
                {s.glyph && <span className="ext7-author-stat-glyph">{s.glyph}</span>}
                {s.num}
              </div>
              <div className="ext7-author-stat-lbl">{s.lbl}</div>
            </div>
          ))}
        </div>

        <section className="ext7-author-section">
          <header className="ext7-author-section-head">
            <h3 className="ext7-author-section-h">Libros publicados</h3>
            <span className="ext7-author-section-meta">3 libros · 30 capítulos</span>
          </header>
          <div className="ext7-author-books">
            {books.map((b, i) => (
              <button key={i} className={"ext7-author-book is-" + b.state}>
                <div className={"ext7-author-book-cover c-" + b.cover}>
                  <div className="ext7-author-book-cover-inner">
                    <span className="ext7-author-book-cover-eyebrow">{b.year}</span>
                    <span className="ext7-author-book-cover-title">{b.title}</span>
                    <span className="ext7-author-book-cover-author">M. SALAZAR</span>
                  </div>
                </div>
                <div className="ext7-author-book-meta">
                  <div className="ext7-author-book-state">
                    {b.state === "current" && <span className="ext7-author-book-tag is-current">Leyendo · Cap. 5/12</span>}
                    {b.state === "done"    && <span className="ext7-author-book-tag is-done">{H7.check} Leído</span>}
                    {b.state === "ready"   && <span className="ext7-author-book-tag is-ready">No empezado</span>}
                  </div>
                  <div className="ext7-author-book-title">{b.title}</div>
                  <div className="ext7-author-book-sub">{b.subtitle}</div>
                  <div className="ext7-author-book-foot">{b.chap} capítulos</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="ext7-author-section">
          <header className="ext7-author-section-head">
            <h3 className="ext7-author-section-h">Charlas, podcasts y eventos</h3>
            <a href="#" className="ext7-author-section-link">Ver agenda completa →</a>
          </header>
          <div className="ext7-author-talks">
            {talks.map((t, i) => (
              <article key={i} className="ext7-author-talk">
                <div className="ext7-author-talk-date">
                  <div className="ext7-author-talk-day">{t.date}</div>
                  <div className="ext7-author-talk-time">{t.time}</div>
                </div>
                <div className="ext7-author-talk-meta">
                  <div className="ext7-author-talk-title">{t.title}</div>
                  <div className="ext7-author-talk-place">{t.place}</div>
                </div>
                <div className="ext7-author-talk-tag">{t.tag}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="ext7-author-section">
          <header className="ext7-author-section-head">
            <h3 className="ext7-author-section-h">Frases de Marina</h3>
            <span className="ext7-author-section-meta">Las más compartidas por la comunidad</span>
          </header>
          <div className="ext7-author-quotes">
            <blockquote className="ext7-author-quote">
              "La tristeza no es un error del sistema. Es el sistema funcionando."
              <cite>— Emociones en construcción, Cap. 5</cite>
            </blockquote>
            <blockquote className="ext7-author-quote">
              "La cultura — no tú — confundió finura con fragilidad."
              <cite>— Emociones en construcción, Cap. 5</cite>
            </blockquote>
            <blockquote className="ext7-author-quote">
              "Buscar ayuda no es rendirse. Es lo opuesto: es tomar en serio lo que sentís."
              <cite>— Emociones en construcción, Cap. 5</cite>
            </blockquote>
          </div>
        </section>

        <section className="ext7-author-section">
          <header className="ext7-author-section-head">
            <h3 className="ext7-author-section-h">Encontrá a Marina en otros lugares</h3>
          </header>
          <div className="ext7-author-links">
            <a href="#" className="ext7-author-link">{H7.globe} marinasalazar.com</a>
            <a href="#" className="ext7-author-link">{H7.ig} @dramarinasalazar</a>
            <a href="#" className="ext7-author-link">{H7.mic} Podcast 'Ojos abiertos'</a>
          </div>
        </section>

        <footer className="ext7-author-foot">
          <p>
            Los textos de Marina en Psico Platform son piscoeducación, no terapia. Si necesitás acompañamiento clínico,
            <a href="#"> agendá una consulta</a> o llamá a tu línea local de ayuda.
          </p>
        </footer>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// #10  Habit calendar — yearly heatmap (GitHub-style) with metadata
// ════════════════════════════════════════════════════════════════════════
function generateYearData() {
  // 52 weeks × 7 days = 364 cells. Each cell: minutes read that day.
  // Seed deterministic synthetic data so the same shape renders every time.
  const data = [];
  let seed = 1234;
  const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let w = 0; w < 52; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      // Higher activity in recent weeks
      const recencyBoost = w > 40 ? 1.5 : w > 30 ? 1.1 : 0.6;
      const weekendDip = (d === 5 || d === 6) ? 0.7 : 1;
      const r = rng() * recencyBoost * weekendDip;
      let min = 0;
      if (r < 0.4) min = 0;
      else if (r < 0.6) min = Math.floor(rng() * 8) + 2;       // 2-10 min
      else if (r < 0.8) min = Math.floor(rng() * 15) + 10;     // 10-25 min
      else if (r < 0.93) min = Math.floor(rng() * 20) + 25;    // 25-45 min
      else               min = Math.floor(rng() * 30) + 45;    // 45-75 min
      week.push(min);
    }
    data.push(week);
  }
  return data;
}

function intensity(min) {
  if (min === 0) return 0;
  if (min < 10) return 1;
  if (min < 25) return 2;
  if (min < 45) return 3;
  return 4;
}

function HabitCalendar({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  const data = React.useMemo(() => generateYearData(), []);

  const totalMin = data.flat().reduce((a, b) => a + b, 0);
  const readDays = data.flat().filter((m) => m > 0).length;
  const longestStreak = (() => {
    let best = 0, cur = 0;
    data.flat().forEach((m) => { if (m > 0) { cur++; best = Math.max(best, cur); } else cur = 0; });
    return best;
  })();
  const bestDay = Math.max(...data.flat());

  const monthsRow = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const days = ["L", "X", "V"];

  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext7-habit " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Calendario de hábito"
      >
        <header className="ext7-habit-head">
          <div>
            <span className="ext-eyebrow ext7-habit-eyebrow">
              <span className="ext7-habit-flame" aria-hidden>{H7.flame}</span>
              Tu año leyendo
            </span>
            <h2 className="ext7-habit-title">52 semanas con Marina</h2>
            <p className="ext7-habit-sub">Dec 2024 — Nov 2025 · cada cuadrito es un día</p>
          </div>
          <div className="ext7-habit-actions">
            <button className="ext-btn-ghost ext-btn-sm">{H7.share} Compartir</button>
            <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{H7.x}</button>
          </div>
        </header>

        <div className="ext7-habit-stats">
          <div className="ext7-habit-stat">
            <div className="ext7-habit-stat-num">{Math.floor(totalMin / 60)}<span>h</span> {totalMin % 60}<span>m</span></div>
            <div className="ext7-habit-stat-lbl">Tiempo total</div>
          </div>
          <div className="ext7-habit-stat">
            <div className="ext7-habit-stat-num">{readDays}<span>/{52 * 7}</span></div>
            <div className="ext7-habit-stat-lbl">Días con lectura</div>
          </div>
          <div className="ext7-habit-stat">
            <div className="ext7-habit-stat-num">{longestStreak}<span>días</span></div>
            <div className="ext7-habit-stat-lbl">Racha más larga</div>
          </div>
          <div className="ext7-habit-stat">
            <div className="ext7-habit-stat-num">{bestDay}<span>min</span></div>
            <div className="ext7-habit-stat-lbl">Día más intenso</div>
          </div>
        </div>

        <div className="ext7-habit-cal">
          <div className="ext7-habit-months">
            {monthsRow.map((m) => <span key={m}>{m}</span>)}
          </div>
          <div className="ext7-habit-grid-wrap">
            <div className="ext7-habit-daylabels">
              {days.map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="ext7-habit-grid">
              {data.map((week, wi) => (
                <div key={wi} className="ext7-habit-week">
                  {week.map((min, di) => (
                    <span
                      key={di}
                      className={"ext7-habit-day i-" + intensity(min)}
                      title={min === 0 ? "Sin lectura" : (min + " min")}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="ext7-habit-legend">
            <span className="ext7-habit-legend-lbl">Menos</span>
            <span className="ext7-habit-day i-0"></span>
            <span className="ext7-habit-day i-1"></span>
            <span className="ext7-habit-day i-2"></span>
            <span className="ext7-habit-day i-3"></span>
            <span className="ext7-habit-day i-4"></span>
            <span className="ext7-habit-legend-lbl">Más</span>
          </div>
        </div>

        <div className="ext7-habit-cards">
          <div className="ext7-habit-card">
            <span className="ext7-habit-card-icon tone-lav">{H7.moon}</span>
            <div>
              <div className="ext7-habit-card-h">Sueles leer de noche</div>
              <div className="ext7-habit-card-s">El 72% de tus sesiones empieza después de las 9 PM. ¿Quieres un recordatorio a las 9:30?</div>
            </div>
            <button className="ext-btn-ghost ext-btn-sm">Activar</button>
          </div>
          <div className="ext7-habit-card">
            <span className="ext7-habit-card-icon tone-sage">{H7.heart}</span>
            <div>
              <div className="ext7-habit-card-h">Constancia tranquila</div>
              <div className="ext7-habit-card-s">Lees 3.2 días por semana — ritmo que se sostiene mejor que las maratonas.</div>
            </div>
            <button className="ext-btn-ghost ext-btn-sm">Compartir</button>
          </div>
          <div className="ext7-habit-card">
            <span className="ext7-habit-card-icon tone-warm">{H7.book}</span>
            <div>
              <div className="ext7-habit-card-h">Tu capítulo más leído</div>
              <div className="ext7-habit-card-s">Cap. 5 · "Tristeza no es debilidad" — volviste 7 veces.</div>
            </div>
            <button className="ext-btn-ghost ext-btn-sm">Ir</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// #15  Contextual reminders preview — system notification + in-app card
// ════════════════════════════════════════════════════════════════════════
function RemindersPreview({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext7-rem " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Recordatorios"
      >
        <header className="ext7-rem-head">
          <div>
            <span className="ext-eyebrow">{H7.bell} Recordatorios contextuales</span>
            <h2 className="ext7-rem-title">Te avisamos cuando es buen momento, no por cumplir</h2>
            <p className="ext7-rem-sub">
              Aprendemos de tu ritmo y te recordamos en horarios reales — no a las 8 AM si lees de noche.
            </p>
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{H7.x}</button>
        </header>

        <div className="ext7-rem-body">
          <section className="ext7-rem-section">
            <div className="ext7-rem-section-h">Notificación nocturna · iPhone</div>
            <div className="ext7-rem-phone">
              <div className="ext7-rem-phone-time">9:47 PM · jueves</div>
              <div className="ext7-rem-push">
                <div className="ext7-rem-push-head">
                  <span className="ext7-rem-push-icon">📖</span>
                  <span className="ext7-rem-push-app">PSICO PLATFORM</span>
                  <span className="ext7-rem-push-when">ahora</span>
                </div>
                <div className="ext7-rem-push-title">Sueles leer a esta hora</div>
                <div className="ext7-rem-push-body">¿Retomamos el Cap. 6? Te faltan 18 min. Marina tarda 4 min con la voz guiada.</div>
              </div>
              <div className="ext7-rem-push is-quiet">
                <div className="ext7-rem-push-head">
                  <span className="ext7-rem-push-icon">📖</span>
                  <span className="ext7-rem-push-app">PSICO PLATFORM</span>
                  <span className="ext7-rem-push-when">7 min</span>
                </div>
                <div className="ext7-rem-push-title">Tu círculo está leyendo</div>
                <div className="ext7-rem-push-body">Carla anotó una frase nueva en el Cap. 6. No hay que responder — solo te aviso.</div>
              </div>
            </div>
          </section>

          <section className="ext7-rem-section">
            <div className="ext7-rem-section-h">Card in-app · Mañana siguiente</div>
            <div className="ext7-rem-inapp">
              <span className="ext7-rem-inapp-eyebrow">{H7.sun} Buenos días, Ana</span>
              <h3 className="ext7-rem-inapp-h">No leíste anoche — bien.</h3>
              <p className="ext7-rem-inapp-s">
                Saltamos un día está bien. La práctica espaciada consolida mejor que la presión.
                Tu racha sigue protegida hasta el viernes.
              </p>
              <div className="ext7-rem-inapp-actions">
                <button className="ext-btn-primary ext-btn-sm">Retomar Cap. 6 {H7.arrow}</button>
                <button className="ext-btn-ghost ext-btn-sm">Recordarme esta noche</button>
              </div>
            </div>
          </section>

          <section className="ext7-rem-section">
            <div className="ext7-rem-section-h">Qué activas y a qué hora</div>
            <div className="ext7-rem-prefs">
              <PrefRow icon={H7.moon}  title="Sesión nocturna"        sub="Aprende cuándo lees tú · default 9:00 PM" on={true}  smart/>
              <PrefRow icon={H7.sun}   title="Buenos días"            sub="Solo si no leíste anoche · 7:30 AM"      on={true}/>
              <PrefRow icon={H7.heart} title="Cuidado de la racha"    sub="A las 11 PM si vas a perderla"           on={true}/>
              <PrefRow icon={H7.mic}   title="Audio guiado nuevo"     sub="Cuando Marina publica un audio nuevo"     on={false}/>
              <PrefRow icon={H7.bell}  title="Círculo de lectura"     sub="Anotaciones de tu grupo"                  on={false}/>
            </div>
          </section>

          <section className="ext7-rem-section">
            <div className="ext7-rem-section-h">Modo descanso</div>
            <div className="ext7-rem-rest">
              <span className="ext7-rem-rest-icon">{H7.pause}</span>
              <div>
                <div className="ext7-rem-rest-h">Pausá todos los recordatorios</div>
                <div className="ext7-rem-rest-s">Vuelven cuando tú quieras. Útil en vacaciones o cuando necesitás descanso del libro.</div>
              </div>
              <div className="ext7-rem-rest-opts">
                <button>1 día</button>
                <button>1 semana</button>
                <button>1 mes</button>
              </div>
            </div>
          </section>
        </div>

        <footer className="ext7-rem-foot">
          <span className="ext7-rem-foot-meta">{H7.shield} Los recordatorios se generan en tu dispositivo · nunca compartimos tus patrones</span>
          <button className="ext-btn-primary ext-btn-sm">Guardar cambios {H7.check}</button>
        </footer>
      </div>
    </div>
  );
}

function PrefRow({ icon, title, sub, on, smart }) {
  const [state, setState] = React.useState(on);
  return (
    <label className={"ext7-rem-pref " + (state ? "is-on" : "")}>
      <span className="ext7-rem-pref-icon">{icon}</span>
      <div className="ext7-rem-pref-meta">
        <div className="ext7-rem-pref-h">
          {title}
          {smart && <span className="ext7-rem-pref-tag">Aprende de ti</span>}
        </div>
        <div className="ext7-rem-pref-s">{sub}</div>
      </div>
      <span className="ext3-switch" aria-hidden>
        <input type="checkbox" checked={state} onChange={(e) => setState(e.target.checked)}/>
        <span className="ext3-switch-track">
          <span className="ext3-switch-thumb"></span>
        </span>
      </span>
    </label>
  );
}

Object.assign(window, { ContentWarningCard, AuthorPage, HabitCalendar, RemindersPreview });
