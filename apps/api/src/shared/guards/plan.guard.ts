import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable, ForbiddenException } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Reflector } from "@nestjs/core";
import { REQUIRED_PLAN_KEY } from "../decorators/required-plan.decorator";
import type { AuthenticatedUser } from "../../auth";

// Ascending rank — higher rank entitles to lower rank's content.
// Keep in sync with Prisma `Plan` enum.
const PLAN_RANK: Record<string, number> = {
  FREE: 0,
  PRO: 1,
  ANNUAL: 2,
  B2B: 3,
};

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRED_PLAN_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @RequiredPlan() declared — guard is a no-op.
    // This lets the guard be applied at the controller level (covering all
    // handlers) while only a subset of handlers actually enforce a plan.
    if (!required) return true;

    const { plan } = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>().user;

    if ((PLAN_RANK[plan] ?? 0) < (PLAN_RANK[required] ?? 0)) {
      throw new ForbiddenException(
        `Este contenido requiere plan ${required}. Actualiza tu plan.`,
      );
    }

    return true;
  }
}
