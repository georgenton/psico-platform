import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnnotationsService } from "./annotations.service";
import * as markAnchor from "../content-core/marks/mark-anchor";

// CC-6C: anchor resolution lives in the mark-anchor resolver (pg-spec tested).
vi.mock("../content-core/marks/mark-anchor", () => ({
  resolveAnnotationWriteAnchor: vi.fn(),
  resolveStoredMarkBlockKey: vi.fn(),
}));

describe("AnnotationsService", () => {
  let prisma: any;
  let lector: any;
  let access: any;
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
    // CC-6E — the content-access gate is injected; by default it allows.
    access = { assertCanWriteMark: vi.fn().mockResolvedValue(undefined) };
    svc = new AnnotationsService(prisma, lector, access);
  });

  it("creates after resolving the durable anchor, serialising by blockKey", async () => {
    const result = await svc.create("user-1", "PRO", {
      blockId: "b-1",
      text: "hola",
    });
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
    const result = await svc.create("user-1", "PRO", {
      blockKey: "pure-core-key",
      text: "nota",
    });
    expect(result.annotation.blockId).toBeNull();
    expect(result.annotation.blockKey).toBe("pure-core-key");
  });

  it("update re-resolves the stable blockKey so a pure-core row stays bucketed", async () => {
    prisma.annotation.findUnique.mockResolvedValue({ userId: "user-1" });
    prisma.annotation.update.mockResolvedValueOnce({
      id: "a-9",
      userId: "user-1",
      blockId: null,
      contentBlockId: "cb-9",
      text: "editada",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(markAnchor.resolveStoredMarkBlockKey).mockResolvedValueOnce(
      "pure-core-key",
    );
    const result = await svc.update("user-1", "a-9", { text: "editada" });
    expect(markAnchor.resolveStoredMarkBlockKey).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ contentBlockId: "cb-9", blockId: null }),
    );
    expect(result.annotation.blockKey).toBe("pure-core-key");
    expect(result.annotation.blockKey).not.toBe("");
  });

  it("CC-6E: denies the create (and never resolves the anchor) without entitlement", async () => {
    access.assertCanWriteMark.mockRejectedValueOnce(
      new ForbiddenException("PRO_REQUIRED"),
    );
    vi.mocked(markAnchor.resolveAnnotationWriteAnchor).mockClear();
    await expect(
      svc.create("user-1", "FREE", { blockKey: "key-abc", text: "hola" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(access.assertCanWriteMark).toHaveBeenCalledWith({
      userId: "user-1",
      userPlan: "FREE",
      blockKey: "key-abc",
      blockId: undefined,
    });
    expect(markAnchor.resolveAnnotationWriteAnchor).not.toHaveBeenCalled();
    expect(prisma.annotation.create).not.toHaveBeenCalled();
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
