"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ComingSoonNotice } from "./ComingSoonNotice";
import { MediaPicker, firstShowable } from "./MediaPicker";
import { RetryCompletion } from "./ChapterMediaListen";
import type { ChapterMediaSummary } from "@psico/types";
import {
  useChapterMediaAccess,
  useChapterMediaCompletion,
  type MediaFetchError,
} from "./use-chapter-media";

/**
 * GR-2 — Ver: the full chapter video explainer.
 *
 * Playback runs on Cloudflare's own managed player, embedded as an iframe: no
 * `hls.js`, no transcoder, no second video engine. The embed URL is minted per
 * request and carries a signed token in its path, so the video UID never
 * reaches the browser.
 *
 * `autoplay` is absent by construction (the server never emits it), controls
 * are on, the frame is 16:9 and it carries an accessible title.
 *
 * The `ended` event needs Cloudflare's player SDK, which is a remote script. It
 * loads lazily, only when a real video is available, and its absence degrades
 * to «playback works, completion is not recorded» — never to a broken player.
 * We do NOT offer a manual "mark as watched" button: the event means the player
 * reached the end, and a click is not that.
 */
export function ChapterMediaWatch({
  apiBase,
  token,
  bookSlug,
  items,
  manifestError,
}: {
  apiBase: string;
  token: string;
  /** For the way out. Watching is still reading a book. */
  bookSlug: string;
  /**
   * The chapter media manifest, resolved by the reader — see the note in
   * `ChapterMediaListen`. One chapter, one manifest.
   */
  items: readonly ChapterMediaSummary[] | null;
  manifestError: MediaFetchError | null;
}) {
  const error = manifestError;
  const requestAccess = useChapterMediaAccess({ apiBase, token });
  const { report, failedKey } = useChapterMediaCompletion({ apiBase, token });

  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [transcriptUrl, setTranscriptUrl] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<MediaFetchError | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Every video the chapter carries. A chapter with two explainers used to
  // show only one of them, with no way to reach the other.
  const videos = items?.filter((item) => item.kind === "VIDEO") ?? [];
  // Derived, not stored — a pick that no longer exists in the manifest cannot
  // survive as a selection pointing at nothing.
  const picked = videos.find((v) => v.mediaKey === pickedKey) ?? null;
  const video = picked ?? firstShowable(videos);
  const available = video?.availability === "AVAILABLE";

  const picker =
    videos.length > 0 && video ? (
      <MediaPicker
        items={videos}
        selectedKey={video.mediaKey}
        onSelect={(key) => {
          setPickedKey(key);
          // A new video is a new signed embed; keeping the old one would leave
          // the previous player under the new title for a render.
          setEmbedUrl(null);
          setTranscriptUrl(null);
          setAccessError(null);
        }}
        label="Videos"
      />
    ) : null;

  useEffect(() => {
    if (!video || !available) return;
    let cancelled = false;
    void (async () => {
      const result = await requestAccess(video.mediaKey);
      if (cancelled) return;
      if (!result.ok) {
        setAccessError(result.error);
        return;
      }
      setAccessError(null);
      if (result.access.kind === "VIDEO") {
        setEmbedUrl(result.access.embedUrl);
        setTranscriptUrl(result.access.transcriptUrl);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [video, available, requestAccess, attempt]);

  if (error === "pro_required") {
    return (
      <Frame>
        <ComingSoonNotice
          icon="🔒"
          title="La videoexplicación es parte de Pro"
          hint="Puedes seguir leyendo el capítulo completo."
        />
      </Frame>
    );
  }

  if (!video) {
    return (
      <Frame>
        <ComingSoonNotice
          icon="🎬"
          title="No hay videos para este capítulo."
          hint="Puedes leerlo o escucharlo mientras tanto."
        />
      </Frame>
    );
  }

  if (!available) {
    // Announced, not produced: the row is shown and inert, and no iframe and
    // no access request happen behind it.
    return (
      <Frame>
        <ComingSoonNotice
          icon="🎬"
          title="Videoexplicación en producción"
          hint={video.description}
        />
        {picker}
      </Frame>
    );
  }

  if (accessError) {
    return (
      <Frame>
        <div
          className="rounded-2xl border-[1.5px] bg-white p-4 text-center"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <p className="text-[13px]" style={{ color: "var(--color-warm-700)" }}>
            No pudimos preparar este video.
          </p>
          <div className="mt-2 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="rounded-full px-3 py-1 text-[12.5px] font-semibold"
              style={{
                minHeight: 44,
                background: "var(--color-warm-100)",
                color: "var(--color-warm-800)",
              }}
            >
              Reintentar
            </button>
            <Link
              href={`/dashboard/biblioteca/${bookSlug}`}
              className="text-[12.5px] font-semibold"
              style={{ color: "var(--color-warm-500)" }}
            >
              ← Volver al libro
            </Link>
          </div>
        </div>
        {picker}
      </Frame>
    );
  }

  return (
    <Frame>
      <div
        className="overflow-hidden rounded-2xl border-[1.5px] bg-white"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        {embedUrl ? (
          <StreamFrame
            // Keyed by video: without it, switching would reuse the same
            // iframe element and the SDK listener bound to the previous one.
            key={video.mediaKey}
            embedUrl={embedUrl}
            title={video.title}
            onEnded={() => void report(video.mediaKey)}
          />
        ) : (
          <p
            className="p-4 text-[12.5px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Preparando el video…
          </p>
        )}
        <div className="p-4">
          <p
            className="text-[14px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            {video.title}
          </p>
          <p
            className="mt-1 text-[12.5px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            {video.description}
          </p>

          {video.chapters.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {video.chapters.map((mark) => (
                <li
                  key={mark.startSec}
                  className="text-[12.5px]"
                  style={{ color: "var(--color-warm-700)" }}
                >
                  <span
                    className="mr-2 tabular-nums"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    {formatMark(mark.startSec)}
                  </span>
                  {mark.label}
                </li>
              ))}
            </ul>
          ) : null}

          {transcriptUrl ? (
            <a
              href={transcriptUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-[12.5px] font-semibold underline"
              style={{ color: "var(--color-lavender-600)" }}
            >
              Leer la transcripción
            </a>
          ) : (
            <p
              className="mt-3 text-[12px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              La transcripción de este video aún no está disponible.
            </p>
          )}

          {failedKey === video.mediaKey ? (
            <RetryCompletion onRetry={() => void report(video.mediaKey)} />
          ) : null}

          {picker}

          <Link
            href={`/dashboard/biblioteca/${bookSlug}`}
            className="mt-3 inline-block text-[12.5px] font-semibold"
            style={{ color: "var(--color-warm-500)" }}
          >
            ← Volver al libro
          </Link>
        </div>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-gr2="media-surface"
      className="mx-auto mt-4 w-full min-w-0 max-w-3xl px-4"
    >
      {children}
    </div>
  );
}

const STREAM_SDK_SRC = "https://embed.cloudflarestream.com/embed/sdk.latest.js";

/**
 * The iframe plus a best-effort `ended` listener.
 *
 * The signed token lives only inside `embedUrl` for the lifetime of this
 * element: it is never stored, never logged and never sent anywhere else.
 */
function StreamFrame({
  embedUrl,
  title,
  onEnded,
}: {
  embedUrl: string;
  title: string;
  onEnded: () => void;
}) {
  useEffect(() => {
    // The SDK attaches itself to the iframe by element reference, so it needs
    // the frame mounted first. Any failure here is silent by design: the video
    // still plays, we simply do not learn that it ended.
    let cancelled = false;
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${STREAM_SDK_SRC}"]`,
    );

    function attach() {
      if (cancelled) return;
      const w = window as unknown as {
        Stream?: (el: Element) => {
          addEventListener: (e: string, fn: () => void) => void;
        };
      };
      const frame = document.getElementById("chapter-video-frame");
      if (!w.Stream || !frame) return;
      try {
        w.Stream(frame).addEventListener("ended", onEnded);
      } catch {
        // Player API unavailable — completion just is not recorded.
      }
    }

    if (existing) {
      attach();
      return () => {
        cancelled = true;
      };
    }

    const script = document.createElement("script");
    script.src = STREAM_SDK_SRC;
    script.async = true;
    script.addEventListener("load", attach);
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      script.removeEventListener("load", attach);
    };
  }, [onEnded]);

  return (
    // 16:9 by ratio, never by a fixed pixel width: the box takes the width it
    // is given and the iframe is absolutely positioned inside it, so the player
    // can never push a min-width onto the reader's column on a phone.
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "100%",
        paddingTop: "56.25%",
        overflow: "hidden",
      }}
    >
      <iframe
        id="chapter-video-frame"
        src={embedUrl}
        title={title}
        allow="accelerometer; gyroscope; encrypted-media; picture-in-picture;"
        allowFullScreen
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          border: "none",
        }}
      />
    </div>
  );
}

function formatMark(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
