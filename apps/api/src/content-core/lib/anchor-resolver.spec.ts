import { describe, expect, it } from "vitest";
import { resolveAnchor } from "./anchor-resolver";
import type { Anchor, LiveBlock } from "./anchor-resolver";

function live(blocks: LiveBlock[]): Map<string, LiveBlock> {
  return new Map(blocks.map((b) => [b.blockKey, b]));
}

describe("content-core · anchor-resolver (fail-closed on ambiguity)", () => {
  const content = "El miedo no es el enemigo; es una señal.";
  // "el enemigo" starts at index 15
  const anchor: Anchor = {
    blockKey: "k-a",
    startOffset: 15,
    endOffset: 25,
    quote: "el enemigo",
  };

  it("attached when offsets still frame the quote", () => {
    const r = resolveAnchor(anchor, live([{ blockKey: "k-a", content }]));
    expect(r.status).toBe("attached");
    expect([r.startOffset, r.endOffset]).toEqual([15, 25]);
  });

  it("shifted when the quote occurs EXACTLY once elsewhere (re-located)", () => {
    const edited = "Escucha: el miedo no es el enemigo; es una señal.";
    const r = resolveAnchor(
      anchor,
      live([{ blockKey: "k-a", content: edited }]),
    );
    expect(r.status).toBe("shifted");
    expect(edited.slice(r.startOffset, r.endOffset)).toBe("el enemigo");
  });

  it("unresolved when the quote does not occur (block survives)", () => {
    const rewritten = "Un texto completamente distinto.";
    const r = resolveAnchor(
      anchor,
      live([{ blockKey: "k-a", content: rewritten }]),
    );
    expect(r.status).toBe("unresolved");
    expect([r.startOffset, r.endOffset]).toEqual([15, 25]);
  });

  it("ambiguous when the quote occurs MORE than once (never auto-reanchor)", () => {
    const twice = "hoy el enemigo y también el enemigo otra vez";
    // stored offsets 0..3 frame "hoy" (not the quote) → not attached
    const r = resolveAnchor(
      { blockKey: "k-a", startOffset: 0, endOffset: 3, quote: "el enemigo" },
      live([{ blockKey: "k-a", content: twice }]),
    );
    expect(r.status).toBe("ambiguous");
    expect([r.startOffset, r.endOffset]).toEqual([0, 3]);
  });

  it("tombstoned when the block is absent from the live revision (never deleted)", () => {
    const r = resolveAnchor(anchor, live([{ blockKey: "other", content }]));
    expect(r.status).toBe("tombstoned");
    expect([r.startOffset, r.endOffset]).toEqual([15, 25]);
  });
});
