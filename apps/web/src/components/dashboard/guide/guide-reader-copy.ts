/**
 * GR-3 / GR-4 — the copy of the guided reading panel, per pinned guide.
 *
 * Copy, not domain: nothing here decides a transition, a target key or a
 * verdict. Same rule as `guide-presentation.ts`, and the same consequence —
 * if the server names a step this build does not know, the panel fails closed
 * rather than reaching for a default screen.
 *
 * GR-4 made it a REGISTRY. A second guide needs its own words, and reusing the
 * first guide's copy under another pin would have the panel narrate a chapter
 * the reader is not in.
 */

import { guidePinKey, type GuidePin } from "./guide-pin";

export interface GuideReaderCopy {
  guideKey: string;
  guideVersion: number;

  /** The reader's fourth modality. Shared label, same in every guide. */
  modeLabel: string;

  cover: {
    eyebrow: string;
    title: string;
    duration: string;
    body: readonly string[];
    start: string;
  };

  /**
   * The clip scene. `MEDIA_PLAYER=false` — there is no asset and inventing a
   * player for one would be a lie with a play button. The transcript is
   * code-owned editorial content, so the guide continues on it.
   */
  clip: {
    title: string;
    pending: string;
    pendingNote: string;
    readTranscript: string;
    hideTranscript: string;
    transcript: readonly string[];
    continue: string;
  };

  anchor: {
    title: string;
    body: string;
    goToPassage: string;
    located: string;
    unresolved: string;
    confirm: string;
    confirmNote: string;
  };

  practice: {
    title: string;
    body: readonly string[];
    /** Presentation only: the timer is optional, local and recorded nowhere. */
    timerSeconds: number;
    timerStart: string;
    timerStop: string;
    timerNote: string;
    confirm: string;
    confirmNote: string;
  };

  recall: { title: string; submit: string };

  feedback: {
    correct: { title: string; body: string };
    review: { title: string; body: string };
    continue: string;
  };

  finish: { title: string; body: string; finish: string };

  completed: {
    banner: string;
    continueReading: string;
    returnToPassage: string;
    repeat: string;
  };

  resonance: {
    question: string;
    yes: string;
    no: string;
    saved: string;
    error: string;
  };

  checkin: { action: string; note: string };

  /** Shown when the reader picks the modality but the pilot is off for them. */
  unavailable: string;
  close: string;
  panelLabel: string;
}

/**
 * The reader's fourth MODALITY tab. It belongs to the reader, not to any one
 * guide — it is on screen before a pin has been resolved — so it is exported
 * on its own rather than reached for through a bundle that may not exist yet.
 */
export const READER_GUIDE_MODE_LABEL = "🌱 Lectura guiada";

/** Shown when the reader picks the modality but no guide can run for them. */
export const READER_GUIDE_UNAVAILABLE =
  "Lectura guiada no disponible por ahora.";

/**
 * GR-4 — shown while the server is still deciding WHICH guide this chapter
 * implies.
 *
 * Distinct from `READER_GUIDE_UNAVAILABLE` on purpose: "no disponible" is an
 * answer, and saying it during a fetch that is about to say yes would be a
 * small lie the reader might act on by closing the panel.
 */
export const READER_GUIDE_LOADING = "Buscando la guía de este capítulo…";

/** Words that are the product's, not a chapter's — identical in every guide. */
const SHARED = {
  modeLabel: READER_GUIDE_MODE_LABEL,
  resonance: {
    question: "¿Esta idea fue personalmente significativa para ti?",
    yes: "Esto me resonó",
    no: "Ahora no",
    saved: "Añadido a tu mapa. Puedes verlo (y quitarlo) en Mis resonancias.",
    error: "No pudimos guardarlo. Reintenta.",
  },
  checkin: {
    action: "Registrar mi momento",
    note: "Opcional. Lo eliges tú; la guía no interpreta cómo te sientes.",
  },
  unavailable: READER_GUIDE_UNAVAILABLE,
  close: "Cerrar",
  panelLabel: "Lectura guiada",
} as const;

// ─── Emociones en Construcción · capítulo 1 ──────────────────────────────────

const EEC_C1_COPY: GuideReaderCopy = {
  guideKey: "eec-c1-cuerpo-antes-que-mente",
  guideVersion: 1,
  ...SHARED,

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
    located: "Pasaje localizado en el capítulo.",
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
    timerSeconds: 45,
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
};

// ─── Parejas que perduran · capítulo 1 ───────────────────────────────────────

/**
 * Copy derived from `docs/product/parejas-guide-v1-first-definition.md`.
 *
 * Editorial rules honoured here: a short paraphrase rather than a long
 * passage, no claim the book does not make, no added neuroscience, and never
 * the correct option. The chapter's own experiment is described in the words
 * the document approved — sitting face to face, holding hands, holding the
 * gaze in silence — and nothing is inferred beyond it.
 */
const PQP_C1_COPY: GuideReaderCopy = {
  guideKey: "pqp-c1-contacto-sostenido",
  guideVersion: 1,
  ...SHARED,

  cover: {
    eyebrow: "Guía breve",
    title: "El contacto sostenido en silencio",
    duration: "15–20 minutos",
    body: [
      "Una lectura acompañada del capítulo 1: una idea corta, el pasaje del " +
        "libro, el ejercicio que propone y una pregunta para recordar lo leído.",
      "Puedes salir cuando quieras — tu avance queda guardado en el punto " +
        "donde lo dejes.",
    ],
    start: "Empezar",
  },

  clip: {
    title: "Un clip breve",
    pending: "Clip breve en producción",
    pendingNote:
      "Todavía no está grabado. Mientras tanto, puedes leer lo que dice.",
    readTranscript: "Leer transcripción",
    hideTranscript: "Ocultar transcripción",
    transcript: [
      "El capítulo abre con un experimento: a parejas en conflicto se les " +
        "pidió sentarse frente a frente y sostener el contacto durante diez " +
        "minutos.",
      "Sin disculpas y sin buscar soluciones. Solo las manos tomadas y la " +
        "mirada, en silencio.",
      "Después el capítulo sigue con un caso de consultorio que aplica ese " +
        "mismo ejercicio.",
    ],
    continue: "Continuar",
  },

  anchor: {
    title: "El pasaje del capítulo",
    body:
      "Esta guía se apoya en el pasaje que describe el experimento. Puedes " +
      "ir a leerlo en su lugar y volver aquí cuando quieras.",
    goToPassage: "Ir al pasaje",
    located: "Pasaje localizado en el capítulo.",
    unresolved:
      "No pudimos ubicar el pasaje en esta edición del capítulo. Puedes " +
      "seguir con la guía igual.",
    confirm: "He explorado esta idea",
    confirmNote:
      "Marcarlo registra que llegaste hasta aquí; no evalúa lo que entendiste.",
  },

  practice: {
    title: "Ejercicio 3: El Mapa de las Miradas",
    body: [
      "Si tienes con quién hacerlo, siéntense frente a frente y tómense de " +
        "las manos. Sostengan la mirada en silencio.",
      "Sin disculpas y sin resolver nada. Diez minutos, tal como lo propone " +
        "el capítulo.",
    ],
    timerSeconds: 600,
    timerStart: "Usar 10 minutos",
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
};

// ─── Registry ────────────────────────────────────────────────────────────────

export type GuideReaderCopyErrorCode =
  | "GUIDE_READER_COPY_INVALID_PIN"
  | "GUIDE_READER_COPY_DUPLICATE_PIN";

export class GuideReaderCopyError extends Error {
  readonly code: GuideReaderCopyErrorCode;
  constructor(code: GuideReaderCopyErrorCode) {
    super(code);
    this.name = "GuideReaderCopyError";
    this.code = code;
  }
}

export class GuideReaderCopyRegistry {
  private readonly byPin = new Map<string, GuideReaderCopy>();

  constructor(entries: readonly GuideReaderCopy[]) {
    for (const copy of entries) {
      const key = guidePinKey({
        guideKey: copy.guideKey,
        guideVersion: copy.guideVersion,
      });
      if (key === null) {
        throw new GuideReaderCopyError("GUIDE_READER_COPY_INVALID_PIN");
      }
      if (this.byPin.has(key)) {
        throw new GuideReaderCopyError("GUIDE_READER_COPY_DUPLICATE_PIN");
      }
      this.byPin.set(key, copy);
    }
  }

  /** EXACT lookup. An unknown pin is `null`, never the other guide's words. */
  getExact(pin: GuidePin): GuideReaderCopy | null {
    const key = guidePinKey(pin);
    if (key === null) return null;
    return this.byPin.get(key) ?? null;
  }

  get size(): number {
    return this.byPin.size;
  }
}

export const PRODUCTION_GUIDE_READER_COPY: readonly GuideReaderCopy[] = [
  EEC_C1_COPY,
  PQP_C1_COPY,
];

export const guideReaderCopyRegistry = new GuideReaderCopyRegistry(
  PRODUCTION_GUIDE_READER_COPY,
);
