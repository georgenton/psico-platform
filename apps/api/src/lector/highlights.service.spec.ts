import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HighlightsService } from "./highlights.service";

describe("HighlightsService", () => {
  let prisma: any;
  let lector: any;
  let svc: HighlightsService;

  beforeEach(() => {
    prisma = {
      highlight: {
        create: vi.fn().mockResolvedValue({
          id: "h-1",
          userId: "user-1",
          blockId: "b-1",
          startOffset: 0,
          endOffset: 5,
          color: "YELLOW",
          note: null,
          createdAt: new Date(),
        }),
        findUnique: vi.fn(),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
    lector = {
      validateHighlightOffsets: vi.fn().mockResolvedValue(undefined),
      resolveAnchorTarget: vi
        .fn()
        .mockResolvedValue({ blockId: "b-1", contentBlockId: null }),
    };
    svc = new HighlightsService(prisma, lector);
  });

  it("resolves the anchor from blockKey and serialises a blockKey", async () => {
    lector.resolveAnchorTarget.mockResolvedValue({
      blockId: "b-1",
      contentBlockId: "cb-1",
    });
    const result = await svc.create("user-1", {
      blockKey: "key-abc",
      startOffset: 0,
      endOffset: 5,
    });
    expect(lector.resolveAnchorTarget).toHaveBeenCalledWith({
      blockKey: "key-abc",
      blockId: undefined,
    });
    expect(prisma.highlight.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ blockId: "b-1", contentBlockId: "cb-1" }),
    });
    // blockKey is derived deterministically from the legacy blockId.
    expect(typeof result.highlight.blockKey).toBe("string");
    expect(result.highlight.blockKey.length).toBeGreaterThan(0);
  });

  it("creates with YELLOW default when no color provided", async () => {
    const result = await svc.create("user-1", {
      blockId: "b-1",
      startOffset: 0,
      endOffset: 5,
    });
    expect(result.ok).toBe(true);
    expect(prisma.highlight.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ color: "YELLOW" }),
    });
  });

  it("delegates offset validation to LectorService", async () => {
    await svc.create("user-1", {
      blockId: "b-1",
      startOffset: 0,
      endOffset: 5,
    });
    expect(lector.validateHighlightOffsets).toHaveBeenCalledWith("b-1", 0, 5);
  });

  it("rejects delete for non-owner with FORBIDDEN", async () => {
    prisma.highlight.findUnique.mockResolvedValue({ userId: "other-user" });
    await expect(svc.delete("user-1", "h-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.highlight.delete).not.toHaveBeenCalled();
  });

  it("404s when the highlight does not exist", async () => {
    prisma.highlight.findUnique.mockResolvedValue(null);
    await expect(svc.delete("user-1", "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("allows delete for owner", async () => {
    prisma.highlight.findUnique.mockResolvedValue({ userId: "user-1" });
    await expect(svc.delete("user-1", "h-1")).resolves.toBeUndefined();
    expect(prisma.highlight.delete).toHaveBeenCalledWith({
      where: { id: "h-1" },
    });
  });
});
