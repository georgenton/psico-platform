// terapia/app.jsx — Stage + Tweaks para las 7 pantallas de Terapia.

const { WebTerapia, MobileTerapia, IOSDevice } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "screen":    "hub",
  "surface":   "both",
  "hubStyle":  "calmado"
}/*EDITMODE-END*/;

const SCREENS = [
  { value: "hub",           label: "1 · Hub" },
  { value: "dir",           label: "2 · Directorio" },
  { value: "prof",          label: "3 · Perfil terapeuta" },
  { value: "book",          label: "4 · Reserva (3 pasos)" },
  { value: "prep",          label: "5 · Pre-sesión" },
  { value: "sessions",      label: "6 · Mis sesiones" },
  { value: "post",          label: "7 · Post-sesión" },
  { value: "room",          label: "8 · Sala de videollamada" },
  { value: "onboarding",    label: "9 · Onboarding terapéutico" },
  { value: "crisis",        label: "10 · Apoyo inmediato" },
  { value: "match",         label: "11 · Matching asistido" },
  { value: "progress",      label: "12 · Tu camino · progreso" },
  { value: "notifs",        label: "13 · Notificaciones" },
  { value: "prescriptions", label: "14 · Lo que Marina sugirió" },
  { value: "cancel",        label: "15 · Mover / cancelar sesión" },
  { value: "therapist",     label: "16 · Vista terapeuta (Marina)" },
  { value: "b2b-user",      label: "17 · B2B · Mi beneficio" },
  { value: "b2b-admin",     label: "18 · B2B · Dashboard empleador" },
];

const SURFACE_OPTS = [
  { value: "both",    label: "Lado a lado" },
  { value: "desktop", label: "Escritorio" },
  { value: "mobile",  label: "Móvil" },
];

const SCREEN_LABEL = {
  hub:           "Hub de Terapia",
  dir:           "Directorio de terapeutas",
  prof:          "Perfil del terapeuta",
  book:          "Flujo de reserva",
  prep:          "Pre-sesión · preparación",
  sessions:      "Mis sesiones",
  post:          "Post-sesión + seguimiento",
  room:          "Sala de videollamada",
  onboarding:    "Onboarding terapéutico",
  crisis:        "Apoyo inmediato · crisis",
  match:         "Matching asistido",
  progress:      "Tu camino · progreso longitudinal",
  notifs:        "Notificaciones",
  prescriptions: "Mi camino con Marina · recetas",
  cancel:        "Mover o cancelar sesión",
  therapist:     "Vista terapeuta · Marina",
  "b2b-user":    "B2B · beneficio del paciente",
  "b2b-admin":   "B2B · dashboard del empleador",
};
const SCREEN_NUM = {
  hub: "01", dir: "02", prof: "03", book: "04",
  prep: "05", sessions: "06", post: "07",
  room: "08", onboarding: "09", crisis: "10", match: "11",
  progress: "12", notifs: "13", prescriptions: "14", cancel: "15",
  therapist: "16", "b2b-user": "17", "b2b-admin": "18",
};

function MobileFrame({ children, scale = 0.84 }) {
  return (
    <div className="mobile-wrap" style={{ transform: "scale(" + scale + ")" }}>
      <IOSDevice width={390} height={844}>{children}</IOSDevice>
    </div>
  );
}

function TerapiaStage() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  const stageClass =
    "stage" +
    (t.surface === "desktop" ? " solo-desktop" :
     t.surface === "mobile"  ? " solo-mobile"  : "");

  return (
    <div className={stageClass}>
      {t.surface !== "mobile" && (
        <div className="stage-col stage-col-desktop">
          <span className="stage-label">
            <span className="stage-label-step">{SCREEN_NUM[t.screen]}</span>
            {SCREEN_LABEL[t.screen]} · Web (≥1024px)
          </span>
          <div className="desktop-frame">
            <WebTerapia tweaks={t} setTweak={setTweak}/>
          </div>
        </div>
      )}
      {t.surface !== "desktop" && (
        <div className="stage-col stage-col-mobile">
          <span className="stage-label">
            <span className="stage-label-step">{SCREEN_NUM[t.screen]}</span>
            {SCREEN_LABEL[t.screen]} · Móvil
          </span>
          <MobileFrame scale={t.surface === "mobile" ? 1 : 0.84}>
            <MobileTerapia tweaks={t} setTweak={setTweak}/>
          </MobileFrame>
        </div>
      )}

      <window.TweaksPanel>
        <window.TweakSection label="Pantalla" />
        <window.TweakSelect
          label="Mostrar"
          value={t.screen}
          options={SCREENS}
          onChange={(v) => setTweak("screen", v)}
        />
        <div style={{
          marginTop: 4,
          fontSize: 10, color: "rgba(41,38,27,.55)", lineHeight: 1.45,
        }}>
          Las 7 pantallas comparten datos y navegan entre sí — los CTAs
          también cambian de pantalla, no solo este selector.
        </div>

        <window.TweakSection label="Superficie" />
        <window.TweakRadio
          label="Vista"
          value={t.surface}
          options={SURFACE_OPTS}
          onChange={(v) => setTweak("surface", v)}
        />
      </window.TweaksPanel>
    </div>
  );
}

window.TerapiaStage = TerapiaStage;
