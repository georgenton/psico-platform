import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  GUIDE_READER_ANCHOR,
  anchorAppliesTo,
  resolveGuideAnchor,
  type AnchorCandidateBlock,
} from "./guide-anchor";

/**
 * GR-3 — the anchor resolver.
 *
 * Every case here is about NOT guessing. A guide that scrolls to the wrong
 * paragraph is worse than one that admits it cannot find it.
 */

const SENTENCE = GUIDE_READER_ANCHOR.passageLastSentence;
const HEADING = GUIDE_READER_ANCHOR.sourceHeading;

function block(
  over: Partial<AnchorCandidateBlock> & { content: string },
): AnchorCandidateBlock {
  return {
    id: "legacy-1",
    kind: "PARAGRAPH",
    blockKey: "11111111-2222-3333-4444-555555555555",
    blockVersionId: "ver-1",
    ...over,
  };
}

const CHAPTER: AnchorCandidateBlock[] = [
  block({ id: "h0", kind: "HEADING", content: "Otra sección" }),
  block({ id: "p0", content: "Un párrafo de otra sección." }),
  block({ id: "h1", kind: "HEADING", content: HEADING }),
  block({ id: "p1", content: "Primer párrafo de la sección." }),
  block({
    id: "p2",
    content: `El cuerpo se adelanta. ${SENTENCE}`,
    blockKey: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    blockVersionId: "ver-42",
  }),
  block({ id: "h2", kind: "HEADING", content: "La siguiente sección" }),
];

describe("resolveGuideAnchor", () => {
  it("resolves the approved passage to its Content Core identity", () => {
    const res = resolveGuideAnchor(CHAPTER);
    expect(res.status).toBe("RESOLVED");
    if (res.status !== "RESOLVED") return;
    expect(res.blockKey).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(res.blockVersionId).toBe("ver-42");
    expect(res.renderBlockId).toBe("p2");
    // The offsets describe the sentence inside the raw text the reader sees.
    expect(CHAPTER[4]?.content.slice(res.quoteStart, res.quoteEnd)).toBe(
      SENTENCE,
    );
  });

  it("is UNRESOLVED when the heading is not in this chapter", () => {
    const withoutHeading = CHAPTER.filter((b) => b.content !== HEADING);
    expect(resolveGuideAnchor(withoutHeading).status).toBe("UNRESOLVED");
  });

  it("is UNRESOLVED when the sentence is not in the section", () => {
    const withoutSentence = CHAPTER.filter((b) => b.id !== "p2");
    expect(resolveGuideAnchor(withoutSentence).status).toBe("UNRESOLVED");
  });

  it("is AMBIGUOUS when two paragraphs of the section carry the sentence", () => {
    // Two candidates and no rule to choose between them. Picking the first
    // would be a coin flip presented to the reader as a certainty.
    const duplicated = [
      ...CHAPTER.slice(0, 5),
      block({ id: "p3", content: `Y otra vez: ${SENTENCE}` }),
      ...CHAPTER.slice(5),
    ];
    expect(resolveGuideAnchor(duplicated).status).toBe("AMBIGUOUS");
  });

  it("ignores a matching sentence that lives OUTSIDE the section", () => {
    // Same sentence, but under the next heading — the search is bounded, so
    // this is not the anchor and the answer is honest about it.
    const elsewhere: AnchorCandidateBlock[] = [
      block({ id: "h1", kind: "HEADING", content: HEADING }),
      block({ id: "p1", content: "Primer párrafo." }),
      block({ id: "h2", kind: "HEADING", content: "Otra" }),
      block({ id: "p9", content: SENTENCE }),
    ];
    expect(resolveGuideAnchor(elsewhere).status).toBe("UNRESOLVED");
  });

  it("matches across whitespace, line breaks and case", () => {
    const messy: AnchorCandidateBlock[] = [
      block({
        id: "h1",
        kind: "HEADING",
        content: `  el CUERPO y la emoción `,
      }),
      block({
        id: "p1",
        content: `Nuestro cuerpo\n  siente antes que nuestra   mente entienda.`,
        blockKey: "key-messy",
        blockVersionId: "ver-messy",
      }),
    ];
    const res = resolveGuideAnchor(messy);
    expect(res.status).toBe("RESOLVED");
  });

  it("is UNRESOLVED for a legacy block with no blockKey", () => {
    const legacy = [
      block({ id: "h1", kind: "HEADING", content: HEADING }),
      block({ id: "p1", content: SENTENCE, blockKey: undefined }),
    ];
    expect(resolveGuideAnchor(legacy).status).toBe("UNRESOLVED");
  });

  it("is UNRESOLVED for a block with no blockVersionId", () => {
    const noVersion = [
      block({ id: "h1", kind: "HEADING", content: HEADING }),
      block({ id: "p1", content: SENTENCE, blockVersionId: null }),
    ];
    expect(resolveGuideAnchor(noVersion).status).toBe("UNRESOLVED");
  });

  it("only applies to the chapter the anchor belongs to", () => {
    expect(anchorAppliesTo("emociones-en-construccion", 1)).toBe(true);
    expect(anchorAppliesTo("emociones-en-construccion", 2)).toBe(false);
    expect(anchorAppliesTo("familias-ensambladas", 1)).toBe(false);
  });

  it("hardcodes NO block key — the identity is per environment", () => {
    // The whole reason this file exists. A uuid literal here would resolve to
    // nothing in production, or to somebody else's paragraph.
    const source = readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "..",
        "..",
        "..",
        "..",
        "packages",
        "types",
        "src",
        "guide-anchor.ts",
      ),
      "utf8",
    );
    const uuidLiteral =
      /["'][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}["']/i;
    expect(uuidLiteral.test(source)).toBe(false);
    for (const forbidden of ["blockVersionId:", "legacyBlockId:"]) {
      expect(
        source.includes(`  ${forbidden} "`),
        `${forbidden} must not be a catalog literal`,
      ).toBe(false);
    }
  });
});
