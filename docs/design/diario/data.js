// diario/data.js — Diario · 12 entradas mixtas.
// Tipos: manual · reflexion · eco · highlight

window.DIARIO_USER = {
  firstName: "Ana",
  totalEntries: 12,
  thisMonth: 12,
  streakDays: 6,
};

// Tipos visuales
window.DIARIO_TYPES = {
  manual:    { label: "Entrada",            color: "var(--color-warm-700)",     icon: "✎" },
  reflexion: { label: "Reflexión rápida",   color: "var(--color-lavender-700)", icon: "·" },
  eco:       { label: "Guardado con Eco",    color: "var(--color-sage-700)",     icon: "✦" },
  highlight: { label: "Subrayado",           color: "var(--color-warm-700)",     icon: "❝" },
};

window.MOOD_SWATCH = {
  calma:     "linear-gradient(135deg, #a5c99e, #5e9254)",
  foco:      "linear-gradient(135deg, #d9d5ce, #5e42c0)",
  energia:   "linear-gradient(135deg, #8b71f5, #7fae76)",
  reflexion: "linear-gradient(135deg, #ddd8ff, #4d36a0)",
};
window.MOOD_NAMES = { calma: "Calma", foco: "Foco", energia: "Energía", reflexion: "Reflexión" };

// ── Entradas (más reciente arriba) ──
window.DIARIO_ENTRIES = [
  {
    id: "e12",
    type: "reflexion",
    date: "Hoy",
    fullDate: "Viernes 15 may · 21:08",
    mood: "reflexion",
    title: null,
    body: "Un poco.",
    promptQ: "¿Algo te pesó hoy?",
    tags: ["semana", "trabajo"],
  },
  {
    id: "e11",
    type: "manual",
    date: "Hoy",
    fullDate: "Viernes 15 may · 8:42",
    mood: "calma",
    title: "La pausa que no encontraba",
    body:
      "Hoy noté el cuerpo antes que la mente. Salí al balcón antes del café — solo dos minutos — y eso bastó para que el resto del día tuviera otra textura.\n\n" +
      "Voy a probarlo unos días más. Si funciona, lo llamo *mi pausa de las 7:30*.",
    tags: ["mañana", "cuerpo"],
  },
  {
    id: "e10",
    type: "eco",
    date: "Hoy",
    fullDate: "Viernes 15 may · 8:18",
    mood: "calma",
    title: "Sobre el cansancio matutino",
    body:
      "Eco resumió lo que conversamos: que el descanso me cuesta entre semana, que la rumiación nocturna es común, y que esta noche voy a probar el audio de 7 min para aterrizar antes de dormir.",
    ecoConversationLink: "Ver la conversación →",
    tags: ["sueño", "ansiedad"],
  },
  {
    id: "e09",
    type: "highlight",
    date: "Ayer",
    fullDate: "Jueves 14 may · 22:14",
    mood: "reflexion",
    book: { title: "Emociones en construcción", chapter: "Cap. 4 · Miedo, ansiedad, alerta", cover: "cool" },
    quote:
      "No todo lo que se acelera es ansiedad. A veces es solo el cuerpo terminando un día — pero la mente todavía no se ha enterado.",
    body:
      "Esto me cambió la manera de mirar las noches del martes. Antes lo nombraba todo como ansiedad. Ahora me pregunto primero: ¿qué le pasó al cuerpo hoy?",
    tags: ["lectura", "sueño"],
  },
  {
    id: "e08",
    type: "manual",
    date: "Ayer",
    fullDate: "Jueves 14 may · 14:30",
    mood: "foco",
    title: "Conversación con S.",
    body:
      "Le dije lo que necesitaba decirle. No se enojó. Tampoco se rindió — se quedó pensándolo. Eso era todo lo que quería: que lo pensara.\n\n" +
      "Aprendizaje del día: pedir no es exigir. Y a veces el silencio del otro no es un no, es un sí pidiendo tiempo.",
    tags: ["vínculos", "pareja"],
  },
  {
    id: "e07",
    type: "reflexion",
    date: "Miércoles",
    fullDate: "Miércoles 13 may · 21:14",
    mood: "calma",
    body: "Sí.",
    promptQ: "¿Algo te pesó hoy?",
    note: "El trabajo. Pero ya pasó.",
    tags: ["trabajo"],
  },
  {
    id: "e06",
    type: "eco",
    date: "Martes",
    fullDate: "Martes 12 may · 20:02",
    mood: "reflexion",
    title: "Discusión con mi pareja",
    body:
      "Eco me ayudó a nombrar el límite antes de defenderlo. Aprendí a separar lo que sentí (no fue escuchada) de lo que quería (que dejara el celular cinco minutos). Las dos cosas son válidas — pero solo la segunda se puede pedir.",
    ecoConversationLink: "Ver la conversación →",
    tags: ["vínculos", "pareja", "límites"],
  },
  {
    id: "e05",
    type: "manual",
    date: "Lunes",
    fullDate: "Lunes 11 may · 22:48",
    mood: "reflexion",
    title: "Lo que el domingo no me dejó",
    body:
      "Domingo arrastrado. Hoy no tuve energía hasta las cuatro de la tarde y me costó perdonarme. Estoy aprendiendo a no leer cada bajada como un retroceso.\n\n" +
      "Mañana descanso intencional, no por agotamiento.",
    tags: ["energía", "auto-compasión"],
  },
  {
    id: "e04",
    type: "reflexion",
    date: "Domingo",
    fullDate: "Domingo 10 may · 18:55",
    mood: "calma",
    body: "Para nada.",
    promptQ: "¿Algo te pesó hoy?",
    tags: ["fin de semana"],
  },
  {
    id: "e03",
    type: "highlight",
    date: "Sábado",
    fullDate: "Sábado 9 may · 10:20",
    mood: "foco",
    book: { title: "Emociones en construcción", chapter: "Cap. 3 · La pausa antes de responder", cover: "cool" },
    quote:
      "La pausa no se hereda — se entrena. Como cualquier cosa que vale, requiere repetición sin recompensa visible.",
    body:
      "Lo voy a poner en la pared de la oficina. Necesito recordármelo cuando llegue un correo que me activa.",
    tags: ["lectura", "trabajo"],
  },
  {
    id: "e02",
    type: "eco",
    date: "Viernes pasado",
    fullDate: "Viernes 8 may · 9:14",
    mood: "energia",
    title: "Antes de la sesión con Sara",
    body:
      "Llegaba con expectativas altas a la sesión de terapia. Eco me ayudó a aterrizar: no necesito 'tener algo grande que contar' para que la hora valga.",
    ecoConversationLink: "Ver la conversación →",
    tags: ["terapia"],
  },
  {
    id: "e01",
    type: "manual",
    date: "Hace 2 sem.",
    fullDate: "Sábado 2 may · 23:11",
    mood: "reflexion",
    title: "Primera entrada · empiezo a escribir aquí",
    body:
      "No sé si lo voy a sostener. Pero hoy empecé un cuaderno y me lo prometí: ni todos los días, ni todas las cosas — solo lo que necesite decirme a mí misma sin filtros.\n\n" +
      "Si vuelvo a leer esto en seis meses, espero seguir aquí.",
    tags: ["primer-paso"],
  },
];

// Mood en el tiempo (últimas 4 semanas, una columna por día)
// Cada día puede tener 0–1 mood (o vacío)
window.DIARIO_MOODMAP = [
  // Semana hace 4 → semana actual (lun a dom)
  ["calma", "reflexion", null, "foco", "calma", null, "reflexion"],
  ["foco", "calma", "reflexion", null, "energia", "calma", null],
  ["reflexion", null, "calma", "reflexion", null, "foco", "calma"],
  ["calma", "reflexion", "calma", "reflexion", "calma", null, null], // semana actual, viernes es hoy
];
window.DIARIO_WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

// Temas frecuentes (último mes)
window.DIARIO_TAGS = [
  { tag: "trabajo",       count: 8, mood: "foco" },
  { tag: "sueño",         count: 6, mood: "reflexion" },
  { tag: "vínculos",      count: 5, mood: "calma" },
  { tag: "lectura",       count: 5, mood: "calma" },
  { tag: "pareja",        count: 4, mood: "calma" },
  { tag: "mañana",        count: 3, mood: "calma" },
  { tag: "auto-compasión", count: 3, mood: "reflexion" },
  { tag: "ansiedad",      count: 2, mood: "reflexion" },
];

// Prompts para empezar a escribir
window.DIARIO_PROMPTS = [
  "¿Qué pasó hoy que no esperabas?",
  "¿Qué noté en el cuerpo esta tarde?",
  "Una frase del libro que se me quedó.",
  "Lo que le diría a alguien que pasa por lo mismo.",
  "Una conversación que me dejó pensando.",
  "Algo que sentí pero no supe nombrar.",
];
