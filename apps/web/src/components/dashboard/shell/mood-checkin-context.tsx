"use client";

import {
  createContext,
  useCallback,
  useContext,
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
}

const MoodCheckinContext = createContext<MoodCheckinApi | null>(null);

export function MoodCheckinProvider({ children }: { children: ReactNode }) {
  const [openRequest, setOpenRequest] = useState(0);
  // A ref so `openMoodCheckin` is stable: consumers put it in effect deps.
  const counter = useRef(0);

  const openMoodCheckin = useCallback(() => {
    counter.current += 1;
    setOpenRequest(counter.current);
  }, []);

  const value = useMemo(
    () => ({ openMoodCheckin, openRequest }),
    [openMoodCheckin, openRequest],
  );

  return (
    <MoodCheckinContext.Provider value={value}>
      {children}
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
    }
  );
}

/** The chip's side — the only consumer that should read `openRequest`. */
export function useMoodCheckinOpenRequest(): number {
  return useContext(MoodCheckinContext)?.openRequest ?? 0;
}
