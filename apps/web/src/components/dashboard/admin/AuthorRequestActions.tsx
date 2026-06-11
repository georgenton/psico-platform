"use client";

import { useState, useTransition } from "react";
import {
  approveAuthorRequestAction,
  rejectAuthorRequestAction,
} from "@/app/dashboard/admin/author-requests/actions";

/**
 * AuthorRequestActions — Sprint S71.B-front.
 *
 * Client Component that handles the approve / reject flow. Two phases:
 *   - "idle": shows Approve + Reject buttons.
 *   - "rejecting": shows feedback textarea + Cancelar + Confirmar rechazo.
 *
 * Errors surface inline; success refreshes via revalidatePath inside the
 * server action.
 */
type Phase = "idle" | "rejecting" | "done";

export function AuthorRequestActions({ requestId }: { requestId: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onApprove() {
    setError(null);
    startTransition(() => {
      approveAuthorRequestAction(requestId)
        .then(() => setPhase("done"))
        .catch((e: Error) => setError(e.message || "Error al aprobar."));
    });
  }

  function onReject() {
    setError(null);
    startTransition(() => {
      rejectAuthorRequestAction(requestId, feedback)
        .then(() => setPhase("done"))
        .catch((e: Error) => setError(e.message || "Error al rechazar."));
    });
  }

  if (phase === "done") {
    return (
      <p
        className="text-[12.5px] font-medium"
        style={{ color: "var(--color-sage-700)" }}
      >
        ✓ Decisión aplicada
      </p>
    );
  }

  if (phase === "rejecting") {
    return (
      <div className="w-full sm:w-[280px] space-y-2">
        <label
          className="block text-[12px] font-medium"
          style={{ color: "var(--color-warm-700)" }}
        >
          Feedback editorial (opcional)
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value.slice(0, 2000))}
          rows={3}
          placeholder="El libro necesita..."
          className="w-full rounded-xl border-[1.5px] bg-white p-2 text-[12.5px] focus:outline-none"
          style={{ borderColor: "var(--color-warm-200)" }}
          maxLength={2000}
        />
        <p
          className="text-right text-[10.5px]"
          style={{ color: "var(--color-warm-400)" }}
        >
          {feedback.length} / 2000
        </p>
        {error ? (
          <p
            className="text-[11.5px]"
            style={{ color: "var(--color-rose-700)" }}
          >
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPhase("idle");
              setFeedback("");
              setError(null);
            }}
            className="rounded-full px-3 py-1.5 text-[12px] font-medium transition"
            style={{
              background: "var(--color-warm-100)",
              color: "var(--color-warm-700)",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onReject}
            className="rounded-full px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-50"
            style={{
              background: "var(--color-rose-600)",
              color: "white",
            }}
          >
            {pending ? "Enviando…" : "Confirmar rechazo"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => setPhase("rejecting")}
          className="rounded-full px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-50"
          style={{
            background: "var(--color-rose-100)",
            color: "var(--color-rose-700)",
          }}
        >
          Rechazar
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onApprove}
          className="rounded-full px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-50"
          style={{
            background: "var(--color-sage-600)",
            color: "white",
          }}
        >
          {pending ? "Publicando…" : "Aprobar y publicar"}
        </button>
      </div>
      {error ? (
        <p
          className="text-[11.5px]"
          style={{ color: "var(--color-rose-700)" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
