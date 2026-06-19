"use client";

import { useState, useTransition } from "react";
import type { OnboardingVoicePreference } from "@psico/types";
import { saveStep3 } from "@/actions/onboarding";

// Voice options. The stored DB values stay the same (`marina`, `tomas`,
// `none`) so prior catalogs and any analytics don't break — only the user-
// facing labels are descriptive traits, no personal names.
const VOICES: Array<{
  value: OnboardingVoicePreference;
  label: string;
  hint: string;
}> = [
  { value: "marina", label: "Cálida", hint: "Voz suave, ritmo pausado" },
  {
    value: "tomas",
    label: "Cercana",
    hint: "Voz natural, ritmo conversacional",
  },
  { value: "none", label: "Sin voz", hint: "Solo texto, por ahora" },
];

const NAME_REGEX = /^[\p{L}\p{M}'\- ]+$/u; // letras (incl. acentos), apóstrofo, guion, espacio

export function ProfileForm() {
  const [firstName, setFirstName] = useState("");
  const [voice, setVoice] = useState<OnboardingVoicePreference>("marina");
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    const trimmed = firstName.trim();
    if (trimmed.length < 2) return "Tu nombre debe tener al menos 2 letras.";
    if (trimmed.length > 40) return "Máximo 40 letras.";
    if (!NAME_REGEX.test(trimmed)) {
      return "Sin emojis ni símbolos especiales.";
    }
    return null;
  }

  function submit() {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await saveStep3({
          firstName: firstName.trim(),
          voicePreference: voice,
        });
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
          Paso 3 de 4
        </p>
        <h1
          className="mt-3 text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]"
          style={{ color: "var(--color-warm-900)" }}
        >
          ¿Cómo te llamamos?
        </h1>
        <p
          className="mt-2 text-[14px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Solo tu nombre. Luego eliges la voz que te acompañará en los audios.
        </p>

        <div className="mt-6">
          <label
            htmlFor="firstName"
            className="block text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Tu nombre
          </label>
          <input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              setError(null);
            }}
            disabled={submitting}
            placeholder="Lucía"
            autoComplete="given-name"
            maxLength={40}
            className="mt-2 w-full rounded-2xl border-[1.5px] bg-white px-4 py-3 text-[15px] outline-none focus:border-[var(--color-lavender-400)]"
            style={{
              borderColor: "var(--color-warm-200)",
              color: "var(--color-warm-900)",
            }}
          />
        </div>

        <fieldset className="mt-6">
          <legend
            className="text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Voz preferida
          </legend>
          <div className="mt-2 flex flex-col gap-2">
            {VOICES.map((v) => {
              const active = voice === v.value;
              return (
                <label
                  key={v.value}
                  className="flex cursor-pointer items-start gap-3 rounded-2xl border-[1.5px] px-4 py-3 transition-colors"
                  style={
                    active
                      ? {
                          background: "var(--color-lavender-50)",
                          borderColor: "var(--color-lavender-400)",
                        }
                      : {
                          background: "white",
                          borderColor: "var(--color-warm-200)",
                        }
                  }
                >
                  <input
                    type="radio"
                    name="voice"
                    value={v.value}
                    checked={active}
                    onChange={() => setVoice(v.value)}
                    disabled={submitting}
                    className="mt-1"
                    style={{ accentColor: "var(--color-lavender-500)" }}
                  />
                  <div className="min-w-0">
                    <div
                      className="text-[14px] font-semibold"
                      style={{ color: "var(--color-warm-900)" }}
                    >
                      {v.label}
                    </div>
                    <div
                      className="text-[12px]"
                      style={{ color: "var(--color-warm-500)" }}
                    >
                      {v.hint}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>

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
          disabled={submitting || !firstName.trim()}
          className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-lavender-500)" }}
        >
          {submitting ? "Guardando…" : "Siguiente →"}
        </button>
      </footer>
    </>
  );
}
