import { EXERCISE_INGESTION_CATALOG } from "./exercise-ingestion-catalog";

/**
 * What a person is told after a recall, resolved from the catalog.
 *
 * ── Why this is a lookup and not a computation ─────────────────────────────
 *
 * The outcome is measured — the ledger recorded whether the chosen option was
 * the correct one — but the sentence is editorial. Deriving it would mean the
 * runtime writing copy, and the one moment a product must not improvise is
 * right after somebody answered a question about themselves.
 *
 * So: the ledger says CORRECT or REVIEW, and this returns the approved words
 * for that outcome. Nothing else is exposed. The other branch's copy never
 * leaves the server, for the same reason `correctOptionKey` does not: a client
 * holding both messages holds the answer.
 */

export type RecallFeedbackOutcome = "CORRECT" | "REVIEW";

/** Every objective recall the build ships, indexed by its item key. */
const BY_ITEM_KEY: ReadonlyMap<string, { correct: string; review: string }> =
  new Map(
    Object.values(EXERCISE_INGESTION_CATALOG)
      .flat()
      .map((pair) => [
        pair.recall.exerciseKey,
        {
          correct: pair.recall.feedback.correct,
          review: pair.recall.feedback.review,
        },
      ]),
  );

/**
 * The approved message, or `null` when this build has no copy for that item.
 *
 * `null` is not a fallback — the caller fails closed on it. Catalog validation
 * (`assertPairValid`) already refuses a recall without both branches, so a null
 * here means the item is not in the catalog at all, which is a state where the
 * server does not know what to say and should not pretend otherwise.
 */
export function recallFeedbackMessage(
  itemKey: string,
  outcome: RecallFeedbackOutcome,
): string | null {
  const copy = BY_ITEM_KEY.get(itemKey);
  if (!copy) return null;
  return outcome === "CORRECT" ? copy.correct : copy.review;
}

/** For tests and boot checks: the item keys this build can speak for. */
export function recallItemKeysWithFeedback(): string[] {
  return [...BY_ITEM_KEY.keys()].sort();
}
