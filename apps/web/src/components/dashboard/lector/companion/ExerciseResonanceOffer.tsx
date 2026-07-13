"use client";

import { useState } from "react";
import type { ChapterConcept } from "@psico/types";

/**
 * ExerciseResonanceOffer — ARC confirm step for the exercise source.
 *
 * Shown in the Reflexión tab's saved state when the reflexión was opened from
 * a chapter exercise. It RELATES the completed exercise to the chapter's
 * concept and asks for an explicit CONFIRMATION — only that tap persists a
 * Resonance (`source: "exercise"`) and feeds the conexión axis. Dismissing (by
 * not tapping) stores nothing. This is the exercise-focused reader's only path
 * into the map's content signal.
 *
 * Standalone + presentational so it can be unit-tested without the crypto-gated
 * ReflexionTab around it.
 */
export function ExerciseResonanceOffer({
  concept,
  bookSlug,
  chapterOrder,
  apiBase,
  token,
}: {
  concept: ChapterConcept;
  bookSlug: string;
  chapterOrder: number;
  apiBase: string;
  token: string | null;
}) {
  const [phase, setPhase] = useState<"offer" | "saving" | "done" | "error">(
    "offer",
  );

  async function confirm() {
    if (!token) return;
    setPhase("saving");
    try {
      const res = await fetch(`${apiBase}/resonances`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conceptKey: concept.key,
          conceptLabel: concept.label,
          bookSlug,
          chapterOrder,
          source: "exercise",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPhase("done");
    } catch {
      setPhase("error");
    }
  }

  return (
    <div
      className="mx-auto mt-4 max-w-xs rounded-2xl p-3 text-left"
      style={{
        background: "var(--color-lavender-50)",
        border: "1.5px solid var(--color-lavender-200)",
      }}
    >
      {phase === "done" ? (
        <p className="text-[12.5px]" style={{ color: "var(--color-warm-700)" }}>
          🌱 Añadido a tu mapa. Puedes verlo (y quitarlo) en{" "}
          <b>Mis resonancias</b>.
        </p>
      ) : (
        <>
          <p
            className="text-[12.5px] leading-relaxed"
            style={{ color: "var(--color-warm-700)" }}
          >
            Hiciste este ejercicio sobre <b>«{concept.label}»</b>. ¿Te resonó?
            Solo entra a tu mapa si tú lo confirmas.
          </p>
          {phase === "error" ? (
            <p
              className="mt-1 text-[11.5px]"
              style={{ color: "var(--color-rose-600, #b25454)" }}
            >
              No pudimos guardarlo. Reintenta.
            </p>
          ) : null}
          <button
            type="button"
            disabled={phase === "saving"}
            onClick={() => void confirm()}
            className="mt-2 rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--color-lavender-500, #8a7ab8)" }}
          >
            {phase === "saving" ? "Guardando…" : "🌱 Sí, añadir a mi mapa"}
          </button>
        </>
      )}
    </div>
  );
}
