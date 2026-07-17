import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnnotationsService } from "./annotations.service";
import * as markAnchor from "../content-core/marks/mark-anchor";

// CC-6C: anchor resolution lives in the mark-anchor resolver (pg-spec tested).
vi.mock("../content-core/marks/mark-anchor", () => ({
  resolveAnnotationWriteAnchor: vi.fn(),
}));

describe("AnnotationsService", () => {
  let prisma: any;
  let lector: any;
  let svc: AnnotationsService;

  beforeEach(() => {
    vi.mocked(markAnchor.resolveAnnotationWriteAnchor).mockResolvedValue({
      source: "content-core",
      blockKey: "key-abc",
      contentBlockId: "cb-1",
      blockId: "b-1",
    });
    prisma = {
      annotation: {
        create: vi.fn().mockResolvedValue({
          id: "a-1",
          userId: "user-1",
          blockId: "b-1",
          contentBlockId: "cb-1",
          text: "anotación",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: vi.fn().mockResolvedValue({
          id: "a-1",
          userId: "user-1",
          blockId: "b-1",
          contentBlockId: "cb-1",
          text: "nueva",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findUnique: vi.fn(),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
    lector = {};
    svc = new AnnotationsService(prisma, lector);
  });

  it("creates after resolving the durable anchor, serialising by blockKey", async () => {
    const result = await svc.create("user-1", { blockId: "b-1", text: "hola" });
    expect(markAnchor.resolveAnnotationWriteAnchor).toHaveBeenCalledWith(
      prisma,
      {
        blockKey: undefined,
        blockId: "b-1",
      },
    );
    expect(prisma.annotation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ blockId: "b-1", contentBlockId: "cb-1" }),
    });
    expect(result.annotation.text).toBe("anotación");
    expect(result.annotation.blockKey).toBe("key-abc");
  });

  it("stores a pure Content Core annotation (blockId null)", async () => {
    vi.mocked(markAnchor.resolveAnnotationWriteAnchor).mockResolvedValueOnce({
      source: "content-core",
      blockKey: "pure-core-key",
      contentBlockId: "cb-9",
      blockId: null,
    });
    prisma.annotation.create.mockResolvedValueOnce({
      id: "a-9",
      userId: "user-1",
      blockId: null,
      contentBlockId: "cb-9",
      text: "nota",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await svc.create("user-1", {
      blockKey: "pure-core-key",
      text: "nota",
    });
    expect(result.annotation.blockId).toBeNull();
    expect(result.annotation.blockKey).toBe("pure-core-key");
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
