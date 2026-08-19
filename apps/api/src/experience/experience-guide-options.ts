import {
  GUIDE_READER_ANCHOR,
  PAREJAS_READER_ANCHOR,
  anchorAppliesTo,
  type GuideDefinition,
  type GuideOptionAvailability,
  type GuideReaderAnchorLocator,
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
 * ── Why the anchor filters the list ─────────────────────────────────────────
 *
 * A guide's reader anchor names the book and chapter its passage lives in. Bind
 * an experience to a guide whose anchor belongs elsewhere and the card is
 * published, correct, and unopenable: C.2 renders it «No disponible aquí»
 * precisely because `anchorAppliesTo` fails. Offering it would let an editor do
 * a full day's work on something no reader can reach, so the option is not
 * offered and the server refuses it if sent anyway
 * (CROSS_CHAPTER_GUIDE_BINDING=forbidden).
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

function anchorFor(
  catalog: ExperienceBindingCatalog,
  pin: { guideKey: string; guideVersion: number },
): GuideReaderAnchorLocator | null {
  return (
    catalog.anchors.find(
      (a) => a.guideKey === pin.guideKey && a.guideVersion === pin.guideVersion,
    ) ?? null
  );
}

/**
 * Does this guide's approved passage belong to the chapter being edited?
 *
 * Exported because the write path asks the same question the list does. Two
 * derivations of "may this chapter host this guide" would be one too many.
 */
export function guideAnchorAppliesToChapter(
  pin: { guideKey: string; guideVersion: number },
  where: { bookSlug: string; chapterOrder: number },
  catalog: ExperienceBindingCatalog = productionBindingCatalog,
): boolean {
  const anchor = anchorFor(catalog, pin);
  if (anchor === null) return false;
  return anchorAppliesTo(where.bookSlug, where.chapterOrder, anchor);
}

/**
 * The options for one chapter, with availability decided SERVER-side.
 *
 * The browser filters nothing. A list computed in the client would be a
 * suggestion the server then has to re-derive anyway, and the two could differ
 * for exactly as long as it takes a colleague to reserve the same guide.
 */
export function selectableGuidesForChapter(input: {
  bookSlug: string;
  chapterOrder: number;
  experienceKey: string | null;
  view: ChapterBindingView;
  catalog?: ExperienceBindingCatalog;
}): SelectableGuideOption[] {
  const catalog = input.catalog ?? productionBindingCatalog;
  const options: SelectableGuideOption[] = [];
  for (const anchor of catalog.anchors) {
    const pin = {
      guideKey: anchor.guideKey,
      guideVersion: anchor.guideVersion,
    };
    if (!guideAnchorAppliesToChapter(pin, input, catalog)) continue;

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
