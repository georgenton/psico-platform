import { describe, expect, it } from "vitest";
import {
  canonicalizeInlineMarks,
  isRangeFullyMarked,
  readInlineMarks,
  rebaseInlineMarks,
  safeInlineMarks,
  singleSplice,
  toInlineSegments,
  toInlineSegmentsForRange,
  toggleInlineMark,
  validateInlineMarks,
  withInlineMarks,
  type InlineTextMark,
} from "@psico/types";

/**
 * The formatting contract, pinned where it is decided.
 *
 * Two properties matter more than any individual case:
 *
 *   1. segments always re-join to exactly the original text, so no renderer can
 *      add, drop or reorder a character a reader's highlight offsets depend on;
 *   2. offsets are UTF-16 code units, identical to what `Highlight.startOffset`
 *      already means — an emoji counts as two, deliberately.
 */

const mark = (
  type: InlineTextMark["type"],
  startOffset: number,
  endOffset: number,
): InlineTextMark => ({ type, startOffset, endOffset });

describe("reading marks out of stored metadata", () => {
  it("treats absent metadata as no formatting", () => {
    expect(readInlineMarks(null)).toBeNull();
    expect(readInlineMarks({})).toBeNull();
    expect(readInlineMarks({ inlineMarks: null })).toBeNull();
  });

  it("reads a well-formed array", () => {
    expect(
      readInlineMarks({
        inlineMarks: [{ type: "BOLD", startOffset: 0, endOffset: 4 }],
      }),
    ).toEqual([mark("BOLD", 0, 4)]);
  });

  it("keeps unrelated metadata out of the result", () => {
    // IMAGE and VIDEO blocks carry their own keys here; reading formatting must
    // not imply anything about them.
    expect(
      readInlineMarks({
        imageUrl: "https://example/x.png",
        alt: "algo",
        inlineMarks: [{ type: "ITALIC", startOffset: 1, endOffset: 2 }],
      }),
    ).toEqual([mark("ITALIC", 1, 2)]);
  });
});

describe("validation — the writer's posture", () => {
  const content = "Este texto es importante";

  it("accepts valid marks", () => {
    expect(
      validateInlineMarks(
        [{ type: "UNDERLINE", startOffset: 11, endOffset: 23 }],
        content,
      ),
    ).toBeNull();
  });

  it("rejects anything that is not an array", () => {
    expect(validateInlineMarks({}, content)).toBe("NOT_AN_ARRAY");
    expect(validateInlineMarks("BOLD", content)).toBe("NOT_AN_ARRAY");
  });

  it("rejects an unsupported type", () => {
    // The whole point of V1 is that this list does not grow quietly.
    expect(
      validateInlineMarks(
        [{ type: "COLOR", startOffset: 0, endOffset: 2 }],
        content,
      ),
    ).toBe("UNSUPPORTED_TYPE");
    expect(
      validateInlineMarks(
        [{ type: "bold", startOffset: 0, endOffset: 2 }],
        content,
      ),
    ).toBe("UNSUPPORTED_TYPE");
  });

  it("rejects offsets that are not real whole numbers", () => {
    for (const bad of [1.5, NaN, Infinity, -Infinity, "3"]) {
      expect(
        validateInlineMarks(
          [{ type: "BOLD", startOffset: bad, endOffset: 5 }],
          content,
        ),
      ).toBe(bad === "3" ? "OFFSET_NOT_INTEGER" : "OFFSET_NOT_INTEGER");
    }
  });

  it("rejects a negative start", () => {
    expect(
      validateInlineMarks(
        [{ type: "BOLD", startOffset: -1, endOffset: 5 }],
        content,
      ),
    ).toBe("NEGATIVE_OFFSET");
  });

  it("rejects an empty or inverted range", () => {
    expect(
      validateInlineMarks(
        [{ type: "BOLD", startOffset: 5, endOffset: 5 }],
        content,
      ),
    ).toBe("EMPTY_RANGE");
    expect(
      validateInlineMarks(
        [{ type: "BOLD", startOffset: 6, endOffset: 5 }],
        content,
      ),
    ).toBe("EMPTY_RANGE");
  });

  it("rejects a range past the end of the text", () => {
    // A mark that outruns its content is how formatting starts describing text
    // that does not exist.
    expect(
      validateInlineMarks(
        [{ type: "BOLD", startOffset: 0, endOffset: content.length + 1 }],
        content,
      ),
    ).toBe("OUT_OF_BOUNDS");
  });
});

describe("the reader's posture — fail safe, never crash a chapter", () => {
  it("renders plain text when the metadata is malformed", () => {
    expect(safeInlineMarks({ inlineMarks: "nonsense" }, "hola")).toEqual([]);
    expect(
      safeInlineMarks({ inlineMarks: [{ type: "NOPE" }] }, "hola"),
    ).toEqual([]);
  });

  it("clamps a mark that outruns its content instead of dropping the block", () => {
    expect(
      safeInlineMarks(
        { inlineMarks: [{ type: "BOLD", startOffset: 2, endOffset: 99 }] },
        "hola",
      ),
    ).toEqual([mark("BOLD", 2, 4)]);
  });
});

describe("canonicalization", () => {
  it("merges same-type adjacent ranges", () => {
    // `[0,5)` then `[5,10)` is one run of bold text; storing it as two would be
    // a difference with no meaning, and these are persisted.
    expect(
      canonicalizeInlineMarks([mark("BOLD", 0, 5), mark("BOLD", 5, 10)]),
    ).toEqual([mark("BOLD", 0, 10)]);
  });

  it("merges same-type overlapping ranges", () => {
    expect(
      canonicalizeInlineMarks([mark("BOLD", 0, 8), mark("BOLD", 3, 10)]),
    ).toEqual([mark("BOLD", 0, 10)]);
  });

  it("leaves different types overlapping", () => {
    // Bold [0,15) with underline [5,20) is the ordinary case, not a conflict.
    const marks = [mark("BOLD", 0, 15), mark("UNDERLINE", 5, 20)];
    expect(canonicalizeInlineMarks(marks)).toHaveLength(2);
  });

  it("is deterministic regardless of input order", () => {
    const a = canonicalizeInlineMarks([
      mark("UNDERLINE", 5, 9),
      mark("BOLD", 0, 4),
    ]);
    const b = canonicalizeInlineMarks([
      mark("BOLD", 0, 4),
      mark("UNDERLINE", 5, 9),
    ]);
    expect(a).toEqual(b);
  });
});

describe("toggling", () => {
  it("applies across a selection", () => {
    expect(toggleInlineMark([], "UNDERLINE", 11, 23)).toEqual([
      mark("UNDERLINE", 11, 23),
    ]);
  });

  it("extends an adjacent run rather than fragmenting it", () => {
    expect(toggleInlineMark([mark("BOLD", 0, 5)], "BOLD", 5, 10)).toEqual([
      mark("BOLD", 0, 10),
    ]);
  });

  it("removes when the selection is already fully covered", () => {
    expect(toggleInlineMark([mark("BOLD", 0, 10)], "BOLD", 0, 10)).toEqual([]);
  });

  it("splits when removing from the middle", () => {
    expect(toggleInlineMark([mark("BOLD", 0, 20)], "BOLD", 5, 10)).toEqual([
      mark("BOLD", 0, 5),
      mark("BOLD", 10, 20),
    ]);
  });

  it("applies when the selection is only partly covered", () => {
    // Partial coverage means the editor wants MORE, not less — otherwise
    // selecting a paragraph with one bold word would unbold that word.
    expect(toggleInlineMark([mark("BOLD", 0, 5)], "BOLD", 0, 20)).toEqual([
      mark("BOLD", 0, 20),
    ]);
  });

  it("leaves the other types alone", () => {
    const result = toggleInlineMark([mark("UNDERLINE", 0, 10)], "BOLD", 0, 10);
    expect(result).toEqual([mark("BOLD", 0, 10), mark("UNDERLINE", 0, 10)]);
  });

  it("ignores an empty selection", () => {
    expect(toggleInlineMark([mark("BOLD", 0, 5)], "BOLD", 3, 3)).toEqual([
      mark("BOLD", 0, 5),
    ]);
  });
});

describe("isRangeFullyMarked", () => {
  it("sees coverage spread across merged runs", () => {
    expect(
      isRangeFullyMarked(
        [mark("BOLD", 0, 5), mark("BOLD", 5, 10)],
        "BOLD",
        2,
        8,
      ),
    ).toBe(true);
  });

  it("sees a gap", () => {
    expect(
      isRangeFullyMarked(
        [mark("BOLD", 0, 4), mark("BOLD", 6, 10)],
        "BOLD",
        2,
        8,
      ),
    ).toBe(false);
  });
});

describe("finding the edit", () => {
  it("locates a pure insertion", () => {
    expect(
      singleSplice("El cerebro aprende.", "El cerebro también aprende."),
    ).toEqual({
      start: 11,
      removed: 0,
      inserted: 8,
    });
  });

  it("locates a pure deletion", () => {
    expect(singleSplice("hola mundo", "hola")).toEqual({
      start: 4,
      removed: 6,
      inserted: 0,
    });
  });

  it("reports nothing for an unchanged string", () => {
    expect(singleSplice("igual", "igual")).toEqual({
      start: 0,
      removed: 0,
      inserted: 0,
    });
  });
});

describe("rebasing marks across a text edit", () => {
  it("leaves a mark before the edit untouched", () => {
    expect(
      rebaseInlineMarks([mark("BOLD", 0, 2)], "abcdef", "abcXXdef"),
    ).toEqual([mark("BOLD", 0, 2)]);
  });

  it("shifts a mark after the edit", () => {
    expect(
      rebaseInlineMarks([mark("BOLD", 4, 6)], "abcdef", "abcXXdef"),
    ).toEqual([mark("BOLD", 6, 8)]);
  });

  it("grows a mark when text is typed inside it", () => {
    expect(
      rebaseInlineMarks([mark("BOLD", 0, 6)], "abcdef", "abcXXdef"),
    ).toEqual([mark("BOLD", 0, 8)]);
  });

  it("shrinks a mark when text is deleted inside it", () => {
    expect(rebaseInlineMarks([mark("BOLD", 0, 6)], "abcdef", "abdef")).toEqual([
      mark("BOLD", 0, 5),
    ]);
  });

  it("removes a mark whose text was entirely deleted", () => {
    expect(rebaseInlineMarks([mark("BOLD", 2, 5)], "abcdef", "abf")).toEqual(
      [],
    );
  });

  it("trims rather than guesses when an edit crosses a boundary", () => {
    // The formatting that survives is the part demonstrably still the original
    // text. Formatting that wandered onto neighbouring words would be wrong AND
    // invisible; a mark that shrank is visible and trivially reapplied.
    const result = rebaseInlineMarks(
      [mark("BOLD", 0, 5)],
      "abcdefgh",
      "abcZZZZZZgh",
    );
    for (const m of result) expect(m.endOffset).toBeLessThanOrEqual(3);
  });

  it("is a no-op when the text did not change", () => {
    const marks = [mark("BOLD", 1, 3)];
    expect(rebaseInlineMarks(marks, "abcdef", "abcdef")).toEqual(marks);
  });

  it("never produces an offset outside the new text", () => {
    const result = rebaseInlineMarks([mark("BOLD", 0, 10)], "0123456789", "01");
    for (const m of result) {
      expect(m.startOffset).toBeGreaterThanOrEqual(0);
      expect(m.endOffset).toBeLessThanOrEqual(2);
    }
  });
});

describe("segmentation", () => {
  it("returns one plain segment when there is no formatting", () => {
    expect(toInlineSegments("hola", [])).toEqual([
      { text: "hola", bold: false, italic: false, underline: false },
    ]);
  });

  it("cuts at every formatting boundary", () => {
    const segments = toInlineSegments("abcdef", [mark("BOLD", 2, 4)]);
    expect(segments.map((s) => s.text)).toEqual(["ab", "cd", "ef"]);
    expect(segments[1]!.bold).toBe(true);
  });

  it("marks a segment with every type covering it", () => {
    const segments = toInlineSegments("abcdef", [
      mark("BOLD", 0, 6),
      mark("ITALIC", 2, 6),
      mark("UNDERLINE", 4, 6),
    ]);
    const last = segments[segments.length - 1]!;
    expect(last).toMatchObject({ bold: true, italic: true, underline: true });
  });

  it.each([
    ["plain", [] as InlineTextMark[]],
    ["bold", [mark("BOLD", 0, 4)]],
    ["italic", [mark("ITALIC", 2, 7)]],
    ["underline", [mark("UNDERLINE", 3, 9)]],
    ["bold+italic", [mark("BOLD", 0, 6), mark("ITALIC", 3, 9)]],
    ["bold+underline", [mark("BOLD", 1, 5), mark("UNDERLINE", 4, 8)]],
    ["italic+underline", [mark("ITALIC", 0, 5), mark("UNDERLINE", 2, 10)]],
    [
      "all three",
      [mark("BOLD", 0, 10), mark("ITALIC", 1, 9), mark("UNDERLINE", 2, 8)],
    ],
  ])("re-joins to exactly the original text · %s", (_label, marks) => {
    // The invariant every renderer depends on. If this can ever fail, a reader's
    // highlight offsets stop meaning what they meant.
    const content = "La mente también aprende del cuerpo.";
    expect(
      toInlineSegments(content, marks)
        .map((s) => s.text)
        .join(""),
    ).toBe(content);
  });

  it("re-joins exactly with accented text and emoji", () => {
    // Pins UTF-16 code-unit semantics: the emoji is two units, exactly as
    // `content.slice()` and `Highlight.startOffset` already treat it.
    const content = "café 🌿 corazón";
    expect(content.length).toBe(15);
    const segments = toInlineSegments(content, [mark("BOLD", 5, 7)]);
    expect(segments.map((s) => s.text).join("")).toBe(content);
    expect(segments.find((s) => s.bold)!.text).toBe("🌿");
  });

  it("returns nothing for empty content", () => {
    expect(toInlineSegments("", [mark("BOLD", 0, 3)])).toEqual([]);
  });

  it("segments a sub-range with marks rebased onto it", () => {
    // What the web reader uses inside one highlight chunk.
    const content = "abcdefghij";
    const segments = toInlineSegmentsForRange(
      content,
      [mark("BOLD", 2, 6)],
      3,
      8,
    );
    expect(segments.map((s) => s.text).join("")).toBe("defgh");
    // BOLD [2,6) is "cdef"; intersected with the range [3,8) that leaves "def".
    expect(segments.find((s) => s.bold)!.text).toBe("def");
  });
});

describe("writing marks back into metadata", () => {
  it("preserves every unrelated property", () => {
    // An IMAGE's alt text losing its meaning because someone bolded a paragraph
    // is the kind of failure this guards against.
    const meta = {
      imageUrl: "https://example/x.png",
      alt: "un gato",
      caption: "hola",
    };
    const next = withInlineMarks(meta, [mark("BOLD", 0, 2)]);
    expect(next).toMatchObject({
      imageUrl: "https://example/x.png",
      alt: "un gato",
      caption: "hola",
    });
  });

  it("removes the key entirely when formatting is cleared", () => {
    // A block that was never formatted and one whose formatting was removed
    // should be indistinguishable in storage.
    const next = withInlineMarks(
      { alt: "x", inlineMarks: [mark("BOLD", 0, 2)] },
      [],
    );
    expect(next).not.toHaveProperty("inlineMarks");
    expect(next).toMatchObject({ alt: "x" });
  });

  it("stores marks canonically", () => {
    const next = withInlineMarks(null, [
      mark("BOLD", 5, 10),
      mark("BOLD", 0, 5),
    ]);
    expect(next).toEqual({ inlineMarks: [mark("BOLD", 0, 10)] });
  });
});
