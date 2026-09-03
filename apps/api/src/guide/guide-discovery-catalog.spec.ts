import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GuideDiscoveryCatalog,
  GuideDiscoveryCatalogError,
  normalizeBookSlug,
  normalizeChapterOrder,
  PRODUCTION_GUIDE_DISCOVERY_ENTRIES,
  PRODUCTION_LEGACY_GUIDE_PINS,
  productionGuideDiscoveryCatalog,
  type GuideDiscoveryEntry,
  type GuideLegacyPinEntry,
} from "./guide-discovery-catalog";
import { productionGuideRegistry } from "./guide-catalog";

/**
 * The route ships behind `EEC_C01_GUIDED_SUITE_V1`, default OFF. These suites
 * are about what the catalog offers WHEN it is on; the switch itself has its
 * own tests in `guide-discovery-contracts.spec.ts`.
 */
beforeAll(() => {
  process.env.EEC_C01_GUIDED_SUITE_V1 = "on";
});
afterAll(() => {
  delete process.env.EEC_C01_GUIDED_SUITE_V1;
});

/**
 * The discovery catalog decides which guided readings a reading context is
 * offered, and in what order. It is server-owned on purpose, so these tests pin
 * the exact map and every way a malformed entry must refuse to load.
 *
 * Each negative mutates ONE field of a complete, valid entry. Building them
 * from `{}` would let a test keep passing after the shape grew, for the wrong
 * reason: the entry would be rejected as malformed before ever reaching the
 * rule the test claims to be about.
 */

const PILOT = { guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 1 };
const MG01 = { guideKey: "eec-c1-teorias-como-lentes", guideVersion: 1 };
const MG05 = {
  guideKey: "eec-c1-construida-no-significa-falsa",
  guideVersion: 1,
};
const PQP = { guideKey: "pqp-c1-contacto-sostenido", guideVersion: 1 };

/** A complete, valid entry. Negatives override exactly one field of this. */
const entry = (
  over: Partial<GuideDiscoveryEntry> = {},
): GuideDiscoveryEntry => ({
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  order: 1,
  pin: MG01,
  title: "Las teorías son lentes, no la escena",
  description:
    "Revisa una creencia cotidiana separando observación de supuesto.",
  estimatedMinutes: "7–9",
  ...over,
});

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
  it("maps two contexts and offers six guided readings", () => {
    expect(PRODUCTION_GUIDE_DISCOVERY_ENTRIES).toHaveLength(6);
    expect(productionGuideDiscoveryCatalog.size).toBe(2);
    expect(productionGuideDiscoveryCatalog.entryCount).toBe(6);
  });

  it("offers EEC chapter 1 the five microguides, in route order", () => {
    const route = productionGuideDiscoveryCatalog.listContext(
      "emociones-en-construccion",
      1,
    );
    expect(route.map((i) => i.order)).toEqual([1, 2, 3, 4, 5]);
    expect(route.map((i) => i.pin.guideKey)).toEqual([
      "eec-c1-teorias-como-lentes",
      "eec-c1-rostro-como-pista",
      "eec-c1-alarma-antes-del-relato",
      "eec-c1-emocion-informa-no-manda",
      "eec-c1-construida-no-significa-falsa",
    ]);
    // Every card can render before any session exists.
    for (const item of route) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
      expect(item.estimatedMinutes).toMatch(/^\d+–\d+$/);
      expect(item.pin.guideVersion).toBe(1);
    }
  });

  it("no longer offers the V1 pilot to a new reader", () => {
    const route = productionGuideDiscoveryCatalog.listContext(
      "emociones-en-construccion",
      1,
    );
    expect(route.some((i) => i.pin.guideKey === PILOT.guideKey)).toBe(false);
  });

  it("keeps the pilot definition registered so a pinned session still resolves", () => {
    // Retiring it from discovery is not deleting it. A session that started on
    // the pilot resolves against the registry, never against this catalog.
    expect(() =>
      productionGuideRegistry.getExact(PILOT.guideKey, PILOT.guideVersion),
    ).not.toThrow();
  });

  it("V1 callers retain the historical pin while V2 discovery exposes the new route", () => {
    // The two contracts, side by side. Answering the old binary with the
    // route's first step is signature compatibility and nothing more: measured,
    // it made V1 reserve and publish MG01 under the pilot's lineage and the
    // reservation refused it (EXPERIENCE_LINEAGE_ALREADY_BOUND, 5/7 failures).
    expect(
      productionGuideDiscoveryCatalog.getExactContext(
        "emociones-en-construccion",
        1,
      ),
    ).toEqual(PILOT);
    expect(
      productionGuideDiscoveryCatalog
        .listContext("emociones-en-construccion", 1)
        .map((i) => i.pin.guideKey),
    ).not.toContain(PILOT.guideKey);
  });

  it("answers the V1 adapter for Parejas with its existing sole pin", () => {
    expect(
      productionGuideDiscoveryCatalog.getExactContext(
        "parejas-que-perduran",
        2,
      ),
    ).toEqual(PQP);
  });

  it("declares a legacy pin only for the contexts the old binary knew", () => {
    expect(PRODUCTION_LEGACY_GUIDE_PINS).toHaveLength(2);
    expect(productionGuideDiscoveryCatalog.legacySize).toBe(2);
    // A context with a route but no declared legacy pin answers null, which is
    // the truthful answer for a chapter V1 never knew.
    expect(
      new GuideDiscoveryCatalog(
        [entry()],
        [],
        productionGuideRegistry,
      ).getExactContext("emociones-en-construccion", 1),
    ).toBeNull();
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
    expect(productionGuideDiscoveryCatalog.listContext(slug, order)).toEqual(
      [],
    );
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

  it("never falls back to a guide for an unlisted context", () => {
    for (const order of [2, 3, 4, 9]) {
      expect(
        productionGuideDiscoveryCatalog.getExactContext(
          "emociones-en-construccion",
          order,
        ),
      ).toBeNull();
    }
  });

  it("answers whether an exact pin is offered here", () => {
    const c = productionGuideDiscoveryCatalog;
    expect(c.offersPin("emociones-en-construccion", 1, MG05)).toBe(true);
    // Retired from discovery: a NEW session may not start it here.
    expect(c.offersPin("emociones-en-construccion", 1, PILOT)).toBe(false);
    // Right key, wrong version.
    expect(
      c.offersPin("emociones-en-construccion", 1, {
        guideKey: MG05.guideKey,
        guideVersion: 2,
      }),
    ).toBe(false);
  });
});

describe("catalog validation refuses to load", () => {
  const reg = productionGuideRegistry;

  it("the same pin twice in one context", () => {
    expect(
      () =>
        new GuideDiscoveryCatalog(
          [entry({ order: 1 }), entry({ order: 2 })],
          [],
          reg,
        ),
    ).toThrow(/GUIDE_DISCOVERY_CATALOG_DUPLICATE_CONTEXT/);
  });

  it("two guided readings claiming the same slot", () => {
    expect(
      () =>
        new GuideDiscoveryCatalog(
          [entry({ order: 1 }), entry({ order: 1, pin: MG05 })],
          [],
          reg,
        ),
    ).toThrow(/GUIDE_DISCOVERY_CATALOG_DUPLICATE_ORDER/);
  });

  it("a route with a hole in it", () => {
    expect(
      () =>
        new GuideDiscoveryCatalog(
          [entry({ order: 1 }), entry({ order: 3, pin: MG05 })],
          [],
          reg,
        ),
    ).toThrow(/GUIDE_DISCOVERY_CATALOG_NON_CONTIGUOUS_ORDER/);
  });

  it("a route that does not start at 1", () => {
    expect(
      () => new GuideDiscoveryCatalog([entry({ order: 2 })], [], reg),
    ).toThrow(/GUIDE_DISCOVERY_CATALOG_NON_CONTIGUOUS_ORDER/);
  });

  it("a pin naming a definition that does not exist", () => {
    expect(
      () =>
        new GuideDiscoveryCatalog(
          [entry({ pin: { guideKey: "no-existe", guideVersion: 1 } })],
          [],
          reg,
        ),
    ).toThrow(/GUIDE_DISCOVERY_CATALOG_UNKNOWN_DEFINITION/);
  });

  it("the same pin claimed by two contradictory contexts", () => {
    expect(
      () =>
        new GuideDiscoveryCatalog(
          [
            entry(),
            entry({ bookSlug: "parejas-que-perduran", chapterOrder: 2 }),
          ],
          [],
          reg,
        ),
    ).toThrow(/GUIDE_DISCOVERY_CATALOG_CONTRADICTORY_PIN/);
  });

  it.each([
    ["a bad slug", { bookSlug: "Con Espacios" }],
    ["a zero chapter order", { chapterOrder: 0 }],
    ["a fractional chapter order", { chapterOrder: 1.5 }],
    ["a zero route order", { order: 0 }],
    ["a zero version", { pin: { guideKey: MG01.guideKey, guideVersion: 0 } }],
    ["an empty title", { title: "  " }],
    ["an empty description", { description: "" }],
    ["a missing duration", { estimatedMinutes: "" }],
  ])("%s", (_why, over) => {
    expect(
      () =>
        new GuideDiscoveryCatalog(
          [entry(over as Partial<GuideDiscoveryEntry>)],
          [],
          reg,
        ),
    ).toThrow(GuideDiscoveryCatalogError);
  });

  it("a legacy pin naming a definition that does not exist", () => {
    const legacy: GuideLegacyPinEntry = {
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
      pin: { guideKey: "no-existe", guideVersion: 1 },
    };
    expect(() => new GuideDiscoveryCatalog([entry()], [legacy], reg)).toThrow(
      /GUIDE_DISCOVERY_CATALOG_LEGACY_UNKNOWN_DEFINITION/,
    );
  });

  it("two legacy pins for one context", () => {
    const one: GuideLegacyPinEntry = {
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
      pin: PILOT,
    };
    expect(
      () =>
        new GuideDiscoveryCatalog([entry()], [one, { ...one, pin: MG05 }], reg),
    ).toThrow(/GUIDE_DISCOVERY_CATALOG_LEGACY_DUPLICATE_CONTEXT/);
  });

  it.each([
    ["a bad slug", { bookSlug: "Con Espacios" }],
    ["a zero chapter order", { chapterOrder: 0 }],
    ["a zero version", { pin: { guideKey: PILOT.guideKey, guideVersion: 0 } }],
  ])("a malformed legacy entry: %s", (_why, over) => {
    const legacy = {
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
      pin: PILOT,
      ...over,
    } as GuideLegacyPinEntry;
    expect(() => new GuideDiscoveryCatalog([entry()], [legacy], reg)).toThrow(
      /GUIDE_DISCOVERY_CATALOG_LEGACY_INVALID/,
    );
  });

  it("keeps errors value-free — the message is exactly the code", () => {
    try {
      new GuideDiscoveryCatalog([entry({ bookSlug: "Con Espacios" })], [], reg);
    } catch (e) {
      const err = e as GuideDiscoveryCatalogError;
      expect(err.message).toBe(err.code);
      expect(err.message).not.toContain("Con Espacios");
    }
    expect.assertions(2);
  });
});
