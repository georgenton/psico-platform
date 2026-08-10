import { describe, expect, it } from "vitest";
import { IMAGE_MAX_BYTES } from "../shared/image-upload";
import { TRANSPORT_LIMITS } from "./content-studio.controller";

/**
 * The multipart transport guard.
 *
 * Multer aborts at or ABOVE `fileSize`, which is one byte tighter than the rule
 * the service and the UI state ("hasta 5 MB"). Without the `+ 1` a file of
 * exactly 5 MB is refused by the transport while every other layer accepts it —
 * a boundary bug nobody would find until an editor hit it with a real photo.
 *
 * Verified against the running server: 5,242,880 bytes reaches the service;
 * 5,242,881 is refused with 413 before any Buffer is allocated.
 */
describe("Content Studio multipart limits", () => {
  it("lets a file of exactly the documented maximum through", () => {
    expect(IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024);
    // Multer rejects at >= limit, so "accepted" means below this number.
    expect(TRANSPORT_LIMITS.fileSize).toBe(IMAGE_MAX_BYTES + 1);
    expect(IMAGE_MAX_BYTES < TRANSPORT_LIMITS.fileSize).toBe(true);
  });

  it("stops one byte over, so the service never sees an oversized Buffer", () => {
    expect(IMAGE_MAX_BYTES + 1 >= TRANSPORT_LIMITS.fileSize).toBe(true);
  });
});

/**
 * The ADMIN media surface is ADMIN-only.
 *
 * The guards are class-level on ContentStudioController, so every media route
 * inherits them — this pins that the class still carries them, because a
 * refactor that moved a route to its own controller would silently drop them.
 */
describe("Content Studio media routes are ADMIN-guarded", () => {
  it("carries JwtAuthGuard + RolesGuard and requires ADMIN", async () => {
    const { ContentStudioController } =
      await import("./content-studio.controller");
    const { JwtAuthGuard } = await import("../auth/guards/jwt-auth.guard");
    const { RolesGuard } = await import("../shared");

    const guards = Reflect.getMetadata(
      "__guards__",
      ContentStudioController,
    ) as unknown[] | undefined;
    expect(guards).toEqual([JwtAuthGuard, RolesGuard]);

    const { REQUIRED_ROLE_KEY } =
      await import("../shared/decorators/required-role.decorator");
    const role = Reflect.getMetadata(
      REQUIRED_ROLE_KEY,
      ContentStudioController,
    );
    // ADMIN, not AUTHOR: `/autor` is scoped to books a writer owns, and these
    // are platform books nobody owns.
    expect(role).toBe("ADMIN");
  });
});
