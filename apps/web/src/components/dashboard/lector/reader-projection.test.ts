import { describe, expect, it } from "vitest";
import { projectReaderBlocks, type ContentUnitRead } from "@psico/types";

/**
 * CC-6B common reader-model projection.
 *
 * `projectReaderBlocks` is the SINGLE source of truth both web and mobile use
 * to turn a Content Core unit into the reader's block model — so the web reader
 * model and the mobile reader model are identical BY CONSTRUCTION. The mobile
 * suite (`apps/mobile`) runs the same fixture through the same function and
 * expects this same output; keep the two expectations in lockstep.
 */

// Shared fixture — the mobile mirror uses the byte-identical object.
export const SHARED_UNIT: ContentUnitRead = {
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
    // Deliberately out of order — projection must sort by `order`.
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
      // Pure Content Core block — no legacy binding; id falls back to blockKey.
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

// The one reader model both platforms must produce from SHARED_UNIT.
export const EXPECTED_MODEL = [
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

describe("projectReaderBlocks (CC-6B)", () => {
  it("sorts by editorial order, keeps id = legacyBlockId ?? blockKey, carries blockKey", () => {
    expect(projectReaderBlocks(SHARED_UNIT)).toEqual(EXPECTED_MODEL);
  });

  it("produces the web reader model that the mobile suite also expects", () => {
    // This exact object is asserted in apps/mobile's mirror test. If you change
    // one, change the other — the whole point is web === mobile.
    expect(projectReaderBlocks(SHARED_UNIT)).toStrictEqual(EXPECTED_MODEL);
  });

  it("legacy-sourced units project identically (source is not part of the model)", () => {
    const legacy: ContentUnitRead = { ...SHARED_UNIT, source: "legacy" };
    expect(projectReaderBlocks(legacy)).toEqual(EXPECTED_MODEL);
  });
});
