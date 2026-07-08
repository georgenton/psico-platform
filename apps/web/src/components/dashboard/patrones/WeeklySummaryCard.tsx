"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PatronesWeeklySummary } from "@psico/types";

interface Props {
  summary: PatronesWeeklySummary | null;
  /** Cliente expone el apiBase + token al server action por servidor. */
  apiBase: string;
  token: string;
}

/**
 * WeeklySummaryCard — LLM-generated reflection card.
 *
 * When no summary exists yet, the card shows a CTA "Generar resumen
 * de esta semana". When the user has < 7 entries this week the API
 * returns 422 NOT_ENOUGH_ENTRIES; we render an inline hint that links
 * them back to the diary.
 */
export function WeeklySummaryCard({ summary, apiBase, token }: Props) {
  const router = useRouter();
  const [current, setCurrent] = useState(summary);
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function regenerate() {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch(
          `${apiBase}/patrones/weekly-summary/regenerate`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (res.status === 422) {
          setError(
            "Necesitas al menos 7 entradas esta semana para un resumen útil.",
          );
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          weeklySummary: PatronesWeeklySummary;
        };
        setCurrent(body.weeklySummary);
        router.refresh();
      } catch {
        setError("No pudimos generar el resumen. Reintenta más tarde.");
      }
    });
  }

  return (
    <section
      className="rounded-3xl p-6 sm:p-8"
      style={{
        background:
          "linear-gradient(140deg, var(--color-lavender-500), var(--color-lavender-700))",
        color: "white",
      }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">
        Resumen semanal · IA
      </p>

      {current ? (
        <>
          <h3 className="mt-2 text-[18px] font-bold leading-tight">
            {current.headline}
          </h3>
          <p className="mt-4 whitespace-pre-line text-[14px] leading-relaxed text-white/90">
            {current.narrative}
          </p>
          <p className="mt-5 text-[11px] text-white/70">
            Generado el{" "}
            {new Date(current.generatedAt).toLocaleDateString("es-EC", {
              day: "numeric",
              month: "long",
            })}
            {" · "}
            {current.entriesUsed} entradas usadas
          </p>
        </>
      ) : (
        <>
          <h3 className="mt-2 text-[18px] font-bold leading-tight">
            Tu resumen de la semana
          </h3>
          <p className="mt-2 text-[13px] text-white/85">
            Pídele a Eco un párrafo editorial sobre tu semana — sin tocar el
            contenido cifrado de tus entradas.
          </p>
        </>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={regenerate}
          disabled={submitting}
          className="rounded-2xl px-5 py-2.5 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{
            background: "var(--bg-surface)",
            color: "var(--color-lavender-700)",
          }}
        >
          {submitting
            ? "Generando…"
            : current
              ? "Regenerar"
              : "Generar resumen ahora"}
        </button>
        <span className="text-[10.5px] text-white/70">1 vez por día</span>
      </div>

      {error ? (
        <p
          className="mt-3 text-[12px]"
          role="alert"
          style={{ color: "#FECACA" }}
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
