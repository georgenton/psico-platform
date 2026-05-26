// plan/app.jsx — Stage + Tweaks para "Mi plan".

const { WebPlan, MobilePlan, IOSDevice } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "surface":      "both",
  "tier":         "free",
  "cycle":        "monthly",
  "showCompare":  true,
  "showTestis":   true,
  "showFaq":      true,
  "showInvoices": true
}/*EDITMODE-END*/;

const SURFACE_OPTS = [
  { value: "both",    label: "Lado a lado" },
  { value: "desktop", label: "Escritorio" },
  { value: "mobile",  label: "Móvil" },
];
const TIER_OPTS = [
  { value: "free",            label: "Gratuito" },
  { value: "pro-monthly",     label: "Pro mensual" },
  { value: "pro-yearly",      label: "Anual" },
  { value: "pro-cancelling",  label: "Pro · cancelando" },
];
const CYCLE_OPTS = [
  { value: "monthly", label: "Mensual" },
  { value: "yearly",  label: "Anual" },
];

function MobileFrame({ children, scale = 0.88 }) {
  return (
    <div className="mobile-wrap" style={{ transform: "scale(" + scale + ")" }}>
      <IOSDevice width={390} height={844}>{children}</IOSDevice>
    </div>
  );
}

function PlanStage() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  const stageClass =
    "stage" +
    (t.surface === "desktop" ? " solo-desktop" :
     t.surface === "mobile"  ? " solo-mobile"  : "");

  return (
    <div className={stageClass}>
      {t.surface !== "mobile" && (
        <div className="stage-col stage-col-desktop">
          <span className="stage-label">Web · Dashboard (≥1024px)</span>
          <div className="desktop-frame">
            <WebPlan tweaks={t} setTweak={setTweak}/>
          </div>
        </div>
      )}
      {t.surface !== "desktop" && (
        <div className="stage-col stage-col-mobile">
          <span className="stage-label">Web · Móvil (iPhone 14 Pro)</span>
          <MobileFrame scale={t.surface === "mobile" ? 1 : 0.88}>
            <MobilePlan tweaks={t} setTweak={setTweak}/>
          </MobileFrame>
        </div>
      )}

      <window.TweaksPanel>
        <window.TweakSection label="Surface" />
        <window.TweakSelect
          label="Mostrar"
          value={t.surface}
          options={SURFACE_OPTS}
          onChange={(v) => setTweak("surface", v)}
        />

        <window.TweakSection label="Estado del usuario" />
        <window.TweakSelect
          label="Plan actual"
          value={t.tier}
          options={TIER_OPTS}
          onChange={(v) => setTweak("tier", v)}
        />
        <div style={{ fontSize: 10, color: "rgba(41,38,27,.55)", lineHeight: 1.4, marginTop: -4 }}>
          {t.tier === "free"           && "Pricing completo · 3 tarjetas · comparativa · FAQ."}
          {t.tier === "pro-monthly"    && "Pro $7/mes activo · próxima renovación · CTA upgrade a Anual."}
          {t.tier === "pro-yearly"     && "Anual $59/año activo · renueva en noviembre · sin upsell."}
          {t.tier === "pro-cancelling" && "Pro cancelando · banner amarillo · CTA reactivar."}
        </div>

        <window.TweakSection label="Pricing (estado Gratuito)" />
        <window.TweakRadio
          label="Ciclo de facturación"
          value={t.cycle}
          options={CYCLE_OPTS}
          onChange={(v) => setTweak("cycle", v)}
        />
        <window.TweakToggle
          label="Comparativa completa"
          value={!!t.showCompare}
          onChange={(v) => setTweak("showCompare", v)}
        />
        <window.TweakToggle
          label="Testimonios"
          value={!!t.showTestis}
          onChange={(v) => setTweak("showTestis", v)}
        />
        <window.TweakToggle
          label="Preguntas frecuentes"
          value={!!t.showFaq}
          onChange={(v) => setTweak("showFaq", v)}
        />

        <window.TweakSection label="Suscripción activa" />
        <window.TweakToggle
          label="Historial de pagos"
          value={!!t.showInvoices}
          onChange={(v) => setTweak("showInvoices", v)}
        />
      </window.TweaksPanel>
    </div>
  );
}

window.PlanStage = PlanStage;
