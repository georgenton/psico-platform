import { describe, expect, it, vi } from "vitest";
import {
  progressForEffectiveChapters,
  resolveEffectiveChapters,
} from "./effective-chapters";

/**
 * Book detail must list what a reader can actually open — and name each row by
 * the identity the reader honours for it.
 *
 * These fixtures pin the three things that made the screen wrong before: native
 * chapters were invisible, draft work would have been visible, and a position
 * both structures claim would have produced two rows or the wrong link.
 */

const placement = (
  order: number,
  unitId: string,
  title: string,
  extra: Partial<{
    partNumber: number | null;
    partTitle: string | null;
    durationMinutes: number | null;
  }> = {},
) => ({
  order,
  partNumber: extra.partNumber ?? null,
  partTitle: extra.partTitle ?? null,
  unit: { id: unitId },
  unitVersion: {
    title,
    durationMinutes: extra.durationMinutes ?? null,
  },
});

const legacy = (order: number, id: string, title: string) => ({
  id,
  order,
  title,
  durationMinutes: null,
  partNumber: null,
  partTitle: null,
});

function db(opts: {
  publishedRevisionId?: string | null;
  placements?: ReturnType<typeof placement>[];
  /** Positions a `Chapter` row occupies — published or not. */
  occupiedOrders?: number[];
}) {
  const revisionUnit = {
    findMany: vi.fn().mockResolvedValue(opts.placements ?? []),
  };
  const chapter = {
    findMany: vi
      .fn()
      .mockResolvedValue(
        (opts.occupiedOrders ?? []).map((order) => ({ order })),
      ),
  };
  const edition = {
    findFirst: vi
      .fn()
      .mockResolvedValue(
        opts.publishedRevisionId === undefined
          ? null
          : { publishedRevisionId: opts.publishedRevisionId },
      ),
  };
  return { edition, revisionUnit, chapter } as never;
}

describe("resolveEffectiveChapters", () => {
  it("a legacy-only book is unchanged — every row still links by chapter id", async () => {
    const out = await resolveEffectiveChapters(db({}), {
      bookId: "book-1",
      bookSlug: "libro",
      legacyChapters: [legacy(1, "ch-1", "Uno"), legacy(2, "ch-2", "Dos")],
    });

    expect(out.map((c) => c.readerRef)).toEqual([
      { kind: "chapter", id: "ch-1" },
      { kind: "chapter", id: "ch-2" },
    ]);
  });

  it("a native-only book is listed at all, by unit id and published title", async () => {
    const out = await resolveEffectiveChapters(
      db({
        publishedRevisionId: "rev-pub",
        placements: [
          placement(1, "u-1", "Nativo uno", { durationMinutes: 12 }),
        ],
      }),
      { bookId: "book-1", bookSlug: "libro", legacyChapters: [] },
    );

    // The regression this whole repair exists for: before, this was [].
    expect(out).toEqual([
      {
        order: 1,
        readerRef: { kind: "unit", id: "u-1" },
        title: "Nativo uno",
        durationMinutes: 12,
        partNumber: null,
        partTitle: null,
      },
    ]);
  });

  it("draft-only work is not listed — a catalogue is not a preview", async () => {
    const structure = db({ publishedRevisionId: null });
    const out = await resolveEffectiveChapters(structure, {
      bookId: "book-1",
      bookSlug: "libro",
      legacyChapters: [],
    });

    expect(out).toEqual([]);
    // Not merely filtered afterwards: the draft is never read.
    expect(
      (structure as never as ReturnType<typeof db>).revisionUnit.findMany,
    ).not.toHaveBeenCalled();
  });

  it("mixed: native and legacy chapters interleave in position order", async () => {
    const out = await resolveEffectiveChapters(
      db({
        publishedRevisionId: "rev-pub",
        placements: [placement(2, "u-2", "Nativo dos")],
        occupiedOrders: [1, 3],
      }),
      {
        bookId: "book-1",
        bookSlug: "libro",
        legacyChapters: [
          legacy(1, "ch-1", "Legado uno"),
          legacy(3, "ch-3", "Legado tres"),
        ],
      },
    );

    expect(out.map((c) => [c.order, c.readerRef.kind, c.readerRef.id])).toEqual(
      [
        [1, "chapter", "ch-1"],
        [2, "unit", "u-2"],
        [3, "chapter", "ch-3"],
      ],
    );
  });

  it("a contested position yields ONE row, and it is the one the reader serves", async () => {
    const out = await resolveEffectiveChapters(
      db({
        publishedRevisionId: "rev-pub",
        // The backfill minted a unit for the same position the legacy row holds.
        placements: [placement(1, "u-backfilled", "Copia nativa")],
        occupiedOrders: [1],
      }),
      {
        bookId: "book-1",
        bookSlug: "libro",
        legacyChapters: [legacy(1, "ch-1", "El original")],
      },
    );

    expect(out).toHaveLength(1);
    // `resolveReaderChapter` tries the legacy row first, so listing `u/…` here
    // would hand out a link that resolves to different content than it names.
    expect(out[0].readerRef).toEqual({ kind: "chapter", id: "ch-1" });
    expect(out[0].title).toBe("El original");
  });
  /**
   * The gap the parity proof in `reader-locator.pg-spec.ts` found.
   *
   * `Chapter.isPublished` defaults to false and the reader ignores the column
   * entirely, so an unpublished legacy chapter still SERVES its position.
   */
  it("an unpublished legacy chapter still blocks its position from going native", async () => {
    const out = await resolveEffectiveChapters(
      db({
        publishedRevisionId: "rev-pub",
        placements: [
          placement(1, "u-1", "Copia"),
          placement(2, "u-2", "Nativo real"),
        ],
        // Position 1 has a `Chapter` row; detail's include dropped it because
        // it is unpublished, so it is absent from `legacyChapters`.
        occupiedOrders: [1],
      }),
      { bookId: "book-1", bookSlug: "libro", legacyChapters: [] },
    );

    // Not listed as `u/u-1`: that link would open the legacy chapter's text.
    // Not listed at all: an unpublished chapter is not catalogue material.
    expect(out.map((c) => c.readerRef)).toEqual([{ kind: "unit", id: "u-2" }]);
  });
});

describe("progressForEffectiveChapters", () => {
  const chapters = [
    {
      order: 1,
      readerRef: { kind: "chapter" as const, id: "ch-1" },
      title: "Uno",
      durationMinutes: null,
      partNumber: null,
      partTitle: null,
    },
    {
      order: 2,
      readerRef: { kind: "unit" as const, id: "u-2" },
      title: "Dos",
      durationMinutes: null,
      partNumber: null,
      partTitle: null,
    },
  ];

  it("reads both identities, batched, and never crosses them", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([{ chapterId: "ch-1", completedAt: new Date() }])
      .mockResolvedValueOnce([{ contentUnitId: "u-2", completedAt: null }]);

    const out = await progressForEffectiveChapters(
      { userProgress: { findMany } } as never,
      { userId: "u", chapters },
    );

    // Two queries for two chapters — and it stays two however long the book is.
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      chapterId: { in: ["ch-1"] },
    });
    expect(findMany.mock.calls[1][0].where).toMatchObject({
      contentUnitId: { in: ["u-2"] },
    });
    expect(out.get("ch-1")?.completedAt).toBeInstanceOf(Date);
    expect(out.get("u-2")?.completedAt).toBeNull();
  });

  it("a native chapter does not inherit the progress of the position it took over", async () => {
    // Legacy chapter `ch-1` at position 1 is finished. The book now offers a
    // NATIVE chapter at position 1 instead.
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const out = await progressForEffectiveChapters(
      { userProgress: { findMany } } as never,
      {
        userId: "u",
        chapters: [
          {
            order: 1,
            readerRef: { kind: "unit", id: "u-new" },
            title: "Nuevo",
            durationMinutes: null,
            partNumber: null,
            partTitle: null,
          },
        ],
      },
    );

    expect(out.get("u-new")).toBeUndefined();
    // Position never appears in a lookup key, so there is nothing to inherit.
    expect(out.has("1")).toBe(false);
  });

  it("skips the query for an identity the book has none of", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await progressForEffectiveChapters(
      { userProgress: { findMany } } as never,
      {
        userId: "u",
        chapters: [chapters[0]],
      },
    );
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
