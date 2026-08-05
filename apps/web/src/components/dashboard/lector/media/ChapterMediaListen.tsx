"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ChapterMediaSummary } from "@psico/types";
import { AudioBar } from "../AudioBar";
import { ComingSoonNotice } from "./ComingSoonNotice";
import { MediaPicker, firstShowable } from "./MediaPicker";
import {
  clearMediaResume,
  readMediaResume,
  writeMediaResume,
} from "./chapter-media-resume";
import {
  useChapterMediaAccess,
  useChapterMediaCompletion,
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
  items,
  manifestError,
  chapterTitle,
  bookSlug,
}: {
  apiBase: string;
  token: string;
  bookId: string;
  chapterOrder: number;
  /** So the surface says WHICH chapter is about to be narrated. */
  chapterTitle: string;
  /** For the way out. Listening is still reading a book. */
  bookSlug: string;
  /** From the chapter payload: whether the `Audio` row exists at all. */
  audioAvailable: boolean;
  /**
   * The chapter media manifest, resolved by the reader.
   *
   * It is a prop rather than another `useChapterMediaManifest` call because the
   * reader has already asked — it needs the answer to decide whether this tab
   * may be opened at all. Asking again duplicated the request AND opened a
   * window where the surface knew less than the tab that led here, which is
   * what made «Audio en producción» flash over a chapter with audio.
   */
  items: readonly ChapterMediaSummary[] | null;
  manifestError: MediaFetchError | null;
}) {
  const [requestedTab, setRequestedTab] = useState<SubformatKey>("audiobook");
  const error = manifestError;
  const { report, failedKey } = useChapterMediaCompletion({ apiBase, token });

  const audiobook = items?.find((item) => item.kind === "AUDIOBOOK") ?? null;
  // Every episode, not the first one. A chapter may carry several, and until
  // now the rest existed in the manifest and were unreachable.
  const podcasts = items?.filter((item) => item.kind === "PODCAST") ?? [];

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
        // Fail closed on BOTH sources. `audioAvailable` is the chapter
        // envelope's row; `views.audiobook` is what the standard decided from
        // the manifest. A COMING_SOON or HIDDEN audiobook must not mount a
        // player — mounting it is what would ask for a signed URL we are not
        // entitled to.
        audioAvailable && isModeEnabled(views.audiobook) ? (
          <div
            className="flex flex-col gap-3 rounded-2xl border-[1.5px] bg-white p-4"
            style={{ borderColor: "var(--color-warm-200)" }}
          >
            <div>
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: "var(--color-lavender-500)" }}
              >
                Audiolibro
              </p>
              <h2
                className="mt-1 text-[17px] font-bold leading-snug"
                style={{ color: "var(--color-warm-900)", textWrap: "pretty" }}
              >
                {chapterTitle}
              </h2>
            </div>
            <AudioBar
              apiBase={apiBase}
              token={token}
              bookId={bookId}
              chapterOrder={chapterOrder}
              // Choosing «Escuchar» IS the ask, so the player is ready. It
              // still never starts on its own.
              initialOpen
              inline
              onEnded={
                audiobook ? () => void report(audiobook.mediaKey) : undefined
              }
            />
            {audiobook && failedKey === audiobook.mediaKey ? (
              <RetryCompletion
                onRetry={() => void report(audiobook.mediaKey)}
              />
            ) : null}
            <Link
              href={`/dashboard/biblioteca/${bookSlug}`}
              className="self-start text-[12.5px] font-semibold"
              style={{ color: "var(--color-warm-500)" }}
            >
              ← Volver al libro
            </Link>
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
          episodes={podcasts}
          manifestError={error}
          apiBase={apiBase}
          token={token}
          bookSlug={bookSlug}
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
 * The podcast panel — every episode the chapter carries, not just the first.
 *
 * It only asks for a signed URL once the person is on this tab AND the episode
 * they are looking at says its master exists. An announced-but-unproduced
 * episode is shown, is inert, and triggers no signing request; picking a
 * different one loads that one and nothing else.
 */
function PodcastPanel({
  episodes,
  manifestError,
  apiBase,
  token,
  bookSlug,
  onEnded,
  retryKey,
  onRetry,
}: {
  episodes: readonly ChapterMediaSummary[];
  manifestError: MediaFetchError | null;
  apiBase: string;
  token: string;
  bookSlug: string;
  onEnded: (mediaKey: string) => void;
  retryKey: string | null;
  onRetry: (mediaKey: string) => void;
}) {
  const requestAccess = useChapterMediaAccess({ apiBase, token });
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<MediaFetchError | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Derived, not stored: an episode that has been picked and then vanished
  // from the manifest cannot linger as a selection pointing at nothing.
  const picked = episodes.find((e) => e.mediaKey === pickedKey) ?? null;
  const item = picked ?? firstShowable(episodes);
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
        title="No hay episodios de podcast para este capítulo."
        hint="Puedes leerlo o escuchar el audiolibro mientras tanto."
      />
    );
  }

  const picker = (
    <MediaPicker
      items={episodes}
      selectedKey={item.mediaKey}
      onSelect={(key) => {
        setPickedKey(key);
        // A new episode is a new signed URL; keeping the old one would leave
        // the previous audio under the new title for a render.
        setUrl(null);
        setAccessError(null);
      }}
      label="Episodios"
    />
  );

  if (!available) {
    return (
      <>
        <ComingSoonNotice
          icon="🎙️"
          title="Podcast en producción"
          hint={item.description}
        />
        {picker}
      </>
    );
  }

  if (accessError) {
    return (
      <div
        className="rounded-2xl border-[1.5px] bg-white p-4 text-center"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <p className="text-[13px]" style={{ color: "var(--color-warm-700)" }}>
          No pudimos preparar este episodio.
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
          // Keyed by episode: a plain `src` swap would keep the element's
          // playback state across a change of episode.
          key={item.mediaKey}
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
      {picker}
      <Link
        href={`/dashboard/biblioteca/${bookSlug}`}
        className="mt-3 inline-block text-[12.5px] font-semibold"
        style={{ color: "var(--color-warm-500)" }}
      >
        ← Volver al libro
      </Link>
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
