"use client";

import { chapterExercises } from "@psico/types";
import type { BreatheExercise } from "@psico/types";

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
                {ex.kind === "breathe" ? "🌬️" : "🪷"}
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
                  {ex.kind === "breathe" ? ex.description : ex.prompt}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                ex.kind === "breathe" ? onBreathe(ex) : onReflect(ex.prompt)
              }
              className="mt-3 rounded-full px-4 py-1.5 text-[12.5px] font-semibold text-white"
              style={{ background: "var(--color-sage-400)" }}
            >
              {ex.kind === "breathe" ? "Empezar →" : "Escribir mi respuesta →"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
