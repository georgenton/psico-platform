import { describe, expect, it, vi } from "vitest";
import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
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
  unitKey = `key-${unitId}`,
) => ({
  order,
  partNumber: extra.partNumber ?? null,
  partTitle: extra.partTitle ?? null,
  unit: { id: unitId, unitKey },
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
  /** Unit keys this edition has adopted. */
  adoptedKeys?: string[];
}) {
  const revisionUnit = {
    findMany: vi.fn().mockResolvedValue(opts.placements ?? []),
  };
  const chapter = { findMany: vi.fn().mockResolvedValue([]) };
  const contentUnit = {
    findMany: vi
      .fn()
      .mockResolvedValue(
        (opts.adoptedKeys ?? []).map((unitKey) => ({ unitKey })),
      ),
  };
  const edition = {
    findFirst: vi
      .fn()
      .mockResolvedValue(
        opts.publishedRevisionId === undefined
          ? null
          : { id: "ed-1", publishedRevisionId: opts.publishedRevisionId },
      ),
  };
  return { edition, revisionUnit, chapter, contentUnit } as never;
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
   * Phase B.B, Model A: the published manifest owns position.
   *
   * This used to assert the opposite — that ANY `Chapter` row, published or
   * not, suppressed a native placement at its order. That rule existed because
   * positional resolution was legacy-first, so listing the native chapter would
   * have handed out a link the reader answered differently.
   *
   * The reader now starts from the manifest, so the two agree the other way
   * round: a published placement is served, and an UNPUBLISHED legacy row no
   * longer shadows it. That is the intended change — an unpublished chapter was
   * never something a reader should have been served in the first place.
   */
  it("an unpublished, unadopted legacy row no longer shadows a placement", async () => {
    const out = await resolveEffectiveChapters(
      db({
        publishedRevisionId: "rev-pub",
        placements: [
          placement(1, "u-1", "Nativo uno"),
          placement(2, "u-2", "Nativo dos"),
        ],
        adoptedKeys: [],
      }),
      // The unpublished row is absent from what a reader can see, and it has
      // no unit, so nothing links it to either placement.
      { bookId: "book-1", bookSlug: "libro", legacyChapters: [] },
    );

    expect(out.map((c) => c.readerRef)).toEqual([
      { kind: "unit", id: "u-1" },
      { kind: "unit", id: "u-2" },
    ]);
  });

  it("an ADOPTED legacy chapter is placed by the manifest, not by its own order", async () => {
    // The drift Model A exists for: the row still says 1, the manifest says 2.
    const legacyRow = legacy(1, "ch-1", "El original");
    const key = unitKeyFromLegacyChapterId("ch-1");
    const out = await resolveEffectiveChapters(
      db({
        publishedRevisionId: "rev-pub",
        placements: [
          placement(1, "u-native", "Nativo"),
          placement(2, "u-backing", "Copia", {}, key),
        ],
        adoptedKeys: [key],
      }),
      { bookId: "book-1", bookSlug: "libro", legacyChapters: [legacyRow] },
    );

    expect(out.map((c) => [c.order, c.readerRef.kind, c.readerRef.id])).toEqual(
      [
        [1, "unit", "u-native"],
        // Its identity, at the manifest's position — and its stale order of 1
        // did not suppress the native chapter now sitting there.
        [2, "chapter", "ch-1"],
      ],
    );
  });

  it("an adopted chapter absent from the published structure is not revived", async () => {
    const legacyRow = legacy(1, "ch-gone", "Retirado");
    const key = unitKeyFromLegacyChapterId("ch-gone");
    const out = await resolveEffectiveChapters(
      db({
        publishedRevisionId: "rev-pub",
        placements: [placement(1, "u-1", "Nativo")],
        // Adopted — but the published revision does not place it.
        adoptedKeys: [key],
      }),
      { bookId: "book-1", bookSlug: "libro", legacyChapters: [legacyRow] },
    );

    // Not unsynced, so `Chapter.order` does not put it back in the book.
    expect(out.map((c) => c.readerRef)).toEqual([{ kind: "unit", id: "u-1" }]);
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
