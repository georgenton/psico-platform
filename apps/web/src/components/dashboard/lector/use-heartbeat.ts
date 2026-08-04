"use client";

import { useEffect, useRef } from "react";

/**
 * useHeartbeat — fires PATCH /api/lector/session every 5 s while the tab
 * is focused. The server clamps `timeSpentDeltaSec` at 60 s and never
 * decreases `progressPct`, so we don't need to be paranoid here — the
 * goal is "have a steady rate of data points while the user is reading".
 *
 * Implementation notes
 * --------------------
 * - We don't pause on idle (no mouse-move tracking). The 5 s tick is fine;
 *   the server cap keeps it honest.
 * - We DO pause on `document.hidden = true` (tab in background).
 * - We DO pause when `enabled` is false. This is the caller saying «the
 *   person is not reading right now» — they are on the chapter home, in the
 *   audio surface, in the video surface, or inside the guided panel. Time
 *   spent there is not reading time, and it must not arrive as reading time
 *   the moment they come back either (see `lastTickRef` below).
 * - We use `keepalive: true` on the fetch so the last beat survives
 *   navigation away from the page.
 * - Errors are swallowed silently — the user is reading, the heartbeat is
 *   bookkeeping. If the network blips we'll catch up on the next tick.
 */

interface HeartbeatPayload {
  bookId: string;
  chapterOrder: number;
  /** Block currently in viewport — IntersectionObserver-resolved. */
  lastBlockId: string;
  progressPct: number;
}

interface Options {
  apiBase: string;
  token: string;
  bookId: string;
  chapterOrder: number;
  /** Called with the latest progress every beat so the parent can show it. */
  onProgress?: (pct: number) => void;
  /** Reader exposes current block + progress via this getter. */
  read: () => Pick<HeartbeatPayload, "lastBlockId" | "progressPct"> | null;
  /**
   * Is the person reading right now? Defaults to true so existing callers keep
   * their behaviour. While false no interval runs, nothing is PATCHed, and the
   * elapsed clock is reset on the way back in.
   */
  enabled?: boolean;
}

export const TICK_MS = 5_000;

export function useHeartbeat({
  apiBase,
  token,
  bookId,
  chapterOrder,
  onProgress,
  read,
  enabled = true,
}: Options): void {
  const lastTickRef = useRef<number>(Date.now());

  /**
   * The clock restarts when reading resumes.
   *
   * Without this, twenty minutes in the audio surface would be sitting in
   * `lastTickRef` and the first beat back in «Leer» would report them as
   * reading — capped at 60 s by the server, which is still a minute of reading
   * that never happened. Resetting on the way IN (not on the way out) is what
   * makes the first resumed delta at most one tick.
   */
  useEffect(() => {
    if (enabled) lastTickRef.current = Date.now();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function beat() {
      if (cancelled) return;
      if (document.hidden) return;
      const snapshot = read();
      if (!snapshot) return;

      const now = Date.now();
      const deltaSec = Math.min(
        60,
        Math.round((now - lastTickRef.current) / 1000),
      );
      lastTickRef.current = now;

      try {
        const res = await fetch(`${apiBase}/lector/session`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            bookId,
            chapterOrder,
            lastBlockId: snapshot.lastBlockId,
            timeSpentDeltaSec: deltaSec,
            progressPct: snapshot.progressPct,
          } satisfies HeartbeatPayload & { timeSpentDeltaSec: number }),
          keepalive: true,
        });
        if (res.ok) {
          const { progressPct } = (await res.json()) as { progressPct: number };
          onProgress?.(progressPct);
        }
      } catch {
        // Swallow — see header comment.
      }
    }

    const id = setInterval(beat, TICK_MS);
    // First beat after one tick so the server sees a non-zero `timeSpentDeltaSec`.
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [apiBase, token, bookId, chapterOrder, onProgress, read, enabled]);
}
