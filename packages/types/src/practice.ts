/**
 * The public shape of a catalog practice — what a client is allowed to know.
 *
 * ── Why this is a closed union ─────────────────────────────────────────────
 *
 * Until now every practice was `guided_reflection`: a title, a body and a
 * button. That proved the binding worked and represented none of the designed
 * interactions. Widening it with a free-form `payload: unknown` would have made
 * the renderer the schema, and a renderer is a bad schema — it accepts whatever
 * happens to be there and fails silently on whatever is not.
 *
 * So each kind declares exactly what it carries, the server parses catalog
 * content against these shapes before serving it, and a client that receives a
 * kind it does not know renders the safe fallback rather than guessing.
 *
 * ── What is NOT here, and never will be ────────────────────────────────────
 *
 * Nothing that grades. A practice completes when a person says it did —
 * `catalog_practice_confirmation` — so there is no correct arrangement to
 * withhold and no score to leak. `sequence_ordering` does carry a `solved`
 * order, and that is deliberate: the approved design offers "ver la secuencia
 * resuelta" as a safe exit, so it is content the reader may ask for, not an
 * answer key. Nothing compares it to what the reader did.
 *
 * Nothing a reader writes travels either. Free-text fields exist in some kinds
 * as local scaffolding; the shapes below describe the PROMPTS, never responses.
 */

/** The five interactions EEC-C01 ships. */
export const PRACTICE_KINDS = [
  "belief_lens",
  "context_plausibility",
  "sequence_ordering",
  "four_part_distinction",
  "signal_context_compare",
] as const;

export type PracticeKind = (typeof PRACTICE_KINDS)[number];

/** A suggested answer a reader may pick instead of writing. */
export interface PracticeOption {
  readonly key: string;
  readonly label: string;
}

/** MG01 — one belief, three questions asked of it. */
export interface BeliefLensPractice {
  readonly kind: "belief_lens";
  /** The belief under the lens. Editorial, never the reader's own. */
  readonly belief: string;
  readonly zones: readonly {
    readonly key: "observo" | "supongo" | "falta";
    readonly label: string;
    readonly hint: string;
    readonly options: readonly PracticeOption[];
  }[];
  /** Whether the reader may type instead of picking. Text stays on device. */
  readonly allowsFreeText: boolean;
}

/** MG02 — the same expression, read against what is and is not known. */
export interface ContextPlausibilityPractice {
  readonly kind: "context_plausibility";
  readonly situation: string;
  readonly observation: string;
  readonly availableContext: readonly string[];
  /** Candidate readings. Their ORDER carries no verdict. */
  readonly readings: readonly PracticeOption[];
  /** The buckets, so the accessible path needs no drag-and-drop. */
  readonly buckets: readonly PracticeOption[];
  readonly missingInformationPrompt: string;
}

/** MG03 — four cards that are usually confused with one another. */
export interface SequenceOrderingPractice {
  readonly kind: "sequence_ordering";
  readonly scenario: string;
  /** Presented shuffled by the client; this order is the catalog's, not a hint. */
  readonly cards: readonly PracticeOption[];
  /** The arrangement shown when the reader asks to see it. Not a score. */
  readonly solved: readonly string[];
  readonly solvedLabel: string;
  readonly feedback: string;
}

/** MG04 — four fields that are not the same field. */
export interface FourPartDistinctionPractice {
  readonly kind: "four_part_distinction";
  readonly scenario: string;
  readonly fields: readonly {
    readonly key: "siento" | "interpreto" | "impulso" | "elijo";
    readonly label: string;
    readonly options: readonly PracticeOption[];
  }[];
  readonly allowsFreeText: boolean;
  /** Said out loud in the UI: this is not advice about what to do. */
  readonly disclaimer: string;
}

/** MG05 — the same signals in two situations. */
export interface SignalContextComparePractice {
  readonly kind: "signal_context_compare";
  readonly signals: readonly string[];
  readonly contexts: readonly {
    readonly key: string;
    readonly label: string;
    readonly description: string;
  }[];
  /** What might change the meaning. The reader picks; nothing is marked wrong. */
  readonly factors: readonly PracticeOption[];
  readonly prompt: string;
}

export type PracticeInteraction =
  | BeliefLensPractice
  | ContextPlausibilityPractice
  | SequenceOrderingPractice
  | FourPartDistinctionPractice
  | SignalContextComparePractice;

/** What `GET /api/learning/practices/:exerciseKey` returns. */
export interface PracticePublicView {
  readonly exerciseKey: string;
  readonly title: string;
  /** Every kind offers a way out that costs nothing. */
  readonly skipLabel: string;
  readonly confirmLabel: string;
  readonly interaction: PracticeInteraction;
}

/** True when `value` is a kind this build knows how to render. */
export function isPracticeKind(value: unknown): value is PracticeKind {
  return (
    typeof value === "string" &&
    (PRACTICE_KINDS as readonly string[]).includes(value)
  );
}
