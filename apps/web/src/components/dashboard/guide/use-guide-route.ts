"use client";

import { useEffect, useState } from "react";
import { guideApi } from "@psico/api-client";
import type { GuideRouteItem, GuideRouteResponse } from "@psico/types";

/**
 * GR-5 — the chapter's whole guided route, from the server.
 *
 * The plural sibling of `useGuideDiscovery`, and deliberately its twin: same
 * five states, same fail-closed posture, same stale-response guard. A chapter
 * that offers five readings and one that offers none differ only in what the
 * server answers; nothing here decides it.
 *
 * `unavailable` covers both "this chapter has no route" and "the route is dark
 * for now" — the kill switch lives inside the catalog, so a flag that is off
 * produces exactly the same answer as a chapter with nothing to offer. That is
 * the point: a reader must not be able to tell that something is being held
 * back, and a client must not be able to enumerate what it is.
 */

export type GuideRouteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "available"; guides: readonly GuideRouteItem[] }
  | { status: "error" };

export interface UseGuideRouteInput {
  enabled: boolean;
  bookSlug: string;
  chapterOrder: number;
}

const IDLE: GuideRouteState = { status: "idle" };

/** The shape must be right before it is trusted; a wrong shape is an error. */
function readResponse(value: unknown): GuideRouteState {
  const o = value as GuideRouteResponse | null;
  if (!o || typeof o !== "object") return { status: "error" };
  if (o.available === false) return { status: "unavailable" };
  if (o.available !== true || !Array.isArray(o.guides)) {
    return { status: "error" };
  }
  const ok = o.guides.every(
    (g) =>
      typeof g?.guideKey === "string" &&
      g.guideKey.length > 0 &&
      Number.isInteger(g.guideVersion) &&
      Number.isInteger(g.order) &&
      typeof g.title === "string" &&
      typeof g.description === "string" &&
      typeof g.estimatedMinutes === "string",
  );
  if (!ok || o.guides.length === 0) return { status: "error" };
  // The server's order, restated rather than trusted to arrive sorted: the
  // route is a sequence, and a list rendered out of order teaches the chapter
  // backwards.
  const guides = [...o.guides].sort((a, b) => a.order - b.order);
  return { status: "available", guides };
}

export function useGuideRoute({
  enabled,
  bookSlug,
  chapterOrder,
}: UseGuideRouteInput): GuideRouteState {
  const [state, setState] = useState<GuideRouteState>(IDLE);

  useEffect(() => {
    if (!enabled || !bookSlug || !Number.isInteger(chapterOrder)) {
      setState(IDLE);
      return;
    }
    let live = true;
    setState({ status: "loading" });
    guideApi
      .getGuideRoute(bookSlug, chapterOrder)
      .then((res) => {
        if (live) setState(readResponse(res));
      })
      .catch(() => {
        // Fails closed. A route we could not read is not a route we invent.
        if (live) setState({ status: "error" });
      });
    return () => {
      live = false;
    };
  }, [enabled, bookSlug, chapterOrder]);

  return state;
}
