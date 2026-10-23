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
      // `resolveBookTarget` y el respaldo legado pasaron a `findFirst` con el
      // filtro de publicación; el doble sigue a la consulta que hacen ahora.
      findFirst: async ({ where: { slug } }: { where: { slug: string } }) =>
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
    // An edition that EXISTS is never judged by the shape of its key. The
    // shape is consulted only when no row exists at all, which is the
    // never-backfilled case pinned in the describe below — so a key with no
    // row and no derivable slug has nothing left to resolve by.
    await expect(resolveUnitTarget(db(base), "no-suffix", "x")).rejects.toThrow(
      /EDITION_NOT_FOUND/,
    );
    await expect(
      resolveUnitTarget(db(base), "familias-ensambladas-1e", "bogus-unit"),
    ).rejects.toThrow(/UNIT_NOT_FOUND/);
  });
});

describe("resolveUnitTarget — a book Content Core never took over", () => {
  /**
   * No Edition row at all. The READ adapter still serves such a book: it
   * derives the slug from the key suffix and projects its ChapterBlocks. This
   * gate used to refuse first, so the reader never got to answer and the web
   * showed "contenido temporalmente no disponible" on a chapter the API was
   * willing to serve. Measured on `familias-ensambladas`, whose free first
   * chapter was unreachable while the envelope returned it with six blocks.
   */
  const sinEdicion = {
    contentUnit: { findFirst: async () => null },
    edition: { findFirst: async () => null, findUnique: async () => null },
    book: {
      // `resolveBookTarget` y el respaldo legado pasaron a `findFirst` con el
      // filtro de publicación; el doble sigue a la consulta que hacen ahora.
      findFirst: async ({ where: { slug } }: { where: { slug: string } }) =>
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

  it("its first chapter resolves as the preview, so a FREE reader is let in", async () => {
    const target = await resolveUnitTarget(
      db(sinEdicion),
      "familias-ensambladas-1e",
      unitKeyFromLegacyChapterId(PRO_CH1),
    );
    expect(target).toEqual({
      bookId: "book-pro",
      bookPlan: "PRO",
      isFreePreview: true,
    });
    expect(() =>
      assertContentAccess({
        userPlan: "FREE",
        bookPlan: target.bookPlan,
        isFreePreview: target.isFreePreview,
      }),
    ).not.toThrow();
  });

  it("and its paid chapters are still denied — the fallback resolves, it does not open", async () => {
    const target = await resolveUnitTarget(
      db(sinEdicion),
      "familias-ensambladas-1e",
      unitKeyFromLegacyChapterId(PRO_CH2),
    );
    expect(target.isFreePreview).toBe(false);
    expect(() =>
      assertContentAccess({
        userPlan: "FREE",
        bookPlan: target.bookPlan,
        isFreePreview: target.isFreePreview,
      }),
    ).toThrow(ForbiddenException);
  });

  it("fails closed when there is nothing to resolve by", async () => {
    // No row and no derivable slug.
    await expect(
      resolveUnitTarget(db(sinEdicion), "no-suffix", "x"),
    ).rejects.toThrow(/EDITION_NOT_FOUND/);
    // A derivable slug that names no book.
    await expect(
      resolveUnitTarget(db(sinEdicion), "libro-fantasma-1e", "x"),
    ).rejects.toThrow(/EDITION_NOT_FOUND/);
    // A real book, and a unit key that is not one of ITS chapters.
    await expect(
      resolveUnitTarget(
        db(sinEdicion),
        "familias-ensambladas-1e",
        unitKeyFromLegacyChapterId("chapter-of-another-book"),
      ),
    ).rejects.toThrow(/UNIT_NOT_FOUND/);
  });
});

describe("resolveUnitTarget — the derivation cannot be used to escape a native policy", () => {
  /**
   * `emociones-en-construccion` adopted by Content Core under an edition key
   * that is NOT its slug plus the suffix — which the code allows on purpose
   * ("an edition can be called anything at all"). Its native policy is
   * stricter than the legacy one: the book is FREE to browse but chapter 1 is
   * NOT a free preview, while the legacy derivation would say it is.
   */
  const adoptadaConOtraClave = {
    contentUnit: { findFirst: async () => ({ isFreePreview: false }) },
    edition: {
      findFirst: async ({ where }: { where: { slug?: string } }) =>
        where.slug === "emociones-en-construccion" ? { id: "ed-nativa" } : null,
      findUnique: async ({
        where: { editionKey },
      }: {
        where: { editionKey: string };
      }) =>
        editionKey === "eec-2026"
          ? {
              id: "ed-nativa",
              slug: "emociones-en-construccion",
              accessPlan: "PRO",
            }
          : null,
    },
    book: {
      // `isPublished` viaja desde que la rama nativa también la comprueba:
      // sin ella el doble devolvería `undefined` y la puerta, que falla
      // cerrada a propósito, negaría por una laguna del doble.
      findUnique: async () => ({
        id: "book-eec",
        plan: "FREE",
        isPublished: true,
      }),
    },
    chapter: {
      findMany: async () => [
        { id: PRO_CH1, order: 1 },
        { id: PRO_CH2, order: 2 },
      ],
    },
  };

  it("by its own key, the native policy decides", async () => {
    const target = await resolveUnitTarget(
      db(adoptadaConOtraClave),
      "eec-2026",
      unitKeyFromLegacyChapterId(PRO_CH1),
    );
    expect(target).toEqual({
      bookId: null,
      bookPlan: "PRO",
      isFreePreview: false,
    });
  });

  it("by an invented `<slug>-1e`, it does NOT fall back to the looser legacy policy", async () => {
    // Without the guard this answered `{bookPlan: "FREE", isFreePreview: true}`
    // from `Book.plan` and `order === 1`, and the read adapter derives the same
    // way — so the content would have followed the laxer verdict.
    await expect(
      resolveUnitTarget(
        db(adoptadaConOtraClave),
        "emociones-en-construccion-1e",
        unitKeyFromLegacyChapterId(PRO_CH1),
      ),
    ).rejects.toThrow(/EDITION_NOT_FOUND/);
  });

  it("a native edition that does not hold the unit refuses instead of reaching legacy", async () => {
    const sinEsaUnidad = {
      ...adoptadaConOtraClave,
      contentUnit: { findFirst: async () => null },
    };
    await expect(
      resolveUnitTarget(
        db(sinEsaUnidad),
        "eec-2026",
        unitKeyFromLegacyChapterId(PRO_CH2),
      ),
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
