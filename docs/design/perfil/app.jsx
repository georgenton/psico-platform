// perfil/app.jsx — Stage + Tweaks para Perfil.

const { WebPerfil, MobilePerfil, IOSDevice } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "surface":           "both",
  "tier":              "free",
  "showStats":         true,
  "showAchievements":  true,
  "showPrivacy":       true,
  "voice":             "neutro",
  "defaultMood":       "calma",
  "readingTime":       "15",
  "theme":             "system",
  "reminderTime":      "evening"
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
const THEME_OPTS = [
  { value: "system", label: "Sistema" },
  { value: "light",  label: "Claro" },
  { value: "dark",   label: "Oscuro" },
];

function MobileFrame({ children, scale = 0.88 }) {
  return (
    <div className="mobile-wrap" style={{ transform: "scale(" + scale + ")" }}>
      <IOSDevice width={390} height={844}>{children}</IOSDevice>
    </div>
  );
}

function PerfilStage() {
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
            <WebPerfil tweaks={t} setTweak={setTweak}/>
          </div>
        </div>
      )}
      {t.surface !== "desktop" && (
        <div className="stage-col stage-col-mobile">
          <span className="stage-label">Web · Móvil (iPhone 14 Pro)</span>
          <MobileFrame scale={t.surface === "mobile" ? 1 : 0.88}>
            <MobilePerfil tweaks={t} setTweak={setTweak}/>
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
        <window.TweakRadio
          label="Plan"
          value={t.tier}
          options={TIER_OPTS}
          onChange={(v) => setTweak("tier", v)}
        />
        <div style={{ fontSize: 10, color: "rgba(41,38,27,.55)", lineHeight: 1.4, marginTop: -4 }}>
          {t.tier === "free"
            ? "Aparece CTA Actualizar a Pro junto a Editar perfil."
            : "Sin upsell; pill lavender en Plan."}
        </div>

        <window.TweakSection label="Secciones" />
        <window.TweakToggle
          label="Tu camino (6 stats)"
          value={!!t.showStats}
          onChange={(v) => setTweak("showStats", v)}
        />
        <window.TweakToggle
          label="Hitos (achievements)"
          value={!!t.showAchievements}
          onChange={(v) => setTweak("showAchievements", v)}
        />
        <window.TweakToggle
          label="Privacidad"
          value={!!t.showPrivacy}
          onChange={(v) => setTweak("showPrivacy", v)}
        />

        <window.TweakSection label="Preferencias del usuario" />
        <window.TweakRadio
          label="Tema"
          value={t.theme}
          options={THEME_OPTS}
          onChange={(v) => setTweak("theme", v)}
        />
        <div style={{ fontSize: 10, color: "rgba(41,38,27,.55)", lineHeight: 1.4, marginTop: -4 }}>
          El tema oscuro real no está en el sistema — solo cambia la selección.
        </div>
      </window.TweaksPanel>
    </div>
  );
}

window.PerfilStage = PerfilStage;
