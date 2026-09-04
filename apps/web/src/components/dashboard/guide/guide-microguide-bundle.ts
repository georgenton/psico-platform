/**
 * A microguide, as the browser needs it — and the two shapes it turns into.
 *
 * Every chapter's route is the same product: one idea, three steps, a reader
 * panel that says the same things in the same order. What changes between
 * chapters is the copy and the key prefix, so the copy lives in a table per
 * chapter (`eec-c01-microguides.ts`, `eec-c02-microguides.ts`) and the shape
 * lives here, once.
 *
 * Written this way after C02: a second hand-copied factory would have been a
 * second place for the panel's wording to drift, and drift in a reader panel
 * is invisible until somebody compares two chapters side by side.
 *
 * Nothing here composes copy. It arranges approved strings — the manifests'
 * scenes and the PUBLIC half of the server-side recall catalog — into the
 * structures the registries want. The correct option is not among the inputs,
 * so nothing in this file could leak it.
 */

import type { GuidePresentation } from "./guide-presentation";
import type { GuideReaderCopy } from "./guide-reader-copy";
import { READER_GUIDE_SHARED } from "./guide-reader-shared";

/** What differs between one chapter's route and another's. */
export interface MicroguideChapter {
  /** The platform key prefix — `eec-c1`, `eec-c2`. */
  readonly keyPrefix: string;
  /** How the recall step names the chapter: «lo que dice el capítulo 2». */
  readonly chapterLabel: string;
}

export interface MicroguideEntry {
  slug: string;
  practiceSlug: string;
  title: string;
  /** The route card's one-liner. Same words the route endpoint serves. */
  summary: string;
  duration: string;
  intro: { title: string; body: readonly string[]; note: string };
  passage: { title: string; body: string };
  concept: {
    title: string;
    body: readonly string[];
    note: string;
  };
  practice: { title: string; body: readonly string[]; note: string };
  recall: {
    question: string;
    options: readonly { optionKey: string; label: string }[];
  };
  summaryScene: { title: string; body: readonly string[] };
}

const LABELS = {
  start: "Empezar guía",
  resume: "Continuar guía",
  restart: "Empezar de nuevo",
  finish: "Finalizar guía",
  exit: "Salir de la guía",
  back: "Volver al capítulo",
  retry: "Reintentar",
} as const;

/** One entry → what the player draws. */
export function microguidePresentation(
  chapter: MicroguideChapter,
  m: MicroguideEntry,
): GuidePresentation {
  return {
    guideKey: `${chapter.keyPrefix}-${m.slug}`,
    guideVersion: 1,
    title: m.title,
    tag: "Guía breve",
    summary: m.summary,
    steps: [
      {
        surface: "confirm",
        stepKey: `explorar-${m.slug}`,
        initialReaderScene: "cover",
        shortLabel: "Concepto",
        title: m.concept.title,
        body: [...m.concept.body],
        actionLabel: "He explorado la idea",
        note: m.concept.note,
      },
      {
        surface: "confirm",
        stepKey: `practicar-${m.practiceSlug}`,
        initialReaderScene: "practice",
        shortLabel: "Práctica",
        title: m.practice.title,
        body: [...m.practice.body],
        actionLabel: "Ya hice la práctica",
        note: m.practice.note,
      },
      {
        surface: "recall",
        stepKey: `recordar-${m.slug}`,
        initialReaderScene: "recall",
        shortLabel: "Recordar",
        title: "Recordar lo leído",
        body: [
          `Elige la opción que corresponde a lo que dice el ${chapter.chapterLabel}.`,
        ],
        question: m.recall.question,
        options: m.recall.options,
        actionLabel: "Registrar respuesta",
      },
    ],
    labels: LABELS,
  };
}

/** The same entry → what the reader panel says. */
export function microguideReaderCopy(
  chapter: MicroguideChapter,
  m: MicroguideEntry,
): GuideReaderCopy {
  return {
    guideKey: `${chapter.keyPrefix}-${m.slug}`,
    guideVersion: 1,
    ...READER_GUIDE_SHARED,

    cover: {
      eyebrow: "Guía breve",
      scope: "1 idea del capítulo",
      title: m.intro.title,
      duration: m.duration,
      body: [
        ...m.intro.body,
        "Puedes salir cuando quieras — tu avance queda guardado en el punto " +
          "donde lo dejes.",
      ],
      start: "Empezar",
    },

    // No clip for these five: there is no asset, and a play button over
    // nothing is a lie. The passage below is where the chapter is read.
    clip: {
      title: "Un clip breve",
      pending: "Clip breve en producción",
      pendingNote:
        "Esta microguía no tiene clip. Puedes seguir directamente al pasaje.",
      readTranscript: "Leer transcripción",
      hideTranscript: "Ocultar transcripción",
      transcript: [],
      continue: "Continuar",
    },

    anchor: {
      title: m.passage.title,
      body: m.passage.body,
      goToPassage: "Ir al pasaje",
      located: "Pasaje localizado en el capítulo.",
      unresolved:
        "No pudimos ubicar el pasaje en esta edición del capítulo. Puedes " +
        "seguir con la guía igual.",
      confirm: "Leí el pasaje",
      confirmNote:
        "Marcarlo registra que llegaste hasta aquí; no evalúa lo que entendiste.",
    },

    practice: {
      title: m.practice.title,
      body: m.practice.body,
      timerSeconds: 45,
      timerStart: "Usar 45 segundos",
      timerStop: "Detener",
      timerNote: "El temporizador es opcional y no se registra en ningún lado.",
      confirm: "Ya hice la práctica",
      confirmNote: m.practice.note,
    },

    recall: { title: "Recordar lo leído", submit: "Registrar respuesta" },

    // The words the SERVER sends now replace these at runtime; they remain as
    // the panel's fallback for a verdict that arrives without copy.
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
      title: m.summaryScene.title,
      body: m.summaryScene.body.join(" "),
      finish: "Finalizar",
    },

    completed: {
      banner: "COMPLETASTE ESTA LECTURA GUIADA",
      continueReading: "Continuar leyendo",
      returnToPassage: "Volver al pasaje",
      repeat: "Repetir la guía",
    },
  };
}
