// detalle/data.js — Datos del libro de detalle.
// Anclamos en "Emociones en construcción" (libro insignia, plan FREE → caps 2+ Pro).

window.PSICO_BOOK = {
  id: "emociones-en-construccion",
  slug: "emociones-en-construccion",
  title: "Emociones en construcción",
  subtitle: "Aprende a notar antes de reaccionar.",
  description:
    "Un mapa pausado para identificar, comprender y nombrar lo que sientes. " +
    "Con herramientas de psicología cognitiva, ejercicios breves y la voz cálida de Marina Salazar — quien lleva 18 años acompañando a personas en consulta.",
  cover: "cool",               // gradient class
  category: "Emociones · Psicoeducación",
  language: "Español · neutro latinoamericano",
  publishedAt: "Marzo 2025",
  totalChapters: 12,
  totalLessons: 48,             // suma de lecciones
  duration: "3 h 20 min",
  rating: 4.8,
  reviewsCount: 1284,
  readersCount: "12.4k",
  plan: "FREE-then-PRO",        // cap 1 gratuito; resto Pro
  badge: "Más leído",
  formats: ["Lectura", "Audio", "Ejercicios", "Quizzes"],
  // Aprendizajes
  learnings: [
    "Identificar lo que sientes sin etiquetas rígidas.",
    "Crear pausa entre lo que sientes y lo que decides hacer.",
    "Reconocer el cuerpo como guía, no como obstáculo.",
    "Sostener emociones difíciles sin huir ni explotar.",
  ],
};

window.PSICO_AUTHOR = {
  initials: "MS",
  name: "Dra. Marina Salazar",
  title: "Psicóloga clínica · Quito",
  yearsPracticing: 18,
  bio:
    "Psicóloga clínica con especialización en terapia cognitivo-conductual y trauma. " +
    "Dirige el Centro Refugio en Quito desde 2014. Escribe libros que parecen conversaciones — porque eso es lo que la consulta le enseñó.",
  otherBooks: [
    { id: "familias-ensambladas", title: "Familias ensambladas", cover: "mixed", plan: "PRO", chapters: 10 },
    { id: "hijos-que-escuchan",    title: "Hijos que escuchan",   cover: "cool",  plan: "PRO", chapters: 9 },
  ],
};

window.PSICO_CHAPTERS = [
  { n: 1,  title: "Lo que sientes no es lo que eres",         sub: "Una invitación a observarte sin juzgarte.",       min: 14, lessons: 4, plan: "FREE", state: "done"    },
  { n: 2,  title: "El nombre de cada emoción",                sub: "Por qué nombrar lo que sentimos cambia cómo lo vivimos.", min: 18, lessons: 5, plan: "PRO",  state: "done"    },
  { n: 3,  title: "La pausa entre el estímulo y la respuesta",sub: "Un espacio que se entrena, no que se hereda.",     min: 16, lessons: 4, plan: "PRO",  state: "done"    },
  { n: 4,  title: "Miedo, ansiedad, alerta",                  sub: "Cuándo la alarma protege y cuándo se queda demás.",min: 22, lessons: 5, plan: "PRO",  state: "done"    },
  { n: 5,  title: "Tristeza no es debilidad",                 sub: "Por dónde entra la tristeza, por dónde se va.",    min: 20, lessons: 4, plan: "PRO",  state: "current" },
  { n: 6,  title: "Rabia útil, rabia que daña",               sub: "La diferencia entre proteger un límite y romperlo.",min: 17, lessons: 4, plan: "PRO",  state: "ready"   },
  { n: 7,  title: "Alegría y lo que la sostiene",             sub: "Cultivar bienestar sin forzarlo.",                  min: 14, lessons: 3, plan: "PRO",  state: "ready"   },
  { n: 8,  title: "Vergüenza, culpa y otros pesos",           sub: "Las emociones que aprendiste a esconder.",          min: 19, lessons: 4, plan: "PRO",  state: "ready"   },
  { n: 9,  title: "Pedir ayuda como práctica",                sub: "Por qué cuesta — y por qué importa.",              min: 12, lessons: 3, plan: "PRO",  state: "ready"   },
  { n: 10, title: "Volver al cuerpo",                         sub: "El cuerpo también recuerda. Y también suelta.",     min: 16, lessons: 4, plan: "PRO",  state: "ready"   },
  { n: 11, title: "Crear hábitos emocionales",                sub: "Pequeños rituales que sostienen lo aprendido.",     min: 14, lessons: 4, plan: "PRO",  state: "ready"   },
  { n: 12, title: "Cierre · Lo que llevas contigo",           sub: "Una carta final — y un mapa para volver.",          min: 10, lessons: 4, plan: "PRO",  state: "ready"   },
];

// Reseñas — verificadas, en idioma natural, latinoamericano neutro.
window.PSICO_REVIEWS = [
  {
    initials: "PE", name: "Paola E.", country: "Ecuador",
    rating: 5, when: "Hace 3 días",
    text: "El capítulo 3 me cambió la semana. La idea de la pausa no es nueva pero acá está explicada en términos del cuerpo, no de la mente — eso lo hace practicable.",
    chapter: 3,
  },
  {
    initials: "DR", name: "Diego R.", country: "Colombia",
    rating: 5, when: "Hace 1 semana",
    text: "Lo leí en voz baja durante las noches, una lección por día. No es un libro para terminar rápido — es para quedarse adentro.",
    chapter: null,
  },
  {
    initials: "VS", name: "Valentina S.", country: "México",
    rating: 4, when: "Hace 2 semanas",
    text: "Esperaba algo más clínico y resultó ser más cercano. Eso me costó al principio, pero después agradecí.",
    chapter: 5,
  },
];

// Distribución de ratings
window.PSICO_RATING_BREAKDOWN = [
  { stars: 5, pct: 78 },
  { stars: 4, pct: 17 },
  { stars: 3, pct:  4 },
  { stars: 2, pct:  1 },
  { stars: 1, pct:  0 },
];
