"use client";

import { useState, useTransition } from "react";
import { archiveBookAction } from "./actions";

export function ArchiveButton({ bookId }: { bookId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onConfirm() {
    setError(null);
    startTransition(() => {
      archiveBookAction(bookId).catch((e: Error) =>
        setError(e.message || "No se pudo archivar."),
      );
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="text-[12px]"
          style={{ color: "var(--color-warm-700)" }}
        >
          ¿Archivar este libro?
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className="rounded-full px-3 py-1.5 text-[12px] font-medium"
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
          onClick={onConfirm}
          className="rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
          style={{
            background: "var(--color-rose-600)",
            color: "white",
          }}
        >
          {pending ? "Archivando…" : "Sí, archivar"}
        </button>
        {error ? (
          <span
            className="text-[11.5px]"
            style={{ color: "var(--color-rose-700)" }}
          >
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-full px-3 py-1.5 text-[12px] font-medium transition"
      style={{
        background: "var(--color-warm-100)",
        color: "var(--color-warm-700)",
      }}
    >
      Archivar
    </button>
  );
}
