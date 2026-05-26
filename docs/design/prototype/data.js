// Psico Platform — Lector RISE-style prototype
// Content for "Emociones en Construcción", Capítulo 1.
// Lessons are sequences of blocks. Each block has a `kind` + props.
// In Modo Guía: every block is rendered with its own interactive card.
// In Modo Libro: blocks are flattened to flowing prose (text + light heads).

window.PSICO_PLANS = [
  {
    id: "gratuito",
    name: "Gratuito",
    price: { monthly: 0, label: "Sin costo" },
    tagline: "Empieza a explorar",
    features: [
      { label: "Capítulo 1 de cada libro · Modo Libro", on: true },
      { label: "Modo Guía interactivo",                 on: false },
      { label: "Acceso al catálogo completo",          on: false },
      { label: "Marina IA · respuestas ilimitadas",    on: false },
      { label: "Comunidad y discusiones",              on: false },
      { label: "Práctica diaria y recordatorios",      on: false },
      { label: "Modo offline",                          on: false },
      { label: "Acceso temprano a nuevos libros",       on: false },
    ],
    cta: "Tu plan actual",
  },
  {
    id: "pro",
    name: "Pro",
    badge: "Más popular",
    price: { monthly: 7, label: "$7 / mes" },
    tagline: "Tu camino completo",
    features: [
      { label: "Todos los libros · Modo Libro + Modo Guía", on: true, highlight: true },
      { label: "Marina IA · respuestas ilimitadas",         on: true, highlight: true },
      { label: "Comunidad y discusiones moderadas",         on: true },
      { label: "Práctica diaria y recordatorios",           on: true },
      { label: "Modo offline · descarga libros",            on: true },
      { label: "Acceso temprano a nuevos libros",           on: true },
      { label: "Sin compromiso · cancela cuando quieras",  on: true },
    ],
    cta: "Elegir Pro",
  },
  {
    id: "anual",
    name: "Anual",
    badge: "Ahorra 30%",
    price: { monthly: 4.92, annual: 59, label: "$59 / año" },
    priceSub: "Equivale a $4.92 / mes",
    tagline: "Lo mismo, con compromiso de un año",
    features: [
      { label: "Todo lo que incluye Pro",              on: true, highlight: true },
      { label: "Ahorras $25 frente al plan mensual",  on: true, highlight: true },
      { label: "Garantía de devolución de 30 días",   on: true },
      { label: "Renovación automática",                on: true },
    ],
    cta: "Elegir Anual",
  },
];

// ── Pricing models ─────────────────────────────────────────────────────────
// The product has two coexisting pricing setups, chosen via a tweak:
//   "catalogo"  — full catalog Pro/Anual subscription (the long-term model)
//   "por-libro" — per-book purchase + bundle (launch model with 2-3 books only)
// Both live here so the paywall can swap renderers without touching component code.

window.PSICO_AVAILABLE_BOOKS = [
  {
    id: "emociones-en-construccion",
    title: "Emociones en construcción",
    author: "Dra. Marina Salazar",
    cover: "mixed",
    pages: 248,
    chapters: 12,
    price: 14,
  },
  {
    id: "familias-ensambladas",
    title: "Familias ensambladas",
    author: "Dra. Marina Salazar",
    cover: "cool",
    pages: 196,
    chapters: 10,
    price: 14,
  },
];

window.PSICO_PLAN_MODELS = {
  // — Catalog subscription (what already existed) —
  catalogo: {
    id: "catalogo",
    name: "Catálogo completo",
    description: "Una sola suscripción te abre toda la biblioteca, Modo Guía, Marina IA y la comunidad.",
    plans: window.PSICO_PLANS, // the array we already had
  },

  // — Per-book / launch pricing —
  "por-libro": {
    id: "por-libro",
    name: "Por libro",
    description: "Aún estamos lanzando — paga solo por los libros que quieres leer. Cuando crezca el catálogo, pasarás al plan Pro automáticamente sin pagar más.",
    plans: [
      {
        id: "gratuito",
        name: "Gratuito",
        price: { monthly: 0, label: "Sin costo" },
        tagline: "Empieza a explorar",
        features: [
          { label: "Capítulo 1 de cada libro · Modo Libro",      on: true },
          { label: "Modo Guía interactivo",                       on: false },
          { label: "Acceso completo al libro elegido",            on: false },
          { label: "Marina IA · respuestas ilimitadas",          on: false },
          { label: "Comunidad y discusiones",                    on: false },
          { label: "Modo offline",                                on: false },
        ],
        cta: "Tu plan actual",
      },
      {
        id: "un-libro",
        name: "Un libro",
        price: { monthly: 14, label: "$14 USD" },
        priceSub: "Pago único, acceso para siempre",
        tagline: "Elige el libro que más resuena hoy",
        features: [
          { label: "Acceso completo a UN libro · Libro + Guía", on: true, highlight: true },
          { label: "Marina IA limitada a ese libro",             on: true, highlight: true },
          { label: "Modo offline en ese libro",                  on: true },
          { label: "Discusiones del libro elegido",              on: true },
          { label: "Sin renovación · pago único",                on: true },
          { label: "Migración gratis al plan Pro cuando exista", on: true },
        ],
        cta: "Elegir libro",
      },
      {
        id: "bundle",
        name: "Toda la biblioteca actual",
        badge: "Mejor valor",
        // Live total = books * 14 - small discount; we hardcode for now.
        price: { monthly: 22, label: "$22 USD" },
        priceSub: "Ahorras $6 frente a compra individual",
        tagline: "Los 2 libros disponibles + lo que viene",
        features: [
          { label: "Acceso completo a TODOS los libros actuales", on: true, highlight: true },
          { label: "Cada libro nuevo que publiquemos en 2026",    on: true, highlight: true },
          { label: "Marina IA en cualquier libro",                on: true },
          { label: "Comunidad y discusiones · sin límite",        on: true },
          { label: "Modo offline en toda la biblioteca",          on: true },
          { label: "Pago único · sin renovación",                 on: true },
        ],
        cta: "Comprar biblioteca",
      },
    ],
  },
};

window.PSICO_PAYMENT_METHODS = [
  { id: "tarjeta",       name: "Tarjeta de crédito o débito", sub: "Visa · Mastercard · Diners",   recommended: true },
  { id: "paypal",        name: "PayPal",                       sub: "Paga con tu cuenta de PayPal" },
  { id: "transferencia", name: "Transferencia bancaria",       sub: "Banco Pichincha · Produbanco · Guayaquil" },
  { id: "facilito",      name: "Pago en efectivo (Facilito)",  sub: "Paga en cualquier punto autorizado en Ecuador" },
];

window.PSICO_PRO_VALUE_PROPS = [
  { icon: "guide",     title: "Modo Guía interactivo",      body: "Videos cortos, audios, quizzes y ejercicios prácticos — la forma más fácil de empezar a leer." },
  { icon: "ai",        title: "Marina IA, sin límite",       body: "Una asistente bioinspirada entrenada en cada libro. Pregúntale lo que quieras a cualquier hora." },
  { icon: "community", title: "Comunidad moderada",          body: "Discusiones con otros lectores y respuestas directas de los autores." },
  { icon: "practice",  title: "Práctica diaria",             body: "Recordatorios suaves y micro-ejercicios para sostener tu proceso día a día." },
  { icon: "offline",   title: "Modo offline",                body: "Descarga libros completos y léelos sin internet, donde estés." },
  { icon: "early",     title: "Acceso temprano",             body: "Lee los nuevos libros antes que nadie, semanas antes de su lanzamiento público." },
];

window.PSICO_AUTHOR = {
  name: "Dra. Marina Salazar",
  role: "Psicóloga clínica · Universidad Católica del Ecuador",
  avatarInitials: "MS",
  avatarTone: "lavender", // lavender · sage · mixed
  bio: "15 años acompañando procesos de regulación emocional en adolescentes y adultos. Co-autora del modelo Emociones en Construcción.",
};

window.PSICO_BOOK = {
  id: "emociones-en-construccion",
  title: "Emociones en construcción",
  subtitle: "Una guía para entenderte sin juzgarte",
  authorRef: "Dra. Marina Salazar",
  edition: "Edición Pro · 12 capítulos",
  description:
    "Un recorrido íntimo por la forma en que se construyen tus emociones, escrito en lenguaje cotidiano y sostenido por evidencia clínica. Lee a tu ritmo o avanza por la guía interactiva.",
  cover: { tone: "mixed" }, // cool · warm · mixed
  totalLessons: 24,
  completedLessons: 6,
  estMinutes: 240,
  modes: ["guia", "libro"], // both available
  chapters: [
    {
      id: "c1",
      number: 1,
      title: "Reconocer la emoción antes de reaccionar",
      subtitle: "Aprender a notar lo que sientes en el momento en que sucede.",
      durationMin: 38,
      tier: "free",          // chapter 1 of any book = free (Modo Libro)
      lessons: [
        { id: "l1", number: 1, title: "El disparador invisible", durationMin: 8, status: "in-progress" },
        { id: "l2", number: 2, title: "Nombrar lo que sientes",   durationMin: 7, status: "available" },
        { id: "l3", number: 3, title: "La pausa de tres segundos",durationMin: 6, status: "available" },
        { id: "l4", number: 4, title: "Cuando el cuerpo habla primero", durationMin: 9, status: "available" },
        { id: "l5", number: 5, title: "Tu mapa emocional de la semana",  durationMin: 8, status: "available" },
      ],
    },
    { id: "c2", number: 2, title: "El origen de tus reacciones", subtitle: "Por qué reaccionas así y no de otra forma.", durationMin: 42, tier: "pro",
      lessons: [
        { id: "c2l1", number: 1, title: "El primer recuerdo emocional",      durationMin: 9 },
        { id: "c2l2", number: 2, title: "Lo que aprendiste sin saber",        durationMin: 8 },
        { id: "c2l3", number: 3, title: "Patrones que ya no te sirven",      durationMin: 7 },
        { id: "c2l4", number: 4, title: "Reescribiendo la respuesta",        durationMin: 10 },
        { id: "c2l5", number: 5, title: "El espejo de tus relaciones",       durationMin: 8 },
      ],
    },
    { id: "c3", number: 3, title: "Sentir sin dejar de pensar", subtitle: "Construir un diálogo entre cabeza y corazón.", durationMin: 35, tier: "pro", lessons: [] },
    { id: "c4", number: 4, title: "Las emociones que evitas", subtitle: "Lo que rechazas también te construye.", durationMin: 40, tier: "pro", lessons: [] },
  ],
};

// ── Lesson 1 — full block list (RISE-style modular) ────────────────────────
window.PSICO_LESSON_1 = {
  id: "l1",
  chapterId: "c1",
  number: 1,
  title: "El disparador invisible",
  subtitle: "Identifica la chispa que enciende la reacción — antes de que se vuelva fuego.",
  durationMin: 8,
  partsCount: 7,
  goal:
    "Aprenderás a reconocer el momento exacto en que una emoción comienza a formarse, antes de que tu cuerpo o tu voz reaccionen sin permiso.",
  blocks: [
    {
      kind: "goal",
      part: "Parte 01",
      title: "Tu objetivo",
      body: "Aprenderás a reconocer el momento exacto en que una emoción comienza a formarse — antes de que tu cuerpo o tu voz reaccionen sin permiso.",
    },
    {
      kind: "prose",
      heading: "El instante que casi nadie nota",
      paragraphs: [
        "Entre el momento en que algo sucede y el momento en que reaccionas, hay un espacio. Un espacio brevísimo — a veces dura milisegundos — donde tu cuerpo ya sabe lo que va a sentir, pero tu mente todavía no lo ha nombrado.",
        "A ese espacio se le suele llamar disparador. No es la emoción en sí, sino el chispazo que la enciende. Y aunque parezca invisible, deja huellas concretas: una tensión leve en los hombros, una pausa en la respiración, una palabra que se queda en la garganta.",
        "Aprender a notar esa huella es el primer paso para no quedar atrapado en reacciones que no elegiste.",
      ],
    },
    {
      kind: "author-insight",
      quote:
        "La mayoría de las personas con las que trabajo no necesitan ‘controlar’ sus emociones. Necesitan empezar a verlas a tiempo.",
      attribution: "Marina, sobre los primeros años de su práctica",
    },
    {
      kind: "flip",
      eyebrow: "Concepto · Ejemplo",
      front: {
        label: "Concepto",
        title: "Disparador ≠ Emoción",
        body: "El disparador es el estímulo que precede a la emoción. La emoción es la respuesta corporal y mental que sigue. Distinguirlos es el primer ejercicio clínico.",
      },
      back: {
        label: "Ejemplo",
        title: "En la vida diaria",
        body: "Tu pareja responde con un tono cortante (disparador). Tu pecho se contrae, sientes calor (emoción: ira incipiente). Lo que dices a continuación es la reacción.",
      },
    },
    {
      kind: "video",
      poster: "lavender",
      duration: "1:48",
      title: "Cómo se construye un disparador",
      caption: "Marina explica el modelo de los tres tiempos: estímulo, evaluación, respuesta.",
    },
    {
      kind: "prose",
      heading: "Tres señales del cuerpo que avisan antes",
      paragraphs: [
        "Antes de que puedas ponerle nombre a una emoción, tu cuerpo ya está dejándote pistas. Estas son las tres más útiles para empezar a notar:",
      ],
      bullets: [
        "Una contracción breve en el pecho, la garganta o el estómago.",
        "Un cambio mínimo en la respiración — más corta, más alta, retenida.",
        "Una postura que se cierra: hombros que suben, mandíbula que se tensa, manos que se cruzan.",
      ],
    },
    {
      kind: "quiz",
      part: "Parte 05",
      question: "¿Cuál de estas situaciones describe mejor un disparador?",
      options: [
        { id: "a", text: "Sentir tristeza al recordar a alguien.", correct: false, feedback: "Eso ya es la emoción en sí. El disparador es lo que la encendió — quizás una foto, un olor, una frase." },
        { id: "b", text: "Tu jefe te interrumpe en una reunión y notas que se te calienta la cara.", correct: true, feedback: "Exacto. La interrupción es el disparador; el calor en la cara es el cuerpo respondiendo antes de que la mente nombre la emoción." },
        { id: "c", text: "Decidir tomarte un té para relajarte.", correct: false, feedback: "Eso es una estrategia de regulación, no un disparador. El disparador siempre viene antes." },
      ],
    },
    {
      kind: "audio",
      title: "Práctica guiada · Notar el disparador",
      duration: "3:24",
      caption: "Una pausa breve para entrenar tu atención a los pequeños chispazos del día.",
    },
    {
      kind: "exercise",
      part: "Parte 07",
      title: "Tu cuaderno · El disparador de hoy",
      prompt:
        "Recuerda un momento del día de hoy en que reaccionaste más de lo que esperabas. Escribe en una frase qué pasó justo antes — el chispazo, no la reacción.",
      placeholder: "Hoy reaccioné cuando...",
      tip: "No te exijas precisión. Escribe lo primero que aparezca. Lo escrito se guarda solo para ti.",
    },
    {
      kind: "checklist",
      title: "Antes de continuar",
      subtitle: "Marca lo que sí pudiste hacer en esta lección.",
      items: [
        "Identifiqué la diferencia entre disparador y emoción.",
        "Reconocí al menos una señal del cuerpo que aparece antes de reaccionar.",
        "Anoté un disparador real de mi día.",
        "Estoy listo para nombrar lo que siento (lección 2).",
      ],
    },
  ],
};
