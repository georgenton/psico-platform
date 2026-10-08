"use client";

import { useState, useTransition } from "react";
import { saveStep3 } from "@/actions/onboarding";

/**
 * The voice question used to live here. It is gone, and the field is not.
 *
 * `voicePreference` was only ever written and read back to display itself:
 * no audio player, narration, transcription or Eco persona consumes it.
 * Asking for it in the first two minutes and then changing nothing is a
 * promise the product does not keep. Nothing is written in its place —
 * `Step3Dto` made the field optional and the service skips the write — so
 * preferences set elsewhere survive and nobody gets a silent default.
 *
 * The profile's own preferences card still offers it; that surface is not
 * part of this change and is flagged for review rather than quietly
 * emptied.
 */

const NAME_REGEX = /^[\p{L}\p{M}'\- ]+$/u; // letras (incl. acentos), apóstrofo, guion, espacio

export function ProfileForm({ initialName = "" }: { initialName?: string }) {
  // Prefilled from the account, so this is a confirmation and not a second
  // request for something registration already asked. It stays editable:
  // the name somebody signs up with is not always the one they want read
  // back to them.
  const [firstName, setFirstName] = useState(initialName);
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
        await saveStep3({ firstName: firstName.trim() });
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
          {initialName
            ? "Lo tomamos de tu registro. Cámbialo si prefieres que te llamemos de otra forma."
            : "Así sabremos cómo dirigirnos a ti."}
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
          style={{ background: "var(--bg-brand-strong)" }}
        >
          {submitting ? "Guardando…" : "Siguiente →"}
        </button>
      </footer>
    </>
  );
}
