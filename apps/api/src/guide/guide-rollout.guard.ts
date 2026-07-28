import { Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedUser } from "../auth";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GuideRolloutService } from "./guide-rollout.service";
import { guideException } from "./guide-http-errors";

/**
 * CC-7.R1 — the rollout gate for the five Guide COMMANDS.
 *
 * Runs AFTER `JwtAuthGuard` (a controller-level guard, so it resolves first)
 * and BEFORE the parser: a denied actor gets `503 GUIDE_UNAVAILABLE` before any
 * body is parsed, any lifecycle transition runs, or any row is written. It
 * never substitutes for entitlement — an allowed actor still flows through the
 * catalog, editorial convergence, ContentAccess and the lifecycle unchanged.
 */
@Injectable()
export class GuideRolloutGuard implements CanActivate {
  constructor(private readonly rollout: GuideRolloutService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    // `JwtAuthGuard` guarantees `user`; if it is somehow absent we fail closed
    // with the same opaque 503 rather than trusting an unauthenticated request.
    if (!user || !this.rollout.isAvailable(user.userId)) {
      throw guideException("GUIDE_UNAVAILABLE");
    }
    return true;
  }
}
