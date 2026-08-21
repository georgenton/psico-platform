import {
  GUIDE_READER_ANCHOR,
  PAREJAS_READER_ANCHOR,
  type GuideDefinition,
  type GuideReaderAnchorLocator,
  type GuideOptionAvailability,
  type SelectableGuideOption,
} from "@psico/types";

import { productionGuideRegistry } from "../guide/guide-catalog";
import type { ChapterBindingView } from "./experience-binding-reservation";

/**
 * C.4 (#639) — which guides an editor may actually bind, and what each one's
 * availability means.
 *
 * ── The catalog is the registry, not a free field ───────────────────────────
 *
 * Options come from `productionGuideRegistry`, the same registry publishing
 * validates against. Authoring a guide from the CMS is a declared non-goal
 * (ADR 0022 §12), so this offers what the build ships and nothing else.
 *
 * ── Why the list is filtered, and by WHAT ───────────────────────────────────
 *
 * Bind an experience to a guide whose passage lives elsewhere and the card is
 * published, correct, and unopenable. Offering it would let an editor spend a
 * day on something no reader can reach, so it is not offered and the server
 * refuses it if sent anyway (CROSS_CHAPTER_GUIDE_BINDING=forbidden).
 *
 * What decides it changed with C.3R. This used to ask `anchorAppliesTo` —
 * compare the anchor's `(bookSlug, chapterOrder)` with the chapter being
 * edited. That is placement against placement: after a reorder the CMS would
 * offer a guide for the chapter that inherited the NUMBER, while the reader
 * (which now compares identities) refuses it. Correct, complete, unopenable —
 * the exact failure the identity barrier was written to prevent.
 *
 * So the filter compares the same thing the reader compares: the guide's
 * editorial target resolved to a `contentUnitId`, against the unit being
 * edited. This module does NOT resolve that itself. The caller passes a map
 * built with `GuideTargetContextService.resolveMany` — the ONE authority on
 * what a pin targets — because a second derivation of that rule would be one
 * too many, and the fast answer and the correct answer would eventually
 * differ.
 *
 * Neither `contentUnitId` ever reaches the browser. The CMS asks a question in
 * internal ids and answers with a list of pins.
 *
 * ── Why a taken guide is shown as taken ─────────────────────────────────────
 *
 * Three states, never two. Hiding a reserved guide would say "that guide does
 * not exist", which is false and unactionable; an editor who cannot see the
 * collision cannot resolve it. What is NOT disclosed is who holds it: the
 * option says the guide is spoken for, not by whom.
 */

/**
 * The shapes live in `@psico/types` so the CMS and the server cannot drift.
 *
 * `stepCount` and not a title: a `GuideDefinition` carries no reader-facing
 * name — that copy lives in the web bundle — and inventing one here would mean
 * maintaining a second name for every guide.
 */
export type {
  GuideOptionAvailability,
  SelectableGuideOption,
} from "@psico/types";

/**
 * What the CMS may offer: the guides this build ships and where each one's
 * passage lives.
 *
 * A parameter rather than two module singletons, and not for the usual
 * testability reason alone. The production catalog has exactly ONE anchored
 * guide per chapter, so with it hard-wired there is no chapter in which a
 * rebind from guide A to guide B is even expressible — the operation could be
 * written, reviewed and shipped without a single test having exercised its
 * success path. Adding a second production guide to make a test pass would be
 * editorial content invented for a test suite. Passing the catalog in is the
 * honest third option.
 */
export interface ExperienceBindingCatalog {
  /**
   * Every anchor this build ships, keyed by pin.
   *
   * Listed explicitly rather than discovered: an anchor is editorial placement,
   * and a registry that silently grew one would change which chapters may host
   * which guides without anybody deciding it.
   */
  readonly anchors: readonly GuideReaderAnchorLocator[];
  /** Exact lookup only — the same registry publishing validates against. */
  readonly getExact: (
    guideKey: string,
    guideVersion: number,
  ) => GuideDefinition;
}

/** DI token. The production catalog is the default binding in the module. */
export const EXPERIENCE_BINDING_CATALOG = "EXPERIENCE_BINDING_CATALOG";

export const productionBindingCatalog: ExperienceBindingCatalog = {
  anchors: [GUIDE_READER_ANCHOR, PAREJAS_READER_ANCHOR],
  getExact: (guideKey, guideVersion) =>
    productionGuideRegistry.getExact(guideKey, guideVersion),
};

/** The stable key a pin is indexed by. Exact — a version is part of identity. */
export function guideOptionPinKey(pin: {
  guideKey: string;
  guideVersion: number;
}): string {
  return `${pin.guideKey}@${pin.guideVersion}`;
}

/**
 * Where each candidate pin's editorial targets live, by exact pin.
 *
 * `null` means the authority could not place it — an unknown definition, or
 * targets that disagree with each other. Both are EDITORIAL answers, and both
 * make the pin unofferable rather than offerable: a catalog that contradicts
 * itself must not become an option an editor can pick and publish.
 *
 * A missing key is treated exactly like `null`. The map is built by the caller
 * from `resolveMany`, so a key that is absent means nobody answered about it,
 * and "nobody answered" is not permission.
 */
export type GuideTargetUnitIndex = ReadonlyMap<string, string | null>;

/**
 * Does this guide's passage belong to the unit being edited?
 *
 * Exported because the write path asks the same question the list does. It
 * takes ids, not placement: there is no argument here that could carry a
 * chapter number, so this cannot regress into a positional decision.
 */
export function guidePinTargetsUnit(
  pin: { guideKey: string; guideVersion: number },
  contentUnitId: string,
  targets: GuideTargetUnitIndex,
): boolean {
  const unitId = targets.get(guideOptionPinKey(pin));
  if (unitId === undefined || unitId === null) return false;
  return unitId === contentUnitId;
}

/**
 * The options for one chapter, with availability decided SERVER-side.
 *
 * The browser filters nothing. A list computed in the client would be a
 * suggestion the server then has to re-derive anyway, and the two could differ
 * for exactly as long as it takes a colleague to reserve the same guide.
 */
export function selectableGuidesForChapter(input: {
  /** The unit being edited, resolved under the chapter lock. Never a number. */
  contentUnitId: string;
  /** Built by the caller with `resolveMany` — see `GuideTargetUnitIndex`. */
  targets: GuideTargetUnitIndex;
  experienceKey: string | null;
  view: ChapterBindingView;
  catalog?: ExperienceBindingCatalog;
}): SelectableGuideOption[] {
  const catalog = input.catalog ?? productionBindingCatalog;
  const options: SelectableGuideOption[] = [];
  // Order follows the catalog, which is a declared list — so the menu an editor
  // sees is stable across calls rather than ordered by whatever the database
  // returned. Duplicated pins collapse: the same guide offered twice is one
  // option, and the reservation view would say the same thing about both.
  const seen = new Set<string>();
  for (const anchor of catalog.anchors) {
    const pin = {
      guideKey: anchor.guideKey,
      guideVersion: anchor.guideVersion,
    };
    const key = guideOptionPinKey(pin);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!guidePinTargetsUnit(pin, input.contentUnitId, input.targets)) {
      continue;
    }

    let definition;
    try {
      definition = catalog.getExact(pin.guideKey, pin.guideVersion);
    } catch {
      // An anchor pointing at a guide the registry does not have is a catalog
      // contradiction, not an option. It is skipped rather than offered as
      // something that would fail at publish time.
      continue;
    }

    const owner =
      input.view.reservedBy.get(pin.guideKey) ??
      input.view.scannedBy.get(pin.guideKey);
    const availability: GuideOptionAvailability =
      owner === undefined
        ? "AVAILABLE"
        : owner === input.experienceKey
          ? "OWNED_BY_THIS_EXPERIENCE"
          : "RESERVED_BY_ANOTHER_EXPERIENCE";

    options.push({
      guideKey: pin.guideKey,
      guideVersion: pin.guideVersion,
      stepCount: definition.steps.length,
      availability,
    });
  }
  return options;
}
