// inicio/data.js — Datos para la pantalla Inicio.

window.USER = {
  firstName: "Ana",
  emailLocalPart: "ana",
  plan: "FREE",      // controlado por tweak
  city: "Quito",
};

// Hora → saludo y matiz de Eco
window.GREETINGS = {
  morning:   { greet: "Buenos días",  sub: "Te encontré en la mañana — un buen momento para empezar." },
  afternoon: { greet: "Buenas tardes", sub: "A esta hora suele venir bien una pausa." },
  evening:   { greet: "Buenas noches", sub: "Cerrar el día con quietud — también es una práctica." },
};

window.MOODS = [
  { id: "calma",     emoji: "😌", name: "Calma",     descr: "Sereno, en pausa" },
  { id: "foco",      emoji: "🎯", name: "Foco",      descr: "Listo para concentrar" },
  { id: "energia",   emoji: "✨", name: "Energía",   descr: "Con ganas de empezar" },
  { id: "reflexion", emoji: "🕊", name: "Reflexión", descr: "Quiero mirar adentro" },
];

window.MOOD_SWATCH = {
  calma:     "linear-gradient(135deg, #a5c99e, #5e9254)",
  foco:      "linear-gradient(135deg, #d9d5ce, #5e42c0)",
  energia:   "linear-gradient(135deg, #8b71f5, #7fae76)",
  reflexion: "linear-gradient(135deg, #ddd8ff, #4d36a0)",
};

// Continúa donde quedaste
window.CONTINUE_BOOK = {
  id: "emociones-en-construccion",
  title: "Emociones en construcción",
  author: "Dra. Marina Salazar",
  cover: "cool",                  // gradient class
  nextChapter: "Cap. 5 · Tristeza no es debilidad",
  estimatedMin: 20,
  lastReadAt: "Hace 2 días, 22:14",
  progress: 0.34,
};

// "Hoy con Eco" — una observación contextual del día
window.ECO_MOMENT = {
  initials: "✦",
  badge: "Hoy contigo",
  message:
    "Vienes leyendo a buen ritmo — cuatro capítulos esta semana. El próximo (Tristeza no es debilidad) suele removerse más de lo que aparenta. Si lo abres hoy, te sugiero dejar 20 minutos sin interrupciones.",
  suggestion: "Reflexión",
  suggestionReason: "Por la hora y por tu ritmo de la semana.",
};

// Para ti — 3 cards
window.RECOS = [
  {
    type: "book",
    bookId: "la-pausa-antes-de-responder",
    title: "La pausa antes de responder",
    author: "Tomás Aguilar",
    cover: "warm",
    reason: "Lo abriste anoche y dijiste sentirte tenso.",
    cta: "Sigue por aquí",
  },
  {
    type: "exercise",
    title: "Ejercicio de 7 minutos · Aterrizar en el cuerpo",
    author: "Eco · Audio guiado",
    cover: "mixed",
    reason: "Combina con Reflexión a esta hora del día.",
    cta: "Empezar audio",
  },
  {
    type: "chapter",
    bookId: "dormir-sin-pelear-con-la-noche",
    title: "Cap. 1 · La noche no es enemiga",
    author: "Dormir sin pelear con la noche",
    cover: "cool",
    reason: "Mencionaste que cuesta dormir.",
    cta: "Empezar capítulo",
  },
];

// Stats — Tu camino
window.STATS = {
  streakDays: 6,
  weekMinutes: 84,
  weekTarget: 105,           // 15 min/día × 7
  chaptersCompleted: 4,
  longestStreak: 11,
  lastSevenDays: [12, 18, 0, 15, 12, 20, 7],  // minutos x día (lun→dom)
  weekday: 4,                // hoy es viernes (0=lun, 6=dom)
};

// Reflexión rápida — pregunta del día
window.REFLECTION_PROMPT = {
  question: "¿Algo te pesó hoy?",
  helper: "Una sola palabra está bien.",
  chips: [
    { id: "no",     label: "Para nada" },
    { id: "poco",   label: "Un poco" },
    { id: "si",     label: "Sí" },
    { id: "mucho",  label: "Mucho" },
  ],
};

// Quick links / atajos
window.SHORTCUTS = [
  { id: "biblioteca", icon: "📚", label: "Tu biblioteca",    sub: "8 libros · 1 empezado",      href: "#libros" },
  { id: "journal",    icon: "✎",  label: "Tu diario",         sub: "12 entradas este mes",      href: "#diario" },
  { id: "audio",      icon: "🎧", label: "Audios guiados",    sub: "3 nuevos esta semana",      href: "#audios" },
  { id: "marina",     icon: "✦",  label: "Chat con Marina",   sub: "Pregúntale lo que sea",     href: "#marina" },
];

// Day of week names (Spanish)
window.WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
window.WEEKDAYS_FULL = {
  morning:   "Es viernes — el final de la semana laboral.",
  afternoon: "Es viernes por la tarde — se siente el cambio de marcha.",
  evening:   "Es viernes — empieza el descanso.",
};
