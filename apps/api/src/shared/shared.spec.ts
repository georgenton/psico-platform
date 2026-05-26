import { describe, it, expect } from "vitest";
import * as shared from "./index";

// Sprint S5 — content/guards/* re-exports were removed. The shared kernel
// is the single source of truth for guards, decorators, and filters. The
// per-symbol identity tests that used to live here are obsolete now that
// all callsites import from shared/ directly.

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
