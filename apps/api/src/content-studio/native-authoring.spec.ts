import { describe, expect, it } from "vitest";
import {
  hasPublishableContent,
  listEditorialChapters,
  newNativeUnitKey,
  NEW_CHAPTER_SCAFFOLD,
} from "./native-authoring";
import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";

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

/**
 * Legacy backing is an identity question.
 *
 * Exercised against a hand-built manifest rather than a database, so the RULE is
 * what is pinned: a unit is legacy-backed when its key matches a real chapter's
 * derived key, and never because it happens to sit where a chapter used to.
 * The database-shaped proof lives in `native-structure.pg-spec.ts`.
 */
describe("classifying a chapter", () => {
  const CH_ID = "chapter_legacy_1";
  const LEGACY_KEY = unitKeyFromLegacyChapterId(CH_ID);

  /**
   * A minimal stand-in for the queries `listEditorialChapters` makes. Every
   * fixture below is a book with one published revision and no draft.
   */
  function db(input: {
    manifest: Array<{ order: number; unitKey: string; title: string }>;
    legacy: Array<{ id: string; order: number; title: string }>;
  }) {
    return {
      edition: {
        findFirst: async () => ({ id: "ed_1", publishedRevisionId: "r1" }),
        findUnique: async () => ({ publishedRevisionId: "r1" }),
      },
      revision: { findFirst: async () => null },
      revisionUnit: {
        findMany: async (args: {
          select?: Record<string, unknown>;
        }): Promise<unknown[]> => {
          if (args.select && "unitId" in args.select) {
            return input.manifest.map((m) => ({ unitId: m.unitKey }));
          }
          return input.manifest.map((m) => ({
            order: m.order,
            partNumber: null,
            partTitle: null,
            unit: { id: m.unitKey, unitKey: m.unitKey },
            unitVersion: { title: m.title },
          }));
        },
      },
      chapter: { findMany: async () => input.legacy },
    } as never;
  }

  it("calls a unit legacy-backed when its key is the chapter's derived key", async () => {
    const { chapters, chapterCreationAvailable } = await listEditorialChapters(
      db({
        manifest: [{ order: 1, unitKey: LEGACY_KEY, title: "Uno" }],
        legacy: [{ id: CH_ID, order: 1, title: "Uno" }],
      }),
      { bookId: "b1", bookSlug: "libro" },
    );

    expect(chapters[0]!.titleEditable).toBe(false);
    expect(chapters[0]!.mediaAdminAvailable).toBe(true);
    expect(chapterCreationAvailable).toBe(true);
  });

  it("does not call a native unit legacy-backed for sharing a position", async () => {
    // The exact regression: same order, different identity. Position is not
    // identity, so the native unit keeps its own capabilities.
    const structure = await listEditorialChapters(
      db({
        manifest: [{ order: 1, unitKey: "native-uuid", title: "Nativo" }],
        legacy: [{ id: CH_ID, order: 1, title: "Legacy" }],
      }),
      { bookId: "b1", bookSlug: "libro" },
    );

    const native = structure.chapters.find((c) => c.unitKey === "native-uuid")!;
    expect(native.titleEditable).toBe(true);
    expect(native.mediaAdminAvailable).toBe(false);
    expect(structure.structureConflict).toBe(true);
    expect(structure.chapterCreationAvailable).toBe(false);
  });

  it("marks a chapter un-ingested by its derived key, not by a free position", async () => {
    const structure = await listEditorialChapters(
      db({
        manifest: [{ order: 1, unitKey: LEGACY_KEY, title: "Uno" }],
        legacy: [
          { id: CH_ID, order: 1, title: "Uno" },
          { id: "chapter_orphan", order: 2, title: "Dos" },
        ],
      }),
      { bookId: "b1", bookSlug: "libro" },
    );

    expect(structure.chapters.map((c) => c.ingested)).toEqual([true, false]);
    expect(structure.unsyncedLegacyCount).toBe(1);
    // No conflict: nothing else claims order 2. Just not adopted yet.
    expect(structure.structureConflict).toBe(false);
    expect(structure.chapterCreationAvailable).toBe(false);
    expect(structure.creationBlockedReason).toBe("PENDING_SYNC");
  });

  it("offers no editable surface for an un-ingested chapter", async () => {
    const { chapters } = await listEditorialChapters(
      db({
        manifest: [],
        legacy: [{ id: CH_ID, order: 1, title: "Uno" }],
      }),
      { bookId: "b1", bookSlug: "libro" },
    );

    expect(chapters[0]!.ingested).toBe(false);
    expect(chapters[0]!.contentUnitId).toBeNull();
    expect(chapters[0]!.titleEditable).toBe(false);
    // Nothing to administer either: Content Studio administers units.
    expect(chapters[0]!.mediaAdminAvailable).toBe(false);
  });

  it("allows creation on a book whose structure is fully adopted", async () => {
    const structure = await listEditorialChapters(
      db({
        manifest: [
          { order: 1, unitKey: LEGACY_KEY, title: "Uno" },
          { order: 2, unitKey: "native-uuid", title: "Dos" },
        ],
        legacy: [{ id: CH_ID, order: 1, title: "Uno" }],
      }),
      { bookId: "b1", bookSlug: "libro" },
    );

    expect(structure.chapterCreationAvailable).toBe(true);
    expect(structure.creationBlockedReason).toBeNull();
    expect(structure.unsyncedLegacyCount).toBe(0);
  });
});
