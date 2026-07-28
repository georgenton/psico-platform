import type {
  LearningCommandResponse,
  LearningProgressResponse,
  SubmitRecallAttemptRequestBody,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * learningApi — CC-7.3 domain commands (ADR 0017).
 *
 * Clients invoke COMMANDS, never post events: the persisted LearningEvent is
 * an internal effect of a server-side transition. Every command requires a
 * client-generated `idempotencyKey` (UUID) — an exact retry replays the
 * original event (200) instead of duplicating it (201 on create).
 *
 * The recall body is an exclusive union: objective items send
 * `selectedOptionKey` (the SERVER grades it); self-assessed items send
 * `selfResult`. The client never sends `result`/`evaluationSource`.
 */
export const learningApi = {
  openLearningUnit: (unitKey: string, idempotencyKey: string) =>
    apiClient.post<LearningCommandResponse>(
      `/learning/units/${encodeURIComponent(unitKey)}/open`,
      { idempotencyKey },
    ),

  completeLearningUnit: (unitKey: string, idempotencyKey: string) =>
    apiClient.post<LearningCommandResponse>(
      `/learning/units/${encodeURIComponent(unitKey)}/complete`,
      { idempotencyKey },
    ),

  exploreLearningConcept: (conceptKey: string, idempotencyKey: string) =>
    apiClient.post<LearningCommandResponse>(
      `/learning/concepts/${encodeURIComponent(conceptKey)}/explore`,
      { idempotencyKey },
    ),

  submitLearningRecallAttempt: (body: SubmitRecallAttemptRequestBody) =>
    apiClient.post<LearningCommandResponse>("/learning/recall-attempts", body),

  completeLearningPractice: (exerciseKey: string, idempotencyKey: string) =>
    apiClient.post<LearningCommandResponse>(
      `/learning/practices/${encodeURIComponent(exerciseKey)}/complete`,
      { idempotencyKey },
    ),

  getLearningProgress: (bookSlug: string) =>
    apiClient.get<LearningProgressResponse>(
      `/learning/progress?bookSlug=${encodeURIComponent(bookSlug)}`,
    ),
};
