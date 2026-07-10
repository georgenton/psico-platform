"use client";

import type { VideoBlockInfo } from "@psico/types";

/**
 * VideoBlock — the reader's inline video capsule (backlog: reproductor real).
 *
 * A chapter can drop a short video where the author talks about the chapter.
 * Until ops uploads the file (and sets meta.videoUrl on the block), we render a
 * player-shaped "en producción" placeholder — mirroring how Modo Guía shows
 * "Audio en producción". When the URL exists, a real <video> plays inline.
 *
 * Book videos are public licensed content, so `info.url` is a direct public
 * URL — no signing, no crypto (ADR 0007 untouched).
 */
export function VideoBlock({
  info,
  blockId,
}: {
  info: VideoBlockInfo;
  blockId: string;
}) {
  return (
    <figure
      data-block-id={blockId}
      data-block-kind="VIDEO"
      className="reader-block reader-block-video my-8"
    >
      <div
        className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em]"
        style={{ color: "var(--color-lavender-700)" }}
      >
        🎬 Video del capítulo
      </div>

      {info.url ? (
        <video
          controls
          preload="metadata"
          poster={info.poster ?? undefined}
          className="w-full rounded-2xl"
          style={{
            aspectRatio: "16 / 9",
            background: "#000",
            border: "1.5px solid var(--color-warm-200)",
          }}
        >
          <source src={info.url} />
          Tu navegador no puede reproducir este video.
        </video>
      ) : (
        <div
          className="flex flex-col items-center justify-center rounded-2xl text-center"
          style={{
            aspectRatio: "16 / 9",
            background:
              "linear-gradient(135deg, var(--color-lavender-100), var(--color-sage-50))",
            border: "1.5px dashed var(--color-lavender-300)",
          }}
        >
          <div
            aria-hidden
            className="flex h-14 w-14 items-center justify-center rounded-full text-[22px]"
            style={{
              background: "white",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              color: "var(--color-lavender-700)",
            }}
          >
            ▶
          </div>
          <p
            className="mt-3 text-[12px] font-bold uppercase tracking-[0.12em]"
            style={{ color: "var(--color-lavender-700)" }}
          >
            En producción
          </p>
          <p
            className="mt-1 max-w-xs px-4 text-[12.5px] leading-relaxed"
            style={{ color: "var(--color-warm-600)" }}
          >
            Pronto verás aquí una cápsula corta del autor.
          </p>
        </div>
      )}

      {info.caption ? (
        <figcaption
          className="mt-2 text-[12.5px] leading-relaxed"
          style={{ color: "var(--color-warm-600)" }}
        >
          {info.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
