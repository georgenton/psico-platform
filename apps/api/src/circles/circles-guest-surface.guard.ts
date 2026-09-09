import { Injectable } from "@nestjs/common";
import type { CanActivate } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CirclesRolloutService } from "./circles-rollout.service";
import { circlesException } from "./circles-http-errors";

/**
 * The rollout gate for the routes a guest reaches BEFORE having a session
 * (PR2 · spec §G).
 *
 * `CirclesGuestGuard` cannot cover these: the exchange route is the one that
 * mints the session, so requiring one would make it unreachable. What it needs
 * instead is the coarser question — is the guest surface running at all — and
 * that is a decision with no input from the request, which is what makes it
 * safe to answer without an identity.
 *
 * Under `off` this refuses before the body is validated and before any secret
 * is hashed. A guest can therefore never turn `off` or `pilot` into access by
 * anything they send: the only value that opens this door is an environment
 * variable on the server.
 */
@Injectable()
export class CirclesGuestSurfaceGuard implements CanActivate {
  constructor(private readonly rollout: CirclesRolloutService) {}

  canActivate(): boolean {
    if (!this.rollout.isGuestSurfaceAvailable()) {
      throw circlesException("CIRCLES_UNAVAILABLE");
    }
    return true;
  }
}
