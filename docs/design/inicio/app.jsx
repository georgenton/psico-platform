// inicio/app.jsx — Stage + Tweaks para "Inicio".

const { WebInicio, MobileInicio, IOSDevice } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "surface":       "both",
  "tier":          "free",
  "hour":          15,
  "checkedIn":     false,
  "mood":          "calma",
  "hasProgress":   true,
  "showMarina":    true,
  "showStats":     true,
  "showReflexion": true
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
const MOOD_OPTS = [
  { value: "calma",     label: "Calma" },
  { value: "foco",      label: "Foco" },
  { value: "energia",   label: "Energía" },
  { value: "reflexion", label: "Reflexión" },
];

function MobileFrame({ children, scale = 0.88 }) {
  return (
    <div className="mobile-wrap" style={{ transform: "scale(" + scale + ")" }}>
      <IOSDevice width={390} height={844}>{children}</IOSDevice>
    </div>
  );
}

function InicioStage() {
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
            <WebInicio tweaks={t} setTweak={setTweak}/>
          </div>
        </div>
      )}
      {t.surface !== "desktop" && (
        <div className="stage-col stage-col-mobile">
          <span className="stage-label">Web · Móvil (iPhone 14 Pro)</span>
          <MobileFrame scale={t.surface === "mobile" ? 1 : 0.88}>
            <MobileInicio tweaks={t} setTweak={setTweak}/>
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

        <window.TweakSection label="Hora del día" />
        <window.TweakSlider
          label="Hora (0–23)"
          value={t.hour}
          min={0} max={23} step={1}
          onChange={(v) => setTweak("hour", v)}
        />
        <div style={{ fontSize: 10, color: "rgba(41,38,27,.55)", lineHeight: 1.4, marginTop: -4 }}>
          {t.hour < 12 ? "Saludo de mañana · Marina sugiere empezar el día." :
           t.hour < 19 ? "Saludo de tarde · pausa a mitad del día." :
                         "Saludo de noche · cierre tranquilo, sugerencia Reflexión."}
        </div>

        <window.TweakSection label="Estado del usuario" />
        <window.TweakRadio
          label="Plan"
          value={t.tier}
          options={TIER_OPTS}
          onChange={(v) => setTweak("tier", v)}
        />
        <window.TweakToggle
          label="Hizo check-in hoy"
          value={!!t.checkedIn}
          onChange={(v) => setTweak("checkedIn", v)}
        />
        <window.TweakSelect
          label="Mood actual"
          value={t.mood}
          options={MOOD_OPTS}
          onChange={(v) => setTweak("mood", v)}
        />
        <window.TweakToggle
          label="Tiene libro empezado"
          value={!!t.hasProgress}
          onChange={(v) => setTweak("hasProgress", v)}
        />

        <window.TweakSection label="Secciones" />
        <window.TweakToggle
          label="Momento con Eco"
          value={!!t.showMarina}
          onChange={(v) => setTweak("showMarina", v)}
        />
        <window.TweakToggle
          label="Tu camino (stats)"
          value={!!t.showStats}
          onChange={(v) => setTweak("showStats", v)}
        />
        <window.TweakToggle
          label="Reflexión rápida"
          value={!!t.showReflexion}
          onChange={(v) => setTweak("showReflexion", v)}
        />
      </window.TweaksPanel>
    </div>
  );
}

window.InicioStage = InicioStage;
