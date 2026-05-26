// paywall.jsx — In-context paywall + post-payment onboarding.
//
// Two states the host wires up:
//   1. PaywallModal — shown when free user tries to access Pro content.
//   2. ProOnboarding — shown right after payment; 3 screens.
//
// The free user's `lockedReason` shapes the headline:
//   - "modo-guia": user toggled Modo Guía while free
//   - "chapter-2":  user tapped a locked chapter
//   - "lesson":     user tapped a locked lesson
//   - "marina-ia":  user opened Marina IA tab
//   - "default":    user explicitly opened the upgrade flow

const PAYWALL_HEADLINES = {
  "modo-guia": {
    eyebrow: "Modo Guía · Pro",
    title: "Desbloquea tu camino completo",
    sub: "El Modo Guía convierte cada capítulo en una experiencia interactiva — videos, audios, quizzes y ejercicios prácticos. La forma más fácil de empezar a leer.",
  },
  "chapter-2": {
    eyebrow: "Continúa el libro",
    title: "Desbloquea tu camino completo",
    sub: "Has terminado el primer capítulo. Marina te espera en los siguientes — donde se transforma lo que aprendiste.",
  },
  "lesson": {
    eyebrow: "Continúa el libro",
    title: "Desbloquea tu camino completo",
    sub: "Esta lección es parte de la biblioteca Pro. Acompáñate del proceso completo, no solo del primer paso.",
  },
  "marina-ia": {
    eyebrow: "Marina IA · Pro",
    title: "Conversa con Marina cuando lo necesites",
    sub: "Tu asistente bioinspirada, entrenada en cada libro. Sin límite de mensajes, sin esperar a la próxima sesión.",
  },
  "default": {
    eyebrow: "Plan Pro",
    title: "Desbloquea tu camino completo",
    sub: "Una sola suscripción te abre los libros, las guías interactivas, Marina IA y la comunidad — todo lo que necesitas para sostener tu proceso.",
  },
};

function PaywallModal({ open, reason = "default", planModel = "catalogo", onClose, onComplete }) {
  const [step, setStep] = React.useState("plans"); // plans · payment · processing
  const [pickedPlan, setPickedPlan] = React.useState(null);
  const [pickedMethod, setPickedMethod] = React.useState("tarjeta");

  const modelDef = window.PSICO_PLAN_MODELS[planModel] || window.PSICO_PLAN_MODELS.catalogo;
  const plans = modelDef.plans;
  const defaultPick = planModel === "por-libro" ? "bundle" : "pro";

  React.useEffect(() => {
    if (open) {
      setStep("plans");
      setPickedPlan(defaultPick);
      setPickedMethod("tarjeta");
    }
  }, [open, planModel]);

  if (!open) return null;
  const headline = PAYWALL_HEADLINES[reason] || PAYWALL_HEADLINES.default;
  const methods = window.PSICO_PAYMENT_METHODS;
  const props = window.PSICO_PRO_VALUE_PROPS;
  const selectedPlan = plans.find((p) => p.id === pickedPlan) || plans[1];

  const onConfirmPlan = () => {
    if (pickedPlan === "gratuito") { onClose(); return; }
    setStep("payment");
  };
  const onConfirmPayment = () => {
    setStep("processing");
    setTimeout(() => onComplete(pickedPlan), 1100);
  };

  return (
    <div className="paywall-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Plan Pro">
      <div className="paywall-modal" onClick={(e) => e.stopPropagation()}>
        <button className="paywall-close" onClick={onClose} aria-label="Cerrar">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        {step === "plans" && (
          <PaywallPlans
            headline={headline}
            modelDef={modelDef}
            plans={plans}
            props={props}
            picked={pickedPlan}
            onPick={setPickedPlan}
            onConfirm={onConfirmPlan}
          />
        )}
        {step === "payment" && (
          <PaywallPayment
            plan={selectedPlan}
            methods={methods}
            picked={pickedMethod}
            onPick={setPickedMethod}
            onBack={() => setStep("plans")}
            onConfirm={onConfirmPayment}
          />
        )}
        {step === "processing" && (
          <PaywallProcessing plan={selectedPlan}/>
        )}
      </div>
    </div>
  );
}

// ── Plans step ───────────────────────────────────────────────────────────
function PaywallPlans({ headline, modelDef, plans, props, picked, onPick, onConfirm }) {
  return (
    <>
      <header className="paywall-head">
        <span className="paywall-eyebrow">{headline.eyebrow}</span>
        <h2 className="paywall-title">{headline.title}</h2>
        <p className="paywall-sub">{headline.sub}</p>
        {modelDef && modelDef.id === "por-libro" && (
          <div className="paywall-model-note">
            <span className="paywall-model-eyebrow">Estamos lanzando</span>
            <span className="paywall-model-body">{modelDef.description}</span>
          </div>
        )}
      </header>

      <div className="paywall-props">
        {props.slice(0, 6).map((p, i) => (
          <div key={i} className="paywall-prop">
            <PropIcon kind={p.icon}/>
            <div>
              <div className="paywall-prop-title">{p.title}</div>
              <div className="paywall-prop-body">{p.body}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="paywall-plans">
        {plans.map((p) => (
          <button
            key={p.id}
            type="button"
            className={"paywall-plan " + (picked === p.id ? "is-on " : "") + "plan-" + p.id}
            onClick={() => onPick(p.id)}
            aria-pressed={picked === p.id}
          >
            <div className="paywall-plan-head">
              <div className="paywall-plan-name">{p.name}</div>
              {p.badge && <span className="paywall-plan-badge">{p.badge}</span>}
            </div>
            <div className="paywall-plan-price">
              {p.price.monthly === 0 ? (
                <span className="paywall-plan-free">Sin costo</span>
              ) : p.id === "anual" ? (
                <>
                  <span className="paywall-plan-num">$59</span>
                  <span className="paywall-plan-unit">/ año</span>
                </>
              ) : p.id === "pro" ? (
                <>
                  <span className="paywall-plan-num">${p.price.monthly}</span>
                  <span className="paywall-plan-unit">/ mes</span>
                </>
              ) : (
                <>
                  <span className="paywall-plan-num">${p.price.monthly}</span>
                  <span className="paywall-plan-unit">USD</span>
                </>
              )}
            </div>
            {p.priceSub && <div className="paywall-plan-pricesub">{p.priceSub}</div>}
            <div className="paywall-plan-tag">{p.tagline}</div>
            <ul className="paywall-plan-feats">
              {p.features.map((f, i) => (
                <li key={i} className={(f.on ? "on " : "off ") + (f.highlight ? "hi" : "")}>
                  {f.on ? (
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
                      <path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  )}
                  <span>{f.label}</span>
                </li>
              ))}
            </ul>
            <div className="paywall-plan-radio" aria-hidden>
              <span></span>
            </div>
          </button>
        ))}
      </div>

      <footer className="paywall-foot">
        <button className="btn-primary paywall-confirm" onClick={onConfirm}>
          {picked === "gratuito" ? "Continuar con Gratuito" :
           picked === "anual"    ? "Continuar — $59 / año" :
           picked === "pro"      ? "Continuar — $7 / mes" :
           picked === "un-libro" ? "Continuar — $14 USD" :
           picked === "bundle"   ? "Continuar — $22 USD" :
                                   "Continuar"}
        </button>
        <p className="paywall-reassurance">
          {picked === "anual" || picked === "pro"
            ? "Sin tarjeta de crédito hasta el siguiente paso · Cancela cuando quieras"
            : "Pago único · Acceso para siempre · Sin renovación automática"}
        </p>
      </footer>
    </>
  );
}

// ── Payment step ─────────────────────────────────────────────────────────
function PaywallPayment({ plan, methods, picked, onPick, onBack, onConfirm }) {
  const total = plan.id === "anual"   ? "$59 USD"
              : plan.id === "pro"     ? "$7 USD"
              : plan.id === "un-libro"? "$14 USD"
              : plan.id === "bundle"  ? "$22 USD"
              : "$7 USD";
  const isOneTime = plan.id === "un-libro" || plan.id === "bundle";
  const period = plan.id === "anual" ? "anual" : plan.id === "pro" ? "mensual" : "pago único";
  return (
    <>
      <header className="paywall-head">
        <button className="paywall-back" onClick={onBack}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
            <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Cambiar plan
        </button>
        <span className="paywall-eyebrow">Pago seguro</span>
        <h2 className="paywall-title">{plan.name} · {total} {isOneTime ? "" : period}</h2>
        <p className="paywall-sub">Elige cómo prefieres pagar. Los pagos se procesan con encriptación bancaria.</p>
      </header>

      <div className="paymethods">
        {methods.map((m) => (
          <button
            key={m.id}
            type="button"
            className={"paymethod " + (picked === m.id ? "is-on" : "")}
            onClick={() => onPick(m.id)}
            aria-pressed={picked === m.id}
          >
            <div className="paymethod-radio" aria-hidden><span></span></div>
            <div className="paymethod-meta">
              <div className="paymethod-name">
                {m.name}
                {m.recommended && <span className="paymethod-rec">Recomendado</span>}
              </div>
              <div className="paymethod-sub">{m.sub}</div>
            </div>
            <PaymethodIcon kind={m.id}/>
          </button>
        ))}
      </div>

      <div className="paywall-summary">
        <div className="paywall-summary-row">
          <span>Plan {plan.name}</span>
          <span>{total}</span>
        </div>
        <div className="paywall-summary-row meta">
          <span>Renovación {period}</span>
          <span>Cancela cuando quieras</span>
        </div>
      </div>

      <footer className="paywall-foot">
        <button className="btn-primary paywall-confirm" onClick={onConfirm}>
          Confirmar y empezar
        </button>
        <p className="paywall-reassurance">
          Pago procesado en USD · Recibo enviado a tu correo · Soporte en español
        </p>
      </footer>
    </>
  );
}

// ── Processing ───────────────────────────────────────────────────────────
function PaywallProcessing({ plan }) {
  return (
    <div className="paywall-processing">
      <div className="paywall-spinner" aria-hidden>
        <svg viewBox="0 0 50 50" width="44" height="44">
          <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="3" strokeOpacity="0.18"/>
          <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4 94.2">
            <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.9s" repeatCount="indefinite"/>
          </circle>
        </svg>
      </div>
      <h2 className="paywall-title">Procesando tu plan {plan.name}…</h2>
      <p className="paywall-sub">Un momento, estamos abriéndote el camino completo.</p>
    </div>
  );
}

// ── Post-payment 3-step onboarding ───────────────────────────────────────
const PRO_ONBOARDING_STEPS = [
  {
    eyebrow: "Bienvenido a Pro",
    title: "Tu camino completo, comienza aquí",
    body: "Acabas de desbloquear toda la biblioteca, el Modo Guía interactivo, Marina IA y la comunidad. Te llevamos por lo importante en 30 segundos.",
    art: "welcome",
  },
  {
    eyebrow: "Lo nuevo · Paso 01",
    title: "Modo Guía — el libro se convierte en experiencia",
    body: "Cada capítulo ahora se puede leer también como una guía interactiva: videos cortos, audios, quizzes y ejercicios prácticos. Cambia entre Libro y Guía con un toque.",
    art: "guide",
  },
  {
    eyebrow: "Lo nuevo · Paso 02",
    title: "Marina IA — pregúntale cuando lo necesites",
    body: "Una asistente bioinspirada entrenada en cada libro. Puedes preguntarle sobre lo que leíste, sobre tu propio caso, o usarla para pensar en voz alta. Sin límite, las 24 horas.",
    art: "ai",
  },
  {
    eyebrow: "Lo nuevo · Paso 03",
    title: "Práctica diaria — tu proceso, sostenido",
    body: "Te enviamos un micro-ejercicio cada día — 2 minutos, en el momento que prefieras. Construye el hábito de mirarte sin esfuerzo.",
    art: "practice",
  },
];

function ProOnboarding({ open, onDone }) {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => { if (open) setIdx(0); }, [open]);
  if (!open) return null;
  const step = PRO_ONBOARDING_STEPS[idx];
  const isLast = idx === PRO_ONBOARDING_STEPS.length - 1;
  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true">
      <div className="onboarding-card">
        <div className={"onboarding-art art-" + step.art}>
          <OnboardingArt kind={step.art}/>
        </div>
        <div className="onboarding-body">
          <span className="paywall-eyebrow">{step.eyebrow}</span>
          <h2 className="paywall-title">{step.title}</h2>
          <p className="paywall-sub">{step.body}</p>
          <div className="onboarding-dots">
            {PRO_ONBOARDING_STEPS.map((_, i) => (
              <span key={i} className={"onboarding-dot " + (i === idx ? "is-on" : "")}></span>
            ))}
          </div>
          <div className="onboarding-actions">
            {idx > 0 && (
              <button className="btn-ghost" onClick={() => setIdx(idx - 1)}>Atrás</button>
            )}
            <button className="btn-primary" onClick={() => isLast ? onDone() : setIdx(idx + 1)}>
              {isLast ? "Empezar mi camino" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────
function PropIcon({ kind }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  return (
    <span className="paywall-propicon" aria-hidden>
      {kind === "guide" && (
        <svg {...common}><path d="M4 5h16v14H4z"/><path d="M9 9l3 2-3 2"/><path d="M14 13h3"/></svg>
      )}
      {kind === "ai" && (
        <svg {...common}><path d="M12 3v3"/><circle cx="12" cy="13" r="6"/><path d="M9 12l2 2 4-4"/></svg>
      )}
      {kind === "community" && (
        <svg {...common}><circle cx="9" cy="10" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5"/><path d="M14 19c0-2 1.5-4 4-4s3 1 3 3"/></svg>
      )}
      {kind === "practice" && (
        <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      )}
      {kind === "offline" && (
        <svg {...common}><path d="M12 4v12"/><path d="M8 12l4 4 4-4"/><path d="M5 20h14"/></svg>
      )}
      {kind === "early" && (
        <svg {...common}><path d="M12 3l2.5 6 6.5.5-5 4.5L17.5 21 12 17.5 6.5 21l1.5-7-5-4.5 6.5-.5z"/></svg>
      )}
    </span>
  );
}

function PaymethodIcon({ kind }) {
  const common = { viewBox: "0 0 28 20", width: "28", height: "20", "aria-hidden": true };
  if (kind === "tarjeta") return (
    <span className="paymethod-icon">
      <svg {...common}><rect x="1" y="3" width="26" height="14" rx="2.5" fill="#1a1612"/><rect x="1" y="6.5" width="26" height="3" fill="#574f45"/></svg>
    </span>
  );
  if (kind === "paypal") return (
    <span className="paymethod-icon">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
        <path d="M7.5 19h-2.6c-.3 0-.5-.2-.4-.5L6.5 5.5c.1-.3.3-.5.6-.5h6.4c2.6 0 4.4 1.3 3.9 4-.5 2.7-2.8 4-5.5 4H9.2c-.3 0-.5.2-.6.5L7.9 18.5c0 .3-.2.5-.4.5z" fill="#003087"/>
        <path d="M10.5 16.5h-2c-.3 0-.5-.2-.4-.5l2.1-12.5c0-.3.3-.5.6-.5h5.4c2.6 0 4.4 1.3 3.9 4-.6 3.4-3.4 4.5-6.1 4.5h-2.4c-.3 0-.5.2-.6.5l-.5 4z" fill="#0070ba"/>
      </svg>
    </span>
  );
  if (kind === "transferencia") return (
    <span className="paymethod-icon">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 10h18"/><path d="M5 10v8h14v-8"/><path d="M12 4l9 5H3z"/>
      </svg>
    </span>
  );
  if (kind === "facilito") return (
    <span className="paymethod-icon">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>
      </svg>
    </span>
  );
  return null;
}

// ── Onboarding art (simple gradient blocks + iconography) ────────────────
function OnboardingArt({ kind }) {
  if (kind === "welcome") return (
    <div className="art-welcome">
      <div className="art-burst"></div>
      <svg viewBox="0 0 80 80" width="56" height="56" aria-hidden>
        <circle cx="40" cy="40" r="36" fill="rgba(255,255,255,0.15)"/>
        <path d="M22 40l12 12 24-24" fill="none" stroke="white" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
  if (kind === "guide") return (
    <div className="art-guide">
      <div className="art-guide-card art-guide-card-1"></div>
      <div className="art-guide-card art-guide-card-2"></div>
      <div className="art-guide-card art-guide-card-3"></div>
    </div>
  );
  if (kind === "ai") return (
    <div className="art-ai">
      <div className="art-ai-bubble art-ai-bubble-them">¿Cómo distingo un disparador?</div>
      <div className="art-ai-bubble art-ai-bubble-me">Comienza por notar tu cuerpo antes de pensar…</div>
    </div>
  );
  if (kind === "practice") return (
    <div className="art-practice">
      <div className="art-practice-day"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
      <div className="art-practice-row">
        <span className="art-practice-tick on"></span>
        <span className="art-practice-tick on"></span>
        <span className="art-practice-tick on"></span>
        <span className="art-practice-tick on"></span>
        <span className="art-practice-tick on"></span>
        <span className="art-practice-tick"></span>
        <span className="art-practice-tick"></span>
      </div>
    </div>
  );
  return null;
}

// ── Mid-lesson fade with paywall CTA ─────────────────────────────────────
function PaywallFade({ author, onUpgrade }) {
  return (
    <div className="paywall-fade">
      <div className="paywall-fade-gradient" aria-hidden></div>
      <div className="paywall-fade-card">
        <span className="paywall-eyebrow">Continúa con Pro</span>
        <h3 className="paywall-fade-title">Aquí empieza el camino interactivo</h3>
        <p className="paywall-fade-body">
          El resto de la lección — video, audio, quiz y ejercicio práctico — es parte del Modo Guía Pro.
        </p>
        <button className="btn-primary" onClick={onUpgrade}>
          Desbloquea tu camino completo
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button className="btn-ghost paywall-fade-alt" onClick={onUpgrade}>
          Ver qué incluye Pro
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { PaywallModal, ProOnboarding, PaywallFade });
