// app.jsx — Root of the Lector prototype.
// Owns top-level state (screen, mode, variation, mood, author visibility,
// surface), wires Tweaks, and renders both desktop + mobile surface side
// by side or solo depending on tweak.

const { BookCover, BookIndex, Lesson, LessonDone, IOSDevice } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "mood": "calma",
  "surface": "both",
  "showAuthor": true,
  "fontScale": 1,
  "tier": "free",
  "aiSuggestionsOn": true,
  "aiSensitivity": "balanced",
  "demoHour": -1,
  "demoPace": "balanced",
  "demoSentiment": "neutral",
  "demoStreak": 6,
  "demoColdStart": false,
  "planModel": "catalogo",
  "midSessionThreshold": 25
}/*EDITMODE-END*/;

const MOOD_OPTS = [
  { value: "calma",     label: "Calma" },
  { value: "foco",      label: "Foco" },
  { value: "energia",   label: "Energía" },
  { value: "reflexion", label: "Reflexión" },
];
const SURFACE_OPTS = [
  { value: "both",    label: "Lado a lado" },
  { value: "desktop", label: "Solo escritorio" },
  { value: "mobile",  label: "Solo móvil" },
];

const TIER_OPTS = [
  { value: "free", label: "Gratuito" },
  { value: "pro",  label: "Pro" },
];

const PACE_OPTS = [
  { value: "short-fast", label: "Cortas y rápidas" },
  { value: "long-slow",  label: "Largas y lentas" },
  { value: "balanced",   label: "Constante" },
  { value: "stuck",      label: "Estancado" },
  { value: "absent",     label: "Ausente" },
];
const SENTIMENT_OPTS = [
  { value: "warm",    label: "Cálido" },
  { value: "tense",   label: "Tenso" },
  { value: "heavy",   label: "Intenso" },
  { value: "neutral", label: "Sereno" },
  { value: "open",    label: "Expansivo" },
];
const PLAN_MODEL_OPTS = [
  { value: "catalogo",  label: "Catálogo (Pro/Anual)" },
  { value: "por-libro", label: "Por libro (Lanzamiento)" },
];
const SENSITIVITY_OPTS = [
  { value: "gentle",   label: "Suave" },
  { value: "balanced", label: "Balanceada" },
  { value: "bold",     label: "Atrevida" },
];

// A short, realistic Spanish journal Claude can read to demo the journal signal.
const DEMO_JOURNAL =
  "Hoy me dormí pensando en mi mamá. No fue triste exactamente, fue como volver a verla. " +
  "Salí del trabajo cansado pero abrí el libro un rato y noté que mi pecho estaba menos tenso. " +
  "Quiero seguir leyendo de noche, me hace bien.";

// Each mood routes to a structural baseline (gradients, card chrome, hero
// treatment). Reflexión gets its own warm-sepia baseline below.
const MOOD_VARIATION = {
  calma:     "calido",     // soft gradients, cards with shadow, emoji-friendly
  foco:      "editorial",  // sparse, no chrome, typographic
  energia:   "inmersivo",  // cinematic, deep gradients
  reflexion: "reflexion",  // warm sepia + serif (its own baseline)
};

// Demo history for the AI settings panel — what the user has been suggested.
const DEMO_AI_HISTORY = [
  { mood: "reflexion", theme: "Cercanía",  day: "Hoy",          reason: "Hora + journal cálido",   applied: true  },
  { mood: "foco",      theme: "Claridad",  day: "Ayer",         reason: "Mañana + racha",          applied: true  },
  { mood: "calma",     theme: "Pausa",     day: "Lunes",        reason: "Check-in tranquilo",      applied: false },
  { mood: "energia",   theme: "Impulso",   day: "Domingo",      reason: "Reencuentro tras pausa",  applied: true  },
  { mood: "reflexion", theme: "Recuerdo",  day: "Sábado",       reason: "Noche + ritmo lento",     applied: true  },
  { mood: "foco",      theme: "Decisión",  day: "Viernes",      reason: "Mañana laboral",           applied: false },
  { mood: "calma",     theme: "Cuidado",   day: "Jueves",       reason: "Tarde + balance",         applied: true  },
];

function PrototypeShell({ tweaks, surface, setTweak }) {
  const [screen, setScreen] = React.useState("cover"); // cover · index · lesson · done
  const [mode, setMode] = React.useState("libro");     // free user starts in Modo Libro
  const [paywall, setPaywall] = React.useState({ open: false, reason: "default" });
  const [onboarding, setOnboarding] = React.useState(false);

  // AI suggestion state
  const [suggestion, setSuggestion] = React.useState(null);
  const [bannerDismissed, setBannerDismissed] = React.useState(false);
  const [checkinOpen, setCheckinOpen] = React.useState(false);
  const [whyOpen, setWhyOpen] = React.useState(false);
  const [checkin, setCheckin] = React.useState(null);
  const [aiSettingsOpen, setAiSettingsOpen] = React.useState(false);
  const [midToast, setMidToast] = React.useState({ open: false, toMood: "reflexion" });

  const book   = window.PSICO_BOOK;
  const author = window.PSICO_AUTHOR;
  const lesson = window.PSICO_LESSON_1;

  const mood = tweaks.mood;
  const tier = tweaks.tier || "free";
  const variation = MOOD_VARIATION[mood] || "calido";
  const showAuthor = tweaks.showAuthor;

  // Recompute the suggestion when demo signals or check-in change.
  React.useEffect(() => {
    if (!tweaks.aiSuggestionsOn) { setSuggestion(null); return; }
    if (tweaks.demoColdStart) {
      // Cold start → no journal, no streak, no pace → null suggestion.
      const sig = {
        hour: (tweaks.demoHour === -1 || tweaks.demoHour == null) ? new Date().getHours() : tweaks.demoHour,
        pace: "absent",
        hasJournal: false,
        streak: 0,
      };
      setSuggestion(window.suggestMood(sig));
      return;
    }
    const sig = {
      hour: (tweaks.demoHour === -1 || tweaks.demoHour == null) ? new Date().getHours() : tweaks.demoHour,
      pace: tweaks.demoPace || "balanced",
      hasJournal: true,
      sentiment: tweaks.demoSentiment || "neutral",
      streak: typeof tweaks.demoStreak === "number" ? tweaks.demoStreak : 6,
      checkin: checkin,
      dayOfYear: window.PSICO_DEMO_SIGNALS?.dayOfYear,
    };
    setSuggestion(window.suggestMood(sig));
  }, [tweaks.aiSuggestionsOn, tweaks.demoHour, tweaks.demoPace, tweaks.demoSentiment, tweaks.demoStreak, tweaks.demoColdStart, checkin]);

  // Free users default to Modo Libro; Pro users see whichever mode they last chose.
  React.useEffect(() => {
    if (tier !== "pro" && mode === "guia") setMode("libro");
  }, [tier, mode]);

  const setMood = (m) => setTweak("mood", m);
  const applySuggestion = (m) => { setMood(m); setBannerDismissed(true); setWhyOpen(false); };
  const openPaywall  = (reason = "default") => setPaywall({ open: true, reason });
  const closePaywall = () => setPaywall({ open: false, reason: "default" });
  const completePaywall = (plan) => {
    setTweak("tier", "pro");
    setPaywall({ open: false, reason: "default" });
    setOnboarding(true);
  };
  const closeOnboarding = () => setOnboarding(false);

  // Tweaks panel button: open paywall on demand.
  React.useEffect(() => {
    const h = () => openPaywall("default");
    window.addEventListener("psico:open-paywall", h);
    return () => window.removeEventListener("psico:open-paywall", h);
  }, []);

  // Tweaks: open check-in on demand.
  React.useEffect(() => {
    const h = () => setCheckinOpen(true);
    window.addEventListener("psico:open-checkin", h);
    return () => window.removeEventListener("psico:open-checkin", h);
  }, []);

  // Mid-session reevaluation toast: after N seconds in lesson screen, suggest
  // switching to a different mood if conditions support it.
  React.useEffect(() => {
    if (screen !== "lesson") { setMidToast({ open: false, toMood: "reflexion" }); return; }
    if (!tweaks.aiSuggestionsOn) return;
    const minutes = typeof tweaks.midSessionThreshold === "number" ? tweaks.midSessionThreshold : 25;
    const delayMs = Math.max(8, minutes) * 1000; // 1s in prototype = 1min mental model
    const id = setTimeout(() => {
      // Suggest moving to Reflexión if you're in Calma/Foco/Energia, Calma if you're in Reflexión.
      const next = mood === "reflexion" ? "calma" : "reflexion";
      setMidToast({ open: true, toMood: next });
    }, delayMs);
    return () => clearTimeout(id);
  }, [screen, tweaks.aiSuggestionsOn, tweaks.midSessionThreshold, mood]);

  // Reset banner dismissal when suggestion changes (so a new suggestion appears even if the user dismissed yesterday's)
  React.useEffect(() => { setBannerDismissed(false); }, [suggestion?.mood, suggestion?.theme]);

  const suggestionBanner =
    tweaks.aiSuggestionsOn && suggestion && !bannerDismissed && screen === "cover" ? (
      <window.SuggestionBanner
        suggestion={suggestion}
        currentMood={mood}
        onApply={applySuggestion}
        onWhy={() => setWhyOpen(true)}
        onDismiss={() => setBannerDismissed(true)}
      />
    ) : null;

  const screenEl = (() => {
    switch (screen) {
      case "cover":
        return (
          <BookCover
            book={book} author={author}
            variation={variation} mood={mood} tier={tier}
            showAuthor={showAuthor}
            onOpen={() => setScreen("index")}
            onMoodChange={setMood}
            onOpenPaywall={openPaywall}
            suggestionBanner={suggestionBanner}
            suggestion={suggestion}
            onOpenCheckin={() => setCheckinOpen(true)}
            onOpenAISettings={() => setAiSettingsOpen(true)}
            checkinDone={!!checkin}
          />
        );
      case "index":
        return (
          <BookIndex
            book={book} tier={tier}
            mood={mood} onMoodChange={setMood}
            onOpenPaywall={openPaywall}
            onOpenAISettings={() => setAiSettingsOpen(true)}
            onBack={() => setScreen("cover")}
            onOpenLesson={() => setScreen("lesson")}
          />
        );
      case "lesson":
        return (
          <Lesson
            lesson={lesson} book={book} author={author} tier={tier}
            variation={variation} mood={mood} onMoodChange={setMood}
            showAuthor={showAuthor}
            mode={mode} onModeChange={setMode}
            onOpenPaywall={openPaywall}
            onBack={() => setScreen("index")}
            onComplete={() => setScreen("done")}
          />
        );
      case "done":
        return (
          <LessonDone
            lesson={lesson} author={author} showAuthor={showAuthor}
            onNext={() => { setScreen("lesson"); }}
            onIndex={() => setScreen("index")}
          />
        );
      default: return null;
    }
  })();

  return (
    <div
      className={
        "app " +
        "var-" + variation + " " +
        "mood-" + mood + " " +
        "surface-" + surface + " " +
        "tier-" + tier
      }
      style={{ ["--font-scale"]: tweaks.fontScale }}
    >
      {screenEl}
      <window.PaywallModal
        open={paywall.open}
        reason={paywall.reason}
        planModel={tweaks.planModel || "catalogo"}
        onClose={closePaywall}
        onComplete={completePaywall}
      />
      <window.ProOnboarding open={onboarding} onDone={closeOnboarding}/>
      <window.CheckinSheet
        open={checkinOpen}
        onPick={(id) => { setCheckin(id); setCheckinOpen(false); }}
        onSkip={() => setCheckinOpen(false)}
      />
      <window.WhyModal
        open={whyOpen}
        suggestion={suggestion}
        lastJournal={tweaks.demoSentiment === "neutral" ? DEMO_JOURNAL : DEMO_JOURNAL}
        onClose={() => setWhyOpen(false)}
        onApply={applySuggestion}
      />
      <window.AISettingsPanel
        open={aiSettingsOpen}
        onClose={() => setAiSettingsOpen(false)}
        on={!!tweaks.aiSuggestionsOn}
        onToggle={(v) => setTweak("aiSuggestionsOn", v)}
        sensitivity={tweaks.aiSensitivity || "balanced"}
        onSensitivity={(v) => setTweak("aiSensitivity", v)}
        history={DEMO_AI_HISTORY}
      />
      {screen === "lesson" && (
        <window.MidSessionToast
          open={midToast.open}
          fromMood={mood}
          toMood={midToast.toMood}
          onApply={(m) => { setMood(m); setMidToast({ open: false, toMood: m }); }}
          onDismiss={() => setMidToast({ open: false, toMood: midToast.toMood })}
        />
      )}
    </div>
  );
}

function MobileFrame({ children, scale = 0.92 }) {
  return (
    <div className="mobile-frame-wrap" style={{ transform: "scale(" + scale + ")", transformOrigin: "top center" }}>
      <IOSDevice width={390} height={844}>
        {children}
      </IOSDevice>
    </div>
  );
}

function App() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const surface = t.surface;

  const desktop = <PrototypeShell tweaks={t} surface="desktop" setTweak={setTweak}/>;
  const mobile  = <PrototypeShell tweaks={t} surface="mobile" setTweak={setTweak}/>;

  return (
    <div className="stage">
      {surface === "desktop" && (
        <div className="stage-solo stage-desktop">
          <div className="surface-label">Web · Escritorio</div>
          <div className="desktop-frame">{desktop}</div>
        </div>
      )}
      {surface === "mobile" && (
        <div className="stage-solo stage-mobile">
          <div className="surface-label">Web · Móvil (iPhone)</div>
          <MobileFrame scale={1}>{mobile}</MobileFrame>
        </div>
      )}
      {surface === "both" && (
        <div className="stage-split">
          <div className="stage-col stage-col-desktop">
            <div className="surface-label">Web · Escritorio responsivo</div>
            <div className="desktop-frame">{desktop}</div>
          </div>
          <div className="stage-col stage-col-mobile">
            <div className="surface-label">Web · Móvil (iPhone 14 Pro)</div>
            <MobileFrame scale={0.88}>{mobile}</MobileFrame>
          </div>
        </div>
      )}

      <window.TweaksPanel>
        <window.TweakSection label="Modelo de precios" />
        <window.TweakSelect
          label="Modelo de planes"
          value={t.planModel || "catalogo"}
          options={PLAN_MODEL_OPTS}
          onChange={(v) => setTweak("planModel", v)}
        />
        <div className="twk-help" style={{ fontSize: 10, color: "rgba(41,38,27,.55)", lineHeight: 1.4, marginTop: -4 }}>
          {t.planModel === "por-libro"
            ? "Para lanzamiento con 2-3 libros. Compra individual ($14) o bundle ($22)."
            : "Modelo a largo plazo. Suscripción Pro ($7/mes) o Anual ($59)."}
        </div>

        <window.TweakSection label="IA bioinspirada (sugiere mood)" />
        <window.TweakToggle
          label="Sugerencia inteligente"
          value={!!t.aiSuggestionsOn}
          onChange={(v) => setTweak("aiSuggestionsOn", v)}
        />
        <window.TweakSelect
          label="Sensibilidad"
          value={t.aiSensitivity || "balanced"}
          options={SENSITIVITY_OPTS}
          onChange={(v) => setTweak("aiSensitivity", v)}
        />
        <window.TweakSlider
          label="Mid-session: minutos antes del toast"
          value={typeof t.midSessionThreshold === "number" ? t.midSessionThreshold : 25}
          min={5} max={45} step={5}
          onChange={(v) => setTweak("midSessionThreshold", v)}
        />
        <window.TweakSelect
          label="Ritmo de lectura"
          value={t.demoPace || "balanced"}
          options={PACE_OPTS}
          onChange={(v) => setTweak("demoPace", v)}
        />
        <window.TweakSelect
          label="Tono del último journal"
          value={t.demoSentiment || "neutral"}
          options={SENTIMENT_OPTS}
          onChange={(v) => setTweak("demoSentiment", v)}
        />
        <window.TweakSlider
          label="Hora del día (-1 = real)"
          value={typeof t.demoHour === "number" ? t.demoHour : -1}
          min={-1} max={23} step={1}
          onChange={(v) => setTweak("demoHour", v)}
        />
        <window.TweakSlider
          label="Racha (días)"
          value={typeof t.demoStreak === "number" ? t.demoStreak : 6}
          min={0} max={45} step={1}
          onChange={(v) => setTweak("demoStreak", v)}
        />
        <window.TweakToggle
          label="Cold start (sin datos)"
          value={!!t.demoColdStart}
          onChange={(v) => setTweak("demoColdStart", v)}
        />
        <window.TweakButton
          label="Abrir check-in"
          onClick={() => window.dispatchEvent(new CustomEvent("psico:open-checkin"))}
          secondary
        />

        <window.TweakSection label="Estado del usuario" />
        <window.TweakRadio
          label="Plan"
          value={t.tier || "free"}
          options={TIER_OPTS}
          onChange={(v) => setTweak("tier", v)}
        />
        <window.TweakButton
          label="Abrir paywall ahora"
          onClick={() => window.dispatchEvent(new CustomEvent("psico:open-paywall"))}
          secondary
        />

        <window.TweakSection label="Estado de ánimo (bioinspirado)" />
        <window.TweakSelect
          label="¿Cómo se siente el usuario?"
          value={t.mood}
          options={MOOD_OPTS}
          onChange={(v) => setTweak("mood", v)}
        />
        <div className="twk-help" style={{
          fontSize: 10, color: "rgba(41,38,27,.55)", lineHeight: 1.4, marginTop: -4
        }}>
          {t.mood === "calma"     && "Sage como identidad · papel cálido · lectura lenta (1.7) · cards muy suaves. Para días serenos."}
          {t.mood === "foco"      && "Blanco puro · lavender profundo monocromo · sin gradientes ni emoji · tipografía ajustada. Para concentración."}
          {t.mood === "energia"   && "Papel beige · lavender + sage en contraste · pesos bold · gradientes saturados. Para impulso."}
          {t.mood === "reflexion" && "Papel sepia · serif Newsreader en titulares · cursivas · leading 1.7. Para journaling al final del día."}
        </div>

        <window.TweakSection label="Surface" />
        <window.TweakSelect
          label="Mostrar"
          value={t.surface}
          options={SURFACE_OPTS}
          onChange={(v) => setTweak("surface", v)}
        />

        <window.TweakSection label="Contenido" />
        <window.TweakToggle
          label="Mostrar autor (foto + nombre)"
          value={t.showAuthor}
          onChange={(v) => setTweak("showAuthor", v)}
        />
        <window.TweakSlider
          label="Escala tipográfica"
          value={t.fontScale}
          min={0.9} max={1.15} step={0.01}
          onChange={(v) => setTweak("fontScale", v)}
        />
      </window.TweaksPanel>
    </div>
  );
}

window.PsicoLectorApp = App;
