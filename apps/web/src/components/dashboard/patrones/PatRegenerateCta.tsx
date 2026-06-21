"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  hasSummary: boolean;
  apiBase: string;
  token: string;
}

/**
 * PatRegenerateCta — Sprint F1.
 *
 * The `.pw-cta` button on the design's `pat-wide` card. Lifted from
 * WeeklySummaryCard so we can drop it into the Patrones screen without
 * pulling the full Card chrome. Calls the same endpoint and refreshes
 * the page server data on success.
 */
export function PatRegenerateCta({ hasSummary, apiBase, token }: Props) {
  const router = useRouter();
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
        router.refresh();
      } catch {
        setError("No pudimos generar el resumen. Reintenta más tarde.");
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <button
        type="button"
        className="pw-cta"
        onClick={regenerate}
        disabled={submitting}
      >
        {submitting
          ? "Generando…"
          : hasSummary
            ? "Regenerar insight →"
            : "Generar insight →"}
      </button>
      {error ? (
        <p
          style={{
            margin: 0,
            color: "var(--color-error-text, #b91c1c)",
            fontSize: 12,
          }}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
