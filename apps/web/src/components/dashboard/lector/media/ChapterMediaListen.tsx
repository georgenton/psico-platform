"use client";

import { useEffect, useRef, useState } from "react";
import type { ChapterMediaSummary } from "@psico/types";
import { AudioBar } from "../AudioBar";
import { ComingSoonNotice } from "./ComingSoonNotice";
import {
  clearMediaResume,
  readMediaResume,
  writeMediaResume,
} from "./chapter-media-resume";
import {
  useChapterMediaAccess,
  useChapterMediaCompletion,
  useChapterMediaManifest,
  type MediaFetchError,
} from "./use-chapter-media";
import {
  disabledNotice,
  isModeEnabled,
  isModeVisible,
  mediaModeFromManifest,
  type BookExperienceModeView,
} from "../book-experience";

/**
 * GR-2 — Escuchar: two formats behind one entry point.
 *
 *   - Audiolibro reuses the existing chapter-audio infrastructure end to end:
 *     the same `AudioBar`, the same `/lector/:book/:order/audio` endpoint, the
 *     same signing path. GR-2 adds exactly one thing to it — an `onEnded`
 *     callback — because that is all the completion needed.
 *   - Podcast goes through the new manifest/access pair, since its master lives
 *     in R2 rather than in the chapter's `Audio` row.
 *
 * A format with no master says «En producción». Nothing here fakes audio.
 *
 * Book Experience Standard V1 pushes that one step earlier: the two subformat
 * tabs are gated by the SAME view model the reader's mode strip uses, so a
 * format with nothing playable is disabled before it is picked, mounts no
 * panel, and therefore asks for no signed URL. Choosing a format is an offer;
 * we only make offers we can keep.
 */
export function ChapterMediaListen({
  apiBase,
  token,
  bookId,
  chapterOrder,
  audioAvailable,
}: {
  apiBase: string;
  token: string;
  bookId: string;
  chapterOrder: number;
  /** From the chapter payload: whether the `Audio` row exists at all. */
  audioAvailable: boolean;
}) {
  const [requestedTab, setRequestedTab] = useState<SubformatKey>("audiobook");
  const { items, error } = useChapterMediaManifest({
    apiBase,
    token,
    bookId,
    chapterOrder,
    enabled: true,
  });
  const { report, failedKey } = useChapterMediaCompletion({ apiBase, token });

  const audiobook = items?.find((item) => item.kind === "AUDIOBOOK") ?? null;
  const podcast = items?.find((item) => item.kind === "PODCAST") ?? null;

  const views: Record<SubformatKey, BookExperienceModeView> = {
    audiobook: mediaModeFromManifest("AUDIOBOOK", items),
    podcast: mediaModeFromManifest("PODCAST", items),
  };

  // What is shown is the request only while the request is playable; otherwise
  // the first subformat that is. Deriving it means an unplayable format cannot
  // be on screen even for the render in which it was picked.
  const firstEnabled =
    SUBFORMATS.find((s) => isModeEnabled(views[s.key]))?.key ?? null;
  const tab = isModeEnabled(views[requestedTab]) ? requestedTab : firstEnabled;

  return (
    <div
      data-gr2="media-surface"
      className="mx-auto mt-4 w-full min-w-0 max-w-3xl px-4"
    >
      <div
        className="mb-3 flex max-w-full items-center justify-center gap-1 overflow-x-auto rounded-full p-1"
        style={{
          background: "var(--reader-chip-bg, var(--color-warm-100))",
          width: "fit-content",
          maxWidth: "100%",
          marginInline: "auto",
          flexWrap: "nowrap",
          scrollbarWidth: "none",
        }}
        role="tablist"
        aria-label="Formato de audio"
      >
        {SUBFORMATS.filter((s) => isModeVisible(views[s.key])).map((s) => (
          <MediaTab
            key={s.key}
            label={s.label}
            notice={disabledNotice(views[s.key])}
            enabled={isModeEnabled(views[s.key])}
            selected={tab === s.key}
            onSelect={() => setRequestedTab(s.key)}
          />
        ))}
      </div>

      {tab === "audiobook" ? (
        audioAvailable ? (
          <div
            className="rounded-2xl border-[1.5px] bg-white p-4"
            style={{ borderColor: "var(--color-warm-200)" }}
          >
            <AudioBar
              apiBase={apiBase}
              token={token}
              bookId={bookId}
              chapterOrder={chapterOrder}
              onEnded={
                audiobook ? () => void report(audiobook.mediaKey) : undefined
              }
            />
            {audiobook && failedKey === audiobook.mediaKey ? (
              <RetryCompletion
                onRetry={() => void report(audiobook.mediaKey)}
              />
            ) : null}
          </div>
        ) : (
          <ComingSoonNotice
            icon="🎧"
            title="Audio en producción"
            hint="Este capítulo aún no tiene narración disponible. Puedes cambiar a Leer mientras tanto."
          />
        )
      ) : tab === "podcast" ? (
        <PodcastPanel
          item={podcast}
          manifestError={error}
          apiBase={apiBase}
          token={token}
          onEnded={(mediaKey) => void report(mediaKey)}
          retryKey={failedKey}
          onRetry={(mediaKey) => void report(mediaKey)}
        />
      ) : (
        // Nothing here can play. Fail closed rather than mount a panel that
        // would ask for a signed URL it will not get.
        <ComingSoonNotice
          icon="🎧"
          title="Audio en producción"
          hint="Este capítulo aún no tiene narración disponible. Puedes cambiar a Leer mientras tanto."
        />
      )}
    </div>
  );
}

type SubformatKey = "audiobook" | "podcast";

const SUBFORMATS: readonly { key: SubformatKey; label: string }[] = [
  { key: "audiobook", label: "Audiolibro" },
  { key: "podcast", label: "Podcast" },
];

function MediaTab({
  label,
  notice,
  enabled,
  selected,
  onSelect,
}: {
  label: string;
  notice: string | null;
  enabled: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      data-testid={`media-subformat-${label.toLowerCase()}`}
      data-mode-state={enabled ? "PUBLISHED" : "COMING_SOON"}
      aria-selected={selected}
      aria-disabled={enabled ? undefined : true}
      onClick={() => {
        // A disabled option is inert: no selection, no panel, no request.
        if (!enabled) return;
        onSelect();
      }}
      className="shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors"
      style={
        selected
          ? {
              background: "var(--reader-bg, var(--color-warm-50))",
              color: "var(--reader-text, var(--color-warm-900))",
              boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
            }
          : {
              background: "transparent",
              color: "var(--reader-muted, var(--color-warm-600))",
            }
      }
    >
      {label}
      {notice ? (
        <span className="ml-1.5 text-[11px] font-medium opacity-90">
          · {notice}
        </span>
      ) : null}
    </button>
  );
}

/**
 * The podcast panel. It only asks for a signed URL once the person is on this
 * tab and the manifest says the master exists — an unavailable format never
 * triggers a signing request.
 */
function PodcastPanel({
  item,
  manifestError,
  apiBase,
  token,
  onEnded,
  retryKey,
  onRetry,
}: {
  item: ChapterMediaSummary | null;
  manifestError: MediaFetchError | null;
  apiBase: string;
  token: string;
  onEnded: (mediaKey: string) => void;
  retryKey: string | null;
  onRetry: (mediaKey: string) => void;
}) {
  const requestAccess = useChapterMediaAccess({ apiBase, token });
  const [url, setUrl] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<MediaFetchError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const available = item?.availability === "AVAILABLE";

  useEffect(() => {
    if (!item || !available) return;
    let cancelled = false;
    void (async () => {
      const result = await requestAccess(item.mediaKey);
      if (cancelled) return;
      if (!result.ok) {
        setAccessError(result.error);
        return;
      }
      setAccessError(null);
      setUrl("url" in result.access ? result.access.url : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [item, available, requestAccess, attempt]);

  if (manifestError === "pro_required") {
    return (
      <ComingSoonNotice
        icon="🔒"
        title="El podcast es parte de Pro"
        hint="Puedes seguir leyendo el capítulo completo."
      />
    );
  }

  if (!item) {
    return (
      <ComingSoonNotice
        icon="🎙️"
        title="Podcast en producción"
        hint="Este capítulo todavía no tiene episodio."
      />
    );
  }

  if (!available) {
    return (
      <ComingSoonNotice
        icon="🎙️"
        title="Podcast en producción"
        hint={item.description}
      />
    );
  }

  if (accessError) {
    return (
      <div
        className="rounded-2xl border-[1.5px] bg-white p-4 text-center"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <p className="text-[13px]" style={{ color: "var(--color-warm-700)" }}>
          No pudimos preparar el episodio.
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
    );
  }

  return (
    <div
      className="rounded-2xl border-[1.5px] bg-white p-4"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <p
        className="text-[14px] font-semibold"
        style={{ color: "var(--color-warm-900)" }}
      >
        {item.title}
      </p>
      <p
        className="mt-1 text-[12.5px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        {item.description}
      </p>
      {url ? (
        <MediaAudioElement
          src={url}
          label="Podcast del capítulo"
          mediaKey={item.mediaKey}
          mediaVersion={item.mediaVersion}
          onEnded={() => onEnded(item.mediaKey)}
        />
      ) : (
        <p
          className="mt-3 text-[12.5px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Preparando el episodio…
        </p>
      )}
      {retryKey === item.mediaKey ? (
        <RetryCompletion onRetry={() => onRetry(item.mediaKey)} />
      ) : null}
    </div>
  );
}

/**
 * A plain `<audio controls>`: the browser's own player is accessible, familiar
 * and free. Resume position is local-only, and it is cleared the moment the
 * media finishes — there is nothing left to resume.
 */
function MediaAudioElement({
  src,
  label,
  mediaKey,
  mediaVersion,
  onEnded,
}: {
  src: string;
  label: string;
  mediaKey: string;
  mediaVersion: number;
  onEnded: () => void;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);

  return (
    <audio
      ref={ref}
      controls
      preload="metadata"
      src={src}
      className="mt-3 w-full"
      aria-label={label}
      onLoadedMetadata={() => {
        const stored = readMediaResume(mediaKey, mediaVersion);
        if (stored !== null && ref.current) ref.current.currentTime = stored;
      }}
      onTimeUpdate={() => {
        const current = ref.current?.currentTime;
        if (typeof current === "number") {
          writeMediaResume({
            mediaKey,
            mediaVersion,
            positionSeconds: current,
          });
        }
      }}
      onEnded={() => {
        clearMediaResume(mediaKey);
        onEnded();
      }}
    />
  );
}

/**
 * The completion call is bookkeeping, so its failure never interrupts
 * playback — it surfaces as an offer to try again. Retrying is safe: the server
 * derives the idempotency key, so a second call cannot create a second row.
 */
export function RetryCompletion({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <p className="text-[12px]" style={{ color: "var(--color-warm-500)" }}>
        No pudimos registrar que lo terminaste.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full px-3 py-1 text-[12px] font-semibold"
        style={{
          background: "var(--color-warm-100)",
          color: "var(--color-warm-800)",
        }}
      >
        Reintentar registro
      </button>
    </div>
  );
}
