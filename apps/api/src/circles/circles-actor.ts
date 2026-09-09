import type { CircleActor } from "@psico/types";
import type { Request } from "express";

/**
 * Where a resolved `CircleActor` lives on the request, and the only way to read
 * one (PR2 · spec §F, ADR 0023 §2.3).
 *
 * The whole point of the type is that **no request body ever contributes to
 * it**. A `userId` comes from the JWT the auth layer verified; a
 * `participantId` and an `activityId` come from the guest-session row the
 * server just read out of PostgreSQL. There is no code path that takes either
 * from a DTO, and `circles-scope.spec.ts` pins that no Círculos DTO declares a
 * field with those names.
 *
 * A guest's identity INCLUDES the activity it belongs to. That is what makes
 * scoping structural: a handler holding a guest actor cannot ask about another
 * activity without first inventing an activity id the actor does not have, and
 * the moment it compares the two the mismatch is obvious. Contrast the version
 * where a guest is just a session id and every query has to remember a filter.
 */

/** The request shape after a Círculos guard has run. */
export interface CircleActorRequest extends Request {
  circleActor?: CircleActor;
}

/** Attach the server-resolved actor. Called ONLY by the guards in this module. */
export function attachCircleActor(
  request: CircleActorRequest,
  actor: CircleActor,
): void {
  request.circleActor = actor;
}

/**
 * Read the actor a guard resolved, or `undefined` when no guard ran.
 *
 * Handlers use the `@CurrentCircleActor()` decorator rather than this; it
 * exists so the decorator and the specs share one accessor instead of two
 * copies of the same property name.
 */
export function readCircleActor(
  request: CircleActorRequest,
): CircleActor | undefined {
  return request.circleActor;
}

/**
 * The one place a GUEST actor is built. Takes only values that came out of a
 * database row — the signature has nowhere to put a client-supplied one.
 */
export function buildGuestActor(row: {
  id: string;
  activityId: string;
  participantId: string;
}): CircleActor {
  return Object.freeze({
    kind: "GUEST",
    guestSessionId: row.id,
    activityId: row.activityId,
    participantId: row.participantId,
  });
}

/** The one place a USER actor is built, from the verified JWT subject. */
export function buildUserActor(userId: string): CircleActor {
  return Object.freeze({ kind: "USER", userId });
}
