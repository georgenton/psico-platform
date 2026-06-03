"use client";

import { useState, useTransition } from "react";
import type { OnboardingBookRecommendation } from "@psico/types";
import { completeOnboarding } from "@/actions/onboarding";

interface Props {
  primary: OnboardingBookRecommendation;
  alternatives: OnboardingBookRecommendation[];
}

const COVER_BG: Record<OnboardingBookRecommendation["cover"], string> = {
  cool: "linear-gradient(135deg, var(--color-lavender-300), var(--color-lavender-600))",
  warm: "linear-gradient(135deg, #F4B080, #C76A4D)",
  mixed:
    "linear-gradient(135deg, var(--color-lavender-300), var(--color-sage-400))",
};

export function RecommendationCard({ primary, alternatives }: Props) {
  const [active, setActive] = useState<OnboardingBookRecommendation>(primary);
  const [submitting, startTransition] = useTransition();

  function pick(book: OnboardingBookRecommendation | null) {
    startTransition(async () => {
      try {
        await completeOnboarding({ chosenBookId: book?.bookId ?? null });
      } catch {
        // Server action throws redirect; if it doesn't, do nothing.
      }
    });
  }

  return (
    <>
      <div className="flex flex-1 flex-col">
        <p
          className="text-[12px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-lavender-700)" }}
        >
          Tu primera recomendación
        </p>
        <h1
          className="mt-3 text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]"
          style={{ color: "var(--color-warm-900)" }}
        >
          Te recomiendo empezar por aquí.
        </h1>

        {/* Featured card */}
        <article
          className="mt-6 overflow-hidden rounded-3xl border-[1.5px] bg-white"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <div
            className="flex h-40 items-end px-6 pb-5"
            style={{ background: COVER_BG[active.cover] }}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">
              {active.author}
            </p>
          </div>
          <div className="p-6">
            <h2
              className="text-[20px] font-bold leading-tight tracking-tight"
              style={{ color: "var(--color-warm-900)" }}
            >
              {active.title}
            </h2>
            <p
              className="mt-3 text-[14px] leading-relaxed"
              style={{ color: "var(--color-warm-700)" }}
            >
              <strong style={{ color: "var(--color-lavender-700)" }}>
                Por qué este libro:{" "}
              </strong>
              {active.why}
            </p>
            {active.chapter1Preview ? (
              <blockquote
                className="mt-4 border-l-[3px] pl-4 text-[13px] italic"
                style={{
                  borderColor: "var(--color-lavender-300)",
                  color: "var(--color-warm-600)",
                }}
              >
                {active.chapter1Preview}
              </blockquote>
            ) : null}
          </div>
        </article>

        {/* Alternatives */}
        {alternatives.length > 0 ? (
          <div className="mt-4">
            <p
              className="text-[11px] font-bold uppercase tracking-[0.14em]"
              style={{ color: "var(--color-warm-500)" }}
            >
              Otras opciones
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[primary, ...alternatives].map((alt) => {
                const isActive = alt.bookId === active.bookId;
                return (
                  <button
                    key={alt.bookId}
                    type="button"
                    onClick={() => setActive(alt)}
                    className="rounded-full border-[1.5px] px-3 py-1 text-[12px] font-semibold"
                    style={
                      isActive
                        ? {
                            background: "var(--color-warm-900)",
                            color: "white",
                            borderColor: "var(--color-warm-900)",
                          }
                        : {
                            background: "white",
                            color: "var(--color-warm-700)",
                            borderColor: "var(--color-warm-200)",
                          }
                    }
                  >
                    {alt.title}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <footer className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => pick(null)}
          disabled={submitting}
          className="text-[13px] font-semibold underline-offset-2 hover:underline disabled:opacity-50"
          style={{ color: "var(--color-warm-500)" }}
        >
          Terminar sin elegir
        </button>
        <button
          type="button"
          onClick={() => pick(active)}
          disabled={submitting}
          className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-sage-500)" }}
        >
          {submitting ? "Preparando…" : `Empezar a leer "${active.title}" →`}
        </button>
      </footer>
    </>
  );
}
