import { projectReaderBlocks, type ContentUnitRead } from "@psico/types";

/**
 * CC-6B common reader-model projection (mobile mirror).
 *
 * The web suite (`apps/web/.../reader-projection.test.ts`) asserts the byte-
 * identical fixture → byte-identical model through the SAME shared function.
 * That's the guarantee: the web reader model === the mobile reader model,
 * because both platforms call `projectReaderBlocks` from @psico/types. Keep
 * SHARED_UNIT and EXPECTED_MODEL here in lockstep with the web mirror.
 */

const SHARED_UNIT: ContentUnitRead = {
  editionKey: "libro-x-1e",
  revisionNumber: 3,
  unitKey: "unit-key-1",
  title: "Capítulo 1",
  summary: null,
  order: 1,
  partNumber: 1,
  partTitle: "Parte 1",
  source: "content-core",
  blocks: [
    {
      blockKey: "bk-2",
      legacyBlockId: "legacy-2",
      blockVersionId: "bv-2",
      kind: "PARAGRAPH",
      order: 2,
      content: "Segundo.",
      meta: null,
    },
    {
      blockKey: "bk-1",
      legacyBlockId: "legacy-1",
      blockVersionId: "bv-1",
      kind: "HEADING",
      order: 1,
      content: "Primero.",
      meta: { level: 2 },
    },
    {
      blockKey: "bk-3",
      legacyBlockId: null,
      blockVersionId: "bv-3",
      kind: "PARAGRAPH",
      order: 3,
      content: "Tercero.",
      meta: null,
    },
  ],
};

const EXPECTED_MODEL = [
  {
    id: "legacy-1",
    order: 1,
    kind: "HEADING",
    content: "Primero.",
    meta: { level: 2 },
    blockKey: "bk-1",
    blockVersionId: "bv-1",
  },
  {
    id: "legacy-2",
    order: 2,
    kind: "PARAGRAPH",
    content: "Segundo.",
    meta: null,
    blockKey: "bk-2",
    blockVersionId: "bv-2",
  },
  {
    id: "bk-3",
    order: 3,
    kind: "PARAGRAPH",
    content: "Tercero.",
    meta: null,
    blockKey: "bk-3",
    blockVersionId: "bv-3",
  },
];

describe("projectReaderBlocks (CC-6B, mobile mirror)", () => {
  it("produces the mobile reader model that equals the web expectation", () => {
    expect(projectReaderBlocks(SHARED_UNIT)).toEqual(EXPECTED_MODEL);
  });

  it("keeps id = legacyBlockId ?? blockKey and sorts by order", () => {
    const ids = projectReaderBlocks(SHARED_UNIT).map((b) => b.id);
    expect(ids).toEqual(["legacy-1", "legacy-2", "bk-3"]);
  });
});
