// onboarding/data.js — Marina IA conversational onboarding script.
// Each step is a "message from Marina" + an "answer surface" the user
// taps into. The host walks through steps in order.

window.MARINA_INTRO = {
  name: "Marina IA",
  avatar: "MS",
  role: "Asistente bioinspirada · Psico Platform",
};

window.ONBOARDING_STEPS = [
  {
    id: "welcome",
    kind: "intro",
    messages: [
      "Hola. Soy Marina IA, una compañera entrenada por la Dra. Marina Salazar para ayudarte a empezar.",
      "Te haré unas pocas preguntas — 1 minuto — para sugerirte un primer libro y un mood que vayan contigo hoy.",
      "¿Empezamos?",
    ],
    cta: "Empecemos",
  },
  {
    id: "motivation",
    kind: "options",
    question: "¿Qué te trae a este espacio?",
    helper: "Elige lo que más se parezca a tu motivo principal hoy. Puedes cambiarlo luego.",
    options: [
      { id: "entender",   label: "Entender mejor mis emociones",        sub: "Aprender a notar lo que sientes",        emoji: "🌱" },
      { id: "ansiedad",   label: "Manejar mi ansiedad",                  sub: "Encontrar pausa cuando todo se acelera", emoji: "🌊" },
      { id: "relacion",   label: "Mejorar mi relación",                  sub: "Pareja, familia, vínculos cercanos",      emoji: "💞" },
      { id: "sueno",      label: "Dormir mejor",                          sub: "Cerrar el día con más calma",             emoji: "🌙" },
      { id: "duelo",      label: "Pasar por un duelo o cambio",          sub: "Pérdidas, transiciones, despedidas",      emoji: "🍂" },
      { id: "explorar",   label: "Solo estoy explorando",                 sub: "Sin un motivo claro, curiosidad sana",    emoji: "✨" },
    ],
  },
  {
    id: "mood",
    kind: "mood",
    question: "¿Cómo te sientes ahora mismo?",
    helper: "Tu primer libro abrirá con el ambiente que mejor se ajuste.",
    moods: [
      { id: "calma",     name: "Calma",     emoji: "😌", descr: "Sereno, en pausa" },
      { id: "foco",      name: "Foco",      emoji: "🎯", descr: "Listo para concentrar" },
      { id: "energia",   name: "Energía",   emoji: "✨", descr: "Con ganas de empezar" },
      { id: "reflexion", name: "Reflexión", emoji: "🕊", descr: "Quiero mirar adentro" },
    ],
    intensityLabel: "Qué tan intensa esta sensación",
  },
  {
    id: "time",
    kind: "options",
    question: "¿Cuánto tiempo tienes al día para leer?",
    helper: "Diseñaremos tus sesiones para que entren cómodamente en tu día.",
    options: [
      { id: "5",   label: "5 minutos",  sub: "Una micro-lección al día",                emoji: "⏱" },
      { id: "15",  label: "15 minutos", sub: "Una lección guiada completa",             emoji: "📖" },
      { id: "30+", label: "30+ minutos", sub: "Un capítulo entero o más",                emoji: "📚" },
      { id: "var", label: "Varía mucho", sub: "Algunos días sí, otros no — soy flexible", emoji: "🌗" },
    ],
  },
  {
    id: "schedule",
    kind: "options",
    question: "¿Cuándo prefieres leer?",
    helper: "Esto define cuándo te enviaremos un recordatorio suave — si lo quieres.",
    options: [
      { id: "morning",   label: "Por la mañana",  sub: "Empezar el día con claridad",         emoji: "🌅" },
      { id: "afternoon", label: "Por la tarde",    sub: "Una pausa en el medio del día",       emoji: "☕️" },
      { id: "night",     label: "Por la noche",    sub: "Cerrar el día con quietud",            emoji: "🌙" },
      { id: "skip",      label: "Prefiero sin recordatorios", sub: "Yo elijo cuándo",        emoji: "—" },
    ],
  },
  {
    id: "profile",
    kind: "profile",
    question: "Para personalizar mejor — opcional.",
    helper: "No usamos estos datos para anuncios. Solo para mejorar las sugerencias.",
    fields: [
      { id: "age",    label: "Edad",    kind: "select", options: [
        { value: "",     label: "Prefiero no decir" },
        { value: "18-24",label: "18 – 24" },
        { value: "25-34",label: "25 – 34" },
        { value: "35-44",label: "35 – 44" },
        { value: "45-54",label: "45 – 54" },
        { value: "55+",  label: "55 o más" },
      ]},
      { id: "gender", label: "Género", kind: "select", options: [
        { value: "",         label: "Prefiero no decir" },
        { value: "femenino", label: "Femenino" },
        { value: "masculino",label: "Masculino" },
        { value: "no-binario",label: "No binario" },
        { value: "otro",     label: "Otro" },
      ]},
      { id: "language", label: "Voz preferida", kind: "select", options: [
        { value: "neutro",    label: "Español neutro latinoamericano" },
        { value: "ecuador",   label: "Español de Ecuador (más cercano)" },
        { value: "mexico",    label: "Español de México" },
        { value: "colombia",  label: "Español de Colombia" },
      ]},
    ],
  },
  {
    id: "recommendation",
    kind: "recommendation",
    question: "Esto es lo que aprendí de ti.",
    helper: "Si algo no te calza, lo puedes cambiar luego.",
  },
  {
    id: "register",
    kind: "register",
    question: "Guarda tu progreso",
    helper: "Tu plan gratuito incluye el primer capítulo de cada libro. Sin tarjeta.",
  },
];

// Lookup table: motivation → recommended book
window.BOOK_RECOMMENDATIONS = {
  entender: { id: "emociones-en-construccion", title: "Emociones en construcción", reason: "Es el mapa más directo para empezar a notar lo que sientes." },
  ansiedad: { id: "emociones-en-construccion", title: "Emociones en construcción", reason: "Empieza por entender qué dispara tu ansiedad, antes de manejarla." },
  relacion: { id: "familias-ensambladas",       title: "Familias ensambladas",       reason: "Sobre los vínculos que construyes con quienes amas." },
  sueno:    { id: "emociones-en-construccion", title: "Emociones en construcción", reason: "El sueño suele mejorarse cuando el cuerpo se calma primero." },
  duelo:    { id: "emociones-en-construccion", title: "Emociones en construcción", reason: "Las emociones de pérdida también se construyen — y se transforman." },
  explorar: { id: "emociones-en-construccion", title: "Emociones en construcción", reason: "Un buen punto de partida — el libro más leído por nuevos usuarios." },
};

window.TOUR_STEPS = [
  {
    id: "mood",
    title: "Tu ambiente, tu ritmo",
    body: "Te abrimos en el mood que elegiste. Tócalo arriba para cambiarlo cuando quieras.",
    anchor: "topbar",
  },
  {
    id: "modes",
    title: "Dos formas de leer",
    body: "Modo Libro para lectura larga · Modo Guía para una experiencia con video, audio y quizzes. El primer capítulo incluye ambos.",
    anchor: "modes",
  },
  {
    id: "marina",
    title: "Marina IA, siempre disponible",
    body: "Cuando tengas preguntas, búscala dentro de cualquier lección. Aprende contigo a medida que lees.",
    anchor: "marina",
  },
];
