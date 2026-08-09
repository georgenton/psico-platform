import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { VideoUploadService } from "./video-upload.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { CloudflareStreamUploadService } from "../lector/media/cloudflare-stream-upload.service";
import { validateChapterMediaDefinition } from "../lector/media/chapter-media.catalog";

/**
 * The video upload state machine, where it is decidable without a provider.
 *
 * The two rules worth protecting with tests are both about identity:
 *
 *   - a video that never played keeps its key when it is re-recorded, because
 *     nobody can have completed it;
 *   - a video that DID play gets a new key and version, because overwriting it
 *     would change what a finished watch meant.
 *
 * Plus one about safety: a source is written only after the provider confirms
 * the file exists, so `source !== null` keeps meaning "playable" system-wide.
 */

const CHAPTER = { bookSlug: "libro", chapterOrder: 1 };

const draft = {
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
};

const prisma = {
  chapter: { findFirst: vi.fn() },
  chapterMediaVersion: draft,
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({ chapterMediaVersion: draft }),
  ),
} as unknown as PrismaService;

const stream = {
  createDirectUpload: vi.fn(),
  getStatus: vi.fn(),
  deleteVideo: vi.fn(),
} as unknown as CloudflareStreamUploadService;

const service = new VideoUploadService(prisma, stream);

/** A stored definition, valid by the catalog's own rules. */
const definition = (over: Record<string, unknown> = {}) =>
  validateChapterMediaDefinition({
    mediaKey: "libro-c1-video-abc-v1",
    mediaVersion: 1,
    bookSlug: "libro",
    chapterOrder: 1,
    kind: "VIDEO",
    status: "DRAFT",
    title: "Video del capítulo",
    description: "Una descripción editorial.",
    durationSec: null,
    accessPolicy: null,
    source: null,
    posterObjectKey: null,
    transcriptObjectKey: null,
    chapters: [],
    ...over,
  });

const PLAYABLE = {
  status: "PUBLISHED",
  accessPolicy: "PRO_ONLY",
  durationSec: 120,
  source: {
    kind: "CLOUDFLARE_STREAM",
    videoUid: "aaaaaaaaaaaaaaaaaaaa",
    captionLanguage: "es",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.chapter.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "chapter-1",
  });
  (stream.createDirectUpload as ReturnType<typeof vi.fn>).mockResolvedValue({
    videoUid: "bbbbbbbbbbbbbbbbbbbb",
    uploadUrl: "https://upload.videodelivery.net/one-time",
    expiresAt: "2026-08-09T12:00:00.000Z",
  });
  draft.create.mockResolvedValue({ id: "draft-new" });
});

describe("createUploadIntent — a brand-new video", () => {
  it("stages a draft with no source and holds the allocated video separately", async () => {
    const result = await service.createUploadIntent(
      CHAPTER.bookSlug,
      CHAPTER.chapterOrder,
      { title: "Video del capítulo", description: "Una descripción." },
      "admin-1",
    );

    const created = draft.create.mock.calls[0]![0]!.data;
    expect(created.pendingVideoUid).toBe("bbbbbbbbbbbbbbbbbbbb");
    // The decisive assertion: nothing is playable yet, so nothing claims to be.
    expect(created.definitionJson.source).toBeNull();
    expect(created.definitionJson.status).toBe("DRAFT");
    expect(created.editorialStatus).toBe("DRAFT");

    // And the browser gets a destination — never the provider's identifier.
    expect(result.uploadUrl).toBe("https://upload.videodelivery.net/one-time");
    expect(JSON.stringify(result)).not.toContain("bbbbbbbbbbbbbbbbbbbb");
  });

  it("requires editorial copy, because a new video has none to inherit", async () => {
    await expect(
      service.createUploadIntent(
        CHAPTER.bookSlug,
        CHAPTER.chapterOrder,
        {},
        "admin-1",
      ),
    ).rejects.toMatchObject({ response: { code: "VIDEO_METADATA_REQUIRED" } });
    expect(stream.createDirectUpload).not.toHaveBeenCalled();
  });
});

describe("createUploadIntent — replacing an existing video", () => {
  it("case A · never playable, so the identity is kept", async () => {
    // A video announced as «En producción» has no completions against it.
    draft.findFirst.mockResolvedValue({
      id: "draft-old",
      mediaKey: "libro-c1-video-abc-v1",
      editorialStatus: "DRAFT",
      definitionJson: definition(),
    });

    await service.createUploadIntent(
      CHAPTER.bookSlug,
      CHAPTER.chapterOrder,
      { mediaKey: "libro-c1-video-abc-v1" },
      "admin-1",
    );

    const created = draft.create.mock.calls[0]![0]!.data;
    expect(created.mediaKey).toBe("libro-c1-video-abc-v1");
    expect(created.mediaVersion).toBe(1);
    // The superseded staging attempt goes; its provider asset is left alone.
    expect(draft.deleteMany).toHaveBeenCalledWith({
      where: { id: "draft-old", editorialStatus: "DRAFT" },
    });
  });

  it("case B · already playable, so a new file is a new version", async () => {
    draft.findFirst.mockResolvedValue({
      id: "row-published",
      mediaKey: "libro-c1-video-abc-v1",
      editorialStatus: "PUBLISHED",
      definitionJson: definition(PLAYABLE),
    });

    await service.createUploadIntent(
      CHAPTER.bookSlug,
      CHAPTER.chapterOrder,
      { mediaKey: "libro-c1-video-abc-v1" },
      "admin-1",
    );

    const created = draft.create.mock.calls[0]![0]!.data;
    expect(created.mediaVersion).toBe(2);
    expect(created.mediaKey).toBe("libro-c1-video-abc-v2");
    // Identity moved, so completions against v1 still mean the v1 file.
    expect(created.mediaKey).not.toBe("libro-c1-video-abc-v1");
    // A published row is never superseded by an upload intent.
    expect(draft.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses to point a video upload at an audiobook", async () => {
    draft.findFirst.mockResolvedValue({
      id: "row-audio",
      mediaKey: "libro-c1-audiobook-v1",
      editorialStatus: "PUBLISHED",
      definitionJson: definition({
        mediaKey: "libro-c1-audiobook-v1",
        kind: "AUDIOBOOK",
        source: { kind: "CHAPTER_AUDIO" },
        status: "PUBLISHED",
        accessPolicy: "PRO_ONLY",
        durationSec: 60,
      }),
    });

    await expect(
      service.createUploadIntent(
        CHAPTER.bookSlug,
        CHAPTER.chapterOrder,
        { mediaKey: "libro-c1-audiobook-v1" },
        "admin-1",
      ),
    ).rejects.toMatchObject({ response: { code: "MEDIA_KIND_MISMATCH" } });
  });
});

describe("createUploadIntent — when recording the draft fails", () => {
  it("discards the asset it allocated, so nothing is billed for nothing", async () => {
    draft.create.mockRejectedValue(
      Object.assign(new Error("dup"), { code: "P2002" }),
    );

    await expect(
      service.createUploadIntent(
        CHAPTER.bookSlug,
        CHAPTER.chapterOrder,
        { title: "Video", description: "Desc." },
        "admin-1",
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    // Exactly the one just allocated — never an asset anyone could be watching.
    expect(stream.deleteVideo).toHaveBeenCalledWith("bbbbbbbbbbbbbbbbbbbb");
  });
});

describe("getUploadStatus", () => {
  it("stays source-less while the file has not arrived", async () => {
    draft.findUnique.mockResolvedValue({
      id: "draft-1",
      kind: "VIDEO",
      pendingVideoUid: "bbbbbbbbbbbbbbbbbbbb",
      definitionJson: definition(),
    });
    (stream.getStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      state: "AWAITING_UPLOAD",
      durationSec: null,
    });

    await expect(service.getUploadStatus("draft-1")).resolves.toMatchObject({
      state: "AWAITING_UPLOAD",
      sourceReady: false,
    });
    expect(draft.update).not.toHaveBeenCalled();
  });

  it("attaches the video only once the provider says it is ready", async () => {
    draft.findUnique.mockResolvedValue({
      id: "draft-1",
      kind: "VIDEO",
      pendingVideoUid: "bbbbbbbbbbbbbbbbbbbb",
      definitionJson: definition(),
    });
    (stream.getStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      state: "READY",
      durationSec: 137,
    });

    await expect(service.getUploadStatus("draft-1")).resolves.toMatchObject({
      state: "READY",
      sourceReady: true,
      durationSec: 137,
    });

    const written = draft.update.mock.calls[0]![0]!.data;
    expect(written.definitionJson.source).toEqual({
      kind: "CLOUDFLARE_STREAM",
      videoUid: "bbbbbbbbbbbbbbbbbbbb",
      captionLanguage: "es",
    });
    // Duration is the provider's measurement of the real file, not a form field.
    expect(written.definitionJson.durationSec).toBe(137);
    expect(written.definitionJson.status).toBe("PUBLISHED");
    // The marker is cleared, which is what unblocks publishing.
    expect(written.pendingVideoUid).toBeNull();
  });

  it("does not ask the provider again once promoted", async () => {
    // The CMS polls this; a promoted draft must settle without more calls.
    draft.findUnique.mockResolvedValue({
      id: "draft-1",
      kind: "VIDEO",
      pendingVideoUid: null,
      definitionJson: definition(PLAYABLE),
    });

    await expect(service.getUploadStatus("draft-1")).resolves.toMatchObject({
      state: "READY",
      sourceReady: true,
    });
    expect(stream.getStatus).not.toHaveBeenCalled();
  });

  it("surfaces an encoding failure instead of pretending it is still working", async () => {
    draft.findUnique.mockResolvedValue({
      id: "draft-1",
      kind: "VIDEO",
      pendingVideoUid: "bbbbbbbbbbbbbbbbbbbb",
      definitionJson: definition(),
    });
    (stream.getStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      state: "ERROR",
      durationSec: null,
    });

    await expect(service.getUploadStatus("draft-1")).resolves.toMatchObject({
      state: "ERROR",
      sourceReady: false,
    });
    expect(draft.update).not.toHaveBeenCalled();
  });
});
