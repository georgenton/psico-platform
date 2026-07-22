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
 *   - the same account always derives the same scope, two accounts never do.
 *
 * The actorScope is NOT treated as a secret. It is a pseudonymous partition
 * that authorises no command and grants no access; authorisation continues to
 * depend exclusively on the JWT session the API validates. That is why a plain
 * SHA-256 is enough here and a KDF would buy nothing: the value gates which
 * stored record may be replayed, never what the server will accept.
 *
 * The actor itself comes from the API (`/user/me` through `serverFetch`), not
 * from decoding the access cookie — that cookie expires in 15 minutes while
 * the session lives 30 days.
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
