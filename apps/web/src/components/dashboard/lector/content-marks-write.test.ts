import { describe, expect, it } from "vitest";
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

describe("highlightWritePayload (CC-6D)", () => {
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

  it("#579: content-core without a blockVersionId THROWS", () => {
    // Not a weaker anchor — a body the server refuses with
    // SOURCE_BLOCK_VERSION_REQUIRED. Failing here says what is missing, instead
    // of turning a contract error into a network error the reader is shown.
    expect(() =>
      highlightWritePayload({
        source: "content-core",
        blockKey: "bk-1",
        blockVersionId: null,
        legacyBlockId: "legacy-1",
        startOffset: 0,
        endOffset: 5,
        color: "BLUE",
      }),
    ).toThrow("MARK_WRITE_MISSING_BLOCK_VERSION_ID");
  });

  it("#579: the missing-blockKey error still wins when BOTH are absent", () => {
    // Order matters only so the message names the more fundamental problem.
    expect(() =>
      highlightWritePayload({
        source: "content-core",
        blockKey: null,
        blockVersionId: null,
        legacyBlockId: "legacy-1",
        startOffset: 0,
        endOffset: 5,
        color: "PINK",
      }),
    ).toThrow("MARK_WRITE_MISSING_BLOCK_KEY");
  });

  it("#579: a legacy write is unaffected by the new requirement", () => {
    // Legacy blocks have no BlockVersion behind them at all; requiring one
    // would make every legacy highlight impossible.
    const p = highlightWritePayload({
      source: "legacy",
      blockKey: null,
      blockVersionId: null,
      legacyBlockId: "legacy-1",
      startOffset: 2,
      endOffset: 9,
      color: "YELLOW",
    });
    expect(p).toEqual({
      blockId: "legacy-1",
      startOffset: 2,
      endOffset: 9,
      color: "YELLOW",
    });
  });

  it("#579: anchors the version the reader READ, not the one published since", () => {
    // The reader opened V1. An editor published V2 while the tab stayed open.
    // The selection still came from the text on screen, so the mark must point
    // at V1 — migrating it to V2 would claim they highlighted words they never
    // saw.
    const readVersion = "bv-v1";
    const publishedSince = "bv-v2";

    const p = highlightWritePayload({
      source: "content-core",
      blockKey: "bk-stable",
      blockVersionId: readVersion,
      legacyBlockId: null,
      startOffset: 10,
      endOffset: 24,
      color: "PINK",
    });

    expect(p.blockVersionId).toBe(readVersion);
    expect(p.blockVersionId).not.toBe(publishedSince);
    // The block identity is stable across versions; only the version moves.
    expect(p.blockKey).toBe("bk-stable");
  });
});

describe("annotationWritePayload (CC-6D)", () => {
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

describe("shouldFetchUnitMarks (CC-6D)", () => {
  it("a legacy unit does NOT hit the marks surface (uses the envelope)", () => {
    expect(shouldFetchUnitMarks("legacy")).toBe(false);
  });
  it("a content-core unit MUST hit the marks surface", () => {
    expect(shouldFetchUnitMarks("content-core")).toBe(true);
  });
});

describe("classifyMarksReadFailure (CC-6D)", () => {
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
