/**
 * CC-7.4B — SHARED fail-closed idempotency-key canonicalization.
 *
 * Extracted verbatim from `LearningEventRepository` (CC-7.2) so the Guide
 * receipt repository and the learning writer share ONE definition instead of
 * duplicating the UUID regex. Behavior is unchanged:
 *
 *   - RFC UUID, version 1–8, canonical variant (same shape the CC-7.1
 *     parsers enforce in `learning-command-parser.ts`);
 *   - case-insensitive on INPUT; the canonical stored form is lowercase;
 *   - anything else — whitespace, arbitrary strings, non-strings — throws
 *     the caller-supplied error BEFORE any DB access (fail-closed);
 *   - never silently normalizes a non-UUID, never mutates the input.
 *
 * The error is injected by the caller so each repository keeps its own
 * value-free typed error surface (LEARNING_EVENT_* vs GUIDE_COMMAND_*)
 * without this helper knowing about either.
 */

/**
 * Branded proof that a key passed `canonicalizeIdempotencyKey`. Inserts and
 * unique lookups should only accept this type, so an un-validated string
 * cannot reach the database through any typed code path.
 */
export type CanonicalIdempotencyKey = string & {
  readonly __canonicalIdempotencyKey: unique symbol;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Non-throwing shape check (canonical OR canonicalizable casing). */
export function isCanonicalizableIdempotencyKey(raw: unknown): raw is string {
  return typeof raw === "string" && UUID_RE.test(raw);
}

/**
 * Canonicalize or throw the provided value-free error. The error factory is
 * called (not a shared instance) so every failure carries a fresh stack.
 */
export function canonicalizeIdempotencyKey(
  raw: unknown,
  invalidError: () => Error,
): CanonicalIdempotencyKey {
  if (!isCanonicalizableIdempotencyKey(raw)) {
    throw invalidError();
  }
  return raw.toLowerCase() as CanonicalIdempotencyKey;
}
