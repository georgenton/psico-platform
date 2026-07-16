import { describe, expect, it } from "vitest";
import { contentHash } from "./content-hash";
import { matchBlock } from "./matcher";
import type { PrevBlock } from "./matcher";

function prev(blockKey: string, content: string): PrevBlock {
  return { blockKey, content, contentHash: contentHash(content) };
}

describe("content-core · matcher (conservative: exact / unique-0.95 / else none)", () => {
  const A = prev(
    "key-a",
    "El miedo no es el enemigo; es una señal a escuchar.",
  );
  const B = prev("key-b", "La calma se entrena como un músculo, poco a poco.");

  it("matches on exact contentHash", () => {
    const nb = { content: A.content, contentHash: A.contentHash };
    expect(matchBlock(nb, [A, B])).toEqual({
      kind: "exact-hash",
      blockKey: "key-a",
    });
  });

  it("matches on carried exact blockKey even if text changed", () => {
    const nb = {
      content: "texto reescrito",
      contentHash: contentHash("texto reescrito"),
      blockKey: "key-b",
    };
    expect(matchBlock(nb, [A, B])).toEqual({
      kind: "exact-key",
      blockKey: "key-b",
    });
  });

  it("accepts a UNIQUE fuzzy candidate at >= 0.95", () => {
    const edited = "El miedo no es el enemigo, es una señal a escuchar.";
    const nb = { content: edited, contentHash: contentHash(edited) };
    const r = matchBlock(nb, [A, B]);
    expect(r.kind).toBe("fuzzy-unique");
    if (r.kind === "fuzzy-unique") expect(r.blockKey).toBe("key-a");
  });

  it("returns none when TWO candidates clear 0.95 (ambiguous ⇒ tombstone)", () => {
    const near1 = prev("k1", "Una frase casi idéntica de prueba uno.");
    const near2 = prev("k2", "Una frase casi idéntica de prueba uns."); // 1-char apart
    const nb = {
      content: "Una frase casi idéntica de prueba una.",
      contentHash: contentHash("Una frase casi idéntica de prueba una."),
    };
    // both near1 and near2 are within 0.95 of nb → ambiguous
    expect(matchBlock(nb, [near1, near2]).kind).toBe("none");
  });

  it("returns none when nothing clears 0.95", () => {
    const nb = {
      content: "Texto sin relación alguna con los previos.",
      contentHash: contentHash("Texto sin relación alguna con los previos."),
    };
    expect(matchBlock(nb, [A, B]).kind).toBe("none");
  });
});
