// assets/icons.jsx
// Iconos para sidebars de escritorio en todas las superficies.
// Estilo: Lucide-inspirado — trazo 1.75 currentColor, caps y joins redondeados,
// 24×24 viewBox. Algunos detalles propios (sello "Pro" en plan, loto custom
// en terapia) para conservar la calidez del sistema.

const __ICON_BASE = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

// ── HOME · una sola línea continua. Techo + base + puerta.
function IconHome(props) {
  return (
    <svg {...__ICON_BASE} {...props}>
      <path d="M3 11 L12 3.5 L21 11" />
      <path d="M5.5 9.5 V19.5 a1 1 0 0 0 1 1 H17.5 a1 1 0 0 0 1-1 V9.5" />
      <path d="M10 20.5 V14 H14 V20.5" />
    </svg>
  );
}

// ── BOOK · libro abierto, lomo central. Tres líneas de "página".
function IconBook(props) {
  return (
    <svg {...__ICON_BASE} {...props}>
      <path d="M3.5 5 C6 4.2 9 4.2 12 5.5 C15 4.2 18 4.2 20.5 5 V18.5 C18 17.7 15 17.7 12 19 C9 17.7 6 17.7 3.5 18.5 Z" />
      <path d="M12 5.5 V19" />
    </svg>
  );
}

// ── DIARY · libreta con espiral + dos renglones. Más cálido que un pencil.
function IconDiary(props) {
  return (
    <svg {...__ICON_BASE} {...props}>
      <path d="M7 4 H18 a1 1 0 0 1 1 1 V19 a1 1 0 0 1-1 1 H7 Z" />
      <path d="M11 9 H16" opacity="0.65" />
      <path d="M11 13 H16" opacity="0.65" />
      <path d="M11 17 H14" opacity="0.65" />
      {/* spiral binding */}
      <circle cx="7" cy="7" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="7" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="7" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── ECO · órbita conversacional. Pequeño círculo + arco grande.
//    Tono "compañero" sin caer en chat-bubble obvio.
function IconEco(props) {
  return (
    <svg {...__ICON_BASE} {...props}>
      <path d="M5 12 a7 7 0 1 0 4.5 -6.5" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── TERAPIA · loto estilizado. 3 pétalos + base curva.
//    Mantiene el simbolismo del 🪷 pero con trazo serio.
function IconTerapia(props) {
  return (
    <svg {...__ICON_BASE} {...props}>
      {/* pétalo central */}
      <path d="M12 4 C13.5 7 13.5 9.5 12 12 C10.5 9.5 10.5 7 12 4 Z" />
      {/* pétalos laterales */}
      <path d="M12 12 C9 11 6.5 9.5 5 7 C7.5 7 10 8.5 12 12 Z" />
      <path d="M12 12 C15 11 17.5 9.5 19 7 C16.5 7 14 8.5 12 12 Z" />
      {/* base / agua */}
      <path d="M5 14.5 C7.5 16 10 16.5 12 16.5 C14 16.5 16.5 16 19 14.5" />
      <path d="M5 17.5 C7.5 19 10 19.5 12 19.5 C14 19.5 16.5 19 19 17.5" opacity="0.55" />
    </svg>
  );
}

// ── PLAN · diamante (Pro). Líneas que sugieren faceta.
function IconPlan(props) {
  return (
    <svg {...__ICON_BASE} {...props}>
      <path d="M5.5 9 L8.5 4.5 H15.5 L18.5 9 L12 20 Z" />
      <path d="M5.5 9 H18.5" opacity="0.65" />
      <path d="M8.5 4.5 L12 9 L15.5 4.5" opacity="0.65" />
      <path d="M8.5 9 L12 20" opacity="0.45" />
      <path d="M15.5 9 L12 20" opacity="0.45" />
    </svg>
  );
}

// ── USER · cabeza + hombros. Curva inferior abierta.
function IconUser(props) {
  return (
    <svg {...__ICON_BASE} {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20 C5 16 8 14 12 14 C16 14 19 16 19.5 20" />
    </svg>
  );
}

// ── PEOPLE · dos cabezas + cuerpo compartido. Para "pacientes".
function IconPeople(props) {
  return (
    <svg {...__ICON_BASE} {...props}>
      <circle cx="9" cy="8.5" r="2.8" />
      <circle cx="16.5" cy="9" r="2.3" />
      <path d="M3.5 19.5 C4 16 6.5 14.5 9 14.5 C11 14.5 13 15.5 14 17.5" />
      <path d="M14.5 19.5 C15 16.5 17 15 19 15.5 C20 15.8 20.5 16.5 20.5 17.5" opacity="0.7" />
    </svg>
  );
}

// ── CHART · barras de altura distinta. Back-office / dashboard.
function IconChart(props) {
  return (
    <svg {...__ICON_BASE} {...props}>
      <path d="M4 20 H20" />
      <path d="M7 20 V13" />
      <path d="M12 20 V8" />
      <path d="M17 20 V15" />
    </svg>
  );
}

// ── INBOX · bandeja con tapa abierta.
function IconInbox(props) {
  return (
    <svg {...__ICON_BASE} {...props}>
      <path d="M4 13 V19 a1 1 0 0 0 1 1 H19 a1 1 0 0 0 1-1 V13" />
      <path d="M4 13 L6.5 5.5 a1 1 0 0 1 1-0.5 H16.5 a1 1 0 0 1 1 0.5 L20 13" />
      <path d="M4 13 H8.5 L9.5 15 H14.5 L15.5 13 H20" />
    </svg>
  );
}

// ── CALENDAR · cuadro + 2 ganchos arriba + un renglón.
function IconCalendar(props) {
  return (
    <svg {...__ICON_BASE} {...props}>
      <path d="M4 7 a1 1 0 0 1 1-1 H19 a1 1 0 0 1 1 1 V19 a1 1 0 0 1-1 1 H5 a1 1 0 0 1-1-1 Z" />
      <path d="M8 4 V8" />
      <path d="M16 4 V8" />
      <path d="M4 11 H20" />
    </svg>
  );
}

// ── SETTINGS · engranaje simplificado (6 dientes).
function IconSettings(props) {
  return (
    <svg {...__ICON_BASE} {...props}>
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 3.5 V6.2 M12 17.8 V20.5 M3.5 12 H6.2 M17.8 12 H20.5 M5.5 5.5 L7.5 7.5 M16.5 16.5 L18.5 18.5 M5.5 18.5 L7.5 16.5 M16.5 7.5 L18.5 5.5" />
    </svg>
  );
}

// ── HELP · pregunta envuelta. Para "ayuda" / "sobre".
function IconHelp(props) {
  return (
    <svg {...__ICON_BASE} {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.5 9.5 a2.5 2.5 0 0 1 5 0 c0 1.5 -2.5 1.5 -2.5 3.5" />
      <circle cx="12" cy="16.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── LOG OUT · puerta + flecha.
function IconLogout(props) {
  return (
    <svg {...__ICON_BASE} {...props}>
      <path d="M14 4 H6 a1 1 0 0 0-1 1 V19 a1 1 0 0 0 1 1 H14" />
      <path d="M11 12 H20" />
      <path d="M17 9 L20 12 L17 15" />
    </svg>
  );
}

// ── PATRONES · círculos concéntricos. Sugiere repetición / patrón.
function IconPatrones(props) {
  return (
    <svg {...__ICON_BASE} {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" opacity="0.65" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── RUTAS · sendero serpenteante. Curva que sube de izquierda a derecha.
function IconRutas(props) {
  return (
    <svg {...__ICON_BASE} {...props}>
      <path d="M4 18 C 6.5 18, 7 12, 10 12 C 13 12, 13.5 6, 16 6 L 20 6" />
      <circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="20" cy="6"  r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── BELL · campana de notificaciones. Badaja redonda + cuerpo cuadrado-redondo.
function IconBell(props) {
  return (
    <svg {...__ICON_BASE} {...props}>
      <path d="M5.5 16.5 C 7 14.5, 7 12, 7 10 a5 5 0 0 1 10 0 c0 2, 0 4.5, 1.5 6.5 Z" />
      <path d="M10 19.5 a2 2 0 0 0 4 0" />
    </svg>
  );
}

// Export to window for cross-file consumption
window.Icons = {
  home:     IconHome,
  book:     IconBook,
  diary:    IconDiary,
  eco:      IconEco,
  terapia:  IconTerapia,
  plan:     IconPlan,
  user:     IconUser,
  people:   IconPeople,
  chart:    IconChart,
  inbox:    IconInbox,
  calendar: IconCalendar,
  settings: IconSettings,
  help:     IconHelp,
  logout:   IconLogout,
  patrones: IconPatrones,
  rutas:    IconRutas,
  bell:     IconBell,
};
