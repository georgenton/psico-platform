"use client";

import { useState, useTransition } from "react";
import type { PulsoReportRow } from "@psico/types";
import {
  markReportResolvedAction,
  markReportUnresolvedAction,
} from "@/actions/pulso-reports";

/**
 * ResolveRowActions — Sprint S49 (web).
 *
 * Per-row resolve / reabrir button. We keep the note field inline (not in a
 * modal) so the admin can triage many reports without losing focus. A short
 * textarea + Resolver button appears when the user is composing; otherwise
 * a single Resolver / Reabrir button is shown.
 *
 * UX choices:
 *  - Optimistic: button switches to "Guardando…" during the transition.
 *  - Errors render inline next to the button so they don't get lost.
 *  - The note is OPTIONAL — pressing Resolver without typing also works.
 */
export function ResolveRowActions({ row }: { row: PulsoReportRow }) {
  const [submitting, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isResolved = row.resolvedAt !== null;

  function resolve() {
    setError(null);
    startTransition(async () => {
      try {
        await markReportResolvedAction(row.id, note ? { note } : {});
        setNote("");
        setComposing(false);
      } catch {
        setError("No pudimos resolver. Reintenta.");
      }
    });
  }

  function reopen() {
    setError(null);
    startTransition(async () => {
      try {
        await markReportUnresolvedAction(row.id);
      } catch {
        setError("No pudimos reabrir. Reintenta.");
      }
    });
  }

  if (isResolved) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
          style={{
            background: "var(--color-sage-100, #DDEBD8)",
            color: "var(--color-sage-700, #2F5A2A)",
          }}
        >
          ✓ Resuelto
        </span>
        {row.resolutionNote ? (
          <span
            className="text-[11.5px] italic"
            style={{ color: "var(--color-warm-600)" }}
          >
            “{row.resolutionNote}”
          </span>
        ) : null}
        <button
          type="button"
          onClick={reopen}
          disabled={submitting}
          className="ml-auto rounded-full px-3 py-1 text-[11.5px] font-medium transition disabled:opacity-50"
          style={{
            background: "var(--color-warm-200)",
            color: "var(--color-warm-800)",
          }}
        >
          {submitting ? "Reabriendo…" : "Reabrir"}
        </button>
        {error ? (
          <span
            className="w-full rounded-lg px-2 py-1 text-[11px]"
            style={{ background: "#FEE2E2", color: "#B91C1C" }}
          >
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  // Open report → composer + resolve button.
  return (
    <div className="mt-2 space-y-2">
      {composing ? (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 500))}
          rows={2}
          maxLength={500}
          placeholder="Nota opcional (cómo se resolvió, por ejemplo: false positive — mensaje on-tone)"
          className="w-full rounded-lg border-[1.5px] bg-white p-2 text-[12.5px]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-800)",
          }}
        />
      ) : null}

      <div className="flex items-center gap-2">
        {!composing ? (
          <button
            type="button"
            onClick={() => setComposing(true)}
            disabled={submitting}
            className="rounded-full px-3 py-1 text-[11.5px] font-medium"
            style={{
              background: "var(--color-warm-100)",
              color: "var(--color-warm-700)",
            }}
          >
            Añadir nota
          </button>
        ) : null}
        <button
          type="button"
          onClick={resolve}
          disabled={submitting}
          className="rounded-full px-3 py-1 text-[11.5px] font-medium text-white transition disabled:opacity-50"
          style={{ background: "var(--color-lavender-500)" }}
        >
          {submitting ? "Guardando…" : "Marcar resuelto"}
        </button>
        {composing ? (
          <span
            className="text-[10.5px]"
            style={{ color: "var(--color-warm-400)" }}
          >
            {note.length}/500
          </span>
        ) : null}
        {error ? (
          <span
            className="ml-auto rounded-lg px-2 py-1 text-[11px]"
            style={{ background: "#FEE2E2", color: "#B91C1C" }}
          >
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
