import { describe, expect, it } from "vitest";
import {
  GUIDE_READER_ANCHOR,
  GuideAnchorRegistry,
  PAREJAS_READER_ANCHOR,
  anchorAppliesTo,
  guideAnchorRegistry,
  resolveGuideAnchor,
  type AnchorCandidateBlock,
} from "./guide-anchor";
import { EEC_PIN, PQP_PIN } from "./guide-test-fixtures";

/**
 * GR-4 — one anchor per pin, and no borrowing.
 *
 * The registry is what keeps a second book from being handed the first book's
 * passage. Every case below is a refusal the reader depends on: a `null` here
 * becomes «no guide on this screen», which is the honest outcome. The failure
 * this prevents is quieter and much worse — a Parejas reader scrolled to an
 * Emociones paragraph while the panel narrates a chapter they are not in.
 *
 * The chapter prose is NOT copied here. The fixtures build blocks out of the
 * locators themselves, so this file cannot drift from the catalog and cannot
 * become a second place the manuscript lives.
 */

function block(
  over: Partial<AnchorCandidateBlock> & { content: string },
): AnchorCandidateBlock {
  return {
    id: "legacy-x",
    kind: "PARAGRAPH",
    blockKey: "11111111-2222-3333-4444-555555555555",
    blockVersionId: "bv-x",
    ...over,
  };
}

/** A chapter shaped like the one this locator points into. */
function chapterFor(
  locator: typeof GUIDE_READER_ANCHOR,
): AnchorCandidateBlock[] {
  return [
    block({ id: "h0", kind: "HEADING", content: "Otra sección" }),
    block({ id: "p0", content: "Un párrafo que no es el anclado." }),
    block({ id: "h1", kind: "HEADING", content: locator.sourceHeading }),
    block({ id: "p1", content: "Un párrafo antes del anclado." }),
    block({ id: "p2", content: `Algo previo. ${locator.passageLastSentence}` }),
    block({ id: "h2", kind: "HEADING", content: "La sección siguiente" }),
    block({ id: "p3", content: locator.passageLastSentence }),
  ];
}

describe("guideAnchorRegistry.getExact", () => {
  it("returns each guide's OWN locator", () => {
    expect(guideAnchorRegistry.getExact(EEC_PIN)).toBe(GUIDE_READER_ANCHOR);
    expect(guideAnchorRegistry.getExact(PQP_PIN)).toBe(PAREJAS_READER_ANCHOR);
  });

  it("NO_ANCHOR_FALLBACK — an unknown guide gets null, not the first one", () => {
    expect(
      guideAnchorRegistry.getExact({
        guideKey: "guia-inventada",
        guideVersion: 1,
      }),
    ).toBeNull();
  });

  it("NO_LATEST_VERSION — a version this build does not know is null", () => {
    expect(
      guideAnchorRegistry.getExact({ ...EEC_PIN, guideVersion: 2 }),
    ).toBeNull();
    expect(
      guideAnchorRegistry.getExact({ ...PQP_PIN, guideVersion: 99 }),
    ).toBeNull();
  });

  it.each([
    ["an empty key", { guideKey: "", guideVersion: 1 }],
    ["a shouty key", { guideKey: "EEC-C1", guideVersion: 1 }],
    ["version zero", { guideKey: EEC_PIN.guideKey, guideVersion: 0 }],
    ["a fractional version", { guideKey: EEC_PIN.guideKey, guideVersion: 1.5 }],
    ["a negative version", { guideKey: EEC_PIN.guideKey, guideVersion: -1 }],
  ])("rejects %s without throwing", (_why, pin) => {
    expect(guideAnchorRegistry.getExact(pin)).toBeNull();
  });

  it("NO_BLOCK_KEY_IN_CATALOG — identity is derived per environment (CC-1)", () => {
    // A literal key would be true in one database and a lie in the next.
    const serialised = JSON.stringify([
      GUIDE_READER_ANCHOR,
      PAREJAS_READER_ANCHOR,
    ]);
    expect(serialised).not.toContain("blockKey");
    expect(serialised).not.toContain("blockVersionId");
    expect(serialised).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});

describe("GuideAnchorRegistry construction", () => {
  it("refuses a duplicate pin", () => {
    expect(
      () => new GuideAnchorRegistry([GUIDE_READER_ANCHOR, GUIDE_READER_ANCHOR]),
    ).toThrow(/duplicate/i);
  });

  it("refuses a malformed pin", () => {
    expect(
      () =>
        new GuideAnchorRegistry([{ ...GUIDE_READER_ANCHOR, guideVersion: 0 }]),
    ).toThrow(/malformed/i);
  });

  it("refuses an empty locator field", () => {
    expect(
      () =>
        new GuideAnchorRegistry([
          { ...GUIDE_READER_ANCHOR, passageLastSentence: "   " },
        ]),
    ).toThrow(/empty/i);
  });
});

describe("the Parejas locator", () => {
  it("points at the book's chapter 1, which is PLATFORM order 2", () => {
    expect(PAREJAS_READER_ANCHOR.bookSlug).toBe("parejas-que-perduran");
    expect(PAREJAS_READER_ANCHOR.chapterOrder).toBe(2);
  });

  it("is NOT the practice heading — that one belongs to the exercise", () => {
    // `Ejercicio 3: El Mapa de las Miradas` is the source heading of the
    // CATALOG_PRACTICE target. Anchoring the guide there would scroll the
    // reader to a numbered instruction instead of the idea it explains.
    expect(PAREJAS_READER_ANCHOR.sourceHeading).not.toContain("Ejercicio");
    expect(PAREJAS_READER_ANCHOR.passageLastSentence).not.toContain(
      "Ejercicio",
    );
  });

  it("resolves to exactly one block, bounded by the next heading", () => {
    const res = resolveGuideAnchor(
      chapterFor(PAREJAS_READER_ANCHOR),
      PAREJAS_READER_ANCHOR,
    );
    expect(res.status).toBe("RESOLVED");
    if (res.status !== "RESOLVED") return;
    // `p3` carries the same sentence but lives in the NEXT section — the bound
    // is what keeps the anchor from becoming AMBIGUOUS.
    expect(res.renderBlockId).toBe("p2");
  });

  it("does not resolve against the OTHER book's chapter", () => {
    // The Emociones chapter has neither the heading nor the sentence.
    expect(
      resolveGuideAnchor(chapterFor(GUIDE_READER_ANCHOR), PAREJAS_READER_ANCHOR)
        .status,
    ).toBe("UNRESOLVED");
  });

  it("applies only to its own book and chapter", () => {
    expect(
      anchorAppliesTo("parejas-que-perduran", 2, PAREJAS_READER_ANCHOR),
    ).toBe(true);
    // The preface (order 1) and any later chapter are not this anchor's screen.
    expect(
      anchorAppliesTo("parejas-que-perduran", 1, PAREJAS_READER_ANCHOR),
    ).toBe(false);
    expect(
      anchorAppliesTo("parejas-que-perduran", 3, PAREJAS_READER_ANCHOR),
    ).toBe(false);
    expect(
      anchorAppliesTo("emociones-en-construccion", 2, PAREJAS_READER_ANCHOR),
    ).toBe(false);
  });
});
