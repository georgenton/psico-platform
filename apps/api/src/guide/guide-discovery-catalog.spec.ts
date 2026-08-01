import { describe, expect, it } from "vitest";
import {
  GuideDiscoveryCatalog,
  GuideDiscoveryCatalogError,
  normalizeBookSlug,
  normalizeChapterOrder,
  PRODUCTION_GUIDE_DISCOVERY_ENTRIES,
  productionGuideDiscoveryCatalog,
} from "./guide-discovery-catalog";
import { productionGuideRegistry } from "./guide-catalog";

/**
 * The discovery catalog decides which guided reading a reading context is
 * offered. It is server-owned on purpose, so these tests pin the exact map and
 * every way a malformed entry must refuse to load.
 */

const EEC = { guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 1 };
const PQP = { guideKey: "pqp-c1-contacto-sostenido", guideVersion: 1 };

describe("normalizers", () => {
  it("accepts a canonical slug and lowercases/trims", () => {
    expect(normalizeBookSlug("  Parejas-Que-Perduran ")).toBe(
      "parejas-que-perduran",
    );
  });

  it.each([" ", "", "Con Espacios", "trailing-", "-leading", 7, null])(
    "rejects the non-slug %p",
    (v) => {
      expect(normalizeBookSlug(v)).toBeNull();
    },
  );

  it("accepts positive integers, including numeric strings", () => {
    expect(normalizeChapterOrder(2)).toBe(2);
    expect(normalizeChapterOrder("2")).toBe(2);
  });

  it.each([0, -1, 1.5, "abc", "", null, undefined, NaN])(
    "rejects the non-order %p",
    (v) => {
      expect(normalizeChapterOrder(v)).toBeNull();
    },
  );
});

describe("production discovery catalog", () => {
  it("maps exactly the two approved contexts", () => {
    expect(PRODUCTION_GUIDE_DISCOVERY_ENTRIES).toHaveLength(2);
    expect(productionGuideDiscoveryCatalog.size).toBe(2);
  });

  it("resolves Emociones chapter 1 to the EEC pin", () => {
    expect(
      productionGuideDiscoveryCatalog.getExactContext(
        "emociones-en-construccion",
        1,
      ),
    ).toEqual(EEC);
  });

  it("resolves Parejas PLATFORM order 2 to the PQP pin", () => {
    expect(
      productionGuideDiscoveryCatalog.getExactContext(
        "parejas-que-perduran",
        2,
      ),
    ).toEqual(PQP);
  });

  it("offers nothing for the Parejas preface (order 1)", () => {
    expect(
      productionGuideDiscoveryCatalog.getExactContext(
        "parejas-que-perduran",
        1,
      ),
    ).toBeNull();
  });

  it.each([
    ["a later Parejas chapter", "parejas-que-perduran", 3],
    ["a later Emociones chapter", "emociones-en-construccion", 2],
    ["an unknown book", "libro-inexistente", 1],
  ])("offers nothing for %s", (_why, slug, order) => {
    expect(
      productionGuideDiscoveryCatalog.getExactContext(slug, order),
    ).toBeNull();
  });

  it("returns null rather than throwing on malformed input", () => {
    expect(
      productionGuideDiscoveryCatalog.getExactContext("Con Espacios", 1),
    ).toBeNull();
    expect(
      productionGuideDiscoveryCatalog.getExactContext(
        "parejas-que-perduran",
        0,
      ),
    ).toBeNull();
  });

  it("never falls back to EEC for an unlisted context", () => {
    for (const order of [2, 3, 4, 9]) {
      expect(
        productionGuideDiscoveryCatalog.getExactContext(
          "emociones-en-construccion",
          order,
        ),
      ).toBeNull();
    }
  });
});

describe("catalog validation refuses to load", () => {
  const reg = productionGuideRegistry;

  it("a duplicated context", () => {
    expect(
      () =>
        new GuideDiscoveryCatalog(
          [
            {
              bookSlug: "emociones-en-construccion",
              chapterOrder: 1,
              pin: EEC,
            },
            {
              bookSlug: "emociones-en-construccion",
              chapterOrder: 1,
              pin: PQP,
            },
          ],
          reg,
        ),
    ).toThrow(/GUIDE_DISCOVERY_CATALOG_DUPLICATE_CONTEXT/);
  });

  it("a pin naming a definition that does not exist", () => {
    expect(
      () =>
        new GuideDiscoveryCatalog(
          [
            {
              bookSlug: "otro-libro",
              chapterOrder: 1,
              pin: { guideKey: "no-existe", guideVersion: 1 },
            },
          ],
          reg,
        ),
    ).toThrow(/GUIDE_DISCOVERY_CATALOG_UNKNOWN_DEFINITION/);
  });

  it("the same pin claimed by two contradictory contexts", () => {
    expect(
      () =>
        new GuideDiscoveryCatalog(
          [
            {
              bookSlug: "emociones-en-construccion",
              chapterOrder: 1,
              pin: EEC,
            },
            { bookSlug: "parejas-que-perduran", chapterOrder: 2, pin: EEC },
          ],
          reg,
        ),
    ).toThrow(/GUIDE_DISCOVERY_CATALOG_CONTRADICTORY_PIN/);
  });

  it.each([
    ["a bad slug", { bookSlug: "Con Espacios", chapterOrder: 1, pin: EEC }],
    ["a zero order", { bookSlug: "un-libro", chapterOrder: 0, pin: EEC }],
    [
      "a fractional order",
      { bookSlug: "un-libro", chapterOrder: 1.5, pin: EEC },
    ],
    [
      "a zero version",
      {
        bookSlug: "un-libro",
        chapterOrder: 1,
        pin: { guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 0 },
      },
    ],
  ])("%s", (_why, entry) => {
    expect(() => new GuideDiscoveryCatalog([entry as never], reg)).toThrow(
      GuideDiscoveryCatalogError,
    );
  });

  it("keeps errors value-free — the message is exactly the code", () => {
    try {
      new GuideDiscoveryCatalog(
        [{ bookSlug: "Con Espacios", chapterOrder: 1, pin: EEC }],
        reg,
      );
    } catch (e) {
      const err = e as GuideDiscoveryCatalogError;
      expect(err.message).toBe(err.code);
      expect(err.message).not.toContain("Con Espacios");
    }
    expect.assertions(2);
  });
});
