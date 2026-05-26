// eco/data.js — Eco companion · datos.

window.ECO = {
  name: "Eco",
  tagline: "Tu eco · te ayuda a escucharte",
  description: "Eco escucha lo que sientes y te ayuda a ponerle nombre. " +
               "Está entrenado con los textos de la Dra. Marina Salazar y los ejercicios de Psico Platform.",
  // Soft visual signature
  initials: "✦",
};

// Lo que Eco puede / no puede hacer (boundaries explícitos)
window.ECO_CAPS = {
  can: [
    { icon: "👂", title: "Escuchar y nombrar",       sub: "Lo que sientes — sin juicio." },
    { icon: "📖", title: "Conectar con tus libros",  sub: "Recuerda los capítulos que has leído." },
    { icon: "🌬", title: "Proponer ejercicios",      sub: "Breves, prácticos, para el momento." },
    { icon: "✎",  title: "Guardar en tu diario",     sub: "Solo si tú lo permites." },
  ],
  cant: [
    { title: "No reemplazo terapia profesional",          sub: "Soy un complemento — no un sustituto." },
    { title: "No diagnostico ni recomiendo medicamentos", sub: "Eso es trabajo de profesionales." },
    { title: "Si estás en crisis, te conecto con ayuda",  sub: "Lína 171 (Ecuador) · Crisis Text Line (LATAM)." },
  ],
};

// Prompts sugeridos para empezar
window.ECO_PROMPTS = [
  { id: "ansioso",   label: "Me siento ansioso/a",            icon: "🌊" },
  { id: "dormir",    label: "Me cuesta dormir",                icon: "🌙" },
  { id: "no-se",     label: "No entiendo qué siento",          icon: "🌫" },
  { id: "pausa",     label: "Necesito una pausa",              icon: "🍃" },
  { id: "relacion",  label: "Tuve una conversación difícil",   icon: "💬" },
  { id: "duelo",     label: "Estoy pasando por un duelo",      icon: "🕯" },
];

// ── Conversaciones · estados ──
// Cada mensaje: { from: "user" | "eco" | "system", text, time, card? }

window.ECO_CONVERSATIONS = {
  empty: [],

  short: [
    {
      from: "eco",
      time: "ahora",
      text:
        "Hola, Ana. Soy Eco. Estoy aquí para acompañarte mientras lees y reflexionas. " +
        "Puedes contarme lo que sientes — yo te ayudo a ponerle nombre, a recordarte de qué hablan tus libros, o a proponerte un ejercicio breve. " +
        "Nada de lo que me digas se comparte. ¿Por dónde te gustaría empezar?",
    },
  ],

  long: [
    // ── Apertura
    { from: "eco",  time: "8:12",  text:
      "Buenos días, Ana. ¿Cómo llegas hoy?" },

    { from: "user", time: "8:14",  text:
      "Cansada. Llevo unos días durmiendo mal." },

    { from: "eco",  time: "8:14",  text:
      "Te escucho. Cuéntame un poco más — ¿es que te cuesta dormirte, o te despiertas mucho en la noche?" },

    { from: "user", time: "8:15",  text:
      "Me cuesta dormirme. Pienso mucho en el trabajo." },

    { from: "eco",  time: "8:15",  text:
      "Eso suena cansado por partida doble — el cuerpo quiere descansar y la mente sigue en marcha. " +
      "Lo que describes lo llamamos rumiación nocturna. Es muy común, y se puede acompañar. En el libro que estás leyendo hay un pasaje que conecta con esto:" },

    // Rich card: capítulo
    { from: "eco",  time: "8:15",  card: {
      kind: "chapter",
      bookTitle: "Emociones en construcción",
      cover: "cool",
      chapter: "Cap. 4 · Miedo, ansiedad, alerta",
      excerpt: "“No todo lo que se acelera es ansiedad. A veces es solo el cuerpo terminando un día — pero la mente todavía no se ha enterado.”",
      sub: "Dra. Marina Salazar",
      cta: "Abrir capítulo",
    }},

    { from: "eco",  time: "8:16",  text:
      "Antes de leerlo (si quieres), te propongo algo concreto para esta noche — 7 minutos. " +
      "No tienes que hacer nada especial: poner los pies en el suelo y dejar que la grabación haga el resto." },

    // Rich card: ejercicio
    { from: "eco",  time: "8:16",  card: {
      kind: "exercise",
      title: "Aterrizar antes de dormir",
      sub: "Audio guiado · 7 min · Voz de Marina",
      cover: "mixed",
      cta: "Empezar ahora",
      ctaAlt: "Guardar para la noche",
    }},

    { from: "user", time: "8:17",  text:
      "Lo intento. ¿Qué pasa si no puedo dejar de pensar?" },

    { from: "eco",  time: "8:17",  text:
      "Que también está bien. La rumiación no se “apaga” — se acompaña. Notar el pensamiento sin entrar a discutirlo es ya un paso. " +
      "¿Quieres que te envíe el ejercicio por correo para tenerlo a mano esta noche?" },

    { from: "user", time: "8:18",  text:
      "Sí, por favor." },

    { from: "eco",  time: "8:18",  text:
      "Listo. Te lo guardo en tu diario también, para que mañana pueda recordarte cómo te fue. " +
      "Si quieres seguir luego, vuelve cuando puedas — yo me acuerdo de dónde quedamos." },

    // System pill
    { from: "system", text: "✓ Guardado en tu diario · Ejercicio enviado a tu correo" },
  ],
};

// ── Eco "rail" — paneles a la derecha en web ──
window.ECO_RAIL = {
  // "Lo que Eco aprendió de ti" — soft memory (opt-in)
  memory: [
    { lbl: "Mood frecuente",     val: "Reflexión" },
    { lbl: "Lees mejor",         val: "En la noche" },
    { lbl: "Libro en curso",     val: "Emociones en construcción · cap. 5" },
    { lbl: "Tu motivo principal", val: "Entender mejor mis emociones" },
  ],

  // Ejercicios recientes sugeridos
  exercises: [
    { title: "Aterrizar antes de dormir", min: 7,  cover: "mixed" },
    { title: "Respiración 4-7-8",          min: 4,  cover: "cool" },
    { title: "Notar sin nombrar",          min: 10, cover: "warm" },
  ],

  // Sesiones anteriores (historial corto)
  recent: [
    { title: "Sobre el cansancio matutino", when: "Anoche · 12 mensajes",  preview: "Notamos que el descanso te cuesta entre semana." },
    { title: "Discusión con mi pareja",       when: "Sábado · 8 mensajes",   preview: "Nombrar el límite antes de defenderlo." },
    { title: "Antes de la sesión con Sara",   when: "Hace 1 sem · 5 mens.",  preview: "Llegabas con expectativas altas." },
  ],
};
