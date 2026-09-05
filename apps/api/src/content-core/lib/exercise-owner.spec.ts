import { describe, expect, it } from "vitest";
import { unitKeyFromLegacyChapterId } from "./block-key";
import {
  exerciseOwnerOf,
  exerciseUnitKey,
  exerciseUnitWhere,
  ownerColumns,
  sameOwner,
} from "./exercise-owner";

/**
 * Ownership is the one thing every downstream resolver asks about, so the rule
 * lives in one place and is pinned here rather than re-derived per caller.
 */

const CHAPTER = "cmql50rvm00025nvvwpft991k";
const UNIT = "cu_native_c04";

describe("exercise ownership · exactly one owner", () => {
  it("reads a legacy owner", () => {
    expect(
      exerciseOwnerOf({ chapterId: CHAPTER, contentUnitId: null }),
    ).toEqual({ kind: "legacy", chapterId: CHAPTER });
  });

  it("reads a native owner", () => {
    expect(exerciseOwnerOf({ chapterId: null, contentUnitId: UNIT })).toEqual({
      kind: "native",
      contentUnitId: UNIT,
    });
  });

  it("refuses a row with NEITHER owner", () => {
    expect(
      exerciseOwnerOf({ chapterId: null, contentUnitId: null }),
    ).toBeNull();
  });

  it("refuses a row with BOTH owners", () => {
    // The DB CHECK makes this unreachable; if it ever is, it must not resolve
    // to whichever column the reader happened to look at first.
    expect(
      exerciseOwnerOf({ chapterId: CHAPTER, contentUnitId: UNIT }),
    ).toBeNull();
  });
});

describe("exercise ownership · resolving the owning unit", () => {
  it("a legacy owner resolves through the canonical key bridge", () => {
    expect(
      exerciseUnitWhere({ chapterId: CHAPTER, contentUnitId: null }),
    ).toEqual({ unitKey: unitKeyFromLegacyChapterId(CHAPTER) });
  });

  it("a native owner resolves by id, with no bridge", () => {
    expect(exerciseUnitWhere({ chapterId: null, contentUnitId: UNIT })).toEqual(
      { id: UNIT },
    );
  });

  it("an invalid row resolves to nothing at all", () => {
    expect(
      exerciseUnitWhere({ chapterId: null, contentUnitId: null }),
    ).toBeNull();
  });

  it("exerciseUnitKey answers only for legacy owners", () => {
    expect(exerciseUnitKey({ chapterId: CHAPTER, contentUnitId: null })).toBe(
      unitKeyFromLegacyChapterId(CHAPTER),
    );
    // Null, not a fabricated key: a native owner names an id, and minting a
    // key for it would reintroduce the assumption this change removed.
    expect(
      exerciseUnitKey({ chapterId: null, contentUnitId: UNIT }),
    ).toBeNull();
  });
});

describe("exercise ownership · drift detection", () => {
  it("ownerColumns keeps the XOR true by construction", () => {
    expect(ownerColumns({ kind: "legacy", chapterId: CHAPTER })).toEqual({
      chapterId: CHAPTER,
      contentUnitId: null,
    });
    expect(ownerColumns({ kind: "native", contentUnitId: UNIT })).toEqual({
      chapterId: null,
      contentUnitId: UNIT,
    });
  });

  it("a change of owner is drift, even with identical content", () => {
    const legacy = { chapterId: CHAPTER, contentUnitId: null };
    const native = { chapterId: null, contentUnitId: UNIT };
    expect(sameOwner(legacy, legacy)).toBe(true);
    expect(sameOwner(native, native)).toBe(true);
    // The case that matters: same exercise key, same words, different unit.
    expect(sameOwner(legacy, native)).toBe(false);
  });

  it("treats undefined and null as the same absence", () => {
    expect(
      sameOwner(
        { chapterId: CHAPTER, contentUnitId: undefined as never },
        {
          chapterId: CHAPTER,
          contentUnitId: null,
        },
      ),
    ).toBe(true);
  });
});
