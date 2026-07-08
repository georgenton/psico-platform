"use client";

import { useState } from "react";
import type { EcoMessageReportReason } from "@psico/types";
import { ecoApi } from "@psico/api-client";

/**
 * ReportMessageModal — Sprint B polish (web).
 *
 * Lets the user flag a specific assistant reply. We DON'T send the message
 * text along (server has it cached anyway, and we want to keep this surface
 * minimal). Just `{ reason, comment? }`.
 *
 * UX choice: closing the modal IS the cancel action (no separate button) —
 * keeps the modal small.
 */
const REASONS: Array<{
  value: EcoMessageReportReason;
  label: string;
  hint: string;
}> = [
  {
    value: "HALLUCINATION",
    label: "Eco inventó información",
    hint: "Hechos, citas o referencias que no existen.",
  },
  {
    value: "OFF_TONE",
    label: "El tono no fue apropiado",
    hint: "Demasiado clínico, frío, sermonea, condescendiente.",
  },
  {
    value: "SENSITIVE_CONTENT",
    label: "Tocó algo sensible mal",
    hint: "Trivializó, presionó o dijo algo dañino.",
  },
  {
    value: "CRISIS_MISHANDLED",
    label: "No detectó una crisis",
    hint: "Yo necesitaba ayuda urgente y la respuesta no lo reflejó.",
  },
  { value: "OTHER", label: "Otra cosa", hint: "Cuéntanos en el comentario." },
];

export function ReportMessageModal({
  messageId,
  onClose,
}: {
  messageId: string;
  onClose: (sent: boolean) => void;
}) {
  const [reason, setReason] = useState<EcoMessageReportReason | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    try {
      await ecoApi.reportMessage(messageId, {
        reason,
        comment: comment.trim() || undefined,
      });
      onClose(true);
    } catch {
      setError("No pudimos enviar el reporte. Reintenta.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Reportar respuesta de Eco"
      onClick={() => onClose(false)}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="text-[18px] font-bold"
          style={{ color: "var(--color-warm-900)" }}
        >
          Reportar respuesta de Eco
        </h2>
        <p
          className="mt-1 text-[12.5px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Nos ayuda a entrenar al companion para que no te falle de la misma
          manera dos veces.
        </p>

        <ul className="mt-4 space-y-1.5" role="radiogroup" aria-label="Razón">
          {REASONS.map((r) => {
            const active = r.value === reason;
            return (
              <li key={r.value}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setReason(r.value)}
                  className="w-full rounded-2xl border-[1.5px] px-3 py-2.5 text-left transition"
                  style={
                    active
                      ? {
                          background: "var(--color-lavender-50)",
                          borderColor: "var(--color-lavender-500)",
                        }
                      : {
                          background: "var(--bg-surface)",
                          borderColor: "var(--color-warm-200)",
                        }
                  }
                >
                  <p
                    className="text-[13px] font-semibold"
                    style={{ color: "var(--color-warm-900)" }}
                  >
                    {r.label}
                  </p>
                  <p
                    className="mt-0.5 text-[11.5px]"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    {r.hint}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>

        <label
          className="mt-4 block text-[11.5px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-warm-500)" }}
        >
          Comentario (opcional)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 500))}
          placeholder="¿Qué hubieras necesitado escuchar?"
          rows={3}
          className="mt-1 w-full resize-none rounded-xl border-[1.5px] bg-[var(--color-warm-50)] px-3 py-2 text-[13px] outline-none focus:border-[var(--color-lavender-400)]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-800)",
          }}
        />
        <p
          className="mt-1 text-right text-[10.5px]"
          style={{ color: "var(--color-warm-400)" }}
        >
          {comment.length}/500
        </p>

        {error ? (
          <p
            className="mt-2 text-[12px]"
            role="alert"
            style={{ color: "#B91C1C" }}
          >
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="rounded-xl px-4 py-2 text-[13px] font-semibold"
            style={{ color: "var(--color-warm-600)" }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!reason || submitting}
            className="rounded-xl px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--color-lavender-500)" }}
          >
            {submitting ? "Enviando…" : "Enviar reporte"}
          </button>
        </div>
      </div>
    </div>
  );
}
