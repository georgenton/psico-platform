import "server-only";
import { createHash } from "node:crypto";

/**
 * CC-7.5 — the actor partition for Guide's local recovery.
 *
 * `GuideCommandReceipt` is keyed by `(userId, idempotencyKey)`, so a start key
 * created by account A is an ABSENT key for account B. Replaying a stored
 * record without checking who is logged in would therefore let a shared
 * browser start a guide for B that B never asked for — and, worse, autocancel
 * B's own ACTIVE session on the way in.
 *
 * The fix is a partition, not an identity. What the browser stores is an
 * opaque digest of the user id, derived HERE and only here:
 *
 *   - the raw `userId` never reaches a client component, `localStorage`, a
 *     request or a log;
 *   - the scope is not a credential and grants nothing — the JWT still
 *     authorises every command;
 *   - the same account always derives the same scope, two accounts never do.
 *
 * It is a plain SHA-256, not a KDF, and that is deliberate: this defends
 * against reusing a record across accounts, not against an attacker with the
 * device — someone who can read `localStorage` can read the session cookie too.
 */

const GUIDE_ACTOR_SCOPE_VERSION = "guide-recovery-actor-v1";

export function deriveGuideRecoveryActorScope(userId: string): string {
  if (typeof userId !== "string" || userId.length === 0) {
    // Fail closed: an unknown actor gets no scope, and without a scope the
    // player cannot read or write a recovery record at all.
    throw new Error("GUIDE_ACTOR_SCOPE_UNAVAILABLE");
  }

  // The version prefix and the NUL separator keep the input unambiguous, so a
  // future scheme can be introduced without colliding with this one.
  return createHash("sha256")
    .update(`${GUIDE_ACTOR_SCOPE_VERSION}\0${userId}`, "utf8")
    .digest("base64url");
}
