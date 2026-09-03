import type {
  CancelGuideSessionRequestBody,
  CompleteGuideSessionRequestBody,
  CompleteGuideSessionStepRequestBody,
  GuideAvailabilityResponse,
  GuideCommandResponse,
  GuideDiscoveryResponse,
  GuideExperienceCardState,
  GuideExperienceCardStatesResponse,
  GuideExperienceStateResponse,
  GuideReaderContext,
  RecoverableGuideSessionResponse,
  StartGuideSessionRequestBody,
  SubmitGuideStepRecallRequestBody,
  SubmitGuideStepRecallResponse,
  GuideRouteResponse,
} from "@psico/types";
import { apiClient } from "./client";

/** The one code a locally-rejected discovery input reports. */
export const GUIDE_DISCOVERY_PARAMS_INVALID = "GUIDE_DISCOVERY_PARAMS_INVALID";

/** The one code a locally-rejected recovery pin reports (GR-5). */
export const GUIDE_RECOVERY_PARAMS_INVALID = "GUIDE_RECOVERY_PARAMS_INVALID";

/** The one code a locally-rejected card-state batch reports (C.1). */
export const GUIDE_CARD_STATES_PARAMS_INVALID =
  "GUIDE_CARD_STATES_PARAMS_INVALID";

/** The one code a card-state batch reports when the answer does not fit. */
export const GUIDE_CARD_STATES_ANSWER_INVALID =
  "GUIDE_CARD_STATES_ANSWER_INVALID";

/**
 * The server's own limits, restated so the client refuses what the server
 * would refuse — and so a chapter longer than one batch is chunked instead of
 * rejected. A ratchet compares these against the parser and the OpenAPI
 * document; the server stays the authority either way.
 */
export const GUIDE_CARD_STATES_MAX_PINS = 25;
export const GUIDE_CARD_STATES_MAX_VERSION = 999_999_999;

/**
 * The catalog's key grammar, restated: lowercase, bounded, no spaces. Same
 * shape `parseGuideRecoveryQuery` enforces on the server.
 */
const GUIDE_KEY_RE = /^[a-z0-9][a-z0-9._:-]{0,199}$/;
/**
 * C.3R — the reader locator, bounded by SHAPE.
 *
 * A `unitKey` is a uuidv5 in this build, but it is an environment-local token
 * the server re-resolves, so pinning a uuid grammar here would refuse a future
 * ingest for no safety gain. Mirrors the server parser character for
 * character; a ratchet compares them.
 */
const GUIDE_UNIT_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
export const GUIDE_CARD_STATES_MAX_CHAPTER_ORDER = 10_000;

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
/**
 * C.1 — the answer, checked rather than assumed.
 *
 * The generic on `apiClient.post` is a compile-time promise about a server we
 * do not run in this process. At runtime it is JSON: a stale deploy, a proxy
 * that rewrites bodies, or an endpoint that quietly grows a field can all put
 * a shape here that TypeScript already believes. So every invariant the cards
 * rely on is asked out loud.
 *
 * Two of them are more than shape:
 *
 *   - positional alignment. An answer of the right LENGTH whose pins do not
 *     match the questions is the dangerous one: it lines up perfectly and
 *     describes the wrong journeys.
 *   - `resumePin`. START and COMPLETED are statements about the published pin,
 *     so resuming anything else would be a fresh run wearing a finished
 *     journey's clothes. CONTINUE may name another VERSION — that is the whole
 *     point of rule 1 — but never another lineage: a `guideKey` that is not the
 *     one asked about is somebody else's session.
 *
 * Nothing received is echoed. The error carries the code and nothing else,
 * because a rejected payload is exactly the thing that must not reach a log.
 */
function validateCardStatesAnswer(
  answer: unknown,
  asked: ReadonlyArray<{ guideKey: string; guideVersion: number }>,
): GuideExperienceCardState[] {
  const bad = () => {
    throw new Error(GUIDE_CARD_STATES_ANSWER_INVALID);
  };
  if (!isPlainObject(answer)) bad();
  if (!onlyKeys(answer as Record<string, unknown>, ["items"])) bad();
  const items = (answer as { items: unknown }).items;
  if (!Array.isArray(items) || items.length !== asked.length) bad();

  const validated: GuideExperienceCardState[] = [];
  (items as unknown[]).forEach((raw, i) => {
    if (!isPlainObject(raw)) bad();
    const item = raw as Record<string, unknown>;
    if (
      !onlyKeys(item, [
        "guidePin",
        "status",
        "resumePin",
        "applicability",
        "evaluatedPin",
      ])
    ) {
      bad();
    }

    const guidePin = readPin(item.guidePin);
    const resumePin = readPin(item.resumePin);
    const evaluatedPin = readPin(item.evaluatedPin);
    if (!guidePin || !resumePin || !evaluatedPin) bad();

    const question = asked[i]!;
    if (
      guidePin!.guideKey !== question.guideKey ||
      guidePin!.guideVersion !== question.guideVersion
    ) {
      bad();
    }

    const status = item.status;
    if (status !== "START" && status !== "CONTINUE" && status !== "COMPLETED") {
      bad();
    }
    if (status === "CONTINUE") {
      // Another version of the SAME lineage, or nothing.
      if (resumePin!.guideKey !== guidePin!.guideKey) bad();
    } else if (
      resumePin!.guideKey !== guidePin!.guideKey ||
      resumePin!.guideVersion !== guidePin!.guideVersion
    ) {
      bad();
    }

    const applicability = item.applicability;
    // A verdict this client does not understand is NOT a verdict. Coercing an
    // unknown word to "UNAVAILABLE" would hide a real answer, and to "APPLIES"
    // would invent one; both are worse than refusing the chunk.
    if (applicability !== "APPLIES" && applicability !== "UNAVAILABLE") bad();
    // The verdict is about the pin that would actually run. When a lineage is
    // open that is the resume pin, and the server says so by echoing it here;
    // anything else means the answer describes a different question.
    if (
      evaluatedPin!.guideKey !== resumePin!.guideKey ||
      evaluatedPin!.guideVersion !== resumePin!.guideVersion
    ) {
      bad();
    }

    validated.push({
      guidePin: guidePin!,
      status: status as GuideExperienceCardState["status"],
      resumePin: resumePin!,
      applicability: applicability as GuideExperienceCardState["applicability"],
      evaluatedPin: evaluatedPin!,
    });
  });
  return validated;
}

/** A JSON object, not an array and not null. */
function isPlainObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Exactly these own keys — no more, none missing. */
function onlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === allowed.length && keys.every((k) => allowed.includes(k))
  );
}

/** A pin, or `null`. Same grammar and range the server enforces on the way in. */
function readPin(
  value: unknown,
): { guideKey: string; guideVersion: number } | null {
  if (!isPlainObject(value)) return null;
  const pin = value as Record<string, unknown>;
  if (!onlyKeys(pin, ["guideKey", "guideVersion"])) return null;
  const { guideKey, guideVersion } = pin;
  if (typeof guideKey !== "string" || !GUIDE_KEY_RE.test(guideKey)) return null;
  if (
    typeof guideVersion !== "number" ||
    !Number.isInteger(guideVersion) ||
    guideVersion <= 0 ||
    guideVersion > GUIDE_CARD_STATES_MAX_VERSION
  ) {
    return null;
  }
  return { guideKey, guideVersion };
}

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
   * GR-5 — "standing in this chapter, what guided readings am I offered?".
   *
   * The plural of discovery, not a replacement for it. Same authority, same
   * opaque negative: an unavailable answer carries no pins and no reason, so it
   * cannot be used to enumerate a catalog the reader is not offered.
   *
   * The same local grammar check as discovery, for the same reason: a `false`
   * caused by a typo would be indistinguishable from "this chapter has no
   * route", and those are different facts.
   */
  getGuideRoute: (bookSlug: string, chapterOrder: number) => {
    const slug = normalizeDiscoverySlug(bookSlug);
    if (slug === null || !Number.isInteger(chapterOrder) || chapterOrder <= 0) {
      return Promise.reject(new Error(GUIDE_DISCOVERY_PARAMS_INVALID));
    }
    return apiClient.get<GuideRouteResponse>(
      `/guide/route/${encodeURIComponent(slug)}/${chapterOrder}`,
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
  getExperienceCardStates: async (
    pins: ReadonlyArray<{ guideKey: string; guideVersion: number }>,
    reader: GuideReaderContext,
  ): Promise<GuideExperienceCardStatesResponse> => {
    // The reader is validated with the same severity as the pins: a malformed
    // context would come back as a stale-context refusal for the whole
    // chapter, and spending a round trip to learn that is worse than saying so
    // here.
    if (
      !isPlainObject(reader) ||
      !onlyKeys(reader as unknown as Record<string, unknown>, [
        "bookSlug",
        "chapterOrder",
        "unitKey",
      ]) ||
      typeof reader.bookSlug !== "string" ||
      !GUIDE_KEY_RE.test(reader.bookSlug) ||
      typeof reader.unitKey !== "string" ||
      !GUIDE_UNIT_KEY_RE.test(reader.unitKey) ||
      typeof reader.chapterOrder !== "number" ||
      !Number.isInteger(reader.chapterOrder) ||
      reader.chapterOrder <= 0 ||
      reader.chapterOrder > GUIDE_CARD_STATES_MAX_CHAPTER_ORDER
    ) {
      throw new Error(GUIDE_CARD_STATES_PARAMS_INVALID);
    }

    const invalid =
      pins.length === 0 ||
      pins.some(
        (pin) =>
          typeof pin?.guideKey !== "string" ||
          !GUIDE_KEY_RE.test(pin.guideKey) ||
          typeof pin?.guideVersion !== "number" ||
          !Number.isInteger(pin.guideVersion) ||
          pin.guideVersion <= 0 ||
          pin.guideVersion > GUIDE_CARD_STATES_MAX_VERSION,
      );
    if (invalid) {
      // The rejected pin is NOT echoed — untrusted input does not travel into
      // an error message that something will eventually log.
      throw new Error(GUIDE_CARD_STATES_PARAMS_INVALID);
    }

    // A chapter longer than one batch is a chapter, not a caller error: split
    // it into `ceil(n / 25)` requests and reassemble. `pins` is copied
    // defensively — a caller mutating its array mid-flight must not be able to
    // change what a chunk asked about after the fact.
    const wanted = pins.map((p) => ({
      guideKey: p.guideKey,
      guideVersion: p.guideVersion,
    }));
    const chunks: (typeof wanted)[] = [];
    for (let i = 0; i < wanted.length; i += GUIDE_CARD_STATES_MAX_PINS) {
      chunks.push(wanted.slice(i, i + GUIDE_CARD_STATES_MAX_PINS));
    }

    // All-or-nothing: a partial batch would leave some cards holding a verdict
    // and others holding a guess, which is the defect #639 is about. One
    // failed chunk rejects the whole call and the caller shows an error — and
    // each chunk is VALIDATED before any of them is combined, so a malformed
    // second chunk cannot publish a well-formed first one.
    // Copied per chunk for the same reason `pins` is: every chunk states the
    // context it was answered under, and no chunk can be answered under a
    // context the caller changed after it was sent.
    const sentReader = {
      bookSlug: reader.bookSlug,
      chapterOrder: reader.chapterOrder,
      unitKey: reader.unitKey,
    };
    const answers = await Promise.all(
      chunks.map(async (chunk) =>
        validateCardStatesAnswer(
          await apiClient.post<unknown>("/guide/experiences/state", {
            pins: chunk,
            reader: sentReader,
          }),
          chunk,
        ),
      ),
    );

    return { items: answers.flat() };
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
