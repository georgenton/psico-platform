"use client";

import { useState, useTransition } from "react";
import type { OnboardingMotivo } from "@psico/types";
import { saveStep1 } from "@/actions/onboarding";

const MIN_PICKS = 1;
const MAX_PICKS = 5;

export function MotivosPicker({ motivos }: { motivos: OnboardingMotivo[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_PICKS) {
        next.add(id);
      } else {
        setError(
          `Máximo ${MAX_PICKS} motivos. Quita uno antes de añadir otro.`,
        );
        return prev;
      }
      setError(null);
      return next;
    });
  }

  function submit() {
    if (selected.size < MIN_PICKS) {
      setError("Elige al menos uno.");
      return;
    }
    startTransition(async () => {
      try {
        await saveStep1({ motivosIds: Array.from(selected) });
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
          Paso 1 de 4
        </p>
        <h1
          className="mt-3 text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]"
          style={{ color: "var(--color-warm-900)" }}
        >
          ¿Qué te trae aquí?
        </h1>
        <p
          className="mt-2 text-[14px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Marca lo que resuene. Puedes elegir entre 1 y {MAX_PICKS}.
        </p>

        <ul
          className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3"
          role="listbox"
          aria-multiselectable
        >
          {motivos.map((m) => {
            const active = selected.has(m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => toggle(m.id)}
                  disabled={submitting}
                  className="flex w-full flex-col items-start gap-1 rounded-2xl border-[1.5px] p-4 text-left transition-colors disabled:opacity-50"
                  style={
                    active
                      ? {
                          background: "var(--color-lavender-500)",
                          color: "white",
                          borderColor: "var(--color-lavender-500)",
                        }
                      : {
                          background: "white",
                          color: "var(--color-warm-800)",
                          borderColor: "var(--color-warm-200)",
                        }
                  }
                >
                  <span className="text-[18px]" aria-hidden>
                    {m.icon}
                  </span>
                  <span className="text-[13.5px] font-semibold">{m.label}</span>
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

      <footer className="mt-8 flex items-center justify-between">
        <span
          className="text-[12px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          {selected.size}/{MAX_PICKS} seleccionados
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || selected.size < MIN_PICKS}
          className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-lavender-500)" }}
        >
          {submitting ? "Guardando…" : "Siguiente →"}
        </button>
      </footer>
    </>
  );
}
