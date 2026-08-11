"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LectorAudioResponse } from "@psico/types";
import { assetUrl } from "@/lib/asset-url";

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;
type SpeedRate = (typeof SPEED_OPTIONS)[number];

/**
 * Sleep timer presets. `null` = off; numbers are minutes. Web `<audio>`
 * already plays in background (browser handles the OS lifecycle), so
 * the timer simply pauses the element after N minutes.
 */
const SLEEP_OPTIONS = [null, 15, 30, 60] as const;
type SleepMinutes = (typeof SLEEP_OPTIONS)[number];

function sleepLabel(opt: SleepMinutes): string {
  if (opt === null) return "Off";
  return `${opt}m`;
}

function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

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
/** A reference to a picture, as opposed to a gradient palette token. */
function isArtworkRef(value: string): boolean {
  return value.startsWith("http") || value.startsWith("/");
}

export function AudioBar({
  apiBase,
  token,
  bookId,
  chapterOrder,
  onEnded,
  initialOpen = false,
  inline = false,
}: {
  apiBase: string;
  token: string;
  bookId: string;
  chapterOrder: number;
  /**
   * GR-2 — fired when the narration reaches its end. The chapter-media layer
   * uses it to report a completion; without it the bar behaves exactly as it
   * did before, which is why the audiobook needed no new player.
   */
  onEnded?: () => void;
  /**
   * Start expanded, and fetch the audio right away.
   *
   * Default `false`, so every existing caller keeps the collapsed pill. It is
   * opt-in because expanding costs a signed-URL request, and a request is only
   * fair when the person asked for audio. Choosing «Escuchar» IS that ask —
   * which is why the media surface is the one caller that sets it.
   *
   * It never starts playback. `autoplay` is absent by construction.
   */
  initialOpen?: boolean;
  /**
   * Lay the player out in the document flow instead of hanging it under a
   * sticky header.
   *
   * The overlay positioning (`absolute … top-full`) is right for the reader
   * header, where the bar drops down over the text. Inside the Escuchar
   * surface the player IS the content, so it has to occupy space — otherwise
   * it hangs outside its card and leaves the surface looking empty, which is
   * the defect this flag exists to remove.
   */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LectorAudioResponse | null>(null);
  const [error, setError] = useState<
    "pro_required" | "not_found" | "other" | null
  >(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speed, setSpeed] = useState<SpeedRate>(1);
  const [sleepMin, setSleepMin] = useState<SleepMinutes>(null);
  const sleepHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sleepEndAt, setSleepEndAt] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const lastScrolledBlockRef = useRef<string | null>(null);
  /**
   * The transcript is the audiobook's text, not the book's. On the Escuchar
   * surface the player IS the screen, so it opens with the transcript already
   * showing; in the reader header the bar is a small overlay dropping over the
   * text, and a long transcript there would bury the page.
   */
  const [transcriptOpen, setTranscriptOpen] = useState(inline);
  const [activeSegment, setActiveSegment] = useState(-1);

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

  /**
   * Starting expanded has to fetch too — `toggle()` is what normally asks, and
   * nobody is going to click it. Guarded by `initialOpen` so a collapsed bar
   * still costs nothing until the reader opens it.
   *
   * The ref is what keeps it to ONE request. Leaning on `fetchAudio`'s own
   * guard is not enough: that guard reads `data || loading`, and after a
   * failure both are falsy again. `fetchAudio` is rebuilt when `loading`
   * changes, the effect re-runs, the guard waves it through, and a reader
   * without Pro sitting on «Escuchar» hammers the endpoint for as long as the
   * screen stays open. Success hid it, because `data` stops the cycle.
   *
   * ONE_AUTOMATIC_REQUEST_PER_MOUNT. A re-render, a new error or a finished
   * load never produce another; the reader's «Reintentar» still does, because
   * that is a click and not an effect.
   *
   * CHAPTER_PROP_CHANGE_WITHOUT_REMOUNT=OUT_OF_SCOPE. Feeding a different
   * `chapterOrder` to an already-mounted bar would need `data` cleared too —
   * `fetchAudio` refuses while the previous chapter's response is still held —
   * so a key on the chapter identity would only look like support for it. Every
   * caller today remounts the bar per chapter (the reader route is keyed by
   * `[chapterOrder]`), so a plain one-shot says exactly what is true.
   */
  const autoFetchedRef = useRef(false);
  useEffect(() => {
    if (!initialOpen) return;
    if (autoFetchedRef.current) return;
    autoFetchedRef.current = true;
    void fetchAudio();
  }, [initialOpen, fetchAudio]);

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

  // Sleep timer: arm a setTimeout that pauses the <audio>. Selecting
  // "Off" or another preset clears the previous handle. The browser
  // tab can be hidden — timeouts still fire (web is more relaxed
  // about background than mobile).
  useEffect(() => {
    if (sleepHandleRef.current) {
      clearTimeout(sleepHandleRef.current);
      sleepHandleRef.current = null;
    }
    if (sleepMin === null) {
      setSleepEndAt(null);
      return;
    }
    const endAt = Date.now() + sleepMin * 60_000;
    setSleepEndAt(endAt);
    sleepHandleRef.current = setTimeout(() => {
      audioRef.current?.pause();
      setSleepMin(null);
      setSleepEndAt(null);
    }, sleepMin * 60_000);
    return () => {
      if (sleepHandleRef.current) {
        clearTimeout(sleepHandleRef.current);
        sleepHandleRef.current = null;
      }
    };
  }, [sleepMin]);

  // 1-second tick so the countdown label updates while a timer is armed.
  useEffect(() => {
    if (sleepEndAt === null) return;
    const handle = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(handle);
  }, [sleepEndAt]);

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
    // ONE search, two consumers: the transcript highlight and the reader
    // block scroll. They ask the same question — which segment is playing —
    // so they must never disagree about the answer.
    const idx = findSegmentIndex(t);
    if (idx < 0) {
      if (activeSegment !== -1) setActiveSegment(-1);
      if (activeBlockId !== null) setActiveBlockId(null);
      return;
    }
    const seg = sortedSegments[idx]!;
    // Out of segment window (gap between segments) → no active.
    const inside = t < seg.end;
    const nextSegment = inside ? idx : -1;
    if (nextSegment !== activeSegment) setActiveSegment(nextSegment);
    const target = inside ? seg.blockId : null;
    if (target !== activeBlockId) {
      setActiveBlockId(target);
    }
  }

  /**
   * Jump the narration to a segment. It does NOT start playback: someone
   * scanning the transcript is reading, not asking for sound, and a click
   * that starts audio out of nowhere is the kind of surprise this surface
   * has been careful to avoid since entry stopped autoplaying.
   */
  function seekToSegment(startSec: number) {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = startSec;
  }

  // Scroll the active block into view (smooth, centered) — only when it
  // changes, and avoid re-scrolling repeatedly on the same block.
  useEffect(() => {
    // Inline is the Escuchar surface: the reader text is not mounted behind
    // it, so there is nothing to scroll. The transcript below carries the
    // position instead. Non-inline (the reader header bar) is untouched.
    if (inline) return;
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
  }, [activeBlockId, inline]);

  return (
    <>
      {/* Inline is the surface's own player, so there is nothing to toggle:
          the way out is choosing another mode. The pill belongs to the reader
          header, where the bar is a secondary affordance over the text. */}
      {inline ? null : (
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
      )}

      {open ? (
        <div
          data-testid="audio-player-panel"
          className={
            inline
              ? "w-full"
              : "absolute left-0 right-0 top-full z-30 px-4 py-3"
          }
          style={
            inline
              ? undefined
              : {
                  background:
                    "var(--reader-bg-tint, rgba(250, 250, 248, 0.98))",
                  borderBottom:
                    "1px solid var(--reader-border, rgba(0,0,0,0.06))",
                }
          }
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
                <div className="flex items-center gap-3">
                  {/* Artwork: a real picture when the book has a cover,
                      gradient fallback otherwise (same look as the book
                      covers). A cover now arrives as an API-relative asset
                      path, so "starts with http" is no longer the whole test —
                      a leading slash is a reference too, not a palette name. */}
                  {isArtworkRef(data.metadata.artworkUrl) ? (
                    <img
                      src={assetUrl(data.metadata.artworkUrl)}
                      alt={`Portada de ${data.metadata.subtitle}`}
                      className="h-12 w-12 rounded-md object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="h-12 w-12 rounded-md"
                      style={{
                        background:
                          data.metadata.artworkUrl === "warm"
                            ? "linear-gradient(135deg, var(--color-warm-200), var(--color-warm-400))"
                            : data.metadata.artworkUrl === "mixed"
                              ? "linear-gradient(135deg, var(--color-lavender-200), var(--color-warm-300))"
                              : "linear-gradient(135deg, var(--color-lavender-200), var(--color-lavender-500))",
                      }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-[13px] font-semibold"
                      style={{
                        color: "var(--reader-text, var(--color-warm-700))",
                      }}
                    >
                      {data.metadata.title}
                    </p>
                    <p
                      className="truncate text-[11.5px]"
                      style={{
                        color: "var(--reader-muted, var(--color-warm-500))",
                      }}
                    >
                      {data.metadata.subtitle} · {data.metadata.artist}
                    </p>
                  </div>
                </div>
                <audio
                  ref={audioRef}
                  controls
                  preload="metadata"
                  src={data.url}
                  className="w-full"
                  aria-label="Audio del capítulo"
                  onTimeUpdate={onTimeUpdate}
                  onEnded={onEnded}
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
                <div
                  className="flex items-center justify-between gap-2 text-[11.5px]"
                  style={{
                    color: "var(--reader-muted, var(--color-warm-500))",
                  }}
                >
                  <span>
                    Temporizador
                    {sleepEndAt
                      ? ` · ${fmtCountdown(Math.max(0, sleepEndAt - Date.now()))}`
                      : ""}
                  </span>
                  <div className="flex items-center gap-1">
                    {SLEEP_OPTIONS.map((opt) => {
                      const active = sleepMin === opt;
                      return (
                        <button
                          key={String(opt)}
                          type="button"
                          onClick={() => setSleepMin(opt)}
                          aria-pressed={active}
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{
                            background: active
                              ? "var(--color-lavender-500)"
                              : "var(--color-warm-100)",
                            color: active ? "white" : "var(--color-warm-700)",
                          }}
                        >
                          {sleepLabel(opt)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Transcripción ─────────────────────────────────────
                    The words being read, from the response the player
                    already has. It is secondary to the audio — collapsed
                    under a real toggle — and it is NOT the chapter: no
                    references, no exercises, no second copy of the book.

                    Segment count is whatever the server sent. Today that
                    is one segment covering the whole narration, because
                    `Audio.transcription` is a single string; when the
                    voice pipeline learns word-level timing it will be
                    many, and this renders both without changing. A
                    segment with no `blockId` still shows: the id is a
                    convenience for the reader-scroll, not a condition
                    for existing. */}
                <div
                  className="mt-1 border-t pt-2"
                  style={{ borderColor: "var(--color-warm-200)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      id="audio-transcript-heading"
                      className="text-[11.5px] font-semibold uppercase tracking-[0.1em]"
                      style={{
                        color: "var(--reader-muted, var(--color-warm-500))",
                      }}
                    >
                      Transcripción
                    </h3>
                    <button
                      type="button"
                      onClick={() => setTranscriptOpen((v) => !v)}
                      aria-expanded={transcriptOpen}
                      aria-controls="audio-transcript-region"
                      className="rounded-full px-3 py-1 text-[11.5px] font-semibold"
                      style={{
                        // Same 44px floor as the segments below it: this is a
                        // control someone taps on a phone, not a caption.
                        minHeight: 44,
                        background: "var(--color-warm-100)",
                        color: "var(--color-warm-700)",
                      }}
                    >
                      {transcriptOpen ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>

                  {transcriptOpen ? (
                    <div
                      id="audio-transcript-region"
                      role="region"
                      aria-labelledby="audio-transcript-heading"
                      className="mt-2 max-h-[320px] overflow-y-auto"
                    >
                      {sortedSegments.length === 0 ? (
                        <p
                          className="text-[12.5px]"
                          style={{
                            color: "var(--reader-muted, var(--color-warm-500))",
                          }}
                        >
                          Transcripción no disponible para este capítulo.
                        </p>
                      ) : (
                        <ol className="flex flex-col gap-1">
                          {sortedSegments.map((seg, i) => {
                            const isActive = i === activeSegment;
                            return (
                              <li key={`${seg.start}-${i}`}>
                                <button
                                  type="button"
                                  data-testid={`transcript-segment-${i}`}
                                  onClick={() => seekToSegment(seg.start)}
                                  aria-current={isActive ? "true" : undefined}
                                  className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left"
                                  style={{
                                    minHeight: 44,
                                    background: isActive
                                      ? "var(--color-lavender-100)"
                                      : "transparent",
                                    // Not colour alone: the active segment
                                    // also carries a marker and bolder text.
                                    borderLeft: isActive
                                      ? "3px solid var(--color-lavender-500)"
                                      : "3px solid transparent",
                                  }}
                                >
                                  <span
                                    aria-hidden
                                    className="shrink-0 font-mono text-[11px]"
                                    style={{
                                      minWidth: 40,
                                      color: isActive
                                        ? "var(--color-lavender-700)"
                                        : "var(--reader-muted, var(--color-warm-400))",
                                    }}
                                  >
                                    {isActive ? "▸ " : ""}
                                    {fmtCountdown(seg.start * 1000)}
                                  </span>
                                  <span
                                    className="min-w-0 flex-1 whitespace-pre-wrap text-[12.5px] leading-relaxed"
                                    style={{
                                      color:
                                        "var(--reader-text, var(--color-warm-800))",
                                      fontWeight: isActive ? 600 : 400,
                                    }}
                                  >
                                    {isActive ? (
                                      // «Segmento actual», not «Reproduciendo»:
                                      // this marks where the playhead sits,
                                      // which is true whether or not the audio
                                      // is playing. The bar does not track a
                                      // playing state and must not imply one.
                                      <span className="sr-only">
                                        Segmento actual:{" "}
                                      </span>
                                    ) : null}
                                    {seg.text}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
