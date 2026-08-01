import type {
  CancelGuideSessionRequestBody,
  CompleteGuideSessionRequestBody,
  CompleteGuideSessionStepRequestBody,
  GuideAvailabilityResponse,
  GuideDiscoveryResponse,
  GuideCommandResponse,
  StartGuideSessionRequestBody,
  SubmitGuideStepRecallRequestBody,
  SubmitGuideStepRecallResponse,
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
  /**
   * CC-7.R1 — the server-owned pilot gate. A single opaque boolean: whether
   * Guide is enabled for the authenticated actor right now. It never reveals
   * the rollout mode, the pilot allowlist or the reason it is `false`, and it
   * creates no session, step, receipt or LearningEvent.
   */
  getGuideAvailability: () =>
    apiClient.get<GuideAvailabilityResponse>("/guide/availability"),

  /**
   * GR-4 — "standing in this chapter, is there a guided reading for me?".
   *
   * The SERVER owns which guide a context implies; the client only says where
   * the reader is. Read-only: it creates no session, step or receipt.
   *
   * Malformed input never reaches the network. A caller that computed a bad
   * chapter order deserves to find out locally rather than to read a `false`
   * that would look identical to "no guide here" — those are different facts.
   */
  getGuideDiscovery: (bookSlug: string, chapterOrder: number) => {
    const slug = typeof bookSlug === "string" ? bookSlug.trim() : "";
    if (slug.length === 0) {
      return Promise.reject(new Error("GUIDE_DISCOVERY_PARAMS_INVALID"));
    }
    if (!Number.isInteger(chapterOrder) || chapterOrder <= 0) {
      return Promise.reject(new Error("GUIDE_DISCOVERY_PARAMS_INVALID"));
    }
    return apiClient.get<GuideDiscoveryResponse>(
      `/guide/discovery/${encodeURIComponent(slug)}/${chapterOrder}`,
    );
  },

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

  /**
   * The one command whose response says more than the session: it carries the
   * outcome (`CORRECT` | `REVIEW`) the reader is shown. A replay of the same
   * idempotency key returns the SAME outcome — the server reads it back from
   * the accepted ledger row instead of grading twice.
   */
  submitGuideStepRecall: (
    sessionId: string,
    stepKey: string,
    body: SubmitGuideStepRecallRequestBody,
  ) =>
    apiClient.post<SubmitGuideStepRecallResponse>(
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
