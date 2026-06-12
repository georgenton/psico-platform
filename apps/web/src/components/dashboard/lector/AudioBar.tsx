"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LectorAudioResponse } from "@psico/types";

/**
 * AudioBar — collapsible audio playback strip for the chapter.
 *
 * Renders a "▶ Audio" pill in the header. Click expands a sticky bar with
 * native `<audio>` controls. The actual audio URL is fetched on demand
 * (signed R2 URL, 1 h TTL — server-side); once fetched we keep it for the
 * session.
 *
 * Pro-only — the backend returns 403 if the user isn't on a Pro tier or
 * higher. The component handles 403 by showing a paywall-style hint
 * instead of breaking the reader.
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

  // Pause when collapsing so the audio doesn't keep playing under a closed bar.
  useEffect(() => {
    if (!open && audioRef.current) {
      audioRef.current.pause();
    }
  }, [open]);

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
              <audio
                ref={audioRef}
                controls
                preload="metadata"
                src={data.url}
                className="w-full"
                aria-label="Audio del capítulo"
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
