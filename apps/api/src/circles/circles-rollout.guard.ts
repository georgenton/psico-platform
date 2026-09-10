import { Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CirclesRolloutService } from "./circles-rollout.service";
import { attachCircleActor, buildUserActor } from "./circles-actor";
import type { CircleActorRequest } from "./circles-actor";
import { circlesException } from "./circles-http-errors";

/**
 * The rollout gate for the AUTHENTICATED side of Círculos (PR2 · spec §G).
 *
 * Runs after `JwtAuthGuard` and before anything else: a denied actor gets
 * `503 CIRCLES_UNAVAILABLE` before a body is parsed or a row is read. The 503
 * is opaque — it never says the mode, the allowlist or the reason, so a caller
 * cannot distinguish "the surface is off" from "you are not in the pilot", and
 * the response is identical whether or not the allowlist exists.
 *
 * It also builds the `USER` actor, in the same place and for the same reason:
 * the actor and the entitlement to act are one decision, made once, from the
 * verified JWT subject. Nothing downstream needs to re-derive either.
 */
@Injectable()
export class CirclesRolloutGuard implements CanActivate {
  constructor(private readonly rollout: CirclesRolloutService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<CircleActorRequest & { user?: AuthenticatedUser }>();
    const user = request.user;

    // `JwtAuthGuard` guarantees `user`. If it is somehow absent we fail closed
    // with the same opaque 503 rather than trusting an unauthenticated request
    // — an unauthenticated caller must never be able to reach a surface by
    // arriving before the guard that would have identified them.
    if (!user || !this.rollout.isAvailable(user.userId)) {
      throw circlesException("CIRCLES_UNAVAILABLE");
    }

    attachCircleActor(request, buildUserActor(user.userId));
    return true;
  }
}
