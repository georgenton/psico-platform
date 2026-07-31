/**
 * GR-3 — the copy of the guided reading panel.
 *
 * Copy, not domain: nothing here decides a transition, a target key or a
 * verdict. Same rule as `guide-presentation.ts`, and the same consequence —
 * if the server names a step this build does not know, the panel fails closed
 * rather than reaching for a default screen.
 */

export const GUIDE_READER_COPY = {
  /** The reader's fourth modality. */
  modeLabel: "🌱 Lectura guiada",

  cover: {
    eyebrow: "Guía breve",
    title: "El cuerpo sabe antes que la mente",
    duration: "8–10 minutos",
    body: [
      "Una lectura acompañada del capítulo 1: una idea corta, un pasaje del " +
        "libro, una práctica y una pregunta para recordar lo leído.",
      "Puedes salir cuando quieras — tu avance queda guardado en el punto " +
        "donde lo dejes.",
    ],
    start: "Empezar",
  },

  clip: {
    title: "Un clip breve",
    /**
     * The video does not exist yet, and inventing a player for it would be a
     * lie with a play button. The transcript is the real editorial content of
     * this scene, so the guide continues on it.
     */
    pending: "Clip breve en producción",
    pendingNote:
      "Todavía no está grabado. Mientras tanto, puedes leer lo que dice.",
    readTranscript: "Leer transcripción",
    hideTranscript: "Ocultar transcripción",
    transcript: [
      "Cuando algo nos afecta, el cuerpo se mueve primero: el pecho se " +
        "aprieta, la respiración se acorta, los hombros suben.",
      "La mente llega después, a ponerle nombre. Por eso a veces sabemos que " +
        "algo nos pasó mucho antes de poder explicarlo.",
      "Este capítulo propone algo simple: escuchar esa señal temprana sin " +
        "apurarse a interpretarla.",
    ],
    continue: "Continuar",
  },

  anchor: {
    title: "El pasaje del capítulo",
    body:
      "Esta guía se apoya en un pasaje concreto del capítulo. Puedes ir a " +
      "leerlo en su lugar y volver aquí cuando quieras.",
    goToPassage: "Ir al pasaje",
    /** Announced to assistive technology after the scroll. */
    located: "Pasaje localizado en el capítulo.",
    /**
     * Shown when the resolver could not identify the paragraph. Factual: it
     * does not blame the reader and it does not name an internal id.
     */
    unresolved:
      "No pudimos ubicar el pasaje en esta edición del capítulo. Puedes " +
      "seguir con la guía igual.",
    confirm: "He explorado esta idea",
    confirmNote:
      "Marcarlo registra que llegaste hasta aquí; no evalúa lo que entendiste.",
  },

  practice: {
    title: "Escucharte por dentro",
    body: [
      "Deja el libro un momento. Nota dónde está tu cuerpo ahora mismo: los " +
        "pies, la espalda, la mandíbula.",
      "No busques sentir nada en particular. Solo mira qué hay.",
    ],
    timerStart: "Usar 45 segundos",
    timerStop: "Detener",
    timerNote: "El temporizador es opcional y no se registra en ningún lado.",
    confirm: "Terminé la práctica",
    confirmNote:
      "Este botón registra tu propia confirmación; la app no verifica la práctica.",
  },

  recall: {
    title: "Recordar lo leído",
    submit: "Registrar respuesta",
  },

  feedback: {
    correct: {
      title: "Eso es lo que dice el capítulo",
      body: "Tu respuesta coincide con lo que plantea el texto.",
    },
    /**
     * `REVIEW`, never «incorrecto». The measurement stays in the ledger; what
     * the reader gets is an invitation to volver a mirar.
     */
    review: {
      title: "Vale la pena volver al pasaje",
      body:
        "El capítulo lo plantea distinto. Puedes releer el pasaje cuando " +
        "quieras — no hay calificación aquí.",
    },
    continue: "Continuar",
  },

  finish: {
    title: "Ya registraste los tres pasos",
    body: "Cuando quieras, cierra la guía para dejarla registrada como terminada.",
    finish: "Terminar",
  },

  completed: {
    banner: "COMPLETASTE ESTA LECTURA GUIADA",
    continueReading: "Continuar leyendo",
    returnToPassage: "Volver al pasaje",
    repeat: "Repetir la guía",
  },

  resonance: {
    question: "¿Esta idea fue personalmente significativa para ti?",
    yes: "Esto me resonó",
    no: "Ahora no",
    saved: "Añadido a tu mapa. Puedes verlo (y quitarlo) en Mis resonancias.",
    error: "No pudimos guardarlo. Reintenta.",
  },

  checkin: {
    /** Optional, separate, and never pre-filled by the guide. */
    action: "Registrar mi momento",
    note: "Opcional. Lo eliges tú; la guía no interpreta cómo te sientes.",
  },

  /** Shown when the reader picks the modality but the pilot is off for them. */
  unavailable: "Lectura guiada no disponible por ahora.",

  close: "Cerrar",
  panelLabel: "Lectura guiada",
} as const;
