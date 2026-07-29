"use client";

import { useEffect, useState } from "react";
import { ComingSoonNotice } from "./ComingSoonNotice";
import { RetryCompletion } from "./ChapterMediaListen";
import {
  useChapterMediaAccess,
  useChapterMediaCompletion,
  useChapterMediaManifest,
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
  bookId,
  chapterOrder,
}: {
  apiBase: string;
  token: string;
  bookId: string;
  chapterOrder: number;
}) {
  const { items, error } = useChapterMediaManifest({
    apiBase,
    token,
    bookId,
    chapterOrder,
    enabled: true,
  });
  const requestAccess = useChapterMediaAccess({ apiBase, token });
  const { report, failedKey } = useChapterMediaCompletion({ apiBase, token });

  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [transcriptUrl, setTranscriptUrl] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<MediaFetchError | null>(null);
  const [attempt, setAttempt] = useState(0);

  const video = items?.find((item) => item.kind === "VIDEO") ?? null;
  const available = video?.availability === "AVAILABLE";

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

  if (!video || !available) {
    return (
      <Frame>
        <ComingSoonNotice
          icon="🎬"
          title="Videoexplicación en producción"
          hint={
            video?.description ??
            "Este capítulo todavía no tiene su video. Puedes leerlo o escucharlo mientras tanto."
          }
        />
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
            No pudimos preparar el video.
          </p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-2 rounded-full px-3 py-1 text-[12.5px] font-semibold"
            style={{
              background: "var(--color-warm-100)",
              color: "var(--color-warm-800)",
            }}
          >
            Reintentar
          </button>
        </div>
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
        </div>
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto mt-4 max-w-3xl px-4">{children}</div>;
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
    <div style={{ position: "relative", paddingTop: "56.25%" }}>
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
