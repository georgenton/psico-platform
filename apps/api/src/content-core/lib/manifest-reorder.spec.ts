import { describe, expect, it } from "vitest";
import { reorderManifest } from "./manifest-reorder";

/**
 * The permutation rule, without a database.
 *
 * Everything reorder must never do — renumber, drop, duplicate, move a chapter
 * out of its part, edit content — is decidable from the manifest alone, so it
 * is decided here.
 */

const e = (
  order: number,
  unitKey: string,
  part: [number, string] | null = null,
) => ({
  order,
  unitKey,
  unitVersionId: `v-${unitKey}`,
  unitId: `u-${unitKey}`,
  partNumber: part?.[0] ?? null,
  partTitle: part?.[1] ?? null,
});

const seq = (rows: ReturnType<typeof reorderManifest<ReturnType<typeof e>>>) =>
  [...rows].sort((a, b) => a.order - b.order).map((r) => r.unitKey);

describe("reorderManifest", () => {
  it("swaps two chapters", () => {
    const out = reorderManifest([e(1, "A"), e(2, "B")], [2, 1]);
    expect(seq(out)).toEqual(["B", "A"]);
  });

  it("applies an arbitrary permutation", () => {
    const out = reorderManifest([e(1, "A"), e(2, "B"), e(3, "C")], [3, 1, 2]);
    expect(seq(out)).toEqual(["C", "A", "B"]);
  });

  it("permutes the EXISTING slots and does not densify them", () => {
    // A discard left a gap at 2. Closing it would move a chapter the editor
    // never asked to move, and positions are still what URLs use.
    const out = reorderManifest([e(1, "A"), e(3, "B"), e(4, "C")], [4, 1, 3]);

    expect(out.map((r) => r.order).sort((a, b) => a - b)).toEqual([1, 3, 4]);
    expect(out.find((r) => r.unitKey === "C")!.order).toBe(1);
    expect(out.find((r) => r.unitKey === "A")!.order).toBe(3);
    expect(out.find((r) => r.unitKey === "B")!.order).toBe(4);
  });

  it("carries every other field through untouched", () => {
    const before = [e(1, "A"), e(2, "B")];
    const out = reorderManifest(before, [2, 1]);

    for (const row of out) {
      const original = before.find((b) => b.unitKey === row.unitKey)!;
      // Content identity and version are what a reorder must not touch: the
      // reader's marks hang off them.
      expect(row.unitId).toBe(original.unitId);
      expect(row.unitVersionId).toBe(original.unitVersionId);
    }
    // And the input itself is not mutated — the caller still holds the base.
    expect(before.map((b) => b.order)).toEqual([1, 2]);
  });

  it("keeps a chapter's part with the chapter", () => {
    const out = reorderManifest(
      [e(1, "A", [1, "Parte I"]), e(2, "B", [1, "Parte I"])],
      [2, 1],
    );
    for (const row of out) {
      expect(row.partNumber).toBe(1);
      expect(row.partTitle).toBe("Parte I");
    }
  });

  it("reorders within each part independently", () => {
    const manifest = [
      e(1, "A", [1, "Parte I"]),
      e(2, "B", [1, "Parte I"]),
      e(3, "C", [2, "Parte II"]),
      e(4, "D", [2, "Parte II"]),
    ];
    expect(seq(reorderManifest(manifest, [2, 1, 3, 4]))).toEqual([
      "B",
      "A",
      "C",
      "D",
    ]);
    expect(seq(reorderManifest(manifest, [1, 2, 4, 3]))).toEqual([
      "A",
      "B",
      "D",
      "C",
    ]);
  });

  it("refuses to move a chapter into another part", () => {
    const manifest = [
      e(1, "A", [1, "Parte I"]),
      e(2, "B", [1, "Parte I"]),
      e(3, "C", [2, "Parte II"]),
      e(4, "D", [2, "Parte II"]),
    ];
    // C would land in slot 2, which belongs to Parte I.
    expect(() => reorderManifest(manifest, [1, 3, 2, 4])).toThrow(
      /CONTENT_REORDER_ACROSS_PARTS_UNSUPPORTED/,
    );
  });

  it("refuses a repeated position", () => {
    expect(() => reorderManifest([e(1, "A"), e(2, "B")], [1, 1])).toThrow(
      /CONTENT_REORDER_DUPLICATE_ORDER/,
    );
  });

  it("refuses a position the manifest does not have", () => {
    expect(() => reorderManifest([e(1, "A"), e(2, "B")], [1, 9])).toThrow(
      /CONTENT_REORDER_UNKNOWN_ORDER/,
    );
  });

  it("refuses a request that leaves a chapter out", () => {
    // Not an instruction to delete B. Refused, and nothing is interpreted.
    expect(() => reorderManifest([e(1, "A"), e(2, "B")], [1])).toThrow(
      /CONTENT_REORDER_INCOMPLETE/,
    );
  });

  it("refuses an empty manifest", () => {
    expect(() => reorderManifest([], [])).toThrow(/CONTENT_REORDER_EMPTY/);
  });

  it("accepts the identity permutation without changing anything", () => {
    const out = reorderManifest([e(1, "A"), e(2, "B"), e(3, "C")], [1, 2, 3]);
    expect(seq(out)).toEqual(["A", "B", "C"]);
  });
});
