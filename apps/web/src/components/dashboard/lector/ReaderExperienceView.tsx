"use client";

import type { CSSProperties } from "react";
import type {
  BreatheExercise,
  HighlightSummary,
  LectorChapterLesson,
} from "@psico/types";
import type { projectReaderBlocks } from "@psico/types";
import { BlockRenderer } from "./BlockRenderer";
import { EcoTopicCard } from "./EcoTopicCard";
import { ChapterExercises } from "./exercises/ChapterExercises";

type ReaderBlock = ReturnType<typeof projectReaderBlocks>[number];

/**
 * ReaderExperienceView — everything that is reading, and nothing that is not.
 *
 * Book Experience V2, vertical 1. Before this component the chapter text, its
 * references, its activities, its exercises list and «Marcar capítulo como
 * leído» were rendered unconditionally by `LectorShell`, which meant they were
 * also below the audio player in Escuchar and below the video in Ver. A person
 * who chose to listen got the player AND the whole chapter under it.
 *
 * Pulling the composition out is what makes the separation expressible:
 * `LectorShell` mounts this only in `leer`, so «the text does not repeat under
 * the other modes» is a fact about where the component is mounted rather than a
 * rule someone has to remember.
 *
 * It owns no state and no data contract of its own. Every prop is something
 * `LectorShell` already had — same blocks, same marks, same handlers.
 */

export interface ReaderExperienceViewProps {
  bookSlug: string;
  chapterOrder: number;
  chapterTitle: string;
  blocks: ReaderBlock[];
  /** Marks bucketed by `blockKey ?? blockId`, exactly as the shell builds them. */
  highlightsByBlock: Map<string, HighlightSummary[]>;
  annotationsByBlock: Map<string, number>;
  lessons: LectorChapterLesson[];
  /** 0..1. Only decides which sentence sits above the complete CTA. */
  progressPct: number;
  /** Reader typography, applied to the whole reading column. */
  proseStyle: CSSProperties;
  /** CC-6D — a content-core marks read failed; we say so and never fall back. */
  marksUnavailable: boolean;
  /** CC-6E §5.1 — creating a new mark is temporarily blocked. */
  markWriteNotice: boolean;
  flashBlockId: string | null;
  registerRef: (id: string, el: HTMLElement | null) => void;
  onAnnotateBlock: (blockId: string) => void;
  onOpenEco: (prompt: string) => void;
  onReflectExercise: (prompt: string) => void;
  onBreathe: (exercise: BreatheExercise) => void;
  onMarkComplete: () => void;
}

export function ReaderExperienceView({
  bookSlug,
  chapterOrder,
  chapterTitle,
  blocks,
  highlightsByBlock,
  annotationsByBlock,
  lessons,
  progressPct,
  proseStyle,
  marksUnavailable,
  markWriteNotice,
  flashBlockId,
  registerRef,
  onAnnotateBlock,
  onOpenEco,
  onReflectExercise,
  onBreathe,
  onMarkComplete,
}: ReaderExperienceViewProps) {
  return (
    <div data-testid="reader-experience-view">
      {/* Sprint B — contextual Eco topic for this chapter (dismissible). */}
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <EcoTopicCard
          bookSlug={bookSlug}
          chapterOrder={chapterOrder}
          chapterTitle={chapterTitle}
          onOpen={onOpenEco}
        />
      </div>

      {/* Reading area */}
      <main
        // A stable hook for the responsive gate: «the panel does not cover the
        // text» has to name WHICH element is the text.
        data-testid="reader-chapter-column"
        className="mx-auto max-w-3xl px-4 pb-8"
        style={proseStyle}
      >
        {/* CC-6D — a content-core marks read failed. Visible + fail-closed: the
            chapter is still readable, but we never show the envelope's marks in
            its place. */}
        {marksUnavailable && (
          <div
            role="status"
            className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            No pudimos cargar tus marcas en este momento. Tus resaltados y notas
            están a salvo; vuelve a abrir el capítulo para reintentar.
          </div>
        )}
        {/* CC-6E §5.1 — a content-core marks read failed, so we temporarily
            block creating a new mark (a create without the current set risks a
            duplicate/misplaced anchor). Auto-clears after a few seconds. */}
        {markWriteNotice && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            Tus marcas no están disponibles ahora. Reintenta antes de crear una
            nueva.
          </div>
        )}
        {blocks.map((b) => (
          <BlockRenderer
            key={b.id}
            block={b}
            highlights={highlightsByBlock.get(b.blockKey ?? b.id) ?? []}
            annotationCount={annotationsByBlock.get(b.blockKey ?? b.id) ?? 0}
            onAnnotateClick={onAnnotateBlock}
            registerRef={registerRef}
            flash={flashBlockId === b.id}
          />
        ))}

        {/* Interactive activities (backlog: actividades reales) */}
        <ChapterExercises
          bookSlug={bookSlug}
          chapterOrder={chapterOrder}
          onReflect={onReflectExercise}
          onBreathe={onBreathe}
        />

        {/* Lessons list */}
        {lessons.length > 0 && (
          <section
            className="mt-12 rounded-2xl p-5"
            style={{
              background: "var(--color-lavender-50)",
              border: "1.5px solid var(--color-lavender-200)",
            }}
          >
            <h3
              className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em]"
              style={{ color: "var(--color-lavender-700)" }}
            >
              Ejercicios de este capítulo
            </h3>
            <ul className="flex flex-col gap-2">
              {lessons.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-3 text-[13px]"
                  style={{ color: "var(--color-warm-800)" }}
                >
                  <span>{l.title}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em]"
                    style={{
                      background:
                        l.status === "completed"
                          ? "var(--color-sage-100)"
                          : "var(--color-warm-100)",
                      color:
                        l.status === "completed"
                          ? "var(--color-sage-700)"
                          : "var(--color-warm-500)",
                    }}
                  >
                    {l.status === "completed" ? "Hecho" : "Disponible"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Complete CTA */}
        <footer className="mt-12 flex flex-col items-center gap-3 pb-12">
          <p
            className="text-[12px]"
            style={{ color: "var(--reader-muted, var(--color-warm-500))" }}
          >
            {progressPct >= 0.9
              ? "Estás casi al final de este capítulo."
              : "Sigue leyendo a tu ritmo."}
          </p>
          <button
            type="button"
            onClick={onMarkComplete}
            className="rounded-2xl px-6 py-3 text-[13px] font-semibold text-white"
            style={{ background: "var(--color-sage-500)" }}
          >
            ✓ Marcar capítulo como leído
          </button>
        </footer>
      </main>
    </div>
  );
}
