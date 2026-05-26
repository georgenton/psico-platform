// blocks.jsx — Modo Guía block components.
// All blocks render the same DOM structure across variations; visual
// re-skinning happens via CSS variables + .var-editorial / .var-calido /
// .var-inmersivo selectors in the host stylesheet.

// ── Small atomics ──────────────────────────────────────────────────────────
function Eyebrow({ children }) {
  return <div className="eyebrow">{children}</div>;
}

function PartLabel({ children }) {
  return <div className="part-label">{children}</div>;
}

// ── Goal callout — RISE's "YOUR GOAL" anchor card ──────────────────────────
function GoalBlock({ data, variation }) {
  const showEmoji = variation === "calido";
  return (
    <section className="block block-goal">
      <PartLabel>{data.part}</PartLabel>
      <div className="goal-card">
        <div className="goal-head">
          {showEmoji && <span className="goal-emoji" aria-hidden>✨</span>}
          <h3 className="goal-title">{data.title}</h3>
        </div>
        <p className="goal-body">{data.body}</p>
      </div>
    </section>
  );
}

// ── Prose paragraphs + optional bullets ────────────────────────────────────
function ProseBlock({ data }) {
  return (
    <section className="block block-prose">
      {data.heading && <h3 className="prose-h">{data.heading}</h3>}
      {data.paragraphs?.map((p, i) => (
        <p key={i} className="prose-p">{p}</p>
      ))}
      {data.bullets && (
        <ul className="prose-bullets">
          {data.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Author insight — quote with avatar ─────────────────────────────────────
function AuthorInsightBlock({ data, author, showAuthor }) {
  if (!showAuthor) return null;
  return (
    <section className="block block-author">
      <div className="author-card">
        <div className="author-avatar" aria-hidden>{author.avatarInitials}</div>
        <div className="author-body">
          <p className="author-quote">“{data.quote}”</p>
          <div className="author-meta">
            <span className="author-name">{author.name}</span>
            <span className="author-sep">·</span>
            <span className="author-attr">{data.attribution}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Flip card — Concepto / Ejemplo ─────────────────────────────────────────
function FlipBlock({ data }) {
  const [flipped, setFlipped] = React.useState(false);
  const face = flipped ? data.back : data.front;
  return (
    <section className="block block-flip">
      <Eyebrow>{data.eyebrow}</Eyebrow>
      <div
        className={"flip-card " + (flipped ? "is-back" : "is-front")}
        onClick={() => setFlipped(!flipped)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setFlipped(!flipped); }}
      >
        <span className="flip-side-label">{face.label}</span>
        <h4 className="flip-title">{face.title}</h4>
        <p className="flip-body">{face.body}</p>
        <span className="flip-hint">Toca para ver el {flipped ? "concepto" : "ejemplo"} →</span>
      </div>
    </section>
  );
}

// ── Video block (visual only — fake play affordance) ───────────────────────
function VideoBlock({ data }) {
  const [playing, setPlaying] = React.useState(false);
  return (
    <section className="block block-video">
      <div className={"video-card poster-" + (data.poster || "lavender")}>
        <button
          className="video-play"
          aria-label="Reproducir video"
          onClick={() => setPlaying(!playing)}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/>
              <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <path d="M8 5v14l11-7L8 5z" fill="currentColor"/>
            </svg>
          )}
        </button>
        <div className="video-meta">
          <span className="video-duration">{data.duration}</span>
        </div>
        <div className="video-shapes" aria-hidden>
          <span></span><span></span><span></span>
        </div>
      </div>
      <h4 className="video-title">{data.title}</h4>
      {data.caption && <p className="video-caption">{data.caption}</p>}
    </section>
  );
}

// ── Audio player (visual only) ─────────────────────────────────────────────
function AudioBlock({ data, variation }) {
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0.18);
  React.useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setProgress((p) => (p >= 1 ? 0 : p + 0.012)), 200);
    return () => clearInterval(id);
  }, [playing]);
  const emoji = variation === "calido" ? "🎧" : null;
  return (
    <section className="block block-audio">
      <div className="audio-card">
        <button
          className="audio-play"
          aria-label={playing ? "Pausar" : "Reproducir audio"}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/>
              <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
              <path d="M8 5v14l11-7L8 5z" fill="currentColor"/>
            </svg>
          )}
        </button>
        <div className="audio-body">
          <div className="audio-title">
            {emoji && <span aria-hidden>{emoji}</span>} {data.title}
          </div>
          {data.caption && <div className="audio-caption">{data.caption}</div>}
          <div className="audio-track">
            <div className="audio-track-fill" style={{ width: (progress * 100) + "%" }}></div>
          </div>
          <div className="audio-meta">
            <span>{formatTime(progress * (toSec(data.duration)))}</span>
            <span>{data.duration}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
function toSec(d) { const [m,s]=d.split(":").map(Number); return m*60+s; }
function formatTime(s) { const m=Math.floor(s/60); const ss=Math.floor(s%60); return m+":"+String(ss).padStart(2,"0"); }

// ── Quiz (single-question) ─────────────────────────────────────────────────
function QuizBlock({ data }) {
  const [picked, setPicked] = React.useState(null);
  const chosen = data.options.find((o) => o.id === picked);
  return (
    <section className="block block-quiz">
      <PartLabel>{data.part}</PartLabel>
      <div className="quiz-card">
        <h4 className="quiz-q">{data.question}</h4>
        <div className="quiz-options">
          {data.options.map((opt) => {
            const isPicked = picked === opt.id;
            const state = !picked ? "" : isPicked ? (opt.correct ? "correct" : "wrong") : (opt.correct ? "reveal" : "");
            return (
              <button
                key={opt.id}
                className={"quiz-option " + state}
                onClick={() => setPicked(opt.id)}
                disabled={!!picked && !isPicked && !opt.correct}
              >
                <span className="quiz-bullet">{opt.id.toUpperCase()}</span>
                <span className="quiz-text">{opt.text}</span>
                {picked && (opt.correct ? <span className="quiz-mark">✓</span> : isPicked ? <span className="quiz-mark wrong">×</span> : null)}
              </button>
            );
          })}
        </div>
        {chosen && (
          <div className={"quiz-feedback " + (chosen.correct ? "is-correct" : "is-wrong")}>
            <strong>{chosen.correct ? "Exacto." : "No del todo."}</strong> {chosen.feedback}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Exercise / journal prompt ──────────────────────────────────────────────
function ExerciseBlock({ data, variation }) {
  const [val, setVal] = React.useState("");
  const emoji = variation === "calido" ? "🌱" : null;
  return (
    <section className="block block-exercise">
      <PartLabel>{data.part}</PartLabel>
      <div className="exercise-card">
        <div className="exercise-head">
          {emoji && <span className="exercise-emoji" aria-hidden>{emoji}</span>}
          <h4 className="exercise-title">{data.title}</h4>
        </div>
        <p className="exercise-prompt">{data.prompt}</p>
        <textarea
          className="exercise-input"
          placeholder={data.placeholder}
          rows={4}
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
        <div className="exercise-foot">
          <span className="exercise-tip">{data.tip}</span>
          <span className="exercise-count">{val.length} caracteres · guardado privado</span>
        </div>
      </div>
    </section>
  );
}

// ── Checklist block ────────────────────────────────────────────────────────
function ChecklistBlock({ data, checked, onToggle }) {
  return (
    <section className="block block-checklist">
      <div className="checklist-card">
        <h4 className="checklist-title">{data.title}</h4>
        {data.subtitle && <p className="checklist-sub">{data.subtitle}</p>}
        <ul className="checklist-items">
          {data.items.map((item, i) => {
            const isOn = checked[i];
            return (
              <li key={i} className={"checklist-item " + (isOn ? "is-on" : "")}>
                <button
                  className="checklist-check"
                  onClick={() => onToggle(i)}
                  aria-pressed={isOn}
                  aria-label={item}
                >
                  {isOn && (
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
                      <path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
                <span>{item}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ── Export to window ───────────────────────────────────────────────────────
Object.assign(window, {
  GoalBlock,
  ProseBlock,
  AuthorInsightBlock,
  FlipBlock,
  VideoBlock,
  AudioBlock,
  QuizBlock,
  ExerciseBlock,
  ChecklistBlock,
});
