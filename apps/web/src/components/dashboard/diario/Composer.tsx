"use client";

import { useState } from "react";
import type { DiaryPromptOfTheDay } from "@psico/types";

/**
 * Composer — disabled-but-visible diary entry composer.
 *
 * Renders the design's composer layout (mood pill, textarea, prompts row,
 * save CTA) so the user understands the UX. The save button is disabled
 * with a tooltip explaining the crypto gap.
 *
 * When S6-crypto lands:
 *   1. Replace the disabled button with `await encryptAndPost(text, mood, ...)`
 *   2. Remove the CryptoNotice banner from the page wrapper
 *   3. Wire mood selector (currently fixed to "calma")
 */
export function Composer({ prompt }: { prompt: DiaryPromptOfTheDay | null }) {
  const [text, setText] = useState("");
  const [mood] = useState("calma");

  const todayLabel = new Date().toLocaleDateString("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <section
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <div className="flex items-center justify-between text-[11.5px]">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border-[1.5px] bg-white px-3 py-1 text-[12.5px] font-semibold transition-opacity hover:opacity-90"
          style={{ borderColor: "var(--color-warm-200)" }}
          disabled
          title="Selector de mood llega con S6-crypto"
        >
          <span
            className="inline-block h-3 w-3 rounded-full"
            aria-hidden
            style={{
              background:
                "linear-gradient(135deg, var(--color-sage-300), var(--color-sage-500))",
            }}
          />
          <span style={{ color: "var(--color-warm-800)" }}>
            {mood[0].toUpperCase() + mood.slice(1)}
          </span>
          <span style={{ color: "var(--color-warm-400)" }}>·</span>
          <span
            className="font-mono"
            style={{ color: "var(--color-warm-500)" }}
          >
            cambiar
          </span>
        </button>
        <span className="font-mono" style={{ color: "var(--color-warm-500)" }}>
          {todayLabel}
        </span>
      </div>

      <textarea
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="¿Cómo llegas hoy? Escribe lo que necesites — nadie lo lee más que tú."
        className="mt-3 w-full resize-none rounded-xl border-[1.5px] bg-[var(--color-warm-50)] p-3 text-[14px] leading-relaxed outline-none focus:border-[var(--color-lavender-400)]"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-800)",
        }}
      />

      {prompt ? (
        <div className="mt-3">
          <span
            className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Prompt del día
          </span>
          <button
            type="button"
            onClick={() =>
              setText((t) =>
                t ? t + "\n\n" + prompt.text : prompt.text + "\n\n",
              )
            }
            className="mt-1.5 block w-full rounded-xl border-[1.5px] bg-white px-3.5 py-2.5 text-left text-[12.5px] transition-colors hover:bg-[var(--color-warm-50)]"
            style={{
              borderColor: "var(--color-warm-200)",
              color: "var(--color-warm-800)",
            }}
          >
            ✎ {prompt.text}
          </button>
        </div>
      ) : null}

      <footer className="mt-4 flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1.5 text-[11.5px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          🔒 Privado · cifrado en tu dispositivo
        </span>
        <button
          type="button"
          disabled
          title="El cifrado cliente-side llega en el próximo sprint"
          className="inline-flex items-center gap-1.5 rounded-xl px-5 py-3 text-[13px] font-semibold text-white opacity-50"
          style={{ background: "var(--color-warm-900)" }}
        >
          ✎ Guardar entrada (próximamente)
        </button>
      </footer>
    </section>
  );
}
