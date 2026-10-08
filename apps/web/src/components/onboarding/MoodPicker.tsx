"use client";

import { useState, useTransition } from "react";
import type { OnboardingMood } from "@psico/types";
import { saveStep2 } from "@/actions/onboarding";
import { IconMoodFace } from "@/components/dashboard/shell/icons";

export function MoodPicker({ moods }: { moods: OnboardingMood[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!selected) {
      setError("Elige cómo te sientes ahora.");
      return;
    }
    startTransition(async () => {
      try {
        await saveStep2({ moodId: selected });
      } catch {
        setError("No pudimos guardar. Reintenta.");
      }
    });
  }

  return (
    <>
      <div className="flex flex-1 flex-col justify-center">
        <p
          className="text-[12px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-lavender-700)" }}
        >
          Paso 2 de 4
        </p>
        <h1
          className="mt-3 text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]"
          style={{ color: "var(--color-warm-900)" }}
        >
          ¿Cómo te sientes ahora?
        </h1>
        <p
          className="mt-2 text-[14px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Elige lo que mejor describe cómo te sientes ahora. No hay una
          respuesta correcta.
        </p>

        <ul
          className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3"
          role="radiogroup"
        >
          {moods.map((m) => {
            const active = selected === m.id;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setSelected(m.id);
                    setError(null);
                  }}
                  disabled={submitting}
                  className="flex w-full flex-col items-center gap-2 rounded-2xl border-[1.5px] p-5 transition-colors disabled:opacity-50"
                  style={
                    active
                      ? {
                          background: "var(--color-warm-900)",
                          color: "white",
                          borderColor: "var(--color-warm-900)",
                        }
                      : {
                          background: "white",
                          color: "var(--color-warm-800)",
                          borderColor: "var(--color-warm-200)",
                        }
                  }
                >
                  {/* The same face the top bar uses, from the same
                      component. Onboarding used to draw an emoji here while
                      the header drew a face, so the first thing a person
                      learned about the scale was contradicted one screen
                      later. The ids are the shared contract between both. */}
                  <IconMoodFace
                    variant={
                      m.id as Parameters<typeof IconMoodFace>[0]["variant"]
                    }
                    size={28}
                  />
                  <span
                    className="h-1.5 w-8 rounded-full"
                    style={{ background: m.swatch }}
                    aria-hidden
                  />
                  <span className="text-[13px] font-semibold">{m.label}</span>
                  {/* Colour is never the only carrier: the face says it, the
                      label says it, and this says it with a shape. */}
                  <span
                    aria-hidden
                    className="text-[12px] font-bold leading-none"
                    style={{ opacity: active ? 1 : 0 }}
                  >
                    ✓ Elegido
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {error ? (
          <p
            className="mt-4 text-[12.5px]"
            role="alert"
            style={{ color: "var(--color-error-text, #B91C1C)" }}
          >
            {error}
          </p>
        ) : null}
      </div>

      <footer className="mt-8 flex items-center justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !selected}
          className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--bg-brand-strong)" }}
        >
          {submitting ? "Guardando…" : "Siguiente →"}
        </button>
      </footer>
    </>
  );
}
