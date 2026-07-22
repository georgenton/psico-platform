import type {
  CancelGuideSessionRequestBody,
  CompleteGuideSessionRequestBody,
  CompleteGuideSessionStepRequestBody,
  GuideCommandResponse,
  StartGuideSessionRequestBody,
  SubmitGuideStepRecallRequestBody,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * guideApi — CC-7.4D, the five Guide V1 commands (ADR 0019).
 *
 * Clients invoke COMMANDS: the accepted-step ledger, the progress projection
 * and the LearningEvent are internal effects of a server-side transition, never
 * things the client posts. Every command carries a client-generated
 * `idempotencyKey` (UUID) — an exact retry replays the original transition
 * (HTTP 200 · `replayed`) instead of applying it twice (201 · `created`).
 *
 * What the client never sends: a `userId` (the actor is the JWT), editorial
 * context (the server derives it from the pinned `guideKey@guideVersion`), step
 * kinds or target keys, progress counters, or `result`/`evaluationSource`. The
 * catalog's correct option is never sent and never returned, so there is
 * nothing here to store.
 */
export const guideApi = {
  createGuideSession: (body: StartGuideSessionRequestBody) =>
    apiClient.post<GuideCommandResponse>("/guide/sessions", body),

  completeGuideSessionStep: (
    sessionId: string,
    stepKey: string,
    body: CompleteGuideSessionStepRequestBody,
  ) =>
    apiClient.post<GuideCommandResponse>(
      `/guide/sessions/${encodeURIComponent(sessionId)}/steps/${encodeURIComponent(stepKey)}/complete`,
      body,
    ),

  submitGuideStepRecall: (
    sessionId: string,
    stepKey: string,
    body: SubmitGuideStepRecallRequestBody,
  ) =>
    apiClient.post<GuideCommandResponse>(
      `/guide/sessions/${encodeURIComponent(sessionId)}/steps/${encodeURIComponent(stepKey)}/recall`,
      body,
    ),

  cancelGuideSession: (
    sessionId: string,
    body: CancelGuideSessionRequestBody,
  ) =>
    apiClient.post<GuideCommandResponse>(
      `/guide/sessions/${encodeURIComponent(sessionId)}/cancel`,
      body,
    ),

  completeGuideSession: (
    sessionId: string,
    body: CompleteGuideSessionRequestBody,
  ) =>
    apiClient.post<GuideCommandResponse>(
      `/guide/sessions/${encodeURIComponent(sessionId)}/complete`,
      body,
    ),
};
