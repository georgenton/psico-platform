/**
 * Fase E (V2) — curated concept per chapter for the ARC cycle
 * (Anchor → Relate → Confirm).
 *
 * A highlight is NOT a resonance: nothing enters the emotional map silently.
 * When the user marks something, the reader OFFERS the chapter's concept and
 * only an explicit confirmation persists a `Resonance` row — which the user
 * can see (with source + date) and delete from the map.
 *
 * Same shared-catalog pattern as ECO_CHAPTER_PROMPTS / CHAPTER_EXERCISES:
 * one source of truth for web + mobile, no backend table until the content
 * graph (Concept/ContentUnit/BookManifest) is justified by Author B2B.
 *
 * `key` is PERSISTED on Resonance rows — treat it as immutable; add new keys,
 * never rename existing ones.
 */

export interface ChapterConcept {
  /** Stable identifier persisted on the Resonance row. Never rename. */
  key: string;
  /** Short human label shown on the map ("Mis resonancias"). */
  label: string;
}

type BookConcepts = Record<number, ChapterConcept>;

export const CHAPTER_CONCEPTS: Record<string, BookConcepts> = {
  "emociones-en-construccion": {
    1: {
      key: "eec-cuerpo-antes-que-mente",
      label: "El cuerpo sabe antes que la mente",
    },
    2: {
      key: "eec-como-aprendiste-a-sentir",
      label: "Cómo aprendiste a sentir",
    },
    3: {
      key: "eec-mente-que-adelanta",
      label: "Cuando tu mente adelanta la emoción",
    },
  },
};

/**
 * Resolve the chapter's concept. Curated when available, otherwise a stable
 * fallback derived from the chapter identity (so every chapter can resonate,
 * even before curation).
 */
export function chapterConcept(
  bookSlug: string,
  chapterOrder: number,
  chapterTitle: string,
): ChapterConcept {
  const curated = CHAPTER_CONCEPTS[bookSlug]?.[chapterOrder];
  if (curated) return curated;
  return {
    key: `${bookSlug}:cap-${chapterOrder}`,
    label: chapterTitle,
  };
}

// ─── Resonance wire types ────────────────────────────────────────────────────

/** Where the confirmation happened (provenance, shown on the map). */
export type ResonanceSource = "highlight" | "eco" | "exercise";

export interface ResonanceSummary {
  id: string;
  conceptKey: string;
  conceptLabel: string;
  bookSlug: string;
  chapterOrder: number;
  source: ResonanceSource;
  /** ISO timestamp of the explicit confirmation. */
  confirmedAt: string;
  /**
   * Fase H (ARC-P1) — the user marked this theme as IMPORTANT for them
   * right now. Distinct important themes are the source of the Propósito
   * axis under the V2 contract. Another explicit tap; reversible.
   */
  important: boolean;
}

/** Fase H — body for `PATCH /api/resonances/:id`. */
export interface UpdateResonanceRequest {
  important: boolean;
}

export interface ResonanceListResponse {
  resonances: ResonanceSummary[];
}

export interface ConfirmResonanceRequest {
  conceptKey: string;
  conceptLabel: string;
  bookSlug: string;
  chapterOrder: number;
  source: ResonanceSource;
}

export interface ConfirmResonanceResponse {
  ok: true;
  resonance: ResonanceSummary;
}
