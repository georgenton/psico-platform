// ai-suggestion.jsx — UI for the bioinspired mood-suggestion system.
// Three components:
//   SuggestionBanner   — discreet bar at top of cover with "today's mood"
//   CheckinSheet       — emoji slider sheet for 1×/day check-in
//   WhyModal           — reveals the signals + Claude's reading of the journal
//
// All three speak to the suggestor in suggestor.js. No state of their own
// except open/closed — the host (PrototypeShell) owns suggestion + signals.

function IconClock() {
  return (<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>);
}
function IconPace() {
  return (<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 12h4l3-7 4 14 3-7h4"/></svg>);
}
function IconJournal() {
  return (<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 4h12a2 2 0 012 2v14H7a2 2 0 01-2-2V4z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>);
}
function IconStreak() {
  return (<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3c2 3 5 5 5 9a5 5 0 11-10 0c0-2 1-3 2-4-.5 2 .5 3 1.5 3-.5-3 .5-6 1.5-8z"/></svg>);
}
function IconHeart() {
  return (<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20s-7-4.5-7-10a4 4 0 017-2.7A4 4 0 0119 10c0 5.5-7 10-7 10z"/></svg>);
}
function IconSpark() {
  return (<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>);
}
const SIGNAL_ICONS = { clock: IconClock, pace: IconPace, journal: IconJournal, streak: IconStreak, heart: IconHeart };

// ── SuggestionBanner ─────────────────────────────────────────────────────
function SuggestionBanner({ suggestion, currentMood, onApply, onWhy, onDismiss }) {
  if (!suggestion) return null;
  const isApplied = currentMood === suggestion.mood;
  return (
    <aside className={"suggest-banner mood-tint-" + suggestion.mood + (isApplied ? " is-applied" : "")} role="status">
      <span className={"suggest-banner-swatch swatch-" + suggestion.mood} aria-hidden></span>
      <div className="suggest-banner-body">
        <div className="suggest-banner-row">
          <span className="suggest-banner-eyebrow">
            <IconSpark/> Sugerencia bioinspirada
          </span>
          {!isApplied && (
            <button className="suggest-banner-why" onClick={onWhy} type="button">¿Por qué?</button>
          )}
        </div>
        <div className="suggest-banner-text">
          {isApplied ? (
            <>Hoy estás en <strong>{capitalize(suggestion.mood)} · {suggestion.theme}</strong>. Cambia cuando quieras.</>
          ) : (
            <>Hoy te sugerimos <strong>{capitalize(suggestion.mood)} · {suggestion.theme}</strong> — {window.suggestionShort(suggestion.mood, "").toLowerCase()}</>
          )}
        </div>
      </div>
      <div className="suggest-banner-actions">
        {!isApplied && (
          <button className="suggest-banner-apply" onClick={() => onApply(suggestion.mood)} type="button">
            Aplicar
          </button>
        )}
        <button className="suggest-banner-dismiss" onClick={onDismiss} type="button" aria-label="Descartar sugerencia">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </aside>
  );
}

// ── CheckinSheet — 4-emoji slider ─────────────────────────────────────────
const CHECKIN_OPTIONS = [
  { id: "tranquilo", emoji: "😌", label: "Tranquilo" },
  { id: "neutral",   emoji: "😐", label: "Neutral" },
  { id: "tenso",     emoji: "😟", label: "Tenso" },
  { id: "cansado",   emoji: "😴", label: "Cansado" },
];

function CheckinSheet({ open, onPick, onSkip }) {
  if (!open) return null;
  return (
    <div className="checkin-backdrop" role="dialog" aria-modal="true">
      <div className="checkin-card">
        <button className="paywall-close" onClick={onSkip} aria-label="Saltar">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        <span className="paywall-eyebrow">Check-in de hoy</span>
        <h2 className="checkin-title">¿Cómo amaneciste?</h2>
        <p className="checkin-sub">Solo 1 segundo. Nos ayuda a sugerirte el mejor mood para hoy.</p>
        <div className="checkin-options">
          {CHECKIN_OPTIONS.map((o) => (
            <button key={o.id} className="checkin-opt" onClick={() => onPick(o.id)} type="button">
              <span className="checkin-emoji" aria-hidden>{o.emoji}</span>
              <span className="checkin-label">{o.label}</span>
            </button>
          ))}
        </div>
        <button className="btn-ghost" onClick={onSkip} type="button">Más tarde</button>
      </div>
    </div>
  );
}

// ── WhyModal — explains the signals + journal sentiment via Claude ────────
function WhyModal({ open, suggestion, lastJournal, onClose, onApply }) {
  const [aiReading, setAiReading] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const hasJournalSignal = suggestion?.signals?.some((s) => s.icon === "journal");
    if (!hasJournalSignal || !lastJournal) { setAiReading(null); return; }
    let cancelled = false;
    setLoading(true);
    const prompt =
      "Eres Marina IA, asistente de salud emocional. Lee este journal del usuario y describe en UNA frase su tono predominante (máx 18 palabras, español neutro, segunda persona, sin diagnóstico). " +
      'Journal: "' + lastJournal + '"';
    window.claude
      .complete({ messages: [{ role: "user", content: prompt }] })
      .then((r) => { if (!cancelled) setAiReading(r.trim()); })
      .catch(() => { if (!cancelled) setAiReading("(No pudimos leer tu journal en este momento.)"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, lastJournal, suggestion]);

  if (!open || !suggestion) return null;
  const moodName = capitalize(suggestion.mood);

  return (
    <div className="paywall-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="paywall-modal why-modal" onClick={(e) => e.stopPropagation()}>
        <button className="paywall-close" onClick={onClose} aria-label="Cerrar">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        <header className="paywall-head">
          <span className="paywall-eyebrow"><IconSpark/> ¿Por qué te sugerimos esto?</span>
          <h2 className="paywall-title">{moodName} · {suggestion.theme}</h2>
          <p className="paywall-sub">
            Combinamos {suggestion.signals.length} señales bioinspiradas para sugerirte este mood.
            Todas se calculan localmente — tus señales no salen de tu dispositivo.
          </p>
        </header>

        <ul className="why-signals">
          {suggestion.signals.map((s, i) => {
            const Icon = SIGNAL_ICONS[s.icon] || IconSpark;
            const isTop = suggestion.topSignals?.includes(["hour","pace","sentiment","streak","checkin"][i]);
            return (
              <li key={i} className={"why-signal " + (isTop ? "is-top" : "")}>
                <span className="why-signal-icon" aria-hidden><Icon/></span>
                <div className="why-signal-body">
                  <div className="why-signal-label">{s.label}</div>
                  <div className="why-signal-detail">{s.detail}</div>
                </div>
                {isTop && <span className="why-signal-badge">Peso alto</span>}
              </li>
            );
          })}
          {lastJournal && (
            <li className="why-signal why-journal">
              <span className="why-signal-icon" aria-hidden><IconJournal/></span>
              <div className="why-signal-body">
                <div className="why-signal-label">Tu último journal · Marina IA leyó</div>
                <div className="why-signal-detail why-ai-reading">
                  {loading ? <em>Leyendo tu journal…</em> : aiReading || "(Sin journal reciente para analizar.)"}
                </div>
              </div>
            </li>
          )}
        </ul>

        <div className="why-confidence">
          <div className="why-confidence-row">
            <span>Confianza de la sugerencia</span>
            <span className="why-confidence-val">{Math.round((suggestion.confidence || 0) * 100)}%</span>
          </div>
          <div className="progress">
            <div className="progress-fill" style={{ width: ((suggestion.confidence || 0) * 100) + "%" }}></div>
          </div>
          <p className="why-confidence-note">
            Mientras más uses la app, más precisa será.
            Puedes apagar esta sugerencia en cualquier momento desde ajustes.
          </p>
        </div>

        <footer className="paywall-foot why-foot">
          <button className="btn-primary paywall-confirm" onClick={() => onApply(suggestion.mood)} type="button">
            Aplicar {moodName}
          </button>
          <button className="btn-ghost" onClick={onClose} type="button">Cerrar</button>
        </footer>
      </div>
    </div>
  );
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// ── Mid-session reevaluation toast ───────────────────────────────────────
function MidSessionToast({ open, fromMood, toMood, onApply, onDismiss }) {
  if (!open) return null;
  return (
    <div className="midsession-toast" role="status">
      <span className={"midsession-swatch swatch-" + toMood} aria-hidden></span>
      <div className="midsession-body">
        <div className="midsession-eyebrow">
          <IconSpark/> La IA notó algo
        </div>
        <div className="midsession-text">
          Llevas un buen rato leyendo. Si quieres, cambiamos a <strong>{capitalize(toMood)}</strong> para journaling.
        </div>
      </div>
      <div className="midsession-actions">
        <button className="midsession-apply" onClick={() => onApply(toMood)} type="button">Cambiar</button>
        <button className="midsession-dismiss" onClick={onDismiss} type="button" aria-label="Descartar">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── AI Settings panel (reachable from topbar) ───────────────────────────
function AISettingsPanel({ open, onClose, on, onToggle, sensitivity, onSensitivity, history }) {
  if (!open) return null;
  return (
    <div className="paywall-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="paywall-modal aisettings-modal" onClick={(e) => e.stopPropagation()}>
        <button className="paywall-close" onClick={onClose} aria-label="Cerrar">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        <header className="paywall-head">
          <span className="paywall-eyebrow"><IconSpark/> IA bioinspirada</span>
          <h2 className="paywall-title">Sugerencias inteligentes de mood</h2>
          <p className="paywall-sub">Aprendemos de cómo lees para sugerirte el mood adecuado. Todo se calcula en tu dispositivo.</p>
        </header>

        <div className="aisettings-rows">
          <div className="aisettings-row">
            <div className="aisettings-row-l">
              <div className="aisettings-row-title">Sugerencias activadas</div>
              <div className="aisettings-row-sub">Muestra una sugerencia al abrir la app y dentro de la lección.</div>
            </div>
            <button
              type="button"
              className={"aisettings-toggle " + (on ? "is-on" : "")}
              onClick={() => onToggle(!on)}
              role="switch"
              aria-checked={on}
            >
              <span></span>
            </button>
          </div>

          <div className="aisettings-row aisettings-row-col">
            <div className="aisettings-row-l">
              <div className="aisettings-row-title">Sensibilidad</div>
              <div className="aisettings-row-sub">
                {sensitivity === "gentle"   && "Pide cambios solo cuando hay señales claras. Menos interrupciones."}
                {sensitivity === "balanced" && "Cantidad equilibrada de sugerencias por día."}
                {sensitivity === "bold"     && "Sugiere con frecuencia, incluso con señales débiles."}
              </div>
            </div>
            <div className="aisettings-seg">
              {[
                { id: "gentle",   label: "Suave" },
                { id: "balanced", label: "Balanceada" },
                { id: "bold",     label: "Atrevida" },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={"aisettings-seg-btn " + (sensitivity === s.id ? "is-on" : "")}
                  onClick={() => onSensitivity(s.id)}
                >{s.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="aisettings-history">
          <h3 className="aisettings-history-title">Historial de sugerencias · últimos 7 días</h3>
          <ul className="aisettings-list">
            {history.map((h, i) => (
              <li key={i} className="aisettings-list-row">
                <span className={"aisettings-list-swatch swatch-" + h.mood} aria-hidden></span>
                <div className="aisettings-list-body">
                  <div className="aisettings-list-name">{capitalize(h.mood)} · {h.theme}</div>
                  <div className="aisettings-list-meta">{h.day} · {h.reason}</div>
                </div>
                <span className={"aisettings-list-tag " + (h.applied ? "is-applied" : "is-skipped")}>
                  {h.applied ? "Aplicado" : "Saltado"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <footer className="paywall-foot">
          <button className="btn-primary paywall-confirm" onClick={onClose}>Listo</button>
          <p className="paywall-reassurance">
            Tu historial nunca se comparte. Se almacena cifrado en tu cuenta.
          </p>
        </footer>
      </div>
    </div>
  );
}

Object.assign(window, { SuggestionBanner, CheckinSheet, WhyModal, MidSessionToast, AISettingsPanel });
