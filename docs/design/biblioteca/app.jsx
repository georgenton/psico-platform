// biblioteca/app.jsx — Stage + tweaks wiring for "Mi biblioteca".

const { WebLibrary, MobileLibrary, IOSDevice } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "surface":       "both",
  "tier":          "free",
  "mood":          "calma",
  "view":          "grid",
  "showContinue":  true,
  "showRecos":     true,
  "sort":          "recent"
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
const VIEW_OPTS = [
  { value: "grid", label: "Cuadrícula" },
  { value: "list", label: "Lista" },
];
const SORT_OPTS = [
  { value: "recent", label: "Recientes" },
  { value: "alpha",  label: "A → Z" },
  { value: "marina", label: "Sugerido por Marina" },
];

function MobileFrame({ children, scale = 0.88 }) {
  return (
    <div className="mobile-wrap" style={{ transform: "scale(" + scale + ")" }}>
      <IOSDevice width={390} height={844}>{children}</IOSDevice>
    </div>
  );
}

function BibliotecaStage() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  const stageClass =
    "stage" +
    (t.surface === "desktop" ? " solo-desktop" :
     t.surface === "mobile"  ? " solo-mobile"  : "");

  return (
    <div className={stageClass}>
      {t.surface !== "mobile" && (
        <div className="stage-col stage-col-desktop">
          <span className="stage-label">Web · Dashboard ({"≥1024px"})</span>
          <div className="desktop-frame">
            <WebLibrary tweaks={t}/>
          </div>
        </div>
      )}
      {t.surface !== "desktop" && (
        <div className="stage-col stage-col-mobile">
          <span className="stage-label">Web · Móvil (iPhone 14 Pro)</span>
          <MobileFrame scale={t.surface === "mobile" ? 1 : 0.88}>
            <MobileLibrary tweaks={t}/>
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

        <window.TweakSection label="Plan del usuario" />
        <window.TweakRadio
          label="Tier"
          value={t.tier}
          options={TIER_OPTS}
          onChange={(v) => setTweak("tier", v)}
        />
        <div style={{ fontSize: 10, color: "rgba(41,38,27,.55)", lineHeight: 1.4, marginTop: -4 }}>
          {t.tier === "free"
            ? "Solo Emociones en construcción desbloqueado · resto con candado y CTA a Pro."
            : "Catálogo completo desbloqueado · sin banner de upgrade."}
        </div>

        <window.TweakSection label="Mood activo" />
        <window.TweakSelect
          label="Mood"
          value={t.mood}
          options={MOOD_OPTS}
          onChange={(v) => setTweak("mood", v)}
        />

        <window.TweakSection label="Layout y secciones" />
        <window.TweakRadio
          label="Vista"
          value={t.view}
          options={VIEW_OPTS}
          onChange={(v) => setTweak("view", v)}
        />
        <window.TweakSelect
          label="Orden"
          value={t.sort}
          options={SORT_OPTS}
          onChange={(v) => setTweak("sort", v)}
        />
        <window.TweakToggle
          label="Hero · Continúa donde quedaste"
          value={!!t.showContinue}
          onChange={(v) => setTweak("showContinue", v)}
        />
        <window.TweakToggle
          label="Sección · Para ti (Eco)"
          value={!!t.showRecos}
          onChange={(v) => setTweak("showRecos", v)}
        />
      </window.TweaksPanel>
    </div>
  );
}

window.BibliotecaStage = BibliotecaStage;
