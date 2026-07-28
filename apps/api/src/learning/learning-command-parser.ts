import {
  RECALL_RESULTS,
  type CompletePracticeCommand,
  type CompleteUnitCommand,
  type ExploreConceptCommand,
  type LearningCommandValidationCode,
  type OpenUnitCommand,
  type RecallResult,
  type SubmitRecallAttemptCommand,
} from "@psico/types";

/**
 * CC-7.1 — pure parsers for the learning domain commands.
 *
 * Contract: docs/architecture/learning-events.md §B/§E + ADR 0017. Each parser
 * takes `unknown` route params / body and returns either the typed command or
 * a typed validation error. Deterministic, no IO, no clocks, no ID generation,
 * no logging, never mutates its input, and depends on NOTHING but
 * @psico/types — no Nest, no Prisma, no services. The closed whitelist is the
 * privacy mechanism: any undeclared field (diary text, Eco messages,
 * transcripts, emotions, metadata…) is rejected structurally, not by keyword.
 *
 * Error details are STATIC strings — input values are never echoed back.
 */

/** Closed union: an error can only name a DECLARED contract field. */
export type LearningCommandErrorField =
  | "idempotencyKey"
  | "unitKey"
  | "conceptKey"
  | "exerciseKey"
  | "itemKey"
  | "selectedOptionKey"
  | "selfResult";

/** Closed union of static details — input values can never appear here. */
export type LearningCommandErrorDetail =
  | "body_must_be_object"
  | "params_must_be_object"
  | "unexpected_field"
  | "unexpected_param"
  | "not_a_uuid"
  | "invalid_key"
  | "exactly_one_of_option_or_self_result"
  | "not_in_enum";

export interface LearningCommandError {
  code: LearningCommandValidationCode;
  field?: LearningCommandErrorField;
  detail?: LearningCommandErrorDetail;
}

export type ParseResult<T> =
  | { ok: true; command: T }
  | { ok: false; error: LearningCommandError };

const INVALID = "LEARNING_EVENT_INVALID_PAYLOAD" as const;
const KEY_REQUIRED = "LEARNING_EVENT_IDEMPOTENCY_KEY_REQUIRED" as const;

const fail = (
  code: LearningCommandValidationCode,
  field?: LearningCommandErrorField,
  detail?: LearningCommandErrorDetail,
): { ok: false; error: LearningCommandError } => ({
  ok: false,
  error: { code, ...(field ? { field } : {}), ...(detail ? { detail } : {}) },
});

// RFC 4122-shaped UUID (any version nibble 1-8, canonical variant). The repo
// has no neutral reusable UUID validator (class-validator lives in the DTO
// layer), so this stays small, pure and case-insensitive — no normalisation.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Catalog keys / opaque ids (unitKey, conceptKey, exerciseKey, itemKey,
 * selectedOptionKey). Every real key in the
 * system — Content Core uuidv5/slugs ("-1e", "cuv-…"), concept/exercise slugs
 * ("eec-cuerpo-antes-que-mente"), Prisma cuids — is a whitespace-free token,
 * so the rule is: non-empty string, NO whitespace at any position (Unicode
 * included), no control characters, ≤ 200 chars, no silent normalisation.
 * UUID, CUID, dots, underscores, hyphens and colons all pass. This is SHAPE
 * only: existence/entitlement resolution belongs to CC-7.3.
 */
const KEY_MAX_LENGTH = 200;
const WHITESPACE_RE = /\s/;
// eslint-disable-next-line no-control-regex -- rejecting control chars IS the rule
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/;

function isValidKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= KEY_MAX_LENGTH &&
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
 *  2. every present key must be declared (undeclared field ⇒ invalid — this
 *     is what structurally rejects free text, emotions, metadata, …);
 *  3. idempotencyKey must be an OWN property (inherited/prototype values are
 *     never accepted) — absent ⇒ LEARNING_EVENT_IDEMPOTENCY_KEY_REQUIRED;
 *  4. present but not a UUID string ⇒ invalid.
 *
 * Returns the validated body plus the CANONICAL idempotency key (lowercase),
 * so no parser re-reads or re-casts it from the raw body. Two inputs that
 * differ only by UUID casing therefore produce the same command — the input
 * itself is never modified.
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
  for (const key of Object.keys(body)) {
    if (!allowedKeys.includes(key)) {
      return fail(INVALID, undefined, "unexpected_field");
    }
  }
  // Own-property check (ES2021-compatible Object.hasOwn equivalent): an
  // idempotencyKey inherited from a prototype must never count as present.
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

/** Route params: plain object whose declared keys are valid opaque keys. */
function readParamKey(
  params: unknown,
  paramName: string,
  errorField: LearningCommandErrorField,
): { ok: true; value: string } | ReturnType<typeof fail> {
  if (!isPlainObject(params)) {
    return fail(INVALID, errorField, "params_must_be_object");
  }
  for (const key of Object.keys(params)) {
    if (key !== paramName) {
      return fail(INVALID, undefined, "unexpected_param");
    }
  }
  const value = params[paramName];
  if (!isValidKey(value)) {
    return fail(INVALID, errorField, "invalid_key");
  }
  return { ok: true, value };
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

export function parseOpenUnitCommand(
  params: unknown,
  body: unknown,
): ParseResult<OpenUnitCommand> {
  const param = readParamKey(params, "unitKey", "unitKey");
  if (!param.ok) return param;
  const checked = checkBody(body, ["idempotencyKey"]);
  if (!checked.ok) return checked;
  return {
    ok: true,
    command: {
      idempotencyKey: checked.idempotencyKey,
      unitKey: param.value,
    },
  };
}

export function parseCompleteUnitCommand(
  params: unknown,
  body: unknown,
): ParseResult<CompleteUnitCommand> {
  const param = readParamKey(params, "unitKey", "unitKey");
  if (!param.ok) return param;
  const checked = checkBody(body, ["idempotencyKey"]);
  if (!checked.ok) return checked;
  return {
    ok: true,
    command: {
      idempotencyKey: checked.idempotencyKey,
      unitKey: param.value,
    },
  };
}

export function parseExploreConceptCommand(
  params: unknown,
  body: unknown,
): ParseResult<ExploreConceptCommand> {
  const param = readParamKey(params, "conceptKey", "conceptKey");
  if (!param.ok) return param;
  const checked = checkBody(body, ["idempotencyKey"]);
  if (!checked.ok) return checked;
  return {
    ok: true,
    command: {
      idempotencyKey: checked.idempotencyKey,
      conceptKey: param.value,
    },
  };
}

export function parseSubmitRecallAttemptCommand(
  body: unknown,
): ParseResult<SubmitRecallAttemptCommand> {
  // `result` / `evaluationSource` are server-owned and NOT in this whitelist:
  // a client attempting to declare "correct" dies here as an unexpected field.
  const checked = checkBody(body, [
    "idempotencyKey",
    "itemKey",
    "selectedOptionKey",
    "selfResult",
  ]);
  if (!checked.ok) return checked;
  const raw = checked.body;

  if (!isValidKey(raw.itemKey)) {
    return fail(INVALID, "itemKey", "invalid_key");
  }
  const hasOption = raw.selectedOptionKey !== undefined;
  const hasSelf = raw.selfResult !== undefined;
  if (hasOption === hasSelf) {
    // Both present or both absent — the union is exclusive.
    return fail(INVALID, undefined, "exactly_one_of_option_or_self_result");
  }
  if (hasOption) {
    if (!isValidKey(raw.selectedOptionKey)) {
      return fail(INVALID, "selectedOptionKey", "invalid_key");
    }
    return {
      ok: true,
      command: {
        idempotencyKey: checked.idempotencyKey,
        itemKey: raw.itemKey,
        kind: "objective",
        selectedOptionKey: raw.selectedOptionKey,
      },
    };
  }
  if (
    typeof raw.selfResult !== "string" ||
    !(RECALL_RESULTS as readonly string[]).includes(raw.selfResult)
  ) {
    return fail(INVALID, "selfResult", "not_in_enum");
  }
  return {
    ok: true,
    command: {
      idempotencyKey: checked.idempotencyKey,
      itemKey: raw.itemKey,
      kind: "self_assessed",
      selfResult: raw.selfResult as RecallResult,
    },
  };
}

export function parseCompletePracticeCommand(
  params: unknown,
  body: unknown,
): ParseResult<CompletePracticeCommand> {
  const param = readParamKey(params, "exerciseKey", "exerciseKey");
  if (!param.ok) return param;
  const checked = checkBody(body, ["idempotencyKey"]);
  if (!checked.ok) return checked;
  return {
    ok: true,
    command: {
      idempotencyKey: checked.idempotencyKey,
      exerciseKey: param.value,
    },
  };
}
