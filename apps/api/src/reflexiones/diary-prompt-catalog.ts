/**
 * DIARY_PROMPT_CATALOG — curated prompts rotated daily by DiarioService via a
 * day-of-year hash. Distinct from the Home reflection prompts on purpose: one
 * invites a quick check-in, the other opens a longer entry.
 *
 * Extracted from `prisma/seed.ts` so the rows have a single source of truth in
 * `src/`, alongside the motivos, moods and achievement catalogs. The seed
 * imports this list; so does the QA visual fixture, which needs it populated
 * for the diary's prompt-of-the-day card to render at all.
 */
export interface DiaryPromptSeed {
  id: string;
  text: string;
}

export const DIARY_PROMPT_CATALOG: ReadonlyArray<DiaryPromptSeed> = [
  {
    id: "dp-1",
    text: "Describe un momento de hoy donde te sentiste presente.",
  },
  {
    id: "dp-2",
    text: "¿Qué emoción dominó tu día? ¿De dónde crees que vino?",
  },
  {
    id: "dp-3",
    text: "Si pudieras volver a vivir un instante del día, ¿cuál sería?",
  },
  {
    id: "dp-4",
    text: "¿Hubo algo que te costó decir hoy? Ponlo en palabras aquí.",
  },
  { id: "dp-5", text: "Hoy aprendí…" },
  { id: "dp-6", text: "Una conversación que me quedó dando vueltas." },
  { id: "dp-7", text: "¿Cómo cuidaste de ti hoy, aunque sea un poco?" },
];
