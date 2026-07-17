import {
  annotationWritePayload,
  classifyMarksReadFailure,
  highlightWritePayload,
  shouldFetchUnitMarks,
} from "@psico/types";

/**
 * CC-6D — the source-aware mark rule is SHARED (`@psico/types`), so web and
 * mobile build the exact same write payload and make the exact same read
 * decision BY CONSTRUCTION. This mirror lives in BOTH app suites
 * (apps/web + apps/mobile); if you change one, change the other — the whole
 * point is web === mobile.
 */

describe("highlightWritePayload (CC-6D, mobile mirror)", () => {
  it("legacy unit → blockId only (never blockKey/blockVersionId)", () => {
    const p = highlightWritePayload({
      source: "legacy",
      blockKey: "bk-1", // present, but must be ignored on the legacy path
      blockVersionId: "bv-1", // present, but must be ignored
      legacyBlockId: "legacy-1",
      startOffset: 0,
      endOffset: 5,
      color: "YELLOW",
    });
    expect(p).toEqual({
      blockId: "legacy-1",
      startOffset: 0,
      endOffset: 5,
      color: "YELLOW",
    });
    expect("blockKey" in p).toBe(false);
    expect("blockVersionId" in p).toBe(false);
  });

  it("content-core unit → blockKey + the read blockVersionId (never blockId)", () => {
    const p = highlightWritePayload({
      source: "content-core",
      blockKey: "bk-1",
      blockVersionId: "bv-1",
      legacyBlockId: "legacy-1", // present, but must be ignored
      startOffset: 0,
      endOffset: 5,
      color: "BLUE",
    });
    expect(p).toEqual({
      blockKey: "bk-1",
      blockVersionId: "bv-1",
      startOffset: 0,
      endOffset: 5,
      color: "BLUE",
    });
    expect("blockId" in p).toBe(false);
  });

  it("CC-6E: content-core without a blockKey THROWS (never an incomplete body)", () => {
    expect(() =>
      highlightWritePayload({
        source: "content-core",
        blockKey: null,
        blockVersionId: "bv-1",
        legacyBlockId: "legacy-1",
        startOffset: 0,
        endOffset: 5,
        color: "BLUE",
      }),
    ).toThrow("MARK_WRITE_MISSING_BLOCK_KEY");
  });

  it("CC-6E: legacy without a blockId THROWS", () => {
    expect(() =>
      highlightWritePayload({
        source: "legacy",
        blockKey: "bk-1",
        blockVersionId: "bv-1",
        legacyBlockId: null,
        startOffset: 0,
        endOffset: 5,
        color: "YELLOW",
      }),
    ).toThrow("MARK_WRITE_MISSING_BLOCK_ID");
  });
});

describe("annotationWritePayload (CC-6D, mobile mirror)", () => {
  it("legacy unit → blockId only", () => {
    const p = annotationWritePayload({
      source: "legacy",
      blockKey: "bk-1",
      legacyBlockId: "legacy-1",
      text: "hola",
    });
    expect(p).toEqual({ blockId: "legacy-1", text: "hola" });
    expect("blockKey" in p).toBe(false);
  });

  it("content-core unit → blockKey only", () => {
    const p = annotationWritePayload({
      source: "content-core",
      blockKey: "bk-1",
      legacyBlockId: "legacy-1",
      text: "hola",
    });
    expect(p).toEqual({ blockKey: "bk-1", text: "hola" });
    expect("blockId" in p).toBe(false);
  });

  it("CC-6E: content-core without a blockKey THROWS", () => {
    expect(() =>
      annotationWritePayload({
        source: "content-core",
        blockKey: null,
        legacyBlockId: "legacy-1",
        text: "hola",
      }),
    ).toThrow("MARK_WRITE_MISSING_BLOCK_KEY");
  });

  it("CC-6E: legacy without a blockId THROWS", () => {
    expect(() =>
      annotationWritePayload({
        source: "legacy",
        blockKey: "bk-1",
        legacyBlockId: null,
        text: "hola",
      }),
    ).toThrow("MARK_WRITE_MISSING_BLOCK_ID");
  });
});

describe("shouldFetchUnitMarks (CC-6D, mobile mirror)", () => {
  it("a legacy unit does NOT hit the marks surface (uses the envelope)", () => {
    expect(shouldFetchUnitMarks("legacy")).toBe(false);
  });
  it("a content-core unit MUST hit the marks surface", () => {
    expect(shouldFetchUnitMarks("content-core")).toBe(true);
  });
});

describe("classifyMarksReadFailure (CC-6D, mobile mirror)", () => {
  it("401/403 → auth (propagate; never a silent envelope fallback)", () => {
    expect(classifyMarksReadFailure(401)).toBe("auth");
    expect(classifyMarksReadFailure(403)).toBe("auth");
  });
  it("404/500/network → unavailable (visible; still never the envelope)", () => {
    expect(classifyMarksReadFailure(404)).toBe("unavailable");
    expect(classifyMarksReadFailure(500)).toBe("unavailable");
    expect(classifyMarksReadFailure(undefined)).toBe("unavailable");
  });
});
