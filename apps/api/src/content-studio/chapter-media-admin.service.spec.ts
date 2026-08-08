import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { ChapterMediaAdminService } from "./chapter-media-admin.service";
import { EEC_C1_PODCAST } from "../lector/media/chapter-media.catalog";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * Administering media DEFINITIONS.
 *
 * The properties worth testing are the ones that would be expensive to get
 * wrong: an adoption that quietly changes identity would orphan every existing
 * completion, and an admin projection that leaks an object key would put our
 * storage layout in a browser tab.
 */

function prismaMock() {
  return {
    book: { findUnique: vi.fn() },
    chapter: { findFirst: vi.fn() },
    chapterMediaVersion: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

let prisma: ReturnType<typeof prismaMock>;
let service: ChapterMediaAdminService;

const BOOK = "emociones-en-construccion";

beforeEach(() => {
  vi.clearAllMocks();
  prisma = prismaMock();
  service = new ChapterMediaAdminService(prisma as unknown as PrismaService);
  prisma.book.findUnique.mockResolvedValue({ id: "book_1" });
  prisma.chapter.findFirst.mockResolvedValue({ id: "chapter_1" });
  prisma.chapterMediaVersion.findMany.mockResolvedValue([]);
  prisma.chapterMediaVersion.findFirst.mockResolvedValue(null);
  prisma.chapterMediaVersion.create.mockResolvedValue({ id: "row_1" });
});

describe("listing a chapter's media", () => {
  it("shows the code-owned definitions with their provenance", async () => {
    const res = await service.listForChapter(BOOK, 1);

    expect(res.media.map((m) => m.kind)).toEqual([
      "AUDIOBOOK",
      "PODCAST",
      "VIDEO",
    ]);
    expect(res.media.every((m) => m.provenance === "CODE")).toBe(true);
    expect(res.media.every((m) => m.editorialStatus === "CODE_OWNED")).toBe(
      true,
    );
  });

  it("tells availability apart from a master actually existing", async () => {
    const res = await service.listForChapter(BOOK, 1);
    const video = res.media.find((m) => m.kind === "VIDEO")!;
    const podcast = res.media.find((m) => m.kind === "PODCAST")!;

    // The video is announced but unproduced — that is a deliberate public state.
    expect(video.runtimeAvailability).toBe("COMING_SOON");
    expect(video.sourceReady).toBe(false);
    expect(podcast.runtimeAvailability).toBe("AVAILABLE");
    expect(podcast.sourceReady).toBe(true);
  });

  it("NEVER hands the browser a provider reference", async () => {
    // An object key or a Stream UID in a JSON response is our storage layout in
    // somebody's devtools, for no editorial benefit.
    const res = await service.listForChapter(BOOK, 1);
    const json = JSON.stringify(res);

    expect(json).not.toContain("objectKey");
    expect(json).not.toContain("videoUid");
    expect(json).not.toContain("accessPolicy");
    expect(json).not.toContain("PRO_ONLY");
    expect(json).not.toMatch(/media\/emociones/);
  });

  it("prefers the CMS row over the code definition it was cloned from", async () => {
    prisma.chapterMediaVersion.findMany.mockResolvedValue([
      {
        id: "row_9",
        editorialStatus: "DRAFT",
        definitionJson: { ...EEC_C1_PODCAST, title: "Título del CMS" },
      },
    ]);

    const res = await service.listForChapter(BOOK, 1);
    const podcast = res.media.find((m) => m.kind === "PODCAST")!;

    expect(podcast.title).toBe("Título del CMS");
    expect(podcast.provenance).toBe("DATABASE");
    expect(podcast.editorialStatus).toBe("DRAFT");
    expect(podcast.draftId).toBe("row_9");
  });

  it("skips a corrupt row instead of losing the whole chapter", async () => {
    prisma.chapterMediaVersion.findMany.mockResolvedValue([
      { id: "bad", editorialStatus: "DRAFT", definitionJson: { nope: true } },
    ]);

    const res = await service.listForChapter(BOOK, 1);
    expect(res.media).toHaveLength(3);
    expect(res.media.every((m) => m.provenance === "CODE")).toBe(true);
  });

  it("404s a chapter the book does not have", async () => {
    prisma.chapter.findFirst.mockResolvedValue(null);
    await expect(service.listForChapter(BOOK, 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("adoption — moving authority without moving identity", () => {
  it("clones the code definition exactly, as a private draft", async () => {
    await service.adopt(BOOK, 1, "eec-c1-podcast-v1", "admin_1");

    const data = prisma.chapterMediaVersion.create.mock.calls[0]![0].data;
    // Completion identity is mediaKey + mediaVersion. If adoption changed
    // either, everyone who already finished this podcast would un-finish it.
    expect(data.mediaKey).toBe("eec-c1-podcast-v1");
    expect(data.mediaVersion).toBe(1);
    expect(data.editorialStatus).toBe("DRAFT");
    // The clone keeps the provider reference: publishing it must not silently
    // downgrade what readers already have.
    expect(data.definitionJson).toEqual(EEC_C1_PODCAST);
  });

  it("refuses to adopt the same media twice", async () => {
    prisma.chapterMediaVersion.findFirst.mockResolvedValue({
      id: "row_1",
      editorialStatus: "DRAFT",
    });

    await expect(
      service.adopt(BOOK, 1, "eec-c1-podcast-v1", "admin_1"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.chapterMediaVersion.create).not.toHaveBeenCalled();
  });

  it("refuses a media key that belongs to another chapter", async () => {
    // The key is real and the caller is ADMIN; it is still not this chapter's.
    await expect(
      service.adopt(BOOK, 1, "par-c2-podcast-v1", "admin_1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.chapterMediaVersion.create).not.toHaveBeenCalled();
  });

  it("refuses a key that exists nowhere", async () => {
    await expect(
      service.adopt(BOOK, 1, "invented-v1", "admin_1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("announcing a format the chapter does not have", () => {
  it("mints the key itself and starts with no master attached", async () => {
    prisma.chapterMediaVersion.findMany.mockResolvedValue([]);

    await service.createComingSoon(
      "familias-ensambladas",
      3,
      "PODCAST",
      "Podcast · capítulo 3",
      "Una conversación sobre el capítulo.",
      "admin_1",
    );

    const data = prisma.chapterMediaVersion.create.mock.calls[0]![0].data;
    // An admin typing a media key would be typing a completion identity.
    expect(data.mediaKey).toBe("fe-c3-podcast-v1");
    expect(data.mediaVersion).toBe(1);
    // Runtime DRAFT with no source: publishing this advertises «En producción»
    // rather than a player that cannot play.
    expect(data.definitionJson).toMatchObject({
      status: "DRAFT",
      source: null,
      accessPolicy: null,
    });
  });

  it("refuses when the chapter already has that kind in code", async () => {
    await expect(
      service.createComingSoon(BOOK, 1, "PODCAST", "T", "D", "admin_1"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.chapterMediaVersion.create).not.toHaveBeenCalled();
  });
});

describe("editing a draft", () => {
  const draftRow = {
    id: "row_9",
    mediaKey: "eec-c1-podcast-v1",
    mediaVersion: 1,
    bookSlug: BOOK,
    chapterOrder: 1,
    kind: "PODCAST",
    editorialStatus: "DRAFT" as const,
    definitionJson: EEC_C1_PODCAST,
  };

  beforeEach(() => {
    prisma.chapterMediaVersion.findUnique.mockResolvedValue(draftRow);
    prisma.chapterMediaVersion.update.mockResolvedValue(draftRow);
  });

  it("carries identity, source and access policy forward untouched", async () => {
    await service.updateDraft("row_9", {
      title: "Un título nuevo",
      description: "Una descripción nueva.",
      durationSec: 61,
      chapters: [{ startSec: 0, label: "Apertura" }],
    });

    const stored = prisma.chapterMediaVersion.update.mock.calls[0]![0].data
      .definitionJson as Record<string, unknown>;
    expect(stored.title).toBe("Un título nuevo");
    expect(stored.durationSec).toBe(61);
    // The browser sends words. It does not get to decide what plays…
    expect(stored.source).toEqual(EEC_C1_PODCAST.source);
    // …or who may play it.
    expect(stored.accessPolicy).toBe(EEC_C1_PODCAST.accessPolicy);
    expect(stored.mediaKey).toBe("eec-c1-podcast-v1");
    expect(stored.mediaVersion).toBe(1);
    expect(stored.status).toBe("PUBLISHED");
  });

  it("refuses to edit a published definition", async () => {
    prisma.chapterMediaVersion.findUnique.mockResolvedValue({
      ...draftRow,
      editorialStatus: "PUBLISHED",
    });

    await expect(
      service.updateDraft("row_9", {
        title: "T",
        description: "D",
        durationSec: null,
        chapters: [],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.chapterMediaVersion.update).not.toHaveBeenCalled();
  });
});

describe("publishing", () => {
  const draftRow = {
    id: "row_9",
    mediaKey: "eec-c1-podcast-v1",
    mediaVersion: 1,
    bookSlug: BOOK,
    chapterOrder: 1,
    kind: "PODCAST",
    editorialStatus: "DRAFT" as const,
    definitionJson: EEC_C1_PODCAST,
  };

  it("flips the row and keeps the identity it always had", async () => {
    prisma.chapterMediaVersion.findUnique.mockResolvedValue(draftRow);
    prisma.chapterMediaVersion.update.mockResolvedValue({
      id: "row_9",
      mediaKey: "eec-c1-podcast-v1",
      mediaVersion: 1,
    });

    const res = await service.publishDraft("row_9");

    expect(res).toEqual({
      draftId: "row_9",
      mediaKey: "eec-c1-podcast-v1",
      mediaVersion: 1,
    });
    const data = prisma.chapterMediaVersion.update.mock.calls[0]![0].data;
    expect(data.editorialStatus).toBe("PUBLISHED");
    expect(data.publishedAt).toBeInstanceOf(Date);
    // No definition rewrite on publish: what was reviewed is what ships.
    expect(data).not.toHaveProperty("definitionJson");
  });

  it("refuses a definition that disagrees with its own columns", async () => {
    // Findable as one thing and resolvable as another is the worst outcome
    // here, so it is refused rather than reconciled.
    prisma.chapterMediaVersion.findUnique.mockResolvedValue({
      ...draftRow,
      mediaKey: "eec-c1-podcast-v9",
    });

    await expect(service.publishDraft("row_9")).rejects.toMatchObject({
      response: { code: "MEDIA_DEFINITION_IDENTITY_DRIFT" },
    });
    expect(prisma.chapterMediaVersion.update).not.toHaveBeenCalled();
  });

  it("refuses to publish twice", async () => {
    prisma.chapterMediaVersion.findUnique.mockResolvedValue({
      ...draftRow,
      editorialStatus: "PUBLISHED",
    });

    await expect(service.publishDraft("row_9")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
