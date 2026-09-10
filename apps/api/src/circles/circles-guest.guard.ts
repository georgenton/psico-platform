import { Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CircleGuestSessionRepository } from "./circle-guest-session.repository";
import { guestSessionIsLive } from "./circle-guest-session.repository";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CirclesRolloutService } from "./circles-rollout.service";
import { attachCircleActor, buildGuestActor } from "./circles-actor";
import type { CircleActorRequest } from "./circles-actor";
import { circlesException } from "./circles-http-errors";
import {
  hashSecret,
  hashesMatch,
  MAX_PRESENTED_SECRET_LENGTH,
} from "./circles-secrets";

/**
 * The guest gate (PR2 · spec §F).
 *
 * The header name is fixed here and nowhere else. The value is a raw opaque
 * session secret, hashed on arrival; what is compared against the database is
 * the hash, and the raw value is not logged, not stored and not echoed.
 *
 * Four properties this guard is written to hold:
 *
 *  · **PostgreSQL decides, every time.** There is no cache and no signed claim.
 *    A session revoked one millisecond ago fails the very next request, because
 *    the state is read on the request rather than trusted from a token.
 *  · **The scope is the row's, not the caller's.** `activityId` and
 *    `participantId` come out of the session row. Nothing from the request
 *    contributes to them; a body field of the same name is ignored, and
 *    `circles-scope.spec.ts` pins that no DTO declares one.
 *  · **One answer for every failure.** Missing header, malformed value,
 *    unknown session, expired session and revoked session all produce
 *    `401 CIRCLE_GUEST_SESSION_INVALID`. There is no path that says which.
 *  · **A guest can never open a closed surface.** The rollout is checked before
 *    the lookup, so under `off` a guest secret is not even hashed.
 */
@Injectable()
export class CirclesGuestGuard implements CanActivate {
  /** Lowercase: Node normalizes incoming header names to lowercase. */
  static readonly HEADER = "x-circle-guest-session";

  constructor(
    private readonly sessions: CircleGuestSessionRepository,
    private readonly rollout: CirclesRolloutService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CircleActorRequest>();

    // Rollout first: under `off` nothing about a guest secret is examined.
    if (!this.rollout.isGuestSurfaceAvailable()) {
      throw circlesException("CIRCLES_UNAVAILABLE");
    }

    const presented = request.headers[CirclesGuestGuard.HEADER];
    // A repeated header arrives as an array. Refuse rather than pick one:
    // choosing silently would make which secret was checked depend on header
    // ordering, and a caller could send a valid one alongside a probe.
    if (typeof presented !== "string" || presented.length === 0) {
      throw circlesException("CIRCLE_GUEST_SESSION_INVALID");
    }
    if (presented.length > MAX_PRESENTED_SECRET_LENGTH) {
      throw circlesException("CIRCLE_GUEST_SESSION_INVALID");
    }

    const tokenHash = hashSecret(presented);
    const row = await this.sessions.findByTokenHash(tokenHash);

    const now = new Date();
    if (
      !row ||
      !hashesMatch(row.tokenHash, tokenHash) ||
      !guestSessionIsLive(row, now)
    ) {
      throw circlesException("CIRCLE_GUEST_SESSION_INVALID");
    }

    attachCircleActor(request, buildGuestActor(row));
    // Liveness marking is deliberately not awaited into the decision, and its
    // failure is swallowed here as well as inside the repository: failing to
    // record that somebody was seen must never fail their authorization, and
    // an unhandled rejection is a failure looking for somewhere to land.
    void this.sessions.touch(row.id, now).catch(() => undefined);
    return true;
  }
}
