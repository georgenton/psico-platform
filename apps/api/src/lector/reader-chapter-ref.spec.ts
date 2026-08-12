import { describe, expect, it, vi } from "vitest";
import { readerChapterPath, readerRefFromSegments } from "@psico/types";
import { resolveChapterByRef, resolveLocatorRef } from "./reader-chapter-ref";

/**
 * Phase B.A — the routing identity, and what it refuses.
 *
 * Both ids arrive in a path segment a caller types, so "the row exists" is never
 * the same question as "this book's URL may read it".
 */

const NATIVE = {
  source: "content-core" as const,
  contentUnitId: "unit-b",
  order: 3,
};

function db(over: Record<string, unknown> = {}) {
  return {
    chapter: { findFirst: vi.fn().mockResolvedValue(null) },
    edition: {
      findFirst: vi
        .fn()
        .mockResolvedValue({
          id: "ed",
          editionKey: "libro-1e",
          publishedRevisionId: "r2",
        }),
    },
    revisionUnit: { findFirst: vi.fn().mockResolvedValue(null) },
    contentUnit: { findUnique: vi.fn().mockResolvedValue(null) },
    ...over,
  } as never;
}

describe("the URL grammar", () => {
  it("spells each identity with its own discriminator", () => {
    expect(readerChapterPath("libro", { kind: "unit", id: "u1" })).toBe(
      "/dashboard/biblioteca/libro/lector/u/u1",
    );
    expect(readerChapterPath("libro", { kind: "chapter", id: "c1" })).toBe(
      "/dashboard/biblioteca/libro/lector/c/c1",
    );
    // No order anywhere in the canonical form — that is the whole point.
    expect(readerChapterPath("libro", { kind: "unit", id: "u1" })).not.toMatch(
      /\/lector\/\d+$/,
    );
  });

  it("reads a ref back only from a known discriminator", () => {
    expect(readerRefFromSegments("u", "x")).toEqual({ kind: "unit", id: "x" });
    expect(readerRefFromSegments("c", "x")).toEqual({
      kind: "chapter",
      id: "x",
    });
    // Never inferred from the id's shape.
    expect(readerRefFromSegments("z", "x")).toBeNull();
    expect(readerRefFromSegments("u", "")).toBeNull();
    expect(readerRefFromSegments("", "x")).toBeNull();
  });

  it("escapes what a path segment cannot carry raw", () => {
    expect(readerChapterPath("mi libro", { kind: "chapter", id: "a/b" })).toBe(
      "/dashboard/biblioteca/mi%20libro/lector/c/a%2Fb",
    );
  });
});

describe("resolving a chapter by its stable identity", () => {
  it("finds a legacy chapter scoped to its own book", async () => {
    const chapter = {
      findFirst: vi.fn().mockResolvedValue({ id: "c1", order: 2 }),
    };
    const target = await resolveChapterByRef(db({ chapter }), {
      bookId: "book-1",
      bookSlug: "libro",
      ref: { kind: "chapter", id: "c1" },
    });

    expect(target).toEqual({ kind: "chapter", chapterId: "c1", order: 2 });
    // The book is in the WHERE clause, so a foreign row is never in hand.
    expect(chapter.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c1", bookId: "book-1" } }),
    );
  });

  it("refuses a chapter belonging to another book", async () => {
    // Scoped query returns nothing — the id is real, just not this book's.
    const target = await resolveChapterByRef(db(), {
      bookId: "book-1",
      bookSlug: "libro",
      ref: { kind: "chapter", id: "chapter-of-another-book" },
    });
    expect(target).toBeNull();
  });

  it("refuses a unit that is not in the published revision", async () => {
    // `resolveNativeUnitById` finds nothing → a draft-only unit is unreachable,
    // and nothing about it is disclosed.
    const target = await resolveChapterByRef(db(), {
      bookId: "book-1",
      bookSlug: "libro",
      ref: { kind: "unit", id: "draft-only-unit" },
    });
    expect(target).toBeNull();
  });

  it("gives one answer for every refusal", async () => {
    const missing = await resolveChapterByRef(db(), {
      bookId: "book-1",
      bookSlug: "libro",
      ref: { kind: "chapter", id: "no-such-id" },
    });
    const foreign = await resolveChapterByRef(db(), {
      bookId: "book-1",
      bookSlug: "libro",
      ref: { kind: "unit", id: "no-such-unit" },
    });
    // Distinguishing them would tell a caller which guess was closer.
    expect(missing).toBeNull();
    expect(foreign).toBeNull();
  });
});

describe("resolving a position to an identity (for the redirect)", () => {
  it("is legacy-first, exactly like the reader", async () => {
    const chapter = { findFirst: vi.fn().mockResolvedValue({ id: "c9" }) };
    const ref = await resolveLocatorRef(db({ chapter }), {
      bookId: "book-1",
      bookSlug: "libro",
      order: 2,
    });
    expect(ref).toEqual({ kind: "chapter", id: "c9" });
  });

  it("writes nothing — no reading session is created to find a redirect", async () => {
    // The full reader read upserts a ReadingSession. Using it merely to discover
    // where to send somebody would record a chapter they only passed through.
    const readingSession = { upsert: vi.fn() };
    const chapter = { findFirst: vi.fn().mockResolvedValue({ id: "c9" }) };
    await resolveLocatorRef(db({ chapter, readingSession }) as never, {
      bookId: "book-1",
      bookSlug: "libro",
      order: 2,
    });
    expect(readingSession.upsert).not.toHaveBeenCalled();
  });

  it("is null when nothing occupies that position", async () => {
    expect(
      await resolveLocatorRef(db(), {
        bookId: "book-1",
        bookSlug: "libro",
        order: 99,
      }),
    ).toBeNull();
  });
});

describe("position is a locator, identity is not", () => {
  it("the same position resolves to whatever is there NOW", async () => {
    // Before: position 2 is chapter B.
    const before = await resolveLocatorRef(
      db({ chapter: { findFirst: vi.fn().mockResolvedValue({ id: "B" }) } }),
      { bookId: "book-1", bookSlug: "libro", order: 2 },
    );
    // After a structural change: position 2 is chapter A.
    const after = await resolveLocatorRef(
      db({ chapter: { findFirst: vi.fn().mockResolvedValue({ id: "A" }) } }),
      { bookId: "book-1", bookSlug: "libro", order: 2 },
    );

    expect(before).toEqual({ kind: "chapter", id: "B" });
    // The positional URL does not remember that B used to be there.
    expect(after).toEqual({ kind: "chapter", id: "A" });
    // And each canonical URL keeps naming its own chapter.
    expect(readerChapterPath("libro", before!)).not.toBe(
      readerChapterPath("libro", after!),
    );
  });
});
