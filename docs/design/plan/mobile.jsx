// plan/mobile.jsx — Mi plan en iPhone.

const {
  PSICO_PLANS: P_M, PSICO_FAQ: FAQ_M, PSICO_SUBSCRIPTION: SUB_M, PSICO_INVOICES: INV_M,
} = window;

function MI({ d, size = 14, sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const MICO = {
  arrow: <MI d="M5 12h14M13 6l6 6-6 6"/>,
  plus:  <MI d="M12 5v14M5 12h14"/>,
  check: <MI d="M5 12l5 5L20 7" sw={2.4}/>,
};

function MobTabbar() {
  const tabs = [
    { id: "home",   icon: "🏠", lbl: "Inicio" },
    { id: "books",  icon: "📚", lbl: "Libros" },
    { id: "plan",   icon: "💎", lbl: "Mi plan", on: true },
    { id: "perfil", icon: "👤", lbl: "Perfil" },
  ];
  return (
    <nav className="mob-tabbar">
      {tabs.map((t) => (
        <span key={t.id} className={"mob-tab " + (t.on ? "is-on" : "")}>
          <span className="mob-tab-icon">{t.icon}</span>
          <span className="mob-tab-lbl">{t.lbl}</span>
        </span>
      ))}
    </nav>
  );
}

// ── Free state mobile ────────────────────────────────────────────────────
function MobFree({ tweaks, setTweak }) {
  const cycle = tweaks.cycle;
  return (
    <>
      <div className="mob-h">
        <h1 className="mob-h-title">Mi plan</h1>
        <p className="mob-h-sub">
          Empieza gratis · cancela cuando quieras. Sin tarjeta para registrarte.
        </p>
      </div>

      <div className="mob-toggle">
        <button
          className={"mob-toggle-btn " + (cycle === "monthly" ? "is-on" : "")}
          onClick={() => setTweak("cycle", "monthly")}
        >
          Mensual
        </button>
        <button
          className={"mob-toggle-btn " + (cycle === "yearly" ? "is-on" : "")}
          onClick={() => setTweak("cycle", "yearly")}
        >
          Anual <span className="mob-toggle-save">-30%</span>
        </button>
      </div>

      {P_M.map((p) => {
        let feature = false;
        if (cycle === "monthly" && p.id === "PRO")    feature = true;
        if (cycle === "yearly"  && p.id === "ANNUAL") feature = true;
        const isCurrent = p.id === "FREE";
        const cls = feature ? "is-feature" : isCurrent ? "is-current" : "";
        return (
          <div key={p.id} className={"mob-plan " + cls}>
            {p.badge === "Más elegido" && <span className="mob-plan-badge lavender">{p.badge}</span>}
            {p.badge === "Mejor valor"  && <span className="mob-plan-badge">{p.badge}</span>}
            <h3 className="mob-plan-name">{p.name}</h3>
            <p className="mob-plan-tagline">{p.tagline}</p>
            <div className="mob-plan-price">
              {p.priceLabel}
              {p.id !== "FREE" && <small>/ {p.id === "ANNUAL" ? "año" : "mes"}</small>}
            </div>
            <div className="mob-plan-sub">{p.priceSub}</div>
            <ul className="mob-plan-features">
              {p.features.slice(0, 4).map((f) => (
                <li key={f} className="mob-plan-feature">
                  <span className="mob-plan-tick">✓</span> {f}
                </li>
              ))}
            </ul>
            {isCurrent ? (
              <button className="mob-plan-cta ghost" disabled>Plan actual</button>
            ) : (
              <button className={"mob-plan-cta " + (feature ? "primary" : "soft")}>
                {p.cta} {MICO.arrow}
              </button>
            )}
          </div>
        );
      })}

      {tweaks.showFaq && (
        <section className="mob-section">
          <h3>Preguntas frecuentes</h3>
          <MobFaq/>
        </section>
      )}

      <section className="mob-section">
        <h3>Seguro y simple</h3>
        <p style={{ font: "400 12.5px/1.55 var(--font-sans)", color: "var(--color-warm-600)", margin: 0 }}>
          Cancela cuando quieras desde esta misma pantalla — sin penalidad, sin llamadas.
          Pagas en pesos / dólares según tu país. Procesado por Stripe.
        </p>
      </section>
    </>
  );
}

function MobFaq() {
  const [open, setOpen] = React.useState(0);
  return (
    <div className="mob-faq">
      {FAQ_M.map((f, i) => (
        <div key={i} className={"mob-faq-row " + (open === i ? "is-open" : "")}>
          <button className="mob-faq-q" onClick={() => setOpen(open === i ? -1 : i)} type="button">
            {f.q}
            <span className="mob-faq-toggle">{MICO.plus}</span>
          </button>
          {open === i && <div className="mob-faq-a">{f.a}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Active state mobile ──────────────────────────────────────────────────
function MobActive({ tweaks }) {
  const sub =
    tweaks.tier === "pro-yearly"     ? SUB_M.PRO_YEARLY :
    tweaks.tier === "pro-cancelling" ? SUB_M.PRO_CANCELLING :
    SUB_M.PRO_MONTHLY;
  const cancelling = !!sub.cancelAtPeriodEnd;
  const planName = sub.plan === "ANNUAL" ? "Anual" : "Pro";

  return (
    <>
      <div className="mob-h">
        <h1 className="mob-h-title">Mi plan</h1>
      </div>

      <div className="mob-sub-hero">
        <span className="mob-sub-eyebrow">Tu plan</span>
        <span className="mob-sub-badge">✓ Plan {planName} activo</span>
        <h2 className="mob-sub-name">Psico Platform · {planName}</h2>
        <p className="mob-sub-price">{sub.priceLabel}</p>
        <div className="mob-sub-stats">
          <div>
            <div className="mob-sub-stat-lbl">{cancelling ? "Acceso hasta" : "Próx. renovación"}</div>
            <div className="mob-sub-stat-val">{sub.nextRenewal}</div>
          </div>
          <div>
            <div className="mob-sub-stat-lbl">{cancelling ? "Estado" : "Monto"}</div>
            <div className="mob-sub-stat-val">{cancelling ? "No renueva" : sub.nextAmount}</div>
          </div>
        </div>
        {!cancelling && sub.cycle === "mensual" && (
          <button className="mob-sub-cta">
            ✦ Cambiar a Anual — ahorra $25 {MICO.arrow}
          </button>
        )}
        {cancelling && (
          <button className="mob-sub-cta">
            ✦ Reactivar mi plan {MICO.arrow}
          </button>
        )}
      </div>

      {cancelling && (
        <div className="mob-warning">
          Tu suscripción no se renovará automáticamente. Mantienes acceso a Pro hasta <strong>{sub.nextRenewal}</strong>.
        </div>
      )}

      <section className="mob-section">
        <h3>Método de pago</h3>
        <div className="mob-pm">
          <span className="mob-pm-visa">VISA</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mob-pm-name">Visa •••• {sub.paymentMethod.last4}</div>
            <div className="mob-pm-exp">Vence {sub.paymentMethod.expiry}</div>
          </div>
          <a href="#" style={{ font: "600 12px/1 var(--font-sans)", color: "var(--color-lavender-700)", textDecoration: "none" }}>
            Editar →
          </a>
        </div>
      </section>

      {tweaks.showInvoices && (
        <section className="mob-section">
          <h3>Pagos recientes</h3>
          <div className="mob-inv">
            {INV_M.slice(0, 4).map((inv) => (
              <div key={inv.id} className="mob-inv-row">
                <div>
                  <div className="mob-inv-date">{inv.date}</div>
                  <div className="mob-inv-sub">{inv.method} · {inv.status}</div>
                </div>
                <div className="mob-inv-amt">{inv.amount}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mob-section">
        <h3>Lo que incluye tu plan</h3>
        <ul className="mob-plan-features" style={{ margin: 0 }}>
          {P_M.find((p) => p.id === (sub.plan === "ANNUAL" ? "ANNUAL" : "PRO")).features.map((f, i) => (
            <li key={i} className="mob-plan-feature" style={{ color: "var(--color-warm-700)" }}>
              <span className="mob-plan-tick">✓</span> {f}
            </li>
          ))}
        </ul>
      </section>

      {!cancelling && (
        <div className="mob-danger">
          <div style={{ font: "600 13px/1.3 var(--font-sans)", color: "var(--color-warm-900)" }}>
            ¿Necesitas hacer una pausa?
          </div>
          <p style={{ font: "400 12px/1.5 var(--font-sans)", color: "var(--color-warm-500)", margin: "6px 0 0" }}>
            Tu progreso se mantiene intacto.
          </p>
          <button className="mob-danger-btn">Cancelar mi suscripción →</button>
        </div>
      )}
    </>
  );
}

function MobilePlan({ tweaks, setTweak }) {
  const isFree = tweaks.tier === "free";
  return (
    <div className="mob">
      <div className="mob-scroll">
        {isFree
          ? <MobFree tweaks={tweaks} setTweak={setTweak}/>
          : <MobActive tweaks={tweaks}/>}
      </div>
      <MobTabbar/>
    </div>
  );
}

window.MobilePlan = MobilePlan;
