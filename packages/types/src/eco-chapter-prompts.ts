/**
 * Eco contextual — per-chapter suggested topics (Sprint B).
 *
 * When the user opens a chapter, the reader shows a small dismissible card
 * inviting them to explore a related theme with Eco. Prompts are curated per
 * (bookSlug, chapterOrder). If none is defined, `ecoChapterPrompt` falls back
 * to a generic invitation built from the chapter title — so every chapter has
 * something, even before curation.
 *
 * These are conversation openers, not the reader's private content — safe to
 * ship as static shared data (web + mobile import the same map).
 */

export interface EcoChapterPrompt {
  /** Short label shown on the card ("Hablemos de…"). */
  title: string;
  /** The composer text seeded into Eco when the user taps the card. */
  prompt: string;
}

type BookPrompts = Record<number, EcoChapterPrompt>;

export const ECO_CHAPTER_PROMPTS: Record<string, BookPrompts> = {
  "emociones-en-construccion": {
    1: {
      title: "El cuerpo sabe antes que la mente",
      prompt:
        "Estoy leyendo sobre cómo las emociones se construyen. ¿Alguna vez sentiste algo en el cuerpo antes de poder nombrarlo? Cuéntame de esa vez y explorémoslo juntos.",
    },
    2: {
      title: "Cómo aprendiste a sentir",
      prompt:
        "Leí que lo que mostramos y cómo lo interpretamos viene mucho de la cultura y la familia. ¿Hay alguna emoción que en tu casa se vivía distinto a como la sientes tú? Hablémoslo.",
    },
    3: {
      title: "Cuando tu mente adelanta la emoción",
      prompt:
        "El capítulo dice que el cerebro predice las emociones antes de que pasen las cosas. ¿Recuerdas una vez que tu mente 'adelantó' una emoción que luego no era? Exploremos qué la disparó.",
    },
  },
};

/**
 * Resolve the suggested Eco topic for a chapter. Returns a curated prompt when
 * one exists, otherwise a generic invitation built from the chapter title.
 */
export function ecoChapterPrompt(
  bookSlug: string,
  chapterOrder: number,
  chapterTitle: string,
): EcoChapterPrompt {
  const curated = ECO_CHAPTER_PROMPTS[bookSlug]?.[chapterOrder];
  if (curated) return curated;
  return {
    title: "Llévalo a tu vida",
    prompt: `Estoy leyendo el capítulo «${chapterTitle}». Me gustaría conversar sobre cómo se conecta con algo que estoy viviendo. ¿Por dónde podríamos empezar?`,
  };
}
