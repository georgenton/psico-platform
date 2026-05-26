// author/dashboard.jsx — Author dashboard + Book structure screen.
// These two screens share a common chrome (sidebar + main panel) and live
// behind the same .dashboard CSS scope. They're stateful enough to feel
// real but their only real job in the prototype is showing the system.

const { IcoBook, IcoLessons, IcoChart, IcoUsers, IcoMoney, IcoCog, IcoPlus,
        IcoGrip, IcoArrow, IcoMore, IcoEye, IcoEdit, IcoSpark, IcoTrash,
        IcoCalendar, IcoCheck } = window.EditorIcons;

// ── Topbar / shell ───────────────────────────────────────────────────────
function EstudioTopBar({ crumbs, right }) {
  return (
    <div className="estudio-topbar">
      <div className="estudio-brand">
        <span className="estudio-brand-mark">Psico Platform</span>
        <span className="estudio-brand-sep">·</span>
        <span className="estudio-brand-app">Estudio</span>
      </div>
      <nav className="estudio-bread">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="estudio-bread-sep">/</span>}
            <span className={i === crumbs.length - 1 ? "estudio-bread-now" : ""}>{c}</span>
          </React.Fragment>
        ))}
      </nav>
      <div className="estudio-topbar-r">
        {right}
        <span className="estudio-author-chip">
          <span className="estudio-author-avatar">{window.AUTHOR_PROFILE.avatarInitials}</span>
          {window.AUTHOR_PROFILE.name.replace("Dra. ", "")}
        </span>
      </div>
    </div>
  );
}

function DashSidebar({ active }) {
  const items = [
    { id: "overview", label: "Resumen",    Icon: IcoChart },
    { id: "books",    label: "Mis libros", Icon: IcoBook },
    { id: "readers",  label: "Lectores",   Icon: IcoUsers },
    { id: "revenue",  label: "Ingresos",   Icon: IcoMoney },
    { id: "settings", label: "Ajustes",    Icon: IcoCog },
  ];
  return (
    <aside className="dash-side">
      <div className="dash-side-section">Estudio</div>
      {items.map((it) => (
        <button key={it.id} className={"dash-side-link " + (active === it.id ? "is-on" : "")}>
          <it.Icon/> {it.label}
        </button>
      ))}
    </aside>
  );
}

function StatCard({ eyebrow, value, sub, delta, deltaDir }) {
  return (
    <div className="dash-stat">
      <div className="dash-stat-eyebrow">{eyebrow}</div>
      <span className="dash-stat-num">
        {value}
        {delta != null && (
          <span className={"dash-stat-delta " + (deltaDir || "up")}>
            {deltaDir === "down" ? "↓" : "↑"} {delta}
          </span>
        )}
      </span>
      <div className="dash-stat-sub">{sub}</div>
    </div>
  );
}

function BookCard({ book, onOpen }) {
  return (
    <div className="dash-book" onClick={() => onOpen?.(book)} role="button">
      <div className={"dash-book-cover tone-" + book.cover}></div>
      <div className="dash-book-meta">
        <div className="dash-book-titlerow">
          <h4 className="dash-book-title">{book.title}</h4>
          <span className={"status-badge status-" + book.status}>{book.status}</span>
        </div>
        <div className="dash-book-sub">{book.subtitle}</div>
        {book.metrics ? (
          <div className="dash-book-stats">
            <div className="dash-book-stat">
              <div className="dash-book-stat-num">{book.metrics.readers.toLocaleString()}</div>
              <div className="dash-book-stat-lbl">Lectores</div>
            </div>
            <div className="dash-book-stat">
              <div className="dash-book-stat-num">${book.metrics.revenueAuthor30d}</div>
              <div className="dash-book-stat-lbl">Tu 30d</div>
            </div>
            <div className="dash-book-stat">
              <div className="dash-book-stat-num">{book.metrics.ratingsAvg}</div>
              <div className="dash-book-stat-lbl">★ ({book.metrics.ratingsCount})</div>
            </div>
          </div>
        ) : (
          <>
            <div className="dash-book-stats">
              <div className="dash-book-stat">
                <div className="dash-book-stat-num">{book.lessons}/{book.chapters * 2}</div>
                <div className="dash-book-stat-lbl">Lecciones escritas</div>
              </div>
              <div className="dash-book-stat">
                <div className="dash-book-stat-num">{book.estMinutes}m</div>
                <div className="dash-book-stat-lbl">Contenido</div>
              </div>
            </div>
            <div className="dash-book-progress">
              <div className="dash-book-progress-fill" style={{ width: ((book.progress || 0) * 100) + "%" }}></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Dashboard({ onOpenBook }) {
  const books = window.AUTHOR_BOOKS;
  const totalReaders = books.reduce((s, b) => s + (b.metrics?.readers || 0), 0);
  const totalRevenue = books.reduce((s, b) => s + (b.metrics?.revenueAuthor30d || 0), 0);
  const totalLessons = books.reduce((s, b) => s + b.lessons, 0);
  return (
    <div className="editor-app">
      <EstudioTopBar
        crumbs={["Estudio del autor", "Resumen"]}
        right={<button className="ebtn"><IcoPlus/> Nuevo libro</button>}
      />
      <div className="dashboard">
        <DashSidebar active="overview"/>
        <main className="dash-main">
          <div className="dash-h">
            <div>
              <h1 className="dash-h-title">Hola, Marina</h1>
              <p className="dash-h-sub">Tus libros, tus lectores y un par de cosas que la IA notó esta semana.</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="ebtn"><IcoCalendar/> Últimos 30 días</button>
              <button className="ebtn-primary ebtn"><IcoPlus/> Nuevo libro</button>
            </div>
          </div>

          <div className="dash-stats">
            <StatCard eyebrow="Lectores totales" value={totalReaders.toLocaleString()} sub="Activos los últimos 30 días" delta="12%" deltaDir="up"/>
            <StatCard eyebrow="Tu ingreso · 30d" value={"$" + totalRevenue.toLocaleString()} sub="Después del 30% de plataforma" delta="$84" deltaDir="up"/>
            <StatCard eyebrow="Lecciones publicadas" value={totalLessons} sub={books.length + " libros · 4 en borrador"} delta="3" deltaDir="up"/>
            <StatCard eyebrow="Calificación promedio" value="4.65 ★" sub={"Sobre 314 calificaciones"}/>
          </div>

          <h3 className="dash-section-h">
            Tus libros
            <button className="ebtn ebtn-sm"><IcoPlus/> Crear libro</button>
          </h3>
          <div className="dash-books">
            {books.map((b) => <BookCard key={b.id} book={b} onOpen={onOpenBook}/>)}
          </div>

          <h3 className="dash-section-h" style={{ marginTop: 32 }}>Insights de la semana · IA</h3>
          <div className="dash-insights">
            <div className="dash-insight">
              <div className="dash-insight-eyebrow">✦ Marina IA · Lectores</div>
              <div className="dash-insight-body">El 64% de tus lectores en <strong>Emociones en construcción</strong> abre la app en modo <strong>Reflexión</strong>.</div>
              <div className="dash-insight-foot">Considera diseñar una serie nocturna para ese segmento.</div>
            </div>
            <div className="dash-insight">
              <div className="dash-insight-eyebrow">✦ Marina IA · Contenido</div>
              <div className="dash-insight-body">Tu lección 3 del capítulo 2 tiene la tasa de re-lectura más alta (37%).</div>
              <div className="dash-insight-foot">Puede ser una buena base para una guía paga separada.</div>
            </div>
            <div className="dash-insight">
              <div className="dash-insight-eyebrow">✦ Marina IA · Comunidad</div>
              <div className="dash-insight-body">12 lectores te enviaron preguntas en la última semana. Una se repite: "¿Cómo distingo culpa de responsabilidad?"</div>
              <div className="dash-insight-foot">Posible tema para tu próxima lección.</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Book structure screen ────────────────────────────────────────────────
function BookStructure({ onOpenLesson, onBack }) {
  const book = window.AUTHOR_BOOKS[0];
  const struct = window.AUTHOR_BOOK_STRUCTURE;
  const totalLessons = struct.chapters.reduce((s, c) => s + c.lessons.length, 0);
  const publishedCount = struct.chapters.reduce((s, c) =>
    s + c.lessons.filter(l => l.status === "publicado").length, 0);

  return (
    <div className="editor-app">
      <EstudioTopBar
        crumbs={["Estudio", "Mis libros", "Emociones en construcción"]}
        right={<>
          <button className="ebtn" onClick={onBack}>← Volver</button>
          <button className="ebtn"><IcoEye/> Previsualizar libro</button>
          <button className="ebtn-primary ebtn"><IcoPlus/> Nueva lección</button>
        </>}
      />
      <div className="bookstruct">
        <main className="bookstruct-main">
          <div className="bookstruct-h">
            <div className={"bookstruct-cover tone-" + book.cover}></div>
            <div className="bookstruct-titles">
              <h1 className="bookstruct-title">{book.title}</h1>
              <p className="bookstruct-sub">{book.subtitle}</p>
            </div>
            <span className="status-badge status-publicado">Publicado</span>
          </div>

          {struct.chapters.map((ch, i) => (
            <section key={ch.id} className="bookstruct-chapter">
              <div className="bookstruct-chapter-head">
                <span className="bookstruct-grip" aria-hidden><IcoGrip/></span>
                <span className="bookstruct-chapter-num">{String(ch.number).padStart(2, "0")}</span>
                <div className="bookstruct-chapter-title">{ch.title}</div>
                <span className={"status-badge status-" + ch.status}>{ch.status.replace("-", " ")}</span>
                <div className="bookstruct-chapter-actions">
                  <button className="ebtn-icon ebtn"><IcoEdit/></button>
                  <button className="ebtn-icon ebtn"><IcoMore/></button>
                </div>
              </div>
              <ul className="bookstruct-lessons">
                {ch.lessons.map((l) => (
                  <li key={l.id} className="bookstruct-lesson" onClick={() => onOpenLesson?.(l)}>
                    <span className="bookstruct-grip" aria-hidden><IcoGrip/></span>
                    <span className="bookstruct-lesson-num">{String(l.number).padStart(2, "0")}</span>
                    <div className="bookstruct-lesson-body">
                      <div className="bookstruct-lesson-title">{l.title}</div>
                      <div className="bookstruct-lesson-meta">
                        <span>{l.updatedAgo}</span>
                      </div>
                    </div>
                    <div className="bookstruct-lesson-r">
                      <span className={"status-badge status-" + l.status}>
                        {l.status === "vacio" ? "sin contenido" : l.status.replace("-", " ")}
                      </span>
                      <button className="ebtn-icon ebtn"><IcoArrow/></button>
                    </div>
                  </li>
                ))}
              </ul>
              <button className="bookstruct-add">
                <IcoPlus/> Agregar lección a este capítulo
              </button>
            </section>
          ))}

          <button className="bookstruct-add" style={{ margin: "16px 0 0", padding: "16px" }}>
            <IcoPlus/> Agregar capítulo
          </button>
        </main>

        <aside className="bookstruct-rail">
          <div className="bookstruct-rail-card">
            <div className="bookstruct-rail-eyebrow">Estado del libro</div>
            <div className="bookstruct-rail-h">{publishedCount} / {totalLessons} lecciones publicadas</div>
            <div className="bookstruct-rail-body">El siguiente paso es revisar la lección 3 del capítulo 1 (en revisión hace 4 horas).</div>
          </div>
          <div className="bookstruct-rail-card">
            <div className="bookstruct-rail-eyebrow">✦ Marina IA sugiere</div>
            <div className="bookstruct-rail-h">Capítulo 4 necesita un cierre</div>
            <div className="bookstruct-rail-body">Te falta una lección checklist al final del capítulo 4 — los lectores tienden a abandonar sin un punto de cierre claro.</div>
          </div>
          <div className="bookstruct-rail-card">
            <div className="bookstruct-rail-eyebrow">Lectores activos</div>
            <div className="bookstruct-rail-h">1,483 · este mes</div>
            <div className="bookstruct-rail-body">+12% vs el mes pasado. Tu mejor lección en re-lectura es la 2.3.</div>
          </div>
          <div className="bookstruct-rail-card">
            <div className="bookstruct-rail-eyebrow">Tu ingreso · 30 días</div>
            <div className="bookstruct-rail-h">$786 USD</div>
            <div className="bookstruct-rail-body">Modelo: revenue share 70/30. Próximo pago: 1 de junio.</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, BookStructure, EstudioTopBar });
