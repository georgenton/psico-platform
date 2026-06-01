// reader/app.jsx — Stage + Tweaks para Lector.

const { WebReader, MobileReader, IOSDevice } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "surface":   "both",
  "tier":      "pro",
  "mode":      "guia",
  "theme":     "light",
  "fontScale": 1,
  "bodyFont":  "serif",
  "selection": true,
  "note":      false,
  "ecoConv":   false,
  "audio":     "idle",
  "tocTab":    "lessons",
  "annoOpen":  false,
  "resume":    true,
  "sheet":     "none",
  "overlay":   "none",
  "offline":   "off",
  "chapterEndRich": false,
  "onboardingStep": 0,
  "sampleMode":     false,
  "ecoCitations":   true,
  "editHighlight":  false,
  "lineHeight":     1.6,
  "margins":        "medium",
  "justify":        false,
  "hyphens":        false,
  "readingRule":    false,
  "highContrast":   false,
  "dyslexicFont":   false,
  "spaciousType":   false,
  "reducedMotion":  false,
  "alwaysTranscript": false,
  "audioWarn":      true,
  "largeTargets":   false,
  "focusRings":     false,
  "streakDays":     7,
  "goalMin":        15,
  "todayMin":       12,
  "showStreak":     true,
  "kbShortcuts":    true,
  "recommendedChapters": true,
  "communityHeat":  true,
  "ttsActive":      false
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
const MODE_OPTS = [
  { value: "libro", label: "Modo Libro" },
  { value: "guia",  label: "Modo Guía" },
];
const THEME_OPTS = [
  { value: "light", label: "Claro" },
  { value: "sepia", label: "Sepia" },
  { value: "dark",  label: "Oscuro" },
];
const FONT_OPTS = [
  { value: "serif", label: "Serif" },
  { value: "sans",  label: "Sans" },
];
const AUDIO_OPTS = [
  { value: "idle",       label: "Inactivo" },
  { value: "playing",    label: "Reproduciendo" },
  { value: "transcript", label: "Con transcripción" },
];
const TOC_TAB_OPTS = [
  { value: "book",       label: "Libro" },
  { value: "lessons",    label: "Lecciones" },
  { value: "highlights", label: "Subrayados" },
];
const SHEET_OPTS = [
  { value: "none",        label: "Cerradas" },
  { value: "toc",         label: "Índice" },
  { value: "aa",          label: "Aa · tema" },
  { value: "annotations", label: "Subrayados y notas" },
];
const OVERLAY_OPTS = [
  { value: "none",          label: "Ninguna" },
  { value: "exercise",      label: "#5 · Carta a la tristeza" },
  { value: "search",        label: "#9 · Buscar en el libro" },
  { value: "empties",       label: "#10 · Estados vacíos" },
  { value: "paywall-hard",  label: "#15 · Paywall duro" },
  { value: "downloads",     label: "#18 · Descargas offline" },
  { value: "share-quote",   label: "#20 · Compartir cita" },
  { value: "safety",        label: "#8 · Modo seguridad (crisis)" },
  { value: "loading",       label: "#4 · Cargando + errores" },
  { value: "accessibility", label: "#12 · Accesibilidad" },
  { value: "journey",       label: "#14 · Mi recorrido" },
  { value: "pause",         label: "#5 · ¿Cerrar por hoy?" },
  { value: "save-eco",      label: "#7 · Guardar Eco como nota" },
  { value: "audio-panel",   label: "#9 · Audio: timer + marcadores" },
  { value: "audio-queue",   label: "#10 · Cola de audios" },
  { value: "keyboard",      label: "#13 · Atajos de teclado" },
  { value: "gift",          label: "#18 · Regalar el libro" },
  { value: "community-heat", label: "#19 · Calor de la comunidad" },
  { value: "tts",            label: "#20 · Voz de Marina (TTS)" },
  { value: "bookclub",       label: "#21 · Círculo de lectura" },
  { value: "weekly-recap",   label: "#22 · Email semanal" },
  { value: "author-onboarding", label: "#23 · Onboarding del autor" },
  { value: "content-warning",   label: "#1bis · Content warning" },
  { value: "author-page",       label: "#7 · Página de Marina" },
  { value: "habit-calendar",    label: "#10 · Calendario de hábito" },
  { value: "reminders",         label: "#15 · Recordatorios" },
  { value: "breath",            label: "#2 · Breath break 4-7-8" },
  { value: "privacy",           label: "#6 · Privacy dashboard" },
  { value: "emotional-map",     label: "#11 · Mapa emocional" },
  { value: "home-widget",       label: "#13 · Widget de inicio" },
  { value: "inbox",             label: "#19 · Bandeja interna" },
];
const OFFLINE_OPTS = [
  { value: "off",     label: "Sin banner" },
  { value: "offline", label: "Sin conexión" },
  { value: "syncing", label: "Sincronizando" },
  { value: "done",    label: "Todo guardado" },
];

function MobileFrame({ children, scale = 0.88 }) {
  return (
    <div className="mobile-wrap" style={{ transform: "scale(" + scale + ")" }}>
      <IOSDevice width={390} height={844}>{children}</IOSDevice>
    </div>
  );
}

function ReaderStage() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  const stageClass =
    "stage" +
    (t.surface === "desktop" ? " solo-desktop" :
     t.surface === "mobile"  ? " solo-mobile"  : "");

  return (
    <div className={stageClass}>
      <window.KeyboardHost tweaks={t} setTweak={setTweak}/>
      {t.surface !== "mobile" && (
        <div className="stage-col stage-col-desktop">
          <span className="stage-label">Web · Lector (focused, sin sidebar)</span>
          <div className="desktop-frame">
            <WebReader tweaks={t} setTweak={setTweak}/>
          </div>
        </div>
      )}
      {t.surface !== "desktop" && (
        <div className="stage-col stage-col-mobile">
          <span className="stage-label">Web · Móvil (iPhone 14 Pro)</span>
          <MobileFrame scale={t.surface === "mobile" ? 1 : 0.88}>
            <MobileReader tweaks={t} setTweak={setTweak}/>
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

        <window.TweakSection label="Modo de lectura" />
        <window.TweakRadio
          label="Modo"
          value={t.mode}
          options={MODE_OPTS}
          onChange={(v) => setTweak("mode", v)}
        />
        <div style={{ fontSize: 10, color: "rgba(41,38,27,.55)", lineHeight: 1.4, marginTop: -4 }}>
          {t.mode === "libro"
            ? "Solo prosa · sin audios ni ejercicios. Los bloques de Guía aparecen como teases."
            : (t.tier === "pro"
                ? "Prosa + audios + ejercicios + checklist + reflexión. Acceso completo."
                : "Modo Guía requiere Pro. Los bloques siguen apareciendo como teases.")}
        </div>

        <window.TweakSection label="Plan" />
        <window.TweakRadio
          label="Plan"
          value={t.tier}
          options={TIER_OPTS}
          onChange={(v) => setTweak("tier", v)}
        />

        <window.TweakSection label="Tipografía y tema" />
        <window.TweakRadio
          label="Papel"
          value={t.theme}
          options={THEME_OPTS}
          onChange={(v) => setTweak("theme", v)}
        />
        <window.TweakRadio
          label="Fuente del cuerpo"
          value={t.bodyFont}
          options={FONT_OPTS}
          onChange={(v) => setTweak("bodyFont", v)}
        />
        <window.TweakSlider
          label="Tamaño de texto"
          value={t.fontScale}
          min={0.9} max={1.2} step={0.05}
          onChange={(v) => setTweak("fontScale", v)}
        />

        <window.TweakSection label="Estados de demo" />
        <window.TweakToggle
          label="Banner 'Continúa'"
          value={t.resume}
          onChange={(v) => setTweak("resume", v)}
        />
        <window.TweakToggle
          label="Selección + popover"
          value={t.selection}
          onChange={(v) => setTweak("selection", v)}
        />
        <window.TweakToggle
          label="Nota al margen abierta"
          value={t.note}
          onChange={(v) => setTweak("note", v)}
        />
        <window.TweakToggle
          label="Eco conversando"
          value={t.ecoConv}
          onChange={(v) => setTweak("ecoConv", v)}
        />
        <window.TweakSelect
          label="Audio"
          value={t.audio}
          options={AUDIO_OPTS}
          onChange={(v) => setTweak("audio", v)}
        />

        <window.TweakSection label="Navegación · Web" />
        <window.TweakSelect
          label="Rail izquierdo"
          value={t.tocTab}
          options={TOC_TAB_OPTS}
          onChange={(v) => setTweak("tocTab", v)}
        />
        <window.TweakToggle
          label="Panel de subrayados (drawer)"
          value={t.annoOpen}
          onChange={(v) => setTweak("annoOpen", v)}
        />

        <window.TweakSection label="Navegación · Móvil" />
        <window.TweakSelect
          label="Sheet abierto"
          value={t.sheet}
          options={SHEET_OPTS}
          onChange={(v) => setTweak("sheet", v)}
        />

        <window.TweakSection label="Pendientes del review" />
        <window.TweakSelect
          label="Overlay"
          value={t.overlay || "none"}
          options={OVERLAY_OPTS}
          onChange={(v) => setTweak("overlay", v)}
        />
        <div style={{ fontSize: 10, color: "rgba(41,38,27,.55)", lineHeight: 1.4, marginTop: -4 }}>
          Cada overlay corresponde a un ítem del review original. Cierra haciendo clic fuera.
        </div>
        <window.TweakSelect
          label="#18 · Banner offline"
          value={t.offline || "off"}
          options={OFFLINE_OPTS}
          onChange={(v) => setTweak("offline", v)}
        />
        <window.TweakToggle
          label="#14 · Cierre de capítulo enriquecido"
          value={!!t.chapterEndRich}
          onChange={(v) => setTweak("chapterEndRich", v)}
        />

        <window.TweakSection label="Nuevos pendientes" />
        <window.TweakSlider
          label="#3 · Onboarding (paso 0 = oculto)"
          value={typeof t.onboardingStep === "number" ? t.onboardingStep : 0}
          min={0} max={3} step={1}
          onChange={(v) => setTweak("onboardingStep", v)}
        />
        <window.TweakToggle
          label="#17 · Sample mode (muestra gratuita)"
          value={!!t.sampleMode}
          onChange={(v) => {
            setTweak("sampleMode", v);
            if (v) setTweak("tier", "free");
          }}
        />
        <window.TweakToggle
          label="#6 · Eco con citaciones"
          value={t.ecoCitations !== false}
          onChange={(v) => setTweak("ecoCitations", v)}
        />
        <div style={{ fontSize: 10, color: "rgba(41,38,27,.55)", lineHeight: 1.4, marginTop: -4 }}>
          #1 (selección móvil) aparece automáticamente con surface=móvil y "Selección + popover" activo.
        </div>

        <window.TweakSection label="Lectura avanzada" />
        <window.TweakToggle
          label="#2 · Editor de subrayado abierto"
          value={!!t.editHighlight}
          onChange={(v) => setTweak("editHighlight", v)}
        />
        <window.TweakToggle
          label="#11 · Regla de lectura"
          value={!!t.readingRule}
          onChange={(v) => setTweak("readingRule", v)}
        />
        <window.TweakSelect
          label="#11 · Márgenes"
          value={t.margins || "medium"}
          options={[
            { value: "narrow", label: "Estrechos" },
            { value: "medium", label: "Cómodos" },
            { value: "wide",   label: "Amplios" },
          ]}
          onChange={(v) => setTweak("margins", v)}
        />
        <window.TweakToggle label="#11 · Justificar texto" value={!!t.justify} onChange={(v) => setTweak("justify", v)}/>
        <window.TweakToggle label="#11 · Hyphenation"     value={!!t.hyphens} onChange={(v) => setTweak("hyphens", v)}/>
        <window.TweakSlider
          label="#11 · Altura de línea"
          value={t.lineHeight || 1.6}
          min={1.3} max={2.0} step={0.05}
          onChange={(v) => setTweak("lineHeight", v)}
        />

        <window.TweakSection label="Accesibilidad (#12)" />
        <window.TweakToggle label="Alto contraste"      value={!!t.highContrast}  onChange={(v) => setTweak("highContrast", v)}/>
        <window.TweakToggle label="Fuente OpenDyslexic" value={!!t.dyslexicFont}  onChange={(v) => setTweak("dyslexicFont", v)}/>
        <window.TweakToggle label="Espaciado generoso"  value={!!t.spaciousType}  onChange={(v) => setTweak("spaciousType", v)}/>
        <window.TweakToggle label="Reducir animaciones" value={!!t.reducedMotion} onChange={(v) => setTweak("reducedMotion", v)}/>
        <window.TweakToggle label="Botones grandes"     value={!!t.largeTargets}  onChange={(v) => setTweak("largeTargets", v)}/>
        <window.TweakToggle label="Indicadores de foco" value={!!t.focusRings}    onChange={(v) => setTweak("focusRings", v)}/>

        <window.TweakSection label="Racha y meta (#15)" />
        <window.TweakToggle
          label="Mostrar chip en topbar"
          value={t.showStreak !== false}
          onChange={(v) => setTweak("showStreak", v)}
        />
        <window.TweakSlider label="Racha (días)"      value={t.streakDays || 7} min={0} max={45} step={1} onChange={(v) => setTweak("streakDays", v)}/>
        <window.TweakSlider label="Meta diaria (min)" value={t.goalMin || 15}    min={5} max={60} step={5} onChange={(v) => setTweak("goalMin", v)}/>
        <window.TweakSlider label="Leídos hoy (min)"  value={t.todayMin || 0}    min={0} max={60} step={1} onChange={(v) => setTweak("todayMin", v)}/>

        <window.TweakSection label="Audio y atajos" />
        <window.TweakToggle
          label="#13 · Atajos de teclado activos"
          value={t.kbShortcuts !== false}
          onChange={(v) => setTweak("kbShortcuts", v)}
        />
        <window.TweakToggle
          label="#16 · Capítulos recomendados en cierre"
          value={t.recommendedChapters !== false}
          onChange={(v) => setTweak("recommendedChapters", v)}
        />
        <window.TweakToggle
          label="#19 · Calor de la comunidad inline"
          value={t.communityHeat !== false}
          onChange={(v) => setTweak("communityHeat", v)}
        />
        <window.TweakToggle
          label="#20 · Mini-bar de TTS visible"
          value={!!t.ttsActive}
          onChange={(v) => setTweak("ttsActive", v)}
        />
      </window.TweaksPanel>
    </div>
  );
}

window.ReaderStage = ReaderStage;
