/**
 * GR-7 — the public projection of a finished run.
 *
 * A pure function over two things the server already holds: the pinned
 * definition and the accepted ledger rows. It counts and it maps a verdict.
 * It reads nothing else, so there is no path by which a row id, a receipt, an
 * actor or a target key could arrive in the answer — the shape it returns has
 * nowhere to put them.
 *
 * Two deliberate absences:
 *
 *   `selectedOptionKey` and `correctOptionKey` are both in the accepted row
 *   and neither is read. The reader is told there is something to revisit,
 *   never which option was right; giving the answer away at the end would
 *   undo the point of having asked.
 *
 *   Media and Resonance are NOT here. Both happen around a journey rather than
 *   inside its ledger, and there is no server-owned link tying a particular
 *   media completion or resonance to THIS session. The live run can still show
 *   what it watched happen, because it was there. After a reload the summary
 *   shows only what the server can prove, and showing fewer facts is better
 *   than inventing an association.
 */

import type {
  GuideCompletionSummaryView,
  GuideDefinition,
  GuideRecallOutcome,
} from "@psico/types";
import type { AcceptedGuideStep } from "./guide-state-machine";

/**
 * The public verdict for one recall.
 *
 * `INCORRECT` is an internal grading result; `REVIEW` is what a person is
 * told. The mapping lives here, once, so no surface can leak the harsher word
 * by reaching for the raw field.
 */
function publicOutcome(result: "CORRECT" | "INCORRECT"): GuideRecallOutcome {
  return result === "CORRECT" ? "CORRECT" : "REVIEW";
}

export function toGuideCompletionSummary(input: {
  definition: GuideDefinition;
  acceptedSteps: readonly AcceptedGuideStep[];
}): GuideCompletionSummaryView {
  const { definition, acceptedSteps } = input;

  // Only steps this pinned definition actually declares are counted. A row
  // for a step the version no longer has is not evidence about this journey,
  // and counting it would inflate a number a reader might compare.
  const declared = new Set(definition.steps.map((step) => step.stepKey));
  const counted = acceptedSteps.filter((step) => declared.has(step.stepKey));

  return {
    conceptsExplored: counted.filter(
      (step) => step.kind === "CONCEPT_EXPLORATION",
    ).length,
    practicesConfirmed: counted.filter(
      (step) => step.kind === "CATALOG_PRACTICE",
    ).length,
    recalls: counted
      .filter(
        (step): step is Extract<AcceptedGuideStep, { kind: "ACTIVE_RECALL" }> =>
          step.kind === "ACTIVE_RECALL",
      )
      // `order` is the ledger's own sequence, so the list reads the way the
      // reader walked it rather than the way the rows happened to arrive.
      .sort((a, b) => a.order - b.order)
      .map((step) => ({ outcome: publicOutcome(step.recallResult) })),
  };
}
