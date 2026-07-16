import { describe, expect, it } from "vitest";
import { contentHash, normalizeContent, similarity } from "./content-hash";

describe("content-core · content-hash + similarity", () => {
  it("normalizes whitespace + trims, preserves case", () => {
    expect(normalizeContent("  Hola   \n  mundo  ")).toBe("Hola mundo");
    expect(normalizeContent("MAYÚS")).toBe("MAYÚS");
  });

  it("hash is stable under whitespace-only differences", () => {
    expect(contentHash("un   párrafo\n\naquí")).toBe(
      contentHash("un párrafo aquí"),
    );
  });

  it("hash differs when the text differs", () => {
    expect(contentHash("párrafo a")).not.toBe(contentHash("párrafo b"));
  });

  it("similarity is 1 for identical (post-normalization) text", () => {
    expect(similarity("hola  mundo", "hola mundo")).toBe(1);
  });

  it("similarity is high for a small edit and below 0.95 for a large one", () => {
    const base = "El miedo no es el enemigo; es una señal.";
    const typo = "El miedo no es el enemigo, es una señal.";
    expect(similarity(base, typo)).toBeGreaterThan(0.95);
    expect(
      similarity(base, "Una frase completamente distinta y más larga."),
    ).toBeLessThan(0.95);
  });

  it("similarity of two empty strings is 1", () => {
    expect(similarity("", "")).toBe(1);
  });
});
