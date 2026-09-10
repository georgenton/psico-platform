import type {
  CircleActivityDefinition,
  CircleShareConfirmation,
} from "@psico/types";
import { CIRCLE_SHARE_LIMITS } from "@psico/types";
import { CirclesError } from "./circles-http-errors";

/**
 * Validating and canonicalising a confirmed share (PR3 · spec §G).
 *
 * Two jobs, both of which have to happen before anything is encrypted:
 *
 *  1. **The template decides what may be shared.** A field key the template
 *     does not declare, a duplicate, a value past the declared limit, or a
 *     sharing mode the template does not offer — all refused. The template is
 *     the reviewed artefact; the request is not.
 *  2. **One meaning, one bytes.** The AAD binds the sharing mode and the field
 *     keys, and the payload hash covers the body. Two clients sending the same
 *     answer with keys in a different order must produce the same envelope, or
 *     a legitimate confirmation becomes unverifiable later.
 *
 * `WITHDRAW` never reaches here: it is not a member of `CircleShareConfirmation`
 * and it has its own route. A person leaving is not a kind of sharing, and the
 * database refuses to store it as one.
 */

export interface ValidatedShare {
  readonly mode: "SELECTED_FIELDS" | "EDITED_SUMMARY" | "KEEP_PRIVATE";
  /** Sorted, deduplicated, and exactly what the AAD will bind. */
  readonly fieldKeys: readonly string[];
}

/**
 * Check a confirmation against the template that defines the activity.
 *
 * Every refusal is the same opaque code. Which rule was broken is a property of
 * the request the caller composed, and a caller composing a valid request never
 * sees any of them.
 */
export function validateShareAgainstTemplate(
  confirmation: CircleShareConfirmation,
  definition: CircleActivityDefinition,
): ValidatedShare {
  const refuse = () => {
    throw new CirclesError("CIRCLE_SHARE_INVALID");
  };
  const allowed = new Set(definition.sharing.allowedModes);
  if (!allowed.has(confirmation.mode)) refuse();

  if (confirmation.mode === "KEEP_PRIVATE") {
    // Nothing to validate, because the variant carries nothing. That is the
    // whole design: there is no field a reason could arrive in.
    return { mode: "KEEP_PRIVATE", fieldKeys: [] };
  }

  if (confirmation.mode === "EDITED_SUMMARY") {
    const summary = confirmation.summary;
    if (typeof summary !== "string") refuse();
    if (summary.trim().length === 0) refuse();
    if (summary.length > CIRCLE_SHARE_LIMITS.maxSummaryLength) refuse();
    return { mode: "EDITED_SUMMARY", fieldKeys: [] };
  }

  const fields = confirmation.fields;
  if (!Array.isArray(fields) || fields.length === 0) refuse();
  if (fields.length > CIRCLE_SHARE_LIMITS.maxFields) refuse();

  const declared = new Map(
    definition.privatePreparation.map((f) => [f.fieldKey, f]),
  );
  const seen = new Set<string>();
  for (const field of fields) {
    if (
      typeof field?.fieldKey !== "string" ||
      typeof field?.value !== "string"
    ) {
      refuse();
    }
    const spec = declared.get(field.fieldKey);
    // A key the template does not declare is not "an extra field"; it is a
    // question nobody was asked.
    if (!spec) refuse();
    if (seen.has(field.fieldKey)) refuse();
    seen.add(field.fieldKey);
    if (field.value.trim().length === 0) refuse();
    const limit = Math.min(
      spec?.maxLength ?? CIRCLE_SHARE_LIMITS.maxFieldLength,
      CIRCLE_SHARE_LIMITS.maxFieldLength,
    );
    if (field.value.length > limit) refuse();
  }

  return {
    mode: "SELECTED_FIELDS",
    fieldKeys: Object.freeze([...seen].sort()),
  };
}

/**
 * The exact bytes that get encrypted and hashed.
 *
 * Canonical: keys sorted, no incidental whitespace, and the mode included so
 * two different answers cannot serialise to the same string. `KEEP_PRIVATE`
 * produces a body with no content at all — not an empty string that a later
 * reader might mistake for a lost value, but a marked, canonical "nothing",
 * which is what satisfies the reveal barrier and the completeness constraint
 * without holding anything.
 */
export function canonicalShareBody(
  confirmation: CircleShareConfirmation,
): string {
  if (confirmation.mode === "KEEP_PRIVATE") {
    return JSON.stringify({ mode: "KEEP_PRIVATE" });
  }
  if (confirmation.mode === "EDITED_SUMMARY") {
    return JSON.stringify({
      mode: "EDITED_SUMMARY",
      summary: confirmation.summary,
    });
  }
  const sorted = [...confirmation.fields].sort((a, b) =>
    a.fieldKey < b.fieldKey ? -1 : a.fieldKey > b.fieldKey ? 1 : 0,
  );
  return JSON.stringify({
    mode: "SELECTED_FIELDS",
    fields: sorted.map((f) => ({ fieldKey: f.fieldKey, value: f.value })),
  });
}

/**
 * Re-validate a decrypted body before it is served.
 *
 * Decryption proves the bytes are ours and unmodified. It does not prove they
 * are well-formed — a bug on the way in, or a key rotation that opened a row
 * written by an older shape, would produce something that authenticates and
 * still is not a share. Serving that to the other person is worse than
 * refusing, so the shape is checked again on the way out.
 */
export function parseShareBody(
  plaintext: string,
): CircleShareConfirmation | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const body = parsed as Record<string, unknown>;
  if (body.mode === "KEEP_PRIVATE" && Object.keys(body).length === 1) {
    return { mode: "KEEP_PRIVATE" };
  }
  if (body.mode === "EDITED_SUMMARY" && typeof body.summary === "string") {
    return { mode: "EDITED_SUMMARY", summary: body.summary };
  }
  if (body.mode === "SELECTED_FIELDS" && Array.isArray(body.fields)) {
    const fields = body.fields.filter(
      (f): f is { fieldKey: string; value: string } =>
        typeof f === "object" &&
        f !== null &&
        typeof (f as { fieldKey?: unknown }).fieldKey === "string" &&
        typeof (f as { value?: unknown }).value === "string",
    );
    if (fields.length !== body.fields.length) return null;
    return { mode: "SELECTED_FIELDS", fields };
  }
  return null;
}
