// reader/data.js — Datos del lector.
// Capítulo 5 de "Emociones en construcción" — Tristeza no es debilidad.

window.READER_BOOK = {
  id: "emociones-en-construccion",
  title: "Emociones en construcción",
  author: "Dra. Marina Salazar",
  authorInitials: "MS",
  cover: "cool",
  totalChapters: 12,
};

window.READER_CHAPTER = {
  num: 5,
  title: "Tristeza no es debilidad",
  subtitle: "Por dónde entra la tristeza, por dónde se va.",
  totalLessons: 4,
  totalMin: 20,
};

// TOC del capítulo (lecciones internas)
window.READER_LESSONS = [
  { n: 1, title: "Lo que confundimos con depresión",  min: 5, state: "done"    },
  { n: 2, title: "El cuerpo de la tristeza",            min: 6, state: "current" },
  { n: 3, title: "Cuándo se queda más de la cuenta",    min: 5, state: "ready"   },
  { n: 4, title: "Lo que se va siendo escuchada",       min: 4, state: "ready"   },
];

// Bloques del contenido — el reader los renderiza en orden.
// Algunos están marcados como "guide" (solo aparecen en Modo Guía).
window.READER_BLOCKS = [
  { kind: "lesson-head", n: 1, title: "Lo que confundimos con depresión", min: 5 },
  {
    kind: "prose",
    body:
      "La tristeza llegó primero — antes que la palabra. Antes que la cultura encontrara cómo nombrarla, " +
      "ya estaba en nosotros: el peso suave en el pecho, los ojos que se cansan de mirar, esa forma de respirar " +
      "como si el aire pesara un poco más.\n\n" +
      "Y sin embargo, cuando llega, lo primero que solemos hacer es preguntarle: ¿qué haces aquí?",
  },
  {
    kind: "pullquote",
    text: "La tristeza no es un error del sistema. Es el sistema funcionando.",
  },
  {
    kind: "prose",
    body:
      "Una de las cosas que aprendí en consulta — y que sigo aprendiendo — es que tristeza y depresión no son lo mismo. " +
      "La tristeza es una visita. Llega, se queda lo que tenga que quedarse, y se va. Trae información: dice qué cosa nos importaba, " +
      "qué perdimos, qué echamos de menos. La depresión, en cambio, es cuando la visita se instala y trae sus propias llaves.",
  },
  {
    kind: "callout",
    author: "Dra. Marina Salazar",
    body:
      "Te lo digo con franqueza: si alguna vez te dijeron que ser sensible era una debilidad, te mintieron. " +
      "La sensibilidad es uno de los instrumentos más finos que tiene el cuerpo. La cultura — no tú — confundió finura con fragilidad.",
  },
  { kind: "lesson-head", n: 2, title: "El cuerpo de la tristeza", min: 6 },
  {
    kind: "prose",
    body:
      "Antes de pensar la tristeza, conviene encontrarla en el cuerpo. La pregunta no es solo ¿qué me pone triste? — " +
      "es también ¿dónde se aloja esta tristeza en mí? Para algunas personas vive en la garganta, como un nudo que no se traga. " +
      "Para otras, en el pecho, como una presión suave que no se va con respirar profundo.",
  },
  {
    kind: "prose",
    body:
      "Notar el cuerpo cambia todo. Mientras la mente está ocupada explicándose la tristeza — buscando culpables, " +
      "armando argumentos, prometiéndose que mañana estará mejor — el cuerpo simplemente la está sintiendo. Y ese sentir, sin palabras, " +
      "es el único lugar donde la tristeza realmente puede pasar.",
  },
  {
    kind: "audio",
    guideOnly: true,
    title: "Encontrar la tristeza en el cuerpo",
    duration: "4 min",
    sub: "Audio guiado · voz de Marina",
  },
  {
    kind: "reflection",
    guideOnly: true,
    question: "Cierra los ojos un momento. ¿Dónde sientes hoy lo que te pesa?",
    chips: ["En el pecho", "En la garganta", "En el estómago", "En los hombros", "No la encuentro"],
  },
  { kind: "lesson-head", n: 3, title: "Cuándo se queda más de la cuenta", min: 5 },
  {
    kind: "prose",
    body:
      "Hay tristezas que vienen, hacen su trabajo y se van. Otras se quedan tanto que empiezan a parecer una característica de la persona " +
      "y no una respuesta a algo. Esa diferencia importa — y para reconocerla no hace falta un diagnóstico, basta con prestar atención.",
  },
  {
    kind: "checklist",
    guideOnly: true,
    title: "Señales para mirar con calma",
    sub: "Marca lo que reconozcas. Esto no diagnostica nada — solo te ayuda a notarte.",
    items: [
      "Lleva más de dos semanas sin pausa.",
      "Te ha cambiado el apetito o el sueño.",
      "Ya no encuentras gusto en cosas que antes disfrutabas.",
      "Te cuesta más concentrarte en lo cotidiano.",
      "Sientes que el día pesa antes de empezar.",
    ],
  },
  {
    kind: "prose",
    body:
      "Si reconociste varias de estas señales, no es una sentencia — es una invitación. Hablar con alguien de confianza, " +
      "buscar acompañamiento profesional, o simplemente nombrarlo en voz alta puede empezar a moverla.",
  },
  {
    kind: "callout",
    author: "Dra. Marina Salazar",
    body:
      "Buscar ayuda no es rendirse. Es lo opuesto: es tomar en serio lo que sentís. Y a veces — esto te lo digo por experiencia — " +
      "tomarte en serio es la valentía que más cuesta.",
  },
  { kind: "lesson-head", n: 4, title: "Lo que se va siendo escuchada", min: 4 },
  {
    kind: "prose",
    body:
      "Cuando la tristeza es escuchada, suele cambiar de forma. No siempre se va — a veces se queda, pero más liviana. " +
      "Como cuando alguien que pesa mucho se sienta junto a ti, en lugar de pararse encima.",
  },
  {
    kind: "exercise",
    guideOnly: true,
    title: "Una carta a la tristeza",
    sub: "10 minutos · escritura libre",
    body:
      "Sin pensar mucho. Empieza así: 'Querida tristeza, hoy quiero decirte que…' " +
      "Si te sale algo que no esperabas, está bien — siempre pasa.",
  },
  {
    kind: "prose",
    body:
      "Termino este capítulo con una invitación: cuando vuelva a venir, no la apures. " +
      "No siempre necesita ser resuelta; a veces solo necesita ser acompañada hasta la puerta.",
  },
  {
    kind: "chapter-end",
    next: { n: 6, title: "Rabia útil, rabia que daña" },
  },
];

// Eco context-aware prompts inside the chapter
window.READER_ECO_PROMPTS = [
  "¿Por qué la tristeza puede ser información?",
  "Dame un ejercicio corto para hoy.",
  "Resúmeme lo que llevo del capítulo.",
];

// Eco — estado de conversación (ancla + mensajes ya intercambiados).
window.READER_ECO_THREAD = {
  anchor: "tristeza y depresión no son lo mismo.",
  messages: [
    { role: "user", text: "¿Por qué la tristeza puede ser información?" },
    {
      role: "eco",
      text:
        "Te lo digo como lo dice Marina: la tristeza suele venir a contarte qué cosa te importaba. " +
        "Si la apuras antes de escucharla, te quedas sin saber qué perdiste.",
    },
    { role: "user", text: "¿Y cómo distingo si ya es depresión?" },
    {
      role: "eco",
      text:
        "Tres pistas suaves: lleva más de dos semanas, te cambió el sueño o el apetito, y ya nada te entusiasma. " +
        "No diagnostica nada — solo invita a no sostenerlo solo.",
    },
  ],
};

// Transcripción del audio "Encontrar la tristeza en el cuerpo".
window.READER_AUDIO_TRANSCRIPT = [
  { t: "0:00", text: "Antes de pensar la tristeza, conviene encontrarla en el cuerpo." },
  { t: "0:14", text: "Cierra los ojos un momento. Sin apretar. Sin esfuerzo." },
  { t: "0:32", text: "Lleva la atención al pecho — y deja que respire al ritmo que pide.", on: true },
  { t: "0:48", text: "Si encuentras algo que pesa, no lo apures. Acompáñalo." },
  { t: "1:07", text: "Algunas personas la sienten en la garganta, como un nudo que no se traga." },
];

// Estado del player (timestamp simulado).
window.READER_AUDIO_PLAYER = {
  current: "0:36",
  duration: "4:12",
  progress: 0.14,
  speed: "1.0×",
};

// Highlights ya guardados por la lectora (se ven al hover sobre la prosa o en TOC)
window.READER_HIGHLIGHTS = [
  { lessonN: 1, snippet: "La tristeza no es un error del sistema. Es el sistema funcionando." },
  { lessonN: 2, snippet: "Notar el cuerpo cambia todo." },
];

// Estado del lector (sesión actual)
window.READER_SESSION = {
  startedAtMin: 12,        // ya llevas 12 min en el cap.
  estTotalMin: 20,
  chapterProgress: 0.42,   // 42% del capítulo
  currentLessonIdx: 1,     // estás dentro de la lección 2
  lastReadAt: "hace 2 días",
  resumeFrom: { lessonN: 2, lessonTitle: "El cuerpo de la tristeza" },
};

// TOC global del libro — 12 capítulos.
window.READER_CHAPTERS = [
  { n: 1,  title: "Lo que nadie te enseñó a nombrar",        min: 16, state: "done" },
  { n: 2,  title: "Tu sistema nervioso te habla",            min: 22, state: "done" },
  { n: 3,  title: "Miedo · qué cuida y qué encierra",        min: 18, state: "done" },
  { n: 4,  title: "Alegría que no se siente culpable",       min: 14, state: "done" },
  { n: 5,  title: "Tristeza no es debilidad",                min: 20, state: "current" },
  { n: 6,  title: "Rabia útil, rabia que daña",              min: 24, state: "ready" },
  { n: 7,  title: "Vergüenza · la emoción más silenciosa",   min: 19, state: "ready" },
  { n: 8,  title: "Culpa que repara, culpa que pesa",        min: 17, state: "ready" },
  { n: 9,  title: "Cuando lo que sientes parece exagerado",  min: 21, state: "ready" },
  { n: 10, title: "Las emociones de los otros también pesan", min: 18, state: "ready" },
  { n: 11, title: "Volver a empezar después de sentir mucho", min: 15, state: "ready" },
  { n: 12, title: "Una vida emocional propia",               min: 23, state: "ready" },
];

// Subrayados y notas guardados (versión rica para el panel completo).
window.READER_ANNOTATIONS = [
  {
    kind: "highlight", color: "lavender",
    chapter: 5, lessonN: 1, lessonTitle: "Lo que confundimos con depresión",
    text: "La tristeza no es un error del sistema. Es el sistema funcionando.",
    when: "hoy · 11:42",
  },
  {
    kind: "note", color: "yellow",
    chapter: 5, lessonN: 1, lessonTitle: "Lo que confundimos con depresión",
    text: "tristeza y depresión no son lo mismo",
    note: "Pensar la tristeza como una visita — no como una sentencia. Me sirve para no apurarla cuando viene.",
    when: "hoy · 11:48",
  },
  {
    kind: "highlight", color: "lavender",
    chapter: 5, lessonN: 2, lessonTitle: "El cuerpo de la tristeza",
    text: "Notar el cuerpo cambia todo.",
    when: "hoy · 12:01",
  },
  {
    kind: "highlight", color: "sage",
    chapter: 4, lessonN: 3, lessonTitle: "Alegría sin culpa",
    text: "Permitirse estar bien también es un acto de salud.",
    when: "ayer · 18:22",
  },
  {
    kind: "note", color: "rose",
    chapter: 3, lessonN: 2, lessonTitle: "Miedo que cuida",
    text: "el miedo bien escuchado es información",
    note: "Mi miedo a hablar en público me venía diciendo que me importaba esa charla, no que no servía. Reescribirlo así me destrabó.",
    when: "hace 3 días",
  },
  {
    kind: "highlight", color: "yellow",
    chapter: 2, lessonN: 1, lessonTitle: "El nervio vago, en breve",
    text: "Respirar largo no relaja porque sí — le avisa al cuerpo que estás a salvo.",
    when: "la semana pasada",
  },
];
