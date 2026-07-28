import type {
  ActiveRecallAttemptedPayload,
  PracticeCompletedPayload,
} from "@psico/types";
import { learningException } from "./learning-errors";
import type {
  ResolvedExerciseContext,
  ResolvedRecallItemContext,
} from "./learning-catalog.resolver";

/**
 * CC-7.4C — the SHARED builders for the two educational payloads that both the
 * standalone learning commands (CC-7.3) and the Guide lifecycle emit.
 *
 * Extracted verbatim from `LearningCommandService` so there is exactly ONE
 * definition of:
 *
 *   - the objective-recall mode check,
 *   - the option-key membership check,
 *   - the SERVER grading rule,
 *   - the `active_recall_attempted` / `practice_completed` payload shapes.
 *
 * Pure: no Prisma, no Nest, no clock. Behaviour is unchanged — the standalone
 * HTTP surface calls these and gets byte-identical payloads.
 */

/**
 * Build the SERVER-graded `active_recall_attempted` payload for an objective
 * item. Fails closed (`LEARNING_EVENT_INVALID_PAYLOAD`) when the resolved item
 * is not objective or the chosen option is not one of its closed option keys.
 *
 * The canonical answer is used ONLY to compute `result` — it is never part of
 * the returned payload.
 */
export function buildObjectiveRecallAttempt(
  item: ResolvedRecallItemContext,
  selectedOptionKey: string,
): ActiveRecallAttemptedPayload {
  if (item.mode !== "objective") {
    // A selectedOptionKey against a self-assessed item is a payload error.
    throw learningException("LEARNING_EVENT_INVALID_PAYLOAD");
  }
  if (!item.optionKeys.includes(selectedOptionKey)) {
    throw learningException("LEARNING_EVENT_INVALID_PAYLOAD");
  }
  return {
    unitKey: item.unitKey,
    itemKey: item.itemKey,
    conceptKey: item.conceptKey,
    evaluationSource: "server",
    selectedOptionKey,
    // SERVER-graded — the client never sends result/evaluationSource.
    result:
      selectedOptionKey === item.correctOptionKey ? "correct" : "incorrect",
  };
}

/** Build the `practice_completed` payload — registration only: no reflection,
 * duration, emotion or score (ADR 0017 §6). */
export function buildPracticeCompletedPayload(
  ctx: ResolvedExerciseContext,
): PracticeCompletedPayload {
  return { exerciseKey: ctx.exerciseKey, unitKey: ctx.unitKey };
}
