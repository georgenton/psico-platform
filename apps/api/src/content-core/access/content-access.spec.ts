import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { unitKeyFromLegacyChapterId } from "../lib/block-key";
import {
  assertContentAccess,
  isFreePreviewByPosition,
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
  it("FREE user, PRO book, the designated preview → allowed", () => {
    expect(() =>
      assertContentAccess({
        userPlan: "FREE",
        bookPlan: "PRO",
        isFreePreview: true,
      }),
    ).not.toThrow();
  });

  it("FREE user, PRO book, a gated unit → PRO_REQUIRED (403)", () => {
    const gated = {
      userPlan: "FREE",
      bookPlan: "PRO",
      isFreePreview: false,
    };
    expect(() => assertContentAccess(gated)).toThrow(ForbiddenException);
    expect(() => assertContentAccess(gated)).toThrow(/PRO_REQUIRED/);
  });

  it("PRO user, PRO book, a gated unit → allowed", () => {
    expect(() =>
      assertContentAccess({
        userPlan: "PRO",
        bookPlan: "PRO",
        isFreePreview: false,
      }),
    ).not.toThrow();
  });

  it("FREE user, FREE book, a gated unit → allowed", () => {
    expect(() =>
      assertContentAccess({
        userPlan: "FREE",
        bookPlan: "FREE",
        isFreePreview: false,
      }),
    ).not.toThrow();
  });
});

describe("isFreePreviewByPosition — the one legacy derivation", () => {
  it("reads chapter 1 as the preview and nothing else", () => {
    // #580: legacy content has only an order, so this is where an order becomes
    // a designation. Exactly one copy of it exists, and this is it.
    expect(isFreePreviewByPosition(1)).toBe(true);
    expect(isFreePreviewByPosition(2)).toBe(false);
    expect(isFreePreviewByPosition(7)).toBe(false);
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
    // These editions have adopted nothing, so the resolver finds no unit and
    // the positional fallback still answers — which is the path these cases
    // pin. An edition WITH units keeps its own `isFreePreview` regardless of
    // `accessPlan`; that is covered by the entitlement drift proof.
    contentUnit: { findFirst: async () => null },
    // #580 — the resolver finds the edition by key first. `accessPlan: null`
    // puts it on the legacy fallback, which is the path these cases pin.
    edition: {
      // No adoption in these fixtures, so a legacy block still answers from
      // its position — the compatibility case these cases exist to pin.
      findFirst: async () => null,
      findUnique: async ({
        where: { editionKey },
      }: {
        where: { editionKey: string };
      }) =>
        editionKey === "familias-ensambladas-1e"
          ? { id: "ed-pro", slug: "familias-ensambladas", accessPlan: null }
          : editionKey === "unknown-book-1e"
            ? { id: "ed-x", slug: "unknown-book", accessPlan: null }
            : null,
    },
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
      // Chapter 2 is not the preview — same decision as before #580, now said
      // in the vocabulary that survives reordering.
      isFreePreview: false,
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
        isFreePreview: target.isFreePreview,
      }),
    ).toThrow(ForbiddenException);
  });

  it("EDITION_NOT_FOUND / UNIT_NOT_FOUND fail closed", async () => {
    await expect(
      resolveUnitTarget(db(base), "unknown-book-1e", "x"),
    ).rejects.toThrow(/EDITION_NOT_FOUND/);
    // A key with no `-1e` is no longer rejected for its SHAPE — it is rejected
    // because no edition has that key. That distinction is the issue.
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
    chapter: {
      id: "ch-pro-2",
      order: 2,
      bookId: "book-pro",
      book: { plan: "PRO", slug: "familias-ensambladas" },
    },
  };

  it("legacy blockId → the block's chapter", async () => {
    const target = await resolveWriteTarget(
      db({
        chapterBlock: { findUnique: async () => chapterRow },
        // Nothing adopted, so the block still answers from its position.
        edition: { findFirst: async () => null },
      }),
      { blockId: "legacy-b" },
    );
    expect(target).toEqual({
      bookId: "book-pro",
      bookPlan: "PRO",
      // Chapter 2 is not the preview — same decision as before #580, now said
      // in the vocabulary that survives reordering.
      isFreePreview: false,
    });
  });

  it("content-core blockKey (backfilled) resolves via its legacy binding → same target", async () => {
    const target = await resolveWriteTarget(
      db({
        contentBlock: {
          findUnique: async () => ({ legacyBlockId: "legacy-b", unitId: "u" }),
        },
        chapterBlock: { findUnique: async () => chapterRow },
        edition: { findFirst: async () => null },
      }),
      { blockKey: "bk-1" },
    );
    expect(target).toEqual({
      bookId: "book-pro",
      bookPlan: "PRO",
      // Chapter 2 is not the preview — same decision as before #580, now said
      // in the vocabulary that survives reordering.
      isFreePreview: false,
    });
  });

  it("no anchor at all → BadRequest (never a permissive default)", async () => {
    await expect(resolveWriteTarget(db({}), {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
