import { describe, it, expect } from "vitest";
import * as shared from "./index";
import { PlanGuard as DeprecatedPlanGuard } from "../content/guards/plan.guard";
import { RolesGuard as DeprecatedRolesGuard } from "../content/guards/roles.guard";
import { CurrentUser as DeprecatedCurrentUser } from "../content/guards/current-user.decorator";
import {
  RequiredPlan as DeprecatedRequiredPlan,
  REQUIRED_PLAN_KEY as DEPRECATED_PLAN_KEY,
} from "../content/guards/required-plan.decorator";
import {
  RequiredRole as DeprecatedRequiredRole,
  REQUIRED_ROLE_KEY as DEPRECATED_ROLE_KEY,
} from "../content/guards/required-role.decorator";

// These tests guard two contracts at once:
//   1. The shared barrel exports everything the rest of the codebase expects.
//   2. The deprecated content/guards/* re-exports point to the SAME class/value
//      as the shared module — so feature controllers using either path get
//      identical behaviour. This is what makes the gradual migration safe.

describe("shared kernel barrel", () => {
  it("re-exports CurrentUser, RequiredPlan/Role, PlanGuard, RolesGuard, HttpExceptionFilter", () => {
    expect(shared.CurrentUser).toBeDefined();
    expect(shared.RequiredPlan).toBeDefined();
    expect(shared.RequiredRole).toBeDefined();
    expect(shared.REQUIRED_PLAN_KEY).toBe("requiredPlan");
    expect(shared.REQUIRED_ROLE_KEY).toBe("requiredRole");
    expect(shared.PlanGuard).toBeDefined();
    expect(shared.RolesGuard).toBeDefined();
    expect(shared.HttpExceptionFilter).toBeDefined();
  });
});

describe("deprecated content/guards/* re-exports", () => {
  it("PlanGuard and RolesGuard from content/guards reference the same class as shared/", () => {
    expect(DeprecatedPlanGuard).toBe(shared.PlanGuard);
    expect(DeprecatedRolesGuard).toBe(shared.RolesGuard);
  });

  it("CurrentUser decorator from content/guards is the same function as shared/", () => {
    expect(DeprecatedCurrentUser).toBe(shared.CurrentUser);
  });

  it("RequiredPlan / RequiredRole decorators and their metadata keys are identical", () => {
    expect(DeprecatedRequiredPlan).toBe(shared.RequiredPlan);
    expect(DeprecatedRequiredRole).toBe(shared.RequiredRole);
    expect(DEPRECATED_PLAN_KEY).toBe(shared.REQUIRED_PLAN_KEY);
    expect(DEPRECATED_ROLE_KEY).toBe(shared.REQUIRED_ROLE_KEY);
  });
});
