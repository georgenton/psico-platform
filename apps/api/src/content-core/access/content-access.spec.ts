import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { unitKeyFromLegacyChapterId } from "../lib/block-key";
import {
  assertContentAccess,
  resolveUnitTarget,
  resolveWriteTarget,
} from "./content-access";

/**
 * CC-6E — the content access policy (pure). The end-to-end behaviour over real
 * data lives in content-access.pg-spec.ts; these fast tests pin the ONE gate
 * condition and that Content Core keys resolve to the same book/chapter
 * regardless of how the content would be served (dual-source parity).
 */

describe("assertContentAccess — the single FREE/PRO gate", () => {
  it("FREE user, PRO book, chapter 1 → allowed (free preview)", () => {
    expect(() =>
      assertContentAccess({
        userPlan: "FREE",
        bookPlan: "PRO",
        chapterOrder: 1,
      }),
    ).not.toThrow();
  });

  it("FREE user, PRO book, chapter 2 → PRO_REQUIRED (403)", () => {
    expect(() =>
      assertContentAccess({
        userPlan: "FREE",
        bookPlan: "PRO",
        chapterOrder: 2,
      }),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertContentAccess({
        userPlan: "FREE",
        bookPlan: "PRO",
        chapterOrder: 2,
      }),
    ).toThrow(/PRO_REQUIRED/);
  });

  it("PRO user, PRO book, chapter 2 → allowed", () => {
    expect(() =>
      assertContentAccess({
        userPlan: "PRO",
        bookPlan: "PRO",
        chapterOrder: 2,
      }),
    ).not.toThrow();
  });

  it("FREE user, FREE book, chapter 2 → allowed", () => {
    expect(() =>
      assertContentAccess({
        userPlan: "FREE",
        bookPlan: "FREE",
        chapterOrder: 2,
      }),
    ).not.toThrow();
  });
});

// A tiny stub of the Prisma surface the resolvers need.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(parts: any) {
  return parts;
}

const PRO_CH2 = "chap-pro-2-id";
const PRO_CH1 = "chap-pro-1-id";

describe("resolveUnitTarget — same keys → same decision (dual-source parity)", () => {
  const base = {
    book: {
      findUnique: async ({ where: { slug } }: { where: { slug: string } }) =>
        slug === "familias-ensambladas"
          ? { id: "book-pro", plan: "PRO" }
          : null,
    },
    chapter: {
      findMany: async () => [
        { id: PRO_CH1, order: 1 },
        { id: PRO_CH2, order: 2 },
      ],
    },
  };

  it("resolves an edition/unit to its book plan + chapter order", async () => {
    const unitKey = unitKeyFromLegacyChapterId(PRO_CH2);
    const target = await resolveUnitTarget(
      db(base),
      "familias-ensambladas-1e",
      unitKey,
    );
    expect(target).toEqual({
      bookId: "book-pro",
      bookPlan: "PRO",
      chapterOrder: 2,
    });
  });

  it("manifest keys can't bypass: a FREE user with the unitKey of a PRO chapter is still denied", async () => {
    const unitKey = unitKeyFromLegacyChapterId(PRO_CH2);
    const target = await resolveUnitTarget(
      db(base),
      "familias-ensambladas-1e",
      unitKey,
    );
    expect(() =>
      assertContentAccess({
        userPlan: "FREE",
        bookPlan: target.bookPlan,
        chapterOrder: target.chapterOrder,
      }),
    ).toThrow(ForbiddenException);
  });

  it("EDITION_NOT_FOUND / UNIT_NOT_FOUND fail closed", async () => {
    await expect(
      resolveUnitTarget(db(base), "unknown-book-1e", "x"),
    ).rejects.toThrow(/EDITION_NOT_FOUND/);
    await expect(resolveUnitTarget(db(base), "no-suffix", "x")).rejects.toThrow(
      /EDITION_NOT_FOUND/,
    );
    await expect(
      resolveUnitTarget(db(base), "familias-ensambladas-1e", "bogus-unit"),
    ).rejects.toThrow(/UNIT_NOT_FOUND/);
  });
});

describe("resolveWriteTarget — legacy blockId and content-core blockKey agree", () => {
  const chapterRow = {
    chapter: { order: 2, bookId: "book-pro", book: { plan: "PRO" } },
  };

  it("legacy blockId → the block's chapter", async () => {
    const target = await resolveWriteTarget(
      db({ chapterBlock: { findUnique: async () => chapterRow } }),
      { blockId: "legacy-b" },
    );
    expect(target).toEqual({
      bookId: "book-pro",
      bookPlan: "PRO",
      chapterOrder: 2,
    });
  });

  it("content-core blockKey (backfilled) resolves via its legacy binding → same target", async () => {
    const target = await resolveWriteTarget(
      db({
        contentBlock: {
          findUnique: async () => ({ legacyBlockId: "legacy-b", unitId: "u" }),
        },
        chapterBlock: { findUnique: async () => chapterRow },
      }),
      { blockKey: "bk-1" },
    );
    expect(target).toEqual({
      bookId: "book-pro",
      bookPlan: "PRO",
      chapterOrder: 2,
    });
  });

  it("no anchor at all → BadRequest (never a permissive default)", async () => {
    await expect(resolveWriteTarget(db({}), {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
