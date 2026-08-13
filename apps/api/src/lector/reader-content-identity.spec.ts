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

/**
 * A stable legacy route must not round-trip through position.
 *
 * `c/:chapterId` used to resolve the chapter, take its current order, and then
 * call the POSITIONAL reader with that number. Correct in a still structure —
 * and a time-of-check/time-of-use gap in a moving one: between the two steps a
 * different chapter can occupy that position, and the URL would name B while
 * the reader served whoever replaced it.
 *
 * The envelope is now built from the chapter's own id, and the order is derived
 * from the row that was fetched.
 */
describe("the legacy stable route", () => {
  it("never re-enters the positional reader", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL("./lector.service.ts", import.meta.url).pathname,
        "utf8",
      ),
    );
    // `getChapterByRef` must hand the chapter ID to the envelope builder. If
    // this ever becomes `getChapter(..., target.order)` again, the race is back.
    const byRef = src.slice(src.indexOf("async getChapterByRef"));
    const body = byRef.slice(0, byRef.indexOf("\n  // ─── GET"));
    expect(body).toContain("this.getLegacyChapter(");
    expect(body).not.toMatch(/this\.getChapter\(/);
    expect(body).not.toMatch(/target\.order/);
  });

  it("derives the order from the published placement, never the caller or the row", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL("./lector.service.ts", import.meta.url).pathname,
        "utf8",
      ),
    );
    const builder = src.slice(src.indexOf("private async getLegacyChapter"));
    // Scoped by book, found by id — a chapter from another book is never in hand.
    expect(builder).toContain("where: { id: chapterId, bookId: book.id }");
    // MANIFEST_POSITION_AUTHORITY_RATCHET (Phase B.B, Model A).
    //
    // The order used to come from `chapter.order`. That column is now allowed
    // to go stale, so reading it here would report a position the book no
    // longer has. It comes from the resolved placement — and still never from
    // the caller, which was this test's original point.
    expect(builder).toContain("const chapterOrder = placement.order;");
    expect(builder).not.toContain("const chapterOrder = chapter.order;");
  });
});
