import { describe, expect, it } from "vitest";
import { contentHash } from "./content-hash";
import type { PrevBlock } from "./matcher";
import {
  buildNextManifest,
  planUnitIngest,
  validateManifest,
} from "./revision-manifest";
import type { ManifestEntry } from "./revision-manifest";

function prevBlock(blockKey: string, content: string): PrevBlock {
  return {
    blockKey,
    kind: "PARAGRAPH",
    content,
    contentHash: contentHash(content),
  };
}
function nb(content: string, order: number) {
  return {
    kind: "PARAGRAPH",
    content,
    contentHash: contentHash(content),
    order,
  };
}

describe("content-core · RevisionManifest (copy forward, swap one unit)", () => {
  const manifest: ManifestEntry[] = [
    {
      unitKey: "u-1",
      unitVersionId: "v1a",
      order: 0,
      partNumber: 1,
      partTitle: "Parte I",
    },
    {
      unitKey: "u-2",
      unitVersionId: "v2a",
      order: 1,
      partNumber: 1,
      partTitle: "Parte I",
    },
    {
      unitKey: "u-3",
      unitVersionId: "v3a",
      order: 2,
      partNumber: 2,
      partTitle: "Parte II",
    },
  ];

  it("copies every OTHER unit unchanged and swaps only the changed unit", () => {
    const next = buildNextManifest(manifest, "u-2", "v2b", {
      order: 1,
      partNumber: 1,
      partTitle: "Parte I",
    });
    expect(next.find((e) => e.unitKey === "u-1")!.unitVersionId).toBe("v1a");
    expect(next.find((e) => e.unitKey === "u-3")!.unitVersionId).toBe("v3a");
    expect(next.find((e) => e.unitKey === "u-2")!.unitVersionId).toBe("v2b");
    expect(next).toHaveLength(3);
  });

  it("appends a never-before-seen unit", () => {
    const next = buildNextManifest(manifest, "u-4", "v4a", {
      order: 3,
      partNumber: 2,
      partTitle: "Parte II",
    });
    expect(next).toHaveLength(4);
    expect(next.at(-1)).toMatchObject({
      unitKey: "u-4",
      unitVersionId: "v4a",
      order: 3,
    });
  });

  it("throws MANIFEST_PLACEMENT_COLLISION when the new order hits another unit", () => {
    expect(() =>
      // u-4 wants order 1, already held by u-2
      buildNextManifest(manifest, "u-4", "v4a", {
        order: 1,
        partNumber: 1,
        partTitle: "Parte I",
      }),
    ).toThrow("MANIFEST_PLACEMENT_COLLISION");
  });

  it("produces a manifest that passes validateManifest", () => {
    const next = buildNextManifest(manifest, "u-2", "v2b", {
      order: 1,
      partNumber: 1,
      partTitle: "Parte I",
    });
    expect(() => validateManifest(next)).not.toThrow();
  });
});

describe("content-core · validateManifest (pure invariants)", () => {
  it("throws DUPLICATE_MANIFEST_UNIT on a repeated unitKey", () => {
    expect(() =>
      validateManifest([
        {
          unitKey: "u-1",
          unitVersionId: "a",
          order: 0,
          partNumber: null,
          partTitle: null,
        },
        {
          unitKey: "u-1",
          unitVersionId: "b",
          order: 1,
          partNumber: null,
          partTitle: null,
        },
      ]),
    ).toThrow("DUPLICATE_MANIFEST_UNIT");
  });

  it("throws DUPLICATE_MANIFEST_ORDER on a repeated order", () => {
    expect(() =>
      validateManifest([
        {
          unitKey: "u-1",
          unitVersionId: "a",
          order: 0,
          partNumber: null,
          partTitle: null,
        },
        {
          unitKey: "u-2",
          unitVersionId: "b",
          order: 0,
          partNumber: null,
          partTitle: null,
        },
      ]),
    ).toThrow("DUPLICATE_MANIFEST_ORDER");
  });

  it("accepts a valid manifest", () => {
    expect(() =>
      validateManifest([
        {
          unitKey: "u-1",
          unitVersionId: "a",
          order: 0,
          partNumber: null,
          partTitle: null,
        },
        {
          unitKey: "u-2",
          unitVersionId: "b",
          order: 1,
          partNumber: null,
          partTitle: null,
        },
      ]),
    ).not.toThrow();
  });
});

describe("content-core · planUnitIngest (identity carried by the diff)", () => {
  const mint = (i: number) => `NEW-${i}`;
  const prev: PrevBlock[] = [
    prevBlock("k-a", "Primer párrafo sobre el miedo."),
    prevBlock("k-b", "Segundo párrafo sobre la calma."),
    prevBlock("k-c", "Tercer párrafo sobre la práctica diaria."),
  ];

  it("reorder keeps every key (no minting, no tombstones)", () => {
    const plan = planUnitIngest(
      prev,
      [
        nb("Tercer párrafo sobre la práctica diaria.", 0),
        nb("Primer párrafo sobre el miedo.", 1),
        nb("Segundo párrafo sobre la calma.", 2),
      ],
      mint,
    );
    expect(plan.blocks.map((b) => b.blockKey)).toEqual(["k-c", "k-a", "k-b"]);
    expect(plan.blocks.every((b) => b.origin === "matched-exact")).toBe(true);
    expect(plan.tombstonedKeys).toEqual([]);
  });

  it("a unique small edit keeps the key (fuzzy) and marks it shifted-eligible", () => {
    const plan = planUnitIngest(
      prev,
      [
        nb("Primer parrafo sobre el miedo.", 0), // dropped accent → 1-char edit
        nb("Segundo párrafo sobre la calma.", 1),
        nb("Tercer párrafo sobre la práctica diaria.", 2),
      ],
      mint,
    );
    expect(plan.blocks[0].blockKey).toBe("k-a");
    expect(plan.blocks[0].origin).toBe("matched-fuzzy");
    expect(plan.tombstonedKeys).toEqual([]);
  });

  it("inserting a new block above keeps existing keys; the insert gets a fresh key", () => {
    const plan = planUnitIngest(
      prev,
      [
        nb("Un intro totalmente nuevo, sin parecido a los previos aquí.", 0),
        nb("Primer párrafo sobre el miedo.", 1),
        nb("Segundo párrafo sobre la calma.", 2),
        nb("Tercer párrafo sobre la práctica diaria.", 3),
      ],
      mint,
    );
    expect(plan.blocks[0].origin).toBe("new");
    expect(plan.blocks[0].blockKey).toBe("NEW-0");
    expect(plan.blocks.slice(1).map((b) => b.blockKey)).toEqual([
      "k-a",
      "k-b",
      "k-c",
    ]);
    expect(plan.tombstonedKeys).toEqual([]);
  });

  it("removing a block tombstones its key (retained, not deleted)", () => {
    const plan = planUnitIngest(
      prev,
      [
        nb("Primer párrafo sobre el miedo.", 0),
        nb("Tercer párrafo sobre la práctica diaria.", 1),
      ],
      mint,
    );
    expect(plan.blocks.map((b) => b.blockKey)).toEqual(["k-a", "k-c"]);
    expect(plan.tombstonedKeys).toEqual(["k-b"]);
  });

  it("byte-identical re-ingest is an empty diff (all matched, none tombstoned)", () => {
    const plan = planUnitIngest(
      prev,
      [
        nb("Primer párrafo sobre el miedo.", 0),
        nb("Segundo párrafo sobre la calma.", 1),
        nb("Tercer párrafo sobre la práctica diaria.", 2),
      ],
      mint,
    );
    expect(plan.blocks.every((b) => b.origin === "matched-exact")).toBe(true);
    expect(plan.tombstonedKeys).toEqual([]);
  });
});
