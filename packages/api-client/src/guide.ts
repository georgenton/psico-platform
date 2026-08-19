import type {
  CancelGuideSessionRequestBody,
  CompleteGuideSessionRequestBody,
  CompleteGuideSessionStepRequestBody,
  GuideAvailabilityResponse,
  GuideDiscoveryResponse,
  GuideCommandResponse,
  GuideExperienceCardStatesResponse,
  GuideExperienceStateResponse,
  RecoverableGuideSessionResponse,
  StartGuideSessionRequestBody,
  SubmitGuideStepRecallRequestBody,
  SubmitGuideStepRecallResponse,
} from "@psico/types";
import { apiClient } from "./client";

/** The one code a locally-rejected discovery input reports. */
export const GUIDE_DISCOVERY_PARAMS_INVALID = "GUIDE_DISCOVERY_PARAMS_INVALID";

/** The one code a locally-rejected recovery pin reports (GR-5). */
export const GUIDE_RECOVERY_PARAMS_INVALID = "GUIDE_RECOVERY_PARAMS_INVALID";

/**
 * The catalog's key grammar, restated: lowercase, bounded, no spaces. Same
 * shape `parseGuideRecoveryQuery` enforces on the server.
 */
const GUIDE_KEY_RE = /^[a-z0-9][a-z0-9._:-]{0,199}$/;

/**
 * The SAME canonical grammar the server applies to the path segment: trim,
 * lowercase, kebab-case of alphanumeric words. `null` means "not a slug".
 */
const DISCOVERY_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeDiscoverySlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase();
  return DISCOVERY_SLUG_RE.test(slug) ? slug : null;
}

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
   *
   * The grammar is the SERVER's, restated: trim, lowercase, canonical
   * kebab-case, positive integer order. Restating it is what keeps a request
   * the server would reject from ever being sent; the server remains the
   * authority, and a client that drifted would be caught by it.
   */
  getGuideDiscovery: (bookSlug: string, chapterOrder: number) => {
    const slug = normalizeDiscoverySlug(bookSlug);
    if (slug === null || !Number.isInteger(chapterOrder) || chapterOrder <= 0) {
      // The rejected value is NOT echoed: an invalid slug is untrusted input
      // and carrying it into an error message is how it ends up in a log.
      return Promise.reject(new Error(GUIDE_DISCOVERY_PARAMS_INVALID));
    }
    return apiClient.get<GuideDiscoveryResponse>(
      `/guide/discovery/${encodeURIComponent(slug)}/${chapterOrder}`,
    );
  },

  /**
   * GR-5 — "do I already have this journey open, somewhere else?".
   *
   * The answer is derived from the accepted-step LEDGER, not from anything the
   * client remembers, which is what makes resuming on a second device the same
   * as resuming on the first. Read-only: it creates no session, step or
   * receipt.
   *
   * `recoverable: false` is ONE answer covering several situations — no
   * session, a session pinned to a different guide or version, a version the
   * catalog retired. They stay indistinguishable on purpose: a client that
   * could tell them apart would be a way to learn about sessions that are not
   * the caller's.
   *
   * Malformed input is rejected locally for the same reason discovery rejects
   * it: a `false` caused by a typo in the pin would be indistinguishable from a
   * genuine "nothing to resume", and those are different facts. The grammar is
   * the SERVER's, restated — the server stays the authority.
   */
  /**
   * GR-7 — where this actor stands in ONE exact experience.
   *
   * Answers the question `/recoverable` could not: a COMPLETED run is
   * invisible to that endpoint, which is why a finished journey read as
   * «Empezar» after a reload. One read, no polling, no cache — the caller
   * asks when it renders and takes the answer at face value.
   */
  getExperienceState: (pin: { guideKey: string; guideVersion: number }) => {
    const query = new URLSearchParams({
      guideKey: pin.guideKey,
      guideVersion: String(pin.guideVersion),
    });
    return apiClient.get<GuideExperienceStateResponse>(
      `/guide/sessions/state?${query.toString()}`,
    );
  },

  /**
   * C.1 — the state of EVERY card in a chapter, in one request.
   *
   * `getExperienceState` answers about one exact pin, which is why a chapter
   * with two journeys used to ask once and paint both cards with the same
   * answer. This asks about the published pin of each card and gets a verdict
   * per card, in the order sent.
   *
   * Pins are NOT deduped here: two experiences bound to the same guide really
   * do share a state, and the caller maps answers back by position.
   */
  getExperienceCardStates: (
    pins: ReadonlyArray<{ guideKey: string; guideVersion: number }>,
  ) => {
    const invalid = pins.some(
      (pin) =>
        typeof pin?.guideKey !== "string" ||
        !GUIDE_KEY_RE.test(pin.guideKey) ||
        !Number.isInteger(pin?.guideVersion) ||
        pin.guideVersion <= 0,
    );
    if (pins.length === 0 || invalid) {
      // The rejected pin is NOT echoed — untrusted input does not travel into
      // an error message that something will eventually log.
      return Promise.reject(new Error(GUIDE_RECOVERY_PARAMS_INVALID));
    }
    return apiClient.post<GuideExperienceCardStatesResponse>(
      "/guide/experiences/state",
      { pins: pins.map((p) => ({ ...p })) },
    );
  },

  getRecoverableSession: (pin: { guideKey: string; guideVersion: number }) => {
    if (
      typeof pin?.guideKey !== "string" ||
      !GUIDE_KEY_RE.test(pin.guideKey) ||
      !Number.isInteger(pin?.guideVersion) ||
      pin.guideVersion <= 0
    ) {
      // The rejected pin is NOT echoed — untrusted input does not travel into
      // an error message that something will eventually log.
      return Promise.reject(new Error(GUIDE_RECOVERY_PARAMS_INVALID));
    }
    const query = new URLSearchParams({
      guideKey: pin.guideKey,
      guideVersion: String(pin.guideVersion),
    });
    return apiClient.get<RecoverableGuideSessionResponse>(
      `/guide/sessions/recoverable?${query.toString()}`,
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
