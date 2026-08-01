"use client";

import { useEffect, useState } from "react";
import { guideApi } from "@psico/api-client";
import type { GuideDiscoveryResponse } from "@psico/types";
import { isGuidePinShape, type GuidePin } from "./guide-pin";

/**
 * GR-4 — ask the SERVER which guide this reading context implies.
 *
 * `GET /api/guide/discovery/:bookSlug/:chapterOrder` is the only authority on
 * that question. The browser does not reproduce the mapping: no `bookSlug`
 * lookup table, no "chapter 1 means the first guide", no "the book has one
 * guide so it must be that one". Reproducing it here would create a second
 * authority that can silently disagree with the catalog after an editorial
 * change, and the reader would offer a guide the server refuses to start.
 *
 * The five states are distinct on purpose, and four of them are NOT "show a
 * guide":
 *
 *   - `idle`      — the surface is off for this reader (`enabled === false`),
 *                   or the context is not a chapter we can ask about. No
 *                   request is made at all.
 *   - `loading`   — the question is in flight. NOT "no guide" and NOT "the
 *                   previous chapter's guide": the caller must render nothing
 *                   guide-shaped until this resolves, or a reader who opens a
 *                   Parejas chapter would see the Emociones entry flash first.
 *   - `unavailable` — the server said `available: false`. An editorial "no":
 *                   this chapter has no guide, or this reader may not have it.
 *   - `available` — the server named an exact pin. That pin is carried, never
 *                   re-derived.
 *   - `error`     — the request failed, or came back in a shape we refuse to
 *                   trust. Fails CLOSED: the caller shows no guide. It never
 *                   degrades into `available` with a guessed pin.
 *
 * Stale responses are dropped. Navigating chapter 1 → chapter 2 fast enough
 * can leave the first request in flight; without the guard its late answer
 * would overwrite the second chapter's state and pin the wrong guide. The
 * effect's cleanup flips a local flag, so an answer that arrives after the
 * inputs changed is discarded rather than applied.
 */

export type GuideDiscoveryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "available"; pin: GuidePin }
  | { status: "error" };

export interface UseGuideDiscoveryInput {
  /** Whether to ask at all. `false` keeps the hook in `idle` and makes no request. */
  enabled: boolean;
  bookSlug: string;
  chapterOrder: number;
}

const IDLE: GuideDiscoveryState = { status: "idle" };

/**
 * Whether the context is worth asking about at all.
 *
 * This is NOT a guess about which guide exists — it is a rejection of inputs
 * that cannot name a chapter. Sending them would spend a request to be told
 * the same thing by a 400.
 */
function askable(bookSlug: string, chapterOrder: number): boolean {
  return (
    typeof bookSlug === "string" &&
    bookSlug.length > 0 &&
    Number.isInteger(chapterOrder) &&
    chapterOrder > 0
  );
}

/**
 * Read the pin out of a discovery response, or `null`.
 *
 * `available: true` with a malformed pin is an `error`, not an `available`
 * with a repaired pin: a key or version we cannot trust is a contract we do
 * not understand, and starting a session under a guessed pin would write real
 * progress against the wrong guide.
 */
function pinOf(res: GuideDiscoveryResponse): GuidePin | null {
  if (!res || res.available !== true) return null;
  const candidate = { guideKey: res.guideKey, guideVersion: res.guideVersion };
  return isGuidePinShape(candidate) ? candidate : null;
}

export function useGuideDiscovery({
  enabled,
  bookSlug,
  chapterOrder,
}: UseGuideDiscoveryInput): GuideDiscoveryState {
  const [state, setState] = useState<GuideDiscoveryState>(IDLE);

  useEffect(() => {
    if (!enabled || !askable(bookSlug, chapterOrder)) {
      setState(IDLE);
      return;
    }

    // `current` is per-effect-run. The cleanup below flips THIS run's copy, so
    // a response from a superseded run can never call setState.
    let current = true;
    setState({ status: "loading" });

    guideApi
      .getGuideDiscovery(bookSlug, chapterOrder)
      .then((res) => {
        if (!current) return;
        if (res?.available !== true) {
          setState({ status: "unavailable" });
          return;
        }
        const pin = pinOf(res);
        setState(pin ? { status: "available", pin } : { status: "error" });
      })
      .catch(() => {
        // Deliberately shapeless. The reader needs to know it cannot offer a
        // guide, not why — and the "why" would be the server's to say.
        if (current) setState({ status: "error" });
      });

    return () => {
      current = false;
    };
  }, [enabled, bookSlug, chapterOrder]);

  return state;
}
