import { describe, it, expect } from "vitest";
import "reflect-metadata";
import { JwtAuthGuard } from "../auth";
import { OnboardingController } from "./onboarding.controller";

/**
 * Mirrors the pattern of users.controller.spec.ts (Sesión 9) — we verify
 * auth posture + handler count at the metadata layer. Behavioural coverage
 * lives in onboarding.service.spec.ts.
 */
describe("OnboardingController · auth posture", () => {
  it("declares JwtAuthGuard at the controller level (every endpoint authed)", () => {
    const guards = Reflect.getMetadata("__guards__", OnboardingController) as
      | Array<new (...args: unknown[]) => unknown>
      | undefined;

    expect(guards).toBeDefined();
    expect(guards).toContain(JwtAuthGuard);
  });

  it("exposes exactly the 11 expected handlers", () => {
    const proto = OnboardingController.prototype as unknown as Record<
      string,
      unknown
    >;
    const handlers = Object.getOwnPropertyNames(proto).filter(
      (name) => name !== "constructor" && typeof proto[name] === "function",
    );

    expect(handlers.sort()).toEqual(
      [
        "getIntro",
        "skip",
        "getMotivos",
        "step1",
        "getMoods",
        "step2",
        "step3",
        "recommendation",
        "complete",
        "getTour",
        "completeTour",
      ].sort(),
    );
  });

  it("anchors all routes under /onboarding (the global /api prefix adds /api)", () => {
    const path = Reflect.getMetadata("path", OnboardingController);
    expect(path).toBe("onboarding");
  });
});
