"use client";

import { useState, useTransition } from "react";
import { togglePrescriptionAction } from "@/actions/terapia";

export function PrescriptionToggle({
  prescriptionId,
  initialCompleted,
}: {
  prescriptionId: string;
  initialCompleted: boolean;
}) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [pending, startTransition] = useTransition();

  function onClick() {
    const next = !completed;
    startTransition(async () => {
      try {
        await togglePrescriptionAction(prescriptionId, next);
        setCompleted(next);
      } catch {
        // swallow
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-xl border-[1.5px] px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
      style={{
        borderColor: completed
          ? "var(--color-sage-400)"
          : "var(--color-warm-300)",
        background: completed ? "var(--color-sage-50)" : "white",
        color: completed
          ? "var(--color-sage-700)"
          : "var(--color-warm-700)",
      }}
    >
      {pending
        ? "Guardando…"
        : completed
          ? "✓ Hecho"
          : "Marcar como hecho"}
    </button>
  );
}
