// terapia/data.js — Datos para las 7 pantallas de Terapia.

window.T_USER = {
  firstName: "Ana",
  city: "Quito",
  initials: "A",
};

// ─────────────────────────────────────────────────────────
// MOTIVOS DE CONSULTA (paso 1 del flujo de reserva)
// ─────────────────────────────────────────────────────────
window.T_MOTIVOS = [
  { id: "ansiedad",   glyph: "◐", label: "Ansiedad",                 sub: "Pensamientos en bucle, tensión, no parar." },
  { id: "tristeza",   glyph: "◑", label: "Tristeza o vacío",         sub: "Energía baja, sin ganas, días planos." },
  { id: "relaciones", glyph: "◓", label: "Pareja o familia",         sub: "Conflictos, distancia, comunicación." },
  { id: "duelo",      glyph: "◒", label: "Pérdida o duelo",          sub: "Una ausencia que pesa más de lo que pensé." },
  { id: "trabajo",    glyph: "◔", label: "Trabajo o estudios",       sub: "Agotamiento, decisiones, presión." },
  { id: "identidad",  glyph: "◕", label: "Identidad o sentido",      sub: "Quién soy, qué quiero, hacia dónde." },
  { id: "habitos",    glyph: "◖", label: "Hábitos o sueño",          sub: "Dormir, comer, redes, sostener cambios." },
  { id: "explorar",   glyph: "○", label: "Aún no lo sé · solo explorar", sub: "Está bien venir sin un titular." },
];

// ─────────────────────────────────────────────────────────
// TERAPEUTAS — el directorio
// Foto = inicial sobre gradiente (mismo recurso que portadas)
// ─────────────────────────────────────────────────────────
window.T_THERAPISTS = [
  {
    id: "marina-salazar",
    name: "Dra. Marina Salazar",
    initials: "MS",
    cover: "cool",
    title: "Psicóloga clínica · 12 años",
    pais: "Ecuador",
    licencia: "Senescyt · 1027-2014",
    enfoques: ["Terapia cognitivo-conductual", "ACT"],
    especialidades: ["Ansiedad", "Identidad", "Adultos jóvenes"],
    idiomas: ["Español"],
    modalidad: ["Video", "Chat"],
    price: 38,
    currency: "USD",
    duration: 50,
    rating: 4.9,
    reviews: 142,
    nextSlot: "hoy · 19:00",
    blurb: "Trabajo con personas que sienten que su cabeza no se apaga. Sin manual; con preguntas que abren camino.",
    longBio: "Soy psicóloga clínica formada en la UDLA con maestría en Terapia Cognitivo-Conductual por la UNED (España). Llevo doce años acompañando a personas que cargan ansiedad, pensamientos rumiantes o crisis de identidad — sobre todo adultos jóvenes en transiciones. Mi enfoque es activo: hacemos pausas, encontramos patrones, y construimos pequeñas prácticas que sostengan el cambio fuera de la sesión. Hablamos en español, sin jerga.",
    quote: "No tengo recetas. Tengo preguntas, un par de marcos, y mucha paciencia.",
    isAutor: true,
  },
  {
    id: "tomas-aguilar",
    name: "Tomás Aguilar",
    initials: "TA",
    cover: "warm",
    title: "Psicólogo · 8 años",
    pais: "Colombia",
    licencia: "RETHUS · CO-2031",
    enfoques: ["Terapia centrada en la persona", "Mindfulness"],
    especialidades: ["Relaciones", "Pareja", "Duelo"],
    idiomas: ["Español"],
    modalidad: ["Video"],
    price: 32,
    currency: "USD",
    duration: 50,
    rating: 4.8,
    reviews: 89,
    nextSlot: "mañana · 09:00",
    blurb: "Lo que pasa entre dos personas siempre dice algo de lo que pasa dentro de cada una.",
    longBio: "Psicólogo de la Universidad de los Andes con formación en terapia de pareja (Gottman Method, nivel 2). He acompañado a más de doscientas parejas y a personas que atraviesan duelos de distintas formas — separación, muerte, mudanza. Trabajo despacio, escucho mucho, hablo poco al principio.",
    quote: "Vine a esto porque me importa entender, no resolver rápido.",
  },
  {
    id: "valeria-roca",
    name: "Dra. Valeria Roca",
    initials: "VR",
    cover: "mixed",
    title: "Psicóloga · 15 años",
    pais: "México",
    licencia: "Cédula · MX-7740",
    enfoques: ["Sistémica", "EMDR"],
    especialidades: ["Trauma", "Familia", "Duelo"],
    idiomas: ["Español"],
    modalidad: ["Video", "Chat"],
    price: 45,
    currency: "USD",
    duration: 50,
    rating: 4.9,
    reviews: 213,
    nextSlot: "vie · 16:00",
    blurb: "Cuerpo, historia familiar y palabras: trabajo con los tres a la vez.",
    longBio: "Psicóloga clínica, máster en terapia sistémica (UAM) y certificada en EMDR (Niveles I y II). Trabajo con personas que cargan eventos que el cuerpo no terminó de procesar — accidentes, separaciones, pérdidas tempranas. La sesión es estructurada pero suave.",
    quote: "El cuerpo recuerda. Mi trabajo es ayudarte a que recuerde sin que te queme.",
  },
  {
    id: "joaquin-luna",
    name: "Joaquín Luna",
    initials: "JL",
    cover: "cool",
    title: "Psicólogo · 6 años",
    pais: "Argentina",
    licencia: "MP · AR-12455",
    enfoques: ["Psicoanálisis lacaniano", "Breve"],
    especialidades: ["Identidad", "Hombres", "Trabajo"],
    idiomas: ["Español"],
    modalidad: ["Video"],
    price: 28,
    currency: "USD",
    duration: 50,
    rating: 4.7,
    reviews: 64,
    nextSlot: "jue · 21:00",
    blurb: "Para los que llegan diciendo 'no sé bien qué me pasa'. Esa es buena puerta.",
    longBio: "Psicólogo de la UBA, en formación continua dentro del psicoanálisis lacaniano. Trabajo con hombres adultos que llegan con preguntas sobre quiénes son fuera de los roles que se les pidió ocupar — proveedor, hijo, jefe, pareja. Sesiones nocturnas disponibles.",
    quote: "Lo que no se dice no deja de operar — solo opera peor.",
  },
];

// ─────────────────────────────────────────────────────────
// SLOTS DE CALENDARIO (paso 2 del flujo de reserva)
// ─────────────────────────────────────────────────────────
window.T_WEEK = [
  { date: "20", day: "mar", month: "may", label: "Hoy",     slots: ["19:00", "20:00"], hot: true },
  { date: "21", day: "mié", month: "may", label: "Mañana",  slots: ["09:00", "11:00", "15:00", "19:00"] },
  { date: "22", day: "jue", month: "may", label: "Jueves",  slots: ["10:00", "16:00", "21:00"] },
  { date: "23", day: "vie", month: "may", label: "Viernes", slots: ["09:00", "16:00", "20:00"] },
  { date: "24", day: "sáb", month: "may", label: "Sábado",  slots: [] },
  { date: "25", day: "dom", month: "may", label: "Domingo", slots: ["18:00"] },
  { date: "26", day: "lun", month: "may", label: "Lunes",   slots: ["09:00", "11:00", "19:00"] },
];

// ─────────────────────────────────────────────────────────
// SESIONES DEL USUARIO
// ─────────────────────────────────────────────────────────
window.T_NEXT_SESSION = {
  therapistId: "marina-salazar",
  therapistName: "Dra. Marina Salazar",
  therapistInitials: "MS",
  cover: "cool",
  dateLabel: "Hoy · 20 may",
  dayLong: "martes 20 de mayo",
  time: "19:00",
  timeUntil: "en 2 horas 14 min",
  modalidad: "Videollamada",
  duration: 50,
  prep: {
    ready: 2,
    total: 4,
  },
};

window.T_SESSIONS_PAST = [
  {
    id: "s-202",
    date: "13 may · martes",
    time: "19:00",
    therapistId: "marina-salazar",
    therapistName: "Dra. Marina Salazar",
    cover: "cool",
    duration: 50,
    title: "Sesión 4 · Patrón del 'tengo que'",
    snippet: "Notamos que el 'tengo que' aparece sobre todo los domingos por la tarde — y casi nunca solo.",
    hasNotes: true,
  },
  {
    id: "s-201",
    date: "6 may · martes",
    time: "19:00",
    therapistId: "marina-salazar",
    therapistName: "Dra. Marina Salazar",
    cover: "cool",
    duration: 50,
    title: "Sesión 3 · Pausar antes de responder",
    snippet: "Practicamos la pausa de 3 respiraciones. Quedó como tarea para la semana de trabajo.",
    hasNotes: true,
  },
  {
    id: "s-200",
    date: "29 abr · martes",
    time: "19:00",
    therapistId: "marina-salazar",
    therapistName: "Dra. Marina Salazar",
    cover: "cool",
    duration: 50,
    title: "Sesión 2 · Mapeo de la semana intensa",
    snippet: "Repasamos qué pasó el martes y por qué ese día sentiste que se desbordaba todo.",
    hasNotes: true,
  },
];

// ─────────────────────────────────────────────────────────
// PRE-SESIÓN — checklist + preparación
// ─────────────────────────────────────────────────────────
window.T_PREP_ITEMS = [
  {
    id: "intencion",
    kind: "intencion",
    title: "Una intención para hoy",
    sub: "Una sola frase. Marina la lee antes de empezar.",
    state: "done",
    answer: "Quiero entender por qué los domingos me cuesta tanto, en vez de pelearme con eso.",
  },
  {
    id: "estado",
    kind: "estado",
    title: "Cómo llegas hoy",
    sub: "Un check-in rápido — humor + energía.",
    state: "done",
    answer: "Cansada · pensando demasiado",
  },
  {
    id: "diario",
    kind: "diario",
    title: "Compartir entradas del diario",
    sub: "Eliges qué entradas Marina ve antes de la sesión.",
    state: "pending",
    pendingLabel: "3 entradas sin marcar",
  },
  {
    id: "ejercicio",
    kind: "ejercicio",
    title: "Ejercicio sugerido · 5 min",
    sub: "Aterrizar en el cuerpo, antes de hablar.",
    state: "optional",
    optionalLabel: "Sugerido por Marina",
  },
];

window.T_DIARY_ENTRIES = [
  { id: "d-118", date: "domingo, 18 may", time: "22:14", mood: "tristeza", title: "El domingo otra vez", excerpt: "Llevo todo el día con la sensación de que algo se va a romper y no sé qué.", picked: true },
  { id: "d-115", date: "viernes, 16 may", time: "08:02", mood: "energia",  title: "Mañana clara",     excerpt: "Algo se acomodó. No sé si dura, pero hoy puedo respirar.", picked: false },
  { id: "d-112", date: "miércoles, 14 may", time: "13:40", mood: "ansiedad", title: "La reunión", excerpt: "La pausa de 3 respiraciones funcionó. Una vez. La segunda no me acordé.", picked: true },
];

// ─────────────────────────────────────────────────────────
// POST-SESIÓN — seguimiento + sugerencias del catálogo
// ─────────────────────────────────────────────────────────
window.T_POST_TAGS = [
  { id: "aliviada",  label: "Más liviana" },
  { id: "pensativa", label: "Pensativa" },
  { id: "removida",  label: "Removida" },
  { id: "esperanza", label: "Con esperanza" },
  { id: "cansada",   label: "Cansada" },
  { id: "confundida",label: "Confundida" },
];

window.T_POST_HOMEWORK = {
  fromTherapist: "Dra. Marina Salazar",
  body: "Esta semana — solo notar, sin cambiar nada — en qué momentos aparece el 'tengo que'. Una palabra en el diario es suficiente.",
};

window.T_POST_RECOS = [
  {
    type: "chapter",
    cover: "cool",
    title: "Cap. 5 · Tristeza no es debilidad",
    author: "Emociones en construcción",
    reason: "Marina lo sugirió en la sesión para esta semana.",
    cta: "Abrir capítulo",
    fromTherapist: true,
  },
  {
    type: "exercise",
    cover: "mixed",
    title: "Ejercicio · Mapa del domingo",
    author: "Eco · 12 min",
    reason: "Conecta con la práctica del 'tengo que'.",
    cta: "Empezar ejercicio",
  },
  {
    type: "audio",
    cover: "warm",
    title: "Audio · Pausa de 3 respiraciones",
    author: "Eco · 4 min",
    reason: "Para los momentos en que vuelve la prisa.",
    cta: "Reproducir",
  },
];

// ─────────────────────────────────────────────────────────
// HUB — bullets de cómo funciona, testimonios cortos
// ─────────────────────────────────────────────────────────
window.T_HOW = [
  { num: "01", title: "Cuéntanos qué te trae",  sub: "Una pregunta, un motivo, o solo curiosidad. No hay manera incorrecta de empezar." },
  { num: "02", title: "Elige terapeuta y hora", sub: "Filtra por enfoque o modalidad. Verás disponibilidad real en tu zona horaria." },
  { num: "03", title: "Sesión de 50 min · video", sub: "Desde el navegador o la app. Sin descargas, sin sala de espera." },
  { num: "04", title: "Sigue creciendo entre sesiones", sub: "Tu terapeuta puede sugerir lecturas, audios o ejercicios del catálogo." },
];

window.T_FAQ = [
  { q: "¿Puedo elegir terapeuta?", a: "Sí, siempre. Verás bio, enfoque, idiomas y reseñas antes de reservar." },
  { q: "¿Y si no encaja?",         a: "Cambias sin costo en la siguiente sesión. La primera reserva tiene 30 min de cortesía si lo necesitas." },
  { q: "¿Es confidencial?",        a: "Sí. Lo que escribas en el diario no es visible para tu terapeuta a menos que tú decidas compartirlo." },
  { q: "¿Cubre mi seguro?",        a: "Pronto. Por ahora, recibirás factura para reembolso si aplica en tu país." },
];

// ─────────────────────────────────────────────────────────
// Días de la semana
// ─────────────────────────────────────────────────────────
window.T_WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

// ═════════════════════════════════════════════════════════
// EXPANSIÓN · Pantallas 8–11
// ═════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
// CRISIS — líneas de emergencia por país + recursos calmados
// ─────────────────────────────────────────────────────────
window.T_CRISIS_LINES = [
  {
    country: "Ecuador",
    flag: "🇪🇨",
    isUser: true,
    lines: [
      { name: "ECU 911 — Emergencias",       phone: "911",       hours: "24/7", kind: "emergency" },
      { name: "Línea de apoyo psicosocial",  phone: "171",       hours: "24/7", kind: "support" },
      { name: "Salud mental MSP",            phone: "1-800-362-784", hours: "Lun–Dom · 08:00–20:00", kind: "support" },
    ],
  },
  {
    country: "Colombia",
    flag: "🇨🇴",
    lines: [
      { name: "Línea 106 · Bogotá",          phone: "106",       hours: "24/7", kind: "support" },
      { name: "Línea 123 — Emergencias",     phone: "123",       hours: "24/7", kind: "emergency" },
    ],
  },
  {
    country: "México",
    flag: "🇲🇽",
    lines: [
      { name: "SAPTEL · Locatel",            phone: "55-5259-8121", hours: "24/7", kind: "support" },
      { name: "911 — Emergencias",            phone: "911",       hours: "24/7", kind: "emergency" },
    ],
  },
  {
    country: "Argentina",
    flag: "🇦🇷",
    lines: [
      { name: "Centro Asistencia al Suicida", phone: "135",       hours: "24/7", kind: "support" },
      { name: "SAME — Emergencias",          phone: "107",       hours: "24/7", kind: "emergency" },
    ],
  },
  {
    country: "España",
    flag: "🇪🇸",
    lines: [
      { name: "Teléfono de la Esperanza",    phone: "717-003-717", hours: "24/7", kind: "support" },
      { name: "024 — Conducta suicida",      phone: "024",       hours: "24/7", kind: "emergency" },
    ],
  },
];

window.T_CRISIS_GROUNDING = [
  { glyph: "◐", title: "Respiración 4-7-8",     sub: "4 min · guía de Eco en audio" },
  { glyph: "◑", title: "Aterrizar 5-4-3-2-1",   sub: "Mira, toca, escucha — vuelve al ahora" },
  { glyph: "◓", title: "Caja de calma",          sub: "Lo que ya te funcionó otras veces" },
];

window.T_CRISIS_NEXT = [
  { kind: "now",  label: "Marina · Próxima cita en 2 días", action: "Adelantar a hoy 19:00" },
  { kind: "chat", label: "Chat con un terapeuta de guardia", action: "Conectar ahora · 1–5 min" },
];

// ─────────────────────────────────────────────────────────
// ONBOARDING TERAPÉUTICO — admisión clínica (4 pasos)
// ─────────────────────────────────────────────────────────
window.T_ONBOARD_STEPS = [
  {
    id: "etapa",
    eyebrow: "Paso 1 de 4",
    title: "Antes que nada — ¿qué tan reciente es esto para ti?",
    sub: "No hay respuestas correctas. Solo nos ayuda a saber cómo recibirte.",
    kind: "choice",
    options: [
      { id: "first",   label: "Es mi primera vez en terapia",          sub: "Llegas con preguntas — está bien." },
      { id: "before",  label: "Estuve en terapia antes, hace un tiempo", sub: "Vuelves después de una pausa." },
      { id: "current", label: "Estoy en terapia con alguien más",       sub: "Buscas una segunda opinión o un cambio." },
      { id: "pause",   label: "Hice una pausa larga, listo para retomar", sub: "Algo cambió y quieres volver." },
    ],
  },
  {
    id: "salud",
    eyebrow: "Paso 2 de 4",
    title: "¿Tomas algún medicamento para salud mental o emocional?",
    sub: "Para que tu terapeuta sepa el contexto. Esto es opcional y privado.",
    kind: "choice",
    options: [
      { id: "no",       label: "No tomo medicación",            sub: "" },
      { id: "yes-psy",  label: "Sí — recetada por psiquiatra",  sub: "Te preguntaremos cuál en sesión, si quieres compartir." },
      { id: "yes-other",label: "Sí — recetada por otro médico", sub: "Familiar, GP, neurólogo, etc." },
      { id: "considering", label: "Lo estoy considerando",      sub: "Tu terapeuta puede ayudarte a pensarlo." },
      { id: "prefer-no", label: "Prefiero no decirlo ahora",    sub: "Está bien — puedes contarlo en sesión." },
    ],
  },
  {
    id: "urgencia",
    eyebrow: "Paso 3 de 4 — importante",
    title: "¿Hay algo que sientes urgente compartir?",
    sub: "Si marcas algo aquí, te asignamos una primera sesión en las próximas 48 h y verás líneas de apoyo inmediato.",
    kind: "multi",
    options: [
      { id: "ideacion",  label: "Pensamientos de hacerme daño", sub: "Recibirás apoyo prioritario." },
      { id: "duelo",     label: "Una pérdida reciente o duelo", sub: "" },
      { id: "violencia", label: "Estoy en una situación de violencia o miedo", sub: "" },
      { id: "ataque",    label: "Tengo ataques de pánico frecuentes", sub: "" },
      { id: "nada",      label: "Nada urgente — solo quiero empezar", sub: "" },
    ],
  },
  {
    id: "preferencias",
    eyebrow: "Paso 4 de 4",
    title: "¿Qué le facilitaría conectar con tu terapeuta?",
    sub: "Opcional. Cualquier preferencia ayuda — y siempre puedes cambiar terapeuta sin costo.",
    kind: "preferences",
    options: [
      { id: "genero",   label: "Género del terapeuta",       value: "Cualquiera",       options: ["Cualquiera", "Mujer", "Hombre", "No binarie"] },
      { id: "edad",     label: "Etapa de vida",              value: "20s–30s",          options: ["Adolescente", "20s–30s", "30s–50s", "50+"] },
      { id: "enfoque",  label: "Estilo de sesión",           value: "No estoy segura",  options: ["No estoy segura", "Estructurado, con tareas", "Conversacional, exploratorio"] },
      { id: "horario",  label: "Mejor horario",              value: "Tarde / noche",    options: ["Mañana", "Mediodía", "Tarde / noche", "Fines de semana"] },
    ],
  },
];

// ─────────────────────────────────────────────────────────
// MATCHING ASISTIDO — alternativa al directorio
// 5 preguntas conversacionales → 3 sugerencias con razones
// ─────────────────────────────────────────────────────────
window.T_MATCH_QUESTIONS = [
  {
    id: "tema",
    title: "¿Cuál es el tema principal hoy?",
    sub: "Solo uno. Lo demás aparecerá en sesión.",
    options: [
      { id: "ansiedad",   label: "Ansiedad o pensamientos en bucle", glyph: "◐" },
      { id: "tristeza",   label: "Tristeza, vacío, ánimo bajo",      glyph: "◑" },
      { id: "relaciones", label: "Pareja, familia o relaciones",     glyph: "◓" },
      { id: "trabajo",    label: "Trabajo, estudios, agotamiento",   glyph: "◔" },
      { id: "identidad",  label: "Quién soy, hacia dónde voy",       glyph: "◕" },
      { id: "duelo",      label: "Pérdida o duelo",                  glyph: "◒" },
    ],
  },
  {
    id: "estilo",
    title: "¿Cómo te imaginas la sesión?",
    sub: "Solo una intuición. No es definitivo.",
    options: [
      { id: "exploratorio", label: "Que me escuchen sin apurar",       glyph: "◌", sub: "Conversacional, exploratorio." },
      { id: "estructurado", label: "Con herramientas y tareas",        glyph: "▢", sub: "CBT, ACT, estructurado." },
      { id: "mixto",        label: "Un poco de cada cosa",             glyph: "◐", sub: "Marina-style, flexible." },
      { id: "noseguro",     label: "No estoy segura, ayúdame a elegir", glyph: "?", sub: "Te mostramos lo que coincide con tu tema." },
    ],
  },
  {
    id: "frecuencia",
    title: "¿Con qué frecuencia te imaginas?",
    sub: "Puedes cambiarla en cualquier momento.",
    options: [
      { id: "semanal", label: "Cada semana",       sub: "Ritmo más común al empezar." },
      { id: "quincenal", label: "Cada dos semanas", sub: "Cuando hay tiempo entre sesiones para asentar." },
      { id: "mensual", label: "Una vez al mes",    sub: "Más espaciado, seguimiento." },
      { id: "exploro", label: "Solo quiero probar una", sub: "Empieza con una y vemos." },
    ],
  },
  {
    id: "preferencia",
    title: "¿Alguna preferencia con tu terapeuta?",
    sub: "Opcional — siempre podrás cambiar.",
    options: [
      { id: "ninguna",  label: "No tengo preferencia" },
      { id: "mujer",    label: "Prefiero una mujer" },
      { id: "hombre",   label: "Prefiero un hombre" },
      { id: "lgbt",     label: "Con experiencia con personas LGBTQ+" },
    ],
  },
  {
    id: "horario",
    title: "¿Cuándo te queda mejor?",
    sub: "Hora de Quito (GMT-5). Filtramos por disponibilidad real.",
    options: [
      { id: "manana",   label: "Mañanas",     sub: "Antes de 12:00" },
      { id: "tarde",    label: "Tardes",      sub: "12:00 – 18:00" },
      { id: "noche",    label: "Noches",      sub: "Después de 18:00" },
      { id: "finde",    label: "Fines de semana", sub: "Sábados o domingos" },
    ],
  },
];

// Resultados ranqueados — explican el "por qué"
window.T_MATCH_RESULTS = [
  {
    therapistId: "marina-salazar",
    score: 96,
    matchReasons: [
      "Especialista en ansiedad y pensamientos rumiantes",
      "Estilo flexible — combina exploración con herramientas",
      "Disponible esta semana a las 19:00 (en tu horario preferido)",
    ],
    mismatch: null,
  },
  {
    therapistId: "joaquin-luna",
    score: 88,
    matchReasons: [
      "Trabaja específicamente con identidad y sentido",
      "Horarios nocturnos disponibles (jue 21:00)",
      "Precio accesible — $28/sesión",
    ],
    mismatch: "Enfoque psicoanalítico — más conversacional, menos tareas",
  },
  {
    therapistId: "valeria-roca",
    score: 81,
    matchReasons: [
      "Experiencia con trauma y duelo",
      "Excelentes reseñas (4.9 · 213)",
    ],
    mismatch: "Sin disponibilidad esta semana — primera cita en vie 16:00",
  },
];

// ─────────────────────────────────────────────────────────
// SALA DE VIDEOLLAMADA — sesión activa
// ─────────────────────────────────────────────────────────
window.T_ROOM = {
  therapistId: "marina-salazar",
  therapistName: "Dra. Marina Salazar",
  therapistInitials: "MS",
  cover: "cool",
  sessionNum: 5,
  duration: 50,
  elapsed: 18,    // minutos transcurridos
  state: "live",  // live | waiting | reconnecting | ending
  connection: "good", // good | fair | poor
  intention: "Quiero entender por qué los domingos me cuesta tanto, en vez de pelearme con eso.",
};

window.T_ROOM_NOTES_HINTS = [
  "Algo que sentí al escucharla",
  "Una palabra que me marcó",
  "Algo que quiero recordar",
  "Una pregunta que me surgió",
];

// ═════════════════════════════════════════════════════════
// EXPANSIÓN · Pantallas 12-15 (retención)
// ═════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
// PROGRESO LONGITUDINAL — vista del camino del usuario
// ─────────────────────────────────────────────────────────
window.T_PROGRESS = {
  startedAt: "27 ene 2026",
  monthsActive: 4,
  totalSessions: 8,
  chaptersDone: 3,
  diaryDays: 47,
  exercisesDone: 12,
  // Mood over time — un punto por semana (0-100, donde 50 = neutro)
  moodWeeks: [
    { week: "27 ene",  mood: 28, sessions: 0, note: "Llegaste aquí." },
    { week: "3 feb",   mood: 32, sessions: 1, note: "Primera sesión con Marina." },
    { week: "10 feb",  mood: 30, sessions: 0 },
    { week: "17 feb",  mood: 38, sessions: 1 },
    { week: "24 feb",  mood: 42, sessions: 0 },
    { week: "3 mar",   mood: 35, sessions: 1, note: "Semana intensa en el trabajo." },
    { week: "10 mar",  mood: 48, sessions: 0 },
    { week: "17 mar",  mood: 55, sessions: 1 },
    { week: "24 mar",  mood: 52, sessions: 0 },
    { week: "31 mar",  mood: 58, sessions: 1 },
    { week: "7 abr",   mood: 50, sessions: 0 },
    { week: "14 abr",  mood: 62, sessions: 1, note: "Primer 'martes liviano'." },
    { week: "21 abr",  mood: 65, sessions: 0 },
    { week: "28 abr",  mood: 60, sessions: 1 },
    { week: "5 may",   mood: 68, sessions: 1 },
    { week: "13 may",  mood: 72, sessions: 1 },
    { week: "20 may",  mood: 70, sessions: 0, isNow: true },
  ],
  // Temas recurrentes que han aparecido en sesiones
  themes: [
    { label: "El 'tengo que'",        count: 7, trend: "active" },
    { label: "Ansiedad de domingo",   count: 5, trend: "fading" },
    { label: "Pareja",                count: 3, trend: "active" },
    { label: "Sueño",                 count: 4, trend: "resolved" },
    { label: "Trabajo",               count: 6, trend: "active" },
    { label: "Identidad",             count: 2, trend: "emerging" },
  ],
  // "Antes vs. ahora" - comparaciones tangibles
  comparisons: [
    { metric: "Sueño promedio",       before: "5.2 h", after: "7.1 h", direction: "up" },
    { metric: "Días con check-in",    before: "2 / sem", after: "5 / sem", direction: "up" },
    { metric: "Pausas conscientes",   before: "Casi nunca", after: "Diario", direction: "up" },
    { metric: "Ataques de ansiedad",  before: "3 / sem", after: "1 / sem", direction: "down-good" },
  ],
  milestones: [
    { date: "3 feb", title: "Primera sesión",            sub: "Con Marina Salazar.", glyph: "✦" },
    { date: "21 feb", title: "10 días de diario seguido", sub: "Tu primera racha.",  glyph: "◐" },
    { date: "14 mar", title: "Terminaste tu primer libro", sub: "Pausar antes de responder.", glyph: "📖" },
    { date: "14 abr", title: "Notaste un patrón propio",  sub: "El 'tengo que' aparece los domingos.", glyph: "◔" },
    { date: "8 may",  title: "8 sesiones",                sub: "Tu compromiso es real.", glyph: "✓" },
  ],
};

// ─────────────────────────────────────────────────────────
// NOTIFICACIONES — centro unificado
// ─────────────────────────────────────────────────────────
window.T_NOTIFS = [
  {
    id: "n-1",
    kind: "session",
    when: "Hace 12 min",
    unread: true,
    icon: "🪷",
    title: "Tu sesión con Marina es hoy a las 19:00",
    body: "Te quedan 4 ítems en tu preparación. La sala se abre a las 18:55.",
    actionLabel: "Preparar sesión",
    actionScreen: "prep",
  },
  {
    id: "n-2",
    kind: "therapist",
    when: "Hoy · 09:14",
    unread: true,
    icon: "✦",
    title: "Marina te envió una nota después de la última sesión",
    body: "“Esta semana, solo notar — sin cambiar nada — cuándo aparece el 'tengo que'. Una palabra en el diario es suficiente.”",
    actionLabel: "Leer completo",
    actionScreen: "post",
  },
  {
    id: "n-3",
    kind: "diary",
    when: "Ayer · 21:30",
    unread: false,
    icon: "✍︎",
    title: "Recordatorio · Reflexión del día",
    body: "Llevas 5 días seguidos escribiendo. No rompas la racha — bastan 30 segundos.",
    actionLabel: "Abrir diario",
  },
  {
    id: "n-4",
    kind: "library",
    when: "Lun · 16:42",
    unread: false,
    icon: "📖",
    title: "Marina te recomendó un capítulo",
    body: "Cap. 5 · Tristeza no es debilidad — relacionado con lo que hablaron la última sesión.",
    actionLabel: "Abrir capítulo",
  },
  {
    id: "n-5",
    kind: "system",
    when: "Sáb · 10:00",
    unread: false,
    icon: "💳",
    title: "Tu próxima sesión se cobrará el 27 may",
    body: "Tarjeta terminada en •• 4242 · $34.20 USD (incluye descuento Pro).",
    actionLabel: "Ver cobros",
  },
  {
    id: "n-6",
    kind: "milestone",
    when: "8 may",
    unread: false,
    icon: "✓",
    title: "Llegaste a 8 sesiones con Marina",
    body: "Cuatro meses sosteniendo el espacio. Eso pesa más de lo que parece.",
  },
];

window.T_NOTIF_KINDS = {
  session:   { label: "Sesiones",        color: "lavender" },
  therapist: { label: "De tu terapeuta", color: "lavender" },
  diary:     { label: "Diario",           color: "warm" },
  library:   { label: "Biblioteca",       color: "warm" },
  system:    { label: "Pagos y cuenta",   color: "warm" },
  milestone: { label: "Hitos",            color: "sage" },
};

// ─────────────────────────────────────────────────────────
// RECETAS — Mi camino con Marina (lo que el terapeuta sugirió)
// ─────────────────────────────────────────────────────────
window.T_PRESCRIPTIONS = [
  {
    sessionNum: 4,
    sessionDate: "13 may",
    items: [
      {
        type: "chapter", cover: "cool",
        title: "Cap. 5 · Tristeza no es debilidad",
        author: "Emociones en construcción",
        progress: 0.34,
        marinaNote: "Lee solo si te queda energía después del miércoles.",
        state: "in-progress",
      },
      {
        type: "practice",
        title: "Práctica · notar el 'tengo que'",
        author: "Sin cronómetro · cuando aparezca",
        marinaNote: "Una palabra basta. No hace falta entenderlo.",
        state: "active",
      },
    ],
  },
  {
    sessionNum: 3,
    sessionDate: "6 may",
    items: [
      {
        type: "exercise", cover: "mixed",
        title: "Pausa de 3 respiraciones",
        author: "Eco · audio · 4 min",
        completedTimes: 12,
        marinaNote: "Antes de responder a un mensaje que te active.",
        state: "active",
      },
    ],
  },
  {
    sessionNum: 2,
    sessionDate: "29 abr",
    items: [
      {
        type: "book", cover: "warm",
        title: "La pausa antes de responder",
        author: "Tomás Aguilar",
        progress: 1.0,
        marinaNote: "Cuando te sientas listo. No hay prisa.",
        state: "done",
      },
    ],
  },
  {
    sessionNum: 1,
    sessionDate: "22 abr",
    items: [
      {
        type: "ritual",
        title: "Diario · 3 líneas al despertar",
        author: "Hábito · 1 min",
        completedTimes: 47,
        marinaNote: "Para empezar a notar lo que pasa adentro.",
        state: "done",
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────
// CANCELAR / REAGENDAR — flujo con fricción humana
// ─────────────────────────────────────────────────────────
window.T_CANCEL_REASONS = [
  { id: "schedule",   label: "Me cambió la agenda",          sub: "Solo necesitas otra hora." },
  { id: "sick",       label: "No me siento bien hoy",         sub: "El cuerpo también cuenta." },
  { id: "overwhelm",  label: "Tengo demasiado encima",        sub: "Está bien dar espacio." },
  { id: "ready",      label: "Creo que necesito una pausa",   sub: "Hablamos de qué sigue." },
  { id: "fit",        label: "No siento que encaje con mi terapeuta", sub: "Te ayudamos a encontrar otra opción, sin costo." },
  { id: "other",      label: "Otra razón",                    sub: "Cuéntanos abajo si quieres." },
];

window.T_CANCEL_POLICY = {
  freeBeforeHours: 12,
  partialChargeRate: 0.5,
  context: "Tu sesión es en 2 h 14 min — todavía estás dentro de la ventana gratuita (más de 12 h antes se cancela sin costo).",
  outsideWindow: false,
};




// ═════════════════════════════════════════════════════════
// EXPANSIÓN · Pantallas B2B + Terapeuta + Variaciones (16-19)
// ═════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
// VISTA TERAPEUTA — el dashboard de Marina (la otra cara)
// ─────────────────────────────────────────────────────────
window.T_TX_USER = {
  firstName: "Marina",
  lastName: "Salazar",
  title: "Dra. Marina Salazar · Psicóloga clínica",
  initials: "MS",
  email: "marina@psicoplatform.app",
};

window.T_TX_TODAY = [
  {
    time: "09:00", endTime: "09:50",
    patientName: "Sebastián O.", initials: "SO", cover: "warm",
    sessionNum: 12, sessionLabel: "Sesión 12 · seguimiento",
    state: "done",  // done | next | upcoming
    note: "Hablamos del aniversario. Notó algo en sí mismo que no esperaba.",
    flag: null,
  },
  {
    time: "11:00", endTime: "11:50",
    patientName: "Daniela R.", initials: "DR", cover: "cool",
    sessionNum: 3, sessionLabel: "Sesión 3 · ansiedad",
    state: "done",
    note: "Se animó a contar lo del trabajo. Quedó tarea de notar el cuerpo.",
    flag: null,
  },
  {
    time: "15:00", endTime: "15:50",
    patientName: "Joaquín M.", initials: "JM", cover: "mixed",
    sessionNum: 1, sessionLabel: "Primera sesión",
    state: "done",
    note: "Llegó con la pregunta correcta — no le falta nada para empezar.",
    flag: "new",
  },
  {
    time: "17:00", endTime: "17:50",
    patientName: "Andrea P.", initials: "AP", cover: "warm",
    sessionNum: 6, sessionLabel: "Sesión 6 · seguimiento",
    state: "done",
    note: "",
    flag: null,
  },
  {
    time: "19:00", endTime: "19:50",
    patientName: "Ana M.", initials: "AM", cover: "cool",
    sessionNum: 5, sessionLabel: "Sesión 5 · patrón del 'tengo que'",
    state: "next",
    intention: "Quiero entender por qué los domingos me cuesta tanto.",
    sharedItems: ["3 entradas del diario", "Mood diario · 7 días"],
    flag: null,
  },
  {
    time: "20:30", endTime: "21:20",
    patientName: "Camila V.", initials: "CV", cover: "mixed",
    sessionNum: 9, sessionLabel: "Sesión 9 · pareja",
    state: "upcoming",
    note: "",
    flag: null,
  },
];

window.T_TX_PATIENTS = [
  { id: "ana",   name: "Ana M.",      initials: "AM", cover: "cool",  sessionsTotal: 5, freq: "Semanal · martes",   lastSeen: "13 may",  trend: "up",      streak: 5, note: "El patrón del 'tengo que' empieza a verbalizarse." },
  { id: "seb",   name: "Sebastián O.",initials: "SO", cover: "warm",  sessionsTotal: 12, freq: "Quincenal · martes", lastSeen: "Hoy",     trend: "steady",  streak: 6, note: "Trabajando aniversarios — esto requiere espacio." },
  { id: "dan",   name: "Daniela R.",  initials: "DR", cover: "cool",  sessionsTotal: 3,  freq: "Semanal · martes",   lastSeen: "Hoy",     trend: "up",      streak: 3, note: "Pánico vinculado al trabajo. Próximo: cuerpo." },
  { id: "andrea",name: "Andrea P.",   initials: "AP", cover: "warm",  sessionsTotal: 6,  freq: "Semanal · martes",   lastSeen: "Hoy",     trend: "steady",  streak: 6, note: "Tres semanas estables — mantenemos rumbo." },
  { id: "joaq",  name: "Joaquín M.",  initials: "JM", cover: "mixed", sessionsTotal: 1,  freq: "Primera",            lastSeen: "Hoy",     trend: "new",     streak: 1, note: "Es lúcido y no se queja. Confío en él." },
  { id: "cam",   name: "Camila V.",   initials: "CV", cover: "mixed", sessionsTotal: 9,  freq: "Quincenal · martes", lastSeen: "6 may",   trend: "alert",   streak: 0, note: "Pidió mover dos veces. Voy a ofrecer espacio extra." },
  { id: "luis",  name: "Luis F.",     initials: "LF", cover: "warm",  sessionsTotal: 4,  freq: "Semanal · jueves",   lastSeen: "8 may",   trend: "steady",  streak: 4, note: "Empezamos a mapear la familia. Lento, está bien." },
];

window.T_TX_INBOX = [
  { id: "i1", kind: "share",   patient: "Ana M.",     initials: "AM", cover: "cool",  when: "Hace 2 h",
    body: "Ana compartió 3 entradas del diario antes de su sesión de hoy.",
    cta: "Ver entradas" },
  { id: "i2", kind: "request", patient: "Camila V.",  initials: "CV", cover: "mixed", when: "Hoy · 11:14",
    body: "Camila pidió mover su sesión del viernes a la próxima semana.",
    cta: "Responder" },
  { id: "i3", kind: "intake",  patient: "Tomás L.",   initials: "TL", cover: "warm",  when: "Ayer · 22:30",
    body: "Nuevo paciente. Intake completado — marcó 'ansiedad' y 'sueño'.",
    cta: "Revisar intake",
    flag: "new" },
  { id: "i4", kind: "alert",   patient: "Anónimo",    initials: "??", cover: "warm",  when: "Hace 1 día",
    body: "Un paciente en intake marcó pensamientos de hacerse daño. Asignado a guardia.",
    cta: "Ver detalle",
    flag: "urgent" },
];

window.T_TX_LOAD = {
  sessionsThisWeek: 18,
  sessionsBookedNext: 14,
  activePatients: 12,
  hoursThisWeek: 16.5,
  hoursTarget: 20,
  // Una barra por día para los próximos 7
  weekLoad: [
    { day: "lun 19", sessions: 4 },
    { day: "mar 20", sessions: 6, isToday: true },
    { day: "mié 21", sessions: 3 },
    { day: "jue 22", sessions: 4 },
    { day: "vie 23", sessions: 1 },
    { day: "sáb 24", sessions: 0 },
    { day: "dom 25", sessions: 0 },
  ],
  earningsMonth: 1247,
  earningsCurrency: "USD",
};

// ─────────────────────────────────────────────────────────
// B2B — Beneficio activo del usuario + Dashboard agregado
// ─────────────────────────────────────────────────────────
window.T_B2B_USER = {
  employer: "Quanta Studios",
  employerLogo: "Q",
  employerCover: "lavender", // tinta para placeholder
  plan: "Bienestar Corporativo",
  sessionsCoveredYear: 12,
  sessionsUsed: 4,
  sessionsRemaining: 8,
  renewDate: "01 ene 2027",
  contact: "talento@quanta.studio",
  perks: [
    { glyph: "✓", title: "12 sesiones al año cubiertas",          sub: "Con cualquier terapeuta del directorio." },
    { glyph: "✓", title: "Acceso completo a la biblioteca",        sub: "Libros y ejercicios sin costo adicional." },
    { glyph: "✓", title: "Chat de guardia 24/7",                   sub: "Apoyo en momentos críticos." },
    { glyph: "✓", title: "Confidencialidad reforzada",             sub: "Quanta nunca ve tus datos individuales." },
  ],
};

window.T_B2B_ADMIN = {
  org: "Quanta Studios",
  domain: "quanta.studio",
  seats: 145,
  activatedSeats: 87,
  monthOf: "Mayo 2026",
  sessionsCovered: 12,
  // Para los 6 últimos meses
  monthlyUsage: [
    { month: "Dic", sessions: 18, activations: 42 },
    { month: "Ene", sessions: 31, activations: 55 },
    { month: "Feb", sessions: 47, activations: 64 },
    { month: "Mar", sessions: 58, activations: 71 },
    { month: "Abr", sessions: 64, activations: 79 },
    { month: "May", sessions: 72, activations: 87, isCurrent: true },
  ],
  topThemes: [
    { label: "Ansiedad",       pct: 28 },
    { label: "Trabajo",        pct: 21 },
    { label: "Relaciones",     pct: 15 },
    { label: "Identidad",      pct: 11 },
    { label: "Sueño",          pct: 9 },
    { label: "Otros",          pct: 16 },
  ],
  satisfactionAvg: 4.7,
  satisfactionN: 64,
  burnoutSignal: "moderado", // bajo | moderado | alto
  burnoutNote: "Pico de uso después de los entregables Q1. Considera espacios de pausa estructurada en abril.",
};

// ─────────────────────────────────────────────────────────
// VISTA MES — calendario mensual con disponibilidad real
// ─────────────────────────────────────────────────────────
// Mayo 2026 — 31 días, empieza viernes (índice 4 en lun-base, 5 en dom-base)
// Mapeo cardinal: días con slots (>0 disponibles), días sin slots, hoy
window.T_MONTH = {
  monthLabel: "Mayo 2026",
  startsOnDay: 4, // 0=lun ... 6=dom · viernes
  todayDate: 20,
  daysInMonth: 31,
  // map fecha → cantidad de slots disponibles ese día
  availability: {
    1: 3,  2: 0,  3: 0,  4: 2,  5: 4,  6: 3,  7: 4,  8: 5,  9: 0, 10: 1,
    11: 2, 12: 5, 13: 6, 14: 3, 15: 4, 16: 0, 17: 0, 18: 1, 19: 3, 20: 2,
    21: 4, 22: 3, 23: 3, 24: 0, 25: 1, 26: 3, 27: 5, 28: 4, 29: 4, 30: 0, 31: 0,
  },
  // Cuáles son sábados/domingos (1-indexed): viernes=4 → s=5,d=6 → 2,3,9,10,16,17,23,24,30,31
  weekendsBy1Idx: new Set([2,3,9,10,16,17,23,24,30,31]),
};

// ─────────────────────────────────────────────────────────
// VARIACIONES VISUALES DEL HUB
// ─────────────────────────────────────────────────────────
window.T_HUB_STYLES = [
  { value: "calmado",   label: "Calmado",   sub: "Actual — minimal, soft" },
  { value: "editorial", label: "Editorial", sub: "Magazine, serif headline" },
  { value: "datos",     label: "Datos",     sub: "Progreso primero, sin marketing" },
  { value: "inmersivo", label: "Inmersivo", sub: "Hero full-bleed, video-like" },
];
