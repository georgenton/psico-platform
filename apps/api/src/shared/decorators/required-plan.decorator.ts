import { SetMetadata } from "@nestjs/common";

export const REQUIRED_PLAN_KEY = "requiredPlan";

/**
 * Declares the minimum plan required to call a handler. Enforced by `PlanGuard`.
 *
 * Plan ranking (ascending): FREE < PRO < ANNUAL < B2B.
 *
 * Example:
 * ```ts
 * @Post("transcribe")
 * @UseGuards(JwtAuthGuard, PlanGuard)
 * @RequiredPlan("PRO")
 * transcribe(...) { ... }
 * ```
 */
export const RequiredPlan = (plan: string) =>
  SetMetadata(REQUIRED_PLAN_KEY, plan);
