/**
 * C.3A (#639) — the two identities this train runs on, and which phase each one
 * is allowed to block.
 *
 * ── The situation, stated without euphemism ─────────────────────────────────
 *
 * There are TWO ways to say "which chapter is this", and after C.3A they are
 * not the same way:
 *
 *   CODE_OWNED_BINDING_IDENTITY   `contentUnitId`, resolved from the guide's
 *                                 catalog targets through GuideTargetContext.
 *                                 Position-free, database-backed, and what
 *                                 every binding write now reserves against.
 *
 *   PUBLIC_READER_ANCHOR          `bookSlug` + `chapterOrder`, still positional.
 *                                 `anchorAppliesTo` in `@psico/types` decides
 *                                 it, the web reader re-exports that function,
 *                                 and it is what renders «No disponible aquí».
 *
 * After a chapter is reordered these disagree: the reservation follows the
 * UNIT, and the reader's gate follows the NUMBER.
 *
 * ── Why that does not block C.3A ────────────────────────────────────────────
 *
 * C.3A is an additive bridge. It adds columns, a table and constraints; it adds
 * no editorial operation at all — no selector, no rebind, no archive. Nothing
 * in it lets an editor create a binding that the reader would then refuse to
 * open, because nothing in it lets an editor create a binding by choosing a
 * guide. The disagreement is latent, and deploying C.3A does not make it
 * reachable.
 *
 * ── Why it DOES block C.3C+C.4 ──────────────────────────────────────────────
 *
 * C.3C+C.4 is where the new authority becomes the only authority — `STRUCTURAL`
 * — and where the CMS gains selection, rebind and archive. That is the point at
 * which an editor can spend a session binding a guide by identity that the
 * reader will not open by position: correct, complete, and unopenable.
 *
 * Making only the CMS identity-based would be strictly worse than refusing, so
 * the ordering constraint is recorded here rather than left as a paragraph in a
 * pull request that will be merged and forgotten. Closing it means giving the
 * READER an identity-based anchor; it is not this module's to do, and it is not
 * something C.3C+C.4 may ship around.
 *
 * The companion ratchet asserts each flag against the code it describes, so
 * this cannot quietly become decoration: if the reader stops being positional
 * the ratchet fails until someone flips the barrier deliberately, and if the
 * barrier is deleted the ratchet fails outright.
 */

export const EXPERIENCE_IDENTITY_BARRIER = {
  /** How a shipped definition is placed. Resolved, never inferred from a number. */
  CODE_OWNED_BINDING_IDENTITY: "contentUnitId derivado por GuideTargetContext",
  /** How the public reader still decides whether a guide belongs to a chapter. */
  PUBLIC_READER_ANCHOR: "bookSlug+chapterOrder todavía posicional",
  /** C.3A is additive and exposes no editorial choice, so it may deploy. */
  C3A_DEPLOY_BLOCKED_BY_POSITIONAL_READER: false,
  /** C.3C+C.4 consolidates the new authority, so it may not merge before this closes. */
  C3C_C4_MERGE_BLOCKED_UNTIL_READER_ANCHOR_IDENTITY_CLOSED: true,
} as const;

/**
 * Where the positional decision actually lives.
 *
 * The web reader re-exports `anchorAppliesTo`; the implementation is in
 * `@psico/types`, which is what the ratchet reads. Named as a path rather than
 * imported for the assertion, so that MOVING the file fails the ratchet instead
 * of silently satisfying it — someone then has to decide what the move meant.
 */
export const PUBLIC_READER_ANCHOR_SOURCE = "packages/types/src/guide-anchor.ts";

/** The web surface that consumes it, and therefore inherits the gate. */
export const PUBLIC_READER_ANCHOR_CONSUMER =
  "apps/web/src/components/dashboard/guide/guide-anchor.ts";

/** The one task that closes the barrier. Prose belongs in the ROADMAP; this is the gate. */
export const READER_ANCHOR_IDENTITY_TASK =
  "Dar al lector un ancla por identidad (contentUnitId) además del par posicional, " +
  "y hacer que anchorAppliesTo resuelva por identidad cuando exista.";
