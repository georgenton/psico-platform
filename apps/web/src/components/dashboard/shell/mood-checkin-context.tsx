"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * GR-3 — one way to ask for the check-in, from anywhere in the dashboard.
 *
 * The check-in has exactly one surface (`MoodChip` in the topbar) and exactly
 * one writer. Other features can now ASK for it to open — that is all this
 * context does. It carries no mood, submits nothing, and cannot preselect: a
 * request to open a dialog is not a report of how someone feels.
 *
 * Why a context and not a route: the guided-reading panel offers «Registrar mi
 * momento», and navigating to `/dashboard` to reach the chip would throw the
 * reader out of the chapter they are in — the exact problem GR-3 exists to fix.
 */

interface MoodCheckinApi {
  /** Ask the topbar's check-in to open. Never writes anything. */
  openMoodCheckin: () => void;
  /**
   * Increments on every request. `MoodChip` watches it and opens; a counter
   * rather than a boolean so a second request re-opens after a manual close.
   */
  openRequest: number;
  /**
   * Is the check-in dialog on screen right now?
   *
   * One boolean, and deliberately only that. The reader needs it to stop
   * counting reading time while a modal is over the text; it does NOT need to
   * know which face was picked, what was answered, or that anything was
   * answered at all. `MoodChip` stays the only surface and the only writer —
   * this says «a dialog is open», nothing about the person.
   */
  moodCheckinOpen: boolean;
}

const MoodCheckinContext = createContext<MoodCheckinApi | null>(null);

/**
 * The reporting side, kept separate so only the chip can write it. Splitting
 * the two contexts is what makes «MoodChip is the sole writer» structural
 * rather than a convention.
 */
const MoodCheckinReporterContext = createContext<
  ((open: boolean) => void) | null
>(null);

export function MoodCheckinProvider({ children }: { children: ReactNode }) {
  const [openRequest, setOpenRequest] = useState(0);
  const [moodCheckinOpen, setMoodCheckinOpen] = useState(false);
  // A ref so `openMoodCheckin` is stable: consumers put it in effect deps.
  const counter = useRef(0);

  const openMoodCheckin = useCallback(() => {
    counter.current += 1;
    setOpenRequest(counter.current);
  }, []);

  const value = useMemo(
    () => ({ openMoodCheckin, openRequest, moodCheckinOpen }),
    [openMoodCheckin, openRequest, moodCheckinOpen],
  );

  return (
    <MoodCheckinContext.Provider value={value}>
      <MoodCheckinReporterContext.Provider value={setMoodCheckinOpen}>
        {children}
      </MoodCheckinReporterContext.Provider>
    </MoodCheckinContext.Provider>
  );
}

/**
 * The requester's side. Outside the provider it is a no-op rather than a
 * throw: a surface that cannot reach the topbar should degrade to doing
 * nothing, not crash the reader.
 */
export function useMoodCheckin(): MoodCheckinApi {
  return (
    useContext(MoodCheckinContext) ?? {
      openMoodCheckin: () => {},
      openRequest: 0,
      moodCheckinOpen: false,
    }
  );
}

/**
 * `MoodChip` mirrors its own open state up, once, from one effect.
 *
 * Reporting the state rather than patching each close site is the point: the
 * toggle, the outside click, Escape, «solo el ánimo», a finished answer, a
 * skip, an error and any programmatic close all end up setting the same local
 * boolean, so mirroring that boolean covers every one of them — including the
 * ones nobody has written yet. Unmount reports closed.
 */
export function useReportMoodCheckinOpen(open: boolean): void {
  const report = useContext(MoodCheckinReporterContext);
  useEffect(() => {
    report?.(open);
    return () => report?.(false);
  }, [open, report]);
}

/** The chip's side — the only consumer that should read `openRequest`. */
export function useMoodCheckinOpenRequest(): number {
  return useContext(MoodCheckinContext)?.openRequest ?? 0;
}
