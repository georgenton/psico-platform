/**
 * Session revocation — the single primitive behind every "kill all of this
 * user's live access" flow (ADR 0015).
 *
 * Two writes, always together, inside the caller's transaction:
 *   1. bump `User.authRevision` → every already-issued access token now carries
 *      a stale `ar` claim and is rejected by JwtStrategy on its next request
 *      (no wait for the 15m natural expiry);
 *   2. delete every RefreshToken for the user → the stolen/rotated refresh
 *      token can no longer mint a fresh access token with the new revision.
 *
 * We hard-delete refresh tokens (not soft-revoke) on these flows: the point is
 * containment, and a deleted row cannot be replayed. Per-device logout keeps
 * using soft-revoke elsewhere — it must NOT bump the global revision.
 */

/**
 * Minimal structural type of the Prisma client / transaction client this helper
 * needs. Declared structurally so the helper is unit-testable with a plain mock
 * and carries no `@prisma/client` import.
 */
export interface SessionRevocationTx {
  user: {
    update(args: {
      where: { id: string };
      data: { authRevision: { increment: number } };
    }): Promise<unknown>;
  };
  refreshToken: {
    deleteMany(args: { where: { userId: string } }): Promise<{ count: number }>;
  };
}

/**
 * Bump the user's auth revision and delete all their refresh tokens.
 * MUST run inside a transaction so the two writes commit atomically — a partial
 * apply would leave a live token path open.
 */
export async function revokeAllUserSessions(
  tx: SessionRevocationTx,
  userId: string,
): Promise<void> {
  await tx.user.update({
    where: { id: userId },
    data: { authRevision: { increment: 1 } },
  });
  await tx.refreshToken.deleteMany({ where: { userId } });
}
