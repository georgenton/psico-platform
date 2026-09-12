"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CircleActivityView } from "@psico/types";
import { CIRCLE_ACTIVITY_TERMINAL_STATUSES } from "@psico/types";

/**
 * Keep the room in step with the server, cheaply.
 *
 * Ten seconds, polled — not a socket, not a stream, not a queue. Two people
 * taking turns on a reflection do not need sub-second updates, and the honest
 * cost of a websocket is a second connection lifecycle, a second auth path and
 * a second set of failure modes for a screen whose only real event is "the
 * other person finished".
 *
 * Two rules keep it from becoming a background drip:
 *
 *  - **Hidden tab, no polling.** A phone in a pocket must not keep asking about
 *    somebody's private activity, and `visibilitychange` is the signal for it.
 *    Returning to the tab refetches immediately so the first thing the person
 *    sees is current.
 *  - **Terminal status, no polling.** `CLOSED` and `CANCELLED` do not change
 *    again; continuing to ask would be asking forever.
 *
 * The timer is cleared on unmount, so navigating away ends it rather than
 * leaving a request in flight against a component that is gone.
 */

const INTERVAL_MS = 10_000;

/**
 * Is this payload actually an activity?
 *
 * Only the fields the room dereferences without checking first. This is not a
 * schema validator and is not trying to be one — the API is the authority on
 * the shape. It is a guard against the specific failure where a non-view body
 * arrives with a 200 and the room crashes on `you.status` instead of showing
 * somebody a refusal they can act on.
 */
function isActivityView(value: unknown): value is CircleActivityView {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<CircleActivityView>;
  return (
    typeof v.activityId === "string" &&
    typeof v.status === "string" &&
    typeof v.you === "object" &&
    v.you !== null &&
    typeof v.counterpart === "object" &&
    v.counterpart !== null
  );
}

export interface PollingState {
  readonly view: CircleActivityView | null;
  readonly error: string | null;
  readonly loading: boolean;
  readonly refresh: () => void;
}

export function usePollingActividad(
  activityId: string,
  initial: CircleActivityView | null,
): PollingState {
  const [view, setView] = useState<CircleActivityView | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(initial === null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const alive = useRef(true);
  const needsFirstFetch = useRef(initial === null);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/circulos/actividad/${encodeURIComponent(activityId)}`,
        { method: "GET" },
      );
      if (!alive.current) return;
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          code?: unknown;
        } | null;
        setError(
          typeof body?.code === "string" ? body.code : "CIRCLE_UNAVAILABLE",
        );
        setLoading(false);
        return;
      }
      const data = (await res.json()) as unknown;
      if (!alive.current) return;
      if (!isActivityView(data)) {
        // A 200 whose body is not an activity is not an activity. Rendering it
        // would read `you.status` off `undefined` and take the whole room down
        // to a blank screen — the one outcome worse than an honest refusal.
        setError("CIRCLE_UNAVAILABLE");
        setLoading(false);
        return;
      }
      setView(data);
      setError(null);
      setLoading(false);
    } catch {
      if (!alive.current) return;
      setError("CIRCLE_UNAVAILABLE");
      setLoading(false);
    }
  }, [activityId]);

  const stop = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (timer.current !== null) return;
    timer.current = setInterval(() => {
      void fetchOnce();
    }, INTERVAL_MS);
  }, [fetchOnce]);

  const terminal =
    view !== null &&
    (CIRCLE_ACTIVITY_TERMINAL_STATUSES as readonly string[]).includes(
      view.status,
    );

  useEffect(() => {
    alive.current = true;
    if (terminal) {
      stop();
      return () => {
        alive.current = false;
        stop();
      };
    }

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        void fetchOnce();
        start();
      }
    };

    if (document.visibilityState !== "hidden") {
      // No server-rendered view means there is nothing on screen yet. Waiting a
      // full interval before the first request would leave somebody looking at
      // "opening…" for ten seconds with no request in flight. A ref rather than
      // reading `view` here, so this fires once on mount instead of restarting
      // the interval on every poll.
      if (needsFirstFetch.current) {
        needsFirstFetch.current = false;
        void fetchOnce();
      }
      start();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive.current = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [terminal, start, stop, fetchOnce]);

  const refresh = useCallback(() => {
    void fetchOnce();
  }, [fetchOnce]);

  return { view, error, loading, refresh };
}

export const POLLING_INTERVAL_MS = INTERVAL_MS;
