import { describe, expect, it } from "vitest";

import {
  GUIDE_READER_ANCHOR,
  PAREJAS_READER_ANCHOR,
  type GuideReaderAnchorLocator,
} from "@psico/types";
import {
  PRODUCTION_GUIDE_DEFINITIONS,
  productionGuideRegistry,
} from "../guide/guide-catalog";
import {
  guideAnchorAppliesToChapter,
  selectableGuidesForChapter,
} from "./experience-guide-options";
import type { ChapterBindingView } from "./experience-binding-reservation";

/**
 * C.4 (#639) — the catalog and the anchors have to agree, and the CMS is what
 * makes that agreement load-bearing.
 *
 * Before C.4 an anchor was a runtime detail: the discovery catalog resolved one
 * pin per chapter and the Player either found the passage or rendered «No
 * disponible aquí». Now the anchors ARE the menu an editor is offered. A guide
 * with no anchor is invisible to the CMS forever; an anchor naming a guide the
 * registry does not have is an option that would fail at publish; and two
 * anchors on one guide would offer the same lineage in two chapters, which is
 * exactly the cross-chapter binding this issue forbids.
 *
 * None of those fail loudly on their own. A catalog can grow one of them and
 * everything keeps compiling — which is what a ratchet is for.
 */

const ANCHORS: readonly GuideReaderAnchorLocator[] = [
  GUIDE_READER_ANCHOR,
  PAREJAS_READER_ANCHOR,
];

/** No reservations and no code-owned claims: availability is not the subject. */
const EMPTY_VIEW: ChapterBindingView = {
  reserved: new Map(),
  reservedBy: new Map(),
  scanned: new Map(),
  scannedBy: new Map(),
};

describe("ratchet · every anchor resolves an exact guide", () => {
  for (const anchor of ANCHORS) {
    it(`${anchor.guideKey} v${anchor.guideVersion} exists in the registry`, () => {
      // `selectableGuidesForChapter` silently skips an anchor whose guide is
      // missing — the right runtime behaviour, and the reason a broken anchor
      // would show up as "that guide is not offered any more" rather than as an
      // error. This is where it shows up as an error.
      const definition = productionGuideRegistry.getExact(
        anchor.guideKey,
        anchor.guideVersion,
      );
      expect(definition.steps.length).toBeGreaterThan(0);
    });
  }

  it("no guide carries two anchors", () => {
    // Two anchors on one lineage would offer the same guide in two chapters,
    // and the first editor to take it would silently make it unavailable in the
    // other — a cross-chapter binding arriving by the back door
    // (CROSS_CHAPTER_GUIDE_BINDING=forbidden).
    const seen = new Set<string>();
    for (const anchor of ANCHORS) {
      const key = `${anchor.guideKey}@${anchor.guideVersion}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("every anchor points at a chapter the CMS can actually offer it in", () => {
    for (const anchor of ANCHORS) {
      const options = selectableGuidesForChapter({
        bookSlug: anchor.bookSlug,
        chapterOrder: anchor.chapterOrder,
        experienceKey: null,
        view: EMPTY_VIEW,
      });
      expect(options.map((o) => o.guideKey)).toContain(anchor.guideKey);
    }
  });

  it("a guide is offered ONLY in the chapter its anchor names", () => {
    for (const anchor of ANCHORS) {
      // One chapter over. The passage does not live there, so a card bound
      // here would publish cleanly and open for nobody.
      expect(
        guideAnchorAppliesToChapter(anchor, {
          bookSlug: anchor.bookSlug,
          chapterOrder: anchor.chapterOrder + 1,
        }),
      ).toBe(false);
      // And the other book at the same position.
      const otherBook = ANCHORS.find((a) => a.bookSlug !== anchor.bookSlug);
      if (otherBook) {
        expect(
          guideAnchorAppliesToChapter(anchor, {
            bookSlug: otherBook.bookSlug,
            chapterOrder: anchor.chapterOrder,
          }),
        ).toBe(false);
      }
    }
  });
});

describe("ratchet · a guide the CMS could never offer", () => {
  it("every guide in the registry has an anchor, or is named here as deliberate", () => {
    // A registry guide with no anchor cannot be bound from the CMS at all: it
    // never appears in `selectableGuidesForChapter`, so an editor has no way to
    // reach it and no way to find out why. That is allowed — a guide may exist
    // for a surface that is not the chapter CMS — but it has to be a decision
    // somebody made, not a line nobody noticed.
    //
    // Adding a guide to this list is the decision. Adding one to the registry
    // and forgetting it fails here instead.
    const DELIBERATELY_UNANCHORED: readonly string[] = [];

    const anchored = new Set(ANCHORS.map((a) => a.guideKey));
    const unanchored = PRODUCTION_GUIDE_DEFINITIONS.map(
      (g) => (g as { guideKey: string }).guideKey,
    )
      .filter((k) => !anchored.has(k))
      .filter((k) => !DELIBERATELY_UNANCHORED.includes(k));
    expect(unanchored).toEqual([]);
  });
});
