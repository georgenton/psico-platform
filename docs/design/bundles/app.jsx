// bundles/app.jsx — Rutas curadas · bundles temáticos

const BUNDLES = [
  {
    id: "ansiedad",
    cover: "lav",
    icon: "⚊",
    coverTitle: "Cuando la noche\nno deja dormir.",
    tag: "Ruta · ansiedad y descanso",
    tagClass: "",
    name: "Ansiedad y descanso",
    desc: "Para las noches que no terminan. 6 semanas para entender qué se acelera y por qué — y aprender a aterrizar.",
    contents: [
      { ic: "book",   txt: "Emociones en construcción", note: "+ Cap. 4 extendido" },
      { ic: "audio",  txt: "5 audios guiados",          note: "incl. ‹aterrizar antes de dormir›" },
      { ic: "eco",    txt: "Persona Eco · noche",       note: "tono calmo, sin urgencia" },
      { ic: "diario", txt: "Diario guiado · 28 días",   note: "prompts breves al cierre del día" },
    ],
    meta: ["6 semanas", "Nivel · base"],
    priceNow: "$29",
    priceWas: "$49 a la carta",
    proIncluded: true,
    cta: "Empezar la ruta",
    ctaClass: "pro",
  },
  {
    id: "vinculos",
    cover: "sage",
    icon: "⏍",
    coverTitle: "Pedir no es\nexigir.",
    tag: "Ruta · vínculos sanos",
    tagClass: "sage",
    name: "Vínculos sanos",
    desc: "Conversaciones difíciles, límites, escucha. Para parejas, amistades y familia.",
    contents: [
      { ic: "book",   txt: "Vínculos · 3 libros",     note: "incl. Familias ensambladas" },
      { ic: "audio",  txt: "4 audios de ejercicios", note: "‹la pausa antes de responder›" },
      { ic: "eco",    txt: "Eco · ayuda con discusiones", note: "te ayuda a nombrar antes de mandar" },
      { ic: "diario", txt: "Diario en dos voces",    note: "opcional con tu pareja" },
    ],
    meta: ["8 semanas", "Nivel · medio"],
    priceNow: "$39",
    priceWas: "$67 a la carta",
    proIncluded: true,
    cta: "Empezar la ruta",
    ctaClass: "pro",
  },
  {
    id: "manana",
    cover: "dawn",
    icon: "☼",
    coverTitle: "La pausa de\nlas siete y media.",
    tag: "Ruta corta · 14 días",
    tagClass: "",
    name: "Bienestar mañanero",
    desc: "Un libro corto, 7 mini-audios para la primera hora del día y un prompt diario. Una pequeña promesa con tu mañana.",
    contents: [
      { ic: "book",   txt: "Un libro corto",         note: "Mañanas que sostienen, 92 pág." },
      { ic: "audio",  txt: "7 audios · 4–6 min",    note: "uno por día de la semana" },
      { ic: "diario", txt: "Prompt diario al amanecer", note: "‹¿qué necesitas hoy?›" },
    ],
    meta: ["2 semanas", "Nivel · base"],
    priceNow: "$19",
    priceWas: null,
    proIncluded: true,
    cta: "Probar 3 días gratis",
    ctaClass: "",
  },
  {
    id: "separados",
    cover: "warm",
    icon: "⫯",
    coverTitle: "Volver a empezar\n— con los niños.",
    tag: "Especializada · familias",
    tagClass: "warm",
    name: "Padres recién separados",
    desc: "Para los primeros doce meses tras una separación. Hablar con los hijos, sostener rutinas, no traducir el dolor del adulto.",
    contents: [
      { ic: "book",   txt: "2 libros · co-parentalidad", note: "Familias ensambladas + ed. especial" },
      { ic: "audio",  txt: "3 audios · qué decirles",     note: "por edades · 5/8/12 años" },
      { ic: "eco",    txt: "Eco · co-parentalidad",       note: "persona entrenada en esta etapa" },
      { ic: "diario", txt: "Diario sin culpa",           note: "prompts no juzgan" },
    ],
    meta: ["10 semanas", "Profesional · validada"],
    priceNow: "$39",
    priceWas: null,
    proIncluded: false,
    cta: "Comprar ruta",
    ctaClass: "",
  },
  {
    id: "adolescentes",
    cover: "mix",
    icon: "✦",
    coverTitle: "Acompañarles\nsin invadirles.",
    tag: "Especializada · padres",
    tagClass: "warm",
    name: "Adolescencia compañera",
    desc: "Para padres y madres de chicas y chicos de 12 a 17. Cómo estar cerca cuando la puerta se cierra.",
    contents: [
      { ic: "book",   txt: "Adolescencia, dos lecturas",  note: "una para ti, una para ellxs" },
      { ic: "audio",  txt: "5 audios · diálogos posibles", note: "ejemplos concretos" },
      { ic: "eco",    txt: "Eco · padres",                note: "te ayuda antes de hablar con ellxs" },
    ],
    meta: ["6 semanas", "Nivel · medio"],
    priceNow: "$34",
    priceWas: null,
    proIncluded: false,
    cta: "Comprar ruta",
    ctaClass: "",
  },
  {
    id: "empezar",
    cover: "deep",
    icon: "◐",
    coverTitle: "Si todavía\nno sabes por dónde.",
    tag: "Sample · gratuito",
    tagClass: "",
    name: "Empezar a leerte",
    desc: "Una semana para probar la plataforma. Un libro corto, dos audios, cinco prompts. Sin compromiso ni tarjeta.",
    contents: [
      { ic: "book",   txt: "Libro corto · 70 pág.",   note: "Aprender a entenderte" },
      { ic: "audio",  txt: "2 audios introductorios", note: "20 min en total" },
      { ic: "diario", txt: "5 prompts iniciales",     note: "cuatro frases bastan" },
    ],
    meta: ["1 semana", "Nivel · cero"],
    priceNow: "Gratis",
    priceWas: null,
    proIncluded: false,
    cta: "Empezar gratis →",
    ctaClass: "free",
  },
];

function Sidebar() {
  const N = window.Icons;
  const items = [
    { icon: <N.home />, label: "Inicio" },
    { icon: <N.book />, label: "Mi biblioteca" },
    { icon: <N.eco />, label: "Eco" },
    { icon: <N.diary />,  label: "Diario" },
    { icon: <N.patrones />,  label: "Patrones" },
    { icon: <N.rutas />,  label: "Rutas", on: true },
    { icon: <N.plan />, label: "Mi plan" },
    { icon: <N.user />, label: "Perfil" },
  ];
  return (
    <aside className="side">
      <div className="side-head"><span className="side-wm">Psico Platform</span></div>
      <nav className="side-nav">
        <div className="side-eyebrow">Menú</div>
        {items.map((it) => (
          <a key={it.label} className={"side-link " + (it.on ? "is-on" : "")} href="#">
            <span className="side-link-icon">{it.icon}</span>
            <span style={{ flex: 1 }}>{it.label}</span>
          </a>
        ))}
      </nav>
      <div className="side-foot">
        <div className="side-user">
          <span className="side-avatar">A</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="side-user-name">ana@correo.com</div>
            <div className="side-user-plan"><span className="plan-dot"/>Plan Gratuito</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Bundle({ b }) {
  return (
    <article className="bundle">
      <div className={"bundle-cover " + b.cover}>
        <span className="bundle-cover-icon">{b.icon}</span>
        <div className="bundle-cover-title">{b.coverTitle.split("\n").map((l, i) => <span key={i}>{l}<br/></span>)}</div>
      </div>
      <div className="bundle-body">
        <span className={"bundle-tag " + (b.tagClass || "")}>{b.tag}</span>
        <h4 className="bundle-name">{b.name}</h4>
        <div className="bundle-meta">
          {b.meta.map((m, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="bundle-meta-sep">·</span>}
              <span>{m}</span>
            </React.Fragment>
          ))}
        </div>
        <p className="bundle-desc">{b.desc}</p>
        <div className="bundle-contents">
          {b.contents.map((c, i) => (
            <div key={i} className="bundle-content-li">
              <span className={"ic " + c.ic}>
                {c.ic === "book" ? "📖" : c.ic === "audio" ? "🎧" : c.ic === "eco" ? "✦" : "✎"}
              </span>
              <span><b>{c.txt}</b><span style={{ color: "var(--color-warm-500)" }}> · {c.note}</span></span>
            </div>
          ))}
        </div>
        <div className="bundle-foot">
          <div className="bundle-price">
            <span className="now">{b.priceNow}</span>
            {b.priceWas && <span className="strike">{b.priceWas}</span>}
            {b.proIncluded && <span className="pro-incl">✓ Incluido con Pro</span>}
          </div>
          <button className={"bundle-cta " + (b.ctaClass || "")}>{b.cta} →</button>
        </div>
      </div>
    </article>
  );
}

function BundlesApp() {
  const featured = BUNDLES[0];
  const rest = BUNDLES.slice(1);

  return (
    <div className="stage">
      <Sidebar/>
      <main className="main">
        <header className="top">
          <div className="top-title">Rutas</div>
          <div className="top-r">
            <span className="top-tab on">Todas</span>
            <span className="top-tab">Cortas</span>
            <span className="top-tab">Profundas</span>
            <span className="top-tab">Para padres</span>
            <span className="top-tab">Especializadas</span>
          </div>
        </header>

        <div className="body">
          {/* Hero */}
          <section className="hero">
            <div className="hero-meta">
              <span className="hero-eyebrow">◇ Lo más empezado este mes</span>
              <h1 className="hero-title">{featured.name} — seis semanas que cambian la noche.</h1>
              <p className="hero-sub">
                Una ruta curada por nuestro equipo clínico. Lectura, audio, conversación con Eco y diario guiado —
                en el orden que importa, al ritmo que tú puedas.
              </p>
              <div className="hero-bullets">
                <div className="hero-bullet">
                  <span className="hero-bullet-icon book">📖</span>
                  <span><b>{featured.contents[0].txt}</b> — {featured.contents[0].note}</span>
                </div>
                <div className="hero-bullet">
                  <span className="hero-bullet-icon audio">🎧</span>
                  <span><b>{featured.contents[1].txt}</b> — {featured.contents[1].note}</span>
                </div>
                <div className="hero-bullet">
                  <span className="hero-bullet-icon eco">✦</span>
                  <span><b>{featured.contents[2].txt}</b> — {featured.contents[2].note}</span>
                </div>
                <div className="hero-bullet">
                  <span className="hero-bullet-icon diario">✎</span>
                  <span><b>{featured.contents[3].txt}</b> — {featured.contents[3].note}</span>
                </div>
              </div>
              <div className="hero-buy">
                <div className="hero-buy-price">
                  <span className="now">{featured.priceNow}</span>
                  <span className="lbl">Una vez · acceso de por vida</span>
                </div>
                <div className="hero-buy-pro">
                  <b>· o incluido</b> con Pro <span style={{ color: "var(--color-warm-400)" }}>·</span> $7/mes,
                  todas las rutas base y conversación ilimitada con Eco.
                </div>
                <button className="hero-buy-cta">Empezar →</button>
              </div>
            </div>
            <div className="hero-visual">
              <div className="hero-stack">
                <div className="b1">
                  <div className="hero-stack-title">Emociones en<br/>construcción</div>
                  <div className="hero-stack-author">Cap. 4 extendido</div>
                </div>
                <div className="b2">
                  <div className="hero-stack-title">Aterrizar<br/>antes de dormir</div>
                  <div className="hero-stack-author">Audio · 7:42 min</div>
                </div>
                <div className="b3">
                  <div className="hero-stack-title" style={{ color: "#25185c" }}>28 noches<br/>de diario</div>
                  <div className="hero-stack-author" style={{ color: "rgba(37,24,92,0.7)" }}>Prompts breves</div>
                </div>
              </div>
            </div>
          </section>

          {/* All bundles */}
          <section className="section">
            <div className="section-h">
              <h3>Todas las rutas</h3>
              <span className="meta">6 disponibles · 4 nuevas en preparación</span>
            </div>
            <div className="grid">
              {rest.map((b) => <Bundle key={b.id} b={b}/>)}
            </div>
          </section>

          {/* Compare table */}
          <section className="compare">
            <div>
              <span style={{ font: "600 11px/1 var(--font-mono)", color: "var(--color-lavender-700)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                ¿Suelta o con Pro?
              </span>
              <h3 style={{ marginTop: 10 }}>Una ruta — o todas, por menos.</h3>
              <p>
                Cada ruta es comprable a la carta. Pro incluye las cuatro rutas base + Eco ilimitado + todas las nuevas
                que publiquemos este año, por menos que dos rutas sueltas.
              </p>
              <div className="compare-cta">
                <button className="pro">Probar Pro 14 días gratis</button>
                <button className="ghost">Ver detalle de Pro →</button>
              </div>
            </div>
            <div className="compare-table">
              <div className="compare-table-row head">
                <div></div>
                <div className="col">A la carta</div>
                <div className="col">Pro · $7/mes</div>
              </div>
              <div className="compare-table-row">
                <div className="col">4 rutas base</div>
                <div className="col c">$29–$39 c/u</div>
                <div className="col c highlight"><span className="yes">Todas ✓</span></div>
              </div>
              <div className="compare-table-row">
                <div className="col">Eco · conversación</div>
                <div className="col c">Limitada al tema</div>
                <div className="col c highlight"><span className="yes">Ilimitada ✓</span></div>
              </div>
              <div className="compare-table-row">
                <div className="col">Diario guiado</div>
                <div className="col c">Por ruta</div>
                <div className="col c highlight"><span className="yes">Todos los diarios ✓</span></div>
              </div>
              <div className="compare-table-row">
                <div className="col">Rutas especializadas</div>
                <div className="col c"><span className="no">$34–$39 c/u</span></div>
                <div className="col c"><span className="no">−15% para Pro</span></div>
              </div>
              <div className="compare-table-row" style={{ borderBottom: 0 }}>
                <div className="col" style={{ fontWeight: 600 }}>Total · 6 meses</div>
                <div className="col c" style={{ fontWeight: 600 }}>$136+</div>
                <div className="col c highlight" style={{ fontWeight: 700, color: "var(--color-sage-700)" }}>$42</div>
              </div>
            </div>
          </section>

          {/* B2B */}
          <section className="b2b">
            <div>
              <span className="b2b-eye">⌬ Para equipos · escuelas · clínicas</span>
              <h3 style={{ marginTop: 10 }}>¿Quieres ofrecer rutas a tu equipo?</h3>
              <p>
                Empresas, colegios y consultas independientes pueden licenciar rutas para su gente.
                Tablero de admin, reportes agregados (anónimos), facturación trimestral, y rutas
                personalizadas para tu sector. Desde $120/mes por 10 cuentas.
              </p>
              <button className="b2b-cta">Hablar con ventas →</button>
            </div>
            <div className="b2b-stats">
              <div className="b2b-stat">
                <div className="b2b-stat-val">12+</div>
                <div className="b2b-stat-lbl">Equipos activos · LATAM</div>
              </div>
              <div className="b2b-stat">
                <div className="b2b-stat-val">$120</div>
                <div className="b2b-stat-lbl">Desde · 10 cuentas / mes</div>
              </div>
              <div className="b2b-stat">
                <div className="b2b-stat-val">94%</div>
                <div className="b2b-stat-lbl">Cuentas activas mes 3</div>
              </div>
              <div className="b2b-stat">
                <div className="b2b-stat-val">0</div>
                <div className="b2b-stat-lbl">Contenido individual visible al admin</div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

window.BundlesApp = BundlesApp;
