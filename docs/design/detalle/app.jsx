// detalle/app.jsx — Stage + Tweaks para "Detalle del libro".

const { WebDetalle, MobileDetalle, IOSDevice } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "surface":       "both",
  "tier":          "free",
  "progress":      "mid",
  "hero":          "default",
  "showLearnings": true,
  "showReviews":   true
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
const PROGRESS_OPTS = [
  { value: "new",     label: "Sin empezar" },
  { value: "started", label: "Recién empezado" },
  { value: "mid",     label: "A mitad (cap. 5)" },
  { value: "almost",  label: "Casi terminado" },
  { value: "done",    label: "Completado" },
];
const HERO_OPTS = [
  { value: "default",    label: "Estándar (cover lateral)" },
  { value: "immersive",  label: "Inmersivo (full-bleed)" },
];

function MobileFrame({ children, scale = 0.88 }) {
  return (
    <div className="mobile-wrap" style={{ transform: "scale(" + scale + ")" }}>
      <IOSDevice width={390} height={844}>{children}</IOSDevice>
    </div>
  );
}

function DetalleStage() {
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
            <WebDetalle tweaks={t}/>
          </div>
        </div>
      )}
      {t.surface !== "desktop" && (
        <div className="stage-col stage-col-mobile">
          <span className="stage-label">Web · Móvil (iPhone 14 Pro)</span>
          <MobileFrame scale={t.surface === "mobile" ? 1 : 0.88}>
            <MobileDetalle tweaks={t}/>
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

        <window.TweakSection label="Estado del lector" />
        <window.TweakRadio
          label="Plan"
          value={t.tier}
          options={TIER_OPTS}
          onChange={(v) => setTweak("tier", v)}
        />
        <window.TweakSelect
          label="Progreso"
          value={t.progress}
          options={PROGRESS_OPTS}
          onChange={(v) => setTweak("progress", v)}
        />
        <div style={{ fontSize: 10, color: "rgba(41,38,27,.55)", lineHeight: 1.4, marginTop: -4 }}>
          {t.progress === "new"      && "CTA: Empezar capítulo 1 · sin barra de progreso."}
          {t.progress === "started"  && "Cap. 1 marcado en curso · barra al 8%."}
          {t.progress === "mid"      && "4 caps completados · cap. 5 en curso · CTA Continuar."}
          {t.progress === "almost"   && "10 caps completados · cap. 11 en curso · barra 92%."}
          {t.progress === "done"     && "✓ Completado · CTA Releer desde el inicio."}
        </div>

        <window.TweakSection label="Hero" />
        <window.TweakRadio
          label="Estilo del hero"
          value={t.hero}
          options={HERO_OPTS}
          onChange={(v) => setTweak("hero", v)}
        />
        <div style={{ fontSize: 10, color: "rgba(41,38,27,.55)", lineHeight: 1.4, marginTop: -4 }}>
          {t.hero === "default"
            ? "Cover izquierda · meta y CTAs derecha. Para foco editorial."
            : "Banner full-bleed con el gradiente del cover. Para una sensación más libro-objeto."}
        </div>

        <window.TweakSection label="Secciones opcionales" />
        <window.TweakToggle
          label="Lo que aprenderás"
          value={!!t.showLearnings}
          onChange={(v) => setTweak("showLearnings", v)}
        />
        <window.TweakToggle
          label="Reseñas verificadas"
          value={!!t.showReviews}
          onChange={(v) => setTweak("showReviews", v)}
        />
      </window.TweaksPanel>
    </div>
  );
}

window.DetalleStage = DetalleStage;
