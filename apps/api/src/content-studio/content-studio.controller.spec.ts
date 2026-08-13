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

/**
 * The role matrix, exercised rather than asserted from metadata.
 *
 * The test above pins that the class still CARRIES the guards; this one runs
 * the guard the class carries against every role, for the routes that actually
 * change something. Metadata can be right while the guard is wrong, and the
 * failure mode — an AUTHOR editing a platform book — is not one to infer.
 */
describe("Content Studio role matrix", () => {
  const WRITES = [
    "saveDraft",
    "createChapter",
    "discardChapter",
    // Reordering is a structural write, so it is guarded exactly like the rest.
    "reorderChapters",
    "uploadCover",
    "uploadChapterImage",
    "uploadAudiobook",
    "uploadPodcast",
    "createVideoUploadIntent",
    "publishMediaDraft",
  ] as const;

  async function decide(role: string | null, handler: string) {
    const { RolesGuard } = await import("../shared");
    const { Reflector } = await import("@nestjs/core");
    const { ContentStudioController } =
      await import("./content-studio.controller");

    const guard = new RolesGuard(new Reflector());
    const ctx = {
      getHandler: () =>
        (
          ContentStudioController.prototype as unknown as Record<
            string,
            () => void
          >
        )[handler],
      getClass: () => ContentStudioController,
      switchToHttp: () => ({
        getRequest: () => (role === null ? {} : { user: { role } }),
      }),
    };
    try {
      return guard.canActivate(
        ctx as unknown as Parameters<typeof guard.canActivate>[0],
      );
    } catch {
      // The guard throws rather than returning false; either way it is a refusal.
      return false;
    }
  }

  it.each(WRITES)("names a handler that exists · %s", async (handler) => {
    // Without this, a renamed or mistyped handler makes every row above test
    // `undefined` and pass for the wrong reason.
    const { ContentStudioController } =
      await import("./content-studio.controller");
    expect(
      typeof (
        ContentStudioController.prototype as unknown as Record<string, unknown>
      )[handler],
    ).toBe("function");
  });

  it.each(WRITES)("refuses a plain USER on %s", async (handler) => {
    await expect(decide("USER", handler)).resolves.toBe(false);
  });

  it.each(WRITES)("refuses an AUTHOR on %s", async (handler) => {
    // `/autor` is scoped to books a writer owns. These are platform books that
    // nobody owns, so authorship grants nothing here.
    await expect(decide("AUTHOR", handler)).resolves.toBe(false);
  });

  it.each(WRITES)("refuses a PSYCHOLOGIST on %s", async (handler) => {
    await expect(decide("PSYCHOLOGIST", handler)).resolves.toBe(false);
  });

  it.each(WRITES)("allows an ADMIN on %s", async (handler) => {
    await expect(decide("ADMIN", handler)).resolves.toBe(true);
  });

  it("refuses a request carrying no user at all", async () => {
    // Belt and braces behind JwtAuthGuard: if the role check ever ran first,
    // an anonymous request must still be a refusal and not an undefined read.
    await expect(decide(null, "saveDraft")).resolves.toBe(false);
  });
});
