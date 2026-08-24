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
  guideOptionPinKey,
  guidePinTargetsUnit,
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

/**
 * C.3R — where each anchor's guide targets, stated.
 *
 * The unit id is invented here, and that is the point: the CMS decides by
 * comparing ids it was given, so a test can describe "this guide belongs to
 * that unit" without impersonating the three catalog tables the real authority
 * reads. The authority itself is exercised against PostgreSQL.
 */
const UNIT_OF = (anchor: GuideReaderAnchorLocator): string =>
  `unit_${anchor.bookSlug}_${anchor.chapterOrder}`;

const TARGETS: ReadonlyMap<string, string | null> = new Map(
  ANCHORS.map((a) => [guideOptionPinKey(a), UNIT_OF(a)]),
);

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

  it("every anchor's guide is offered in the unit it targets", () => {
    for (const anchor of ANCHORS) {
      const options = selectableGuidesForChapter({
        contentUnitId: UNIT_OF(anchor),
        targets: TARGETS,
        experienceKey: null,
        view: EMPTY_VIEW,
      });
      expect(options.map((o) => o.guideKey)).toContain(anchor.guideKey);
    }
  });

  it("a guide is offered ONLY in the unit it targets — never by position", () => {
    for (const anchor of ANCHORS) {
      // Another unit entirely. Position is not in this call at all: there is
      // no `chapterOrder` to compare, which is what makes the old failure
      // inexpressible rather than merely unlikely.
      expect(guidePinTargetsUnit(anchor, "unit_ajena", TARGETS)).toBe(false);
      // And the other anchor's unit, which is a real unit — just not this
      // guide's.
      const other = ANCHORS.find((a) => a.guideKey !== anchor.guideKey);
      if (other) {
        expect(guidePinTargetsUnit(anchor, UNIT_OF(other), TARGETS)).toBe(
          false,
        );
      }
      expect(guidePinTargetsUnit(anchor, UNIT_OF(anchor), TARGETS)).toBe(true);
    }
  });

  it("the same pin listed twice is ONE option, in catalog order", () => {
    // A catalog can grow a duplicate — two anchors for the same lineage, or a
    // list assembled from two sources. Offering it twice would show an editor
    // two rows that are the same guide and whose availability must always
    // agree; picking either does the same thing, and one of them looks like a
    // second choice that does not exist.
    const anchor = ANCHORS[0] as GuideReaderAnchorLocator;
    const other = ANCHORS[1] as GuideReaderAnchorLocator;
    const options = selectableGuidesForChapter({
      contentUnitId: UNIT_OF(anchor),
      targets: new Map([
        [guideOptionPinKey(anchor), UNIT_OF(anchor)],
        [guideOptionPinKey(other), UNIT_OF(anchor)],
      ]),
      experienceKey: null,
      view: EMPTY_VIEW,
      catalog: {
        // The same pin three times, with another one between them, so the test
        // pins BOTH facts: duplicates collapse, and order follows the catalog
        // rather than whatever a Set happened to preserve.
        anchors: [anchor, other, anchor, anchor],
        getExact: (k, v) => productionGuideRegistry.getExact(k, v),
      },
    });
    expect(options.map((o) => o.guideKey)).toEqual([
      anchor.guideKey,
      other.guideKey,
    ]);
  });

  it("two VERSIONS of one guide are two pins, placed separately", () => {
    // The index is keyed by the exact pin. A version-blind key would let `v2`
    // read `v1`'s placement — so a guide whose new version targets another unit
    // would still be offered here, and an editor could bind a version whose
    // passage is somewhere else entirely.
    const anchor = ANCHORS[0] as GuideReaderAnchorLocator;
    const v2 = { ...anchor, guideVersion: anchor.guideVersion + 1 };
    const options = selectableGuidesForChapter({
      contentUnitId: UNIT_OF(anchor),
      targets: new Map([
        [guideOptionPinKey(anchor), UNIT_OF(anchor)],
        // The next version moved: its passage is in another unit.
        [guideOptionPinKey(v2), "unit_otra"],
      ]),
      experienceKey: null,
      view: EMPTY_VIEW,
      catalog: {
        anchors: [anchor, v2],
        getExact: () =>
          productionGuideRegistry.getExact(
            anchor.guideKey,
            anchor.guideVersion,
          ),
      },
    });
    expect(options.map((o) => o.guideVersion)).toEqual([anchor.guideVersion]);
  });

  it("a pin the authority could not place is NOT offered", () => {
    // `null` is the editorial answer «no pude ubicarla»: an unknown definition,
    // or targets that contradict each other. Neither is permission to bind.
    const unresolved = new Map(TARGETS);
    for (const a of ANCHORS) unresolved.set(guideOptionPinKey(a), null);
    for (const anchor of ANCHORS) {
      expect(
        selectableGuidesForChapter({
          contentUnitId: UNIT_OF(anchor),
          targets: unresolved,
          experienceKey: null,
          view: EMPTY_VIEW,
        }),
      ).toEqual([]);
      // A key that is absent altogether is the same answer: nobody said so.
      expect(guidePinTargetsUnit(anchor, UNIT_OF(anchor), new Map())).toBe(
        false,
      );
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
