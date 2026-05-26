import { describe, it, expect } from "vitest";
import "reflect-metadata";
import { JwtAuthGuard } from "../auth";
import { UsersController } from "./users.controller";

// These tests verify the controller's auth posture at the metadata layer.
// Mounting a full Nest test app to assert "unauthenticated request → 401" is
// overkill — the guard's contract is enforced by Passport before the handler
// runs, so we only need to confirm the controller declares it.

describe("UsersController · auth posture", () => {
  it("declares JwtAuthGuard at the controller level (covers all 12 endpoints)", () => {
    const guards = Reflect.getMetadata("__guards__", UsersController) as
      | Array<new (...args: unknown[]) => unknown>
      | undefined;

    expect(guards).toBeDefined();
    expect(guards).toContain(JwtAuthGuard);
  });

  it("exposes the expected 12 handlers", () => {
    const proto = UsersController.prototype as unknown as Record<
      string,
      unknown
    >;
    const handlers = Object.getOwnPropertyNames(proto).filter(
      (name) => name !== "constructor" && typeof proto[name] === "function",
    );

    expect(handlers.sort()).toEqual(
      [
        "getMe",
        "updateProfile",
        "uploadAvatar",
        "updatePreferences",
        "updateReaderPreferences",
        "updateNotifications",
        "updatePrivacy",
        "updateMood",
        "requestEmailChange",
        "changePassword",
        "requestDataExport",
        "requestDelete",
      ].sort(),
    );
  });

  it("anchors all routes under /user (path metadata)", () => {
    const path = Reflect.getMetadata("path", UsersController);
    expect(path).toBe("user");
  });
});
