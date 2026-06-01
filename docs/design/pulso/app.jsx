// pulso/app.jsx — Stage + Tweaks para Pulso (Console only).

const { ConsoleApp, MobilePulso, IOSDevice } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "view":     "overview",
  "surface":  "both"
}/*EDITMODE-END*/;

const VIEWS = [
  { value: "overview",  label: "00 · Overview" },
  { value: "book",      label: "01 · Contenido · libros" },
  { value: "funnel",    label: "02 · Funnel · adquisición" },
  { value: "terapia",   label: "03 · Terapia · pre-launch" },
  { value: "podcast",   label: "04 · Podcast · pre-pub" },
  { value: "resources", label: "05 · Recursos · pre-pub" },
];

const SURFACES = [
  { value: "both",    label: "Lado a lado" },
  { value: "desktop", label: "Escritorio" },
  { value: "mobile",  label: "Móvil" },
];

const VIEW_LABEL = {
  overview:  "Overview",
  book:      "Contenido · libros",
  funnel:    "Funnel · adquisición",
  terapia:   "Terapia · pre-launch",
  podcast:   "Podcast · pre-publicación",
  resources: "Recursos · pre-publicación",
};

function MobileFrame({ children, scale = 0.84 }) {
  return (
    <div className="mobile-wrap" style={{ transform: "scale(" + scale + ")" }}>
      <IOSDevice width={390} height={844}>{children}</IOSDevice>
    </div>
  );
}

function PulsoStage() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  const view = t.view;
  const setView = (v) => setTweak("view", v);

  const stageClass =
    "stage" +
    (t.surface === "desktop" ? " solo-desktop" :
     t.surface === "mobile"  ? " solo-mobile"  : "");

  return (
    <div className={stageClass}>
      {t.surface !== "mobile" && (
        <div className="stage-col stage-col-desktop">
          <span className="stage-label">
            <span className="stage-label-step">Pulso</span>
            {VIEW_LABEL[view]} · Web (≥1024px)
          </span>
          <div className="desktop-frame">
            <ConsoleApp view={view} setView={setView} />
          </div>
        </div>
      )}
      {t.surface !== "desktop" && (
        <div className="stage-col stage-col-mobile">
          <span className="stage-label">
            <span className="stage-label-step">Pulso</span>
            {VIEW_LABEL[view]} · Móvil
          </span>
          <MobileFrame scale={t.surface === "mobile" ? 1 : 0.84}>
            <MobilePulso view={view} setView={setView} />
          </MobileFrame>
        </div>
      )}

      <window.TweaksPanel>
        <window.TweakSection label="Pantalla" />
        <window.TweakSelect
          label="Vista"
          value={view}
          options={VIEWS}
          onChange={(v) => setTweak("view", v)}
        />
        <div style={{
          marginTop: 4,
          fontSize: 10, color: "rgba(41,38,27,.55)", lineHeight: 1.45,
        }}>
          <b>v1 activo:</b> Overview · Libros · Funnel.<br />
          <b>Pre-launch:</b> Terapia (gates).<br />
          <b>Pre-publicación:</b> Podcast · Recursos.
        </div>

        <window.TweakSection label="Superficie" />
        <window.TweakRadio
          label="Vista"
          value={t.surface}
          options={SURFACES}
          onChange={(v) => setTweak("surface", v)}
        />
      </window.TweaksPanel>
    </div>
  );
}

window.PulsoStage = PulsoStage;
