// diario/app.jsx — Stage + Tweaks para Diario.

const { WebDiario, MobileDiario, IOSDevice } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "surface":       "both",
  "tier":          "free",
  "state":         "full",
  "showComposer":  true,
  "mood":          "calma"
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
  { value: "full",  label: "12 entradas (rico)" },
  { value: "empty", label: "Diario vacío" },
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

function DiarioStage() {
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
            <WebDiario tweaks={t} setTweak={setTweak}/>
          </div>
        </div>
      )}
      {t.surface !== "desktop" && (
        <div className="stage-col stage-col-mobile">
          <span className="stage-label">Web · Móvil (iPhone 14 Pro)</span>
          <MobileFrame scale={t.surface === "mobile" ? 1 : 0.88}>
            <MobileDiario tweaks={t} setTweak={setTweak}/>
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

        <window.TweakSection label="Estado del diario" />
        <window.TweakRadio
          label="Contenido"
          value={t.state}
          options={STATE_OPTS}
          onChange={(v) => setTweak("state", v)}
        />
        <div style={{ fontSize: 10, color: "rgba(41,38,27,.55)", lineHeight: 1.4, marginTop: -4 }}>
          {t.state === "full" && "12 entradas reales · 4 tipos (manual · reflexión · Eco · subrayado)."}
          {t.state === "empty" && "Primer día · empty state con invitación a escribir."}
        </div>

        <window.TweakSection label="Composer" />
        <window.TweakToggle
          label="Mostrar composer (nueva entrada)"
          value={!!t.showComposer}
          onChange={(v) => setTweak("showComposer", v)}
        />
        <window.TweakSelect
          label="Mood al escribir"
          value={t.mood}
          options={MOOD_OPTS}
          onChange={(v) => setTweak("mood", v)}
        />

        <window.TweakSection label="Plan" />
        <window.TweakRadio
          label="Plan"
          value={t.tier}
          options={TIER_OPTS}
          onChange={(v) => setTweak("tier", v)}
        />
      </window.TweaksPanel>
    </div>
  );
}

window.DiarioStage = DiarioStage;
