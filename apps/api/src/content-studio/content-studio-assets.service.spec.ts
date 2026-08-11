import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ContentStudioAssetsService } from "./content-studio-assets.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { StorageService } from "../storage/storage.service";

/**
 * Uploading image bytes — what must NOT happen.
 *
 * The interesting properties here are negative ones: an upload must not become
 * a publish, must not let the uploader choose where the bytes land, and must not
 * accept a chapter that belongs to a different book.
 */

function prismaMock() {
  return {
    book: { findUnique: vi.fn(), update: vi.fn() },
    chapter: { findFirst: vi.fn(), findMany: vi.fn() },
    revision: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    edition: { update: vi.fn(), findFirst: vi.fn() },
    revisionUnit: { findMany: vi.fn() },
  };
}

const PNG = () => ({
  mimetype: "image/png",
  size: 1024,
  buffer: Buffer.from("fake-png"),
});

let prisma: ReturnType<typeof prismaMock>;
let storage: {
  uploadFile: ReturnType<typeof vi.fn>;
  putObject: ReturnType<typeof vi.fn>;
};
let service: ContentStudioAssetsService;

beforeEach(() => {
  vi.clearAllMocks();
  prisma = prismaMock();
  storage = {
    // `uploadFile` returns a bucket URL and is no longer used for images: the
    // bucket is private, so that URL is unreadable by a browser. Kept on the
    // mock so a regression back to it fails loudly rather than silently.
    uploadFile: vi.fn().mockResolvedValue("https://cdn/x.png"),
    putObject: vi.fn().mockResolvedValue(undefined),
  };
  service = new ContentStudioAssetsService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
  );
  prisma.book.findUnique.mockResolvedValue({ id: "book_1", slug: "libro" });
  // The chapter is resolved from the revision being edited, not from `Chapter`:
  // an image belongs to a chapter that may have no legacy row at all.
  prisma.edition.findFirst.mockResolvedValue({
    id: "edition_a",
    publishedRevisionId: "r5",
  });
  prisma.revision.findFirst.mockResolvedValue(null);
  prisma.chapter.findMany.mockResolvedValue([]);
  prisma.revisionUnit.findMany.mockImplementation(async (args: never) => {
    const { select } = args as { select?: Record<string, unknown> };
    if (select && "unitId" in select) return [];
    return [
      {
        order: 3,
        partNumber: null,
        partTitle: null,
        unit: { id: "unit_3", unitKey: "unit-3" },
        unitVersion: { title: "Cap 3" },
      },
    ];
  });
});

describe("cover upload — catalog metadata, not content", () => {
  it("writes the catalog and mints no revision", async () => {
    const result = await service.uploadCover("libro", PNG());

    // The stable asset path, not a bucket URL — the catalog stores an identity
    // that stays valid, and delivery is resolved when the cover is fetched.
    const assetPath =
      /^\/api\/content-assets\/catalog-books\/libro\/cover\/[0-9a-f]{16}\.png$/;
    expect(result.coverArtUrl).toMatch(assetPath);
    expect(prisma.book.update).toHaveBeenCalledWith({
      where: { id: "book_1" },
      data: { coverArtUrl: expect.stringMatching(assetPath) },
    });
    // A cover belongs to the book, not to a chapter, so it has no revision to
    // wait in and no draft to accumulate into.
    expect(prisma.revision.create).not.toHaveBeenCalled();
    expect(prisma.edition.update).not.toHaveBeenCalled();
  });

  it("builds the object key itself, ignoring anything the uploader named", async () => {
    await service.uploadCover("libro", PNG());

    const key = storage.putObject.mock.calls[0]![1] as string;
    expect(key).toMatch(/^catalog-books\/libro\/cover\/[0-9a-f]{16}\.png$/);
  });

  it("404s a book that does not exist", async () => {
    prisma.book.findUnique.mockResolvedValue(null);

    await expect(service.uploadCover("nope", PNG())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.putObject).not.toHaveBeenCalled();
  });
});

describe("cover upload — what it refuses", () => {
  it("refuses a missing file", async () => {
    await expect(
      service.uploadCover("libro", undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ["image/svg+xml", "SVG is XML that can carry script"],
    ["application/pdf", "not an image at all"],
    ["text/html", "would be served from our own origin"],
  ])("refuses %s (%s)", async (mimetype) => {
    await expect(
      service.uploadCover("libro", { ...PNG(), mimetype }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("refuses a file over 5 MB", async () => {
    await expect(
      service.uploadCover("libro", { ...PNG(), size: 5 * 1024 * 1024 + 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("accepts jpeg and webp", async () => {
    for (const mimetype of ["image/jpeg", "image/webp"]) {
      await expect(
        service.uploadCover("libro", { ...PNG(), mimetype }),
      ).resolves.toBeTruthy();
    }
  });
});

describe("chapter image upload — bytes only", () => {
  it("stores the file and touches no content", async () => {
    const result = await service.uploadChapterImage("libro", 3, PNG());

    // A path on our own API, not a bucket URL: the private bucket cannot serve
    // an <img> directly, and this path redirects to a short-lived signed GET.
    expect(result.imageUrl).toMatch(
      /^\/api\/content-assets\/content\/libro\/chapter-3\/images\/[0-9a-f]{16}\.png$/,
    );
    expect(result.imageUrl.startsWith("http")).toBe(false);
    // Crucially: no revision, no edition pointer, and no block. The editor
    // places the image and saves it like any other edit.
    expect(prisma.revision.create).not.toHaveBeenCalled();
    expect(prisma.edition.update).not.toHaveBeenCalled();
    expect(prisma.book.update).not.toHaveBeenCalled();
  });

  it("scopes the key to the resolved book and chapter", async () => {
    await service.uploadChapterImage("libro", 3, PNG());

    const key = storage.putObject.mock.calls[0]![1] as string;
    expect(key).toMatch(
      /^content\/libro\/chapter-3\/images\/[0-9a-f]{16}\.png$/,
    );
  });

  it("refuses a chapter that belongs to a different book", async () => {
    // An order on its own is not an identity — chapter 3 exists in many books.
    // The manifest is scoped to THIS book's edition, so order 99 is simply not
    // in it.

    await expect(
      service.uploadChapterImage("libro", 99, PNG()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("validates before it resolves anything", async () => {
    await expect(
      service.uploadChapterImage("libro", 3, {
        ...PNG(),
        mimetype: "image/gif",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.book.findUnique).not.toHaveBeenCalled();
  });

  it("returns nothing about where the bytes actually live", async () => {
    const result = await service.uploadChapterImage("libro", 3, PNG());

    // No bucket, no account id, no key, no credentials — a URL and that is all.
    expect(Object.keys(result)).toEqual(["imageUrl"]);
    expect(JSON.stringify(result)).not.toMatch(/bucket|account|secret|key/i);
  });
});
