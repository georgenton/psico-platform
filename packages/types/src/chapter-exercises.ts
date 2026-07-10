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

export type ChapterExercise = ReflectExercise | BreatheExercise;

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
