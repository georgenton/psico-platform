"use client";

import type { ChapterMediaSummary } from "@psico/types";

/**
 * The list a person picks a piece of media from.
 *
 * Podcast and Video arrived needing the same thing on the same day: a chapter
 * can carry more than one episode and more than one video, and until now both
 * surfaces called `.find()` and silently rendered the first one — a second
 * episode existed in the manifest and was unreachable. This is that list, and
 * it is shared because the two uses are genuinely the same list, not because a
 * third caller is expected. If a third one never appears, nothing was lost.
 *
 * An item that cannot play is still SHOWN, and is inert: no selection, no
 * player, and above all no access request. `COMING_SOON` is an editorial
 * promise, not a broken link, and the difference is worth a row.
 *
 * It renders nothing at all for a single item. One choice is not a choice, and
 * a one-row list is just noise above the player.
 */
export function MediaPicker({
  items,
  selectedKey,
  onSelect,
  label,
}: {
  items: readonly ChapterMediaSummary[];
  selectedKey: string | null;
  onSelect: (mediaKey: string) => void;
  /** Names the group for a screen reader: «Episodios», «Videos». */
  label: string;
}) {
  if (items.length < 2) return null;

  return (
    <ul
      aria-label={label}
      data-testid="media-picker"
      className="mt-3 flex flex-col gap-1"
    >
      {items.map((item) => {
        const playable = item.availability === "AVAILABLE";
        const selected = item.mediaKey === selectedKey;
        return (
          <li key={item.mediaKey}>
            <button
              type="button"
              data-testid={`media-pick-${item.mediaKey}`}
              aria-current={selected ? "true" : undefined}
              aria-disabled={playable ? undefined : true}
              onClick={() => {
                if (!playable) return;
                onSelect(item.mediaKey);
              }}
              className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left"
              style={{
                minHeight: 44,
                cursor: playable ? "pointer" : "default",
                background: selected
                  ? "var(--color-lavender-100)"
                  : "var(--color-warm-50)",
                // Not colour alone: the chosen row also carries a rule down its
                // left edge, and the unplayable one says so in words.
                borderLeft: selected
                  ? "3px solid var(--color-lavender-500)"
                  : "3px solid transparent",
                opacity: playable ? 1 : 0.65,
              }}
            >
              <span className="min-w-0">
                <span
                  className="block text-[13px] font-semibold"
                  style={{
                    color: "var(--color-warm-900)",
                    textWrap: "pretty",
                  }}
                >
                  {item.title}
                </span>
                {playable ? null : (
                  <span
                    className="mt-0.5 block text-[11.5px] font-medium"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    En producción
                  </span>
                )}
              </span>
              {item.durationSec !== null ? (
                <span
                  className="shrink-0 tabular-nums text-[11.5px]"
                  style={{ color: "var(--color-warm-500)" }}
                >
                  {formatDuration(item.durationSec)}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The editorial duration, when the catalog states one. A master that does not
 * exist has no duration, and inventing «0:00» for it would put a fake number
 * next to an honest «En producción».
 */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Which item the surface should show first: the first one that can actually
 * play, or — when none can — the first announced one, so the reader sees «En
 * producción» for a real episode instead of an empty panel.
 */
export function firstShowable(
  items: readonly ChapterMediaSummary[],
): ChapterMediaSummary | null {
  return items.find((i) => i.availability === "AVAILABLE") ?? items[0] ?? null;
}
