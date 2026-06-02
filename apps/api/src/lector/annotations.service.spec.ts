import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnnotationsService } from "./annotations.service";

describe("AnnotationsService", () => {
  let prisma: any;
  let lector: any;
  let svc: AnnotationsService;

  beforeEach(() => {
    prisma = {
      annotation: {
        create: vi.fn().mockResolvedValue({
          id: "a-1",
          userId: "user-1",
          blockId: "b-1",
          text: "anotación",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: vi.fn().mockResolvedValue({
          id: "a-1",
          userId: "user-1",
          blockId: "b-1",
          text: "nueva",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findUnique: vi.fn(),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
    lector = { assertBlockExists: vi.fn().mockResolvedValue(undefined) };
    svc = new AnnotationsService(prisma, lector);
  });

  it("creates after verifying the block exists", async () => {
    const result = await svc.create("user-1", { blockId: "b-1", text: "hola" });
    expect(lector.assertBlockExists).toHaveBeenCalledWith("b-1");
    expect(result.annotation.text).toBe("anotación");
  });

  it("update rejects non-owner with FORBIDDEN", async () => {
    prisma.annotation.findUnique.mockResolvedValue({ userId: "other" });
    await expect(
      svc.update("user-1", "a-1", { text: "x" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("update 404s when annotation not found", async () => {
    prisma.annotation.findUnique.mockResolvedValue(null);
    await expect(
      svc.update("user-1", "missing", { text: "x" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("delete rejects non-owner", async () => {
    prisma.annotation.findUnique.mockResolvedValue({ userId: "other" });
    await expect(svc.delete("user-1", "a-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.annotation.delete).not.toHaveBeenCalled();
  });

  it("delete works for owner", async () => {
    prisma.annotation.findUnique.mockResolvedValue({ userId: "user-1" });
    await expect(svc.delete("user-1", "a-1")).resolves.toBeUndefined();
    expect(prisma.annotation.delete).toHaveBeenCalled();
  });
});
