// onboarding/components.jsx — Step-flow onboarding (responsive web + mobile).
// One big question per page, calm pacing, no chat bubbles.
// Same data (data.js) drives both surfaces.

const { IOSDevice } = window;

const STEPS = window.ONBOARDING_STEPS;
const MOOD_NAMES = { calma: "Calma", foco: "Foco", energia: "Energía", reflexion: "Reflexión" };

// ── Shared chrome ─────────────────────────────────────────────────────────
function TopBar({ idx, total, onBack, eyebrow }) {
  const showProgress = total > 0;
  const pct = total > 0 ? ((idx + 1) / total) * 100 : 0;
  return (
    <header className="onb-top">
      <div className="onb-top-l">
        {idx > 0 ? (
          <button className="onb-back" onClick={onBack} aria-label="Volver">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 6l-6 6 6 6"/></svg>
            Atrás
          </button>
        ) : (
          <span className="onb-wordmark">Psico Platform</span>
        )}
      </div>
      {showProgress && (
        <div className="onb-progress" aria-label={"Paso " + (idx + 1) + " de " + total}>
          <div className="onb-progress-fill" style={{ width: pct + "%" }}></div>
        </div>
      )}
      {showProgress && (
        <span className="onb-step-counter">{String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
      )}
    </header>
  );
}

function StepShell({ eyebrow, question, helper, children, foot }) {
  return (
    <>
      <main className="onb-main">
        <div className="onb-step">
          {eyebrow && <span className="onb-eyebrow">{eyebrow}</span>}
          {question && <h1 className="onb-q">{question}</h1>}
          {helper && <p className="onb-helper">{helper}</p>}
          {children}
        </div>
      </main>
      {foot && <footer className="onb-foot">{foot}</footer>}
    </>
  );
}

// ── Intro ────────────────────────────────────────────────────────────────
function IntroStep({ onAdvance }) {
  return (
    <div className="onb-intro">
      <div className="onb-intro-art" aria-hidden></div>
      <h1 className="onb-intro-title">Empieza tu camino al bienestar emocional.</h1>
      <p className="onb-intro-body">
        Te haremos unas pocas preguntas — un minuto — para sugerirte un primer libro y un mood que vaya contigo hoy.
      </p>
      <button className="onb-cta onb-cta-primary" onClick={onAdvance}>
        Empecemos
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
      <span className="onb-intro-reass">Sin tarjeta de crédito · Cancela cuando quieras</span>
    </div>
  );
}

// ── Options ──────────────────────────────────────────────────────────────
function OptionsStep({ step, value, onChange, foot, eyebrow }) {
  return (
    <StepShell eyebrow={eyebrow} question={step.question} helper={step.helper} foot={foot}>
      <div className="onb-options">
        {step.options.map((o) => {
          const on = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              className={"onb-option " + (on ? "is-on" : "")}
              onClick={() => onChange(o.id)}
              aria-pressed={on}
            >
              <span className="onb-option-emoji" aria-hidden>{o.emoji}</span>
              <span className="onb-option-body">
                <span className="onb-option-label">{o.label}</span>
                <span className="onb-option-sub">{o.sub}</span>
              </span>
              <span className="onb-option-check" aria-hidden>
                {on && <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>}
              </span>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}

// ── Mood ─────────────────────────────────────────────────────────────────
function MoodStep({ step, value, intensity, onChange, foot, eyebrow }) {
  return (
    <StepShell eyebrow={eyebrow} question={step.question} helper={step.helper} foot={foot}>
      <div className="onb-moods">
        {step.moods.map((m) => {
          const on = value === m.id;
          return (
            <button
              key={m.id}
              type="button"
              className={"onb-mood " + (on ? "is-on" : "")}
              onClick={() => onChange({ mood: m.id, intensity })}
              aria-pressed={on}
            >
              <span className={"onb-mood-swatch swatch-" + m.id} aria-hidden></span>
              <span className="onb-mood-name">{m.emoji} {m.name}</span>
              <span className="onb-mood-descr">{m.descr}</span>
            </button>
          );
        })}
      </div>
      <div className="onb-intensity-row">
        <div className="onb-intensity-label">{step.intensityLabel}</div>
        <input
          type="range" min="0" max="100" step="5" value={intensity}
          onChange={(e) => onChange({ mood: value, intensity: +e.target.value })}
          className="onb-intensity-track"
          aria-label="Intensidad"
        />
        <div className="onb-intensity-marks">
          <span>Suave</span><span>Intensa</span>
        </div>
      </div>
    </StepShell>
  );
}

// ── Profile ──────────────────────────────────────────────────────────────
function ProfileStep({ step, values, onChange, foot, eyebrow }) {
  return (
    <StepShell eyebrow={eyebrow} question={step.question} helper={step.helper} foot={foot}>
      <div className="onb-profile">
        {step.fields.map((f, idx) => (
          <div key={f.id} className={idx === step.fields.length - 1 ? "onb-profile-full" : ""}>
            <label className="onb-field-lbl">{f.label}</label>
            <select
              className="onb-field-select"
              value={values[f.id] || ""}
              onChange={(e) => onChange({ ...values, [f.id]: e.target.value })}
            >
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        ))}
      </div>
    </StepShell>
  );
}

// ── Recommendation ───────────────────────────────────────────────────────
function moodSwatch(id) {
  return ({
    calma: "linear-gradient(135deg, #a5c99e, #5e9254)",
    foco:  "linear-gradient(135deg, #d9d5ce, #5e42c0)",
    energia: "linear-gradient(135deg, #8b71f5, #7fae76)",
    reflexion: "linear-gradient(135deg, #ddd8ff, #4d36a0)",
  })[id] || "#8b71f5";
}
function timeLabel(id) {
  return ({ "5": "5 min/día", "15": "15 min/día", "30+": "30+ min/día", "var": "Varía" })[id] || "15 min/día";
}
function scheduleLabel(id) {
  return ({ morning: "🌅 Mañana", afternoon: "☕ Tarde", night: "🌙 Noche", skip: "—" })[id] || "—";
}

function RecommendationStep({ answers, foot, eyebrow }) {
  const motivation = answers.motivation || "explorar";
  const reco = window.BOOK_RECOMMENDATIONS[motivation];
  const moodId = answers.mood?.mood || "calma";
  const moodName = MOOD_NAMES[moodId];
  const timeId = answers.time || "15";

  const motLabel = (STEPS.find(s => s.id === "motivation").options.find(o => o.id === motivation) || {}).label || "explorar";

  const [marinaNote, setMarinaNote] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    const prompt =
      "Eres Marina IA, asistente de la app Psico Platform. Hablas en español neutro latinoamericano, en segunda persona singular (tú), con calidez clínica. Sin diagnóstico. " +
      "Una persona nueva acaba de hacer su onboarding. Te dijo: motivo='" + motLabel + "', mood='" + moodName + "', tiempo disponible='" + timeId + " min/día'. " +
      "Escribe una bienvenida personalizada en exactamente 2 frases breves (c. 30 palabras total). La primera valida su motivo, la segunda anticipa lo que verá a continuación. No saludes con 'hola'.";
    window.claude.complete({ messages: [{ role: "user", content: prompt }] })
      .then((r) => { if (alive) setMarinaNote(r.trim()); })
      .catch(() => { if (alive) setMarinaNote("Gracias por compartirlo. Te dejo aquí tu primer libro — el que mejor se acomoda a lo que me contaste."); });
    return () => { alive = false; };
  }, []);

  return (
    <StepShell
      eyebrow={eyebrow}
      question="Esto es lo que aprendí de ti."
      helper="Si algo no calza, lo cambias después."
      foot={foot}
    >
      <div className="onb-reco">
        <div className="onb-reco-summary">
          <span style={{ fontSize: 20, lineHeight: 1, color: "var(--color-lavender-700)" }} aria-hidden>✦</span>
          <span className="onb-reco-summary-body">
            {marinaNote || <em>Marina IA está leyendo lo que me dijiste…</em>}
          </span>
        </div>

        <h3 className="onb-reco-h">Tu primer libro</h3>
        <div className="onb-reco-card">
          <div className={"onb-reco-cover " + (reco.id === "familias-ensambladas" ? "cool" : "")}></div>
          <div className="onb-reco-meta">
            <span className="onb-reco-title">{reco.title}</span>
            <span className="onb-reco-author">Dra. Marina Salazar</span>
            <p className="onb-reco-reason">{reco.reason}</p>
          </div>
        </div>

        <h3 className="onb-reco-h">Tu configuración inicial</h3>
        <div className="onb-reco-stats">
          <div className="onb-reco-stat">
            <div className="onb-reco-stat-lbl">Mood</div>
            <div className="onb-reco-stat-val">
              <span className="onb-reco-stat-swatch" style={{ background: moodSwatch(moodId) }}></span>
              {moodName}
            </div>
          </div>
          <div className="onb-reco-stat">
            <div className="onb-reco-stat-lbl">Tiempo</div>
            <div className="onb-reco-stat-val">{timeLabel(timeId)}</div>
          </div>
          <div className="onb-reco-stat">
            <div className="onb-reco-stat-lbl">Plan</div>
            <div className="onb-reco-stat-val">Gratuito</div>
          </div>
          <div className="onb-reco-stat">
            <div className="onb-reco-stat-lbl">Recordatorio</div>
            <div className="onb-reco-stat-val">{scheduleLabel(answers.schedule)}</div>
          </div>
        </div>
      </div>
    </StepShell>
  );
}

// ── Register ─────────────────────────────────────────────────────────────
function RegisterStep({ onAdvance, onSkip, foot, eyebrow }) {
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  return (
    <StepShell
      eyebrow={eyebrow}
      question="Guarda tu progreso"
      helper="Tu plan gratuito incluye el primer capítulo de cada libro. Sin tarjeta."
      foot={foot && foot({ email, name })}
    >
      <div className="onb-register-social">
        <button className="onb-register-social-btn" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><path d="M21.35 11.1H12v3.8h5.36c-.23 1.4-1.66 4.1-5.36 4.1-3.23 0-5.86-2.67-5.86-5.95s2.63-5.95 5.86-5.95c1.84 0 3.07.78 3.77 1.45L18.6 5.9C16.95 4.36 14.66 3.4 12 3.4 6.97 3.4 2.9 7.47 2.9 12.5S6.97 21.6 12 21.6c6.93 0 9.5-4.86 9.5-7.95 0-.54-.05-.95-.15-1.55z" fill="currentColor"/></svg>
          Continuar con Google
        </button>
        <button className="onb-register-social-btn" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><path d="M16.36 13.5c0-2.18 1.6-3.27 1.67-3.32-0.91-1.33-2.32-1.5-2.82-1.53-1.2-0.12-2.34 0.71-2.95 0.71-0.62 0-1.55-0.69-2.55-0.67-1.31 0.02-2.52 0.76-3.19 1.93-1.37 2.37-0.35 5.87 0.98 7.8 0.65 0.94 1.42 2 2.42 1.96 0.98-0.04 1.35-0.63 2.53-0.63 1.18 0 1.51 0.63 2.55 0.61 1.05-0.02 1.72-0.96 2.36-1.91 0.74-1.09 1.04-2.15 1.06-2.21z" fill="currentColor"/></svg>
          Apple
        </button>
      </div>
      <div className="onb-register-divider">o con tu correo</div>
      <div className="onb-register-fields">
        <input type="text" placeholder="Tu nombre"
          className="onb-register-input"
          value={name} onChange={(e) => setName(e.target.value)}/>
        <input type="email" placeholder="tu@correo.com"
          className="onb-register-input"
          value={email} onChange={(e) => setEmail(e.target.value)}/>
      </div>
      <p className="onb-register-fineprint">
        Al continuar aceptas los <a>términos</a> y la <a>política de privacidad</a>.
      </p>
    </StepShell>
  );
}

// ── Tour overlay over mock reader ────────────────────────────────────────
function TourScreen({ answers, onDone }) {
  const [idx, setIdx] = React.useState(0);
  const steps = window.TOUR_STEPS;
  const step = steps[idx];
  const last = idx === steps.length - 1;
  const moodId = answers.mood?.mood || "calma";
  const reco = window.BOOK_RECOMMENDATIONS[answers.motivation || "explorar"];

  // Spotlight anchor positions, mirrored card placement
  const spots = {
    topbar: { top: 8, left: 12, width: 240, height: 48, cardTop: 70, cardLeft: 16 },
    modes:  { top: 420, left: "50%", translate: "-50%", width: 250, height: 48, cardTop: 484, cardLeft: 16 },
    marina: { top: 580, left: "50%", translate: "-50%", width: 230, height: 44, cardTop: 480, cardLeft: 16 },
  };
  const spot = spots[step.anchor] || spots.topbar;

  return (
    <div className="tour-stage">
      <div className="tour-reader">
        <div className="tour-reader-topbar">
          <span style={{ font: "700 16px/1 var(--font-sans)", color: "var(--color-lavender-700)" }}>Psico Platform</span>
          <span className="tour-reader-chip">
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: moodSwatch(moodId) }}></span>
            {MOOD_NAMES[moodId]}
          </span>
        </div>
        <div className="tour-reader-content">
          <div className="tour-reader-cover" aria-hidden></div>
          <h1 className="tour-reader-title">{reco.title}</h1>
          <p className="tour-reader-sub">Una guía para entenderte sin juzgarte.</p>
          <div className="tour-reader-toggles">
            <button className="tour-reader-toggles-btn is-on">Modo Guía</button>
            <button className="tour-reader-toggles-btn">Modo Libro</button>
          </div>
          <button className="tour-reader-cta">
            Empezar capítulo 1
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>
          <div className="tour-marina-pill">
            <span style={{ width: 18, height: 18, borderRadius: 999, background: "linear-gradient(135deg, #a697ff, #7fae76)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>MS</span>
            Pregúntale a Marina IA
          </div>
        </div>
      </div>

      <div className="tour-backdrop"></div>
      <div
        className="tour-spot"
        style={{
          top: spot.top, left: spot.left,
          width: spot.width, height: spot.height,
          transform: spot.translate ? "translateX(" + spot.translate + ")" : "none"
        }}
      ></div>
      <div className="tour-card" style={{ top: spot.cardTop, left: spot.cardLeft, right: 16 }}>
        <span className="tour-card-eyebrow">
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-lavender-500)" }}></span>
          Tour rápido · {idx + 1}/{steps.length}
        </span>
        <h2 className="tour-card-title">{step.title}</h2>
        <p className="tour-card-body">{step.body}</p>
        <div className="tour-card-foot">
          <div className="tour-card-dots">
            {steps.map((_, i) => <span key={i} className={"tour-card-dot " + (i === idx ? "is-on" : "")}></span>)}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {!last && <button className="tour-card-skip" onClick={onDone}>Saltar</button>}
            <button className="tour-card-cta" onClick={() => last ? onDone() : setIdx(idx + 1)}>
              {last ? "Empezar" : "Siguiente"} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Root state machine ──────────────────────────────────────────────────
function OnboardingApp() {
  const [stepIdx, setStepIdx] = React.useState(0);
  const [answers, setAnswers] = React.useState({});
  const [phase, setPhase] = React.useState("onboarding"); // onboarding · tour · done
  const [draftMood, setDraftMood] = React.useState({ mood: null, intensity: 50 });
  const [draftProfile, setDraftProfile] = React.useState({});

  const step = STEPS[stepIdx];
  const isFirst = stepIdx === 0;
  const visibleSteps = STEPS.length - 1; // excludes intro from the dots

  const totalForProgress = stepIdx === 0 ? 0 : visibleSteps;
  const progressIdx = Math.max(0, stepIdx - 1);

  const back = () => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  };

  // Per-step state
  const setAnswer = (key, value) => setAnswers((a) => ({ ...a, [key]: value }));

  const advance = () => setStepIdx((i) => i + 1);

  if (phase === "tour") return <TourScreen answers={answers} onDone={() => setPhase("done")}/>;
  if (phase === "done") {
    return (
      <div className="onb">
        <div className="onb-done">
          <span className="onb-done-tick">
            <svg viewBox="0 0 24 24" width="40" height="40">
              <path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <h2>Listo.</h2>
          <p>Tu primer capítulo te espera. Cuando regreses, Marina IA recordará dónde quedaste.</p>
        </div>
      </div>
    );
  }

  // The footer with Continuar (and optionally skip)
  const footFor = (canContinue, onContinue, opts) => (
    <>
      <div className="onb-foot-l">
        {opts?.skip && (
          <button className="onb-cta onb-cta-secondary" onClick={opts.skip.onClick} type="button">
            {opts.skip.label}
          </button>
        )}
      </div>
      <button
        className={"onb-cta " + (opts?.primary === false ? "" : "onb-cta-primary")}
        disabled={!canContinue}
        onClick={onContinue}
        type="button"
      >
        {opts?.label || "Continuar"}
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
    </>
  );

  let body;
  if (step.kind === "intro") {
    return (
      <div className="onb">
        <TopBar idx={0} total={0}/>
        <IntroStep onAdvance={advance}/>
      </div>
    );
  }

  const eyebrow = step.id === "register" ? "Casi listo" : step.id === "recommendation" ? "Tu plan inicial" : "Cuéntame";

  if (step.kind === "options") {
    const v = answers[step.id];
    body = (
      <OptionsStep
        eyebrow={eyebrow}
        step={step}
        value={v}
        onChange={(id) => setAnswer(step.id, id)}
        foot={footFor(!!v, () => { advance(); })}
      />
    );
  } else if (step.kind === "mood") {
    const v = answers.mood || draftMood;
    body = (
      <MoodStep
        eyebrow={eyebrow}
        step={step}
        value={v.mood}
        intensity={v.intensity ?? 50}
        onChange={(next) => { setDraftMood(next); setAnswer("mood", next); }}
        foot={footFor(!!v.mood, advance)}
      />
    );
  } else if (step.kind === "profile") {
    const v = answers.profile || draftProfile;
    body = (
      <ProfileStep
        eyebrow={eyebrow}
        step={step}
        values={v}
        onChange={(next) => { setDraftProfile(next); setAnswer("profile", next); }}
        foot={footFor(true, advance, {
          skip: { label: "Prefiero no decir", onClick: () => { setAnswer("profile", {}); advance(); } }
        })}
      />
    );
  } else if (step.kind === "recommendation") {
    body = (
      <RecommendationStep
        eyebrow={eyebrow}
        answers={answers}
        foot={footFor(true, advance, { label: "Sí, llévame allá" })}
      />
    );
  } else if (step.kind === "register") {
    body = (
      <RegisterStep
        eyebrow={eyebrow}
        foot={({ email, name }) => footFor(!!(email && name), () => setPhase("tour"), {
          label: "Crear mi cuenta y empezar",
          skip: { label: "Probar sin cuenta", onClick: () => setPhase("tour") },
        })}
      />
    );
  }

  return (
    <div className="onb">
      <TopBar idx={progressIdx} total={totalForProgress} onBack={back}/>
      {body}
    </div>
  );
}

// ── Stage: desktop + mobile side by side ────────────────────────────────
function AppStage() {
  return (
    <div className="stage">
      <div className="stage-col stage-col-desktop">
        <span className="stage-label">Web · Escritorio responsivo</span>
        <div className="desktop-frame">
          <OnboardingApp/>
        </div>
      </div>
      <div className="stage-col stage-col-mobile">
        <span className="stage-label">Web · Móvil (iPhone 14 Pro)</span>
        <div className="mobile-wrap" style={{ transform: "scale(0.88)" }}>
          <IOSDevice width={390} height={844}>
            <OnboardingApp/>
          </IOSDevice>
        </div>
      </div>
    </div>
  );
}

window.OnboardingApp = OnboardingApp;
window.AppStage = AppStage;
