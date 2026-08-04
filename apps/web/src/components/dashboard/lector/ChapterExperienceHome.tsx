"use client";

import Link from "next/link";
import type { BookExperienceModeView } from "./book-experience";
import {
  disabledNotice,
  isModeEnabled,
  isModeVisible,
} from "./book-experience";
import type { ReaderMode } from "./reader-mode";
import { chapterPartEyebrow } from "./chapter-label";

/**
 * ChapterExperienceHome — «Cómo recorrerlo».
 *
 * Book Experience V2, vertical 1. One screen that answers a single question
 * before the reader commits to anything: what does this chapter offer, and
 * where did I leave off.
 *
 * It is a VIEW, not a catalog. Every row is derived from what the reader
 * already resolved — the chapter payload, the reading session, the chapter
 * media manifest and the Guide discovery answer. There is no second source of
 * truth here, no request of its own, and nothing invented:
 *
 *   - `UNKNOWN_MODE=HIDDEN`        a format outside this chapter's editorial
 *                                  plan has no row at all. Not a grey row —
 *                                  no row (Book Experience Standard V1 §3.2).
 *   - `COMING_SOON_MODE=VISIBLE_DISABLED`  announced and said so, not clickable.
 *   - `AVAILABLE_MODE=VISIBLE_ENABLED`     there is something to play or read.
 *
 * The number of rows is whatever the chapter has. Two rows is a complete
 * chapter, not a broken four-row layout.
 *
 * What it deliberately does not show: no emotional score, no diagnosis, no
 * streak, no ranking, no «te faltan N». Reading position is a position, and
 * a chapter with nothing extra simply says less.
 */

export interface ChapterExperienceHomeProps {
  book: { title: string; authorName: string | null; slug: string };
  chapter: {
    order: number;
    title: string;
    durationMinutes: number | null;
    partNumber: number | null;
    partTitle: string | null;
  };
  /** 0..1, from the reading session the reader already has. */
  progressPct: number;
  /** The three format modes, already decided by the Book Experience Standard. */
  modeViews: Record<ReaderMode, BookExperienceModeView>;
  /** The guided-reading surface, from Guide discovery. Hidden until PUBLISHED. */
  guidedView: BookExperienceModeView;
  /**
   * How many activities and exercises this chapter really shows, counted once
   * each. Curated activities and the chapter's own exercise list are two
   * collections that can name the same thing, so the shell dedupes before
   * passing the number — a row that says «3» has to mean three cards.
   * Zero means the row is absent.
   */
  activityCount: number;
  /** «Seguir leyendo» — the primary action, always. */
  onContinueReading: () => void;
  /** Picking a format row. Only ever called for an enabled one. */
  onPickMode: (mode: ReaderMode) => void;
  /** Opening the guided-reading surface. Only ever called when it is visible. */
  onOpenGuided: () => void;
  /** Opens the reader AT the activities section, not merely at the chapter. */
  onOpenActivities: () => void;
}

interface RouteRow {
  key: string;
  label: string;
  detail: string;
  chip: string | null;
  enabled: boolean;
  onPick: (() => void) | null;
}

/** «vas por la mitad» reads better than «48 %» on a chapter you have not opened yet. */
function progressChip(pct: number): string {
  if (pct <= 0) return "Sin empezar";
  if (pct >= 0.9) return "Casi al final";
  if (pct >= 0.4) return "Vas por la mitad";
  return "Empezado";
}

/** Never estimate. A chapter with no duration shows «—», which is the truth. */
function durationLabel(minutes: number | null): string {
  return minutes == null ? "—" : `${minutes} min`;
}

/**
 * The unit belongs to the format. «3 pistas» is a record-sleeve word: it says
 * nothing about a video, and not much about an audiobook that is one narration
 * split into segments. Each mode names what it actually has.
 */
const ITEM_NOUN: Record<"escuchar" | "ver", { one: string; many: string }> = {
  escuchar: { one: "1 contenido de audio", many: "contenidos de audio" },
  ver: { one: "1 video", many: "videos" },
};

function itemCountLabel(mode: "escuchar" | "ver", count: number): string {
  if (count <= 0) return "—";
  const noun = ITEM_NOUN[mode];
  return count === 1 ? noun.one : `${count} ${noun.many}`;
}

export function ChapterExperienceHome({
  book,
  chapter,
  progressPct,
  modeViews,
  guidedView,
  activityCount,
  onContinueReading,
  onPickMode,
  onOpenGuided,
  onOpenActivities,
}: ChapterExperienceHomeProps) {
  const rows: RouteRow[] = [];

  // «Leer» is always here: the text arrives with the page.
  rows.push({
    key: "leer",
    label: "Leer",
    detail: durationLabel(chapter.durationMinutes),
    chip: progressChip(progressPct),
    enabled: true,
    onPick: onContinueReading,
  });

  for (const mode of ["escuchar", "ver"] as const) {
    const view = modeViews[mode];
    if (!isModeVisible(view)) continue;
    const enabled = isModeEnabled(view);
    const notice = disabledNotice(view);
    rows.push({
      key: mode,
      // The mode labels carry an emoji for the tab strip; the route list is
      // quieter, so we take the word only.
      label: view.label.replace(/^\W+\s*/u, ""),
      detail: itemCountLabel(mode, view.itemCount ?? 0),
      chip: notice ?? "Disponible",
      enabled,
      onPick: enabled ? () => onPickMode(mode) : null,
    });
  }

  if (isModeVisible(guidedView)) {
    const enabled = isModeEnabled(guidedView);
    rows.push({
      key: "guiada",
      label: "Experiencia guiada",
      detail: "—",
      chip: disabledNotice(guidedView) ?? "Disponible",
      enabled,
      onPick: enabled ? onOpenGuided : null,
    });
  }

  if (activityCount > 0) {
    rows.push({
      key: "actividades",
      label: "Actividades y ejercicios",
      detail:
        activityCount === 1
          ? "1 en el capítulo"
          : `${activityCount} en el capítulo`,
      chip: "Disponible",
      enabled: true,
      // Not «open the chapter and good luck»: this lands ON the section.
      onPick: onOpenActivities,
    });
  }

  // No numeric prefix: `order` is a platform key, not the book's own chapter
  // number. See `chapter-label.ts` for the audit behind that. Parts ARE real
  // editorial metadata, so they stay.
  const eyebrow = chapterPartEyebrow({
    title: chapter.title,
    partNumber: chapter.partNumber,
    partTitle: chapter.partTitle,
  });

  return (
    <section
      data-testid="chapter-experience-home"
      className="mx-auto max-w-3xl px-4 pb-16 pt-8"
    >
      {eyebrow ? (
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-lavender-500)" }}
        >
          {eyebrow}
        </p>
      ) : null}
      <h1
        className="mt-3 text-[30px] font-bold leading-tight tracking-[-0.025em]"
        style={{ color: "var(--color-warm-900)", textWrap: "pretty" }}
      >
        {chapter.title}
      </h1>
      <p
        className="mt-2.5 text-[13.5px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        {[
          book.authorName,
          chapter.durationMinutes != null
            ? `${chapter.durationMinutes} min de lectura`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <h2
        className="mb-3.5 mt-8 flex items-center gap-2 text-[13px] font-semibold"
        style={{ color: "var(--color-warm-800)" }}
      >
        Cómo recorrerlo
        <span
          className="text-[11.5px] font-medium"
          style={{ color: "var(--color-warm-400)" }}
        >
          {rows.length} {rows.length === 1 ? "rama" : "ramas"}
        </span>
      </h2>

      <ul
        className="overflow-hidden rounded-2xl"
        style={{
          background: "#fff",
          border: "1px solid var(--color-warm-200)",
        }}
      >
        {rows.map((row, i) => (
          <li
            key={row.key}
            style={
              i > 0
                ? { borderTop: "1px solid var(--color-warm-100)" }
                : undefined
            }
          >
            <button
              type="button"
              data-testid={`chapter-route-${row.key}`}
              data-enabled={row.enabled ? "true" : "false"}
              // A row that cannot be taken is announced, not just greyed.
              aria-disabled={!row.enabled}
              aria-label={row.chip ? `${row.label} · ${row.chip}` : row.label}
              onClick={() => row.onPick?.()}
              className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left"
              style={{
                minHeight: 44,
                cursor: row.enabled ? "pointer" : "not-allowed",
                opacity: row.enabled ? 1 : 0.62,
              }}
            >
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[14.5px] font-semibold"
                  style={{ color: "var(--color-warm-800)" }}
                >
                  {row.label}
                </span>
                <span
                  className="mt-1 block text-[12px]"
                  style={{ color: "var(--color-warm-400)" }}
                >
                  {row.detail}
                </span>
              </span>
              {row.chip ? (
                <span
                  className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                  style={{
                    background: row.enabled
                      ? "var(--color-lavender-100)"
                      : "var(--color-warm-100)",
                    color: row.enabled
                      ? "var(--color-lavender-700)"
                      : "var(--color-warm-500)",
                  }}
                >
                  {row.chip}
                </span>
              ) : null}
              {row.enabled ? (
                <span
                  aria-hidden="true"
                  className="shrink-0 text-[15px]"
                  style={{ color: "var(--color-warm-300)" }}
                >
                  ›
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <p
        className="mt-3.5 text-[12.5px]"
        style={{ color: "var(--color-warm-400)" }}
      >
        Las ramas que aún no se conocen no se listan. «—» cuando no hay dato de
        duración: nunca se estima.
      </p>

      <div className="mt-7 flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="chapter-home-continue"
          onClick={onContinueReading}
          className="rounded-2xl px-6 py-3.5 text-[14.5px] font-semibold text-white"
          style={{ background: "var(--color-sage-400)", minHeight: 44 }}
        >
          Seguir leyendo
        </button>
        <Link
          href={`/dashboard/biblioteca/${book.slug}`}
          className="inline-flex items-center rounded-2xl px-6 py-3.5 text-[14.5px] font-semibold"
          style={{
            border: "1.5px solid var(--color-warm-300)",
            color: "var(--color-warm-600)",
            minHeight: 44,
          }}
        >
          Volver al libro
        </Link>
      </div>
    </section>
  );
}
