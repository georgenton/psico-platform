"use client";

import { useState, useTransition } from "react";
import type { HomeReflectionPrompt } from "@psico/types";

/**
 * ReflectionPromptCard — daily prompt with dismiss action.
 *
 * Calls POST /api/reflection-prompts/:id/dismiss when the user hits "Saltar".
 * After dismissal the card hides locally; the server excludes the prompt
 * for the next 7 days. We do NOT trigger a server-revalidate because the
 * next page load picks up the change naturally.
 *
 * The "Guardar en mi diario" button is a stub for v1 — it would round-trip
 * the prompt id + answer to the diary composer. Wired in Sprint S6-front.
 */
export function ReflectionPromptCard({
  prompt,
  apiBase,
  token,
}: {
  prompt: HomeReflectionPrompt;
  apiBase: string;
  token: string | null;
}) {
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (hidden) return null;

  async function dismiss() {
    if (!token) {
      setHidden(true);
      return;
    }
    startTransition(async () => {
      try {
        await fetch(
          `${apiBase}/reflection-prompts/${encodeURIComponent(prompt.id)}/dismiss`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
      } catch {
        // Best-effort — local UI still hides even if the network fails.
      }
      setHidden(true);
    });
  }

  return (
    <article
      className="rounded-[20px] border-[1.5px] bg-white p-6"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <span
        className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.14em]"
        style={{ color: "var(--color-lavender-700)" }}
      >
        <span aria-hidden>✎</span> Reflexión rápida · 30 segundos
      </span>
      <h3
        className="mt-2 text-[22px] font-bold leading-tight tracking-tight"
        style={{ color: "var(--color-warm-900)" }}
      >
        {prompt.text}
      </h3>
      <p
        className="mt-1 text-[13px] leading-relaxed"
        style={{ color: "var(--color-warm-500)" }}
      >
        Una sola palabra está bien — solo tú la lees.
      </p>
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={dismiss}
          disabled={pending}
          className="border-0 bg-transparent text-[12.5px] font-medium transition-colors disabled:opacity-50"
          style={{ color: "var(--color-warm-500)" }}
        >
          {pending ? "Saltando…" : "Saltar por hoy"}
        </button>
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2.5 text-[12.5px] font-semibold text-white opacity-50"
          style={{ background: "var(--color-warm-900)" }}
          title="Diario UI llega en Sprint S6-front"
        >
          Guardar en mi diario →
        </button>
      </div>
    </article>
  );
}
