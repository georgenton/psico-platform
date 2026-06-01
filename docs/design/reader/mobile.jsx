// reader/mobile.jsx — Lector iPhone.

const {
  READER_BOOK: B_M, READER_CHAPTER: C_M, READER_BLOCKS: BL_M,
  READER_SESSION: S_M, READER_AUDIO_PLAYER: AP_M,
  READER_LESSONS: LS_M, READER_CHAPTERS: CS_M, READER_ANNOTATIONS: AN_M,
} = window;

function MI({ d, size = 14, sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const MI_ = {
  back:  <MI d="M15 6l-6 6 6 6"/>,
  aa:    <MI d={["M5 18L12 4l7 14","M8 13h8"]} sw={2}/>,
  toc:   <MI d="M4 6h16M4 12h16M4 18h10"/>,
  bookm: <MI d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>,
  play:  <MI d="M8 5v14l11-7z"/>,
  pause: <MI d={["M6 5h4v14H6z","M14 5h4v14h-4z"]} sw={0}/>,
  check: <MI d="M5 12l5 5L20 7" sw={2.4}/>,
  arrow: <MI d="M5 12h14M13 6l6 6-6 6"/>,
  trans: <MI d={["M4 6h16","M4 12h16","M4 18h10"]}/>,
  search:<MI d={["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z","M16 16l5 5"]}/>,
  x:     <MI d="M6 6l12 12M6 18L18 6"/>,
};

function MobBlock({ block, mode, tier, audio, setAudio, onOpenExercise, chapterEndRich, mobileSelection, onSelMore, communityHeat, onOpenHeat }) {
  const guideOnly = !!block.guideOnly;
  const showAsGuide = mode === "guia" && tier === "pro";

  // Audio expanded state — render even if normally locked.
  if (block.kind === "audio" && audio !== "idle") {
    const pct = Math.round(AP_M.progress * 100);
    return (
      <div className="mob-audio is-playing">
        <div className="mob-audio-head">
          <button className="mob-audio-play" aria-label="Pausar" onClick={() => setAudio("idle")}>{MI_.pause}</button>
          <div>
            <div className="mob-audio-eyebrow">Audio · sonando</div>
            <div className="mob-audio-title">{block.title}</div>
            <div className="mob-audio-sub">{block.sub}</div>
          </div>
          <span style={{ font: "600 10px/1 var(--font-mono)", color: "var(--reader-ink-muted)" }}>{AP_M.speed}</span>
        </div>
        <div className="mob-audio-scrub">
          <span>{AP_M.current}</span>
          <div className="mob-audio-scrub-bar">
            <div className="mob-audio-scrub-fill" style={{ width: pct + "%" }}/>
          </div>
          <span>{AP_M.duration}</span>
        </div>
        <div className="mob-audio-tools">
          <button className="mob-audio-tool" type="button">−15s</button>
          <button className="mob-audio-tool" type="button">+30s</button>
          <button className="mob-audio-tool" type="button">{AP_M.speed}</button>
          <span style={{ flex: 1 }}/>
          <button
            type="button"
            className={"mob-audio-tool " + (audio === "transcript" ? "is-on" : "")}
            onClick={() => setAudio(audio === "transcript" ? "playing" : "transcript")}
          >Transcripción</button>
        </div>
      </div>
    );
  }

  if (guideOnly && !showAsGuide) {
    const map = {
      audio: { glyph: "🎧", h: "Audio guiado · Pro",          s: "Marina te guía con la voz." },
      reflection: { glyph: "✎", h: "Reflexión rápida · Pro",   s: "Pausa para responderte." },
      checklist: { glyph: "✓", h: "Auto-observación · Pro",    s: "Una lista para notarte." },
      exercise: { glyph: "🌱", h: "Ejercicio · Pro",             s: "Una práctica de 10 min." },
    };
    const m = map[block.kind];
    return (
      <div className="mob-locked-tease">
        <span className="mob-locked-glyph">{m.glyph}</span>
        <div className="mob-locked-meta">
          <div className="mob-locked-h">{m.h}</div>
          <div className="mob-locked-s">{m.s}</div>
        </div>
      </div>
    );
  }

  switch (block.kind) {
    case "lesson-head":
      return (
        <header className="mob-lesson-head">
          <div className="mob-lesson-num">Lección {String(block.n).padStart(2, "0")} · {block.min} min</div>
          <h2 className="mob-lesson-title">{block.title}</h2>
        </header>
      );
    case "prose": {
      const SEL = "Una de las cosas que aprendí en consulta";
      const PHRASE = "tristeza y depresión no son lo mismo";
      if (block.body.startsWith(SEL)) {
        return (
          <p className="mob-prose" data-onb="prose">
            Una de las cosas que aprendí en consulta — y que sigo aprendiendo — es que{" "}
            <span className={"sel-anchor " + (mobileSelection ? "has-handles" : "")}>
              <span className="sel-text c-lavender">{PHRASE}</span>
            </span>
            . La tristeza es una visita.
            {communityHeat && window.HeatMark && <window.HeatMark body={block.body} onOpen={onOpenHeat} surface="mobile"/>}
          </p>
        );
      }
      return (
        <p className="mob-prose">
          {block.body}
          {communityHeat && window.HeatMark && <window.HeatMark body={block.body} onOpen={onOpenHeat} surface="mobile"/>}
        </p>
      );
    }
    case "pullquote":
      return <blockquote className="mob-pq">{block.text}</blockquote>;
    case "callout":
      return (
        <aside className="mob-callout">
          <header className="mob-callout-head">
            <span className="mob-callout-avatar">MS</span>
            <div>
              <div className="mob-callout-id">{block.author}</div>
              <div className="mob-callout-label">De la autora</div>
            </div>
          </header>
          <p className="mob-callout-body">"{block.body}"</p>
        </aside>
      );
    case "audio":
      return (
        <div className="mob-audio">
          <button className="mob-audio-play" aria-label="Reproducir" onClick={() => setAudio("playing")}>{MI_.play}</button>
          <div>
            <div className="mob-audio-eyebrow">Audio guiado</div>
            <div className="mob-audio-title">{block.title}</div>
            <div className="mob-audio-sub">{block.sub}</div>
          </div>
          <span style={{ font: "600 11px/1 var(--font-mono)", color: "var(--reader-ink-muted)" }}>{block.duration}</span>
        </div>
      );
    case "reflection":
      return (
        <div className="mob-reflection">
          <div style={{ font: "700 9.5px/1 var(--font-sans)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--color-lavender-700)" }}>
            ✎ Reflexión rápida
          </div>
          <div className="mob-reflection-q">{block.question}</div>
          <div className="mob-reflection-chips">
            {block.chips.map((c) => <button key={c} className="mob-reflection-chip">{c}</button>)}
          </div>
        </div>
      );
    case "checklist":
      return (
        <div className="mob-check">
          <h3 className="mob-check-title">{block.title}</h3>
          <p className="mob-check-sub">{block.sub}</p>
          <ul className="mob-check-items">
            {block.items.map((item, i) => (
              <li key={i} className="mob-check-item">
                <span className="mob-check-box"></span>
                <span className="mob-check-label">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "exercise":
      return (
        <div className="mob-ex">
          <h3 className="mob-ex-title">{block.title}</h3>
          <div className="mob-ex-sub">{block.sub}</div>
          <p className="mob-ex-body">"{block.body}"</p>
          <button className="mob-ex-cta" onClick={onOpenExercise}>Empezar {MI_.arrow}</button>
        </div>
      );
    case "chapter-end":
      if (chapterEndRich) {
        return <window.RichChapterEnd next={block.next}/>;
      }
      return (
        <div className="mob-end">
          <div className="mob-end-eyebrow">✓ Capítulo terminado</div>
          <h3 className="mob-end-h">"A veces solo necesita ser acompañada hasta la puerta."</h3>
          <p className="mob-end-s">Siguiente · Cap. {block.next.n} · {block.next.title}</p>
          <button className="mob-end-cta">Empezar capítulo {block.next.n} {MI_.arrow}</button>
        </div>
      );
    default: return null;
  }
}

function MobileReader({ tweaks, setTweak }) {
  const cls =
    "mob theme-" + tweaks.theme +
    (tweaks.bodyFont === "sans" ? " font-sans-body" : "") +
    (tweaks.highContrast  ? " acc-high-contrast" : "") +
    (tweaks.dyslexicFont  ? " acc-dyslexic"      : "") +
    (tweaks.spaciousType  ? " acc-spacious"      : "") +
    (tweaks.reducedMotion ? " acc-reduced-motion" : "") +
    (tweaks.largeTargets  ? " acc-large-targets" : "") +
    (tweaks.focusRings    ? " acc-focus-rings"   : "");
  const pct = Math.round(AP_M.progress * 100);
  const sheet = tweaks.sheet || "none";

  return (
    <div className={cls} style={{ ["--reader-font-scale"]: tweaks.fontScale, ["--reader-line-height"]: tweaks.lineHeight || 1.6 }}>
      {tweaks.offline && tweaks.offline !== "off" && (
        <window.OfflineBanner
          kind={tweaks.offline}
          onAction={() => setTweak("overlay", "downloads")}
        />
      )}
      {/* Top */}
      <header className="mob-top">
        <button className="mob-top-iconbtn" aria-label="Atrás">{MI_.back}</button>
        <div className="mob-top-meta">
          <div className="mob-top-book">{B_M.title}</div>
          <div className="mob-top-chap">Cap. {C_M.num} · {Math.round(S_M.chapterProgress * 100)}%</div>
        </div>
        <div className="mob-top-actions">
          <button className="mob-top-iconbtn" aria-label="Buscar" onClick={() => setTweak("overlay", "search")}>{MI_.search}</button>
          <button className="mob-top-iconbtn" aria-label="Aa" onClick={() => setTweak("sheet", "aa")}>{MI_.aa}</button>
          <button className="mob-top-iconbtn" aria-label="Subrayados" onClick={() => setTweak("sheet", "annotations")}>{MI_.bookm}</button>
        </div>
        <div className="mob-top-progress">
          <div className="mob-top-progress-fill" style={{ width: Math.round(S_M.chapterProgress * 100) + "%" }}/>
        </div>
      </header>

      {/* Reading area */}
      <div className="mob-page">
        <header className="mob-hero">
          <span className="mob-hero-eyebrow">Capítulo {C_M.num}</span>
          <h1 className="mob-hero-title">{C_M.title}</h1>
          <p className="mob-hero-sub">{C_M.subtitle}</p>
          <div className="mob-hero-meta">
            <span>{B_M.author}</span>
            <span className="mob-hero-meta-sep"/>
            <span>{C_M.totalLessons} lecciones</span>
            <span className="mob-hero-meta-sep"/>
            <span>{C_M.totalMin} min</span>
          </div>
          {tweaks.sampleMode && (
            <div style={{ marginTop: 12 }}><window.SampleBadge/></div>
          )}
        </header>
        {tweaks.sampleMode && (
          <window.SampleBanner
            remainingMin={4}
            onUpgrade={() => setTweak("overlay", "paywall-hard")}
          />
        )}
        {tweaks.resume && (
          <div className="mob-resume" role="region">
            <span className="mob-resume-avatar">📖</span>
            <div className="mob-resume-meta">
              <div className="mob-resume-eyebrow">Continúa donde quedaste</div>
              <div className="mob-resume-title">Lec. {String(S_M.resumeFrom.lessonN).padStart(2, "0")} · {S_M.resumeFrom.lessonTitle}</div>
            </div>
            <button className="mob-resume-cta">Continuar</button>
          </div>
        )}
        {BL_M.map((b, i) => (
          <MobBlock
            key={i}
            block={b}
            mode={tweaks.mode}
            tier={tweaks.tier}
            audio={tweaks.audio}
            setAudio={(v) => setTweak("audio", v)}
            onOpenExercise={() => setTweak("overlay", "exercise")}
            chapterEndRich={!!tweaks.chapterEndRich}
            mobileSelection={!!tweaks.selection}
            communityHeat={tweaks.communityHeat !== false}
            onOpenHeat={() => setTweak("overlay", "community-heat")}
          />
        ))}
        {tweaks.selection && (
          <window.MobSelectionPopover
            onNote={() => setTweak("note", true)}
            onEco={() => setTweak("ecoConv", true)}
            onShare={() => setTweak("overlay", "share-quote")}
            onClose={() => setTweak("selection", false)}
          />
        )}
        {tweaks.sampleMode && (
          <window.SoftPaywall
            onUpgrade={() => setTweak("overlay", "paywall-hard")}
            onClose={() => setTweak("sampleMode", false)}
          />
        )}
      </div>

      {/* Mini-player (above dock) */}
      {tweaks.audio !== "idle" && (
        <div className="mob-mini">
          <button className="mob-mini-play" aria-label="Pausar" onClick={() => setTweak("audio", "idle")}>{MI_.pause}</button>
          <div className="mob-mini-meta">
            <div className="mob-mini-title">Encontrar la tristeza en el cuerpo</div>
            <div className="mob-mini-progress">
              <div className="mob-mini-progress-fill" style={{ width: pct + "%" }}/>
            </div>
          </div>
          <button className="mob-mini-close" aria-label="Cerrar" onClick={() => setTweak("audio", "idle")}>{MI_.x}</button>
        </div>
      )}

      {/* Bottom dock */}
      <div className="mob-dock">
        <div className="mob-dock-mode" data-onb="mode">
          <button
            className={"mob-dock-mode-btn " + (tweaks.mode === "libro" ? "is-on" : "")}
            onClick={() => setTweak("mode", "libro")}
          >Libro</button>
          <button
            className={"mob-dock-mode-btn " + (tweaks.mode === "guia" ? "is-on" : "")}
            onClick={() => setTweak("mode", "guia")}
          >Guía{tweaks.tier === "free" ? " 🔒" : ""}</button>
        </div>
        <button className="mob-dock-iconbtn" aria-label="Índice" onClick={() => setTweak("sheet", "toc")}>{MI_.toc}</button>
        <button className="mob-dock-iconbtn" aria-label="Subrayar" onClick={() => setTweak("sheet", "annotations")}>✎</button>
        <button
          className="mob-dock-eco"
          aria-label="Conversar con Eco"
          onClick={() => setTweak("ecoConv", !tweaks.ecoConv)}
          data-onb="eco"
        >✦</button>
      </div>

      {sheet !== "none" && (
        <MobSheet kind={sheet} tweaks={tweaks} setTweak={setTweak} onClose={() => setTweak("sheet", "none")}/>
      )}
      {tweaks.overlay === "exercise" && (
        <window.ExerciseSheet surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "search" && (
        <window.SearchSheet surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "empties" && (
        <window.EmptyStatesGallery surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "downloads" && (
        <window.DownloadsSheet surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "share-quote" && (
        <window.ShareQuoteSheet surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "paywall-hard" && (
        <window.HardPaywall
          surface="mobile"
          onClose={() => setTweak("overlay", "none")}
          onContinueFree={() => { setTweak("mode", "libro"); setTweak("overlay", "none"); }}
        />
      )}
      {tweaks.overlay === "safety" && (
        <window.SafetyCard
          surface="mobile"
          onClose={() => setTweak("overlay", "none")}
          onPauseEco={() => { setTweak("ecoConv", false); setTweak("overlay", "none"); }}
          onContinue={() => setTweak("overlay", "none")}
        />
      )}
      {tweaks.onboardingStep > 0 && (
        <window.OnboardingTour
          surface="mobile"
          step={tweaks.onboardingStep}
          onStep={(s) => setTweak("onboardingStep", s)}
          onDone={() => setTweak("onboardingStep", 0)}
        />
      )}
      {tweaks.overlay === "loading" && (
        <window.LoadingStatesGallery surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "accessibility" && (
        <window.AccessibilityPanel
          surface="mobile"
          tweaks={tweaks} setTweak={setTweak}
          onClose={() => setTweak("overlay", "none")}
        />
      )}
      {tweaks.overlay === "journey" && (
        <window.MyJourneyDrawer surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "pause" && (
        <window.PauseCard
          surface="mobile"
          todayMin={tweaks.todayMin || 0}
          goalMin={tweaks.goalMin || 15}
          streakDays={tweaks.streakDays || 7}
          onClose={() => setTweak("overlay", "none")}
          onContinue={() => setTweak("overlay", "none")}
        />
      )}
      {tweaks.overlay === "save-eco" && (
        <window.SaveEcoAsNote surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "audio-panel" && (
        <window.AudioPanel surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "audio-queue" && (
        <window.AudioQueueDrawer surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "keyboard" && (
        <window.KeyboardShortcuts surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "gift" && (
        <window.GiftBookSheet surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "community-heat" && (
        <window.CommunityHeatDrawer surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "tts" && (
        <window.TTSPanel surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "bookclub" && (
        <window.BookclubDrawer surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "weekly-recap" && (
        <window.WeeklyRecapEmail surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "author-onboarding" && (
        <window.AuthorOnboarding surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.ttsActive && (
        <window.TTSMiniBar
          voice="marina"
          onOpen={() => setTweak("overlay", "tts")}
          onClose={() => setTweak("ttsActive", false)}
        />
      )}
      {tweaks.overlay === "content-warning" && (
        <window.ContentWarningCard
          surface="mobile"
          kind="tristeza"
          onClose={() => setTweak("overlay", "none")}
          onLater={() => setTweak("overlay", "none")}
          onContinue={() => setTweak("overlay", "none")}
        />
      )}
      {tweaks.overlay === "author-page" && (
        <window.AuthorPage surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "habit-calendar" && (
        <window.HabitCalendar surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "reminders" && (
        <window.RemindersPreview surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "breath" && (
        <window.BreathBreak surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "privacy" && (
        <window.PrivacyDashboard surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "emotional-map" && (
        <window.EmotionalMap surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "home-widget" && (
        <window.HomeWidgetPreview surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
      {tweaks.overlay === "inbox" && (
        <window.InboxDrawer surface="mobile" onClose={() => setTweak("overlay", "none")}/>
      )}
    </div>
  );
}

// ── Mobile sheets ───────────────────────────────────────────────────────
function MobSheet({ kind, tweaks, setTweak, onClose }) {
  const titles = { toc: "Índice", aa: "Tamaño y tema", annotations: "Subrayados y notas" };
  return (
    <React.Fragment>
      <div className="mob-sheet-scrim" onClick={onClose}/>
      <div className="mob-sheet" role="dialog" aria-label={titles[kind]}>
        <div className="mob-sheet-handle"/>
        <header className="mob-sheet-head">
          <span className="mob-sheet-title">{titles[kind]}</span>
          <button className="mob-sheet-close" aria-label="Cerrar" onClick={onClose}>{MI_.x}</button>
        </header>
        <div className="mob-sheet-body">
          {kind === "toc"         && <MobSheetToc/>}
          {kind === "aa"          && <MobSheetAa tweaks={tweaks} setTweak={setTweak}/>}
          {kind === "annotations" && <MobSheetAnno/>}
        </div>
      </div>
    </React.Fragment>
  );
}

function MobSheetToc() {
  const [tab, setTab] = React.useState("lessons");
  return (
    <React.Fragment>
      <div className="mob-sheet-tabs">
        <button
          type="button"
          className={"mob-sheet-tab " + (tab === "book" ? "is-on" : "")}
          onClick={() => setTab("book")}
        >Libro (12)</button>
        <button
          type="button"
          className={"mob-sheet-tab " + (tab === "lessons" ? "is-on" : "")}
          onClick={() => setTab("lessons")}
        >Lecciones (4)</button>
      </div>
      {tab === "book" && CS_M.map((c) => {
        const cls =
          c.state === "current" ? "is-on" :
          c.state === "done"    ? "is-done" : "";
        return (
          <div key={c.n} className={"mob-sheet-bookrow " + cls}>
            <span className="mob-sheet-bookrow-num">{String(c.n).padStart(2, "0")}</span>
            <div>
              <div className="mob-sheet-bookrow-title">{c.title}</div>
              <div className="mob-sheet-bookrow-meta">
                {c.state === "done" ? "Leído · " : ""}{c.min} min
              </div>
            </div>
          </div>
        );
      })}
      {tab === "lessons" && LS_M.map((l) => {
        const cls =
          l.state === "current" ? "is-on" :
          l.state === "done"    ? "is-done" : "";
        return (
          <div key={l.n} className={"mob-sheet-lessonrow " + cls}>
            {l.state === "done" ? (
              <span className="mob-sheet-lessonrow-tick">{MI_.check}</span>
            ) : (
              <span className="mob-sheet-lessonrow-num">{String(l.n).padStart(2, "0")}</span>
            )}
            <span className="mob-sheet-lessonrow-title">{l.title}</span>
            <span className="mob-sheet-lessonrow-time">{l.min} min</span>
          </div>
        );
      })}
    </React.Fragment>
  );
}

function MobSheetAa({ tweaks, setTweak }) {
  const steps = [0.9, 1.0, 1.1, 1.2];
  return (
    <React.Fragment>
      <div className="mob-sheet-row">
        <div className="mob-sheet-row-lbl">Tamaño · {Math.round(tweaks.fontScale * 100)}%</div>
        <div className="mob-sheet-row-bar">
          {steps.map((s) => (
            <button
              key={s}
              className={Math.abs(tweaks.fontScale - s) < 0.05 ? "is-on" : ""}
              onClick={() => setTweak("fontScale", s)}
              style={{ fontSize: 12 + (s - 0.9) * 10 + "px" }}
              type="button"
            >Aa</button>
          ))}
        </div>
      </div>
      <div className="mob-sheet-row">
        <div className="mob-sheet-row-lbl">Tipografía</div>
        <div className="mob-sheet-row-bar">
          <button
            className={tweaks.bodyFont === "serif" ? "is-on" : ""}
            onClick={() => setTweak("bodyFont", "serif")}
            style={{ fontFamily: "Newsreader, Georgia, serif" }}
            type="button"
          >Newsreader</button>
          <button
            className={tweaks.bodyFont === "sans" ? "is-on" : ""}
            onClick={() => setTweak("bodyFont", "sans")}
            type="button"
          >Geist Sans</button>
        </div>
      </div>
      <div className="mob-sheet-row">
        <div className="mob-sheet-row-lbl">Papel</div>
        <div className="mob-sheet-themes">
          <button className={"mob-sheet-theme t-light " + (tweaks.theme === "light" ? "is-on" : "")} onClick={() => setTweak("theme", "light")} type="button">Claro</button>
          <button className={"mob-sheet-theme t-sepia " + (tweaks.theme === "sepia" ? "is-on" : "")} onClick={() => setTweak("theme", "sepia")} type="button">Sepia</button>
          <button className={"mob-sheet-theme t-dark "  + (tweaks.theme === "dark"  ? "is-on" : "")} onClick={() => setTweak("theme", "dark")} type="button">Oscuro</button>
        </div>
      </div>
    </React.Fragment>
  );
}

function MobSheetAnno() {
  return (
    <React.Fragment>
      <div style={{ font: "500 11px/1 var(--font-mono)", color: "var(--reader-ink-muted)", marginBottom: 10, letterSpacing: ".04em" }}>
        {AN_M.length} en este libro · {AN_M.filter((a) => a.kind === "note").length} notas
      </div>
      {AN_M.map((a, i) => (
        <div key={i} className="mob-sheet-anno">
          <header className="mob-sheet-anno-head">
            <span className={"reader-anno-card-dot c-" + a.color}></span>
            <span>{a.kind === "note" ? "Nota" : "Subrayado"}</span>
            <span style={{ flex: 1 }}/>
            <span style={{ textTransform: "none", letterSpacing: ".04em", fontFamily: "var(--font-mono)" }}>{a.when}</span>
          </header>
          <p className="mob-sheet-anno-text">"{a.text}"</p>
          {a.note && <div className="mob-sheet-anno-note">{a.note}</div>}
          <div className="mob-sheet-anno-meta">Cap. {a.chapter} · Lec. {a.lessonN} · {a.lessonTitle}</div>
        </div>
      ))}
    </React.Fragment>
  );
}

window.MobileReader = MobileReader;
