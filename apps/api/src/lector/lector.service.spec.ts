import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Plan } from "@prisma/client";
import { LectorService } from "./lector.service";

// ─── Fixtures ───────────────────────────────────────────────────────────

const freeBook = {
  id: "book-free",
  slug: "emociones-en-construccion",
  title: "Emociones en Construcción",
  cover: "warm",
  coverArtUrl: null as string | null,
  totalChapters: 2,
  plan: "FREE" as const,
  author: { name: "Marina Quintana" },
};

const proBook = {
  ...freeBook,
  id: "book-pro",
  slug: "familias-ensambladas",
  plan: "PRO" as const,
};

const block = (id: string, order: number, content = "abcdefghij") => ({
  id,
  order,
  kind: "PARAGRAPH" as const,
  content,
  meta: null,
});

const baseChapter = {
  id: "ch-1",
  order: 1,
  title: "Capítulo 1",
  description: "subtitle",
  durationMinutes: 8,
  blocks: [block("b-1", 1), block("b-2", 2), block("b-3", 3)],
  exercises: [],
  audios: [],
};

const baseSession = {
  id: "rs-1",
  userId: "user-1",
  chapterId: "ch-1",
  lastBlockId: "b-1",
  progressPct: 0.3,
  timeSpentSec: 120,
  startedAt: new Date(),
  lastSeenAt: new Date(),
  completedAt: null,
};

const basePrefs = {
  userId: "user-1",
  font: "serif" as const,
  fontSize: 18,
  theme: "system" as const,
  lineHeight: 1.6,
  updatedAt: new Date(),
};

// ─── Helpers ────────────────────────────────────────────────────────────

function makePrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    book: {
      findFirst: vi.fn().mockResolvedValue(freeBook),
    },
    chapter: {
      findUnique: vi.fn().mockResolvedValue(baseChapter),
    },
    highlight: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    annotation: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    readingSession: {
      upsert: vi.fn().mockResolvedValue(baseSession),
      findUnique: vi.fn().mockResolvedValue(baseSession),
    },
    readerPreferences: {
      upsert: vi.fn().mockResolvedValue(basePrefs),
    },
    userProgress: {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
    },
    chapterBlock: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as ConstructorParameters<typeof LectorService>[0];
}

const config = {} as ConstructorParameters<typeof LectorService>[1];

// ─── Tests ──────────────────────────────────────────────────────────────

describe("LectorService.getChapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the aggregated chapter for a FREE user reading a FREE book", async () => {
    const prisma = makePrisma();
    const svc = new LectorService(prisma, config);
    const result = await svc.getChapter("user-1", "FREE" as Plan, "any", 1);

    expect(result.book.slug).toBe("emociones-en-construccion");
    expect(result.chapter.order).toBe(1);
    expect(result.blocks).toHaveLength(3);
    expect(result.session.progressPct).toBeCloseTo(0.3);
    expect(result.preferences.theme).toBe("system");
  });

  it("rejects FREE user reading chapter 2+ of a PRO book", async () => {
    const prisma = makePrisma({
      book: { findFirst: vi.fn().mockResolvedValue(proBook) } as never,
      chapter: {
        findUnique: vi.fn().mockResolvedValue({ ...baseChapter, order: 2 }),
      } as never,
    });
    const svc = new LectorService(prisma, config);
    await expect(
      svc.getChapter("user-1", "FREE" as Plan, "pro", 2),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows FREE user to read chapter 1 of a PRO book (free preview)", async () => {
    const prisma = makePrisma({
      book: { findFirst: vi.fn().mockResolvedValue(proBook) } as never,
    });
    const svc = new LectorService(prisma, config);
    const result = await svc.getChapter("user-1", "FREE" as Plan, "pro", 1);
    expect(result.chapter.order).toBe(1);
  });

  it("returns NOT_FOUND when the book does not exist", async () => {
    const prisma = makePrisma({
      book: { findFirst: vi.fn().mockResolvedValue(null) } as never,
    });
    const svc = new LectorService(prisma, config);
    await expect(
      svc.getChapter("user-1", "FREE" as Plan, "missing", 1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("LectorService.heartbeat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clamps timeSpentDeltaSec to 60 seconds", async () => {
    const upsertSpy = vi
      .fn()
      .mockResolvedValue({ ...baseSession, timeSpentSec: 180 });
    const prisma = makePrisma({
      chapter: {
        findUnique: vi.fn().mockResolvedValue({ id: "ch-1" }),
      } as never,
      readingSession: {
        findUnique: vi.fn().mockResolvedValue(baseSession),
        upsert: upsertSpy,
      } as never,
    });
    const svc = new LectorService(prisma, config);
    await svc.heartbeat("user-1", {
      bookId: "any",
      chapterOrder: 1,
      lastBlockId: "b-1",
      timeSpentDeltaSec: 3600, // 1h — should be clamped
      progressPct: 0.5,
    });
    const args = upsertSpy.mock.calls[0]?.[0] as {
      update: { timeSpentSec: number };
    };
    // existing 120 + capped 60 = 180
    expect(args.update.timeSpentSec).toBe(180);
  });

  it("never decreases progressPct", async () => {
    const upsertSpy = vi.fn().mockResolvedValue(baseSession);
    const prisma = makePrisma({
      chapter: {
        findUnique: vi.fn().mockResolvedValue({ id: "ch-1" }),
      } as never,
      readingSession: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ ...baseSession, progressPct: 0.8 }),
        upsert: upsertSpy,
      } as never,
    });
    const svc = new LectorService(prisma, config);
    await svc.heartbeat("user-1", {
      bookId: "any",
      chapterOrder: 1,
      lastBlockId: "b-1",
      timeSpentDeltaSec: 5,
      progressPct: 0.5, // user scrolled back; should be kept at 0.8
    });
    const args = upsertSpy.mock.calls[0]?.[0] as {
      update: { progressPct: number };
    };
    expect(args.update.progressPct).toBe(0.8);
  });

  it("soft-fails when the chapter is unpublished/missing", async () => {
    const prisma = makePrisma({
      chapter: { findUnique: vi.fn().mockResolvedValue(null) } as never,
    });
    const svc = new LectorService(prisma, config);
    const result = await svc.heartbeat("user-1", {
      bookId: "any",
      chapterOrder: 99,
      lastBlockId: "b-1",
      timeSpentDeltaSec: 5,
      progressPct: 0.5,
    });
    expect(result.ok).toBe(true);
  });
});

describe("LectorService.completeChapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the next chapter when one exists", async () => {
    const prisma = makePrisma({
      book: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "book-1", totalChapters: 3 }),
      } as never,
    });
    const svc = new LectorService(prisma, config);
    const result = await svc.completeChapter("user-1", "any", 2);
    expect(result.nextChapter).toBe(3);
  });

  it("returns null nextChapter on the last chapter", async () => {
    const prisma = makePrisma({
      book: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "book-1", totalChapters: 3 }),
      } as never,
    });
    const svc = new LectorService(prisma, config);
    const result = await svc.completeChapter("user-1", "any", 3);
    expect(result.nextChapter).toBeNull();
  });
});

describe("LectorService.getAudio (Pro gate)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects FREE users with PRO_REQUIRED", async () => {
    const svc = new LectorService(makePrisma(), config);
    await expect(svc.getAudio("FREE" as Plan, "any", 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("returns AUDIO_NOT_AVAILABLE when no audio for the chapter", async () => {
    const prisma = makePrisma({
      chapter: {
        findUnique: vi.fn().mockResolvedValue({ ...baseChapter, audios: [] }),
      } as never,
    });
    const svc = new LectorService(prisma, config);
    await expect(svc.getAudio("PRO" as Plan, "any", 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("returns audio metadata to PRO users when present", async () => {
    const prisma = makePrisma({
      chapter: {
        findUnique: vi.fn().mockResolvedValue({
          ...baseChapter,
          audios: [
            {
              id: "a-1",
              fileUrl: "https://r2.example/audio.m4a",
              durationSeconds: 600,
              transcription: "transcript text",
            },
          ],
        }),
      } as never,
    });
    const svc = new LectorService(prisma, config);
    const result = await svc.getAudio("PRO" as Plan, "any", 1);
    expect(result.durationSec).toBe(600);
    expect(result.transcript).toHaveLength(1);
    expect(result.transcript[0]?.text).toBe("transcript text");
    // Metadata for lock-screen / audio bar display. Format is
    // "Cap. <order> · <title>" + book title + author + coverArtUrl OR
    // fallback to the cover gradient token.
    expect(result.metadata).toEqual({
      title: "Cap. 1 · Capítulo 1",
      subtitle: "Emociones en Construcción",
      artist: "Marina Quintana",
      artworkUrl: "warm",
    });
  });

  it("uses coverArtUrl when present and falls back to cover token otherwise", async () => {
    const prisma = makePrisma({
      book: {
        findFirst: vi.fn().mockResolvedValue({
          ...freeBook,
          coverArtUrl: "https://cdn.example/cover.png",
        }),
      } as never,
      chapter: {
        findUnique: vi.fn().mockResolvedValue({
          ...baseChapter,
          audios: [
            {
              id: "a-1",
              fileUrl: "https://r2.example/audio.m4a",
              durationSeconds: 600,
              transcription: "transcript text",
            },
          ],
        }),
      } as never,
    });
    const svc = new LectorService(prisma, config);
    const result = await svc.getAudio("PRO" as Plan, "any", 1);
    expect(result.metadata.artworkUrl).toBe("https://cdn.example/cover.png");
  });
});

describe("LectorService.validateHighlightOffsets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects when start >= end", async () => {
    const prisma = makePrisma({
      chapterBlock: {
        findUnique: vi.fn().mockResolvedValue({ content: "abcdefghij" }),
      } as never,
    });
    const svc = new LectorService(prisma, config);
    await expect(
      svc.validateHighlightOffsets("b-1", 5, 5),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects when endOffset exceeds block length", async () => {
    const prisma = makePrisma({
      chapterBlock: {
        findUnique: vi.fn().mockResolvedValue({ content: "abc" }),
      } as never,
    });
    const svc = new LectorService(prisma, config);
    await expect(
      svc.validateHighlightOffsets("b-1", 0, 99),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("accepts a valid range", async () => {
    const prisma = makePrisma({
      chapterBlock: {
        findUnique: vi.fn().mockResolvedValue({ content: "abcdefghij" }),
      } as never,
    });
    const svc = new LectorService(prisma, config);
    await expect(
      svc.validateHighlightOffsets("b-1", 0, 5),
    ).resolves.toBeUndefined();
  });
});
