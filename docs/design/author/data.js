// author/data.js — Author Studio state for the prototype.
// Demo data for: author profile, books in different states, draft lesson
// content (the editor's working set), AI helper actions, publication flow,
// version history, and the guided templates a new lesson can start from.

window.AUTHOR_PROFILE = {
  name: "Dra. Marina Salazar",
  role: "Psicóloga clínica · Editora",
  avatarInitials: "MS",
  badge: "Autora principal",
  // For invited authors (later phase): revenue share is shown in the profile.
  revShareDescription: "70% al autor · 30% a la plataforma",
};

// One book being edited + two others as catalog context for the dashboard.
window.AUTHOR_BOOKS = [
  {
    id: "emociones-en-construccion",
    title: "Emociones en construcción",
    subtitle: "Una guía para entenderte sin juzgarte",
    cover: "mixed",
    status: "publicado",
    chapters: 12,
    lessons: 24,
    estMinutes: 240,
    metrics: {
      readers: 1483,
      activePro: 412,
      completion: 0.58,
      revenue30d: 1124,
      revenueAuthor30d: 786,
      avgMoodRecommended: "Reflexión",
      topTab: "Pregúntale a Marina",
      ratingsAvg: 4.7,
      ratingsCount: 218,
    },
  },
  {
    id: "familias-ensambladas",
    title: "Familias ensambladas",
    subtitle: "El arte de construir lazos cuando todo se mueve",
    cover: "cool",
    status: "publicado",
    chapters: 10,
    lessons: 20,
    estMinutes: 195,
    metrics: {
      readers: 612,
      activePro: 198,
      completion: 0.42,
      revenue30d: 478,
      revenueAuthor30d: 334,
      avgMoodRecommended: "Calma",
      topTab: "Lección",
      ratingsAvg: 4.6,
      ratingsCount: 96,
    },
  },
  {
    id: "el-cuerpo-que-recuerda",
    title: "El cuerpo que recuerda",
    subtitle: "Aprender a leer las señales antes de que se vuelvan síntoma",
    cover: "warm",
    status: "borrador",
    chapters: 8,
    lessons: 4,   // 4 escritas de 8 capítulos planeados
    estMinutes: 60,
    metrics: null, // not published yet
    progress: 0.32,
  },
];

window.AUTHOR_BOOK_STRUCTURE = {
  bookId: "emociones-en-construccion",
  chapters: [
    {
      id: "c1",
      number: 1,
      title: "Reconocer la emoción antes de reaccionar",
      subtitle: "Aprender a notar lo que sientes en el momento en que sucede.",
      status: "publicado",
      lessons: [
        { id: "l1", number: 1, title: "El disparador invisible",         status: "publicado",       updatedAgo: "hace 3 días"   },
        { id: "l2", number: 2, title: "Nombrar lo que sientes",          status: "publicado",       updatedAgo: "hace 1 semana" },
        { id: "l3", number: 3, title: "La pausa de tres segundos",       status: "en-revision",     updatedAgo: "hace 4 horas"  },
        { id: "l4", number: 4, title: "Cuando el cuerpo habla primero",  status: "borrador",        updatedAgo: "hace 12 min"   },
        { id: "l5", number: 5, title: "Tu mapa emocional de la semana",  status: "vacio",           updatedAgo: "sin contenido" },
      ],
    },
    {
      id: "c2", number: 2, title: "El origen de tus reacciones",
      subtitle: "Por qué reaccionas así y no de otra forma.",
      status: "publicado",
      lessons: [
        { id: "c2l1", number: 1, title: "El primer recuerdo emocional",  status: "publicado", updatedAgo: "hace 2 sem" },
        { id: "c2l2", number: 2, title: "Lo que aprendiste sin saber",    status: "publicado", updatedAgo: "hace 2 sem" },
        { id: "c2l3", number: 3, title: "Patrones que ya no te sirven",  status: "publicado", updatedAgo: "hace 2 sem" },
      ],
    },
    {
      id: "c3", number: 3, title: "Sentir sin dejar de pensar",
      subtitle: "Construir un diálogo entre cabeza y corazón.",
      status: "en-revision",
      lessons: [
        { id: "c3l1", number: 1, title: "El tercer espacio", status: "en-revision", updatedAgo: "hace 2 días" },
      ],
    },
    {
      id: "c4", number: 4, title: "Las emociones que evitas",
      subtitle: "Lo que rechazas también te construye.",
      status: "borrador",
      lessons: [
        { id: "c4l1", number: 1, title: "El nombre que no quieres dar", status: "borrador", updatedAgo: "hace 5 días" },
      ],
    },
  ],
};

// The working draft — what the editor is editing. The lesson is in progress;
// some blocks are filled, others empty placeholders ("paso siguiente").
window.AUTHOR_LESSON_DRAFT = {
  id: "l4",
  chapterId: "c1",
  chapterTitle: "Reconocer la emoción antes de reaccionar",
  number: 4,
  title: "Cuando el cuerpo habla primero",
  subtitle: "Aprender a leer las señales corporales antes de que se vuelvan emoción.",
  durationMin: 9,
  status: "borrador",            // borrador · en-revision · aprobado · publicado
  lastSavedAgo: "hace 12 min",
  reviewer: null,
  approver: null,
  blocks: [
    {
      id: "b1",
      kind: "goal",
      title: "Tu objetivo",
      body: "Aprenderás a reconocer las señales del cuerpo que aparecen antes de que una emoción llegue a tu mente.",
    },
    {
      id: "b2",
      kind: "prose",
      heading: "Lo que tu cuerpo sabe primero",
      paragraphs: [
        "Tu cuerpo es un detector finísimo. Antes de que tu mente nombre lo que pasa, tu cuerpo ya está respondiendo. Una respiración que se acorta, un hombro que sube, una mano que se cierra. Esas señales son emociones en formación.",
        "Cuando aprendes a leerlas, ganas un margen de tiempo precioso — el espacio entre el estímulo y la reacción.",
      ],
    },
    {
      id: "b3",
      kind: "video",
      title: "El mapa corporal de las emociones",
      caption: "Marina explica las 5 zonas donde cada emoción tiende a aparecer.",
      duration: "2:14",
      url: "",
      poster: "lavender",
    },
    {
      id: "b4",
      kind: "exercise",
      title: "Mapea tu cuerpo ahora",
      prompt: "Cierra los ojos por 30 segundos. ¿Dónde sientes tensión, calor o pesadez? Escríbelo como si describieras un paisaje.",
      placeholder: "Siento...",
      tip: "No interpretes — solo describe la sensación física.",
    },
    {
      id: "b5",
      kind: "placeholder",
      hint: "Agrega un quiz aquí · paso 5 de la plantilla",
      forKind: "quiz",
    },
  ],
};

// AI helpers shown in the editor's right rail.
window.AUTHOR_AI_HELPERS = [
  {
    id: "suggest-quiz",
    title: "Sugerir un quiz",
    body: "Crea una pregunta con 3 opciones basada en el texto que acabas de escribir.",
    icon: "quiz",
  },
  {
    id: "convert-libro-guia",
    title: "Convertir Libro → Guía",
    body: "Toma este capítulo en prosa y propone una división en bloques interactivos.",
    icon: "convert",
  },
  {
    id: "suggest-next",
    title: "Sugerir el siguiente bloque",
    body: "Marina lee lo que llevas escrito y propone qué viene mejor a continuación.",
    icon: "next",
  },
  {
    id: "tone-review",
    title: "Revisar tono",
    body: "Detecta lenguaje clínico o frío y sugiere una versión más cálida.",
    icon: "tone",
  },
  {
    id: "summarize",
    title: "Generar resumen / objetivo",
    body: "Redacta el bloque 'Tu objetivo' a partir del cuerpo de la lección.",
    icon: "summary",
  },
  {
    id: "inclusivity",
    title: "Detectar lenguaje estigmatizante",
    body: "Marca palabras o frases que pueden sentirse juzgadoras y propone alternativas.",
    icon: "inclusivity",
  },
  {
    id: "image",
    title: "Sugerir imagen de portada",
    body: "Genera 3 opciones abstractas con la IA visual, en la paleta del libro.",
    icon: "image",
  },
];

// Guided templates a new lesson can start from.
window.AUTHOR_TEMPLATES = [
  {
    id: "basica",
    name: "Lección guiada básica",
    sub: "4 pasos · 6-10 min de lectura",
    description: "El esqueleto recomendado: objetivo → contenido → video o ejercicio → quiz de cierre.",
    blocks: ["goal", "prose", "video", "quiz"],
    recommended: true,
  },
  {
    id: "introspectiva",
    name: "Lección introspectiva",
    sub: "5 pasos · journaling al cierre",
    description: "Para temas íntimos. Cita del autor, prosa, audio guiado, ejercicio de escritura, checklist.",
    blocks: ["author-insight", "prose", "audio", "exercise", "checklist"],
  },
  {
    id: "concepto-ejemplo",
    name: "Concepto + ejemplo",
    sub: "6 pasos · alta densidad",
    description: "Para enseñar un marco teórico. Objetivo, prosa, flip card, video, quiz multi-pregunta, sidebar.",
    blocks: ["goal", "prose", "flip", "video", "quiz", "sidebar"],
  },
  {
    id: "vacia",
    name: "Lección vacía",
    sub: "Sin estructura",
    description: "Empezar desde cero. Tú decides qué bloques agregar.",
    blocks: [],
  },
];

// 15 block kinds the author can insert. Each entry is the meta for the
// /-menu (Notion variation) and the "+ agregar bloque" sheet (Substack).
window.AUTHOR_BLOCK_LIBRARY = [
  { kind: "title",          name: "Título de sección",            icon: "title",     group: "Texto" },
  { kind: "prose",          name: "Texto largo con bullets",      icon: "prose",     group: "Texto" },
  { kind: "goal",           name: "Callout 'Objetivo'",           icon: "goal",      group: "Texto" },
  { kind: "author-insight", name: "Cita del autor",                icon: "quote",     group: "Texto" },
  { kind: "sidebar",        name: "Sidebar / aforismo",            icon: "sidebar",   group: "Texto" },
  { kind: "flip",           name: "Flip card · concepto/ejemplo",  icon: "flip",      group: "Interactivo" },
  { kind: "quiz",           name: "Quiz · una pregunta",           icon: "quiz",      group: "Interactivo" },
  { kind: "assessment",     name: "Assessment · multi-pregunta",   icon: "assessment",group: "Interactivo" },
  { kind: "checklist",      name: "Checklist al cierre",           icon: "checklist", group: "Interactivo" },
  { kind: "exercise",       name: "Ejercicio de journaling",       icon: "exercise",  group: "Interactivo" },
  { kind: "video",          name: "Video (YouTube / upload)",      icon: "video",     group: "Multimedia" },
  { kind: "audio",          name: "Audio guiado",                  icon: "audio",     group: "Multimedia" },
  { kind: "image",          name: "Imagen",                        icon: "image",     group: "Multimedia" },
  { kind: "pdf",            name: "PDF descargable",               icon: "pdf",       group: "Multimedia" },
  { kind: "separator",      name: "Separador visual",              icon: "separator", group: "Multimedia" },
];

window.AUTHOR_VERSION_HISTORY = [
  { id: "v9", label: "Versión actual · auto-guardada", time: "hace 12 min", actor: "Tú", note: "Agregaste el bloque Ejercicio." },
  { id: "v8", label: "Versión 8 · cambios mayores",   time: "hace 2 horas", actor: "Tú", note: "Reescribiste el párrafo de cuerpo." },
  { id: "v7", label: "Versión 7 · revisión editorial", time: "hace 1 día",   actor: "Editora · Ana C.", note: "Sugirió suavizar la última frase." },
  { id: "v6", label: "Versión 6 · enviada a revisión", time: "hace 1 día",   actor: "Tú", note: "Cambio de estado: Borrador → En revisión." },
  { id: "v5", label: "Versión 5 · primer borrador",    time: "hace 3 días",  actor: "Tú", note: "Creación inicial desde plantilla 'Básica'." },
];

window.PUBLICATION_STEPS = [
  { id: "borrador",   label: "Borrador",       sub: "Solo tú la ves" },
  { id: "en-revision",label: "En revisión",    sub: "Editor lee y comenta" },
  { id: "aprobado",   label: "Aprobado",       sub: "Listo para publicar" },
  { id: "publicado",  label: "Publicado",      sub: "Disponible para lectores" },
];
