"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LectorAudioResponse } from "@psico/types";

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;
type SpeedRate = (typeof SPEED_OPTIONS)[number];

/**
 * AudioBar — collapsible audio playback strip for the chapter.
 *
 * Renders a "🔊 Audio" pill in the header. Click expands a sticky bar with
 * native `<audio>` controls. The audio URL is fetched on demand (signed R2,
 * 1 h TTL); once fetched we keep it for the session.
 *
 * Pro-only — the backend returns 403 if the user isn't Pro+. The component
 * renders an upsell instead of breaking the reader.
 *
 * Sprint audio-polish: adds speed control (0.75 / 1 / 1.25 / 1.5×) via
 * `audioRef.current.playbackRate`, and transcript sync — when the audio
 * cursor falls inside a segment whose `blockId` is non-null, the matching
 * block in the reader scrolls into view (smooth, block: "center"). The
 * lookup is segment.start ≤ currentTime < segment.end with a tiny binary
 * search on the sorted transcript so it's O(log n) per `timeupdate` event
 * (~3 events/s).
 */
export function AudioBar({
  apiBase,
  token,
  bookId,
  chapterOrder,
}: {
  apiBase: string;
  token: string;
  bookId: string;
  chapterOrder: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LectorAudioResponse | null>(null);
  const [error, setError] = useState<
    "pro_required" | "not_found" | "other" | null
  >(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speed, setSpeed] = useState<SpeedRate>(1);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const lastScrolledBlockRef = useRef<string | null>(null);

  // Sorted transcript memo (defensive — backend may emit unsorted).
  const sortedSegments = useMemo(() => {
    if (!data) return [];
    return [...data.transcript].sort((a, b) => a.start - b.start);
  }, [data]);

  const fetchAudio = useCallback(async () => {
    if (data || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBase}/lector/${encodeURIComponent(bookId)}/${chapterOrder}/audio`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status === 403) {
        setError("pro_required");
        return;
      }
      if (res.status === 404) {
        setError("not_found");
        return;
      }
      if (!res.ok) {
        setError("other");
        return;
      }
      const json = (await res.json()) as LectorAudioResponse;
      setData(json);
    } catch {
      setError("other");
    } finally {
      setLoading(false);
    }
  }, [apiBase, token, bookId, chapterOrder, data, loading]);

  function toggle() {
    if (!open) void fetchAudio();
    setOpen(!open);
  }

  // Pause when collapsing so audio doesn't keep playing under a closed bar.
  useEffect(() => {
    if (!open && audioRef.current) {
      audioRef.current.pause();
    }
  }, [open]);

  // Apply speed to the underlying audio element whenever it changes or the
  // element is mounted (the ref might not exist on first render).
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed, data]);

  // Binary search: index of last segment whose start ≤ t. Returns -1 if t
  // is before the first segment.
  function findSegmentIndex(t: number): number {
    let lo = 0;
    let hi = sortedSegments.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sortedSegments[mid]!.start <= t) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  function onTimeUpdate() {
    const el = audioRef.current;
    if (!el || sortedSegments.length === 0) return;
    const t = el.currentTime;
    const idx = findSegmentIndex(t);
    if (idx < 0) {
      if (activeBlockId !== null) setActiveBlockId(null);
      return;
    }
    const seg = sortedSegments[idx]!;
    // Out of segment window (gap between segments) → no active.
    const inside = t < seg.end;
    const target = inside ? seg.blockId : null;
    if (target !== activeBlockId) {
      setActiveBlockId(target);
    }
  }

  // Scroll the active block into view (smooth, centered) — only when it
  // changes, and avoid re-scrolling repeatedly on the same block.
  useEffect(() => {
    if (!activeBlockId) return;
    if (lastScrolledBlockRef.current === activeBlockId) return;
    const el = document.querySelector(`[data-block-id="${activeBlockId}"]`);
    if (el && "scrollIntoView" in el) {
      (el as HTMLElement).scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      lastScrolledBlockRef.current = activeBlockId;
    }
  }, [activeBlockId]);

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? "Cerrar audio" : "Abrir audio"}
        className="rounded-full px-3 py-1 text-[13px] font-semibold"
        style={{
          background: open
            ? "var(--color-lavender-100)"
            : "var(--reader-chip-bg, var(--color-warm-100))",
          color: open
            ? "var(--color-lavender-700)"
            : "var(--reader-text, var(--color-warm-700))",
        }}
      >
        {open ? "🔇 Audio" : "🔊 Audio"}
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 top-full z-30 px-4 py-3"
          style={{
            background: "var(--reader-bg-tint, rgba(250, 250, 248, 0.98))",
            borderBottom: "1px solid var(--reader-border, rgba(0,0,0,0.06))",
          }}
        >
          <div className="mx-auto max-w-3xl">
            {loading ? (
              <p
                className="text-center text-[12.5px]"
                style={{ color: "var(--reader-muted, var(--color-warm-500))" }}
              >
                Cargando audio…
              </p>
            ) : error === "pro_required" ? (
              <p
                className="text-center text-[12.5px] font-semibold"
                style={{ color: "var(--color-lavender-700)" }}
              >
                🔒 Audio disponible en Pro ·{" "}
                <a
                  href="/dashboard/plan"
                  className="underline-offset-2 hover:underline"
                >
                  ver planes
                </a>
              </p>
            ) : error === "not_found" ? (
              <p
                className="text-center text-[12.5px]"
                style={{ color: "var(--reader-muted, var(--color-warm-500))" }}
              >
                Este capítulo aún no tiene audio.
              </p>
            ) : error === "other" ? (
              <div className="flex items-center justify-between gap-2">
                <p
                  className="text-[12.5px]"
                  style={{ color: "var(--color-error-text, #B91C1C)" }}
                >
                  No pudimos cargar el audio.
                </p>
                <button
                  type="button"
                  onClick={() => void fetchAudio()}
                  className="rounded-full px-3 py-1 text-[12px] font-semibold"
                  style={{
                    background: "var(--color-warm-100)",
                    color: "var(--color-warm-700)",
                  }}
                >
                  Reintentar
                </button>
              </div>
            ) : data ? (
              <div className="flex flex-col gap-2">
                <audio
                  ref={audioRef}
                  controls
                  preload="metadata"
                  src={data.url}
                  className="w-full"
                  aria-label="Audio del capítulo"
                  onTimeUpdate={onTimeUpdate}
                />
                <div
                  className="flex items-center justify-between gap-2 text-[11.5px]"
                  style={{
                    color: "var(--reader-muted, var(--color-warm-500))",
                  }}
                >
                  <span>Velocidad</span>
                  <div className="flex items-center gap-1">
                    {SPEED_OPTIONS.map((opt) => {
                      const active = speed === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setSpeed(opt)}
                          aria-pressed={active}
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{
                            background: active
                              ? "var(--color-lavender-500)"
                              : "var(--color-warm-100)",
                            color: active ? "white" : "var(--color-warm-700)",
                          }}
                        >
                          {opt}×
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
