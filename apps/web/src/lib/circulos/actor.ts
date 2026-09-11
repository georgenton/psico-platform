import "server-only";

import type { CircleActivityView } from "@psico/types";

import { guestScope, readActivityAsGuest, readActivityAsMember } from "./bff";
import { readGuestToken } from "./guest-cookie";
import { getAccessToken } from "@/lib/api.server";

/**
 * Who is acting on this activity — decided here, once, server-side.
 *
 * ── The bug this replaces ──────────────────────────────────────────────────
 *
 * Every surface used to prefer the guest cookie unconditionally: if one was
 * present, it won, and if it turned out to be invalid the request was refused.
 * A member who had once opened an invitation on that browser — or who shares a
 * device, or whose guest session simply expired weeks later — was locked out of
 * their OWN activity by a dead cookie they had no way to see or clear. The test
 * that claimed otherwise was named "a broken guest cookie does not break a
 * member's session" and asserted exactly the opposite.
 *
 * ── The order, and why it is this one ──────────────────────────────────────
 *
 * 1. A signed-in member who is authorised for THIS activity wins. If both
 *    credentials would work, the account is the stronger claim: it survives the
 *    cookie expiring and it is the identity the person manages.
 * 2. Otherwise a live guest session bound to exactly this activity is used.
 *    That covers the signed-in non-member — somebody with an account who was
 *    invited as a guest — which is an ordinary case, not an edge one.
 * 3. Otherwise, refused.
 *
 * ── What the browser does not get to do ────────────────────────────────────
 *
 * There is no `actorKind`, no role, no `userId`, no `participantId` and no
 * credential selector in any request. The only inputs are two HttpOnly cookies
 * and the activity id in the path; everything else is the API's answer.
 *
 * ── Transient failure is not a signal ──────────────────────────────────────
 *
 * A 429, a 5xx or a dropped connection means "we do not know", and "we do not
 * know" must never be read as "not a member". Treating it that way would make a
 * rate-limited member silently fall through to the guest path — or to a
 * refusal — on a request that would have succeeded a second later. Only a
 * DEFINITE negative (401, 403, 404) moves to the next candidate; anything else
 * stops and reports.
 *
 * ── Exactly once ──────────────────────────────────────────────────────────
 *
 * Resolution uses READS only. A command is never attempted as one actor and
 * retried as another: by the time a command is sent, the actor is already
 * decided, so there is no path on which a withdrawal or a share could be
 * applied twice.
 */

export type Actor =
  | {
      readonly kind: "USER";
      readonly token: string;
      /** The view fetched while resolving. Free — no second round trip. */
      readonly view: CircleActivityView | null;
    }
  | { readonly kind: "GUEST"; readonly token: string }
  | { readonly kind: "NONE"; readonly status: number; readonly code: string };

/** Statuses that mean "definitely not this actor", as opposed to "unknown". */
function isDefiniteNo(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}

export async function resolveActor(activityId: string): Promise<Actor> {
  const accessToken = getAccessToken();
  const guestToken = readGuestToken();

  if (accessToken) {
    const read = await readActivityAsMember(accessToken, activityId);

    if (read.ok && read.data) {
      // Authorised as a member. This wins even if a guest cookie is also
      // present and also valid.
      return { kind: "USER", token: accessToken, view: read.data };
    }

    if (!isDefiniteNo(read.status)) {
      // Rate limited, upstream error, or the network. We do not know whether
      // this person is a member, and guessing in either direction is worse
      // than saying so.
      return {
        kind: "NONE",
        status: read.status,
        code: read.code ?? "CIRCLE_UNAVAILABLE",
      };
    }
    // A definite no. Fall through — a signed-in person can still be a guest.
  }

  if (guestToken) {
    const scope = await guestScope(guestToken);

    if (scope.ok && scope.data) {
      if (scope.data.activityId === activityId) {
        return { kind: "GUEST", token: guestToken };
      }
      // A live session, for a DIFFERENT activity. Same refusal as "no such
      // activity": confirming that this one exists but is not yours still
      // tells a stranger it exists.
      return {
        kind: "NONE",
        status: 403,
        code: "CIRCLE_FORBIDDEN",
      };
    }

    if (!isDefiniteNo(scope.status)) {
      return {
        kind: "NONE",
        status: scope.status,
        code: scope.code ?? "CIRCLE_UNAVAILABLE",
      };
    }
    // The cookie is dead. If we got here the member path already said no, so
    // there is nothing left to try — but a dead cookie has not BLOCKED
    // anything: the member path ran first and on its own merits.
  }

  return {
    kind: "NONE",
    status: accessToken || guestToken ? 403 : 401,
    code: "CIRCLE_FORBIDDEN",
  };
}

/**
 * The activity as the resolved actor may see it.
 *
 * Reuses the read the member path already made rather than repeating it; the
 * guest path has to make its own, because resolving a guest session says who
 * they are, not what they can see.
 */
export async function readActivityAs(
  actor: Actor,
  activityId: string,
): Promise<{
  readonly view: CircleActivityView | null;
  readonly status: number;
  readonly code: string | null;
}> {
  if (actor.kind === "NONE") {
    return { view: null, status: actor.status, code: actor.code };
  }
  if (actor.kind === "USER") {
    if (actor.view) return { view: actor.view, status: 200, code: null };
    const read = await readActivityAsMember(actor.token, activityId);
    return {
      view: read.ok ? read.data : null,
      status: read.status,
      code: read.code,
    };
  }
  const read = await readActivityAsGuest(actor.token, activityId);
  return {
    view: read.ok ? read.data : null,
    status: read.status,
    code: read.code,
  };
}
