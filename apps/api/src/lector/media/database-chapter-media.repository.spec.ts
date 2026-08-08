import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseChapterMediaRepository } from "./database-chapter-media.repository";
import { EEC_C1_PODCAST } from "./chapter-media.catalog";
import type { PrismaService } from "../../prisma/prisma.service";

/**
 * Rows this repository refuses to serve.
 *
 * The columns are what every lookup filters and indexes on, so a `definitionJson`
 * that disagrees with any of them would make a row findable as one thing and
 * resolvable as another. Validation alone does not catch that — the JSON can be
 * perfectly well-formed and still be the wrong media.
 *
 * Refusing is a SKIP, not a throw: one bad row must not take a chapter's whole
 * media surface down, and the code-owned fallback is still there to answer.
 */

function prismaMock() {
  return {
    chapterMediaVersion: { findFirst: vi.fn(), findMany: vi.fn() },
  };
}

const COLUMNS = {
  id: "row_1",
  mediaKey: EEC_C1_PODCAST.mediaKey,
  mediaVersion: EEC_C1_PODCAST.mediaVersion,
  bookSlug: EEC_C1_PODCAST.bookSlug,
  chapterOrder: EEC_C1_PODCAST.chapterOrder,
  kind: EEC_C1_PODCAST.kind,
  definitionJson: EEC_C1_PODCAST,
};

let prisma: ReturnType<typeof prismaMock>;
let repo: DatabaseChapterMediaRepository;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  prisma = prismaMock();
  repo = new DatabaseChapterMediaRepository(prisma as unknown as PrismaService);
});

describe("DatabaseChapterMediaRepository — a healthy row", () => {
  it("serves a published row that agrees with its columns", async () => {
    prisma.chapterMediaVersion.findFirst.mockResolvedValue(COLUMNS);

    expect(await repo.getExact(EEC_C1_PODCAST.mediaKey)).toEqual(
      EEC_C1_PODCAST,
    );
  });

  it("asks only for PUBLISHED rows — a CMS draft is not public", async () => {
    prisma.chapterMediaVersion.findFirst.mockResolvedValue(null);
    await repo.getExact("whatever");

    expect(
      prisma.chapterMediaVersion.findFirst.mock.calls[0]![0].where,
    ).toMatchObject({ editorialStatus: "PUBLISHED" });
  });
});

describe("DatabaseChapterMediaRepository — identity drift", () => {
  it.each([
    ["mediaKey", { mediaKey: "eec-c1-podcast-distinto" }],
    ["mediaVersion", { mediaVersion: 99 }],
    ["bookSlug", { bookSlug: "otro-libro" }],
    ["chapterOrder", { chapterOrder: 7 }],
    ["kind", { kind: "VIDEO" }],
  ])("skips a row whose columns disagree on %s", async (_label, drift) => {
    prisma.chapterMediaVersion.findFirst.mockResolvedValue({
      ...COLUMNS,
      ...drift,
    });

    expect(await repo.getExact(EEC_C1_PODCAST.mediaKey)).toBeNull();
  });

  it("skips a row whose JSON is not a definition at all", async () => {
    prisma.chapterMediaVersion.findFirst.mockResolvedValue({
      ...COLUMNS,
      definitionJson: { nonsense: true },
    });

    expect(await repo.getExact(EEC_C1_PODCAST.mediaKey)).toBeNull();
  });

  it("logs the row id and nothing that could identify the asset", async () => {
    const logged: string[] = [];
    const repoWithSpy = new DatabaseChapterMediaRepository(
      prisma as unknown as PrismaService,
    );
    vi.spyOn(
      (repoWithSpy as unknown as { logger: { error: (m: string) => void } })
        .logger,
      "error",
    ).mockImplementation((m: string) => {
      logged.push(m);
    });
    prisma.chapterMediaVersion.findFirst.mockResolvedValue({
      ...COLUMNS,
      mediaVersion: 99,
    });

    await repoWithSpy.getExact(EEC_C1_PODCAST.mediaKey);

    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("row_1");
    // No object key, no media key, no book — a log line is not the place to
    // narrow down which asset drifted.
    expect(logged[0]).not.toContain("objectKey");
    expect(logged[0]).not.toContain(EEC_C1_PODCAST.mediaKey);
  });
});

describe("DatabaseChapterMediaRepository — a chapter listing", () => {
  it("drops only the bad row, keeping the rest of the chapter", async () => {
    prisma.chapterMediaVersion.findMany.mockResolvedValue([
      COLUMNS,
      { ...COLUMNS, id: "row_2", definitionJson: { nope: true } },
    ]);

    const list = await repo.listPublicForChapter(
      EEC_C1_PODCAST.bookSlug,
      EEC_C1_PODCAST.chapterOrder,
    );
    expect(list).toHaveLength(1);
    expect(list[0]!.mediaKey).toBe(EEC_C1_PODCAST.mediaKey);
  });
});
