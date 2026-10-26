import { describe, expect, it } from "vitest";

import { toInlineSegments } from "@psico/types";

import {
  mapOffset,
  parseEmphasis,
  removeSpans,
  restoreSpans,
  translateRange,
  type EmphasisParse,
} from "./markdown-emphasis";

const ok = (content: string, kind = "PARAGRAPH"): EmphasisParse => {
  const r = parseEmphasis(content, kind);
  if (!r.ok) throw new Error(`expected a parse, got ${r.blocker}: ${r.detail}`);
  return r.parse;
};

const blocked = (content: string, kind = "PARAGRAPH") => {
  const r = parseEmphasis(content, kind);
  if (r.ok) throw new Error("expected a refusal, got a parse");
  return r;
};

describe("parseEmphasis · what it translates", () => {
  it("turns **bold** into a mark and takes the asterisks out of the text", () => {
    const p = ok("**importante**");
    expect(p.text).toBe("importante");
    expect(p.marks).toEqual([{ type: "BOLD", startOffset: 0, endOffset: 10 }]);
  });

  it("turns *italic* into a mark", () => {
    const p = ok("Las formas de tratamiento (*tú*, *usted* y *vos*)");
    expect(p.text).toBe("Las formas de tratamiento (tú, usted y vos)");
    // Three separate runs, in reading order.
    expect(
      p.marks.map((m) => p.text.slice(m.startOffset, m.endOffset)),
    ).toEqual(["tú", "usted", "vos"]);
    expect(p.marks.every((m) => m.type === "ITALIC")).toBe(true);
  });

  it("nests italic inside bold", () => {
    const p = ok("**a *b* c**");
    expect(p.text).toBe("a b c");
    expect(p.marks).toEqual([
      { type: "BOLD", startOffset: 0, endOffset: 5 },
      { type: "ITALIC", startOffset: 2, endOffset: 3 },
    ]);
  });

  it("leaves a bullet prefix alone — a list is not inline formatting", () => {
    const p = ok("- **El agente:** qué deseas");
    expect(p.text).toBe("- El agente: qué deseas");
    expect(p.text.startsWith("- ")).toBe(true);
    expect(p.marks).toEqual([{ type: "BOLD", startOffset: 2, endOffset: 12 }]);
  });

  it("does nothing to a block with no asterisks", () => {
    const p = ok("Texto corriente.");
    expect(p).toEqual({
      text: "Texto corriente.",
      marks: [],
      removals: [],
    });
  });

  it("leaves a lone literal asterisk alone instead of inventing a repair", () => {
    // `2 * 3` is arithmetic, not a dangling bold marker. Nothing to repair.
    const p = ok("El resultado de 2 * 3.");
    expect(p.text).toBe("El resultado de 2 * 3.");
    expect(p.marks).toEqual([]);
  });

  it("the rendered segments always rebuild the stored text exactly", () => {
    for (const source of [
      "**a *b* c**",
      "Las (*tú*, *usted*)",
      "- **El agente:** qué",
      "**¿Pregunta entera?**",
    ]) {
      const p = ok(source);
      const rebuilt = toInlineSegments(p.text, p.marks)
        .map((s) => s.text)
        .join("");
      // This is the invariant the reader depends on: a renderer built on these
      // segments cannot invent, drop or reorder a character.
      expect(rebuilt).toBe(p.text);
    }
  });
});

describe("restoreSpans · the repair is reversible without storing the prose", () => {
  it("puts every delimiter back, for every shape in the corpus", () => {
    for (const source of [
      "**importante**",
      "Las formas de tratamiento (*tú*, *usted* y *vos*)",
      "**a *b* c**",
      "- **El agente:** qué deseas",
      "*«Tú no hiciste nada; el problema lo hizo».*",
      "La señal aporta información. **La interpretación sigue siendo una inferencia:** una conclusión",
      "Texto sin nada",
    ]) {
      const p = ok(source);
      // This is what makes a digest enough for the preimage: the plan's
      // `removals` are the inverse, so recovery needs the plan, not the text.
      expect(restoreSpans(p.text, p.removals)).toBe(source);
    }
  });

  it("is the exact inverse even when a run sits at either end", () => {
    for (const source of ["**todo**", "*uno*", "a**b**", "**a**b"]) {
      const p = ok(source);
      expect(restoreSpans(p.text, p.removals)).toBe(source);
    }
  });
});

describe("parseEmphasis · what it refuses", () => {
  it("refuses a run of three or more: bold, italic, both, or a typo", () => {
    expect(blocked("***x***").blocker).toBe("DELIMITER_RUN_TOO_LONG");
  });

  it("refuses an opener that is never closed", () => {
    expect(blocked("**sin cerrar").blocker).toBe("UNPAIRED_DELIMITER");
  });

  it("refuses crossed spans", () => {
    expect(blocked("**a *b** c*").blocker).toBe("CROSSED_DELIMITERS");
  });

  it("refuses a block that mixes markup asterisks with a literal one", () => {
    const r = blocked("**negrita** y 2 * 3");
    expect(r.blocker).toBe("AMBIGUOUS_LITERAL_ASTERISK");
    // The refusal has to say what it saw: a person decides this, not this file.
    expect(r.detail).toMatch(/neither opener nor closer/);
  });

  it("refuses markup it has no mark type for", () => {
    expect(blocked("**a** y `código`").blocker).toBe("UNREPRESENTABLE_MARKUP");
    expect(blocked("**a** y _subrayado_").blocker).toBe(
      "UNREPRESENTABLE_MARKUP",
    );
    expect(blocked("**a** y [enlace](http://x)").blocker).toBe(
      "UNREPRESENTABLE_MARKUP",
    );
  });

  it("refuses a kind with nowhere to store marks", () => {
    // EXERCISE is not in INLINE_FORMATTABLE_KINDS, and exactly one block in the
    // real corpus is an EXERCISE carrying asterisks.
    expect(blocked("**a**", "EXERCISE").blocker).toBe("KIND_NOT_FORMATTABLE");
    expect(blocked("**a**", "VIDEO").blocker).toBe("KIND_NOT_FORMATTABLE");
  });

  it("does not refuse a non-formattable kind that has nothing to repair", () => {
    const p = ok("Sin formato", "EXERCISE");
    expect(p.marks).toEqual([]);
  });
});

describe("removeSpans / mapOffset", () => {
  it("removes spans and nothing else", () => {
    expect(
      removeSpans("**ab**cd", [
        { at: 0, length: 2 },
        { at: 4, length: 2 },
      ]),
    ).toBe("abcd");
  });

  it("moves an offset by everything removed before it", () => {
    const removals = [
      { at: 0, length: 2 },
      { at: 4, length: 2 },
    ];
    expect(mapOffset(2, removals)).toEqual({ kind: "moved", offset: 0 });
    expect(mapOffset(6, removals)).toEqual({ kind: "moved", offset: 2 });
    expect(mapOffset(8, removals)).toEqual({ kind: "moved", offset: 4 });
  });

  it("clamps an offset that pointed INTO a delimiter, and says so", () => {
    // `**ab**` — offset 5 is the second asterisk of the closer: a character
    // that stops existing. Clamping to where the delimiter began is the nearest
    // position that still means something, and the flag is how the caller knows
    // it was not an exact carry-over.
    expect(
      mapOffset(5, [
        { at: 0, length: 2 },
        { at: 4, length: 2 },
      ]),
    ).toEqual({ kind: "clamped", offset: 2 });
  });
});

describe("translateRange · the text a mark refers to survives", () => {
  const source = "Un **modelo generativo** explica la *conducta* del circuito";
  const p = ok(source);
  // "Un modelo generativo explica la conducta del circuito"
  const T = (from: number, to: number) =>
    translateRange(source, p.text, p.removals, from, to);

  it("the repaired text is what we think it is", () => {
    expect(p.text).toBe(
      "Un modelo generativo explica la conducta del circuito",
    );
  });

  it("a selection AFTER the delimiters keeps its words", () => {
    const from = source.indexOf("explica");
    const to = from + "explica la".length;
    expect(source.slice(from, to)).toBe("explica la");
    const r = T(from, to);
    expect(r.ok && r.quote).toBe("explica la");
    // It really did move: four asterisks were removed before it.
    expect(r.ok && r.startOffset).toBe(p.text.indexOf("explica"));
    expect(r.ok && r.clamped).toBe(false);
  });

  it("a selection BEFORE the delimiters does not move at all", () => {
    const r = T(0, 2);
    expect(r.ok && r.quote).toBe("Un");
    expect(r.ok && r.startOffset).toBe(0);
    expect(r.ok && r.endOffset).toBe(2);
  });

  it("a selection that CONTAINS the delimiters loses them and nothing else", () => {
    const from = source.indexOf("Un");
    const to = source.indexOf(" explica");
    expect(source.slice(from, to)).toBe("Un **modelo generativo**");
    const r = T(from, to);
    // The asterisks are gone because they no longer exist; every word stays.
    expect(r.ok && r.quote).toBe("Un modelo generativo");
    expect(r.ok && r.clamped).toBe(false);
  });

  it("a selection that STARTS inside a delimiter is clamped to the word", () => {
    // Start on the second asterisk of the opener.
    const from = source.indexOf("**") + 1;
    const to = source.indexOf("**", from);
    const r = T(from, to);
    expect(r.ok && r.quote).toBe("modelo generativo");
    expect(r.ok && r.clamped).toBe(true);
  });

  it("a selection that ENDS inside a delimiter is clamped to the word", () => {
    const from = source.indexOf("modelo");
    const to = source.indexOf("**", from) + 1;
    const r = T(from, to);
    expect(r.ok && r.quote).toBe("modelo generativo");
    expect(r.ok && r.clamped).toBe(true);
  });

  it("a selection of nothing but a delimiter collapses, and is refused", () => {
    const at = source.indexOf("**");
    const r = T(at, at + 2);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe("COLLAPSED");
  });

  /**
   * The text check is not decoration, and these are the tests that prove it.
   *
   * When the planner is right, the arithmetic and the text always agree, so no
   * test of correct inputs can show the check doing anything — removing it kept
   * every other test green, which is how this gap was found. What the check
   * actually guards is a caller that passes a `newText` or a `removals` list
   * that does not belong to `oldText`: a planner bug, which is the one failure
   * mode that would silently move somebody's highlight onto other words.
   */
  it("refuses when newText is not what those removals would produce", () => {
    const r = translateRange(
      "Un **modelo** explica",
      // A plausible-looking repaired text with one letter quietly changed
      // INSIDE the selected range — outside it the check cannot see it, which
      // is a limit worth knowing rather than papering over.
      "Un modElo explica",
      [
        { at: 3, length: 2 },
        { at: 11, length: 2 },
      ],
      5,
      11,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe("TEXT_NOT_PRESERVED");
    expect(!r.ok && r.detail).toMatch(/expected|got/);
  });

  it("refuses when the removals do not describe the delimiters they claim", () => {
    // Offsets shifted by one: the arithmetic still produces a range, and the
    // range reads the wrong characters. Exactly the defect to refuse.
    const r = translateRange(
      "Un **modelo** explica",
      "Un modelo explica",
      [
        { at: 2, length: 2 },
        { at: 10, length: 2 },
      ],
      5,
      11,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe("TEXT_NOT_PRESERVED");
  });

  it("every single-character selection in the source still reads the same", () => {
    // The exhaustive version of the two cases above: for every position in the
    // old text, the translated range must select the same character — or be
    // refused because that character was a delimiter.
    let refused = 0;
    for (let i = 0; i < source.length; i += 1) {
      const r = T(i, i + 1);
      if (!r.ok) {
        expect(source[i]).toBe("*");
        refused += 1;
        continue;
      }
      if (source[i] === "*") {
        // Clamped off a delimiter: it may legitimately read as the next word's
        // start, but it must never read as some unrelated character.
        expect(r.clamped).toBe(true);
        continue;
      }
      expect(r.quote).toBe(source[i]);
    }
    expect(refused).toBeGreaterThan(0);
  });
});
