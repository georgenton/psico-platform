/**
 * REFLECTION_PROMPT_CATALOG — curated prompts rotated by the Home service.
 *
 * Extracted from `prisma/seed.ts` so the rows have a single source of truth in
 * `src/`, the same shape the motivos, moods and achievement catalogs already
 * use. The seed imports this list; so does the QA visual fixture, which needs
 * the catalog populated for the Home prompt card to have anything to render.
 *
 * `isActive: false` soft-disables a prompt without deleting it.
 */
export interface ReflectionPromptSeed {
  id: string;
  text: string;
}

export const REFLECTION_PROMPT_CATALOG: ReadonlyArray<ReflectionPromptSeed> = [
  { id: "rp-1", text: "¿Qué emoción te visitó hoy con más fuerza?" },
  {
    id: "rp-2",
    text: "Si pudieras agradecer una cosa pequeña, ¿cuál sería?",
  },
  { id: "rp-3", text: "¿Qué necesita tu cuerpo en este momento?" },
  { id: "rp-4", text: "¿Hay un pensamiento que se está repitiendo?" },
  { id: "rp-5", text: "¿Qué te dirías a ti mismo si fueras tu mejor amigo?" },
  { id: "rp-6", text: "Una palabra para describir este día." },
  { id: "rp-7", text: "¿Qué te gustaría soltar antes de dormir?" },
];
