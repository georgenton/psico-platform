// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleInvitationRepository } from "./circle-invitation.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleGuestSessionRepository } from "./circle-guest-session.repository";
import type { CircleInvitationRow } from "./circle-invitation.repository";

/**
 * The lock order, as ONE implementation rather than three agreeing comments.
 *
 * ── The order, and why it is not anybody's to choose locally ───────────────
 *
 *   1 CircleMember → 2 CircleInvitation → 3 CircleGuestSession
 *   → 4 CircleActivity → 5 CircleActivityParticipant → 6 CircleArtifact
 *
 * Three commands end an activity and revoke what hangs off it: a person
 * leaving, the sweep cancelling a room nobody can finish, and account deletion
 * detaching a seat. They run concurrently by construction — one is a worker —
 * and they touch the same rows. If any two of them take those rows in
 * different orders, PostgreSQL resolves the cycle by killing one of them, and
 * what the killed one was doing was somebody pressing «retirarme» or a sweep
 * abandoning its batch. A deadlock is not a slow query, and a retry around it
 * is the symptom being absorbed rather than the inversion being removed.
 *
 * ── Why a function and not a convention ────────────────────────────────────
 *
 * There were three implementations of "take this activity's access rows in
 * canonical order": the sweep's pair of `lockForActivity` calls, the deletion
 * service's `findMany` + per-row loop, and — in the participation service —
 * none at all, which is the inversion this closes. Each carried a comment
 * saying it followed the order. A comment cannot be taken by a transaction,
 * and the one place where the comment was missing is exactly where the
 * deadlock was.
 *
 * So the order lives here, once, and the three callers ask for it.
 *
 * ── What "access rows" means, and what it deliberately excludes ────────────
 *
 * The rows that grant somebody a way IN: unredeemed links and issued guest
 * credentials. Not the activity, not the seats, not the artifacts — those come
 * after, and each caller takes them for its own reasons. This function is the
 * part of the order that is shared, and nothing more.
 */
export interface ActivityAccessRepositories {
  readonly invitations: CircleInvitationRepository;
  readonly guestSessions: CircleGuestSessionRepository;
}

/** Whatever both repositories can run their locking statement on. */
export type ActivityAccessTx = Parameters<
  CircleInvitationRepository["lockForActivity"]
>[1] &
  Parameters<CircleGuestSessionRepository["lockForActivity"]>[1];

/**
 * Lock every invitation and every guest session of an activity, in order.
 *
 * Call this BEFORE locking the activity itself. Within each set the order is
 * the primary key ascending — the repositories' own `ORDER BY "id"` — so two
 * transactions walking the same room queue behind each other instead of
 * interleaving into a cycle.
 *
 * Returns the locked invitation rows, because the caller that needs to decide
 * whether a room is still unfinishable should decide it from the rows it is
 * holding rather than from a second, unlocked read.
 */
export async function lockActivityAccessRows(
  repos: ActivityAccessRepositories,
  activityId: string,
  tx: ActivityAccessTx,
): Promise<readonly CircleInvitationRow[]> {
  // 2 · every invitation on this activity, lowest id first
  const invitations = await repos.invitations.lockForActivity(activityId, tx);
  // 3 · every guest session on it, same rule
  await repos.guestSessions.lockForActivity(activityId, tx);
  return invitations;
}
