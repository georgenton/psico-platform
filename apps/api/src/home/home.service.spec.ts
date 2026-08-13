import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { HomeService } from "./home.service";

// ─── Fixtures + mock factory ─────────────────────────────────────────────────

function buildPrisma() {
  return {
    user: { findUnique: vi.fn(), update: vi.fn() },
    userProgress: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    edition: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    revisionUnit: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    contentUnit: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    // Continue now starts from `ReadingSession`, and the book's effective
    // structure decides whether that identity is still openable.
    chapter: {
      count: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    readingSession: { findMany: vi.fn().mockResolvedValue([]) },
    conversation: { findFirst: vi.fn() },
    // `findUnique` is how the NATIVE continue-reading card reaches the Book
    // row: a native chapter has no `Chapter` to borrow cover and author from.
    book: { findMany: vi.fn(), findUnique: vi.fn().mockResolvedValue(null) },
    reflectionPrompt: { findFirst: vi.fn(), findUnique: vi.fn() },
    dismissedReflectionPrompt: { findMany: vi.fn(), upsert: vi.fn() },
    onboardingMood: { findUnique: vi.fn() },
    // Sprint G2b — fetchStats now also reads diaryEntry.findMany (for the
    // distinct tag count → patternsCount) and weeklySummary.count (→
    // insightsCount). Default both to safe empty values.
    diaryEntry: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    weeklySummary: { count: vi.fn().mockResolvedValue(0) },
    // Sprint B1 — MoodLog drives the mood-trend insight rule + ambient comes
    // from UserPreferences. Default: empty time series, no preferences row
    // (HomeService falls back to "calma" + returns null insightToday).
    moodLog: { findMany: vi.fn().mockResolvedValue([]) },
    userPreferences: { findUnique: vi.fn().mockResolvedValue(null) },
  };
}

const fakeUserRow = {
  firstName: "Jorge",
  name: "Jorge Quiza",
  city: "Quito",
  plan: "FREE",
  currentStreakDays: 3,
  mood: null,
};

// ─── HomeService.getHome ─────────────────────────────────────────────────────

/**
 * Continue now starts from `ReadingSession`. These helpers describe that
 * authority: a session row, the book behind its identity, and the effective
 * structure that decides whether the identity is still openable.
 */
function continueFromLegacy(
  prisma: ReturnType<typeof buildPrismaMock>,
  opts: { chapterId: string; order: number; title?: string },
) {
  prisma.readingSession.findMany.mockResolvedValue([
    {
      chapterId: opts.chapterId,
      contentUnitId: null,
      lastSeenAt: new Date("2026-03-15"),
    },
  ]);
  prisma.chapter.findUnique.mockResolvedValue({
    id: opts.chapterId,
    book: {
      id: "book-1",
      slug: "libro",
      title: "Libro",
      cover: "warm",
      author: { name: "A" },
    },
  });
  prisma.chapter.findMany.mockResolvedValue([
    {
      id: opts.chapterId,
      order: opts.order,
      title: opts.title ?? "Capítulo",
      durationMinutes: null,
      partNumber: null,
      partTitle: null,
    },
  ]);
}

function continueFromNative(
  prisma: ReturnType<typeof buildPrismaMock>,
  opts: { unitId: string; order: number | null },
) {
  prisma.readingSession.findMany.mockResolvedValue([
    {
      chapterId: null,
      contentUnitId: opts.unitId,
      lastSeenAt: new Date("2026-03-15"),
    },
  ]);
  prisma.contentUnit.findUnique.mockResolvedValue({
    edition: { slug: "libro", publishedRevisionId: "rev-pub" },
  });
  prisma.revisionUnit.findFirst.mockResolvedValue(
    opts.order === null
      ? null
      : { order: opts.order, unitVersion: { title: "Nativo" } },
  );
  prisma.book.findUnique.mockResolvedValue({
    id: "book-1",
    title: "Libro",
    cover: "warm",
    author: { name: "A" },
  });
  prisma.edition.findMany.mockResolvedValue([
    { slug: "libro", publishedRevisionId: "rev-pub" },
  ]);
  prisma.edition.findFirst.mockResolvedValue({
    publishedRevisionId: "rev-pub",
  });
  prisma.chapter.findMany.mockResolvedValue([]);
  prisma.revisionUnit.findMany.mockResolvedValue(
    opts.order === null
      ? []
      : [
          {
            order: opts.order,
            partNumber: null,
            partTitle: null,
            unit: { id: opts.unitId },
            unitVersion: { title: "Nativo", durationMinutes: null },
          },
        ],
  );
}

describe("HomeService.getHome", () => {
  let service: HomeService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new HomeService(
      prisma as never,
      {
        getForHome: async () => ({
          values: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] as [
            number,
            number,
            number,
            number,
            number,
            number,
          ],
          pct: 50,
          computedAt: new Date(0).toISOString(),
          provider: "fallback",
        }),
      } as never,
      { feed: async () => ({ items: [] }) } as never,
      { topForHome: async () => [] } as never,
    );
  });

  it("throws when user does not exist", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.userProgress.findFirst.mockResolvedValue(null);
    prisma.userProgress.findMany.mockResolvedValue([]);
    prisma.userProgress.count.mockResolvedValue(0);
    prisma.book.findMany.mockResolvedValue([]);
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.dismissedReflectionPrompt.findMany.mockResolvedValue([]);
    prisma.reflectionPrompt.findFirst.mockResolvedValue(null);

    await expect(service.getHome("user-1")).rejects.toThrow(NotFoundException);
  });

  it("returns base shape with greeting and shortcuts when user is new", async () => {
    // 3 concurrent calls to findUnique (fetchUser, fetchStats, fetchRecos).
    // Default resolves to a shape that satisfies every select clause.
    prisma.user.findUnique.mockResolvedValue({
      ...fakeUserRow,
      preferences: { weeklyGoalMinutes: 60 },
    });
    prisma.userProgress.findFirst.mockResolvedValue(null);
    prisma.userProgress.findMany.mockResolvedValue([]);
    prisma.userProgress.count.mockResolvedValue(0);
    prisma.book.findMany.mockResolvedValue([]);
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.dismissedReflectionPrompt.findMany.mockResolvedValue([]);
    prisma.reflectionPrompt.findFirst.mockResolvedValue(null);

    const result = await service.getHome("user-1");

    expect(result.user.firstName).toBe("Jorge");
    expect(result.user.tier).toBe("free");
    expect(result.user.streakDays).toBe(3);
    expect(result.continueBook).toBeNull();
    expect(result.recos).toEqual([]);
    expect(result.shortcuts).toHaveLength(4);
    expect(result.shortcuts.map((s) => s.id)).toEqual([
      "reflexiones",
      "eco",
      "biblioteca",
      "terapia",
    ]);
    expect(result.greeting.text).toBeDefined();
  });

  it("PR-0.2: emotionalMap is null when the map service returns null (kill switch off) — rest of Home works", async () => {
    // Home consumes `getForHome`, which returns null when EMOTIONAL_MAP_PUBLIC
    // is off. Home must NOT fail — it serves everything else and emotionalMap:
    // null (the client renders "unavailable", never zeros).
    const nullMapService = { getForHome: async () => null };
    const svc = new HomeService(
      prisma as never,
      nullMapService as never,
      { feed: async () => ({ items: [] }) } as never,
      { topForHome: async () => [] } as never,
    );
    prisma.user.findUnique.mockResolvedValue({
      ...fakeUserRow,
      preferences: { weeklyGoalMinutes: 60 },
    });
    prisma.userProgress.findFirst.mockResolvedValue(null);
    prisma.userProgress.findMany.mockResolvedValue([]);
    prisma.userProgress.count.mockResolvedValue(0);
    prisma.book.findMany.mockResolvedValue([]);
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.dismissedReflectionPrompt.findMany.mockResolvedValue([]);
    prisma.reflectionPrompt.findFirst.mockResolvedValue(null);

    const result = await svc.getHome("user-1");

    expect(result.emotionalMap).toBeNull();
    // The rest of Home is unaffected.
    expect(result.user.firstName).toBe("Jorge");
    expect(result.shortcuts).toHaveLength(4);
  });

  it("computes continueBook from the latest ReadingSession", async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...fakeUserRow,
      preferences: { weeklyGoalMinutes: 60 },
    });
    prisma.readingSession.findMany.mockResolvedValue([
      {
        chapterId: "ch-1",
        contentUnitId: null,
        lastSeenAt: new Date("2026-03-15"),
      },
    ]);
    prisma.chapter.findUnique.mockResolvedValue({
      id: "ch-1",
      book: {
        id: "book-1",
        slug: "emociones",
        title: "Emociones",
        cover: "warm",
        author: { name: "Marina Quintana" },
      },
    });
    prisma.chapter.findMany.mockResolvedValue([
      {
        id: "ch-1",
        order: 2,
        title: "Capítulo 2",
        durationMinutes: null,
        partNumber: null,
        partTitle: null,
      },
      {
        id: "ch-2",
        order: 3,
        title: "Capítulo 3",
        durationMinutes: null,
        partNumber: null,
        partTitle: null,
      },
    ]);
    prisma.userProgress.findMany.mockResolvedValue([]);
    prisma.userProgress.count.mockResolvedValue(1);
    prisma.chapter.count.mockResolvedValue(2);
    prisma.book.findMany.mockResolvedValue([]);
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.dismissedReflectionPrompt.findMany.mockResolvedValue([]);
    prisma.reflectionPrompt.findFirst.mockResolvedValue(null);

    // Last, so the generic `[]` default above does not win.
    prisma.userProgress.findMany.mockResolvedValue([
      { chapterId: "ch-1", completedAt: new Date() },
    ]);

    const result = await service.getHome("user-1");

    expect(result.continueBook).toEqual(
      expect.objectContaining({
        bookId: "book-1",
        title: "Emociones",
        author: "Marina Quintana",
        cover: "warm",
        bookSlug: "emociones",
        chapterN: 2,
        // Identity off the session row, not the position beside it.
        readerRef: { kind: "chapter", id: "ch-1" },
        chapterTitle: "Capítulo 2",
        progressPct: 50,
      }),
    );
  });

  it("names the chapter in the mid-book insight, and never numbers it", async () => {
    // «Parejas que Perduran» keeps its preface at order 1, so the book's own
    // chapter 1 arrives as order 2. The insight used to read «Capítulo 2»
    // about the chapter whose title page says one.
    prisma.user.findUnique.mockResolvedValue({
      ...fakeUserRow,
      currentStreakDays: 0, // let rule 1 fall through
      preferences: { weeklyGoalMinutes: 60 },
    });
    prisma.readingSession.findMany.mockResolvedValue([
      {
        chapterId: "ch-2",
        contentUnitId: null,
        lastSeenAt: new Date("2026-03-15"),
      },
    ]);
    prisma.chapter.findUnique.mockResolvedValue({
      id: "ch-2",
      book: {
        id: "book-pqp",
        slug: "parejas-que-perduran",
        title: "Parejas que perduran",
        cover: "warm",
        author: { name: "David Jaramillo" },
      },
    });
    prisma.chapter.findMany.mockResolvedValue([
      {
        id: "ch-2",
        order: 2,
        title: "Cuando amar también sana",
        durationMinutes: null,
        partNumber: null,
        partTitle: null,
      },
      {
        id: "ch-9",
        order: 3,
        title: "Otro",
        durationMinutes: null,
        partNumber: null,
        partTitle: null,
      },
    ]);
    prisma.userProgress.findMany.mockResolvedValue([]);
    prisma.userProgress.count.mockResolvedValue(1);
    prisma.chapter.count.mockResolvedValue(2); // → progressPct 50, mid-book
    prisma.book.findMany.mockResolvedValue([]);
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.dismissedReflectionPrompt.findMany.mockResolvedValue([]);
    prisma.reflectionPrompt.findFirst.mockResolvedValue(null);

    prisma.userProgress.findMany.mockResolvedValue([
      { chapterId: "ch-2", completedAt: new Date() },
    ]);

    const result = await service.getHome("user-1");

    expect(result.insightToday?.kind).toBe("book-progress");
    expect(result.insightToday?.body).toContain("Cuando amar también sana");
    expect(result.insightToday?.body).not.toMatch(/Cap\.\s*\d/);
    expect(result.insightToday?.body).not.toMatch(/Capítulo\s*\d/);
    // The CTA is untouched: only the sentence changed.
    expect(result.insightToday?.ctaHref).toBe("/dashboard/biblioteca");
    expect(result.insightToday?.ctaLabel).toBe("Seguir leyendo");
    // `chapterN` stays in the contract for display and for older installed
    // clients. New navigation goes through `readerRef`.
    expect(result.continueBook?.chapterN).toBe(2);
    expect(result.continueBook?.readerRef).toEqual({
      kind: "chapter",
      id: "ch-2",
    });
  });

  /**
   * Phase B.A — Continue Reading resumes a CHAPTER, not a position.
   *
   * The card is built from a reading session that may be months old. If its
   * identity were re-derived from the chapter's current order, a book that has
   * since been restructured would resume somebody into a different chapter —
   * silently, and looking exactly like the right one.
   */
  describe("continue reading identity", () => {
    const quiet = () => {
      prisma.user.findUnique.mockResolvedValue({
        ...fakeUserRow,
        preferences: { weeklyGoalMinutes: 60 },
      });
      prisma.userProgress.findMany.mockResolvedValue([]);
      prisma.userProgress.count.mockResolvedValue(1);
      prisma.chapter.count.mockResolvedValue(2);
      prisma.book.findMany.mockResolvedValue([]);
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.dismissedReflectionPrompt.findMany.mockResolvedValue([]);
      prisma.reflectionPrompt.findFirst.mockResolvedValue(null);
    };

    /** A legacy session, plus the book and structure behind its identity. */
    const legacySession = (order: number) => {
      continueFromLegacy(prisma, { chapterId: "ch-stable", order });
      return null;
    };

    /** The published manifest currently places `unit-stable` at `order`. */
    const nativePublishedAt = (order: number | null) => {
      continueFromNative(prisma, { unitId: "unit-stable", order });
      prisma.contentUnit.findUnique.mockResolvedValue({
        edition: { slug: "libro", publishedRevisionId: "rev-pub" },
      });
      prisma.revisionUnit.findFirst.mockResolvedValue(
        order === null ? null : { order, unitVersion: { title: "Nativo" } },
      );
      prisma.book.findUnique.mockResolvedValue({
        id: "book-1",
        title: "Libro",
        cover: "warm",
        author: { name: "A" },
      });
    };

    it("a legacy session resumes by chapter id", async () => {
      quiet();
      legacySession(2);

      const out = await service.getHome("user-1");

      expect(out.continueBook?.readerRef).toEqual({
        kind: "chapter",
        id: "ch-stable",
      });
      expect(out.continueBook?.bookSlug).toBe("libro");
    });

    it("a native session resumes by unit id", async () => {
      quiet();
      nativePublishedAt(2);

      const out = await service.getHome("user-1");

      expect(out.continueBook?.readerRef).toEqual({
        kind: "unit",
        id: "unit-stable",
      });
      expect(out.continueBook?.bookSlug).toBe("libro");
    });

    it("moving a legacy chapter does not change what Home resumes", async () => {
      quiet();
      legacySession(1);
      const before = (await service.getHome("user-1")).continueBook;

      // Same chapter, different position.
      legacySession(7);
      const after = (await service.getHome("user-1")).continueBook;

      expect(after?.readerRef).toEqual(before?.readerRef);
      // The number on the card follows the book; the link does not.
      expect(before?.chapterN).toBe(1);
      expect(after?.chapterN).toBe(7);
    });

    it("moving a native chapter does not change what Home resumes", async () => {
      quiet();
      nativePublishedAt(2);
      const before = (await service.getHome("user-1")).continueBook;

      nativePublishedAt(5);
      const after = (await service.getHome("user-1")).continueBook;

      expect(after?.readerRef).toEqual(before?.readerRef);
      expect(before?.chapterN).toBe(2);
      expect(after?.chapterN).toBe(5);
    });

    it("a retired native unit produces no card at all", async () => {
      quiet();
      nativePublishedAt(null);

      const out = await service.getHome("user-1");

      // Not a card pointing nowhere, and not a fabricated position — nothing.
      expect(out.continueBook).toBeNull();
    });

    it("an unpublished edition produces no card either", async () => {
      quiet();
      nativePublishedAt(2);
      prisma.contentUnit.findUnique.mockResolvedValue({
        edition: { slug: "libro", publishedRevisionId: null },
      });

      const out = await service.getHome("user-1");

      // Draft editorial work is not something a reader's Home may reveal.
      expect(out.continueBook).toBeNull();
    });
  });

  it("flags recos as locked when user is free and book is pro", async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...fakeUserRow,
      preferences: { weeklyGoalMinutes: 60 },
    });
    prisma.userProgress.findFirst.mockResolvedValue(null);
    prisma.userProgress.findMany.mockResolvedValue([]);
    prisma.userProgress.count.mockResolvedValue(0);
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.book.findMany.mockResolvedValue([
      {
        id: "book-pro",
        title: "Pro book",
        cover: "cool",
        plan: "PRO",
        author: { name: "Author" },
      },
    ]);
    prisma.dismissedReflectionPrompt.findMany.mockResolvedValue([]);
    prisma.reflectionPrompt.findFirst.mockResolvedValue(null);

    const result = await service.getHome("user-1");

    expect(result.recos[0].lockedByTier).toBe(true);
  });
});

// ─── HomeService.updateMood ──────────────────────────────────────────────────

describe("HomeService.updateMood", () => {
  let service: HomeService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new HomeService(
      prisma as never,
      {
        getForHome: async () => ({
          values: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] as [
            number,
            number,
            number,
            number,
            number,
            number,
          ],
          pct: 50,
          computedAt: new Date(0).toISOString(),
          provider: "fallback",
        }),
      } as never,
      { feed: async () => ({ items: [] }) } as never,
      { topForHome: async () => [] } as never,
    );
  });

  it("tolerates missing OnboardingMood row by falling back to a hardcoded swatch", async () => {
    // Sprint B6b: the catalog row may be absent if the DB wasn't re-seeded
    // after the IDs migrated from calma/foco to great/good/ok/low/hard.
    // The DTO already validates the id; this service path just enriches
    // with a swatch and must not 404.
    prisma.onboardingMood.findUnique.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({});

    const result = await service.updateMood("user-1", "great");

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ mood: "great" }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.mood).toBe("great");
    expect(typeof result.swatch).toBe("string");
    expect(result.swatch.length).toBeGreaterThan(0);
  });

  it("updates user.mood and returns swatch", async () => {
    prisma.onboardingMood.findUnique.mockResolvedValue({
      id: "calma",
      swatch: "#bde",
    });
    prisma.user.update.mockResolvedValue({});

    const result = await service.updateMood("user-1", "calma");

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ mood: "calma" }),
      }),
    );
    expect(result).toEqual({ ok: true, mood: "calma", swatch: "#bde" });
  });
});

// ─── HomeService.dismissPrompt ───────────────────────────────────────────────

describe("HomeService.dismissPrompt", () => {
  let service: HomeService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new HomeService(
      prisma as never,
      {
        getForHome: async () => ({
          values: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] as [
            number,
            number,
            number,
            number,
            number,
            number,
          ],
          pct: 50,
          computedAt: new Date(0).toISOString(),
          provider: "fallback",
        }),
      } as never,
      { feed: async () => ({ items: [] }) } as never,
      { topForHome: async () => [] } as never,
    );
  });

  it("returns 404 when prompt not found", async () => {
    prisma.reflectionPrompt.findUnique.mockResolvedValue(null);

    await expect(service.dismissPrompt("user-1", "ghost")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("upserts dismissal", async () => {
    prisma.reflectionPrompt.findUnique.mockResolvedValue({ id: "p-1" });
    prisma.dismissedReflectionPrompt.upsert.mockResolvedValue({});

    const result = await service.dismissPrompt("user-1", "p-1");

    expect(prisma.dismissedReflectionPrompt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_promptId: { userId: "user-1", promptId: "p-1" } },
      }),
    );
    expect(result).toEqual({ ok: true });
  });
});
