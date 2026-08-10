import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { MediaUploadService } from "./media-upload.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { StorageService } from "../storage/storage.service";

/**
 * Uploading a master — what must not happen.
 *
 * The lifecycle itself is proven against real Postgres in `media-upload.pg-spec`;
 * this covers the boundary: what the browser cannot decide, and what happens to
 * bytes when the record that was supposed to reference them never appears.
 */

function prismaMock() {
  const tx = {
    chapterMediaVersion: {
      create: vi.fn().mockResolvedValue({ id: "row_1" }),
      deleteMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    chapter: { findFirst: vi.fn() },
    audio: { update: vi.fn(), create: vi.fn() },
  };
  return {
    _tx: tx,
    chapter: { findFirst: vi.fn().mockResolvedValue({ id: "chapter_1" }) },
    chapterMediaVersion: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
}

const FILE = () => ({
  mimetype: "audio/mp4",
  size: 2048,
  buffer: Buffer.alloc(2048, 7),
});

let prisma: ReturnType<typeof prismaMock>;
let storage: {
  putObject: ReturnType<typeof vi.fn>;
  deleteObject: ReturnType<typeof vi.fn>;
};
let service: MediaUploadService;

beforeEach(() => {
  vi.clearAllMocks();
  prisma = prismaMock();
  storage = {
    putObject: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };
  service = new MediaUploadService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
  );
});

describe("what the browser cannot decide", () => {
  it("mints the object key itself and stores no public URL", async () => {
    await service.uploadPodcast(
      "eec",
      1,
      FILE(),
      { durationSec: 300, title: "Ep 1", description: "…" },
      "admin_1",
    );

    const key = storage.putObject.mock.calls[0]![1] as string;
    expect(key).toMatch(/^media\/eec\/c1\/podcast\/[0-9a-f]{16}\.m4a$/);

    const stored = prisma._tx.chapterMediaVersion.create.mock.calls[0]![0].data;
    const json = JSON.stringify(stored.definitionJson);
    // A public URL here would take the master out of the signing path entirely.
    expect(json).not.toMatch(/https?:\/\//);
    expect(stored.definitionJson).toMatchObject({
      source: { kind: "R2", objectKey: key },
    });
  });

  it("stages as DRAFT — upload never publishes", async () => {
    await service.uploadPodcast(
      "eec",
      1,
      FILE(),
      { durationSec: 300, title: "Ep 1", description: "…" },
      "admin_1",
    );

    expect(
      prisma._tx.chapterMediaVersion.create.mock.calls[0]![0].data
        .editorialStatus,
    ).toBe("DRAFT");
  });

  it("derives the access policy server-side, never from the request", async () => {
    await service.uploadPodcast(
      "eec",
      1,
      FILE(),
      { durationSec: 300, title: "Ep 1", description: "…" },
      "admin_1",
    );

    const def = prisma._tx.chapterMediaVersion.create.mock.calls[0]![0].data
      .definitionJson as { accessPolicy: string };
    // Not public, and not something a browser could have chosen.
    expect(["PRO_ONLY", "BOOK_ENTITLEMENT"]).toContain(def.accessPolicy);
  });

  it("refuses a new episode with no title or description", async () => {
    await expect(
      service.uploadPodcast("eec", 1, FILE(), { durationSec: 300 }, "admin_1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("refuses a missing or invented duration", async () => {
    // `Audio.durationSeconds` is required and the player draws a timeline from
    // it; a fabricated value is a wrong timeline in front of a listener.
    await expect(
      service.uploadAudiobook("eec", 1, FILE(), 0, "admin_1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("validates the file before touching storage or the database", async () => {
    await expect(
      service.uploadAudiobook(
        "eec",
        1,
        { ...FILE(), mimetype: "audio/wav" },
        300,
        "admin_1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(prisma.chapter.findFirst).not.toHaveBeenCalled();
  });
});

describe("partial writes", () => {
  it("deletes the bytes it just wrote when the record fails", async () => {
    prisma.$transaction.mockRejectedValue(new Error("db down"));

    await expect(
      service.uploadPodcast(
        "eec",
        1,
        FILE(),
        { durationSec: 300, title: "Ep 1", description: "…" },
        "admin_1",
      ),
    ).rejects.toThrow("db down");

    const written = storage.putObject.mock.calls[0]![1];
    // Exactly the key minted moments ago — nothing else, and never a master
    // something already published points at.
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
    expect(storage.deleteObject).toHaveBeenCalledWith(written);
  });

  it("still surfaces the original failure if cleanup also fails", async () => {
    prisma.$transaction.mockRejectedValue(new Error("db down"));
    storage.deleteObject.mockRejectedValue(new Error("r2 down"));

    await expect(
      service.uploadPodcast(
        "eec",
        1,
        FILE(),
        { durationSec: 300, title: "Ep 1", description: "…" },
        "admin_1",
      ),
    ).rejects.toThrow("db down");
  });

  it("leaves staged bytes alone when the upload succeeds", async () => {
    // An unpublished draft is not an orphan — it is what a draft IS.
    await service.uploadPodcast(
      "eec",
      1,
      FILE(),
      { durationSec: 300, title: "Ep 1", description: "…" },
      "admin_1",
    );
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});

describe("publishing a staged master", () => {
  it("refuses a draft that is already published", async () => {
    prisma.chapterMediaVersion.findUnique.mockResolvedValue({
      id: "row_1",
      editorialStatus: "PUBLISHED",
      definitionJson: {},
    });

    await expect(service.publishStagedMaster("row_1")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
