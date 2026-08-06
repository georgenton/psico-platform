"use client";

/**
 * GR-6 — asking the server which journey presents this chapter.
 *
 * This hook is the reason the browser no longer ships a catalog. An earlier
 * draft imported the production definitions from `@psico/types`, which read as
 * a tidy "one source of truth" and was in fact the wrong boundary: a
 * definition compiled into the bundle cannot change when a CMS publishes, so
 * every editorial edit would have been a deploy and a stale client could keep
 * rendering a journey the server had already replaced.
 *
 * So the definitions come over the wire, at their exact immutable versions,
 * and this hook is the whole of the client's involvement.
 *
 * It fails closed in both directions: while the answer is unknown there is no
 * definition to render, and an answer that names no journey for this guide is
 * `null` rather than somebody else's journey.
 */

import { useEffect, useState } from "react";
import { experienceApi } from "@psico/api-client";
import type { ChapterExperiencePublicView } from "@psico/types";
import type { GuidePin } from "../guide/guide-pin";

export type ChapterExperienceStatus = "loading" | "ready" | "error";

export interface ChapterExperienceResult {
  status: ChapterExperienceStatus;
  /** The single published experience pinned to `pin`, or `null`. */
  definition: ChapterExperiencePublicView | null;
}

/**
 * The published experience whose `guidePin` matches, or `null`.
 *
 * Exported for tests and reused by the hook. Two published experiences pinned
 * to the same guide is ambiguous rather than a tie to break, so it also
 * answers `null`: picking one would hide a catalog mistake.
 */
export function selectExperienceForGuidePin(
  items: readonly ChapterExperiencePublicView[],
  pin: GuidePin,
): ChapterExperiencePublicView | null {
  // No status check: the route serves PUBLISHED and nothing else, so
  // re-filtering here would be the client second-guessing a promise it cannot
  // verify anyway.
  const matches = items.filter(
    (d) =>
      d.guidePin.guideKey === pin.guideKey &&
      d.guidePin.guideVersion === pin.guideVersion,
  );
  return matches.length === 1
    ? (matches[0] as ChapterExperiencePublicView)
    : null;
}

export function useChapterExperience(input: {
  bookSlug: string;
  chapterOrder: number;
  pin: GuidePin;
  /** Only ask once the reader is actually looking at a guided surface. */
  enabled?: boolean;
}): ChapterExperienceResult {
  const { bookSlug, chapterOrder, enabled = true } = input;
  const { guideKey, guideVersion } = input.pin;
  const [state, setState] = useState<ChapterExperienceResult>({
    status: "loading",
    definition: null,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await experienceApi.listPublishedForChapter({
          bookSlug,
          chapterOrder,
        });
        if (cancelled) return;
        setState({
          status: "ready",
          definition: selectExperienceForGuidePin(res.items, {
            guideKey,
            guideVersion,
          }),
        });
      } catch {
        // A failed read is not a definition. The caller renders the same
        // fail-closed surface it renders for "no journey here", because from
        // the reader's side those are the same fact: nothing to open.
        if (!cancelled) setState({ status: "error", definition: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, bookSlug, chapterOrder, guideKey, guideVersion]);

  return state;
}
