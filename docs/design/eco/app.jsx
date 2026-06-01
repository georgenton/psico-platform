// eco/app.jsx — Stage + Tweaks para Eco.

const { WebEco, MobileEco, IOSDevice } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "surface":   "both",
  "tier":      "free",
  "state":     "long",
  "limitHit":  false,
  "isTyping":  false,
  "showRail":  true
}/*EDITMODE-END*/;

const SURFACE_OPTS = [
  { value: "both",    label: "Lado a lado" },
  { value: "desktop", label: "Escritorio" },
  { value: "mobile",  label: "Móvil" },
];
const TIER_OPTS = [
  { value: "free", label: "Gratuito" },
  { value: "pro",  label: "Pro" },
];
const STATE_OPTS = [
  { value: "empty", label: "Primera vez (vacío)" },
  { value: "short", label: "Recién abierto" },
  { value: "long",  label: "Conversación rica" },
];

function MobileFrame({ children, scale = 0.88 }) {
  return (
    <div className="mobile-wrap" style={{ transform: "scale(" + scale + ")" }}>
      <IOSDevice width={390} height={844}>{children}</IOSDevice>
    </div>
  );
}

function EcoStage() {
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
            <WebEco tweaks={t} setTweak={setTweak}/>
          </div>
        </div>
      )}
      {t.surface !== "desktop" && (
        <div className="stage-col stage-col-mobile">
          <span className="stage-label">Web · Móvil (iPhone 14 Pro)</span>
          <MobileFrame scale={t.surface === "mobile" ? 1 : 0.88}>
            <MobileEco tweaks={t} setTweak={setTweak}/>
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

        <window.TweakSection label="Estado de la conversación" />
        <window.TweakSelect
          label="Estado"
          value={t.state}
          options={STATE_OPTS}
          onChange={(v) => setTweak("state", v)}
        />
        <div style={{ fontSize: 10, color: "rgba(41,38,27,.55)", lineHeight: 1.4, marginTop: -4 }}>
          {t.state === "empty" && "Primera vez · empty state con prompts, capacidades y boundaries."}
          {t.state === "short" && "Solo el saludo inicial de Eco · espera a que el usuario empiece."}
          {t.state === "long"  && "Conversación demo · 12 mensajes, 2 rich cards (capítulo + ejercicio), pill ✓ Guardado."}
        </div>
        <window.TweakToggle
          label="Eco está escribiendo…"
          value={!!t.isTyping}
          onChange={(v) => setTweak("isTyping", v)}
        />

        <window.TweakSection label="Plan del usuario" />
        <window.TweakRadio
          label="Plan"
          value={t.tier}
          options={TIER_OPTS}
          onChange={(v) => setTweak("tier", v)}
        />
        <window.TweakToggle
          label="Llegó al límite de mensajes (free)"
          value={!!t.limitHit}
          onChange={(v) => setTweak("limitHit", v)}
        />
        <div style={{ fontSize: 10, color: "rgba(41,38,27,.55)", lineHeight: 1.4, marginTop: -4 }}>
          {t.tier === "free"
            ? "Free: 5 mensajes/día. Toggle límite → banner lavender + CTA upgrade, composer bloqueado en móvil."
            : "Pro: chat ilimitado, sin banners."}
        </div>

        <window.TweakSection label="Layout web" />
        <window.TweakToggle
          label="Mostrar rail derecho"
          value={!!t.showRail}
          onChange={(v) => setTweak("showRail", v)}
        />
      </window.TweaksPanel>
    </div>
  );
}

window.EcoStage = EcoStage;
