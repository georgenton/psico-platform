// patrones/data.js — Datos agregados del usuario (diario + eco + lectura).
// Inspirados en lo que la plataforma sabría tras ~6 meses de uso.

window.PAT_USER = {
  firstName: "Ana",
  weeksActive: 24,
  totalEntries: 178,
  totalEcoConvs: 64,
  totalHighlights: 92,
};

// Mood por hora del día (24h) — densidad de entradas + mood dominante
// value 0..1 = densidad relativa, mood = mood dominante
window.PAT_HOUR_MOOD = [
  { h: 0,  v: 0.05, m: "reflexion" }, { h: 1,  v: 0.02, m: "reflexion" },
  { h: 2,  v: 0.0,  m: null },        { h: 3,  v: 0.0,  m: null },
  { h: 4,  v: 0.0,  m: null },        { h: 5,  v: 0.0,  m: null },
  { h: 6,  v: 0.08, m: "calma" },     { h: 7,  v: 0.32, m: "calma" },
  { h: 8,  v: 0.55, m: "calma" },     { h: 9,  v: 0.42, m: "foco" },
  { h: 10, v: 0.18, m: "foco" },      { h: 11, v: 0.08, m: "foco" },
  { h: 12, v: 0.22, m: "calma" },     { h: 13, v: 0.30, m: "calma" },
  { h: 14, v: 0.38, m: "foco" },      { h: 15, v: 0.20, m: "foco" },
  { h: 16, v: 0.12, m: "energia" },   { h: 17, v: 0.18, m: "energia" },
  { h: 18, v: 0.28, m: "reflexion" }, { h: 19, v: 0.35, m: "reflexion" },
  { h: 20, v: 0.62, m: "reflexion" }, { h: 21, v: 0.88, m: "reflexion" },
  { h: 22, v: 0.72, m: "reflexion" }, { h: 23, v: 0.30, m: "reflexion" },
];

// Mood map 12 semanas — cada semana = 7 días (L M M J V S D)
// null = sin entrada; mood string = mood dominante
window.PAT_MOODMAP = (() => {
  const moods = ["calma", "foco", "energia", "reflexion"];
  const seed = [0.3, 0.7, 0.2, 0.9, 0.5, 0.1, 0.4, 0.6, 0.8, 0.55, 0.25, 0.7];
  const rows = [];
  for (let w = 0; w < 12; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const r = ((seed[w] * 13 + d * 7 + w * 3) % 10) / 10;
      if (r < 0.18) row.push(null);
      else row.push(moods[Math.floor(((r * 9) + d + w) % moods.length)]);
    }
    rows.push(row);
  }
  // La última semana es la actual — viernes hoy, sábado-domingo aún vacíos
  rows[11][5] = null; rows[11][6] = null;
  return rows;
})();

// Temas: evolución mensual (6 meses, cuenta de menciones)
window.PAT_THEMES = [
  { theme: "trabajo",         color: "var(--color-warm-700)",     trend: [4, 6, 9, 12, 8, 11], note: "+38%" },
  { theme: "sueño",           color: "var(--color-lavender-500)", trend: [8, 7, 9, 6, 4, 3],   note: "−63%" },
  { theme: "vínculos",        color: "var(--color-sage-500)",     trend: [3, 4, 5, 7, 9, 12],  note: "+300%" },
  { theme: "auto-compasión",  color: "var(--color-lavender-700)", trend: [0, 1, 2, 3, 5, 6],   note: "nuevo" },
  { theme: "energía",         color: "var(--color-sage-700)",     trend: [5, 4, 3, 5, 6, 7],   note: "+40%" },
  { theme: "lectura",         color: "var(--color-warm-600)",     trend: [6, 7, 8, 8, 9, 11],  note: "+83%" },
];

// Correlaciones detectadas (probabilísticas — no diagnósticas)
window.PAT_CORRELATIONS = [
  {
    if_:   "Escribes antes de las 22h",
    then_: "Duermes mejor (3.8★ vs 2.9★)",
    confidence: 0.82,
    sample: "Sobre 48 noches",
    icon: "🌙",
  },
  {
    if_:   "Conversas con Eco en la mañana",
    then_: "Tu mood al mediodía es más estable",
    confidence: 0.71,
    sample: "Sobre 22 días",
    icon: "✦",
  },
  {
    if_:   "Lees Cap. 3 ‹La pausa antes de responder›",
    then_: "Bajan tus entradas con #trabajo · #frustración",
    confidence: 0.64,
    sample: "Las dos semanas siguientes",
    icon: "📖",
  },
  {
    if_:   "No escribes 3+ días seguidos",
    then_: "Las entradas que vuelven son más largas y reflexivas",
    confidence: 0.58,
    sample: "Patrón en 7 ocasiones",
    icon: "✎",
  },
];

// "Eco notó" — insights conversacionales sintéticos
window.PAT_ECO_NOTES = [
  {
    notedOn: "Esta semana",
    body: "Mencionaste tres veces a S. y ninguna fue para describir un conflicto. Es la primera semana en dos meses que pasa esto.",
    tag: "vínculos",
  },
  {
    notedOn: "Hace 2 semanas",
    body: "Volviste a usar la palabra ‹pausa› — la primera vez fue en abril, después del Cap. 3. Está empezando a aparecer sola.",
    tag: "lenguaje",
  },
  {
    notedOn: "Este mes",
    body: "Cuando escribes después de leer, lo haces con 40% más calma y 60% menos preguntas. Tal vez por eso vuelves a los libros al final del día.",
    tag: "lectura",
  },
];

// Resumen semanal generado
window.PAT_WEEKLY_SUMMARY = {
  weekLabel: "Semana del 11 al 17 de mayo",
  headline: "Bajaste la guardia con tu pareja — y tu cuerpo lo notó.",
  body:
    "Cinco de siete entradas mencionaron a S., pero esta vez sin defensa. " +
    "Tu mood vespertino subió tres puntos respecto a la semana pasada, " +
    "y por primera vez en cuatro semanas ‹trabajo› no fue tu tag más frecuente.",
  hilites: [
    { lbl: "Entradas",    val: "7",     sub: "+2 vs semana anterior" },
    { lbl: "Mood medio",  val: "Calma", sub: "↑ desde Reflexión" },
    { lbl: "Con Eco",     val: "3",     sub: "2 en la mañana" },
    { lbl: "Subrayados",  val: "4",     sub: "Todos del Cap. 4" },
  ],
};

// Top palabras / metáforas que se repiten
window.PAT_VOCAB = [
  { w: "pausa",     n: 14, mood: "calma",     since: "Abr" },
  { w: "ritmo",     n: 11, mood: "calma",     since: "Mar" },
  { w: "agotada",   n: 9,  mood: "reflexion", since: "Mar" },
  { w: "ligera",    n: 7,  mood: "energia",   since: "May" },
  { w: "intentar",  n: 7,  mood: "foco",      since: "Feb" },
  { w: "perdonar",  n: 6,  mood: "reflexion", since: "Abr" },
  { w: "domingo",   n: 6,  mood: "reflexion", since: "Mar" },
  { w: "mañana",    n: 5,  mood: "calma",     since: "May" },
];

window.MOOD_SWATCH = {
  calma:     "linear-gradient(135deg, #a5c99e, #5e9254)",
  foco:      "linear-gradient(135deg, #d9d5ce, #5e42c0)",
  energia:   "linear-gradient(135deg, #8b71f5, #7fae76)",
  reflexion: "linear-gradient(135deg, #ddd8ff, #4d36a0)",
};
window.MOOD_SOLID = {
  calma:     "#7fae76",
  foco:      "#5e42c0",
  energia:   "#8b71f5",
  reflexion: "#a697ff",
};
window.MOOD_NAMES = { calma: "Calma", foco: "Foco", energia: "Energía", reflexion: "Reflexión" };
