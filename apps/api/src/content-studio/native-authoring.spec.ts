import { describe, expect, it } from "vitest";
import {
  hasPublishableContent,
  newNativeUnitKey,
  NEW_CHAPTER_SCAFFOLD,
} from "./native-authoring";

/**
 * The pure decisions in native authoring. The database-shaped ones live in the
 * real-Postgres suite; these are the rules that can be stated without one.
 */

describe("the identity a new chapter gets", () => {
  it("is opaque and unique", () => {
    const a = newNativeUnitKey();
    const b = newNativeUnitKey();
    expect(a).not.toBe(b);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("is not derived from anything an editor can change", () => {
    // The real property: identity does not depend on title, position or
    // content, so changing any of them cannot change it. Two chapters created
    // with identical everything still get distinct, unrelated keys — which is
    // what makes a reader's progress survive a rename or a move.
    const keys = new Set(Array.from({ length: 50 }, () => newNativeUnitKey()));
    expect(keys.size).toBe(50);
  });
});

describe("what a new chapter starts as", () => {
  it("is a single empty paragraph, with no placeholder prose", () => {
    // Anything written here would be publishable content nobody typed.
    expect(NEW_CHAPTER_SCAFFOLD).toHaveLength(1);
    expect(NEW_CHAPTER_SCAFFOLD[0]!.kind).toBe("PARAGRAPH");
    expect(NEW_CHAPTER_SCAFFOLD[0]!.content).toBe("");
  });

  it("is not publishable as-is", () => {
    expect(
      hasPublishableContent({
        title: "Un título",
        blocks: [...NEW_CHAPTER_SCAFFOLD],
      }),
    ).toBe(false);
  });
});

describe("whether a new chapter may be published", () => {
  it("needs a title", () => {
    expect(
      hasPublishableContent({
        title: "   ",
        blocks: [{ kind: "PARAGRAPH", content: "Texto real." }],
      }),
    ).toBe(false);
  });

  it("needs at least one non-blank text block", () => {
    expect(
      hasPublishableContent({
        title: "Un título",
        blocks: [
          { kind: "PARAGRAPH", content: "  " },
          { kind: "PARAGRAPH", content: "\n" },
        ],
      }),
    ).toBe(false);
  });

  it("does not count an image as the chapter's text", () => {
    // A chapter that is only an illustration is almost certainly an accident
    // mid-edit, not something to ship to readers.
    expect(
      hasPublishableContent({
        title: "Un título",
        blocks: [{ kind: "IMAGE", content: "pie de foto" }],
      }),
    ).toBe(false);
  });

  it("accepts a real chapter", () => {
    expect(
      hasPublishableContent({
        title: "La mente que aprende",
        blocks: [
          { kind: "PARAGRAPH", content: "" },
          { kind: "PARAGRAPH", content: "Una idea." },
        ],
      }),
    ).toBe(true);
  });
});
