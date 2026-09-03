/**
 * Interactive chapter exercises (backlog — actividades interactivas reales).
 *
 * The manuscript's "Actividades" sections ship as prose EXERCISE blocks with a
 * "próximamente" mock card. This catalog turns them into REAL interactions the
 * reader renders as cards, without re-ingesting the chapters (which would
 * cascade-delete highlights/annotations).
 *
 * Two kinds, both fully client-side (no new backend):
 *   - `reflect` — a guided reflection. Tapping it opens the companion dock's
 *     Reflexión tab, seeded with the prompt, so the answer is saved as an
 *     E2E-encrypted diary entry that feeds the Mapa Emocional.
 *   - `breathe` — a paced breathing exercise (animated inhale / hold / exhale).
 *
 * Curated per (bookSlug, chapterOrder), like ECO_CHAPTER_PROMPTS. Chapters with
 * no entry simply render no exercises section.
 */

export interface ReflectExercise {
  id: string;
  kind: "reflect";
  title: string;
  /** The reflection question shown on the card + seeded into the composer. */
  prompt: string;
}

export interface BreatheExercise {
  id: string;
  kind: "breathe";
  title: string;
  /** One-line description shown on the card. */
  description: string;
  cycles: number;
  inhaleSec: number;
  holdSec: number;
  exhaleSec: number;
}

/**
 * The book's own integrative activity — «mitos emocionales bajo la lupa».
 *
 * The chapter already ships this as prose with a "próximamente" card. This
 * turns it into the real thing without touching a single block: the activity is
 * activated for a chapter here, exactly like the other two kinds, so no
 * re-ingestion is needed and no anchor moves.
 *
 * It is NOT a sixth guided reading. It has no Guide, no steps, no catalog
 * targets and no progress of its own — it blocks nothing and nothing blocks it.
 *
 * Privacy, stated as data rather than as a promise: nothing here diagnoses,
 * nothing infers an emotional state, nothing scores a right answer, every step
 * can be skipped, and free text — the rewrite and the better question — never
 * leaves the device from this component. A reader who wants to keep it sends it
 * through the Reflexión tab, which is encrypted end to end, as an explicit act.
 */
export interface MythsLensExercise {
  id: string;
  kind: "myths_lens";
  title: string;
  description: string;
  /** Seven common beliefs, each rated 1–5. No total, no profile, no verdict. */
  beliefs: readonly { id: string; text: string }[];
  /** The scale's ends, so the UI never invents "de acuerdo / en desacuerdo". */
  scaleLow: string;
  scaleHigh: string;
  /** The five lenses of this chapter, in the order the microguides teach them. */
  lenses: readonly { id: string; label: string; question: string }[];
  rewritePrompt: string;
  betterQuestionPrompt: string;
  /** Shown wherever the interaction cannot run. The activity still makes sense. */
  fallbackSteps: readonly string[];
}

export type ChapterExercise =
  | ReflectExercise
  | BreatheExercise
  | MythsLensExercise;

export const CHAPTER_EXERCISES: Record<
  string,
  Record<number, ChapterExercise[]>
> = {
  "emociones-en-construccion": {
    1: [
      {
        id: "eec-1-breathe",
        kind: "breathe",
        title: "Respira antes de seguir",
        description:
          "Un minuto para llegar al capítulo con el cuerpo un poco más calmado.",
        cycles: 4,
        inhaleSec: 4,
        holdSec: 4,
        exhaleSec: 6,
      },
      {
        id: "eec-1-myths-lens",
        kind: "myths_lens",
        title: "Mitos emocionales bajo la lupa",
        description:
          "Puntúa siete creencias comunes, elige una y míralas con las cinco lentes del capítulo.",
        beliefs: [
          { id: "b1", text: "Las emociones negativas hay que evitarlas." },
          { id: "b2", text: "Si alguien sonríe, está contento." },
          { id: "b3", text: "Una reacción fuerte demuestra que hay peligro." },
          { id: "b4", text: "Sentir algo justifica actuar en consecuencia." },
          {
            id: "b5",
            text: "Las emociones son iguales en todas las culturas.",
          },
          { id: "b6", text: "Si es construida, entonces no es real." },
          { id: "b7", text: "Una persona madura controla lo que siente." },
        ],
        scaleLow: "No lo comparto",
        scaleHigh: "Lo comparto",
        lenses: [
          {
            id: "teoria",
            label: "Teoría o mapa",
            question:
              "¿A qué pregunta responde esta creencia y qué deja fuera de foco?",
          },
          {
            id: "rostro",
            label: "Rostro",
            question:
              "¿Cuánto de esto se apoya en leer una expresión como si fuera un diccionario?",
          },
          {
            id: "alarma",
            label: "Alarma",
            question:
              "¿Confunde una respuesta protectora rápida con la emoción consciente?",
          },
          {
            id: "decision",
            label: "Emoción y decisión",
            question:
              "¿Da por hecho que sentir algo decide la conducta que sigue?",
          },
          {
            id: "construccion",
            label: "Construcción",
            question:
              "¿Qué papel dan aquí el contexto, la memoria y los conceptos aprendidos?",
          },
        ],
        rewritePrompt:
          "Reescribe la creencia con matices: qué parte se sostiene, qué parte no y en qué condiciones.",
        betterQuestionPrompt:
          "¿Qué pregunta harías ahora, en lugar de la creencia con la que empezaste?",
        fallbackSteps: [
          "Puntúa del 1 al 5 cuánto compartes cada una de las siete creencias.",
          "Elige una que uses a menudo.",
          "Mírala con las cinco lentes del capítulo: teoría, rostro, alarma, emoción y decisión, construcción.",
          "Reescríbela con matices.",
          "Formula una pregunta mejor que la creencia original.",
        ],
      },
      {
        id: "eec-1-reflect",
        kind: "reflect",
        title: "El cuerpo antes que la palabra",
        prompt:
          "Piensa en una emoción intensa de esta semana. ¿Qué sentiste en el cuerpo ANTES de poder nombrarla? Descríbelo con detalle.",
      },
    ],
    2: [
      {
        id: "eec-2-reflect",
        kind: "reflect",
        title: "Lo que aprendiste a sentir",
        prompt:
          "¿Hay una emoción que en tu familia se nombraba o se vivía distinto a como la sientes tú? Cuéntala y cómo la vives hoy.",
      },
    ],
    3: [
      {
        id: "eec-3-reflect",
        kind: "reflect",
        title: "Cuando tu mente se adelanta",
        prompt:
          "Recuerda una vez en que tu mente 'predijo' una emoción que luego no era. ¿Qué la disparó? ¿Cómo te diste cuenta?",
      },
    ],
  },
};

/** Return the curated exercises for a chapter, or an empty array. */
export function chapterExercises(
  bookSlug: string,
  chapterOrder: number,
): ChapterExercise[] {
  return CHAPTER_EXERCISES[bookSlug]?.[chapterOrder] ?? [];
}

/**
 * Build the Reflexión composer seed for a reflect exercise: the prompt as a
 * quoted lead-in, with room to write below. Kept here so web + mobile agree.
 */
export function reflectExerciseSeed(prompt: string): string {
  return `Ejercicio: ${prompt}\n\n`;
}

/**
 * Post-exercise nudge seeds (backlog — nudges post-ejercicio).
 *
 * When someone FINISHES an activity we gently invite them to keep going:
 * reflect on how they feel now, or take the calm into a conversation with Eco.
 * These build the seed text; kept here so web + mobile stay in sync.
 */

/** After a breathing pause → seed the Reflexión composer. */
export function breatheReflectSeed(): string {
  return "Acabo de hacer una pausa de respiración. Ahora mismo me siento… ";
}

/** After a breathing pause → seed an Eco conversation. */
export function breatheEcoSeed(): string {
  return "Acabo de hacer una pausa de respiración antes de seguir leyendo. Me gustaría aprovechar esta calma — ¿por dónde empiezo?";
}

/** After saving a reflexión → seed an Eco conversation about it. */
export function reflexionEcoSeed(): string {
  return "Acabo de escribir una reflexión sobre lo que estoy leyendo y me gustaría conversarlo contigo.";
}
