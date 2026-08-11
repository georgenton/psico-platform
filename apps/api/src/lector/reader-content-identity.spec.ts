import { describe, expect, it } from "vitest";
import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";

/**
 * A stable URL must name the chapter AND its words.
 *
 * The canonical routes fixed which chapter a URL names. They did not, at first,
 * fix which unit's TEXT got read: the loader still found "the unit at this
 * order". After a structural change that renders one chapter's title above
 * another chapter's paragraphs — the exact failure the phase exists to prevent,
 * wearing a fixed URL as a disguise.
 *
 * The envelope now carries the content identity, decided server-side. These pin
 * that it is derived from the CHAPTER, never from where the chapter sits.
 */

describe("the content read identity", () => {
  it("is deterministic per legacy chapter, and independent of position", () => {
    const key = unitKeyFromLegacyChapterId("chapter-B");
    // Same chapter, whatever order it occupies — the derivation never sees one.
    expect(unitKeyFromLegacyChapterId("chapter-B")).toBe(key);
    expect(unitKeyFromLegacyChapterId("chapter-A")).not.toBe(key);
  });

  it("distinguishes the chapter from whatever now occupies its old position", () => {
    // B was at order 2 and moved; A now sits there. A content read keyed by
    // position would return A's text for B's URL.
    const b = unitKeyFromLegacyChapterId("chapter-B");
    const a = unitKeyFromLegacyChapterId("chapter-A");
    expect(b).not.toBe(a);
  });

  it("keeps the three identities separate", () => {
    // readerRef      → serving identity in the URL
    // contentUnitId  → native write identity, null for legacy
    // contentUnitKey → content read identity, present for both
    //
    // A legacy chapter has a content key AND no write unit id. Collapsing them
    // would either make the legacy reader unit-first or leave its text
    // unreadable by key.
    const legacy = {
      readerRef: { kind: "chapter" as const, id: "chapter-B" },
      contentUnitId: null,
      contentUnitKey: unitKeyFromLegacyChapterId("chapter-B"),
    };
    expect(legacy.contentUnitId).toBeNull();
    expect(legacy.contentUnitKey).toBeTruthy();
    expect(legacy.contentUnitKey).not.toBe(legacy.readerRef.id);
  });
});
