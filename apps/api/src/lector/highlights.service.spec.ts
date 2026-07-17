import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HighlightsService } from "./highlights.service";
import * as markAnchor from "../content-core/marks/mark-anchor";

// CC-6C: the durable anchor resolution + offset validation live in the
// mark-anchor resolver (tested for real against Postgres in its pg-spec). Here
// we mock it so the service unit tests stay focused on storage + serialisation.
vi.mock("../content-core/marks/mark-anchor", () => ({
  resolveHighlightWriteAnchor: vi.fn(),
}));

describe("HighlightsService", () => {
  let prisma: any;
  let lector: any;
  let svc: HighlightsService;

  beforeEach(() => {
    vi.mocked(markAnchor.resolveHighlightWriteAnchor).mockResolvedValue({
      source: "content-core",
      blockKey: "key-abc",
      contentBlockId: "cb-1",
      blockId: "b-1",
      blockVersionId: "bv-1",
      quote: "Empie",
    });
    prisma = {
      highlight: {
        create: vi.fn().mockResolvedValue({
          id: "h-1",
          userId: "user-1",
          blockId: "b-1",
          contentBlockId: "cb-1",
          blockVersionId: "bv-1",
          quote: "Empie",
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
    lector = {};
    svc = new HighlightsService(prisma, lector);
  });

  it("resolves the durable anchor and stores contentBlockId + blockVersionId + quote", async () => {
    const result = await svc.create("user-1", {
      blockKey: "key-abc",
      startOffset: 0,
      endOffset: 5,
    });
    expect(markAnchor.resolveHighlightWriteAnchor).toHaveBeenCalledWith(
      prisma,
      {
        blockKey: "key-abc",
        blockId: undefined,
        blockVersionId: undefined,
        startOffset: 0,
        endOffset: 5,
      },
    );
    expect(prisma.highlight.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        blockId: "b-1",
        contentBlockId: "cb-1",
        blockVersionId: "bv-1",
        quote: "Empie",
      }),
    });
    expect(result.highlight.blockKey).toBe("key-abc");
  });

  it("forwards the source blockVersionId the client read to the resolver", async () => {
    await svc.create("user-1", {
      blockKey: "key-abc",
      blockVersionId: "bv-read",
      startOffset: 0,
      endOffset: 5,
    });
    expect(markAnchor.resolveHighlightWriteAnchor).toHaveBeenCalledWith(
      prisma,
      {
        blockKey: "key-abc",
        blockId: undefined,
        blockVersionId: "bv-read",
        startOffset: 0,
        endOffset: 5,
      },
    );
  });

  it("serialises a pure Content Core highlight (blockId null) by its blockKey", async () => {
    vi.mocked(markAnchor.resolveHighlightWriteAnchor).mockResolvedValueOnce({
      source: "content-core",
      blockKey: "pure-core-key",
      contentBlockId: "cb-9",
      blockId: null,
      blockVersionId: "bv-9",
      quote: "hola",
    });
    prisma.highlight.create.mockResolvedValueOnce({
      id: "h-9",
      userId: "user-1",
      blockId: null,
      contentBlockId: "cb-9",
      blockVersionId: "bv-9",
      quote: "hola",
      startOffset: 0,
      endOffset: 4,
      color: "YELLOW",
      note: null,
      createdAt: new Date(),
    });
    const result = await svc.create("user-1", {
      blockKey: "pure-core-key",
      startOffset: 0,
      endOffset: 4,
    });
    expect(result.highlight.blockId).toBeNull();
    expect(result.highlight.blockKey).toBe("pure-core-key");
  });

  it("creates with YELLOW default when no color provided", async () => {
    await svc.create("user-1", {
      blockId: "b-1",
      startOffset: 0,
      endOffset: 5,
    });
    expect(prisma.highlight.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ color: "YELLOW" }),
    });
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
