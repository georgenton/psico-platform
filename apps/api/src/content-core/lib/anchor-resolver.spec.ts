import { describe, expect, it } from "vitest";
import { resolveAnchor } from "./anchor-resolver";
import type { Anchor, LiveBlock } from "./anchor-resolver";

function live(blocks: LiveBlock[]): Map<string, LiveBlock> {
  return new Map(blocks.map((b) => [b.blockKey, b]));
}

describe("content-core · anchor-resolver", () => {
  const content = "El miedo no es el enemigo; es una señal.";
  // "el enemigo" starts at index 15
  const anchor: Anchor = {
    blockKey: "k-a",
    startOffset: 15,
    endOffset: 25,
    quote: "el enemigo",
  };

  it("attached when the block exists and offsets still frame the quote", () => {
    const r = resolveAnchor(anchor, live([{ blockKey: "k-a", content }]));
    expect(r.status).toBe("attached");
    expect([r.startOffset, r.endOffset]).toEqual([15, 25]);
  });

  it("shifted when the quote moved but the block survives (offsets re-located)", () => {
    const edited = "Escucha: el miedo no es el enemigo; es una señal.";
    const r = resolveAnchor(
      anchor,
      live([{ blockKey: "k-a", content: edited }]),
    );
    expect(r.status).toBe("shifted");
    expect(edited.slice(r.startOffset, r.endOffset)).toBe("el enemigo");
  });

  it("shifted (stale offsets) when the block survives but the quote is gone", () => {
    const rewritten = "Un texto completamente distinto.";
    const r = resolveAnchor(
      anchor,
      live([{ blockKey: "k-a", content: rewritten }]),
    );
    expect(r.status).toBe("shifted");
  });

  it("tombstoned when the block has no version in the live revision (never deleted)", () => {
    const r = resolveAnchor(anchor, live([{ blockKey: "other", content }]));
    expect(r.status).toBe("tombstoned");
    // offsets preserved so the UI can still render the stored quote
    expect([r.startOffset, r.endOffset]).toEqual([15, 25]);
  });
});
