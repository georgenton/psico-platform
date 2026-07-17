import { describe, expect, it } from "vitest";
import { contentHash } from "./content-hash";
import { matchBlock } from "./matcher";
import type { NewBlockInput, PrevBlock } from "./matcher";

function prev(blockKey: string, kind: string, content: string): PrevBlock {
  return { blockKey, kind, content, contentHash: contentHash(content) };
}
function nb(kind: string, content: string, blockKey?: string): NewBlockInput {
  return { kind, content, contentHash: contentHash(content), blockKey };
}

describe("content-core · matcher (fail-closed: same-kind, unambiguous only)", () => {
  const A = prev(
    "key-a",
    "PARAGRAPH",
    "El miedo no es el enemigo; es una señal a escuchar.",
  );
  const B = prev(
    "key-b",
    "PARAGRAPH",
    "La calma se entrena como un músculo, poco a poco.",
  );

  it("matches on a single same-kind exact contentHash", () => {
    expect(matchBlock(nb("PARAGRAPH", A.content), [A, B])).toEqual({
      kind: "exact-hash",
      blockKey: "key-a",
    });
  });

  it("carried exact blockKey wins unconditionally (even across kind/text)", () => {
    expect(
      matchBlock(nb("HEADING", "texto reescrito", "key-b"), [A, B]),
    ).toEqual({
      kind: "exact-key",
      blockKey: "key-b",
    });
  });

  it("TWO blocks with the same hash ⇒ none (never .find() the first)", () => {
    const d1 = prev("d1", "PARAGRAPH", "misma frase repetida");
    const d2 = prev("d2", "PARAGRAPH", "misma frase repetida");
    expect(
      matchBlock(nb("PARAGRAPH", "misma frase repetida"), [d1, d2]).kind,
    ).toBe("none");
  });

  it("same phrase in HEADING vs PARAGRAPH ⇒ no cross-kind match", () => {
    const heading = prev("h", "HEADING", "El miedo");
    expect(matchBlock(nb("PARAGRAPH", "El miedo"), [heading]).kind).toBe(
      "none",
    );
  });

  it("accepts a UNIQUE same-kind fuzzy candidate at >= 0.95", () => {
    const edited = "El miedo no es el enemigo, es una señal a escuchar.";
    const r = matchBlock(nb("PARAGRAPH", edited), [A, B]);
    expect(r.kind).toBe("fuzzy-unique");
    if (r.kind === "fuzzy-unique") expect(r.blockKey).toBe("key-a");
  });

  it("returns none when TWO same-kind candidates clear 0.95 (ambiguous)", () => {
    const near1 = prev(
      "k1",
      "PARAGRAPH",
      "Una frase casi idéntica de prueba uno.",
    );
    const near2 = prev(
      "k2",
      "PARAGRAPH",
      "Una frase casi idéntica de prueba uns.",
    );
    expect(
      matchBlock(nb("PARAGRAPH", "Una frase casi idéntica de prueba una."), [
        near1,
        near2,
      ]).kind,
    ).toBe("none");
  });

  it("returns none when nothing clears 0.95", () => {
    expect(
      matchBlock(
        nb("PARAGRAPH", "Texto sin relación alguna con los previos."),
        [A, B],
      ).kind,
    ).toBe("none");
  });
});
