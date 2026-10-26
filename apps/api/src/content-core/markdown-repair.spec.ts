import { describe, expect, it } from "vitest";

import { INLINE_MARKS_META_KEY } from "@psico/types";

import { contentHash } from "./lib/content-hash";
import {
  computeEmphasisPlanHash,
  planEmphasisRepair,
  type BlockSnapshot,
  type EmphasisSnapshot,
  type HighlightSnapshot,
} from "./markdown-repair";

const TEXT = "Un **modelo generativo** explica la conducta";
const REPAIRED = "Un modelo generativo explica la conducta";

function block(over: Partial<BlockSnapshot> = {}): BlockSnapshot {
  const content = over.content ?? TEXT;
  return {
    chapterBlockId: "cb-1",
    chapterOrder: 1,
    order: 7,
    kind: "PARAGRAPH",
    content,
    meta: null,
    contentBlockId: "ccb-1",
    blockKey: "key-1",
    versions: [
      {
        id: "bv-1",
        unitVersionId: "uv-1",
        order: 7,
        kind: "PARAGRAPH",
        content,
        contentHash: contentHash(content),
        // Igual que el legado: las dos representaciones se mantienen en
        // sincronía, y una divergencia previa es justo lo que el planificador
        // bloquea.
        meta: over.meta ?? null,
      },
    ],
    highlights: [],
    annotations: 0,
    readingSessions: 0,
    ...over,
  };
}

const snapshot = (blocks: BlockSnapshot[]): EmphasisSnapshot => ({
  bookSlug: "emociones-en-construccion",
  blocks,
});

const highlight = (over: Partial<HighlightSnapshot>): HighlightSnapshot => ({
  id: "h-1",
  startOffset: 0,
  endOffset: 2,
  quote: null,
  blockVersionId: "bv-1",
  ...over,
});

describe("planEmphasisRepair · the write it proposes", () => {
  it("rewrites both representations, never one", () => {
    const plan = planEmphasisRepair(snapshot([block()]));
    expect(plan.ops).toHaveLength(1);
    const op = plan.ops[0]!;
    // Legacy and native in the same op: `backfill-inspect` compares them, so
    // moving one alone would turn a formatting repair into reported drift.
    expect(op.chapterBlockId).toBe("cb-1");
    expect(op.contentBlockId).toBe("ccb-1");
    expect(op.versions.map((v) => v.id)).toEqual(["bv-1"]);
    expect(op.versions[0]!.contentDigest).toMatch(/^sha256:/);
    expect(op.after.contentHash).toBe(contentHash(REPAIRED));
    expect(op.after.contentLength).toBe(REPAIRED.length);
    expect(op.after.marks).toEqual([
      { type: "BOLD", startOffset: 3, endOffset: 20 },
    ]);
  });

  it("carries a digest of the text it expects to find, not the text", () => {
    const op = planEmphasisRepair(snapshot([block()])).ops[0]!;
    expect(op.before.contentDigest).toMatch(/^sha256:[0-9a-f]{32}$/);
    // The prose itself never enters the plan.
    const serialized = JSON.stringify(op);
    expect(serialized).not.toContain("modelo generativo");
  });

  it("counts a block with nothing to repair as untouched, not as an op", () => {
    const plan = planEmphasisRepair(
      snapshot([block({ content: "Texto sin formato" })]),
    );
    expect(plan.ops).toHaveLength(0);
    expect(plan.untouched).toBe(1);
    expect(plan.blockers).toHaveLength(0);
  });

  it("is repeatable: planning over its own result proposes nothing", () => {
    const op = planEmphasisRepair(snapshot([block()])).ops[0]!;
    const after = block({
      content: REPAIRED,
      meta: { [INLINE_MARKS_META_KEY]: op.after.marks },
      versions: [
        {
          id: "bv-1",
          unitVersionId: "uv-1",
          order: 7,
          kind: "PARAGRAPH",
          content: REPAIRED,
          contentHash: contentHash(REPAIRED),
          meta: { [INLINE_MARKS_META_KEY]: op.after.marks },
        },
      ],
    });
    const again = planEmphasisRepair(snapshot([after]));
    expect(again.ops).toHaveLength(0);
    expect(again.blockers).toHaveLength(0);
    expect(again.untouched).toBe(1);
  });
});

describe("planEmphasisRepair · references survive or the block is refused", () => {
  it("moves a highlight that sits after the delimiters, keeping its words", () => {
    const from = TEXT.indexOf("explica");
    const h = highlight({
      startOffset: from,
      endOffset: from + "explica".length,
      quote: "explica",
    });
    const op = planEmphasisRepair(snapshot([block({ highlights: [h] })]))
      .ops[0]!;
    expect(op.highlights).toHaveLength(1);
    const moved = op.highlights[0]!;
    expect(moved.quote).toBe("explica");
    expect(REPAIRED.slice(moved.to.startOffset, moved.to.endOffset)).toBe(
      "explica",
    );
    // It really moved: four asterisks disappeared before it.
    expect(moved.to.startOffset).toBe(from - 4);
    expect(moved.clamped).toBe(false);
    expect(moved.quoteRewritten).toBe(false);
  });

  it("a highlight that CONTAINED the delimiters keeps every word and loses them", () => {
    const h = highlight({
      startOffset: 0,
      endOffset: TEXT.indexOf(" explica"),
      quote: "Un **modelo generativo**",
    });
    const op = planEmphasisRepair(snapshot([block({ highlights: [h] })]))
      .ops[0]!;
    const moved = op.highlights[0]!;
    expect(moved.quote).toBe("Un modelo generativo");
    // The stored quote carried markup, so it has to be rewritten with the text.
    expect(moved.quoteRewritten).toBe(true);
  });

  it("refuses the whole block when a highlight cannot be carried over", () => {
    // A selection that is nothing but a delimiter: it has no words to keep.
    const at = TEXT.indexOf("**");
    const plan = planEmphasisRepair(
      snapshot([
        block({
          highlights: [highlight({ startOffset: at, endOffset: at + 2 })],
        }),
      ]),
    );
    expect(plan.ops).toHaveLength(0);
    expect(plan.blockers[0]!.reason).toBe("HIGHLIGHT_NOT_PRESERVED");
    // One mark that cannot move blocks its block. The alternative is to fix
    // formatting by moving somebody's underline onto different words.
    expect(plan.blockers[0]!.detail).toContain("COLLAPSED");
  });

  it("refuses a highlight whose stored quote already disagrees with its offsets", () => {
    const plan = planEmphasisRepair(
      snapshot([
        block({
          highlights: [
            highlight({ startOffset: 0, endOffset: 2, quote: "otra cosa" }),
          ],
        }),
      ]),
    );
    expect(plan.blockers[0]!.reason).toBe("HIGHLIGHT_QUOTE_MISMATCH");
  });

  it("carries existing editorial marks and merges them with the new ones", () => {
    // An UNDERLINE over "conducta", which no Markdown delimiter can express, so
    // it can only have come from the editor — and it has to survive.
    const start = TEXT.indexOf("conducta");
    const op = planEmphasisRepair(
      snapshot([
        block({
          meta: {
            [INLINE_MARKS_META_KEY]: [
              {
                type: "UNDERLINE",
                startOffset: start,
                endOffset: start + "conducta".length,
              },
            ],
          },
        }),
      ]),
    ).ops[0]!;
    const underline = op.after.marks.find((m) => m.type === "UNDERLINE")!;
    expect(REPAIRED.slice(underline.startOffset, underline.endOffset)).toBe(
      "conducta",
    );
    expect(op.after.marks.some((m) => m.type === "BOLD")).toBe(true);
  });

  it("refuses a block whose stored marks are not readable as marks", () => {
    const plan = planEmphasisRepair(
      snapshot([block({ meta: { [INLINE_MARKS_META_KEY]: "nope" } })]),
    );
    expect(plan.blockers[0]!.reason).toBe("META_MARKS_UNREADABLE");
  });

  it("refuses a block whose two representations already disagree", () => {
    const plan = planEmphasisRepair(
      snapshot([
        block({
          versions: [
            {
              id: "bv-1",
              unitVersionId: "uv-1",
              order: 7,
              kind: "PARAGRAPH",
              content: "otro texto",
              contentHash: contentHash("otro texto"),
              meta: null,
            },
          ],
        }),
      ]),
    );
    expect(plan.blockers[0]!.reason).toBe("NATIVE_DRIFT");
    expect(plan.ops).toHaveLength(0);
  });

  it("refuses identical text when a mark exists ONLY on the native side", () => {
    // The hole this closes: `NATIVE_DRIFT` used to compare `content` alone, so
    // this block passed — and then the apply, which writes the LEGACY-derived
    // marks to both sides, would have deleted an UNDERLINE that only ever
    // existed natively. The text being identical is precisely what made it
    // invisible.
    const start = TEXT.indexOf("generativo");
    const plan = planEmphasisRepair(
      snapshot([
        block({
          meta: null,
          versions: [
            {
              id: "bv-1",
              unitVersionId: "uv-1",
              order: 7,
              kind: "PARAGRAPH",
              content: TEXT,
              contentHash: contentHash(TEXT),
              meta: {
                [INLINE_MARKS_META_KEY]: [
                  {
                    type: "UNDERLINE",
                    startOffset: start,
                    endOffset: start + "generativo".length,
                  },
                ],
              },
            },
          ],
        }),
      ]),
    );
    expect(plan.ops).toHaveLength(0);
    expect(plan.blockers[0]!.reason).toBe("NATIVE_DRIFT");
    // And it says WHICH field diverged, because "drifted" alone sends whoever
    // reads it back to the database to find out.
    expect(plan.blockers[0]!.detail).toContain("content same");
    expect(plan.blockers[0]!.detail).toContain("meta DIFFERENT");
  });

  it("passes the parser's own refusals through with their reason", () => {
    const plan = planEmphasisRepair(
      snapshot([
        block({ content: "**a *b** c*", chapterBlockId: "cb-cross" }),
        block({ content: "**a**", kind: "EXERCISE", chapterBlockId: "cb-ex" }),
        block({ content: "**a** y `x`", chapterBlockId: "cb-tick" }),
      ]),
    );
    expect(plan.ops).toHaveLength(0);
    expect(plan.blockers.map((b) => b.reason).sort()).toEqual([
      "CROSSED_DELIMITERS",
      "KIND_NOT_FORMATTABLE",
      "UNREPRESENTABLE_MARKUP",
    ]);
  });

  it("reports annotations and reading sessions without moving them", () => {
    const op = planEmphasisRepair(
      snapshot([block({ annotations: 3, readingSessions: 2 })]),
    ).ops[0]!;
    // Neither carries an offset: an annotation is a block-level note and a
    // session points at a block id. They are listed so the review can see the
    // exposure, not because anything about them changes.
    expect(op.annotations).toBe(3);
    expect(op.readingSessions).toBe(2);
  });
});

describe("computeEmphasisPlanHash", () => {
  it("does not depend on the order blocks arrived in", () => {
    const a = block({ chapterBlockId: "cb-a" });
    const b = block({ chapterBlockId: "cb-b" });
    expect(computeEmphasisPlanHash(planEmphasisRepair(snapshot([a, b])))).toBe(
      computeEmphasisPlanHash(planEmphasisRepair(snapshot([b, a]))),
    );
  });

  it("changes when what would be written changes", () => {
    const one = computeEmphasisPlanHash(
      planEmphasisRepair(snapshot([block()])),
    );
    const two = computeEmphasisPlanHash(
      planEmphasisRepair(
        snapshot([block({ content: "Un **modelo** explica la conducta" })]),
      ),
    );
    expect(one).not.toBe(two);
  });

  it("changes when a block becomes blocked", () => {
    const clean = computeEmphasisPlanHash(
      planEmphasisRepair(snapshot([block()])),
    );
    const withBlocker = computeEmphasisPlanHash(
      planEmphasisRepair(
        snapshot([block(), block({ chapterBlockId: "cb-x", content: "**a" })]),
      ),
    );
    expect(withBlocker).not.toBe(clean);
  });
});
