"use client";

import { useState, useTransition } from "react";
import { markAllNotificationsReadAction } from "@/actions/terapia";

export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function onClick() {
    startTransition(async () => {
      try {
        await markAllNotificationsReadAction();
        setDone(true);
      } catch {
        // swallow
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending || done}
      className="rounded-xl border-[1.5px] bg-white px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
      style={{
        borderColor: "var(--color-warm-300)",
        color: "var(--color-warm-700)",
      }}
    >
      {pending ? "Marcando…" : done ? "✓ Listo" : "Marcar todas como leídas"}
    </button>
  );
}
