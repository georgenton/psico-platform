/**
 * C.3A → C.3R (#639) — the two identities this train runs on, and which phase
 * each one is allowed to block.
 *
 * ── What C.3R changed, and what it did NOT ──────────────────────────────────
 *
 * The reader's anchor is no longer positional. `anchorAppliesTo` is deleted,
 * and the browser asks the server, which resolves the guide's editorial target
 * and the reader's unit to internal ids inside one snapshot and compares those.
 * `READER_ANCHOR_IDENTITY_CLOSED_IN_TREE` records that, measured against the
 * code rather than believed.
 *
 * The merge gate stays SHUT anyway, and the distinction matters: closed in this
 * tree is not deployed. Production still runs a positional reader until this
 * branch ships, so consolidating the new authority — C.3C+C.4, where the CMS
 * gains selection and rebind — would still let an editor bind by identity what
 * the deployed reader refuses by position. Lowering the flag is a decision
 * about a deploy, not about a diff, and it is not this module's to take.
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
  /** How the public reader decides it now: the server compares identities (C.3R). */
  PUBLIC_READER_ANCHOR: "veredicto del servidor por contentUnitId (C.3R)",
  /** C.3A is additive and exposes no editorial choice, so it may deploy. */
  C3A_DEPLOY_BLOCKED_BY_POSITIONAL_READER: false,
  /** C.3R deleted the positional decision from the reader — in THIS tree. */
  READER_ANCHOR_IDENTITY_CLOSED_IN_TREE: true,
  /** C.3R is MERGED and DEPLOYED, and production's reader now decides by identity. */
  READER_ANCHOR_IDENTITY_DEPLOYED: true,
  /**
   * Open — and that word is narrower than it looks.
   *
   * The barrier answered ONE question: may C.3C+C.4 consolidate the new
   * authority while the live reader still decides by position? It may not, and
   * it no longer has to: C.3R is merged (#679 → `f6d1d3fb`), deployed on API,
   * worker and Web, and verified in production emitting
   * `experience-binding-bridge-v1` with the server-side verdict live.
   *
   * What it does NOT say is that this branch may merge. That is a separate
   * decision with its own gate, recorded next to this one so the two cannot be
   * read as the same fact.
   */
  C3C_C4_MERGE_BLOCKED_UNTIL_READER_ANCHOR_IDENTITY_CLOSED: false,
} as const;

/**
 * The four antecedents the barrier rested on, each stated as a fact.
 *
 * Written out rather than folded into the boolean above because a lowered
 * barrier with no record of WHY reads, six months from now, exactly like a
 * barrier somebody got tired of. The companion ratchet refuses to let the flag
 * be false unless all four are true, so lowering it takes editing the reasons —
 * which is a thing a reviewer can see.
 */
export const READER_ANCHOR_BARRIER_ANTECEDENTS = {
  PR_679_MERGED: true,
  PR_679_DEPLOYED: true,
  SERVER_SIDE_ANCHOR_AUTHORITY_VERIFIED_IN_PRODUCTION: true,
  PR_677_RETARGETED_TO_MAIN: true,
} as const;

/**
 * Lowered ≠ authorised. Three separate decisions, none implied by the others.
 *
 * `MERGE_AUTHORIZED` is a human's call after the final gate; `DEPLOYED` is a
 * fact about production, which this branch has never touched; `C5_AUTHORIZED`
 * is the verification phase that follows the deploy. Keeping them apart is the
 * whole reason the barrier was a named flag instead of a paragraph.
 */
export const C3C_C4_STATE = {
  MERGE_BARRIER: false,
  MERGE_AUTHORIZED: false,
  DEPLOYED: false,
  C5_AUTHORIZED: false,
} as const;

/**
 * Where the reader's anchor module lives.
 *
 * It used to hold the positional decision; after C.3R it holds only "where in
 * these blocks is the passage". Named as a path rather than imported for the
 * assertion, so that MOVING the file fails the ratchet instead of silently
 * satisfying it — someone then has to decide what the move meant.
 */
export const PUBLIC_READER_ANCHOR_SOURCE = "packages/types/src/guide-anchor.ts";

/** The web surface that consumes it — and that must consume no positional gate. */
export const PUBLIC_READER_ANCHOR_CONSUMER =
  "apps/web/src/components/dashboard/guide/guide-anchor.ts";

/**
 * The task that closed the identity question, and the one that is left.
 *
 * The first is done in this tree (C.3R). The second is a DEPLOY, which is why
 * the merge flag above is still true.
 */
export const READER_ANCHOR_IDENTITY_TASK =
  "Cerrado y desplegado (C.3R, PR #679 → main f6d1d3fb): el lector pregunta al " +
  "servidor, que compara contentUnitId resuelto desde los targets contra la " +
  "unidad del lector; anchorAppliesTo fue eliminado. La barrera queda abajo; " +
  "fusionar C.3C+C.4 sigue siendo una decisión aparte con su propio gate.";
