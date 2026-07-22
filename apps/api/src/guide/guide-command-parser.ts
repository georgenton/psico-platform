import type {
  CancelGuideSessionRequestBody,
  CompleteGuideSessionRequestBody,
  CompleteGuideSessionStepRequestBody,
  GuideRequestValidationCode,
  StartGuideSessionRequestBody,
  SubmitGuideStepRecallRequestBody,
} from "@psico/types";
import { isValidGuideCatalogKey } from "./guide-catalog";

/**
 * CC-7.4D — pure parsers for the five Guide HTTP commands.
 *
 * Each parser takes `unknown` route params / body and returns either the typed
 * command or a typed validation error. Deterministic: no IO, no clock, no id
 * generation, no logging, never mutates its input, and depends on NOTHING but
 * `@psico/types` and the catalog's key grammar — no Nest, no Prisma, no
 * services.
 *
 * The CLOSED whitelist is the privacy and integrity mechanism, not a keyword
 * blocklist: anything undeclared — `userId`, editorial context, target keys,
 * `result`, `evaluationSource`, `correctOptionKey`, free text, transcripts,
 * emotions, metadata — is rejected structurally because it is simply not in
 * the allowed key set.
 *
 * Error details are STATIC strings: a received value is never echoed back.
 */

/** Closed union: an error can only name a DECLARED contract field. */
export type GuideCommandErrorField =
  | "idempotencyKey"
  | "guideKey"
  | "guideVersion"
  | "selectedOptionKey"
  | "sessionId"
  | "stepKey";

/** Closed union of static details — input values can never appear here. */
export type GuideCommandErrorDetail =
  | "body_must_be_object"
  | "params_must_be_object"
  | "unexpected_field"
  | "unexpected_param"
  | "symbol_keys_not_allowed"
  | "not_a_uuid"
  | "invalid_key"
  | "not_a_positive_integer";

export interface GuideCommandError {
  code: GuideRequestValidationCode;
  field?: GuideCommandErrorField;
  detail?: GuideCommandErrorDetail;
}

export type GuideParseResult<T> =
  | { ok: true; command: T }
  | { ok: false; error: GuideCommandError };

const INVALID = "GUIDE_INVALID_PAYLOAD" as const;
const KEY_REQUIRED = "GUIDE_IDEMPOTENCY_KEY_REQUIRED" as const;

const fail = (
  code: GuideRequestValidationCode,
  field?: GuideCommandErrorField,
  detail?: GuideCommandErrorDetail,
): { ok: false; error: GuideCommandError } => ({
  ok: false,
  error: { code, ...(field ? { field } : {}), ...(detail ? { detail } : {}) },
});

/**
 * Canonical UUID: RFC shape, version 1–8, canonical variant. The command is
 * built with the LOWERCASE form (the shared idempotency contract), so two
 * requests differing only by casing are the same command — the input object
 * itself is never modified.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * `sessionId` is a server-generated opaque id (cuid), not a catalog key: a
 * non-empty token with no whitespace and no control characters, ≤ 200 chars.
 * Existence and ownership are the lifecycle's business — this is SHAPE only.
 */
const SESSION_ID_MAX_LENGTH = 200;
const WHITESPACE_RE = /\s/;
// eslint-disable-next-line no-control-regex -- rejecting control chars IS the rule
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/;

function isValidSessionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= SESSION_ID_MAX_LENGTH &&
    !WHITESPACE_RE.test(value) &&
    !CONTROL_CHARS_RE.test(value)
  );
}

/** Plain object: not null, not an array, not a class instance / exotic. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * The closed-whitelist core shared by every parser:
 *  1. body must be a plain object;
 *  2. it must carry NO symbol keys (a symbol-keyed payload is exotic input,
 *     never a legitimate JSON body);
 *  3. every present string key must be declared — an undeclared field is what
 *     structurally rejects context, targets, results and free text;
 *  4. `idempotencyKey` must be an OWN property (never inherited) — absent ⇒
 *     GUIDE_IDEMPOTENCY_KEY_REQUIRED;
 *  5. present but not a canonical UUID ⇒ invalid.
 */
function checkBody(
  body: unknown,
  allowedKeys: readonly string[],
):
  | { ok: true; body: Record<string, unknown>; idempotencyKey: string }
  | ReturnType<typeof fail> {
  if (!isPlainObject(body)) {
    return fail(INVALID, undefined, "body_must_be_object");
  }
  if (Object.getOwnPropertySymbols(body).length > 0) {
    return fail(INVALID, undefined, "symbol_keys_not_allowed");
  }
  for (const key of Object.keys(body)) {
    if (!allowedKeys.includes(key)) {
      return fail(INVALID, undefined, "unexpected_field");
    }
  }
  if (
    !Object.prototype.hasOwnProperty.call(body, "idempotencyKey") ||
    body.idempotencyKey === undefined
  ) {
    return fail(KEY_REQUIRED, "idempotencyKey");
  }
  const key = body.idempotencyKey;
  if (typeof key !== "string" || !UUID_RE.test(key)) {
    return fail(INVALID, "idempotencyKey", "not_a_uuid");
  }
  return { ok: true, body, idempotencyKey: key.toLowerCase() };
}

/** Route params: a plain object whose keys are exactly the declared ones. */
function checkParams(
  params: unknown,
  allowedParams: readonly string[],
): { ok: true; params: Record<string, unknown> } | ReturnType<typeof fail> {
  if (!isPlainObject(params)) {
    return fail(INVALID, undefined, "params_must_be_object");
  }
  for (const key of Object.keys(params)) {
    if (!allowedParams.includes(key)) {
      return fail(INVALID, undefined, "unexpected_param");
    }
  }
  return { ok: true, params };
}

/** `sessionId` route param — the only place a session id may travel. */
function readSessionId(
  params: Record<string, unknown>,
): { ok: true; value: string } | ReturnType<typeof fail> {
  const value = params.sessionId;
  if (!isValidSessionId(value)) {
    return fail(INVALID, "sessionId", "invalid_key");
  }
  return { ok: true, value };
}

/** `stepKey` route param — closed catalog grammar. */
function readStepKey(
  params: Record<string, unknown>,
): { ok: true; value: string } | ReturnType<typeof fail> {
  const value = params.stepKey;
  if (!isValidGuideCatalogKey(value)) {
    return fail(INVALID, "stepKey", "invalid_key");
  }
  return { ok: true, value };
}

// ─── The five parsers ────────────────────────────────────────────────────────

/** POST /api/guide/sessions */
export function parseStartGuideSessionCommand(
  body: unknown,
): GuideParseResult<StartGuideSessionRequestBody> {
  const checked = checkBody(body, [
    "idempotencyKey",
    "guideKey",
    "guideVersion",
  ]);
  if (!checked.ok) return checked;
  const raw = checked.body;
  if (!isValidGuideCatalogKey(raw.guideKey)) {
    return fail(INVALID, "guideKey", "invalid_key");
  }
  const version = raw.guideVersion;
  // EXACT version: an integer ≥ 1. No "latest", no coercion from a string, no
  // floats, no NaN/Infinity.
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    return fail(INVALID, "guideVersion", "not_a_positive_integer");
  }
  return {
    ok: true,
    command: {
      idempotencyKey: checked.idempotencyKey,
      guideKey: raw.guideKey,
      guideVersion: version,
    },
  };
}

/** POST /api/guide/sessions/:sessionId/steps/:stepKey/complete */
export function parseCompleteGuideSessionStepCommand(
  params: unknown,
  body: unknown,
): GuideParseResult<
  CompleteGuideSessionStepRequestBody & { sessionId: string; stepKey: string }
> {
  const checkedParams = checkParams(params, ["sessionId", "stepKey"]);
  if (!checkedParams.ok) return checkedParams;
  const sessionId = readSessionId(checkedParams.params);
  if (!sessionId.ok) return sessionId;
  const stepKey = readStepKey(checkedParams.params);
  if (!stepKey.ok) return stepKey;
  const checked = checkBody(body, ["idempotencyKey"]);
  if (!checked.ok) return checked;
  return {
    ok: true,
    command: {
      idempotencyKey: checked.idempotencyKey,
      sessionId: sessionId.value,
      stepKey: stepKey.value,
    },
  };
}

/** POST /api/guide/sessions/:sessionId/steps/:stepKey/recall */
export function parseSubmitGuideStepRecallCommand(
  params: unknown,
  body: unknown,
): GuideParseResult<
  SubmitGuideStepRecallRequestBody & { sessionId: string; stepKey: string }
> {
  const checkedParams = checkParams(params, ["sessionId", "stepKey"]);
  if (!checkedParams.ok) return checkedParams;
  const sessionId = readSessionId(checkedParams.params);
  if (!sessionId.ok) return sessionId;
  const stepKey = readStepKey(checkedParams.params);
  if (!stepKey.ok) return stepKey;
  // `itemKey`, `result` and `evaluationSource` are NOT in the whitelist: the
  // item comes from the pinned step and the SERVER grades the attempt.
  const checked = checkBody(body, ["idempotencyKey", "selectedOptionKey"]);
  if (!checked.ok) return checked;
  const option = checked.body.selectedOptionKey;
  if (!isValidGuideCatalogKey(option)) {
    return fail(INVALID, "selectedOptionKey", "invalid_key");
  }
  return {
    ok: true,
    command: {
      idempotencyKey: checked.idempotencyKey,
      sessionId: sessionId.value,
      stepKey: stepKey.value,
      selectedOptionKey: option,
    },
  };
}

/** POST /api/guide/sessions/:sessionId/cancel */
export function parseCancelGuideSessionCommand(
  params: unknown,
  body: unknown,
): GuideParseResult<CancelGuideSessionRequestBody & { sessionId: string }> {
  const checkedParams = checkParams(params, ["sessionId"]);
  if (!checkedParams.ok) return checkedParams;
  const sessionId = readSessionId(checkedParams.params);
  if (!sessionId.ok) return sessionId;
  const checked = checkBody(body, ["idempotencyKey"]);
  if (!checked.ok) return checked;
  return {
    ok: true,
    command: {
      idempotencyKey: checked.idempotencyKey,
      sessionId: sessionId.value,
    },
  };
}

/** POST /api/guide/sessions/:sessionId/complete */
export function parseCompleteGuideSessionCommand(
  params: unknown,
  body: unknown,
): GuideParseResult<CompleteGuideSessionRequestBody & { sessionId: string }> {
  const checkedParams = checkParams(params, ["sessionId"]);
  if (!checkedParams.ok) return checkedParams;
  const sessionId = readSessionId(checkedParams.params);
  if (!sessionId.ok) return sessionId;
  // `stepsCompleted`/`totalSteps`/`currentStepKey` are server-counted — absent
  // from the whitelist, so declaring one dies as an unexpected field.
  const checked = checkBody(body, ["idempotencyKey"]);
  if (!checked.ok) return checked;
  return {
    ok: true,
    command: {
      idempotencyKey: checked.idempotencyKey,
      sessionId: sessionId.value,
    },
  };
}
