import { SetMetadata } from "@nestjs/common";

export const REQUIRED_PLAN_KEY = "requiredPlan";
export const RequiredPlan = (plan: string) =>
  SetMetadata(REQUIRED_PLAN_KEY, plan);
