// plan/web.jsx — Página "Mi plan" en el dashboard web.
// 2 estados grandes: FREE (pricing + comparativa + faq) y PRO/ANNUAL (suscripción activa + facturación).

const {
  PSICO_PLANS, PSICO_COMPARE, PSICO_FAQ, PSICO_TRUST,
  PSICO_SUBSCRIPTION, PSICO_INVOICES, PSICO_TESTIMONIALS,
} = window;

function Ico({ d, size = 16, sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const I = {
  arrow:  <Ico d="M5 12h14M13 6l6 6-6 6"/>,
  plus:   <Ico d="M12 5v14M5 12h14"/>,
  check:  <Ico d="M5 12l5 5L20 7" sw={2.4}/>,
  warn:   <Ico d={["M12 9v4", "M12 17h.01", "M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"]}/>,
  down:   <Ico d="M12 3v14M5 12l7 7 7-7M5 21h14"/>,
  sparkle:<Ico d={["M12 3l1.7 4.6L18 9l-4.3 1.4L12 15l-1.7-4.6L6 9l4.3-1.4z","M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z"]}/>,
};

// ── Sidebar ───────────────────────────────────────────────────────────────
function WebSidebar({ tier }) {
  const N = window.Icons;
  const items = [
    { icon: <N.home />, label: "Inicio" },
    { icon: <N.book />, label: "Mi biblioteca" },
    { icon: <N.plan />, label: "Mi plan", on: true },
    { icon: <N.user />, label: "Perfil" },
  ];
  return (
    <aside className="web-side">
      <div className="web-side-head">
        <span className="web-side-wordmark">Psico Platform</span>
      </div>
      <nav className="web-side-nav">
        <div className="web-side-eyebrow">Menú</div>
        {items.map((it) => (
          <a key={it.label} className={"web-side-link " + (it.on ? "is-on" : "")} href="#">
            <span className="web-side-link-icon">{it.icon}</span>
            {it.label}
          </a>
        ))}
      </nav>
      <div className="web-side-foot">
        <div className="web-side-user">
          <span className="web-side-avatar">A</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="web-side-user-name">ana@correo.com</div>
            <div className="web-side-user-plan">
              <span className={"plan-dot " + (tier === "free" ? "" : "pro")}></span>
              Plan {tier === "free" ? "Gratuito" : tier === "annual" ? "Anual" : "Pro"}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── Plan card (FREE-state pricing) ────────────────────────────────────────
function PlanCard({ plan, isCurrent, isFeature, cycle, onChoose }) {
  // Per-cycle price for Pro (Anual show as annual)
  let price = plan.priceLabel;
  let priceSub = plan.priceSub;
  if (plan.id === "PRO" && cycle === "yearly") {
    // Pro Annual is sold as Anual plan; for the Pro card we still show $7/mes
  }
  const tone = isFeature ? "is-feature" : isCurrent ? "is-current" : plan.id === "ANNUAL" ? "is-best" : "";
  return (
    <div className={"web-plan " + tone}>
      {plan.badge === "Más elegido" && <span className="web-plan-badge lavender">{plan.badge}</span>}
      {plan.badge === "Mejor valor"  && <span className="web-plan-badge">{plan.badge}</span>}

      <div>
        <h3 className="web-plan-name">{plan.name}</h3>
        <p className="web-plan-tagline">{plan.tagline}</p>
      </div>

      <div>
        <div className="web-plan-price">
          {price}
          {plan.id !== "FREE" && <small>/ {plan.id === "ANNUAL" ? "año" : "mes"}</small>}
        </div>
        <div className="web-plan-pricesub">{priceSub}</div>
      </div>

      <p className="web-plan-desc">{plan.description}</p>

      <ul className="web-plan-features">
        {plan.features.map((f) => (
          <li key={f} className="web-plan-feature">
            <span className="web-plan-tick">✓</span> {f}
          </li>
        ))}
        {plan.limits && plan.limits.map((f) => (
          <li key={f} className="web-plan-limit">{f}</li>
        ))}
      </ul>

      {isCurrent ? (
        <button className="web-plan-cta ghost" disabled>Plan actual</button>
      ) : isFeature ? (
        <button className="web-plan-cta primary" onClick={onChoose}>
          {plan.cta} {I.arrow}
        </button>
      ) : (
        <button className="web-plan-cta soft" onClick={onChoose}>
          {plan.cta} {I.arrow}
        </button>
      )}
    </div>
  );
}

// ── Trust block ──────────────────────────────────────────────────────────
function TrustBlock() {
  const t = PSICO_TRUST;
  const cells = [
    { num: t.readers, lbl: "Lectores activos en LATAM" },
    { num: "★ " + t.rating, lbl: t.reviewsCount.toLocaleString("es") + " reseñas verificadas" },
    { num: t.countries, lbl: "Países atendidos" },
    { num: "30 días", lbl: "Garantía de devolución" },
  ];
  return (
    <div className="web-trust">
      {cells.map((c) => (
        <div key={c.lbl} className="web-trust-cell">
          <div className="web-trust-num">{c.num}</div>
          <div className="web-trust-lbl">{c.lbl}</div>
        </div>
      ))}
    </div>
  );
}

// ── Compare table ────────────────────────────────────────────────────────
function CompareTable() {
  return (
    <div className="web-compare">
      <div className="web-compare-row web-compare-h">
        <div className="web-compare-cell">Característica</div>
        <div className="web-compare-cell">Gratuito</div>
        <div className="web-compare-cell">Pro</div>
        <div className="web-compare-cell">Anual</div>
      </div>
      {PSICO_COMPARE.map((row) => (
        <div key={row.row} className="web-compare-row">
          <div className="web-compare-cell row-label">{row.row}</div>
          {[row.free, row.pro, row.annual].map((v, i) => {
            const isActive = i > 0 && (v === true || (typeof v === "string" && !v.startsWith("Solo") && v !== "—" && v !== "Comunidad" && v !== "Estándar (48 h)" && v !== "Básicos"));
            const cls = isActive ? " feature-active" : "";
            if (v === true) return <div key={i} className={"web-compare-cell true" + cls}>{I.check} Incluido</div>;
            if (v === false) return <div key={i} className="web-compare-cell false">—</div>;
            return <div key={i} className={"web-compare-cell" + cls}>{v}</div>;
          })}
        </div>
      ))}
    </div>
  );
}

// ── Testimonials ─────────────────────────────────────────────────────────
function Testis() {
  return (
    <div className="web-testis">
      {PSICO_TESTIMONIALS.map((t, i) => (
        <article key={i} className="web-testi">
          <p className="web-testi-quote">{t.quote}</p>
          <footer className="web-testi-author">
            <span className="web-testi-avatar">{t.initials}</span>
            <div>
              <div className="web-testi-name">{t.name}</div>
              <div className="web-testi-where">Pro · {t.country}</div>
            </div>
          </footer>
        </article>
      ))}
    </div>
  );
}

// ── FAQ ──────────────────────────────────────────────────────────────────
function FAQ() {
  const [open, setOpen] = React.useState(0);
  return (
    <div className="web-faq">
      {PSICO_FAQ.map((f, i) => (
        <div key={i} className={"web-faq-row " + (open === i ? "is-open" : "")}>
          <button className="web-faq-q" onClick={() => setOpen(open === i ? -1 : i)} type="button">
            {f.q}
            <span className="web-faq-toggle">{I.plus}</span>
          </button>
          {open === i && <div className="web-faq-a">{f.a}</div>}
        </div>
      ))}
    </div>
  );
}

// ── FREE state ───────────────────────────────────────────────────────────
function FreeState({ tweaks, setTweak }) {
  const cycle = tweaks.cycle;     // monthly · yearly
  const plans = PSICO_PLANS;

  return (
    <>
      <div className="web-hello">
        <h1>Elige cómo quieres acompañarte.</h1>
        <p className="web-hello-sub">
          Empieza gratis. Mejora a Pro cuando estés lista — sin tarjeta para registrarte, cancela cuando quieras.
        </p>
        <span className="web-hello-chip">
          <span className="web-hello-chip-dot"></span>
          Plan actual · <strong>Gratuito</strong> · 1 libro desbloqueado
        </span>
      </div>

      <div className="web-toggle" role="tablist" aria-label="Ciclo de facturación">
        <button
          className={"web-toggle-btn " + (cycle === "monthly" ? "is-on" : "")}
          onClick={() => setTweak("cycle", "monthly")}
          role="tab" aria-selected={cycle === "monthly"}
        >
          Mensual
        </button>
        <button
          className={"web-toggle-btn " + (cycle === "yearly" ? "is-on" : "")}
          onClick={() => setTweak("cycle", "yearly")}
          role="tab" aria-selected={cycle === "yearly"}
        >
          Anual
          <span className="web-toggle-save">Ahorra 30%</span>
        </button>
      </div>

      <section className="web-plans">
        {plans.map((p) => {
          let isFeature = false;
          if (cycle === "monthly" && p.id === "PRO")    isFeature = true;
          if (cycle === "yearly" && p.id === "ANNUAL")  isFeature = true;
          return (
            <PlanCard
              key={p.id}
              plan={p}
              isCurrent={p.id === "FREE"}
              isFeature={isFeature}
              cycle={cycle}
            />
          );
        })}
      </section>

      <TrustBlock/>

      {tweaks.showCompare && (
        <section>
          <h2 style={{ font: "700 18px/1.2 var(--font-sans)", color: "var(--color-warm-900)", letterSpacing: "-0.012em", margin: "0 0 14px" }}>
            Comparación completa
          </h2>
          <CompareTable/>
        </section>
      )}

      {tweaks.showTestis && (
        <section>
          <h2 style={{ font: "700 18px/1.2 var(--font-sans)", color: "var(--color-warm-900)", letterSpacing: "-0.012em", margin: "0 0 14px" }}>
            Lectores que ya están adentro
          </h2>
          <Testis/>
        </section>
      )}

      {tweaks.showFaq && (
        <section>
          <h2 style={{ font: "700 18px/1.2 var(--font-sans)", color: "var(--color-warm-900)", letterSpacing: "-0.012em", margin: "0 0 14px" }}>
            Preguntas frecuentes
          </h2>
          <FAQ/>
          <div style={{ font: "500 12.5px/1.4 var(--font-sans)", color: "var(--color-warm-500)", marginTop: 14, textAlign: "center" }}>
            ¿Otra duda? Escríbenos a <a href="#" style={{ color: "var(--color-lavender-700)", textDecoration: "none", fontWeight: 600 }}>hola@psico.app</a>
          </div>
        </section>
      )}
    </>
  );
}

// ── Active subscription state ────────────────────────────────────────────
function ActiveState({ tweaks }) {
  const sub =
    tweaks.tier === "pro-yearly"     ? PSICO_SUBSCRIPTION.PRO_YEARLY :
    tweaks.tier === "pro-cancelling" ? PSICO_SUBSCRIPTION.PRO_CANCELLING :
    PSICO_SUBSCRIPTION.PRO_MONTHLY;
  const cancelling = !!sub.cancelAtPeriodEnd;
  const planName = sub.plan === "ANNUAL" ? "Anual" : "Pro";

  return (
    <>
      <div className="web-hello">
        <h1>Mi plan</h1>
        <p className="web-hello-sub">Tu suscripción activa, facturación y formas de cambiar.</p>
      </div>

      <section className="web-sub-hero">
        <div className="web-sub-hero-top">
          <div>
            <span className="web-sub-hero-eyebrow">Tu plan</span>
            <span className="web-sub-hero-badge">✓ Plan {planName} activo</span>
            <h2 className="web-sub-hero-name">Psico Platform · {planName}</h2>
            <p className="web-sub-hero-price">
              <strong>{sub.priceLabel}</strong> · Activo desde {sub.startedAt}
            </p>
          </div>
          <div className="web-sub-hero-right">
            <span className="web-sub-hero-right-lbl">
              {cancelling ? "Acceso hasta" : "Próxima renovación"}
            </span>
            <span className="web-sub-hero-right-val">{sub.nextRenewal}</span>
            <span className="web-sub-hero-right-amt">
              {cancelling ? "No se renovará" : sub.nextAmount}
            </span>
          </div>
        </div>

        {cancelling && (
          <div className="web-sub-hero-warning">
            <span className="web-sub-hero-warning-icon">{I.warn}</span>
            Tu suscripción no se renovará automáticamente. Mantienes acceso a Pro
            hasta <strong>{sub.nextRenewal}</strong>. Puedes reactivarla en cualquier momento — sin perder tu progreso.
          </div>
        )}

        <div className="web-sub-hero-ctas">
          {cancelling ? (
            <button className="web-sub-hero-cta solid">{I.sparkle} Reactivar mi plan</button>
          ) : sub.cycle === "mensual" ? (
            <button className="web-sub-hero-cta solid">{I.sparkle} Cambiar a Anual · ahorra $25</button>
          ) : null}
          <button className="web-sub-hero-cta">Gestionar suscripción {I.arrow}</button>
        </div>
      </section>

      <div className="web-sub-grid">
        <div className="web-card">
          <span className="web-card-eyebrow">Lo que incluye tu plan</span>
          <ul className="web-benefits">
            {PSICO_PLANS.find((p) => p.id === (sub.plan === "ANNUAL" ? "ANNUAL" : "PRO")).features.map((f, i) => (
              <li key={i}><span className="web-benefits-tick">✓</span>{f}</li>
            ))}
          </ul>
        </div>

        <div className="web-card">
          <span className="web-card-eyebrow">Detalle de facturación</span>
          <div className="web-card-row">
            <span className="web-card-row-lbl">Plan</span>
            <span className="web-card-row-val">{planName} · {sub.cycle}</span>
          </div>
          <div className="web-card-row">
            <span className="web-card-row-lbl">Precio</span>
            <span className="web-card-row-val">{sub.priceLabel}</span>
          </div>
          <div className="web-card-row">
            <span className="web-card-row-lbl">{cancelling ? "Cancela el" : "Próximo cobro"}</span>
            <span className="web-card-row-val">{sub.nextRenewal}</span>
          </div>
          <div className="web-card-row">
            <span className="web-card-row-lbl">Método de pago</span>
            <span className="web-card-row-val">{sub.paymentMethod.brand} •••• {sub.paymentMethod.last4}</span>
          </div>
          <div className="web-pm-card" style={{ marginTop: 8 }}>
            <span className="web-pm-visa">VISA</span>
            <div className="web-pm-meta">
              <div className="web-pm-name">{sub.paymentMethod.brand} •••• {sub.paymentMethod.last4}</div>
              <div className="web-pm-exp">Vence {sub.paymentMethod.expiry}</div>
            </div>
            <a className="web-pm-link" href="#">Actualizar →</a>
          </div>
        </div>
      </div>

      {tweaks.showInvoices && (
        <section className="web-invoices">
          <div className="web-invoices-h">Historial de pagos</div>
          <div className="web-invoices-row header">
            <span>Factura</span><span>Fecha</span><span>Monto</span><span>Estado</span><span></span>
          </div>
          {PSICO_INVOICES.map((inv) => (
            <div key={inv.id} className="web-invoices-row">
              <span>{inv.id.replace("in_", "#")} <span style={{ color: "var(--color-warm-400)" }}>· {inv.method}</span></span>
              <span>{inv.date}</span>
              <span className="web-invoices-amount">{inv.amount}</span>
              <span><span className="web-invoices-status">{I.check} {inv.status}</span></span>
              <button className="web-invoices-dl">{I.down} PDF</button>
            </div>
          ))}
        </section>
      )}

      {!cancelling && (
        <div className="web-danger">
          <div className="web-danger-meta">
            <h3 className="web-danger-h">¿Necesitas hacer una pausa?</h3>
            <p className="web-danger-s">
              Tu progreso, notas y biblioteca se mantienen intactos. Puedes volver cuando estés lista.
            </p>
          </div>
          <button className="web-danger-btn">Cancelar mi suscripción</button>
        </div>
      )}
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────
function WebPlan({ tweaks, setTweak }) {
  const isFree = tweaks.tier === "free";

  return (
    <div className="web">
      <WebSidebar tier={tweaks.tier.startsWith("pro") ? (tweaks.tier === "pro-yearly" ? "annual" : "pro") : "free"}/>
      <main className="web-main">
        <header className="web-top">
          <div className="web-top-title">Mi plan</div>
          <div style={{ font: "500 12px/1 var(--font-sans)", color: "var(--color-warm-500)" }}>
            Suscripción · Facturación
          </div>
        </header>
        <div className="web-page">
          <div className="web-page-inner">
            {isFree
              ? <FreeState tweaks={tweaks} setTweak={setTweak}/>
              : <ActiveState tweaks={tweaks}/>}
          </div>
        </div>
      </main>
    </div>
  );
}

window.WebPlan = WebPlan;
