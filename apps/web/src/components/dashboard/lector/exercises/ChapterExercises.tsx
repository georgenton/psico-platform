"use client";

import { useState } from "react";
import { chapterExercises } from "@psico/types";
import type { BreatheExercise, MythsLensExercise } from "@psico/types";
import { MythsUnderTheLens } from "./MythsUnderTheLens";

/**
 * ChapterExercises — the interactive activities section of a chapter.
 *
 * Renders the curated exercises for (bookSlug, chapterOrder) as cards:
 *   - reflect → calls onReflect(prompt) so the reader opens the Reflexión tab
 *     of the companion dock, seeded with the prompt (→ encrypted diary entry).
 *   - breathe → calls onBreathe(exercise) so the reader shows the breathing
 *     overlay.
 *
 * Renders nothing when the chapter has no curated exercises.
 */
export function ChapterExercises({
  bookSlug,
  chapterOrder,
  onReflect,
  onBreathe,
}: {
  bookSlug: string;
  chapterOrder: number;
  onReflect: (prompt: string) => void;
  onBreathe: (exercise: BreatheExercise) => void;
}) {
  const exercises = chapterExercises(bookSlug, chapterOrder);
  // The book's own activity opens in place rather than in the dock: it is five
  // steps long and belongs with the chapter it is about.
  const [openMyths, setOpenMyths] = useState<MythsLensExercise | null>(null);
  if (exercises.length === 0) return null;

  return (
    <section
      className="mt-12 rounded-2xl p-5"
      style={{
        background: "var(--color-sage-50)",
        border: "1.5px solid var(--color-sage-200)",
      }}
    >
      <h3
        className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em]"
        style={{ color: "var(--color-sage-700)" }}
      >
        Actividades de este capítulo
      </h3>
      <div className="flex flex-col gap-3">
        {exercises.map((ex) => (
          <div
            key={ex.id}
            className="rounded-2xl bg-white p-4"
            style={{ border: "1.5px solid var(--color-warm-200)" }}
          >
            <div className="flex items-start gap-3">
              <span aria-hidden className="mt-0.5 text-[18px]">
                {ex.kind === "breathe"
                  ? "🌬️"
                  : ex.kind === "myths_lens"
                    ? "🔍"
                    : "🪷"}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className="text-[13.5px] font-semibold"
                  style={{ color: "var(--color-warm-900)" }}
                >
                  {ex.title}
                </div>
                <p
                  className="mt-0.5 text-[12.5px] leading-relaxed"
                  style={{ color: "var(--color-warm-600)" }}
                >
                  {ex.kind === "reflect" ? ex.prompt : ex.description}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (ex.kind === "breathe") return onBreathe(ex);
                if (ex.kind === "myths_lens") return setOpenMyths(ex);
                return onReflect(ex.prompt);
              }}
              className="mt-3 rounded-full px-4 py-1.5 text-[12.5px] font-semibold text-white"
              style={{ background: "var(--color-sage-400)" }}
            >
              {ex.kind === "breathe"
                ? "Empezar →"
                : ex.kind === "myths_lens"
                  ? "Abrir la actividad →"
                  : "Escribir mi respuesta →"}
            </button>
            {openMyths?.id === ex.id ? (
              <div className="mt-3">
                <MythsUnderTheLens
                  exercise={openMyths}
                  onClose={() => setOpenMyths(null)}
                  onKeepInDiary={onReflect}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
