import { describe, expect, it, vi, beforeEach } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ChaptersService } from "./chapters.service";
import { AUDIO_MAX_BYTES } from "../shared/audio-upload";

/**
 * What `POST /:slug/chapters/:order/audio` will accept.
 *
 * The endpoint is ADMIN-only, which bounds WHO can reach it but not what the
 * object then claims to be: before this, any bytes at all were stored under an
 * `.m4a` key — `audioExtension` falls back to it — with no size ceiling, and
 * `Audio.fileUrl` is read back by the PRO-gated player.
 *
 * Every case below asserts the same thing twice: the right error, and that
 * NOTHING was stored or written. A refusal that still leaves an object in R2 or
 * a row in the database is not a refusal.
 */

const CHAPTER = { id: "chap-1" };

function makePrisma(chapter: typeof CHAPTER | null = CHAPTER) {
  return {
    chapter: { findFirst: vi.fn().mockResolvedValue(chapter) },
    audio: { create: vi.fn().mockResolvedValue({ id: "audio-1" }) },
  };
}

function makeStorage() {
  return {
    putObject: vi.fn().mockResolvedValue(undefined),
    uploadFile: vi.fn(),
  };
}

function makeFile(
  partial: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    buffer: Buffer.from("fake-audio-bytes"),
    size: 16,
    mimetype: "audio/mpeg",
    originalname: "chapter.mp3",
    fieldname: "file",
    encoding: "7bit",
    stream: null as never,
    destination: "",
    filename: "",
    path: "",
    ...partial,
  } as Express.Multer.File;
}

const dto = { title: "Capítulo 1", durationSeconds: 120 };

describe("ChaptersService.uploadAudio · what it accepts", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let storage: ReturnType<typeof makeStorage>;
  let svc: ChaptersService;

  beforeEach(() => {
    prisma = makePrisma();
    storage = makeStorage();
    svc = new ChaptersService(prisma as never, storage as never);
  });

  it("stores an accepted MIME under a server-chosen key and persists that key", async () => {
    await svc.uploadAudio("libro", 1, makeFile(), dto);

    expect(storage.putObject).toHaveBeenCalledTimes(1);
    const [, key, mime] = storage.putObject.mock.calls[0]!;
    expect(key).toMatch(/^audio\/libro\/1\/[0-9a-f]{16}\.mp3$/);
    // The uploader's filename never reaches the key.
    expect(key).not.toContain("chapter.mp3");
    // Content-Type is the MIME we accepted, which is what players read.
    expect(mime).toBe("audio/mpeg");

    // The ROW holds the key, not a URL: the player signs it behind the PRO gate.
    const created = prisma.audio.create.mock.calls[0]![0] as {
      data: { fileUrl: string };
    };
    expect(created.data.fileUrl).toBe(key);
    expect(created.data.fileUrl).not.toMatch(/^https?:\/\//);
    // `uploadFile` would hand back `${R2_PUBLIC_URL}/${key}` against a private
    // bucket — unreadable where the variable is set, throwing where it is not.
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it("maps the m4a family to an m4a key", async () => {
    await svc.uploadAudio(
      "libro",
      2,
      makeFile({ mimetype: "audio/x-m4a" }),
      dto,
    );
    expect(storage.putObject.mock.calls[0]![1]).toMatch(/\.m4a$/);
  });

  it("refuses a missing file before touching storage", async () => {
    await expect(
      svc.uploadAudio("libro", 1, undefined as never, dto),
    ).rejects.toThrow(BadRequestException);
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(prisma.audio.create).not.toHaveBeenCalled();
  });

  it("refuses an empty file", async () => {
    // Passes a MIME check and produces a player that spins forever.
    await expect(
      svc.uploadAudio(
        "libro",
        1,
        makeFile({ size: 0, buffer: Buffer.alloc(0) }),
        dto,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(prisma.audio.create).not.toHaveBeenCalled();
  });

  it("refuses an unsupported MIME instead of labelling it .m4a", async () => {
    // The exact regression: `audioExtension` falls back to `m4a`, so without
    // this check a PDF was stored as audio and the player was handed it.
    for (const mimetype of [
      "application/pdf",
      "image/png",
      "application/octet-stream",
      "text/plain",
      "video/mp4",
    ]) {
      storage.putObject.mockClear();
      prisma.audio.create.mockClear();
      await expect(
        svc.uploadAudio("libro", 1, makeFile({ mimetype }), dto),
      ).rejects.toThrow(BadRequestException);
      expect(storage.putObject).not.toHaveBeenCalled();
      expect(prisma.audio.create).not.toHaveBeenCalled();
    }
  });

  it("refuses a file over the size ceiling", async () => {
    await expect(
      svc.uploadAudio("libro", 1, makeFile({ size: AUDIO_MAX_BYTES + 1 }), dto),
    ).rejects.toThrow(BadRequestException);
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(prisma.audio.create).not.toHaveBeenCalled();
  });

  it("accepts a file of exactly the ceiling", async () => {
    // The transport limit sits one byte above the rule for this reason: a file
    // of exactly the maximum must not be refused by one layer and accepted by
    // the other.
    await svc.uploadAudio("libro", 1, makeFile({ size: AUDIO_MAX_BYTES }), dto);
    expect(storage.putObject).toHaveBeenCalledTimes(1);
  });

  it("refuses an unknown chapter before validating or storing anything", async () => {
    const svcNoChapter = new ChaptersService(
      makePrisma(null) as never,
      storage as never,
    );
    await expect(
      svcNoChapter.uploadAudio("libro", 99, makeFile(), dto),
    ).rejects.toThrow(NotFoundException);
    expect(storage.putObject).not.toHaveBeenCalled();
  });
});
