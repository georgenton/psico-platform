// screens.jsx — Top-level screens: BookCover, BookIndex, Lesson, Done.
// All screens share the same theming via .var-* and .mood-* classes on the
// outer .app shell. Navigation is callback-driven (no router).

const { GoalBlock, ProseBlock, AuthorInsightBlock, FlipBlock,
        VideoBlock, AudioBlock, QuizBlock, ExerciseBlock, ChecklistBlock } = window;

// ── Mood picker ────────────────────────────────────────────────────────────
const MOODS_META = [
  { id: "calma",     name: "Calma",     descr: "Para un día sereno" },
  { id: "foco",      name: "Foco",      descr: "Para concentrarte" },
  { id: "energia",   name: "Energía",   descr: "Para un impulso" },
  { id: "reflexion", name: "Reflexión", descr: "Para journaling nocturno" },
];

function MoodPicker({ value, onChange, compact, eyebrow = "Antes de empezar", suggestion }) {
  const detailsRef = React.useRef(null);
  const pick = (id) => {
    onChange(id);
    if (detailsRef.current) detailsRef.current.open = false;
  };
  if (compact) {
    const m = MOODS_META.find((x) => x.id === value) || MOODS_META[0];
    return (
      <details className="moodchip" ref={detailsRef}>
        <summary className="moodchip-trigger" aria-label="Cambiar mood">
          <span className={"moodchip-swatch swatch-" + value} aria-hidden></span>
          <span className="moodchip-name">{m.name}</span>
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden>
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </summary>
        <div className="moodchip-menu">
          {MOODS_META.map((m) => (
            <button
              key={m.id}
              type="button"
              className={"moodchip-opt " + (value === m.id ? "is-on" : "")}
              onClick={() => pick(m.id)}
            >
              <span className={"moodchip-swatch swatch-" + m.id} aria-hidden></span>
              <span>
                <span className="moodchip-opt-name">{m.name}</span>
                <span className="moodchip-opt-descr">{m.descr}</span>
              </span>
              {suggestion && suggestion.mood === m.id && (
                <span className="moodchip-opt-sugg">Sugerido</span>
              )}
            </button>
          ))}
        </div>
      </details>
    );
  }
  const suggMoodMeta = suggestion ? MOODS_META.find((m) => m.id === suggestion.mood) : null;
  return (
    <section className="moodpicker">
      <div className="moodpicker-head">
        <span className="eyebrow">{eyebrow}</span>
        <h3 className="moodpicker-q">¿Cómo te sientes hoy?</h3>
        <p className="moodpicker-sub">El libro se adapta a tu estado — colores, tipografía y ritmo cambian.</p>
      </div>

      {suggMoodMeta && value !== suggestion.mood && (
        <button
          type="button"
          className={"moodcard moodcard-sugg mood-preview-" + suggestion.mood}
          onClick={() => pick(suggestion.mood)}
        >
          <div className="moodcard-preview moodcard-preview-wide">
            <span className="moodcard-aa">Aa</span>
            <span className="moodcard-lines">
              <span className="moodcard-line"></span>
              <span className="moodcard-line short"></span>
            </span>
          </div>
          <div className="moodcard-info">
            <div className="moodcard-sugg-eyebrow">✦ Para ti hoy</div>
            <div className="moodcard-name">{suggMoodMeta.name} · {suggestion.theme}</div>
            <div className="moodcard-descr">{window.suggestionShort(suggestion.mood, "")}</div>
          </div>
          <span className="moodcard-sugg-arrow" aria-hidden>
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </button>
      )}

      <div className="moodpicker-grid">
        {MOODS_META.map((m) => (
          <button
            key={m.id}
            type="button"
            className={"moodcard mood-preview-" + m.id + (value === m.id ? " is-on" : "")}
            onClick={() => pick(m.id)}
            aria-pressed={value === m.id}
          >
            <div className="moodcard-preview">
              <span className="moodcard-aa">Aa</span>
              <span className="moodcard-lines">
                <span className="moodcard-line"></span>
                <span className="moodcard-line short"></span>
              </span>
            </div>
            <div className="moodcard-info">
              <div className="moodcard-name">
                {m.name}
                {suggestion && suggestion.mood === m.id && value !== m.id && (
                  <span className="moodcard-sugg-tag">Sugerido</span>
                )}
              </div>
              <div className="moodcard-descr">{m.descr}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
function Wordmark({ small }) {
  return <div className={"wordmark " + (small ? "is-sm" : "")}>Psico Platform</div>;
}

function TopBar({ left, right, sticky }) {
  return (
    <div className={"topbar " + (sticky ? "is-sticky" : "")}>
      <div className="topbar-inner">
        <div className="topbar-l">{left}</div>
        <div className="topbar-r">{right}</div>
      </div>
    </div>
  );
}

function IconBack() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconArrow() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconLock() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor"/>
      <path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}
function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ProgressBar({ pct }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(pct*100)} aria-valuemin="0" aria-valuemax="100">
      <div className="progress-fill" style={{ width: (pct * 100) + "%" }}></div>
    </div>
  );
}

function ModeToggle({ mode, onChange, available, tier, onPaywall }) {
  const isPro = tier === "pro";
  const onPickGuia = () => {
    if (!isPro) { onPaywall("modo-guia"); return; }
    onChange("guia");
  };
  return (
    <div className="mode-toggle" role="tablist" aria-label="Modo de lectura">
      <button
        role="tab" aria-selected={mode === "guia"}
        className={"mode-toggle-btn " + (mode === "guia" ? "is-on" : "") + (!isPro ? " is-pro-gated" : "")}
        onClick={onPickGuia}
      >
        {!isPro && (
          <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden style={{marginRight:2}}>
            <rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor"/>
            <path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="currentColor" strokeWidth="2"/>
          </svg>
        )}
        {isPro && <span className="mode-toggle-dot" aria-hidden></span>}
        Modo Guía
        {!isPro && <span className="mode-pro-tag">Pro</span>}
      </button>
      <button
        role="tab" aria-selected={mode === "libro"}
        className={"mode-toggle-btn " + (mode === "libro" ? "is-on" : "")}
        onClick={() => onChange("libro")}
        disabled={!available.includes("libro")}
      >
        <span className="mode-toggle-dot" aria-hidden></span>
        Modo Libro
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BookCover
// ─────────────────────────────────────────────────────────────────────────
function BookCover({ book, author, variation, mood, tier, showAuthor, onOpen, onMoodChange, onOpenPaywall, suggestionBanner, suggestion, onOpenCheckin, onOpenAISettings, checkinDone }) {
  const isPro = tier === "pro";
  const pct = book.completedLessons / book.totalLessons;
  return (
    <div className="screen screen-cover">
      <TopBar
        left={<Wordmark />}
        right={
          <div className="topbar-r-stack">
            {!checkinDone && (
              <button className="checkin-pill" onClick={onOpenCheckin} type="button">
                <span aria-hidden>✦</span> Check-in
              </button>
            )}
            <button className="btn-icon" onClick={onOpenAISettings} type="button" aria-label="Ajustes de IA bioinspirada" title="Ajustes de IA">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            {!isPro && (
              <button className="badge-pro-cta" onClick={() => onOpenPaywall("default")}>
                <span className="badge-pro-dot" aria-hidden></span>
                Hazte Pro
              </button>
            )}
            <button className="btn-ghost">Mi biblioteca</button>
          </div>
        }
      />
      {suggestionBanner && (
        <div className="cover-banner-wrap">{suggestionBanner}</div>
      )}
      <div className="cover-hero">
        <div className="cover-art-col">
          <div className={"cover-art tone-" + book.cover.tone}>
            <div className="cover-art-inner">
              <span className="cover-art-eyebrow">Edición Pro</span>
              <span className="cover-art-title">Emociones<br/>en construcción</span>
              <span className="cover-art-author">{book.authorRef}</span>
            </div>
          </div>
        </div>
        <div className="cover-meta">
          <span className="badge badge-lavender">Libro · Disponible en dos modos</span>
          <h1 className="cover-title">{book.title}</h1>
          <p className="cover-subtitle">{book.subtitle}</p>
          {showAuthor && (
            <div className="cover-author">
              <div className="author-avatar sm" aria-hidden>{author.avatarInitials}</div>
              <div>
                <div className="cover-author-name">{author.name}</div>
                <div className="cover-author-role">{author.role}</div>
              </div>
            </div>
          )}
          <p className="cover-desc">{book.description}</p>
          <div className="cover-stats">
            <div className="cover-stat">
              <div className="cover-stat-num">{book.totalLessons}</div>
              <div className="cover-stat-lbl">Lecciones</div>
            </div>
            <div className="cover-stat-sep"></div>
            <div className="cover-stat">
              <div className="cover-stat-num">{book.chapters.length}</div>
              <div className="cover-stat-lbl">Capítulos</div>
            </div>
            <div className="cover-stat-sep"></div>
            <div className="cover-stat">
              <div className="cover-stat-num">{Math.round(book.estMinutes/60)}h</div>
              <div className="cover-stat-lbl">Estimado</div>
            </div>
          </div>
          <div className="cover-progress">
            <div className="cover-progress-row">
              <span>Tu avance</span>
              <span>{book.completedLessons} de {book.totalLessons}</span>
            </div>
            <ProgressBar pct={pct} />
          </div>
          <div className="cover-actions">
            <button className="btn-primary" onClick={() => onOpen("index")}>
              Continuar capítulo 1 <IconArrow/>
            </button>
            <button className="btn-secondary" onClick={() => onOpen("index")}>
              Ver índice
            </button>
          </div>
        </div>
      </div>

      <div className="cover-moodpicker">
        <MoodPicker value={mood} onChange={onMoodChange} suggestion={suggestion}/>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BookIndex
// ─────────────────────────────────────────────────────────────────────────
function BookIndex({ book, mood, onMoodChange, tier, onOpenPaywall, onBack, onOpenLesson }) {
  const isPro = tier === "pro";
  return (
    <div className="screen screen-index">
      <TopBar
        left={<button className="btn-icon" onClick={onBack}><IconBack/></button>}
        right={
          <div className="topbar-r-stack">
            {!isPro && (
              <button className="badge-pro-cta" onClick={() => onOpenPaywall("default")}>
                <span className="badge-pro-dot" aria-hidden></span>
                Hazte Pro
              </button>
            )}
            <MoodPicker value={mood} onChange={onMoodChange} compact/>
            <Wordmark small />
          </div>
        }
        sticky
      />
      <div className="index-wrap">
        <div className="index-head">
          <span className="eyebrow">Índice del libro</span>
          <h1 className="index-title">{book.title}</h1>
          <p className="index-sub">{book.edition}</p>
        </div>

        <ol className="chapters">
          {book.chapters.map((ch, i) => {
            const chapterLocked = !isPro && ch.tier === "pro";
            const lessons = ch.lessons || [];
            return (
              <li key={ch.id} className={"chapter " + (chapterLocked ? "is-locked" : "is-open")}>
                <button
                  className="chapter-head chapter-head-btn"
                  onClick={() => chapterLocked ? onOpenPaywall("chapter-2") : null}
                  disabled={!chapterLocked}
                >
                  <div className="chapter-num">{String(ch.number).padStart(2, "0")}</div>
                  <div className="chapter-meta">
                    <div className="chapter-titlerow">
                      <h3 className="chapter-title">{ch.title}</h3>
                      {chapterLocked && <span className="chapter-lock-badge"><IconLock/> Pro</span>}
                    </div>
                    <p className="chapter-sub">{ch.subtitle}</p>
                    <div className="chapter-stats">
                      <span>{ch.durationMin} min</span>
                      <span>·</span>
                      <span>{lessons.length || "—"} lecciones</span>
                      {!chapterLocked && (
                        <>
                          <span>·</span>
                          <span className="chapter-modes">Guía · Libro</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
                {lessons.length > 0 && (
                  <ul className="lessons">
                    {lessons.map((l) => {
                      const lessonLocked = !isPro && ch.tier === "pro";
                      return (
                        <li key={l.id} className={"lesson-row status-" + (l.status || "available")}>
                          <button
                            className="lesson-btn"
                            onClick={() => {
                              if (lessonLocked) onOpenPaywall("lesson");
                              else onOpenLesson(l.id);
                            }}
                          >
                            <div className="lesson-num">
                              {l.status === "done" ? <IconCheck/> :
                               lessonLocked ? <IconLock/> :
                               <span>{String(l.number).padStart(2, "0")}</span>}
                            </div>
                            <div className="lesson-titleblock">
                              <div className="lesson-title">{l.title}</div>
                              <div className="lesson-meta">
                                <span>{l.durationMin} min</span>
                                {l.status === "in-progress" && <span className="lesson-tag">En curso</span>}
                                {lessonLocked && <span className="lesson-tag is-pro">Pro</span>}
                              </div>
                            </div>
                            <div className="lesson-arrow"><IconArrow/></div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Lesson — Modo Guía + Modo Libro + tabs
// ─────────────────────────────────────────────────────────────────────────
function Lesson({ lesson, book, author, variation, mood, onMoodChange, showAuthor, mode, onModeChange, tier, onOpenPaywall, onBack, onComplete }) {
  const [tab, setTab] = React.useState("leccion"); // leccion · discusion · ia
  const [checked, setChecked] = React.useState([false, false, false, false]);
  const checklistDone = checked.filter(Boolean).length;
  const totalChecklist = checked.length;
  const scrollRef = React.useRef(null);
  const [scrolled, setScrolled] = React.useState(0);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      setScrolled(max > 0 ? Math.min(1, el.scrollTop / max) : 0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [tab, mode]);

  // Lesson is rendered inside an inner scroll container so the topbar stays.
  return (
    <div className="screen screen-lesson">
      <TopBar
        sticky
        left={
          <button className="btn-icon" onClick={onBack} aria-label="Volver al índice">
            <IconBack/>
          </button>
        }
        right={
          <div className="lesson-topbar-meta">
            <span className="lesson-counter">Lección {lesson.number} · Capítulo 1</span>
            <MoodPicker value={mood} onChange={onMoodChange} compact/>
          </div>
        }
      />
      <div className="lesson-progress-rail">
        <div className="lesson-progress-fill" style={{ width: (scrolled * 100) + "%" }}></div>
      </div>

      <div className="lesson-scroll" ref={scrollRef}>
        <div className="lesson-wrap">
          {/* Hero */}
          <div className={"lesson-hero hero-art-" + variation}>
            <div className="lesson-hero-art" aria-hidden>
              <div className="lesson-hero-num">{String(lesson.number).padStart(2, "0")}</div>
            </div>
            <div className="lesson-hero-body">
              <span className="eyebrow">Capítulo 1 · {lesson.partsCount} partes</span>
              <h1 className="lesson-title">{lesson.title}</h1>
              <p className="lesson-sub">{lesson.subtitle}</p>
              <div className="lesson-hero-meta">
                <span className="badge badge-warm">{lesson.durationMin} min</span>
                {showAuthor && (
                  <span className="lesson-author-mini">
                    <span className="author-avatar xs" aria-hidden>{author.avatarInitials}</span>
                    Con {author.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Mode toggle + tab strip */}
          <div className="lesson-controls">
            <ModeToggle mode={mode} onChange={onModeChange} available={book.modes} tier={tier} onPaywall={onOpenPaywall}/>
            <div className="lesson-tabs">
              {[
                { id: "leccion", label: "Lección" },
                { id: "discusion", label: "Discusión", pro: true },
                { id: "ia", label: "Pregúntale a " + author.name.split(" ")[1], pro: true },
              ].map((t) => {
                const gated = t.pro && tier !== "pro";
                return (
                  <button
                    key={t.id}
                    className={"lesson-tab " + (tab === t.id ? "is-on" : "") + (gated ? " is-pro-gated" : "")}
                    onClick={() => {
                      if (gated) { onOpenPaywall(t.id === "ia" ? "marina-ia" : "default"); return; }
                      setTab(t.id);
                    }}
                  >
                    {t.label}
                    {gated && <span className="lesson-tab-pro">Pro</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Body */}
          {tab === "leccion" && mode === "guia" && tier === "pro" && (
            <LessonBlocks
              lesson={lesson}
              author={author}
              variation={variation}
              showAuthor={showAuthor}
              checked={checked}
              onToggleChecked={(i) => setChecked((c) => c.map((v, j) => j === i ? !v : v))}
            />
          )}
          {tab === "leccion" && mode === "guia" && tier !== "pro" && (
            <>
              <div className="lesson-blocks lesson-blocks-truncated">
                {lesson.blocks.slice(0, 2).map((b, i) => {
                  switch (b.kind) {
                    case "goal":  return <GoalBlock key={i} data={b} variation={variation}/>;
                    case "prose": return <ProseBlock key={i} data={b}/>;
                    default: return null;
                  }
                })}
              </div>
              <PaywallFade author={author} onUpgrade={() => onOpenPaywall("modo-guia")}/>
            </>
          )}
          {tab === "leccion" && mode === "libro" && (
            <LessonProse lesson={lesson} author={author} showAuthor={showAuthor}/>
          )}
          {tab === "discusion" && <DiscussionTab lesson={lesson} author={author}/>}
          {tab === "ia" && <AskAITab author={author} lesson={lesson}/>}

          {tab === "leccion" && !(mode === "guia" && tier !== "pro") && (
            <div className="lesson-foot">
              <div className="lesson-foot-meta">
                {mode === "guia" ? (
                  <>
                    <span>Checklist {checklistDone}/{totalChecklist}</span>
                  </>
                ) : (
                  <span>Lectura {Math.round(scrolled * 100)}% completada</span>
                )}
              </div>
              <button
                className="btn-primary lesson-continue"
                onClick={() => onComplete()}
                disabled={mode === "guia" && checklistDone < totalChecklist}
              >
                Continuar a la lección 2 <IconArrow/>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LessonBlocks({ lesson, author, variation, showAuthor, checked, onToggleChecked }) {
  return (
    <div className="lesson-blocks">
      {lesson.blocks.map((b, i) => {
        switch (b.kind) {
          case "goal":           return <GoalBlock key={i} data={b} variation={variation}/>;
          case "prose":          return <ProseBlock key={i} data={b}/>;
          case "author-insight": return <AuthorInsightBlock key={i} data={b} author={author} showAuthor={showAuthor}/>;
          case "flip":           return <FlipBlock key={i} data={b}/>;
          case "video":          return <VideoBlock key={i} data={b}/>;
          case "audio":          return <AudioBlock key={i} data={b} variation={variation}/>;
          case "quiz":           return <QuizBlock key={i} data={b}/>;
          case "exercise":       return <ExerciseBlock key={i} data={b} variation={variation}/>;
          case "checklist":      return <ChecklistBlock key={i} data={b} checked={checked} onToggle={onToggleChecked}/>;
          default: return null;
        }
      })}
    </div>
  );
}

// ── Modo Libro: continuous prose, no block chrome ──────────────────────────
function LessonProse({ lesson, author, showAuthor }) {
  return (
    <article className="lesson-prose">
      <header className="prose-header">
        <span className="eyebrow">Capítulo 1 · Lección {lesson.number}</span>
        <h2 className="prose-bigtitle">{lesson.title}</h2>
        {showAuthor && <p className="prose-byline">por {author.name}</p>}
      </header>

      {lesson.blocks.map((b, i) => {
        if (b.kind === "goal") {
          return (
            <p key={i} className="prose-lead">
              <em>Tu objetivo:</em> {b.body}
            </p>
          );
        }
        if (b.kind === "prose") {
          return (
            <React.Fragment key={i}>
              {b.heading && <h3 className="prose-h2">{b.heading}</h3>}
              {b.paragraphs?.map((p, j) => <p key={j} className="prose-para">{p}</p>)}
              {b.bullets && (
                <ul className="prose-list">
                  {b.bullets.map((bb, j) => <li key={j}>{bb}</li>)}
                </ul>
              )}
            </React.Fragment>
          );
        }
        if (b.kind === "author-insight" && showAuthor) {
          return (
            <blockquote key={i} className="prose-quote">
              {b.quote}
              <cite>— {author.name}</cite>
            </blockquote>
          );
        }
        if (b.kind === "flip") {
          return (
            <div key={i} className="prose-sidebar">
              <span className="prose-sidebar-label">{b.front.label}</span>
              <p><strong>{b.front.title}.</strong> {b.front.body}</p>
              <span className="prose-sidebar-label">{b.back.label}</span>
              <p><strong>{b.back.title}.</strong> {b.back.body}</p>
            </div>
          );
        }
        if (b.kind === "video" || b.kind === "audio") {
          return (
            <p key={i} className="prose-media-ref">
              ◆ Contenido multimedia disponible en Modo Guía: <em>{b.title}</em>.
            </p>
          );
        }
        if (b.kind === "exercise") {
          return (
            <div key={i} className="prose-exercise">
              <span className="prose-sidebar-label">Ejercicio</span>
              <p><strong>{b.title}.</strong> {b.prompt}</p>
            </div>
          );
        }
        if (b.kind === "quiz") {
          return (
            <div key={i} className="prose-exercise">
              <span className="prose-sidebar-label">Para pensar</span>
              <p>{b.question}</p>
            </div>
          );
        }
        if (b.kind === "checklist") {
          return null;
        }
        return null;
      })}

      <p className="prose-end">— · —</p>
    </article>
  );
}

// ── Discussion tab (community) ─────────────────────────────────────────────
function DiscussionTab({ lesson, author }) {
  const threads = [
    {
      author: "Camila R.",
      city: "Quito",
      time: "hace 2 h",
      body: "El ejemplo del jefe interrumpiéndome me golpeó. Llevo años sin notar ese instante. ¿Alguien tiene un truco para acordarse de respirar antes?",
      replies: 4,
      cheers: 12,
    },
    {
      author: "José Luis A.",
      city: "Cuenca",
      time: "ayer",
      body: "Hice el ejercicio del cuaderno y me di cuenta que mi disparador no era lo que mi hijo dijo, sino el cansancio acumulado. Nunca lo había visto así.",
      replies: 2,
      cheers: 23,
    },
    {
      author: author.name,
      city: "Psicóloga · Autora",
      time: "hace 30 min",
      body: "Gracias por compartir, José Luis. Notar el contexto antes del disparador es exactamente la maestría de esta lección. Sigue así.",
      replies: 0,
      cheers: 31,
      isAuthor: true,
    },
  ];
  return (
    <div className="discussion">
      <div className="discussion-head">
        <h3 className="discussion-title">Discusión de la lección</h3>
        <p className="discussion-sub">Conversaciones moderadas. Comparte con respeto y anonimato si lo prefieres.</p>
      </div>
      <div className="discussion-compose">
        <textarea className="discussion-input" placeholder="¿Qué te quedó dando vueltas? Escribe aquí…" rows={2}></textarea>
        <div className="discussion-compose-row">
          <label className="discussion-anon">
            <input type="checkbox"/> Publicar como anónimo
          </label>
          <button className="btn-primary btn-sm">Publicar</button>
        </div>
      </div>
      <ul className="threads">
        {threads.map((t, i) => (
          <li key={i} className={"thread " + (t.isAuthor ? "is-author" : "")}>
            <div className="thread-head">
              <div className="thread-avatar" aria-hidden>{t.author.split(" ").map(x=>x[0]).slice(0,2).join("")}</div>
              <div className="thread-meta">
                <div className="thread-name">
                  {t.author}
                  {t.isAuthor && <span className="thread-badge">Autora</span>}
                </div>
                <div className="thread-sub">{t.city} · {t.time}</div>
              </div>
            </div>
            <p className="thread-body">{t.body}</p>
            <div className="thread-actions">
              <button>💜 {t.cheers}</button>
              <button>💬 {t.replies}</button>
              <button>Responder</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Ask AI tab (companion) ─────────────────────────────────────────────────
function AskAITab({ author, lesson }) {
  const initial = [
    {
      role: "ai",
      body:
        "Hola, soy Marina IA — una versión de la voz de la doctora entrenada en este libro. Puedo ayudarte a entender lo que acabas de leer o a pensar tu propio caso. ¿Por dónde empezamos?",
    },
  ];
  const [msgs, setMsgs] = React.useState(initial);
  const [val, setVal] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const suggestions = [
    "¿Cómo distingo un disparador real de un pensamiento mío?",
    "¿Qué hago si reacciono antes de notar nada?",
    "Quiero revisar mi disparador de hoy contigo.",
  ];
  async function ask(text) {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { role: "user", body: text }]);
    setVal("");
    setLoading(true);
    try {
      const sys =
        "Eres Marina IA, asistente de la Dra. Marina Salazar dentro de la app Psico Platform. " +
        "Hablas en español neutro latinoamericano, en segunda persona singular (tú), con calidez clínica. " +
        "Tema actual: '" + lesson.title + "' — distinguir disparador y emoción. " +
        "Responde corto, máximo 3 frases. No diagnostiques. Si la pregunta es delicada, deriva con cuidado.";
      const reply = await window.claude.complete({
        messages: [{ role: "user", content: sys + "\n\nUsuario: " + text }],
      });
      setMsgs((m) => [...m, { role: "ai", body: reply.trim() }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "ai", body: "Tuvimos un problema conectando. Inténtalo en un momento." }]);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="ai">
      <div className="ai-head">
        <div className="author-avatar md" aria-hidden>{author.avatarInitials}</div>
        <div>
          <h3 className="ai-title">Pregúntale a {author.name.split(" ").slice(-1)[0]}</h3>
          <p className="ai-sub">Asistente bioinspirado · Entrenado en este libro · Privado</p>
        </div>
        <span className="ai-status"><span className="ai-status-dot"></span>En línea</span>
      </div>
      <div className="ai-thread">
        {msgs.map((m, i) => (
          <div key={i} className={"ai-msg ai-msg-" + m.role}>
            <div className="ai-bubble">{m.body}</div>
          </div>
        ))}
        {loading && (
          <div className="ai-msg ai-msg-ai">
            <div className="ai-bubble ai-typing"><span></span><span></span><span></span></div>
          </div>
        )}
      </div>
      {msgs.length <= 2 && (
        <div className="ai-suggestions">
          {suggestions.map((s, i) => (
            <button key={i} className="ai-suggestion" onClick={() => ask(s)}>{s}</button>
          ))}
        </div>
      )}
      <form
        className="ai-compose"
        onSubmit={(e) => { e.preventDefault(); ask(val); }}
      >
        <input
          className="ai-input"
          placeholder={`Escríbele a ${author.name.split(" ").slice(-1)[0]}…`}
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
        <button type="submit" className="btn-primary btn-sm" disabled={loading || !val.trim()}>Enviar</button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Done — lesson complete
// ─────────────────────────────────────────────────────────────────────────
function LessonDone({ lesson, author, showAuthor, onNext, onIndex }) {
  return (
    <div className="screen screen-done">
      <div className="done-wrap">
        <div className="done-burst" aria-hidden>
          <svg viewBox="0 0 24 24" width="40" height="40">
            <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.12"/>
            <path d="M7 12l3.5 3.5L17 9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <span className="eyebrow">Lección completada</span>
        <h1 className="done-title">{lesson.title}</h1>
        <p className="done-sub">Tu sistema bioinspirado notó tu ritmo. Te recomendamos seguir mañana con la lección siguiente — la práctica espaciada consolida mejor.</p>

        {showAuthor && (
          <div className="done-author">
            <div className="author-avatar md" aria-hidden>{author.avatarInitials}</div>
            <p className="done-quote">
              “Lo que acabas de hacer parece pequeño, pero es el inicio de toda regulación emocional. Bien hecho.”
              <span className="done-quote-attr">— {author.name}</span>
            </p>
          </div>
        )}

        <div className="done-next-card">
          <span className="eyebrow">Siguiente</span>
          <div className="done-next-row">
            <div>
              <h3 className="done-next-title">Lección 2 · Nombrar lo que sientes</h3>
              <p className="done-next-sub">7 min · 6 partes · Quiz incluido</p>
            </div>
            <button className="btn-primary" onClick={onNext}>Empezar <IconArrow/></button>
          </div>
        </div>

        <button className="btn-ghost" onClick={onIndex}>Volver al índice</button>
      </div>
    </div>
  );
}

Object.assign(window, { BookCover, BookIndex, Lesson, LessonDone });
