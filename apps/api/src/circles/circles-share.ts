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
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const body = parsed as Record<string, unknown>;

  if (body.mode === "KEEP_PRIVATE") {
    // Exactly one key. `KEEP_PRIVATE` means "nothing", and a body carrying a
    // `reason` alongside it is not a stricter version of nothing — it is the
    // explanation the type deliberately has no room for.
    return exactKeys(body, ["mode"]) ? { mode: "KEEP_PRIVATE" } : null;
  }

  if (body.mode === "EDITED_SUMMARY") {
    if (!exactKeys(body, ["mode", "summary"])) return null;
    if (typeof body.summary !== "string") return null;
    if (body.summary.trim().length === 0) return null;
    if (body.summary.length > CIRCLE_SHARE_LIMITS.maxSummaryLength) return null;
    return { mode: "EDITED_SUMMARY", summary: body.summary };
  }

  if (body.mode === "SELECTED_FIELDS") {
    if (!exactKeys(body, ["mode", "fields"])) return null;
    if (!Array.isArray(body.fields)) return null;
    if (body.fields.length === 0) return null;
    if (body.fields.length > CIRCLE_SHARE_LIMITS.maxFields) return null;
    const seen = new Set<string>();
    const fields: { fieldKey: string; value: string }[] = [];
    for (const raw of body.fields) {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return null;
      }
      const f = raw as Record<string, unknown>;
      if (!exactKeys(f, ["fieldKey", "value"])) return null;
      if (typeof f.fieldKey !== "string" || typeof f.value !== "string") {
        return null;
      }
      if (f.fieldKey.length === 0 || f.fieldKey.length > 128) return null;
      if (f.value.trim().length === 0) return null;
      if (f.value.length > CIRCLE_SHARE_LIMITS.maxFieldLength) return null;
      // A duplicate key is not a harmless repeat: it makes "what did they
      // answer for X" have two answers, and whichever a reader picks is
      // arbitrary.
      if (seen.has(f.fieldKey)) return null;
      seen.add(f.fieldKey);
      fields.push({ fieldKey: f.fieldKey, value: f.value });
    }
    return { mode: "SELECTED_FIELDS", fields };
  }

  return null;
}

/** The object has these keys and no others. Order-independent. */
function exactKeys(obj: Record<string, unknown>, keys: string[]): boolean {
  const own = Object.keys(obj);
  return own.length === keys.length && keys.every((k) => own.includes(k));
}

/**
 * Everything that must be true of a decrypted snapshot before it is served.
 *
 * ── Why authentication is not enough ───────────────────────────────────────
 *
 * `open()` proves the bytes are ours, unmodified, and bound to this exact
 * circle, activity, seat, template pin, sharing mode and field-key set. That
 * is a strong statement about PROVENANCE and says nothing about MEANING. A bug
 * on the way in, a template edited between two deployments, or a key rotation
 * that opened a row written under an older shape all produce bytes that
 * authenticate perfectly and are not a valid answer to the question that was
 * asked.
 *
 * So the plaintext is put back through the same door it came in:
 *
 *   1. `parseShareBody` rebuilds a CLOSED shape — exact keys, no extras, no
 *      duplicates, no empties, every length inside its limit;
 *   2. `validateShareAgainstTemplate` re-checks it against the template the
 *      activity is PINNED to, so a field key the template no longer declares
 *      stops being served rather than quietly persisting;
 *   3. the mode and field keys are compared against the values stored on the
 *      row — the same values the AAD bound. They should agree by construction;
 *      if they ever do not, the row and its envelope disagree about what the
 *      person confirmed, and there is no safe way to pick a winner.
 *
 * Returns `null` on any failure. A payload that is authentic but semantically
 * invalid fails closed and is never serialized.
 */
export function verifyDecryptedShare(
  plaintext: string,
  definition: CircleActivityDefinition,
  row: { readonly sharingMode: string | null; readonly fieldKeys: string[] },
): CircleShareConfirmation | null {
  const parsed = parseShareBody(plaintext);
  if (!parsed) return null;

  let shape: ValidatedShare;
  try {
    shape = validateShareAgainstTemplate(parsed, definition);
  } catch {
    return null;
  }

  if (shape.mode !== row.sharingMode) return null;
  const stored = [...row.fieldKeys].sort();
  if (shape.fieldKeys.length !== stored.length) return null;
  if (shape.fieldKeys.some((k, i) => k !== stored[i])) return null;

  return parsed;
}
