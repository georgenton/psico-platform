import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorUploadsService } from "./author-uploads.service";

function makePrisma() {
  return {
    authorBook: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    authorBookChapter: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
}

function makeStorage() {
  return {
    // Kept mocked only so tests can prove it is never reached: against a private
    // bucket it returns a URL no browser can load.
    uploadFile: vi.fn().mockResolvedValue("https://r2.example.com/key"),
    putObject: vi.fn().mockResolvedValue(undefined),
    getSignedUrl: vi.fn().mockResolvedValue("https://signed.example/a?sig=1"),
  };
}

function makeFile(
  partial: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "x.jpg",
    encoding: "7bit",
    mimetype: "image/jpeg",
    size: 1000,
    buffer: Buffer.from("test"),
    destination: "",
    filename: "",
    path: "",
    stream: null as never,
    ...partial,
  } as Express.Multer.File;
}

describe("AuthorUploadsService", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let storage: ReturnType<typeof makeStorage>;
  let svc: AuthorUploadsService;

  beforeEach(() => {
    prisma = makePrisma();
    storage = makeStorage();
    svc = new AuthorUploadsService(prisma as never, storage as never);
  });

  describe("uploadCoverImage", () => {
    it("400 FILE_REQUIRED when file is missing", async () => {
      await expect(svc.uploadCoverImage("u1", "b1", undefined)).rejects.toThrow(
        /FILE_REQUIRED/,
      );
    });

    it("400 INVALID_IMAGE_TYPE when MIME not allowed", async () => {
      const file = makeFile({ mimetype: "image/gif" });
      await expect(
        svc.uploadCoverImage("u1", "b1", file),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "INVALID_IMAGE_TYPE" }),
      });
    });

    it("400 FILE_TOO_LARGE over 5MB", async () => {
      const file = makeFile({ size: 6 * 1024 * 1024 });
      await expect(
        svc.uploadCoverImage("u1", "b1", file),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "FILE_TOO_LARGE" }),
      });
    });

    it("404 BOOK_NOT_FOUND when book doesn't exist", async () => {
      prisma.authorBook.findUnique.mockResolvedValue(null);
      await expect(
        svc.uploadCoverImage("u1", "b1", makeFile()),
      ).rejects.toThrow(/BOOK_NOT_FOUND/);
    });

    it("404 BOOK_NOT_FOUND when book belongs to another author", async () => {
      prisma.authorBook.findUnique.mockResolvedValue({
        id: "b1",
        authorUserId: "other",
        status: "DRAFT",
      });
      await expect(
        svc.uploadCoverImage("u1", "b1", makeFile()),
      ).rejects.toThrow(/BOOK_NOT_FOUND/);
    });

    it("400 BOOK_LOCKED when status is IN_REVIEW", async () => {
      prisma.authorBook.findUnique.mockResolvedValue({
        id: "b1",
        authorUserId: "u1",
        status: "IN_REVIEW",
      });
      await expect(
        svc.uploadCoverImage("u1", "b1", makeFile()),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "BOOK_LOCKED" }),
      });
    });

    it("uploads + updates AuthorBook.coverArtUrl", async () => {
      prisma.authorBook.findUnique.mockResolvedValue({
        id: "b1",
        authorUserId: "u1",
        status: "DRAFT",
      });
      const file = makeFile();
      const res = await svc.uploadCoverImage("u1", "b1", file);

      expect(storage.putObject).toHaveBeenCalledWith(
        file.buffer,
        expect.stringMatching(/^autor-books\/b1\/cover-[a-f0-9]{16}\.jpg$/),
        "image/jpeg",
      );
      // A private bucket has no public base, so the only correct persisted value
      // is a path on our own API that redirects to a signed GET.
      expect(storage.uploadFile).not.toHaveBeenCalled();

      const key = storage.putObject.mock.calls[0]![1] as string;
      expect(prisma.authorBook.update).toHaveBeenCalledWith({
        where: { id: "b1" },
        data: { coverArtUrl: `/api/content-assets/${key}` },
      });
      expect(res.coverArtUrl).toBe(`/api/content-assets/${key}`);
      expect(res.coverArtUrl).not.toMatch(/^https?:\/\//);
    });

    it("maps mime to extension correctly (webp)", async () => {
      prisma.authorBook.findUnique.mockResolvedValue({
        id: "b1",
        authorUserId: "u1",
        status: "DRAFT",
      });
      await svc.uploadCoverImage(
        "u1",
        "b1",
        makeFile({ mimetype: "image/webp" }),
      );
      expect(storage.putObject.mock.calls[0]![1]).toMatch(/\.webp$/);
    });
  });

  describe("uploadChapterAudio", () => {
    beforeEach(() => {
      prisma.authorBook.findUnique.mockResolvedValue({
        id: "b1",
        authorUserId: "u1",
        status: "DRAFT",
      });
    });

    it("400 FILE_REQUIRED", async () => {
      await expect(
        svc.uploadChapterAudio("u1", "b1", 1, undefined, undefined),
      ).rejects.toThrow(/FILE_REQUIRED/);
    });

    it("400 INVALID_AUDIO_TYPE for non-audio MIME", async () => {
      await expect(
        svc.uploadChapterAudio(
          "u1",
          "b1",
          1,
          makeFile({ mimetype: "image/png" }),
          undefined,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "INVALID_AUDIO_TYPE" }),
      });
    });

    it("400 FILE_TOO_LARGE over 50MB", async () => {
      await expect(
        svc.uploadChapterAudio(
          "u1",
          "b1",
          1,
          makeFile({ mimetype: "audio/mpeg", size: 51 * 1024 * 1024 }),
          undefined,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "FILE_TOO_LARGE" }),
      });
    });

    it("404 CHAPTER_NOT_FOUND when chapter doesn't exist", async () => {
      prisma.authorBookChapter.findUnique.mockResolvedValue(null);
      await expect(
        svc.uploadChapterAudio(
          "u1",
          "b1",
          99,
          makeFile({ mimetype: "audio/mpeg" }),
          undefined,
        ),
      ).rejects.toThrow(/CHAPTER_NOT_FOUND/);
    });

    it("uploads + appends AUDIO block to chapter + bumps version", async () => {
      prisma.authorBookChapter.findUnique.mockResolvedValue({
        id: "c1",
        version: 3,
        blocks: [{ kind: "paragraph", content: "hola" }],
      });
      prisma.authorBookChapter.update.mockResolvedValue({ version: 4 });

      const res = await svc.uploadChapterAudio(
        "u1",
        "b1",
        1,
        makeFile({ mimetype: "audio/mpeg", size: 2 * 1024 * 1024 }),
        "Capítulo introductorio",
      );

      expect(storage.putObject.mock.calls[0]![1]).toMatch(
        /^autor-books\/b1\/audio\/c1-[a-f0-9]{16}\.mp3$/,
      );
      expect(storage.uploadFile).not.toHaveBeenCalled();

      const updateData = prisma.authorBookChapter.update.mock.calls[0][0]
        .data as { blocks: unknown[]; version: number };
      expect(updateData.version).toBe(4);
      expect(updateData.blocks).toHaveLength(2);
      const audio = updateData.blocks[1] as {
        kind: string;
        content: string;
        meta: { key?: string; url?: string };
      };
      expect(audio.kind).toBe("audio");
      expect(audio.content).toBe("Capítulo introductorio");

      // What is PERSISTED is the key. A signed URL in the row would be a dead
      // link within the hour, and audio is protected media so there is no
      // non-expiring URL it could hold instead.
      expect(audio.meta.key).toBe(storage.putObject.mock.calls[0]![1]);
      expect(audio.meta.url).toBeUndefined();

      // The RESPONSE carries a playable URL so the editor can hear it at once.
      expect(res.url).toBe("https://signed.example/a?sig=1");
      expect(res.version).toBe(4);
    });

    it("uses default title when title omitted", async () => {
      prisma.authorBookChapter.findUnique.mockResolvedValue({
        id: "c1",
        version: 1,
        blocks: [],
      });
      prisma.authorBookChapter.update.mockResolvedValue({ version: 2 });
      await svc.uploadChapterAudio(
        "u1",
        "b1",
        1,
        makeFile({ mimetype: "audio/wav" }),
        undefined,
      );
      const blocks = prisma.authorBookChapter.update.mock.calls[0][0].data
        .blocks as Array<{ content: string; kind: string }>;
      expect(blocks[0].content).toBe("Audio del capítulo");
    });
  });
});
