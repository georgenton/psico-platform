"use client";

/**
 * «Mitos emocionales bajo la lupa» — the book's own integrative activity.
 *
 * Five steps, all of them skippable, none of them scored. The reader rates
 * seven common beliefs, picks one, looks at it through the chapter's five
 * lenses, rewrites it with nuance and ends by asking a better question.
 *
 * ── What it refuses to be ──────────────────────────────────────────────────
 *
 * There is no total. Seven ratings could trivially be added up, and the sum
 * would look like a score of how "wrong" somebody's beliefs are — a diagnosis
 * dressed as a number. Nothing here adds, ranks, or interprets the ratings;
 * they exist so the reader notices where they stand before looking again.
 *
 * There is no correct rewrite, and nothing marks one. The lenses ask questions;
 * they do not grade the answers.
 *
 * ── Where the writing goes ─────────────────────────────────────────────────
 *
 * Nowhere, from here. The rewrite and the question live in component state, and
 * this file has no request in it and no callback that carries text upward.
 * `onKeepInDiary` hands the reader to the Reflexión tab — an explicit act, and
 * the only path by which anything they wrote can be kept, encrypted end to end.
 */

import { useState } from "react";
import type { MythsLensExercise } from "@psico/types";

const RATINGS = [1, 2, 3, 4, 5] as const;

export function MythsUnderTheLens({
  exercise,
  onClose,
  onKeepInDiary,
}: {
  exercise: MythsLensExercise;
  onClose: () => void;
  onKeepInDiary?: (prompt: string) => void;
}) {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [chosen, setChosen] = useState<string | null>(null);
  const [rewrite, setRewrite] = useState("");
  const [question, setQuestion] = useState("");

  const chosenBelief = exercise.beliefs.find((b) => b.id === chosen);

  return (
    <section
      aria-labelledby="myths-title"
      data-testid="myths-lens"
      className="rounded-2xl bg-white p-5"
      style={{ border: "1.5px solid var(--color-sage-200)" }}
    >
      <h3
        id="myths-title"
        className="text-[15px] font-semibold"
        style={{ color: "var(--color-warm-900)" }}
      >
        {exercise.title}
      </h3>
      <p
        className="mt-1 text-[12.5px] leading-relaxed"
        style={{ color: "var(--color-warm-600)" }}
      >
        {exercise.description}
      </p>

      {/* 1 — the seven beliefs. A rating is a position, not a result. */}
      <ol className="mt-4 flex list-none flex-col gap-3 p-0">
        {exercise.beliefs.map((b) => (
          <li key={b.id}>
            <p
              className="text-[13px]"
              style={{ color: "var(--color-warm-800)" }}
            >
              {b.text}
            </p>
            <div
              className="mt-1.5 flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label={b.text}
            >
              <span
                className="text-[11px]"
                style={{ color: "var(--color-warm-500)" }}
              >
                {exercise.scaleLow}
              </span>
              {RATINGS.map((n) => {
                const on = ratings[b.id] === n;
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${b.text} — ${n} de 5`}
                    onClick={() =>
                      setRatings((p) => ({ ...p, [b.id]: on ? 0 : n }))
                    }
                    className="h-8 w-8 rounded-full text-[12.5px]"
                    style={{
                      border: on
                        ? "2px solid var(--color-sage-600)"
                        : "1px solid var(--color-warm-300)",
                      background: on ? "var(--color-sage-50)" : "white",
                      fontWeight: on ? 700 : 400,
                      color: on
                        ? "var(--color-sage-700)"
                        : "var(--color-warm-700)",
                    }}
                  >
                    {n}
                  </button>
                );
              })}
              <span
                className="text-[11px]"
                style={{ color: "var(--color-warm-500)" }}
              >
                {exercise.scaleHigh}
              </span>
            </div>
          </li>
        ))}
      </ol>

      {/* 2 — pick one. */}
      <h4
        className="mt-6 text-[13px] font-semibold"
        style={{ color: "var(--color-warm-900)" }}
      >
        Elige una para mirarla de cerca
      </h4>
      <div
        className="mt-2 flex flex-wrap gap-2"
        role="group"
        aria-label="Elige una creencia"
      >
        {exercise.beliefs.map((b) => (
          <button
            key={b.id}
            type="button"
            aria-pressed={chosen === b.id}
            onClick={() => setChosen(chosen === b.id ? null : b.id)}
            className="rounded-full px-3 py-1.5 text-left text-[12px]"
            style={{
              border:
                chosen === b.id
                  ? "2px solid var(--color-sage-600)"
                  : "1px solid var(--color-warm-300)",
              background: chosen === b.id ? "var(--color-sage-50)" : "white",
              fontWeight: chosen === b.id ? 600 : 400,
              color: "var(--color-warm-700)",
            }}
          >
            {b.text}
          </button>
        ))}
      </div>

      {/* 3–5 — only once there is something to look at. */}
      {chosenBelief ? (
        <div data-testid="myths-lens-review">
          <h4
            className="mt-6 text-[13px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            Cinco lentes sobre: «{chosenBelief.text}»
          </h4>
          <ul className="mt-2 flex list-none flex-col gap-2 p-0">
            {exercise.lenses.map((l) => (
              <li
                key={l.id}
                className="rounded-xl p-3"
                style={{ border: "1px solid var(--color-warm-200)" }}
              >
                <div
                  className="text-[12px] font-semibold"
                  style={{ color: "var(--color-sage-700)" }}
                >
                  {l.label}
                </div>
                <p
                  className="mt-0.5 text-[12.5px] leading-relaxed"
                  style={{ color: "var(--color-warm-700)" }}
                >
                  {l.question}
                </p>
              </li>
            ))}
          </ul>

          <label className="mt-4 block">
            <span
              className="text-[12.5px] font-semibold"
              style={{ color: "var(--color-warm-900)" }}
            >
              {exercise.rewritePrompt}
            </span>
            <textarea
              rows={3}
              value={rewrite}
              onChange={(e) => setRewrite(e.target.value)}
              className="mt-1.5 w-full rounded-xl p-2.5 text-[13px]"
              style={{ border: "1px solid var(--color-warm-200)" }}
              placeholder="Con tus palabras…"
            />
          </label>

          <label className="mt-3 block">
            <span
              className="text-[12.5px] font-semibold"
              style={{ color: "var(--color-warm-900)" }}
            >
              {exercise.betterQuestionPrompt}
            </span>
            <textarea
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="mt-1.5 w-full rounded-xl p-2.5 text-[13px]"
              style={{ border: "1px solid var(--color-warm-200)" }}
              placeholder="Una pregunta mejor…"
            />
          </label>

          <p
            className="mt-2 text-[11.5px] leading-relaxed"
            style={{ color: "var(--color-warm-500)" }}
          >
            Lo que escribas aquí se queda en tu dispositivo. Si quieres
            guardarlo, pasa a tu diario: ahí se cifra de extremo a extremo.
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {onKeepInDiary && chosenBelief ? (
          <button
            type="button"
            onClick={() =>
              onKeepInDiary(
                `${exercise.betterQuestionPrompt} (sobre «${chosenBelief.text}»)`,
              )
            }
            className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold text-white"
            style={{ background: "var(--color-sage-400)" }}
          >
            🪷 Guardarlo en mi diario
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold"
          style={{
            border: "1px solid var(--color-warm-300)",
            color: "var(--color-warm-700)",
          }}
        >
          Cerrar
        </button>
      </div>
    </section>
  );
}

/** The same activity, as text, wherever the interaction cannot run. */
export function MythsUnderTheLensFallback({
  exercise,
}: {
  exercise: MythsLensExercise;
}) {
  return (
    <ol
      data-testid="myths-lens-fallback"
      className="mt-2 list-decimal pl-5 text-[12.5px] leading-relaxed"
      style={{ color: "var(--color-warm-700)" }}
    >
      {exercise.fallbackSteps.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  );
}
